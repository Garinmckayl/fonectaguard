import { and, eq } from "drizzle-orm";
import { schema, type DB } from "./db";
import type { FieldName } from "./compare";
import { awaitPublished, writeField } from "./github";
import { decryptSecret } from "./crypto";
import { writeOsmField } from "./osm-write";
import { writeFacebookField } from "./facebook";
import { fbConnection } from "./facebook-creds";

export type ConnectorState = "connected" | "read_only" | "write_enabled" | "requires_partner_access" | "manual_approval_link" | "setup_required";

export interface ConnectorInfo {
  platform: string;
  label: string;
  state: ConnectorState;
  capabilities: ("read" | "write" | "verify")[];
  note: string;
  manageUrl?: string;
}

/** Truthful capability matrix: direct writes exist only for GitHub Pages; other platforms are read and fixed through a guided manual path. */
export const CATALOG: ConnectorInfo[] = [
  { platform: "github", label: "GitHub Pages website", state: "write_enabled", capabilities: ["read", "write", "verify"], note: "Real integration. Approved corrections are committed to your site's repository through the GitHub API, GitHub Pages redeploys, and FonectaGuard re-reads the live page to verify.", manageUrl: "https://github.com" },
  { platform: "website", label: "Official website", state: "read_only", capabilities: ["read"], note: "Public page fetched and parsed (JSON-LD). Becomes writable when a GitHub Pages connection is attached." },
  { platform: "web", label: "Web listing", state: "read_only", capabilities: [], note: "Found via live web search (TinyFish) and read with AI extraction. Corrections are submitted manually by the owner." },
  ...([
    ["google", "Google Business Profile / Maps", "https://business.google.com", "Direct edits need Business Profile API approval from Google."],
    ["facebook", "Facebook Page", "https://business.facebook.com", "Connect a Page you fully manage and approved fixes change its phone, opening hours and website, then are verified by re-reading the Page. Other Pages found on the web are read and fixed by a guided manual path."],
    ["instagram", "Instagram Business", "https://business.instagram.com", "Direct edits need a Meta app with approved permissions."],
    ["apple", "Apple Maps / Business Connect", "https://businessconnect.apple.com", "Direct edits need Apple partner access."],
    ["bing", "Bing Places", "https://www.bingplaces.com", "Direct edits need Microsoft partner access."],
    ["yelp", "Yelp", "https://business.yelp.com", "Direct edits need Yelp partner access."],
    ["fonecta", "Fonecta", "https://fonectaconnect.fi", "Fonecta Connect distributes verified details to Fonecta, Finder and partner directories; direct API write needs a Fonecta partnership."],
    ["openstreetmap", "OpenStreetMap", "https://www.openstreetmap.org/edit", "Real write integration, no approval process. Connect your OpenStreetMap account and approved fixes (phone, opening hours, website) become public edits under your account, then are verified by re-reading the object. Not on OpenStreetMap yet? Add the business there first."],
    ["finder", "Finder", "https://fonectaconnect.fi/nain-connect-toimii/finder", "Updated through Fonecta Connect."],
  ] as const).map(([platform, label, manageUrl, why]): ConnectorInfo => ({
    platform, label, state: "manual_approval_link", capabilities: ["read"], manageUrl,
    note: `Monitored when found by live web search: the public page is read and compared. Corrections: FonectaGuard prepares the exact values and opens the management page for you to submit, then re-reads the listing to verify. ${why}`,
  })),
];

/** Platforms whose public pages are read via live web search (no write integration). */
export const READ_PLATFORMS = CATALOG.filter((c) => c.state === "manual_approval_link").map((c) => c.platform);

const HOSTS: [RegExp, string][] = [
  [/(^|\.)facebook\.com$|(^|\.)fb\.com$/, "facebook"],
  [/(^|\.)instagram\.com$/, "instagram"],
  [/(^|\.)apple\.com$/, "apple"],
  [/(^|\.)bing\.com$/, "bing"],
  [/(^|\.)yelp\.[a-z.]+$/, "yelp"],
  [/(^|\.)(fonecta\.(fi|com)|fonectaconnect\.fi)$/, "fonecta"],
  [/(^|\.)finder\.fi$/, "finder"],
  [/(^|\.)openstreetmap\.org$/, "openstreetmap"],
];
/** Maps a discovered page URL to a known directory platform, or "web" when it is unrecognised. */
export function platformForUrl(url: string): string {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    // Only Google's place/map pages are listings; sites.google.com, docs etc. are ordinary web pages.
    if (/^(maps\.app\.goo\.gl|g\.page)$/.test(host) || (/(^|\.)google\.[a-z.]+$/.test(host) && /^\/maps/.test(u.pathname))) return "google";
    return HOSTS.find(([re]) => re.test(host))?.[1] ?? "web";
  } catch {
    return "web";
  }
}

/** Display name for a source: the platform's label, or the site's hostname for generic web pages. */
export function displayName(platform: string, url: string): string {
  const info = CATALOG.find((c) => c.platform === platform);
  if (platform !== "web" && info) return info.label;
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return info?.label ?? platform; }
}

export const connectorInfo = (platform: string) => CATALOG.find((c) => c.platform === platform);
export const canWriteTo = (platform: string) => connectorInfo(platform)?.capabilities.includes("write") ?? false;

export interface Connector {
  applyUpdate(db: DB, externalId: string, field: FieldName, value: string): Promise<{ ok: boolean; response: Record<string, unknown> }>;
  /** Resolves once the change is publicly visible (for platforms with a deploy delay). */
  awaitPublished?(url: string, field: FieldName, value: string): Promise<boolean>;
}

export const githubConnector: Connector = {
  async applyUpdate(_db, repo, field, value) {
    return writeField(repo, field, value);
  },
  awaitPublished,
};

/** Edits OpenStreetMap under the owner's own account. externalId is "<connectionId>|<node/123>". */
export const osmConnector: Connector = {
  async applyUpdate(db, externalId, field, value) {
    const [connId, ref] = externalId.split("|");
    const conn = await db.select().from(schema.connections).where(eq(schema.connections.id, connId)).get();
    if (!conn || conn.status !== "connected" || !conn.encryptedCredentialReference) return { ok: false, response: { error: "OpenStreetMap is not connected" } };
    return writeOsmField(await decryptSecret(conn.encryptedCredentialReference), ref, field, value, "this business");
  },
};

/** Edits the connected Facebook Page. externalId is the Page id; the token is read from the organization's connection. */
export function facebookConnector(orgId: string): Connector {
  return {
    async applyUpdate(db, pageId, field, value) {
      const c = await fbConnection(db, orgId);
      if (!c || c.pageId !== pageId) return { ok: false, response: { error: "Facebook is not connected for this Page" } };
      return writeFacebookField(pageId, c.token, field, value);
    },
  };
}

export async function osmConnection(db: DB, orgId: string) {
  const c = await db.select().from(schema.connections).where(and(eq(schema.connections.organizationId, orgId), eq(schema.connections.platform, "openstreetmap"), eq(schema.connections.status, "connected"))).get();
  return c?.encryptedCredentialReference && c.capabilitiesJson.includes("write") ? c : null;
}

export interface WriteTarget { connector: Connector; externalId: string; connectionPlatform: string }

/** Finds the connector that can write to a listing: the sandbox directory, or the owner's website via a GitHub Pages connection. */
export async function resolveWrite(db: DB, orgId: string, listing: { platform: string; externalListingId: string | null }): Promise<WriteTarget | null> {
  if (listing.platform === "facebook" && listing.externalListingId) {
    const c = await fbConnection(db, orgId);
    if (c && c.pageId === listing.externalListingId) return { connector: facebookConnector(orgId), externalId: c.pageId, connectionPlatform: "facebook" };
  }
  if (listing.platform === "openstreetmap" && listing.externalListingId) {
    const conn = await osmConnection(db, orgId);
    if (conn) return { connector: osmConnector, externalId: `${conn.id}|${listing.externalListingId}`, connectionPlatform: "openstreetmap" };
  }
  if (listing.platform === "website") {
    const conn = await githubConnection(db, orgId);
    if (conn?.externalAccountId) return { connector: githubConnector, externalId: conn.externalAccountId, connectionPlatform: "github" };
  }
  return null;
}

export async function githubConnection(db: DB, orgId: string) {
  const c = await db.select().from(schema.connections).where(and(eq(schema.connections.organizationId, orgId), eq(schema.connections.platform, "github"), eq(schema.connections.status, "connected"))).get();
  return c && c.capabilitiesJson.includes("write") ? c : null;
}
