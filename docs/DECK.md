# Deck outline (6 slides)

1. **The problem.** Small-business hours go stale around holidays; customers see wrong hours on Google and AI assistants. Connect has about 100,000 customers; owners are busy and don't log in.
2. **The loop (one diagram).** Detect (model) → Suggest (reason + confidence + tier) → Contact (Telegram / SMS / e-mail, own language) → Decide (no login; approve / edit / ask / decline) → Apply to Yext and confirm (read-back, where it shows, undo). Floor underneath: owner rules in plain code override everything.
3. **Architecture: System One for decisions, rules for the floor, LLM only to talk.** A calibrated model (state in, typed decision and confidence out) picks the tier; deterministic owner rules and validators can veto; the LLM only reads photos, voice and free text and may only emit fixed, validated change types.
4. **Honest results.** 63.3 out-of-fold vs 54.5 baseline; 2025 back-test about 60.3; precision about 0.85, recall about 0.70; with history about 95% of days correct, without about 55%. What didn't work (in-sample 77.8 retracted).
5. **Not just hours.** Issue Radar, agent (voice, photo, ask anything), what AI assistants say about you, and what we don't watch yet. Pitch: "Fonecta's proactive layer: we watch hours, listings and what AI says about you, and fix it with your approval or on autopilot if you set it."
6. **Why it can ship.** Real Yext write and read-back, undo, opt-outs, rules, tiers; extensible detectors behind one radar; next step: pilot on real Connect history.
