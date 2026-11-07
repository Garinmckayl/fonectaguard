/** One day's plan: closed, or open for one or more intervals ("HH:MM" 24h; end <= start means it runs past midnight). */
export type DayPlan = { closed: true } | { closed: false; intervals: { start: string; end: string }[] };

export type Basis = "standing_rule" | "owner_history" | "last_year" | "peers" | "category_default";

export interface Reason { text: string; evidence: string[]; basis: Basis }

export type SuggestionStatus = "draft" | "sent" | "approved" | "edited" | "declined" | "applied" | "auto_applied" | "failed" | "undone" | "expired";

export interface Publisher { name: string; typicalDelay: string; note?: string }
