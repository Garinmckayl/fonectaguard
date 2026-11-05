"use client";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export function HealthChart({ data }: { data: { t: number; score: number }[] }) {
  if (data.length < 1) return <p className="py-10 text-center text-sm text-zinc-500">No scans yet. Run a scan to start the health history.</p>;
  const rows = data.map((d, i) => ({ ...d, label: new Date(d.t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }), i }));
  return (
    <div className="h-52" role="img" aria-label="Presence health history">
      <ResponsiveContainer>
        <AreaChart data={rows}>
          <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#2dd4bf" stopOpacity={0.4} /><stop offset="100%" stopColor="#2dd4bf" stopOpacity={0} /></linearGradient></defs>
          <CartesianGrid stroke="#1f2a2d" vertical={false} />
          <XAxis dataKey="label" stroke="#71717a" fontSize={11} />
          <YAxis domain={[0, 100]} stroke="#71717a" fontSize={11} width={30} />
          <Tooltip contentStyle={{ background: "#12181a", border: "1px solid #1f2a2d", borderRadius: 8 }} />
          <Area type="monotone" dataKey="score" stroke="#2dd4bf" fill="url(#g)" strokeWidth={2} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
