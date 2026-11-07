import { sqliteTable, text, integer, real, index, uniqueIndex } from "drizzle-orm/sqlite-core";

const id = () => text("id").primaryKey();
const ts = (n: string) => integer(n).notNull();
const json = <T>(n: string) => text(n, { mode: "json" }).$type<T>();

export const users = sqliteTable("users", {
  id: id(), name: text("name").notNull(), email: text("email").notNull().unique(), createdAt: ts("created_at"),
});

export const organizations = sqliteTable("organizations", {
  id: id(), name: text("name").notNull(), ownerUserId: text("owner_user_id").notNull(), createdAt: ts("created_at"),
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

// AI search audit: what AI assistants actually say about the business, compared with the verified profile.
export const aiAudits = sqliteTable("ai_audits", {
  id: id(), locationId: text("location_id").notNull(), status: text("status").notNull(), startedAt: ts("started_at"), completedAt: integer("completed_at"),
  accuracy: real("accuracy"), visibility: real("visibility"), factsChecked: integer("facts_checked").notNull().default(0), factsWrong: integer("facts_wrong").notNull().default(0), assistantsTotal: integer("assistants_total").notNull().default(1),
  /** "verified": compared with owner-verified facts. "website": compared with what the business's own website says (unverified public check). */
  basis: text("basis").notNull().default("verified"),
  /** Findings from open public data (OpenStreetMap, Trade Register) captured when a public check starts. */
  publicSourcesJson: json<unknown>("public_sources_json"),
  errorJson: json<unknown>("error_json"),
}, (t) => ({ loc: index("aia_loc").on(t.locationId, t.startedAt) }));

export const aiAuditAnswers = sqliteTable("ai_audit_answers", {
  id: id(), auditId: text("audit_id").notNull(), assistant: text("assistant").notNull(), model: text("model").notNull(), webSearch: integer("web_search").notNull().default(0),
  questionKey: text("question_key").notNull(), prompt: text("prompt").notNull(), answer: text("answer"), mentioned: integer("mentioned").notNull().default(0),
  comparisonsJson: json<{ field: string; classification: string; severity: string | null; stated: unknown; expected: unknown; explanation: string }[]>("comparisons_json"),
  citationsJson: json<string[]>("citations_json"), sourcesJson: json<unknown[]>("sources_json"), confusedWith: text("confused_with"), error: text("error"), createdAt: ts("created_at"),
}, (t) => ({ a: index("aiaa_audit").on(t.auditId) }));

// Fixed-window counters for the public (unauthenticated) check endpoint.
export const rateLimits = sqliteTable("rate_limits", {
  key: text("key").primaryKey(), windowStart: integer("window_start").notNull(), count: integer("count").notNull(),
});

// "Connect suggests, the customer approves". Suggestions are produced offline by the model in /ml and loaded here; this app runs contact, decide, apply and confirm.
export const cnBusinesses = sqliteTable("cn_businesses", {
  id: id(), // Yext entity id (e.g. FI-D0001)
  name: text("name").notNull(), city: text("city"), country: text("country").notNull(), segment: text("segment"), story: text("story"),
  language: text("language").notNull().default("en"), channel: text("channel").notNull().default("EMAIL"), contactName: text("contact_name"), bestWindow: text("best_window"),
  standing: integer("standing").notNull().default(0), optedOut: integer("opted_out").notNull().default(0),
  email: text("email"), mobile: text("mobile"), telegramChatId: text("telegram_chat_id"), linkCode: text("link_code").notNull(),
  voice: integer("voice").notNull().default(0), publishersJson: json<{ name: string; status: string; seconds: number }[]>("publishers_json"), regularJson: json<Record<string, string>>("regular_json"), createdAt: ts("created_at"),
});

export const cnSuggestions = sqliteTable("cn_suggestions", {
  id: id(), businessId: text("business_id").notNull(), date: text("date").notNull(), dayKey: text("day_key").notNull(),
  action: text("action").notNull(), // SUGGEST | FLAG
  shown: text("shown").notNull(), proposed: text("proposed"), confidence: real("confidence").notNull(), basis: text("basis").notNull(),
  reasonsJson: json<string[]>("reasons_json").notNull(), viewsEst: real("views_est").notNull().default(0),
  // auto (>= 0.95, applied for owners with standing permission) | one_tap | ask (owner picks from options) ; see ml/predict.py
  tier: text("tier").notNull().default("one_tap"), optionsJson: json<string[]>("options_json"), costJson: json<Record<string, unknown>>("cost_json"),
  status: text("status").notNull(), // draft | sent | applied | auto_applied | declined | kept | undone | failed | flagged
  finalHours: text("final_hours"), token: text("token").notNull(), messageId: text("message_id"), note: text("note"),
  undoJson: json<{ had: unknown }>("undo_json"), createdAt: ts("created_at"), sentAt: integer("sent_at"), decidedAt: integer("decided_at"), appliedAt: integer("applied_at"),
}, (t) => ({ biz: index("cns_biz").on(t.businessId, t.date), tok: uniqueIndex("cns_token").on(t.token), uq: uniqueIndex("cns_uq").on(t.businessId, t.date) }));

/** One bundled message to one owner. */
export const cnMessages = sqliteTable("cn_messages", {
  id: id(), businessId: text("business_id").notNull(), channel: text("channel").notNull(), language: text("language").notNull(), token: text("token").notNull(),
  renderedJson: json<{ title: string; text: string; kind?: "ask" | "auto" }>("rendered_json").notNull(), deliveredVia: text("delivered_via"), externalRef: text("external_ref"), smsTo: text("sms_to"), createdAt: ts("created_at"),
}, (t) => ({ tok: uniqueIndex("cnmsg_token").on(t.token) }));

/** What each owner has taught us: accepted hours per special day, edits (and the closing-time shift they imply), declines. */
export const cnMemory = sqliteTable("cn_memory", {
  id: id(), businessId: text("business_id").notNull(), dayKey: text("day_key").notNull(), lastHours: text("last_hours"),
  approvals: integer("approvals").notNull().default(0), edits: integer("edits").notNull().default(0), declines: integer("declines").notNull().default(0),
  closeShiftMin: integer("close_shift_min").notNull().default(0), updatedAt: ts("updated_at"),
}, (t) => ({ uq: uniqueIndex("cnm_uq").on(t.businessId, t.dayKey) }));

export const cnEvents = sqliteTable("cn_events", {
  id: id(), businessId: text("business_id").notNull(), suggestionId: text("suggestion_id"), type: text("type").notNull(), detailJson: json<unknown>("detail_json"), createdAt: ts("created_at"),
}, (t) => ({ biz: index("cne_biz").on(t.businessId, t.createdAt) }));

/** Changes the owner asked for themselves (typed, spoken or photographed), proposed by the agent and applied only after a tap. */
export const cnChanges = sqliteTable("cn_changes", {
  id: id(), businessId: text("business_id").notNull(), type: text("type").notNull(), payloadJson: json<Record<string, unknown>>("payload_json").notNull(),
  source: text("source").notNull(), // text | voice | photo
  status: text("status").notNull(), // proposed | applied | declined | failed | undone
  undoJson: json<Record<string, unknown>>("undo_json"), note: text("note"), createdAt: ts("created_at"), appliedAt: integer("applied_at"),
}, (t) => ({ biz: index("cnc_biz").on(t.businessId, t.createdAt) }));

/** Hard limits the owner set ("never closed on Fridays"). Deterministic: they override the model, the agent and autopilot. */
export const cnRules = sqliteTable("cn_rules", {
  id: id(), businessId: text("business_id").notNull(), kind: text("kind").notNull(), paramsJson: json<Record<string, unknown>>("params_json").notNull(), source: text("source").notNull().default("owner"), createdAt: ts("created_at"),
}, (t) => ({ biz: index("cnr_biz").on(t.businessId) }));

/** Escalation ladder log: which step (contact, nudge, voice, call, ai alert) was taken for which critical finding, and how it went. */
export const cnAlerts = sqliteTable("cn_alerts", {
  id: id(), businessId: text("business_id").notNull(), scenario: text("scenario").notNull(), refId: text("ref_id").notNull(), step: text("step").notNull(),
  outcome: text("outcome").notNull(), // sent | skipped | failed
  detailJson: json<Record<string, unknown>>("detail_json"), createdAt: ts("created_at"),
}, (t) => ({ ref: index("cna_ref").on(t.businessId, t.refId) }));
