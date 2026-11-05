import { and, desc, eq, inArray, notInArray } from "drizzle-orm";
import { schema, type DB } from "./db";
import { newId, now } from "./ids";
import { loadCanonical, type Canonical } from "./canonical";
import { compareAll, isMatch, type Comparison, type FieldName } from "./compare";
import { computeHealthScore } from "./health";
import { matchIdentity } from "./identity";
import { contentHash, extractFromHtml, extractFromRaw, fetchPage, type Extraction } from "./extract";
import { canWriteTo, connectorInfo, demoConnector } from "./connectors";
import { audit, emit, notify } from "./events";
import { displayValue } from "./format";
import { FIELD_LABELS } from "./compare";

type Location = typeof schema.businessLocations.$inferSelect;
type Listing = typeof schema.listings.$inferSelect;

const ACTIVE_NOT = ["resolved", "dismissed"];
const FREQ_MS: Record<string, number> = { hourly: 3600e3, every_6_hours: 6 * 3600e3, daily: 86400e3, weekly: 7 * 86400e3 };
const sleep = (ms: number) => (ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve());

export function listingLabel(db: DB, listing: Listing): string {
  if (listing.platform === "demo" && listing.externalListingId) {
    const r = db.select().from(schema.demoListings).where(eq(schema.demoListings.slug, listing.externalListingId)).get();
    if (r) return `${r.platform} (simulated)`;
  }
  return connectorInfo(listing.platform)?.label ?? listing.platform;
}

export function canonicalValues(c: Canonical): Partial<Record<FieldName, unknown>> {
  const o: Partial<Record<FieldName, unknown>> = {};
  for (const [k, v] of Object.entries(c)) o[k as FieldName] = v.value;
  return o;
}
export function observedValues(e: Extraction): Partial<Record<FieldName, unknown>> {
  const o: Partial<Record<FieldName, unknown>> = {};
  for (const [k, v] of Object.entries(e)) o[k as FieldName] = v!.value;
  return o;
}

export async function observeListing(db: DB, listing: Listing): Promise<{ extraction: Extraction | null; error?: string }> {
  try {
    if (listing.platform === "website") {
      const page = await fetchPage(listing.url);
      if (!page.ok) return { extraction: null, error: `HTTP ${page.status}` };
      const ex = extractFromHtml(page.html, listing.url);
      return ex ? { extraction: ex } : { extraction: null, error: "No structured business data found" };
    }
    if (listing.platform === "demo") {
      const raw = demoConnector.readListing(db, listing.externalListingId!);
      if (!raw) return { extraction: null, error: "Listing no longer exists on platform" };
      return { extraction: extractFromRaw(raw, listing.url, 0.98, raw.updatedAt) };
    }
    return { extraction: null, error: "No read integration for this platform" };
  } catch (e) {
    return { extraction: null, error: e instanceof Error ? e.message : String(e) };
  }
}

function recordObservation(db: DB, listing: Listing, ex: Extraction) {
  const data = Object.fromEntries(Object.entries(ex).map(([k, v]) => [k, v!.value]));
  const hash = contentHash(JSON.stringify(data));
  const last = db.select().from(schema.listingObservations).where(eq(schema.listingObservations.listingId, listing.id)).orderBy(desc(schema.listingObservations.observedAt)).get();
  if (!last || last.contentHash !== hash) {
    db.insert(schema.listingObservations).values({ id: newId(), listingId: listing.id, observedDataJson: ex as unknown as Record<string, unknown>, evidenceJson: { url: listing.url, platform: listing.platform }, observedAt: now(), contentHash: hash }).run();
  }
  db.update(schema.listings).set({ lastScannedAt: now() }).where(eq(schema.listings.id, listing.id)).run();
}

export function latestExtraction(db: DB, listingId: string): Extraction | null {
  const o = db.select().from(schema.listingObservations).where(eq(schema.listingObservations.listingId, listingId)).orderBy(desc(schema.listingObservations.observedAt)).get();
  return o ? (o.observedDataJson as unknown as Extraction) : null;
}

export function locationHealth(db: DB, locationId: string) {
  const canon = canonicalValues(loadCanonical(db, locationId));
  const ls = db.select().from(schema.listings).where(and(eq(schema.listings.locationId, locationId), eq(schema.listings.status, "monitoring"))).all();
  const per: Comparison[][] = [];
  for (const l of ls) {
    const ex = latestExtraction(db, l.id);
    if (ex) per.push(compareAll(canon, observedValues(ex)));
  }
  return computeHealthScore(per);
}

export function snapshotHealth(db: DB, locationId: string) {
  const h = locationHealth(db, locationId);
  if (h.score !== null) db.insert(schema.healthSnapshots).values({ id: newId(), locationId, monitoredFields: h.monitored, matchingFields: h.matching, score: h.score, sources: h.sources, recordedAt: now() }).run();
  return h;
}

interface Ctx { db: DB; orgId: string; ownerId: string; loc: Location; scanId: string | null; canonical: Canonical; websiteComps: Map<FieldName, Comparison> }

/** Compares one listing's extraction with canonical data and upserts discrepancies/proposals. Returns active-issue count. */
export function evaluateListing(ctx: Ctx, listing: Listing, ex: Extraction): number {
  const { db, orgId, loc, scanId } = ctx;
  const comps = compareAll(canonicalValues(ctx.canonical), observedValues(ex));
  const info = connectorInfo(listing.platform);
  const isOwnWebsite = listing.platform === "website";
  let issues = 0;
  for (const c of comps) {
    const existing = db.select().from(schema.discrepancies).where(and(eq(schema.discrepancies.listingId, listing.id), eq(schema.discrepancies.fieldName, c.field), notInArray(schema.discrepancies.status, ACTIVE_NOT))).get();
    const actionable = c.classification === "likely" || (c.classification === "ambiguous" && c.severity !== null);
    if (!actionable) {
      if (existing && isMatch(c.classification)) {
        const inFlight = db.select().from(schema.repairProposals).where(and(eq(schema.repairProposals.discrepancyId, existing.id), inArray(schema.repairProposals.status, ["approved", "applying", "verifying"]))).get();
        if (!inFlight) {
          db.update(schema.discrepancies).set({ status: "resolved", resolvedAt: now(), lastSeenAt: now() }).where(eq(schema.discrepancies.id, existing.id)).run();
          db.update(schema.repairProposals).set({ status: "superseded" }).where(and(eq(schema.repairProposals.discrepancyId, existing.id), eq(schema.repairProposals.status, "awaiting_approval"))).run();
          emit(db, orgId, loc.id, scanId, "discrepancy_cleared", `${FIELD_LABELS[c.field]} on ${info?.label ?? listing.platform} now matches the verified profile.`, { listingId: listing.id, field: c.field });
        }
      }
      continue;
    }
    issues++;
    const observedRaw = ex[c.field]?.raw;
    if (existing) {
      db.update(schema.discrepancies).set({ lastSeenAt: now(), observedValueJson: c.observed }).where(eq(schema.discrepancies.id, existing.id)).run();
      continue;
    }
    const dismissed = db.select().from(schema.discrepancies).where(and(eq(schema.discrepancies.listingId, listing.id), eq(schema.discrepancies.fieldName, c.field), eq(schema.discrepancies.status, "dismissed"))).orderBy(desc(schema.discrepancies.firstDetectedAt)).get();
    if (dismissed && JSON.stringify(dismissed.observedValueJson) === JSON.stringify(c.observed)) continue;

    // Investigation: does the owner's official website corroborate the verified value?
    const web = ctx.websiteComps.get(c.field);
    const corroborated = !isOwnWebsite && !!web && isMatch(web.classification);
    const authoritative = !!info && info.capabilities.includes("read") && listing.platform !== "website";
    let confidence = 0.8 + (corroborated ? 0.1 : 0) + (authoritative ? 0.08 : 0);
    confidence = Math.min(0.99, Number(confidence.toFixed(2)));
    const label = listingLabel(db, listing);
    const staleCanonical = isOwnWebsite;
    const explanation = staleCanonical
      ? `Your official website shows ${FIELD_LABELS[c.field].toLowerCase()} "${displayValue(c.field, c.observed)}" but your verified profile says "${displayValue(c.field, c.canonical)}". Either the website is outdated or the verified profile is stale — please confirm the correct value.`
      : `${label} shows ${FIELD_LABELS[c.field].toLowerCase()} "${displayValue(c.field, c.observed)}". Your verified profile${corroborated ? " and official website both" : ""} show "${displayValue(c.field, c.canonical)}". ${c.impact}`;
    const discId = newId();
    const writable = canWriteTo(listing.platform);
    const status = staleCanonical || c.classification === "ambiguous" ? "needs_clarification" : "awaiting_approval";
    db.insert(schema.discrepancies).values({
      id: discId, locationId: loc.id, listingId: listing.id, fieldName: c.field, canonicalVersionId: ctx.canonical[c.field]?.versionId ?? null,
      observedValueJson: c.observed, expectedValueJson: c.canonical, severity: c.severity ?? "low", confidence, explanation, impact: c.impact,
      classification: confidence >= 0.9 && !staleCanonical ? "confirmed" : c.classification, status, firstDetectedAt: now(), lastSeenAt: now(),
    }).run();
    emit(db, orgId, loc.id, scanId, "discrepancy_detected", `Detected ${FIELD_LABELS[c.field].toLowerCase()} mismatch on ${label}: "${displayValue(c.field, c.observed)}" vs verified "${displayValue(c.field, c.canonical)}".`, { discrepancyId: discId, listingId: listing.id, severity: c.severity, url: listing.url });
    if (corroborated) emit(db, orgId, loc.id, scanId, "investigation", `Verified ${FIELD_LABELS[c.field].toLowerCase()} on the official website: "${displayValue(c.field, web!.observed)}" agrees with the verified profile.`, { url: loc.website, discrepancyId: discId });
    if (status === "awaiting_approval") {
      db.insert(schema.repairProposals).values({
        id: newId(), discrepancyId: discId, targetPlatform: listing.platform,
        proposedChangeJson: { field: c.field, oldValue: displayValue(c.field, c.observed), newValue: displayValue(c.field, c.canonical), action: writable ? "update_listing" : "manual_submission", capability: writable ? "write" : "manual_approval_link", risk: c.severity === "critical" ? "high" : "low" },
        evidenceJson: { listingUrl: listing.url, observed: { raw: observedRaw, excerpt: ex[c.field]?.excerpt, observedAt: ex[c.field]?.observedAt }, corroboration: corroborated ? [{ source: "official_website", url: loc.website, value: displayValue(c.field, web!.observed) }] : [], manageUrl: info?.manageUrl ?? null },
        confidence, explanation, status: "awaiting_approval", createdAt: now(),
      }).run();
      emit(db, orgId, loc.id, scanId, "proposal_created", `Prepared a correction for ${label}: ${FIELD_LABELS[c.field].toLowerCase()} → "${displayValue(c.field, c.canonical)}". Awaiting owner approval.`, { discrepancyId: discId });
      notify(db, ctx.ownerId, "approval_required", `${discId}:approval`, { discrepancyId: discId, field: c.field, platform: listing.platform });
    } else {
      notify(db, ctx.ownerId, "clarification_needed", `${discId}:clarify`, { discrepancyId: discId, field: c.field });
    }
    if (c.severity === "critical" || c.severity === "high") notify(db, ctx.ownerId, "serious_discrepancy", `${discId}:serious`, { discrepancyId: discId, field: c.field, severity: c.severity });
  }
  return issues;
}

function makeCtx(db: DB, loc: Location, scanId: string | null): Ctx {
  const org = db.select().from(schema.organizations).where(eq(schema.organizations.id, loc.organizationId)).get()!;
  return { db, orgId: loc.organizationId, ownerId: org.ownerUserId, loc, scanId, canonical: loadCanonical(db, loc.id), websiteComps: new Map() };
}

function websiteComparisons(db: DB, ctx: Ctx) {
  ctx.websiteComps.clear();
  const site = db.select().from(schema.listings).where(and(eq(schema.listings.locationId, ctx.loc.id), eq(schema.listings.platform, "website"))).get();
  const ex = site && latestExtraction(db, site.id);
  if (ex) for (const c of compareAll(canonicalValues(ctx.canonical), observedValues(ex))) ctx.websiteComps.set(c.field, c);
}

/** Re-reads a single listing and re-evaluates it (used by "Recheck" and repair verification). */
export async function recheckListing(db: DB, listingId: string, scanId: string | null = null) {
  const listing = db.select().from(schema.listings).where(eq(schema.listings.id, listingId)).get();
  if (!listing) throw new Error("Listing not found");
  const loc = db.select().from(schema.businessLocations).where(eq(schema.businessLocations.id, listing.locationId)).get()!;
  const ctx = makeCtx(db, loc, scanId);
  websiteComparisons(db, ctx);
  const { extraction, error } = await observeListing(db, listing);
  if (!extraction) {
    emit(db, loc.organizationId, loc.id, scanId, "source_unavailable", `Could not read ${listing.url}: ${error}`, { listingId });
    return { ok: false as const, error };
  }
  recordObservation(db, listing, extraction);
  const issues = evaluateListing(ctx, listing, extraction);
  return { ok: true as const, issues, extraction };
}

function upsertListing(db: DB, loc: Location, platform: string, url: string, externalId: string | null, confidence: number, status: string, scanId: string | null): { listing: Listing; created: boolean } {
  const existing = db.select().from(schema.listings).where(and(eq(schema.listings.locationId, loc.id), eq(schema.listings.url, url))).get();
  if (existing) return { listing: existing, created: false };
  const id = newId();
  db.insert(schema.listings).values({ id, locationId: loc.id, platform, externalListingId: externalId, url, identityConfidence: confidence, status, discoveredAt: now() }).run();
  return { listing: db.select().from(schema.listings).where(eq(schema.listings.id, id)).get()!, created: true };
}

export interface ScanOptions { paceMs?: number; trigger?: "manual" | "scheduled" | "recheck" | "initial" }

/** Starts a scan, or returns the already-running one (dedupe). Work continues asynchronously. */
export function startScan(db: DB, locationId: string, opts: ScanOptions = {}): { scanId: string; deduped: boolean } {
  const running = db.select().from(schema.scanRuns).where(and(eq(schema.scanRuns.locationId, locationId), eq(schema.scanRuns.status, "running"))).orderBy(desc(schema.scanRuns.startedAt)).get();
  if (running && now() - running.startedAt < 5 * 60_000) return { scanId: running.id, deduped: true };
  const scanId = newId();
  db.insert(schema.scanRuns).values({ id: scanId, locationId, status: "running", triggerType: opts.trigger ?? "manual", startedAt: now() }).run();
  void executeScan(db, locationId, scanId, opts).catch((e) => {
    db.update(schema.scanRuns).set({ status: "failed", completedAt: now(), errorJson: { message: String(e) } }).where(eq(schema.scanRuns.id, scanId)).run();
  });
  return { scanId, deduped: false };
}

export async function executeScan(db: DB, locationId: string, scanId: string, opts: ScanOptions = {}) {
  const loc = db.select().from(schema.businessLocations).where(eq(schema.businessLocations.id, locationId)).get();
  if (!loc) throw new Error("Location not found");
  const ctx = makeCtx(db, loc, scanId);
  const pace = opts.paceMs ?? 0;
  const ev = (type: string, msg: string, meta?: Record<string, unknown>) => emit(db, loc.organizationId, loc.id, scanId, type, msg, meta);
  let scanned = 0, issues = 0;

  if (!Object.keys(ctx.canonical).length) {
    ev("scan_failed", "No verified profile fields yet; confirm your business information first.");
    db.update(schema.scanRuns).set({ status: "failed", completedAt: now(), errorJson: { message: "no_verified_profile" } }).where(eq(schema.scanRuns.id, scanId)).run();
    return;
  }
  ev("scan_started", `Scan started for ${loc.businessName} (${opts.trigger ?? "manual"}).`);
  await sleep(pace);

  // 1. Official website
  if (loc.website) {
    ev("reading_source", `Reading official website ${loc.website}`, { url: loc.website });
    const { listing } = upsertListing(db, loc, "website", loc.website, null, 1, "monitoring", scanId);
    const { extraction, error } = await observeListing(db, listing);
    if (extraction) {
      recordObservation(db, listing, extraction);
      scanned++;
      ev("extracted", `Extracted ${Object.keys(extraction).length} fields from the official website.`, { url: loc.website, fields: Object.keys(extraction) });
    } else ev("source_unavailable", `Official website unavailable: ${error}`, { url: loc.website });
    websiteComparisons(db, ctx);
  }
  await sleep(pace);

  // 2. Discovery (demo directory index). Identity is decided deterministically before any listing is monitored.
  ev("searching", "Searching directories for business mentions…");
  const candidates = db.select().from(schema.demoListings).where(eq(schema.demoListings.organizationId, loc.organizationId)).all();
  const addr = ctx.canonical.address?.value as string | undefined;
  const monitored: Listing[] = [];
  for (const cand of candidates) {
    await sleep(pace);
    const url = `${process.env.APP_URL ?? "http://localhost:3000"}/demo-directory/${cand.slug}`;
    const m = matchIdentity({ name: loc.businessName, address: addr, phone: ctx.canonical.phone?.value as string, website: loc.website ?? undefined, city: loc.city ?? undefined }, { name: cand.name, address: cand.address, phone: cand.phone, website: cand.website });
    if (m.verdict === "reject") { ev("listing_ignored", `Ignored unrelated "${cand.name}" on ${cand.platform} (identity score ${m.score}).`, { slug: cand.slug, signals: m.signals }); continue; }
    const { listing, created } = upsertListing(db, loc, "demo", url, cand.slug, m.score, m.verdict === "match" ? "monitoring" : "needs_review", scanId);
    if (created) {
      ev("listing_discovered", `Discovered listing "${cand.name}" on ${cand.platform} (identity ${Math.round(m.score * 100)}%: ${m.signals.join(", ")}).`, { listingId: listing.id, url });
      notify(db, ctx.ownerId, "new_listing", `${listing.id}:new`, { listingId: listing.id, platform: cand.platform });
    }
    if (listing.status === "monitoring") monitored.push(listing);
  }
  // Include previously known listings that were not re-discovered.
  for (const l of db.select().from(schema.listings).where(and(eq(schema.listings.locationId, loc.id), eq(schema.listings.status, "monitoring"), eq(schema.listings.platform, "demo"))).all()) if (!monitored.find((m) => m.id === l.id)) monitored.push(l);

  // 3. Extract + compare each monitored listing
  for (const l of monitored) {
    await sleep(pace);
    ev("reading_source", `Reading ${l.url}`, { listingId: l.id, url: l.url });
    const { extraction, error } = await observeListing(db, l);
    if (!extraction) { ev("source_unavailable", `Could not read ${l.url}: ${error}`, { listingId: l.id }); continue; }
    recordObservation(db, l, extraction);
    scanned++;
    ev("comparing", `Comparing ${Object.keys(extraction).length} extracted fields against the verified profile.`, { listingId: l.id });
    issues += evaluateListing(ctx, l, extraction);
  }
  // Website listing last so its comparison can raise "canonical may be stale" clarifications.
  const site = db.select().from(schema.listings).where(and(eq(schema.listings.locationId, loc.id), eq(schema.listings.platform, "website"))).get();
  const siteEx = site && latestExtraction(db, site.id);
  if (site && siteEx) issues += evaluateListing(ctx, site, siteEx);

  const h = snapshotHealth(db, loc.id);
  ev("health_updated", h.score === null ? "Not enough data to compute Presence Health." : `Presence Health: ${h.score}% (${h.matching}/${h.monitored} fields across ${h.sources} sources).`, { score: h.score });
  const activeCount = db.select().from(schema.discrepancies).where(and(eq(schema.discrepancies.locationId, loc.id), notInArray(schema.discrepancies.status, ACTIVE_NOT))).all().length;
  db.update(schema.scanRuns).set({ status: "completed", completedAt: now(), listingsScanned: scanned, issuesFound: activeCount }).where(eq(schema.scanRuns.id, scanId)).run();
  db.update(schema.businessLocations).set({ nextScanAt: now() + (FREQ_MS[loc.monitoringFrequency] ?? FREQ_MS.daily) }).where(eq(schema.businessLocations.id, loc.id)).run();
  ev("scan_completed", `Scan complete: ${scanned} sources read, ${activeCount} active issue(s).`, { issues: activeCount });
  audit(db, loc.organizationId, null, "scan.completed", { scanId, scanned, issues: activeCount });
}

/** Cron entry point: enqueue (here: start) scans for locations whose next_scan_at has passed. */
export function enqueueDueScans(db: DB, at = now()) {
  const due = db.select().from(schema.businessLocations).all().filter((l) => l.nextScanAt !== null && l.nextScanAt <= at);
  return due.map((l) => startScan(db, l.id, { trigger: "scheduled" }));
}
