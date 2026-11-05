import { sqliteTable, text, integer, real, index, uniqueIndex } from "drizzle-orm/sqlite-core";

const id = () => text("id").primaryKey();
const ts = (n: string) => integer(n).notNull();
const json = <T>(n: string) => text(n, { mode: "json" }).$type<T>();

export const users = sqliteTable("users", {
  id: id(), name: text("name").notNull(), email: text("email").notNull().unique(), createdAt: ts("created_at"),
});

export const organizations = sqliteTable("organizations", {
  id: id(), name: text("name").notNull(), ownerUserId: text("owner_user_id").notNull(), isDemo: integer("is_demo").notNull().default(0), createdAt: ts("created_at"),
});

export const organizationMembers = sqliteTable("organization_members", {
  id: id(), organizationId: text("organization_id").notNull(), userId: text("user_id").notNull(), role: text("role").notNull(),
}, (t) => ({ uq: uniqueIndex("om_uq").on(t.organizationId, t.userId) }));

export const businessLocations = sqliteTable("business_locations", {
  id: id(), organizationId: text("organization_id").notNull(), businessName: text("business_name").notNull(),
  website: text("website"), country: text("country"), city: text("city"),
  addressJson: json<{ street: string; city: string }>("address_json"), phone: text("phone"), email: text("email"),
  category: text("category"), description: text("description"), hoursJson: json<Record<string, string>>("hours_json"),
  timezone: text("timezone"), verificationStatus: text("verification_status").notNull().default("unverified"),
  monitoringFrequency: text("monitoring_frequency").notNull().default("daily"), nextScanAt: integer("next_scan_at"),
  createdAt: ts("created_at"), updatedAt: ts("updated_at"),
}, (t) => ({ org: index("bl_org").on(t.organizationId), due: index("bl_due").on(t.nextScanAt) }));

export const canonicalFieldVersions = sqliteTable("canonical_field_versions", {
  id: id(), locationId: text("location_id").notNull(), fieldName: text("field_name").notNull(),
  normalizedValueJson: json<unknown>("normalized_value_json").notNull(), verifiedBy: text("verified_by").notNull(),
  verificationSource: text("verification_source").notNull(), verifiedAt: ts("verified_at"), version: integer("version").notNull(),
}, (t) => ({ uq: uniqueIndex("cfv_uq").on(t.locationId, t.fieldName, t.version) }));

export const connections = sqliteTable("connections", {
  id: id(), organizationId: text("organization_id").notNull(), platform: text("platform").notNull(),
  externalAccountId: text("external_account_id"), status: text("status").notNull(), capabilitiesJson: json<string[]>("capabilities_json").notNull(),
  encryptedCredentialReference: text("encrypted_credential_reference"), expiresAt: integer("expires_at"), lastSyncedAt: integer("last_synced_at"),
}, (t) => ({ uq: uniqueIndex("conn_uq").on(t.organizationId, t.platform, t.externalAccountId) }));

export const listings = sqliteTable("listings", {
  id: id(), locationId: text("location_id").notNull(), connectionId: text("connection_id"), platform: text("platform").notNull(),
  externalListingId: text("external_listing_id"), url: text("url").notNull(), identityConfidence: real("identity_confidence").notNull(),
  status: text("status").notNull().default("monitoring"), lastScannedAt: integer("last_scanned_at"), discoveredAt: ts("discovered_at"),
}, (t) => ({ uq: uniqueIndex("listing_uq").on(t.locationId, t.url), loc: index("listing_loc").on(t.locationId) }));

export const listingObservations = sqliteTable("listing_observations", {
  id: id(), listingId: text("listing_id").notNull(), observedDataJson: json<Record<string, unknown>>("observed_data_json").notNull(),
  evidenceJson: json<Record<string, unknown>>("evidence_json").notNull(), observedAt: ts("observed_at"), contentHash: text("content_hash").notNull(),
}, (t) => ({ l: index("obs_listing").on(t.listingId, t.observedAt) }));

export const scanRuns = sqliteTable("scan_runs", {
  id: id(), locationId: text("location_id").notNull(), status: text("status").notNull(), triggerType: text("trigger_type").notNull(),
  startedAt: ts("started_at"), completedAt: integer("completed_at"), listingsScanned: integer("listings_scanned").notNull().default(0),
  issuesFound: integer("issues_found").notNull().default(0), errorJson: json<unknown>("error_json"),
}, (t) => ({ loc: index("scan_loc").on(t.locationId, t.startedAt) }));

export const discrepancies = sqliteTable("discrepancies", {
  id: id(), locationId: text("location_id").notNull(), listingId: text("listing_id").notNull(), fieldName: text("field_name").notNull(),
  canonicalVersionId: text("canonical_version_id"), observedValueJson: json<unknown>("observed_value_json"), expectedValueJson: json<unknown>("expected_value_json"),
  severity: text("severity").notNull(), confidence: real("confidence").notNull(), explanation: text("explanation").notNull(),
  impact: text("impact").notNull(), classification: text("classification").notNull(),
  status: text("status").notNull(), firstDetectedAt: ts("first_detected_at"), lastSeenAt: ts("last_seen_at"), resolvedAt: integer("resolved_at"),
}, (t) => ({ loc: index("disc_loc").on(t.locationId, t.status), uq: uniqueIndex("disc_active").on(t.listingId, t.fieldName).where(sqlActive()) }));

function sqlActive() {
  // Only one non-terminal discrepancy per listing+field.
  return sql`status NOT IN ('resolved','dismissed')`;
}
import { sql } from "drizzle-orm";

export const repairProposals = sqliteTable("repair_proposals", {
  id: id(), discrepancyId: text("discrepancy_id").notNull(), targetPlatform: text("target_platform").notNull(),
  proposedChangeJson: json<{ field: string; oldValue: unknown; newValue: unknown; action: string; capability: string; risk: string }>("proposed_change_json").notNull(),
  evidenceJson: json<unknown>("evidence_json").notNull(), confidence: real("confidence").notNull(), explanation: text("explanation").notNull(),
  status: text("status").notNull(), approvedBy: text("approved_by"), approvedAt: integer("approved_at"), approvedPayloadJson: json<unknown>("approved_payload_json"),
  workflowInstanceId: text("workflow_instance_id"), createdAt: ts("created_at"),
}, (t) => ({ st: index("rp_status").on(t.status), d: index("rp_disc").on(t.discrepancyId) }));

export const repairAttempts = sqliteTable("repair_attempts", {
  id: id(), proposalId: text("proposal_id").notNull(), idempotencyKey: text("idempotency_key").notNull().unique(),
  connectorResponseJson: json<unknown>("connector_response_json"), status: text("status").notNull(), attemptedAt: ts("attempted_at"), verifiedAt: integer("verified_at"),
});

export const agentEvents = sqliteTable("agent_events", {
  id: id(), organizationId: text("organization_id").notNull(), locationId: text("location_id"), scanRunId: text("scan_run_id"),
  eventType: text("event_type").notNull(), message: text("message").notNull(), metadataJson: json<Record<string, unknown>>("metadata_json"), createdAt: ts("created_at"),
}, (t) => ({ loc: index("ev_loc").on(t.locationId, t.createdAt), scan: index("ev_scan").on(t.scanRunId) }));

export const notifications = sqliteTable("notifications", {
  id: id(), userId: text("user_id").notNull(), type: text("type").notNull(), dedupeKey: text("dedupe_key"), payloadJson: json<Record<string, unknown>>("payload_json").notNull(),
  readAt: integer("read_at"), createdAt: ts("created_at"),
}, (t) => ({ uq: uniqueIndex("notif_dedupe").on(t.userId, t.dedupeKey) }));

export const healthSnapshots = sqliteTable("health_snapshots", {
  id: id(), locationId: text("location_id").notNull(), monitoredFields: integer("monitored_fields").notNull(), matchingFields: integer("matching_fields").notNull(),
  score: real("score").notNull(), sources: integer("sources").notNull().default(0), recordedAt: ts("recorded_at"),
}, (t) => ({ loc: index("hs_loc").on(t.locationId, t.recordedAt) }));

export const auditLogs = sqliteTable("audit_logs", {
  id: id(), organizationId: text("organization_id").notNull(), userId: text("user_id"), action: text("action").notNull(), detailJson: json<unknown>("detail_json"), createdAt: ts("created_at"),
});

// Simulated external directory platform (clearly demo-only). Acts as the "remote" system of record.
export const demoListings = sqliteTable("demo_listings", {
  id: id(), organizationId: text("organization_id").notNull(), platform: text("platform").notNull(), slug: text("slug").notNull().unique(),
  name: text("name").notNull(), address: text("address").notNull(), phone: text("phone").notNull(), hours: text("hours").notNull(), website: text("website").notNull(),
  updatedAt: ts("updated_at"),
});
