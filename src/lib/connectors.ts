import { eq } from "drizzle-orm";
import { changes, schema, type DB } from "./db";
import { now } from "./ids";
import type { FieldName } from "./compare";

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
  { platform: "demo", label: "Demo Directory (simulated)", state: "demo_connector", capabilities: ["read", "write", "verify"], note: "Explicitly simulated platform backed by persisted records. Not a real third-party integration." },
  { platform: "website", label: "Official website", state: "read_only", capabilities: ["read"], note: "Public page fetched and parsed (JSON-LD). Read-only; corrections require manual CMS edits." },
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
  readListing(db: DB, externalId: string): Promise<RawListing | null>;
  applyUpdate(db: DB, externalId: string, field: FieldName, value: string): Promise<{ ok: boolean; response: Record<string, unknown> }>;
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

export function getConnector(platform: string): Connector | null {
  return platform === "demo" ? demoConnector : null;
}
