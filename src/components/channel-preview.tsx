"use client";
import { useState } from "react";

export interface Preview { telegram: string; emailHtml: string; emailSubject: string; sms: string; whatsapp: string; pushTitle: string; pushBody: string }
const tabs = [["TELEGRAM", "Telegram"], ["EMAIL", "Email"], ["SMS", "SMS"], ["WHATSAPP", "WhatsApp"], ["APP_PUSH", "App push"]] as const;

/** The same suggestion, rendered for each channel the dataset says customers prefer. The owner's own preference opens first. */
export function ChannelPreview({ preferred, p }: { preferred: string; p: Preview }) {
  const [tab, setTab] = useState<string>(tabs.some(([k]) => k === preferred) ? preferred : "TELEGRAM");
  return (
    <div>
      <div role="tablist" className="flex flex-wrap gap-2">
        {tabs.map(([k, label]) => <button key={k} role="tab" aria-selected={tab === k} className={`btn !py-1.5 text-xs ${tab === k ? "btn-primary" : "btn-ghost"}`} onClick={() => setTab(k)}>{label}{k === preferred ? " ★" : ""}</button>)}
      </div>
      <div className="mt-3 rounded-xl border-[1.5px] border-ink bg-white p-4 text-sm">
        {tab === "TELEGRAM" && <div className="whitespace-pre-wrap" dangerouslySetInnerHTML={{ __html: p.telegram.replace(/\n/g, "<br/>") }} />}
        {tab === "EMAIL" && <div><p className="mb-2 font-mono text-xs text-slate-500">Subject: {p.emailSubject}</p><div dangerouslySetInnerHTML={{ __html: p.emailHtml }} /></div>}
        {tab === "SMS" && <p className="whitespace-pre-wrap font-mono text-[13px]">{p.sms}<span className="mt-2 block text-xs text-slate-500">{p.sms.length} characters</span></p>}
        {tab === "WHATSAPP" && <p className="whitespace-pre-wrap">{p.whatsapp}</p>}
        {tab === "APP_PUSH" && <div><p className="font-bold">{p.pushTitle}</p><p>{p.pushBody}</p></div>}
      </div>
      <p className="mt-2 text-xs text-slate-500">★ the owner&apos;s preferred channel. In this demo the message is actually delivered by Telegram and email; SMS, WhatsApp and push are shown as the exact text they would carry.</p>
    </div>
  );
}
