"use client";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export function HealthChart({ data }: { data: { t: number; score: number }[] }) {
  if (data.length < 1) return <p className="py-10 text-center text-sm text-slate-500">No scans yet. Run a scan to start the health history.</p>;
  const rows = data.map((d, i) => ({ ...d, label: new Date(d.t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }), i }));
  return (
    <div className="h-52" role="img" aria-label="Presence health history">
      <ResponsiveContainer>
        <AreaChart data={rows}>
          <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#4f46e5" stopOpacity={0.4} /><stop offset="100%" stopColor="#4f46e5" stopOpacity={0} /></linearGradient></defs>
          <CartesianGrid stroke="#e4e7f0" vertical={false} />
          <XAxis dataKey="label" stroke="#94a3b8" fontSize={11} />
          <YAxis domain={[0, 100]} stroke="#94a3b8" fontSize={11} width={30} />
          <Tooltip contentStyle={{ background: "#fff", border: "1px solid #e4e7f0", borderRadius: 8 }} />
          <Area type="monotone" dataKey="score" stroke="#4f46e5" fill="url(#g)" strokeWidth={2} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
