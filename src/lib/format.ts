import type { FieldName } from "./compare";
import { formatHours, type Schedule } from "./normalize";

export function formatPhone(p: string): string {
  const m = p.match(/^\+358(\d{2})(\d{3})(\d{2,5})$/);
  return m ? `+358 ${m[1]} ${m[2]} ${m[3]}` : p;
}

export function displayValue(field: FieldName | string, v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (field === "hours" && typeof v === "object") return formatHours(v as Schedule);
  if (field === "phone" && typeof v === "string") return formatPhone(v);
  return typeof v === "string" ? v : JSON.stringify(v);
}
