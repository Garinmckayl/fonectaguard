# FonectaGuard architecture (one page)

The loop is **detect → suggest → contact → owner decides → write to Yext, read back, offer undo**. Nothing is written to the listing source without an owner decision, except for owners with standing permission and a model confidence of at least 0.95 (`src/lib/connect/service.ts`, `autoApplyStanding`). Those changes are applied at once, the owner is told, and undo is offered.

## 1. The guardian loop

```mermaid
flowchart TD
    SIG["Signals: Google edits, last year's hours,<br/>mall and peer hours, events, school breaks, reviews<br/>(ml/predict.py reasons, ml/train.py features)"] --> MODEL["Offline model (LightGBM)<br/>3-class: no change / closed / open-different<br/>plus hours regressors, ml/train.py"]
    MODEL --> DEC["decide(): SUGGEST / FLAG / ask-only<br/>thresholds TC=0.65, TO=0.25, TR=0.75"]
    DEC --> TIER{"Tier by confidence<br/>ml/predict.py tier_of"}
    TIER -- ">= 0.95 auto" --> RULES
    TIER -- ">= 0.80 one_tap" --> RULES
    TIER -- "< 0.80 ask (options + keep as Google shows)" --> RULES
    TIER -- "FLAG (closed for good)" --> HUMAN["Goes to a person at Connect,<br/>not to the owner"]
    RULES["Owner-rules floor: enforceRules()<br/>blocked suggestions are withheld"] --> CRON
    CRON["Cron every 15 min: runDueAlerts()<br/>days within the horizon, up to 20 businesses per run"] --> LADDER["runLadder(): score = confidence x urgency<br/>critical at >= 0.5, one step per business per run"]
    LADDER --> CONTACT["Contact: sendNow(), one bundled message<br/>Telegram / SMS / WhatsApp / email, max 4 days per message"]
    LADDER -. "not answered after 3-4 h" .-> ESC["Nudge, then voice note, then phone call<br/>(quiet hours, 1 call per 24 h)"]
    ESC -. "reminders" .-> CONTACT
    CONTACT --> OWNER{"Owner decides, no login<br/>decide() in service.ts"}
    OWNER -- "approve / edit / choose option" --> APPLY
    OWNER -- "decline" --> MEM["Memory: declined days are not re-sent"]
    OWNER -- "keep as Google shows" --> MEM
    AUTO["Standing permission and conf >= 0.95:<br/>autoApplyStanding()"] --> APPLY
    APPLY["applySuggestion(): re-check rules,<br/>validate plan, ensureMirror()"] --> WRITE["Yext PUT: setHolidayPlan()<br/>reads current hours, writes whole hours object"]
    WRITE --> READ{"Read-back:<br/>holidayPlan(after) equals plan?"}
    READ -- "yes" --> DONE["status applied / auto_applied,<br/>previous entry saved as undoJson"]
    READ -- "no / error" --> FAIL["status failed, event logged"]
    DONE --> UNDO["Undo within 24 h:<br/>undoSuggestion() restores the previous entry"]
    DONE --> MEM
```

Owner free text, photos and voice take a second path into the same floor and the same write step. `handleOwnerInput()` in `src/lib/connect/agent.ts` proposes typed changes, `validateChange()` and `changeViolation()` check them, and `applyChange()` re-checks the rules at apply time, writes, and stores undo data.

## 2. Box to file

| Box | Implemented in |
|---|---|
| Signals, features, model training (out-of-fold, `GroupKFold(5)`) | `ml/train.py` |
| Final fit, SUGGEST/FLAG/ask decisions, tiers, reasons, cost estimate; writes `suggestions_2026.json` | `ml/predict.py` |
| Seed export of that JSON into the app | `ml/export_seed.py` (referenced; not read in detail) |
| Owner-rules floor (types, `planViolation`, `changeViolation`, load/add/remove) | `src/lib/connect/rules.ts` |
| Floor applied to outgoing suggestions and auto-applies | `enforceRules()` in `src/lib/connect/service.ts` |
| 15-minute cron | `wrangler.jsonc` (`"crons": ["*/15 * * * *"]`) and `scheduled()` in `worker.ts` |
| Criticality score, escalation ladder, `runDueAlerts` | `src/lib/connect/critical.ts` |
| Contact (bundle, channels, opt-out check, auto-apply notice) | `src/lib/connect/deliver.ts` (`sendNow`), `createMessage` in `service.ts` |
| WhatsApp channel (Vonage Messages API, demo number only) | `src/lib/connect/whatsapp.ts` |
| Owner decision buttons, edit text, undo, voice/photo entry (Telegram) | `src/lib/connect/telegram-bot.ts`, `decide()` in `service.ts` |
| Free-text / voice / photo agent (Gemini for photos, default model fallback) | `src/lib/connect/agent.ts` |
| Yext reads and writes, mirror, restore helpers | `src/lib/connect/yext.ts` |
| Write, read-back verification, undo window (24 h) | `applySuggestion`, `undoSuggestion` in `service.ts` |
| Issue Radar (what needs attention, plus its own "not watched yet") | `src/lib/connect/radar.ts` |

## 3. What is not covered

- **The model is offline.** `ml/predict.py` is a batch job that writes JSON and CSV. The 15-minute cron only drives contact and escalation. It does not retrain or re-predict (`worker.ts`, `ml/predict.py`).
- **Special-day hours only.** The model decides opening hours for special days. README says photo, phone and address detection cannot be validated on this data (README, "What we tried that didn't work"). Those agent change types are covered by tests for safety, not for detection accuracy.
- **Not watched yet:** photo freshness and quality, review replies, menu and price changes (`coverage.notYet` in `src/lib/connect/radar.ts`). README also says outdated images are on the roadmap only.
- **Closed-for-good days are not auto-handled.** A `FLAG` is surfaced to a person at Connect and never changed automatically (`radar.ts`, `ml/train.py` `decide`).
- **Demo-only delivery.** SMS, WhatsApp, email and calls go only to `DEMO_PHONE` / `DEMO_EMAIL`. Calls never go to numbers in the data (`deliver.ts`, `whatsapp.ts`, `critical.ts` `doCall`). Real per-owner contact on those channels is not wired. Telegram uses the owner's linked chat.
- **Telephony is optional.** With no 46elks/Twilio account or demo number, the call step is skipped (`critical.ts`).
- **Yext sandbox, one shared entity.** `YEXT_BASE_URL` defaults to `sbx-api.yextapis.com`, and `mirrorBusiness` rewrites one entity to look like each demo business (`yext.ts`, `service.ts` `ensureMirror`). Production multi-entity mapping is not implemented. The read-back checks Yext's response, not what each publisher (Google etc.) has actually published.
- **Undo is time-limited** to 24 h for hour suggestions (`UNDO_WINDOW_MS` in `service.ts`).
- **Weak spot in accuracy.** For new customers about half of the days are decided by peers alone (about 55% state-correct), which is where most lost score comes from (README). Auto tier is 94.5% exact out-of-fold, so below 0.95 the app always asks (`service.ts`).
- **Scorer is a port.** The organiser's scorer was not run. Its published rules were ported (README).
