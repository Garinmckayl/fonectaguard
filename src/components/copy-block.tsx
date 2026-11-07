"use client";
import { useState } from "react";
import { Check, Copy } from "lucide-react";

export function CopyBlock({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <div className="relative">
      <pre className="max-h-64 overflow-auto rounded-xl border-[1.5px] border-ink bg-ink p-4 pr-24 font-mono text-xs leading-relaxed text-paper">{text}</pre>
      <button type="button" className="btn btn-primary absolute right-2 top-2 !px-3 !py-1.5 text-xs" onClick={async () => { try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 2000); } catch { /* clipboard unavailable */ } }}>
        {done ? <><Check className="h-3.5 w-3.5" /> Copied</> : <><Copy className="h-3.5 w-3.5" /> {label}</>}
      </button>
    </div>
  );
}
