"use client";
export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div role="alert" className="card">
      <p className="font-medium text-white">Something went wrong.</p>
      <p className="mt-1 text-sm text-zinc-400">{error.message}</p>
      <button className="btn btn-ghost mt-3" onClick={reset}>Try again</button>
    </div>
  );
}
