/** FonectaGuard mark: a speech bubble (what AI says) carrying a check (what is true). */
export function LogoMark({ className = "h-9 w-9" }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} role="img" aria-label="FonectaGuard">
      <rect x="1.5" y="1.5" width="37" height="37" rx="10" fill="#FF5B1F" stroke="#14110D" strokeWidth="2.5" />
      <path d="M9 11.5h22a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H19l-6 5v-5H9a2 2 0 0 1-2-2v-12a2 2 0 0 1 2-2z" fill="#FFFDF8" stroke="#14110D" strokeWidth="2.2" strokeLinejoin="round" />
      <path d="M13.5 20.2l4.2 4 8.3-8.6" fill="none" stroke="#14110D" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
export const Wordmark = ({ className = "" }: { className?: string }) => <span className={`font-display text-xl font-extrabold tracking-tight text-ink ${className}`}>Fonecta<span className="text-brand-deep">Guard</span></span>;
