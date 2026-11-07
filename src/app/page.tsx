import Link from "next/link";
import { Check, X, ArrowUpRight, ShieldCheck, ScanSearch, GitBranch, Stamp, Building2, Fingerprint, Radar, Mic } from "lucide-react";
import { getSession } from "@/lib/auth";
import { CheckForm } from "@/components/check-form";
import { LogoMark, Wordmark } from "@/components/logo";

const LOOP = [
  ["01", "Detect", "A model reads the owner's own history, similar businesses, the shopping centre, Google users' edits and local events, and finds days where the listing is probably wrong."],
  ["02", "Suggest", "One concrete answer per day, with the reason in plain words, a confidence, and what a wrong hour costs. Unsure days become a question, never a guess."],
  ["03", "Contact", "One short message in the owner's language on their channel: Telegram, SMS or e-mail. No app, no login."],
  ["04", "Decide", "Approve, edit (“10–15”, or by voice), pick an option or say no. Edits teach the system; a no is remembered."],
  ["05", "Apply", "Written to Yext, read back to prove it landed, and the owner is told where it shows and how fast. Undo for 24 hours."],
] as const;

const BOT = "https://t.me/fonguardbot";

export default async function Landing() {
  const s = await getSession();
  return (
    <div id="top" className="overflow-x-hidden">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
        <Link href="/" className="flex items-center gap-2.5"><LogoMark /><Wordmark /></Link>
        <nav className="flex items-center gap-2 text-sm font-semibold" aria-label="Main">
          <a href="#how" className="hidden rounded-lg px-3 py-2 text-ink hover:bg-hi sm:block">How it works</a>
          <a href="#floor" className="hidden rounded-lg px-3 py-2 text-ink hover:bg-hi sm:block">Your rules</a>
          <a href="#ai-check" className="hidden rounded-lg px-3 py-2 text-ink hover:bg-hi sm:block">AI check</a>
          <a href="#trust" className="hidden rounded-lg px-3 py-2 text-ink hover:bg-hi sm:block">Trust</a>
          <Link href={s ? "/dashboard" : "/login"} className="btn btn-ghost">{s ? "Dashboard" : "Sign in"}</Link>
        </nav>
      </header>

      <main>
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-5 pb-16 pt-10 lg:grid-cols-[1.1fr_1fr]">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border-[1.5px] border-ink bg-hi px-3 py-1 font-mono text-xs font-bold uppercase tracking-wider text-ink"><span className="pulse-dot h-2 w-2 rounded-full bg-brand" /> Connect suggests · the customer approves</p>
            <h1 className="mt-6 font-display text-5xl font-extrabold leading-[1.02] tracking-tight text-ink sm:text-7xl">Your business info, kept right. <span className="hl">You just say yes.</span></h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-slate-600">Fonecta&apos;s proactive layer: we watch your opening hours, your listings and what AI assistants say about you, and fix what is wrong with your approval, or on autopilot if you set it. Nothing changes without your say, and you can undo it.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a href={BOT} target="_blank" rel="noreferrer" className="btn btn-primary h-12 px-6 text-base">Try it in Telegram <ArrowUpRight className="h-4 w-4" /></a>
              <a href="#ai-check" className="btn btn-ghost h-12 px-6 text-base">Check what AI says about a business</a>
            </div>
          </div>

          {/* The real message the system sends (exact output of the renderer, see README) */}
          <figure className="relative lg:-rotate-1" aria-label="A real message to a business owner">
            <div className="card-pop !p-0 overflow-hidden">
              <div className="flex items-center justify-between border-b-[1.5px] border-ink bg-slate-100 px-4 py-2.5 font-mono text-xs font-bold uppercase tracking-wide text-ink"><span>Telegram · to Aleksi, Kahvila Aurora</span><span className="rounded border border-ink bg-white px-1.5 py-0.5">real message</span></div>
              <div className="space-y-3 p-5 text-[15px] leading-relaxed text-ink">
                <p className="font-bold">Hi Aleksi!</p>
                <p className="text-slate-600">We checked the days ahead for Kahvila Aurora and found 2 days where Google probably shows the wrong hours.</p>
                <div className="rounded-xl bg-slate-50 px-4 py-3">
                  <p className="font-bold">1. Thursday 24 December</p>
                  <p className="text-sm text-slate-600">Google shows now: 07:30–18:00</p>
                  <p className="font-bold">We suggest: <span className="hl">07:30–13:00</span></p>
                  <p className="text-sm italic text-slate-600">Why: Last year you entered 07:30–13:00 for this day.</p>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center text-sm font-semibold"><span className="rounded-lg border-[1.5px] border-ink bg-[#D5F3E3] py-2">✅ Approve</span><span className="rounded-lg border-[1.5px] border-ink bg-white py-2">✏️ Edit</span><span className="rounded-lg border-[1.5px] border-ink bg-white py-2">✖️ No thanks</span></div>
                <p className="text-xs text-slate-500">You have the last word: nothing changes until you approve.</p>
              </div>
            </div>
            <span className="stamp absolute -right-2 -top-5 rotate-6 bg-panel text-[#0A4630]">No login</span>
            <figcaption className="mt-4 text-center text-xs text-slate-500">Sent in the owner&apos;s language (Finnish, Swedish, Norwegian or English) by Telegram, SMS or e-mail.</figcaption>
          </figure>
        </section>

        <section className="border-y-[1.5px] border-ink bg-ink py-4 text-paper" aria-label="Facts">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-10 gap-y-2 px-5 font-mono text-xs font-bold uppercase tracking-widest">
            {["Written to Yext and read back", "Telegram · SMS · E-mail", "Fi · Sv · No · En", "Undo for 24 h", "Owner rules override everything"].map((x) => <span key={x} className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-brand" />{x}</span>)}
          </div>
        </section>

        <section id="how" className="mx-auto max-w-6xl px-5 py-24">
          <h2 className="max-w-3xl font-display text-4xl font-extrabold tracking-tight text-ink sm:text-5xl">Detect. Suggest. Contact. <span className="hl">Decide.</span> Apply.</h2>
          <ol className="mt-12 grid gap-4 md:grid-cols-5">
            {LOOP.map(([n, t, d]) => (
              <li key={n} className="card relative !p-5 transition hover:-translate-y-1 hover:shadow-pop-sm">
                <span className="font-mono text-sm font-bold text-brand-deep">{n}</span>
                <h3 className="mt-3 font-display text-2xl font-bold text-ink">{t}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{d}</p>
              </li>
            ))}
          </ol>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {[["63.3", "out-of-fold score on the dev labels, against 54.5 for the baseline", "!bg-hi"], ["≈ 0.85", "precision when it suggests a change (recall about 0.70)", "!bg-brand-soft"], ["≈ 55%", "of days right for customers with no history, about 95% with history. We say so.", "!bg-[#FFD3CC]"]].map(([n, t, bg]) => (
              <div key={n} className={`card-pop !p-6 ${bg}`}><p className="font-display text-5xl font-extrabold text-ink">{n}</p><p className="mt-2 text-sm font-medium leading-snug text-ink">{t}</p></div>
            ))}
          </div>
          <p className="mt-4 max-w-3xl text-xs leading-relaxed text-slate-500">Measured out-of-fold (every business scored by a model that never saw it) with a port of the published scorer. An earlier in-sample figure leaked training labels and was retracted. Unsure days become a question to the owner instead of a guess.</p>
        </section>

        <section id="floor" className="border-y-[1.5px] border-ink bg-hi/60 py-20">
          <div className="mx-auto grid max-w-6xl gap-10 px-5 lg:grid-cols-2">
            <div>
              <ShieldCheck className="h-10 w-10 text-ink" />
              <h2 className="mt-4 font-display text-4xl font-extrabold tracking-tight text-ink">Your rules always win</h2>
              <p className="mt-4 max-w-md text-slate-700">Say “never close on Fridays”, “never close before 22:00 on Fridays”, “don&apos;t touch 6 December” or “never change my phone number”. These are plain rules in code, not a model: no suggestion, photo, voice note or autopilot run can get past them.</p>
              <div className="mt-6 max-w-md rounded-xl border-[1.5px] border-ink bg-white p-4 text-sm"><p className="text-slate-600">“Close next Friday”</p><p className="mt-2 flex items-start gap-2 font-medium text-[#7A140C]"><X className="mt-0.5 h-4 w-4 shrink-0" /> Blocked by your rule: “Never closed on Fridays”. Remove the rule first if you want this.</p></div>
            </div>
            <div className="space-y-4">
              <article className="card-pop !p-6"><span className="inline-flex h-11 w-11 items-center justify-center rounded-xl border-[1.5px] border-ink bg-[#DCEBFF]"><Radar className="h-5 w-5 text-ink" /></span><h3 className="mt-4 font-display text-2xl font-bold text-ink">One radar for what is wrong</h3><p className="mt-2 leading-relaxed text-slate-600">Ask “what should I fix?”: hours waiting for you, listings that may show a closed business as open, missing details in your profile, directories that are not connected, and what AI assistants say about you. It also lists what we do not watch yet: photos, review replies and menus.</p></article>
              <article className="card-pop !p-6"><span className="inline-flex h-11 w-11 items-center justify-center rounded-xl border-[1.5px] border-ink bg-[#D5F3E3]"><Mic className="h-5 w-5 text-ink" /></span><h3 className="mt-4 font-display text-2xl font-bold text-ink">Talk to it, or show it</h3><p className="mt-2 leading-relaxed text-slate-600">Type, send a voice note, or photograph a sign on the door. The assistant proposes the change; you tap to apply. Instructions hidden in a photo are treated as data, never as commands.</p></article>
            </div>
          </div>
        </section>

        <section id="ai-check" className="mx-auto grid max-w-6xl items-center gap-12 px-5 pb-10 pt-24 lg:grid-cols-[1.1fr_1fr]">
          <div>
            <p className="font-mono text-xs font-bold uppercase tracking-widest text-brand-deep">Also watching: what AI assistants say</p>
            <h2 className="mt-3 font-display text-4xl font-extrabold tracking-tight text-ink sm:text-5xl">What is AI <span className="hl">telling</span> your customers?</h2>
            <p className="mt-4 max-w-xl text-lg leading-relaxed text-slate-600">Customers ask AI assistants for your hours, phone and address, and can be told something wrong even when your Google listing is right. Paste any business website: we ask real assistants, compare their answers with what the business publishes, and name the source behind each error. Free, no signup.</p>
            <CheckForm className="mt-8 max-w-xl" />
          </div>
          {/* A real captured finding, not an illustration */}
          <figure className="relative lg:-rotate-1" aria-label="A real captured AI answer">
            <div className="card-pop !p-0 overflow-hidden">
              <div className="flex items-center justify-between border-b-[1.5px] border-ink bg-slate-100 px-4 py-2.5 font-mono text-xs font-bold uppercase tracking-wide text-ink"><span>GPT-4o mini + web search</span><span className="rounded border border-ink bg-white px-1.5 py-0.5">real answer</span></div>
              <div className="space-y-4 p-5">
                <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">“What are the opening hours of <b className="text-ink">Aurora Coffee Roasters</b> in Helsinki?”</p>
                <p className="text-[15px] leading-relaxed text-ink">Aurora Coffee Roasters in Helsinki is open <span className="hl-red font-semibold">from 11:00 AM to 8:00 PM on Sunday, Monday, Tuesday and Wednesday</span>. It is <span className="hl-red font-semibold">closed on Thursdays</span>…</p>
                <div className="grid gap-2 text-sm">
                  <p className="flex items-start gap-2 rounded-lg border-[1.5px] border-[#9B1C12] bg-[#FFD3CC] px-3 py-2 font-medium text-[#7A140C]"><X className="mt-0.5 h-4 w-4 shrink-0" /> Not this business: the hours of a roaster in Japan.</p>
                  <p className="flex items-start gap-2 rounded-lg border-[1.5px] border-[#0A5C3B] bg-[#D5F3E3] px-3 py-2 font-medium text-[#0A4630]"><Check className="mt-0.5 h-4 w-4 shrink-0" /> The business&apos;s own website says Mon–Fri 08:00–17:00, Sat 09:00–16:00.</p>
                </div>
              </div>
            </div>
            <span className="stamp absolute -right-2 -top-5 rotate-6 bg-panel text-[#9B1C12]">Caught</span>
            <figcaption className="mt-4 text-center text-xs text-slate-500">Captured from a real run on our example business.</figcaption>
          </figure>
        </section>

        <section className="mx-auto max-w-6xl px-5 pt-20" aria-label="What we found">
          <p className="font-mono text-xs font-bold uppercase tracking-widest text-brand-deep">Real sample · Helsinki cafés and restaurants</p>
          <h2 className="mt-3 max-w-3xl font-display text-4xl font-extrabold tracking-tight text-ink sm:text-5xl">We asked real AI assistants about <span className="hl">37 real businesses</span>.</h2>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {[["51%", "had at least one AI answer that disagreed with the business's own website", "!bg-hi"], ["24%", "were clear-cut errors we checked by hand: wrong hours, phone or address", "!bg-[#FFD3CC]"], ["78%", "had answers describing a different business with a similar name", "!bg-brand-soft"]].map(([n, t, bg]) => (
              <div key={n} className={`card-pop !p-6 ${bg}`}><p className="font-display text-6xl font-extrabold text-ink">{n}</p><p className="mt-2 text-sm font-medium leading-snug text-ink">{t}</p></div>
            ))}
          </div>
          <p className="mt-5 max-w-3xl text-xs leading-relaxed text-slate-500">Method: 37 Helsinki businesses with their own websites, picked by search (not random). Each was checked once with Perplexity Sonar and GPT-4o mini (with web search), compared with what its own site publishes. The 24% are the cases we reviewed individually where the site plainly publishes the fact; most other disagreements are sites that list only lunch hours or several locations, so no single answer is clearly right. Hours were the most common problem (27 of 31 wrong facts).</p>
        </section>

        <section className="mx-auto max-w-6xl px-5 pb-24">
          <h2 className="font-display text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">What the AI check catches</h2>
          <div className="mt-8 grid gap-4 md:grid-cols-2">
            {[
              [ScanSearch, "Wrong facts", "An assistant says Saturday opens at 16:00; the restaurant's own site says 17:00. Hours, phone, address and website are each judged, and only when the assistant actually stated them.", "bg-hi"],
              [Fingerprint, "Mix-ups with look-alikes", "Answers about a roaster in Japan or a café in another city are called out as 'a different business', never blamed on yours.", "bg-brand-soft"],
              [GitBranch, "The source behind the error", "Which listing repeats the wrong value, which are correct, which cited page is stale, and where to correct it, including Fonecta and Finder through Fonecta Connect.", "bg-[#DCEBFF]"],
              [Stamp, "Fixes you can trust", "A real commit to your site, a wait for it to go live, and a re-read to prove it. Directories without a write API get exact values and a link, then a verify step.", "bg-[#D5F3E3]"],
            ].map(([Icon, t, d, bg]) => {
              const I = Icon as typeof ScanSearch;
              return (
                <article key={t as string} className="card-pop !p-6 transition hover:-translate-y-1">
                  <span className={`inline-flex h-11 w-11 items-center justify-center rounded-xl border-[1.5px] border-ink ${bg as string}`}><I className="h-5 w-5 text-ink" /></span>
                  <h3 className="mt-4 font-display text-2xl font-bold text-ink">{t as string}</h3>
                  <p className="mt-2 leading-relaxed text-slate-600">{d as string}</p>
                </article>
              );
            })}
          </div>
        </section>

        <section id="trust" className="border-y-[1.5px] border-ink bg-hi/60 py-20">
          <div className="mx-auto grid max-w-6xl gap-10 px-5 lg:grid-cols-[1fr_1.2fr]">
            <div>
              <ShieldCheck className="h-10 w-10 text-ink" />
              <h2 className="mt-4 font-display text-4xl font-extrabold tracking-tight text-ink">Built so you can trust it with your name</h2>
              <p className="mt-4 max-w-md text-slate-700">An auditor that guesses is worse than none. Every rule below is enforced in code and covered by tests.</p>
            </div>
            <ul className="grid gap-3 sm:grid-cols-2">
              {[
                ["Nothing changes without Approve", "Every external write is an explicit owner action, except autopilot for owners who gave standing permission, and that can be undone."],
                ["Owner rules are code", "Limits you set are checked in plain code and cannot be overridden by a model."],
                ["Facts must be confirmed", "Details read from a website stay unconfirmed until the owner checks them."],
                ["Honest scoring", "Omissions and look-alike businesses are never counted as your errors."],
                ["No simulation, honest limits", "Real assistants, real pages, real Yext writes. We list what we do not detect yet."],
              ].map(([t, d]) => (
                <li key={t} className="card !p-4"><p className="flex items-start gap-2 font-display text-lg font-bold text-ink"><Check className="mt-1 h-4 w-4 shrink-0 text-accent" strokeWidth={3} />{t}</p><p className="mt-1 pl-6 text-sm text-slate-600">{d}</p></li>
              ))}
            </ul>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 py-24">
          <div className="card-pop flex flex-wrap items-center justify-between gap-6 !bg-ink !p-8 text-paper sm:!p-12">
            <div className="max-w-xl">
              <Building2 className="h-9 w-9 text-brand" />
              <h2 className="mt-4 font-display text-3xl font-extrabold tracking-tight text-paper sm:text-4xl">Connect has about 100,000 customers. AI assistants are the new place their customers ask.</h2>
              <p className="mt-3 text-paper/70">A product that watches both is an expansion of Connect, not just an opening-hours tool.</p>
            </div>
            <a href={BOT} target="_blank" rel="noreferrer" className="btn btn-primary h-12 px-6 text-base">Try it in Telegram <ArrowUpRight className="h-4 w-4" /></a>
          </div>
        </section>
      </main>

      <footer className="border-t-[1.5px] border-ink bg-panel py-8 text-sm text-slate-600">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5"><span className="flex items-center gap-2"><LogoMark className="h-6 w-6" /><b className="font-display text-ink">FonectaGuard</b></span><span className="flex flex-wrap items-center gap-x-5 gap-y-1"><a href="/privacy" className="hover:text-ink hover:underline">Privacy</a><a href="/terms" className="hover:text-ink hover:underline">Terms</a><a href="/data-deletion" className="hover:text-ink hover:underline">Delete your data</a><span>AI Hackathon 2026 · Fonecta challenge</span></span></div>
      </footer>
    </div>
  );
}
