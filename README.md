# FonectaGuard

*Connect once. Stay accurate everywhere.* An evidence-based business-presence monitor: discover listings → extract → match identity → compare against the owner-verified profile → investigate → propose a fix → **human approves** → apply → **verify by re-reading**.

## Status (Phase 1–3 MVP)

Working end to end, locally, with a persisted SQLite database (Drizzle schema, D1-compatible):

- Demo session, organization, verified canonical profile (versioned fields; only owner-confirmed values are authoritative)
- Scan engine: official-website fetch (JSON-LD, Zod-validated, page content treated as data only), directory discovery, deterministic identity matching (rejects look-alike businesses), deterministic field comparison (phone/address/hours/…), transparent Presence Health score, discrepancy dedupe
- Investigation (website corroboration → confidence), repair proposals, approval / edit / reject, durable repair state machine with revalidation, idempotency keys and post-write verification
- Demo connector: a persisted, clearly labelled simulated directory; drift and reset are real DB operations
- Dashboard, Listings, Issues, Resolution Center, Activity, Connections (truthful capability states), Settings, Onboarding
- Cron-style entry point `GET /api/cron` (Bearer `CRON_SECRET`) that starts scans for locations past `next_scan_at`

**Not built yet (honest list):** TinyFish Search/Fetch/Web Agent, OpenRouter/AI SDK extraction and chat, real OAuth (Google/Meta), R2 evidence storage, Cloudflare Workers/Queues/Workflows/Cron deployment, notification preferences UI, email. Discovery currently reads the demo directory index; the repair lifecycle in `src/lib/repair.ts` is written as persisted steps so it maps onto Workflow steps. Connections for Google/Meta/Apple/Bing/Yelp/Fonecta are shown as unavailable (partner access / setup required), never as fake connections.

## Run

```bash
cp .env.example .env.local   # optional; defaults work
npm install
npm run dev                  # http://localhost:3000
npm test
```

Set `APP_URL` to the URL the server is reachable at (the scanner fetches the demo business site from it). Data lives in `./data/fonectaguard.db`; migrations in `drizzle/` apply automatically (`npm run db:generate` after schema changes).

## Demo script

1. `/login` → "Continue to demo workspace" (fictional *Northstar Coffee — Turku*).
2. Overview → **Run Live Scan**: watch real persisted events; 3 seeded mismatches (wrong phone, closing time 20:00, old address) are found; a look-alike business is ignored.
3. Issues → evidence and explanation. Approvals → **Approve Fix** (optionally edit the value).
4. The repair revalidates, writes to the simulated directory, re-reads it, resolves the issue and recalculates Presence Health.
5. **Reset demo scenario** (sidebar, demo org only) to repeat.

## Layout

`src/lib/`: `normalize` · `compare` · `identity` · `health` · `extract` · `scan` (engine + cron entry) · `repair` (approval/execution) · `connectors` (capability matrix + demo connector) · `schema` (Drizzle). `tests/engine.test.ts` covers detection, approval requirements, revalidation and idempotent repair.
