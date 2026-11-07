# FonectaGuard · Connect Suggests

**Detect → Suggest → Contact → Decide (no login) → Apply and confirm**, for Fonecta's challenge *"Connect Suggests – Customer Approves"*. The suggestions come from a model we scored honestly out-of-fold; the owner always has the last word; approved changes are written to the **Yext sandbox and read back** to verify.

Live: **https://fonectaguard.arcumet.com** (control room at `/connect`, access link provided to the judges). Telegram bot: **@fonguardbot**.

| | |
|---|---|
| Out-of-fold score on the dev labels (ported official scorer) | **63.3** vs ported baseline **54.5** |
| 2025 back-test (train on 2024, score 2025) | ≈ 60.3 |
| When it suggests: precision / recall | ≈ 0.85 / ≈ 0.70 |
| Businesses with history / without | ≈ 95% / ≈ 55% of days state-correct |

We do **not** claim more. Early in-sample numbers (77.8) leaked training labels and were retracted; every number above is out-of-fold, grouped by business. The scorer is our port of the published rules (we did not run downloaded organiser code); run the official `evaluate.py` on `predictions_2026.csv` to check us.

## Try it yourself (30 seconds, no login)

**https://fonectaguard.arcumet.com/try** opens your own private copy of the demo café's decision page, exactly as an owner would see it from a message. Tap **Approve**, **Edit** or **Decline**: an approval writes to the real Yext sandbox, is read back to verify, and shows where the change will appear and how fast. Nobody is contacted, and your copy is deleted after a day. The control room (`/connect`), the Telegram bot (@fonguardbot) and the WhatsApp sandbox are described in the submission notes.

## Run it

```bash
npm ci
cp .env.example .dev.vars          # fill in keys (see below); Yext sandbox key + entity are the only ones needed for steps 4–5
npm run dev                        # http://localhost:3000, control room at /connect
npm test                           # 133 tests: rules, agent, tiers, SMS, Yext write/undo, audit engine
```
Needed for the full loop: `YEXT_API_KEY`, `YEXT_ENTITY_ID` (our sandbox entity is `SinceAI16`), `CONNECT_ADMIN_KEY`. Optional channels: `TELEGRAM_BOT_TOKEN`, `RESEND_API_KEY` (+ `DEMO_EMAIL`), `TWILIO_*` (+ `DEMO_PHONE`), `ELEVENLABS_API_KEY`, `OPENROUTER_API_KEY`. Messages only ever go to the demo address/number/chat, never to the (fake) contact data.

The model (offline batch, Python):
```bash
python3 -m venv .venv-ml && .venv-ml/bin/pip install lightgbm pandas numpy scikit-learn scipy pyarrow
# organiser data goes in challenge/ (not redistributed here)
.venv-ml/bin/python -m ml.train            # out-of-fold evaluation on dev (prints score vs baseline)
.venv-ml/bin/python -m ml.predict          # final fit -> predictions_2026.csv + suggestions_2026.json
.venv-ml/bin/python -m ml.export_seed      # -> seed.sql loaded into the app (D1)
.venv-ml/bin/python ml/evaluate.py predictions_2026.csv   # scorer
```
Prediction for the 2026 targets is in `predictions_2026.csv` (columns `entity_id,date,action,hours,confidence`).

## The five steps

1. **Detect.** A LightGBM model reads ~140 features per business and special day and decides: *no change / closed / open with different hours*, or *flag* when reviews and Google edits suggest the business closed for good. Days where the shown hours are probably right stay silent.
2. **Suggest.** One concrete suggestion with structured, localised reasons ("Last year you entered 07:30–13:00 for this day"), a confidence, and a **tier** by how sure the model is: ≥ 0.95 *autopilot* (only for owners with standing permission, always with undo), ≥ 0.80 *one tap*, below that an *ask* ("Which is right? A / B / keep what Google shows"). A cost line states what a wrong hour costs (last year's views and actions that day).
3. **Contact.** One bundled message (max 4 days) on the owner's preferred channel and language (fi/sv/nb/en): Telegram (with voice-note option), WhatsApp (Vonage sandbox, two-way: reply OK / 2B / NO 1, or talk to the agent), SMS (Twilio, needs keys), e-mail (Resend), each with a no-login link. Opt-outs are never contacted. Flagged "closed for good" cases go to a human at Connect, not to the owner.
4. **Decide, no login.** Approve, edit ("10–15", or by voice), choose an option, or decline: by tap, by SMS reply (`OK`, `2B`, `NO 2`, `UNDO`), or on the token link. Edits teach the system: the owner's trim of closing time is remembered and sibling days adjusted; a decline means we never suggest that day again.
5. **Apply and confirm.** The change is written to the **Yext Knowledge API sandbox** (`holidayHours`, read-merge-write), read back to verify, and the owner is told *where it shows and how fast* per publisher (Google within minutes, directories not connected are listed as not updated). Every change can be undone for 24 hours; undo restores the exact previous Yext entry.

### Critical alerts and the escalation ladder
When a suggested change is close to its date and still undecided, the system goes to the owner instead of waiting. The decision is a transparent, tested policy over the model's calibrated confidence (`src/lib/connect/critical.ts`): **score = confidence × urgency** (1.0 within 24 h of the day starting, 0.7 within 48 h, 0.4 within 72 h); critical at ≥ 0.5. The ladder takes one step per run, each only when due: message → reminder after 3 h (Telegram buttons, WhatsApp, SMS) → voice note after 4 h (ElevenLabs "AI voice") → **phone call** after 4 h, only if the score is ≥ 0.75, the day had ≥ 20 views last year, ≥ 2 h remain, it is between 08:00 and 20:00 local time, and no call was made in the last 24 h. Opt-outs and the owner's own rules stop the whole ladder. On the call the owner presses 1 to approve or 2 to leave it; silence applies nothing.

**What is real and what is not.** Telegram, WhatsApp (Vonage Messages sandbox), e-mail, the ElevenLabs voice note and the reminder logic are real and tested live. **The phone-call step is implemented (Vonage Voice, 46elks and Twilio adapters, one webhook per provider, keypress handling, Yext write on "1") and covered by tests against mocks of each provider's API, but it has not been tested on a live phone line**: our Vonage trial account could not place a call from where we were working. The call in the demo video is an **illustration of that step, labelled as such**.

### Beyond the brief (what makes it a product)
- **A safety floor that overrides everything.** The owner can say "never close on Fridays", "never close before 22:00 on Fridays", "don't touch 6 Dec", "never change my phone number". These are plain deterministic rules (`src/lib/connect/rules.ts`), not a model: they withhold suggestions (`blocked`, with the rule as the reason), stop autopilot, and stop agent changes even if a photo or voice note asks for them. Rules are set and removed by the owner with a tap.
- **An agent for everything else.** Owners can text, send a **voice note** (ElevenLabs speech-to-text and an "AI voice" reply) or a **photo of a sign** and the agent proposes changes to hours, closures, phone, website, e-mail, description or address. It only proposes, the owner taps, Yext is read back, undo restores. Instructions hidden in photos or messages are data, never commands: the model can only emit a fixed set of validated change types.
- **Issue Radar.** "What should I fix?" returns one list of problems we can really detect for that business: hours waiting, listings that may show a closed business as open, owner rules that held something back, profile fields missing in the live listing, publishers not connected, and what AI assistants say about the business (checked on request and weekly). It also states what is **not** watched yet (photo freshness, review replies, menus).
- **What AI assistants say about you.** Real assistants (Perplexity Sonar, GPT-4o mini with web search) are asked what customers ask; wrong or mixed-up answers are traced to the source that carries them. See *The product around it* below.

## Business impact and pilot

**Why it matters.** In the organiser's data 99.3% of 2,835 businesses have at least one day where Google probably shows the wrong hours (5.9 days on average, about 27 people looking per day, from the cost model). At our 85% precision that is about 160 people per business per season. Extrapolated to Connect's 100,000 customers: **roughly 14 million people shown the wrong hours each season**. This is arithmetic on synthetic data; the pilot exists to replace it with measured numbers.

**The 2025 pilot says the bottleneck is reaching owners, not trusting suggestions.** In the organiser's 2025 pilot log (761 businesses, 3,031 suggestions) 47% of suggestions got no answer, while 88% of those who answered accepted. WhatsApp was answered 65% of the time in a median 0.7 hours; e-mail 40% in 16.7 hours. That is what the escalation ladder is built for.

**Documents** (in `docs/`):
- `FonectaGuard-pilot-and-continuation-plan.pdf`: a 12-week randomised pilot on 1,000 Connect customers (500 per arm), decision gates, metrics with baselines, guardrails, risks, and a 12-month rollout path.
- `FonectaGuard-pitch-deck.pdf`: the 10-slide deck.
- `DEMO_SCRIPT.md`: the demo video script.

**The guardian cadence.** The Worker wakes every 15 minutes (cron `*/15`): critical-alert ladder checks every tick, listing scans hourly to daily by plan, AI-assistant audits weekly. The hours model's suggestions are produced in an offline batch (`ml/`) and loaded into the app.

## Data sources that mattered most (3–5)

| Signal | How we used it | Where Connect would get it in production |
|---|---|---|
| Owner's own exception-hour history: same day last year, two years ago, the 2025 pilot outcomes, how they treat other holidays, how diligent and early they are | The strongest signal by far. Candidate hours come from the owner's own past first (pilot → last year → two years ago); features capture cross-holiday habits ("closed on 4 of the last 5 major holidays") and offsets. | Yext Knowledge Graph `holidayHours` history per entity, and Connect's own approval log |
| Google users' date-specific edits (publisher suggestions) | Strong but sparse: a user suggestion for the exact date is a high-precision candidate and the main trigger for the closed-for-good flag. Wrong user edits exist, so it never acts alone. | Yext Listings › Publisher Suggestions |
| Shopping-centre hours, including last year's | Tenants usually follow the centre: this year's published hours if present, else last year's pattern. | The centres' own websites (published 4–8 weeks before Christmas) |
| Peer benchmarks | Share of similar businesses (same segment, city/country) closed or open on that day: the only help for new customers. | Aggregates over Fonecta's ~100,000 Connect customers |
| Local events and school breaks | Arena nights extend pub hours; school holidays extend play-centre hours (explained in the owner's message). | Helsinki LinkedEvents, municipal school calendars |

Reviews and analytics dips are in the model but weak; the numbers say so below.

## What we tried that didn't work
- **In-sample scoring.** A first 77.8 was measured on rows the model had trained on; we retracted it and report out-of-fold only (63.3).
- **Reviews and analytics as primary triggers.** The planted signal is weak and noisy (misleading reviews are included on purpose); they only matter for the closed-for-good flag. Google-user edits carry far more signal.
- **Pushing past ~64.** Most lost points are days of customers *without* history (≈ 55% state-correct); no feature we tried fixes information that is not in the data. We chose precision and an honest "ask" tier over inflating recall.
- **Photo, phone and address detection can't be validated on this data.** The synthetic dataset only models opening hours, so the agent's other change types (and the Issue Radar's profile checks) are tested for safety and correctness with tests, not for detection accuracy. Outdated images are on the roadmap only; nothing in the product claims to detect them.
- **Running the organiser's downloaded scorer.** We ported its published rules instead of executing downloaded code; use the official `evaluate.py` to confirm.
- **Live public-holiday API in the model.** See the bonus section: it covers only the official holidays and would have cost us the eves and commercial days the model uses.

## Customer with no history / no previous actions

`FI-D0017` Kahvila Kipinä (joined 12 Oct 2026) has no exception history and no previous decisions, so the model can only use peers and the calendar. What the system really does for it (from `predictions_2026.csv` and the seed):

- **25 Dec: suggests "closed"** (confidence 0.91, one tap) because 86% of similar businesses that set hours for the day are closed. That is the only day it commits to.
- **24 Dec and 1 Jan: asks instead of guessing.** The model is unsure, so the owner gets "Which is right? A) 08:00–13:30  B) closed  C) as Google shows now", with the reason "based on the pattern of similar businesses". Silent wrong suggestions are worse than a question.
- **The first answer teaches us.** After the first approve, edit or decline the owner has a history, so next season's suggestions start from them instead of from peers.

Open FI-D0017 in the control room to see exactly this. Honest limit: for new customers about half of the days are decided by peers alone (≈ 55% state-correct), which is where most of our lost score is.

## Final customer messages (as text)

Exact output of `npx tsx scripts/render-messages.ts` (the same renderer sends them; `<token>` is the per-message no-login link). Business *Kahvila Aurora*, owner Aleksi.

**English, SMS**
```
Kahvila Aurora: 2 opening-hours changes to approve
1) Thu 24/12 07:30–13:00 (Google shows now 07:30–18:00)
2) Wed 06/01: 2A 10:00–16:00 / 2B closed / 2C as now
Reply OK to approve 1, or e.g. "1 10-15" / "NO 1".
Details, no login: https://fonectaguard.arcumet.com/d/<token>
```
**English, Telegram** (HTML bold/italic, plus buttons ✅ Approve · ✏️ Edit · ✖️ No thanks, and ✅ Approve all)
```
Hi Aleksi!
We checked the days ahead for Kahvila Aurora and found 2 days where Google probably shows the wrong hours.

1. Thursday 24 December
Google shows now: 07:30–18:00
We suggest: 07:30–13:00
Why: Last year you entered 07:30–13:00 for this day.

2. Wednesday 6 January
Google shows now: 07:30–18:00
Which is right? A) 10:00–16:00  B) closed  C) As Google shows now (07:30–18:00)
Why: We're not sure, so we're asking instead of guessing. Based on the pattern of similar businesses and your own history on other days.

You have the last word: nothing changes until you approve.
```
**Finnish, SMS**
```
Kahvila Aurora: 2 aukioloajan muutosta hyväksyttäväksi
1) to 24.12. 07:30–13:00 (Google näyttää nyt 07:30–18:00)
2) ke 6.1.: 2A 10:00–16:00 / 2B suljettu / 2C ennallaan
Vastaa OK hyväksyäksesi 1, tai esim. "1 10-15" / "EI 1".
Lisätiedot, ei kirjautumista: https://fonectaguard.arcumet.com/d/<token>
```
**Swedish, SMS**
```
Kahvila Aurora: 2 ändringar av öppettider att godkänna
1) tors 24/12 07:30–13:00 (Google visar nu 07:30–18:00)
2) ons 6/1: 2A 10:00–16:00 / 2B stängt / 2C som nu
Svara OK för att godkänna 1, eller t.ex. "1 10-15" / "NEJ 1".
Detaljer, ingen inloggning: https://fonectaguard.arcumet.com/d/<token>
```
**Norwegian, SMS**
```
Kahvila Aurora: 2 endringer i åpningstider til godkjenning
1) tor. 24.12. 07:30–13:00 (Google viser nå 07:30–18:00)
2) ons. 6.1.: 2A 10:00–16:00 / 2B stengt / 2C som nå
Svar OK for å godkjenne 1, eller f.eks. "1 10-15" / "NEI 1".
Detaljer, uten innlogging: https://fonectaguard.arcumet.com/d/<token>
```
**Follow-ups (English)**: approve, edit, decline, keep, undo and autopilot
```
approve: Done! Thursday 24 December: 07:30–13:00 Saved in Connect and verified.
edit: Send the hours you want for this day, for example “10-15” or “closed”.
edit confirmed: Got it: 07:30–14:00. Saving it now.
decline: No problem, we left it as it is and won't suggest this day again.
keep: Thanks, we left it as Google shows it.
undo: Undone: the previous hours are back.
autopilot: Kahvila Aurora: As agreed, we updated 1 day for you:
A1) Thu 24/12 closed
Reply "UNDO A1" to undo.
https://fonectaguard.arcumet.com/d/<token>
```
**Follow-ups (Finnish)**
```
approve: Valmis! torstai 24. joulukuuta: 07:30–13:00 Tallennettu Connectiin ja tarkistettu.
edit: Kirjoita haluamasi aukioloaika tälle päivälle, esimerkiksi “10-15” tai “suljettu”.
edit confirmed: Selvä: 07:30–14:00. Tallennetaan.
decline: Selvä, jätimme sen ennalleen emmekä ehdota tätä päivää uudelleen.
keep: Kiitos, jätimme sen niin kuin Google sen näyttää.
undo: Kumottu: aiemmat aukioloajat ovat takaisin.
autopilot: Kahvila Aurora: Sovitusti päivitimme 1 päivän:
A1) to 24.12. suljettu
Vastaa "KUMOA A1" kumotaksesi.
https://fonectaguard.arcumet.com/d/<token>
```
Swedish and Norwegian follow-ups, e-mail (subject, HTML and text) and push text are produced by the same renderer.

## Bonus: live source

Two live sources are in the loop; one comparison is reported as a finding.
- **Yext sandbox (replaces the mock entity/hours store for the write path).** Entity `SinceAI16` mirrors the business being demoed. Writes go through the real Knowledge API (`holidayHours`, `hours`, phone, website, address, description), are read back to verify, and undo restores the exact previous entry. Learning: the sandbox has no exception history, so detection must run on the mock history and only the write path is live. A write replaces the whole `holidayHours` array, so we read-merge-write; two writers racing can drop each other's entries.
- **OpenStreetMap (Nominatim) and Finnish Trade Register (PRH open data)** are read live for the public check (is the business listed, are hours/phone present and right, who is the registered company).
- **Nager.Date public holidays vs `calendar_special_days.csv` (2026).** FI: all 15 official holidays match exactly. SE: Nager adds 19 Jun, 24 Dec and 31 Dec as holidays (they are customary, not statutory); NO: adds 24 Dec. The dataset additionally has 12 (FI), 16 (SE) and 11 (NO) non-official days (eves, Mother's/Father's Day, Lucia, commercial days) that no public-holiday API lists. We did not swap Nager into the model: those eves and commercial days are exactly where the hours change, so a holiday-only calendar would have lost them.

## Third-party code, data and licences

| Component | Licence |
|---|---|
| Next.js, React, react-dom, Zod, Recharts, clsx, ulid, @opennextjs/cloudflare, better-sqlite3, Tailwind CSS, PostCSS, Autoprefixer, Vitest | MIT |
| Drizzle ORM, TypeScript | Apache-2.0 |
| lucide-react | ISC |
| Wrangler, Cloudflare Workers types | MIT OR Apache-2.0 |
| LightGBM | MIT |
| pandas, NumPy, scikit-learn, SciPy | BSD-3-Clause |
| PyArrow | Apache-2.0 |
| Organiser dataset (`challenge/data`) | Per `challenge/DATA_LICENSE.md`; synthetic; not redistributed |
| OpenStreetMap data (Nominatim) | ODbL (© OpenStreetMap contributors) |
| PRH open data (Finnish Trade Register) | CC BY 4.0 |
| Nager.Date API (comparison only) | MIT |
| Services called over HTTP, not bundled: Yext Knowledge API (sandbox), OpenRouter (Perplexity Sonar, GPT-4o mini), TinyFish, ElevenLabs, Telegram Bot API, Resend, Twilio | Their terms of service |

No GPL or AGPL components.

## The product around it: AI-assistant audit

FonectaGuard also checks what AI assistants tell customers about a business and traces wrong answers to the source that carries them (the original product, public and free at the live URL).

### What it does

1. **AI search check (public, free, read-only).** Paste a business website. The site is read (JSON-LD, or the rendered page and its contact page via TinyFish, read by AI with Zod-validated output). Real AI assistants (Perplexity Sonar, GPT-4o mini with and without live web search, via OpenRouter) are asked what customers ask. Every stated fact is compared by deterministic rules with what the site says. The result is a shareable report.
2. **Honest scoring.** Only facts an assistant actually stated are judged. Omissions are never "wrong". Answers about a *different* business with a similar name (another city, another country) are reported as "mixed up with another business", not scored as your errors. Times without days, and same-site links on a different page, are not flagged.
3. **Trace to the source.** Each wrong fact is traced: which monitored listings carry the same wrong value, which are correct (e.g. "Google is right, so the AI is using something else"), which pages the assistant cited, and, if nothing explains it, pages found by live web search. Sources are named with a correction path (Fonecta/Finder → Fonecta Connect).
4. **Open public data, no approval needed.** Every check also reads **OpenStreetMap** (via Nominatim: is the business listed, and are hours/phone/website present and right?) and the **Finnish Trade Register** (PRH open data: the registered company behind the business and its official address). Owner workspaces monitor the OpenStreetMap entry like any other listing, and any website, on any CMS, gets a ready-to-paste, owner-confirmed JSON-LD block in Settings.
5. **Fix with approval, then verify.** For the owner's website the fix is a real GitHub Pages commit: the proposal is revalidated, committed, the live page is polled until it shows the change, then re-read. For directories without a write API (Google, Meta, Apple, Bing, Yelp, Fonecta, Finder) the proposal is a guided manual submission, closed only when a re-read shows the published value matches.
6. **Keep it right.** Verified businesses get scheduled scans and a weekly AI audit; wrong answers notify the owner.

### Evidence: a real sample

We ran the check on **37 real Helsinki cafés and restaurants** (own websites, picked by search, not random; 3 more were skipped because their sites publish no contact details). Each was checked once with Perplexity Sonar and GPT-4o mini with web search, against what its own site publishes.

- **51%** had at least one AI answer that disagreed with the business's own website.
- **24%** (9 of 37) were clear-cut errors we verified by hand: the site plainly publishes the fact and an assistant said something else (a Saturday opening hour an hour early, "closed on Mondays" for a café that is open, wrong phone or address).
- **78%** had at least one answer describing a *different* business with a similar name.
- **Hours** were 27 of the 31 wrong facts. The rest of the disagreements are mostly sites that publish only lunch hours or several locations, where no single answer is clearly right, which is itself a finding.

Reproduce with `scripts/sample-study.ts`. Limits: small, non-random sample; one run each; answers vary between runs; the reference is each site's own published data.

### Trust model

- Facts read from a public site are **unconfirmed references** (`website_unverified`). The owner must confirm or correct them in Settings before any correction can be approved against them.
- Approvals also require domain ownership (DNS TXT / meta tag / well-known file, or write access to the Pages repo).
- AI output is never trusted: page text and answers are treated as data, extraction is schema-validated, comparison is deterministic, and nothing external changes without an explicit Approve.
- The public endpoint is rate-limited (4 checks/hour per client, 300/day globally), accepts only public http(s) hostnames, and never replaces an existing session.

### What is real, and what is not

Real: TinyFish search + fetch, OpenRouter models, the AI answers, GitHub Pages commits and re-reads, D1/Queues/cron on Cloudflare Workers. There is no simulated data or simulated assistant in the product.

Limits, stated plainly:
- Answers come from the underlying models via OpenRouter, not the consumer ChatGPT/Gemini apps, and can vary between runs.
- No write API is open to us for Google/Apple/Bing/Yelp/Fonecta (partner approval needed). Next without waiting on anyone: OpenStreetMap writes (register an OAuth2 app, minutes) and Facebook Pages (Meta app in development mode for your own Page, no review). Those use the guided manual path above; direct writes would need partnerships (Fonecta Connect is the natural channel).
- A brand-new page is not instantly known to AI engines, so "AI repeats my stale page" is shown on businesses the engines already know; fixing a source can take time to be reflected by engines that cache.
- Not built: Google/Meta OAuth, R2 evidence storage, Cloudflare Workflows (repairs run inline), email notifications.

### Why this fits Fonecta

Fonecta already distributes business data (Fonecta, Finder, Connect). FonectaGuard measures the outcome that matters, what customers are actually told, and points to the fix. The public check is a lead-gen tool; the monitored plan is the product.

### Real test fixture

`https://garinmckayl.github.io/aurora-coffee-demo/` is a real, live GitHub Pages site for an example business. The Connections page can connect its repo (`Garinmckayl/aurora-coffee-demo`) and make a deliberate, real error (a commit), to exercise detect → approve → commit → verify on a real page.

### Architecture

Next.js 15 on Cloudflare Workers (OpenNext), D1 (Drizzle), Queues (one job per assistant, so each gets its own subrequest budget), cron. `src/lib/`: `normalize` · `compare` · `identity` · `health` · `extract` · `scan` · `repair` · `connectors` · `github` · `ai` · `ai-audit` · `ai-sources` (source tracing) · `public-check` · `canonical` · `schema`. Dev tools: `scripts/batch-check.ts` (run the check on real sites locally), `scripts/read-site.ts`.

### Run / deploy

```bash
npm install
npm test                      # 41 tests; in-memory sqlite stands in for D1, external APIs stubbed
npm run dev
# deploy (needs CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID)
npx wrangler d1 migrations apply fonectaguard --remote
npx opennextjs-cloudflare build && npx wrangler deploy
```

Worker secrets: `AUTH_SECRET`, `CRON_SECRET`, `OPENROUTER_API_KEY`, `TINYFISH_API_KEY`, `GITHUB_PAGES_TOKEN` (fine-grained PAT, Contents read/write on the site repo). Optional: `AI_AUDIT_MODELS` (comma-separated OpenRouter ids).
