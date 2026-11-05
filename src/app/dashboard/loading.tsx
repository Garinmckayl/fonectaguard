export default function Loading() {
  return (
    <div className="space-y-4" aria-busy="true">
      <div className="h-40 animate-pulse rounded-2xl bg-slate-100" />
      <div className="grid gap-4 sm:grid-cols-4">{[0, 1, 2, 3].map((i) => <div key={i} className="h-24 animate-pulse rounded-2xl bg-slate-100" />)}</div>
    </div>
  );
}
