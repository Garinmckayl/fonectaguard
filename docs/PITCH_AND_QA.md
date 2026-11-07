# In-room pitch (90 seconds) and the hard questions

Have ready: phone with WhatsApp and Telegram open on the demo chat, laptop on `fonectaguard.arcumet.com/try`, the judge card (QR codes) printed or on a second screen. Hand the judge the phone or the laptop for the approval: let them tap.

## 90 seconds, spoken

**0:00 The loss.** "Christmas Eve last year, 46 people checked Google for Kahvila Aurora. It said open until six. Aleksi had closed at one. Forty-six people at a locked door, and he never knew."

**0:12 The turn.** "Aleksi isn't careless. He runs a café. He doesn't log into anything. He answers WhatsApp. So we go to him."

**0:20 The demo (hand over the phone).** "This is what he gets: the day, what Google shows, what we suggest, the reason in plain words, and what a wrong hour costs. He replies OK." *(Judge replies OK, or taps Approve on `/try`.)* "That is written to Yext, read back to prove it landed, and he is told where it shows and how fast. One word. No login."

**0:45 The guardian.** "It's a guardian, not a detector. It wakes every fifteen minutes. If he doesn't answer: a reminder, a voice note, and for critical days a call where he presses one. His own rules always win: 'never close on Fridays' is code, not a model. And it's a real agent: he can send a photo of the sign on his door, or just ask what's wrong."

**1:05 The proof.** "Scored honestly on data the model never saw: 63.3 against a 54.5 baseline. And in the 2025 pilot, 47% of owners never answered. That is the gap. WhatsApp was answered 65% of the time in under an hour; e-mail 40% in seventeen."

**1:20 The ask.** "In the organiser's data nearly every business has days like this: roughly fourteen million people a season across Connect's hundred thousand customers. Connect shouldn't wait for owners to log in. It should go to them. Scan the card and approve a change yourself."

## The hard questions

**1. "Did the call really ring a real phone?"**
"The call step is built and covered by automated tests against the providers' APIs, with real ElevenLabs speech and a real keypress path to Yext. In the video the call screen is animated. It goes live the moment a telephony number is attached; we can show the voice note and the WhatsApp and Telegram loops live right now." *(If a live call has been recorded since, say so instead.)*

**2. "What is real and what is synthetic?"**
"Real: the Yext sandbox write and read-back, WhatsApp and Telegram, e-mail, voice notes, the agent, the rules, the escalation policy, the 15-minute cron. Synthetic: the organiser's dataset, so every business, history and number. The 14 million is an extrapolation from it, and the pilot plan exists to replace it with measured numbers."

**3. "How is the 63.3 computed? Could it be inflated?"**
"Out of fold: every business is scored by a model that never saw it, using a port of the published scoring rules. An earlier in-sample figure of 77.8 leaked training labels and we retracted it. Our 2025 back-test is about 60.3, so expect the hidden test to land near 60."

**4. "How does it learn?"**
"Per owner and per day: approvals, edits and declines are remembered, an edit's closing-time shift is applied to sibling days, and a decline means we never suggest that day again. Each season the model is retrained on realised outcomes."

**5. "What about a new customer with no history?"**
"FI-D0017 is the case: we suggest only where peers agree (86% closed on Christmas Day), and everything uncertain becomes a question with the likeliest option and 'keep what Google shows', not a guess. The first answer then creates history."

**6. "Isn't this just a cron job?"**
"The cron is how it never sleeps. What it does with each tick is the product: a calibrated model, a score of confidence times urgency, an escalation ladder, an agent that takes photos and voice, a rules floor that overrides everything, and a verified write. And the same radar covers listings, AI-assistant answers and profile gaps, not only hours."

**7. "Why would Fonecta pay for this?"**
"Wrong hours cost their customers walk-ins and nobody tells the owner. This turns Connect from a place owners update into one that updates them, and it opens a proactive tier beyond hours. The pilot plan is a 12-week randomised test on 1,000 customers with decision gates."

## Rules for the room
- Show, then explain. Put the phone in the judge's hand within 20 seconds.
- Say "built and tested" for the call. Never say it rang if it didn't.
- If a channel fails, switch at once to `/try`, the control room, or the video. All three are independent.
