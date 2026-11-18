export const minimum = 10000;
export const fortnight = 14 * 86400000;
export const methods = { barq: "برق", stc: "STC", bank: "حوالة بنكية" };
export const states = { pending: "بانتظار الدفع", approved: "عمولة معتمدة", cancelled: "ملغي" };

export function riyadhDate() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh" }).format(new Date());
}

export function schedule(anchor: string, today = riyadhDate()) {
  const start = Date.parse(anchor + "T00:00:00Z");
  const now = Date.parse(today + "T00:00:00Z");
  const due = start + Math.max(0, Math.ceil((now - start) / fortnight)) * fortnight;
  return { days: (due - now) / 86400000, date: new Date(due).toISOString().slice(0, 10), eligible: now >= start };
}

export function money(halalas: number) {
  return new Intl.NumberFormat("ar-SA", { maximumFractionDigits: 2 }).format(halalas / 100) + " ر.س";
}

export function displayDate(value: string) {
  return new Intl.DateTimeFormat("ar-SA-u-ca-gregory", { timeZone: "Asia/Riyadh", day: "numeric", month: "long", year: "numeric" }).format(new Date(value));
}
