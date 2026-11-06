import { and, eq } from "drizzle-orm";
import { changes, schema, type DB } from "./db";
import { now } from "./ids";
import type { FieldName } from "./compare";
import { awaitPublished, writeField } from "./github";

export type ConnectorState = "connected" | "read_only" | "write_enabled" | "requires_partner_access" | "manual_approval_link" | "demo_connector" | "setup_required";

export interface ConnectorInfo {
  platform: string;
  label: string;
  state: ConnectorState;
  capabilities: ("read" | "write" | "verify")[];
  note: string;
  manageUrl?: string;
}

/** Truthful capability matrix. Only the demo connector and public website reads are functional in this build. */
export const CATALOG: ConnectorInfo[] = [
  { platform: "demo", label: "Sandbox Directory (simulated)", state: "demo_connector", capabilities: ["read", "write", "verify"], note: "Explicitly simulated platform backed by persisted records. Not a real third-party integration." },
  { platform: "github", label: "GitHub Pages website", state: "write_enabled", capabilities: ["read", "write", "verify"], note: "Real integration. Approved corrections are committed to your site's repository through the GitHub API, GitHub Pages redeploys, and FonectaGuard re-reads the live page to verify.", manageUrl: "https://github.com" },
  { platform: "website", label: "Official website", state: "read_only", capabilities: ["read"], note: "Public page fetched and parsed (JSON-LD). Becomes writable when a GitHub Pages connection is attached." },
  { platform: "web", label: "Web listing", state: "read_only", capabilities: [], note: "Found via live web search (TinyFish) and read with AI extraction. Corrections are submitted manually by the owner." },
  { platform: "google", label: "Google Business Profile", state: "requires_partner_access", capabilities: [], note: "Requires Business Profile API approval. OAuth not configured; Google Sign-In would not grant management rights.", manageUrl: "https://business.google.com" },
  { platform: "facebook", label: "Facebook Page", state: "setup_required", capabilities: [], note: "Needs META_APP_ID/META_APP_SECRET and approved Page permissions (Phase 5).", manageUrl: "https://business.facebook.com" },
  { platform: "instagram", label: "Instagram Business", state: "setup_required", capabilities: [], note: "Needs Meta app setup (Phase 5)." },
  { platform: "apple", label: "Apple Business / Maps", state: "requires_partner_access", capabilities: [], note: "Requires partner integration.", manageUrl: "https://businessconnect.apple.com" },
  { platform: "bing", label: "Bing Places", state: "requires_partner_access", capabilities: [], note: "Requires partner integration.", manageUrl: "https://www.bingplaces.com" },
  { platform: "yelp", label: "Yelp", state: "requires_partner_access", capabilities: [], note: "Requires partner integration." },
  { platform: "fonecta", label: "Fonecta Connect", state: "requires_partner_access", capabilities: [], note: "Requires partner integration." },
];

export const connectorInfo = (platform: string) => CATALOG.find((c) => c.platform === platform);
export const canWriteTo = (platform: string) => connectorInfo(platform)?.capabilities.includes("write") ?? false;

export interface RawListing { name: string; address: string; phone: string; hours: string; website: string; updatedAt: number }

export interface Connector {
  readListing?(db: DB, externalId: string): Promise<RawListing | null>;
  applyUpdate(db: DB, externalId: string, field: FieldName, value: string): Promise<{ ok: boolean; response: Record<string, unknown> }>;
  /** Resolves once the change is publicly visible (for platforms with a deploy delay). */
  awaitPublished?(url: string, field: FieldName, value: string): Promise<boolean>;
}

const FIELD_COLUMN: Partial<Record<FieldName, "name" | "address" | "phone" | "hours" | "website">> = { name: "name", address: "address", phone: "phone", hours: "hours", website: "website" };

export const demoConnector: Connector = {
  async readListing(db, slug) {
    const r = (await db.select().from(schema.demoListings).where(eq(schema.demoListings.slug, slug)).get());
    return r ? { name: r.name, address: r.address, phone: r.phone, hours: r.hours, website: r.website, updatedAt: r.updatedAt } : null;
  },
  async applyUpdate(db, slug, field, value) {
    const col = FIELD_COLUMN[field];
    if (!col) return { ok: false, response: { error: `Field ${field} not writable on demo directory` } };
    const res = (await db.update(schema.demoListings).set({ [col]: value, updatedAt: now() }).where(eq(schema.demoListings.slug, slug)).run());
    return { ok: changes(res) === 1, response: { simulated: true, changes: changes(res), field, value } };
  },
};

export const githubConnector: Connector = {
  async applyUpdate(_db, repo, field, value) {
    return writeField(repo, field, value);
  },
  awaitPublished,
};

export interface WriteTarget { connector: Connector; externalId: string; connectionPlatform: string }

/** Finds the connector that can write to a listing: the sandbox directory, or the owner's website via a GitHub Pages connection. */
export async function resolveWrite(db: DB, orgId: string, listing: { platform: string; externalListingId: string | null }): Promise<WriteTarget | null> {
  if (listing.platform === "demo" && listing.externalListingId) return { connector: demoConnector, externalId: listing.externalListingId, connectionPlatform: "demo" };
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
