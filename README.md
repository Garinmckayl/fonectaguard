# FonectaGuard

*Connect once. Stay accurate everywhere.* An evidence-based business-presence monitor: discover listings → extract → match identity → compare against the owner-verified profile → investigate → propose a fix → **human approves** → apply → **verify by re-reading**.

## Status (Phase 1–3 MVP)

Working end to end, locally, on Cloudflare Workers (OpenNext) with D1 (Drizzle), a Queue for scans and a cron trigger. Live: https://fonectaguard.searchome.workers.dev



- Demo session, organization, verified canonical profile (versioned fields; only owner-confirmed values are authoritative)
- Scan engine: official-website fetch (JSON-LD, Zod-validated, page content treated as data only), directory discovery, deterministic identity matching (rejects look-alike businesses), deterministic field comparison (phone/address/hours/…), transparent Presence Health score, discrepancy dedupe
- Investigation (website corroboration → confidence), repair proposals, approval / edit / reject, durable repair state machine with revalidation, idempotency keys and post-write verification
- Demo connector: a persisted, clearly labelled simulated directory; drift and reset are real DB operations
- Dashboard, Listings, Issues, Resolution Center, Activity, Connections (truthful capability states), Settings, Onboarding
- Cron-style entry point `GET /api/cron` (Bearer `CRON_SECRET`) that starts scans for locations past `next_scan_at`

**Live integrations:** TinyFish Search + Fetch discover and read real web listings; OpenRouter extracts structured facts (output is Zod-validated, page text is treated as data) and powers the grounded assistant; identity matching and comparison stay deterministic. Visitors can start a real workspace from the login page. Secrets: `TINYFISH_API_KEY`, `OPENROUTER_API_KEY` (Worker secrets / `.dev.vars`).

**Not built yet (honest list):** TinyFish Web Agent, real OAuth (Google/Meta), R2 evidence storage, Cloudflare Workflows (repairs run inline in the approve request), notification preferences UI, email. Discovery currently reads the demo directory index; the repair lifecycle in `src/lib/repair.ts` is written as persisted steps so it maps onto Workflow steps. Connections for Google/Meta/Apple/Bing/Yelp/Fonecta are shown as unavailable (partner access / setup required), never as fake connections.

## Run / deploy

```bash
npm install
npm test                     # in-memory sqlite stands in for D1
npm run dev                  # Next dev with local D1 bindings via wrangler
```

Deploy (needs `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`):

```bash
npx wrangler d1 create fonectaguard && npx wrangler queues create fonectaguard-scans   # then put the D1 id in wrangler.jsonc
npx wrangler d1 migrations apply fonectaguard --remote
npx wrangler secret put AUTH_SECRET && npx wrangler secret put CRON_SECRET
npx opennextjs-cloudflare build && npx wrangler deploy
```

Set `APP_URL` in `wrangler.jsonc` to the deployed URL (the scanner fetches the demo site from it through a self service binding). `worker.ts` adds the cron `scheduled` and Queue `queue` handlers.

## Demo script

1. `/login` → "Continue to demo workspace" (fictional *Northstar Coffee — Turku*).
2. Overview → **Run Live Scan**: watch real persisted events; 3 seeded mismatches (wrong phone, closing time 20:00, old address) are found; a look-alike business is ignored.
3. Issues → evidence and explanation. Approvals → **Approve Fix** (optionally edit the value).
4. The repair revalidates, writes to the simulated directory, re-reads it, resolves the issue and recalculates Presence Health.
5. **Reset demo scenario** (sidebar, demo org only) to repeat.

## Layout

`src/lib/`: `normalize` · `compare` · `identity` · `health` · `extract` · `scan` (engine + cron entry) · `repair` (approval/execution) · `connectors` (capability matrix + demo connector) · `schema` (Drizzle). `tests/engine.test.ts` covers detection, approval requirements, revalidation and idempotent repair.
