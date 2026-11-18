import { env } from "cloudflare:workers";
import { getChatGPTUser } from "../../chatgpt-auth";
import { fortnight, methods, minimum, riyadhDate, schedule } from "../../../lib/studio";

export const dynamic = "force-dynamic";
type Settings = { admin: string; whatsapp: string; anchor: string };
type Member = { id: string; name: string; code: string; email: string; rate: number; active: number; method: string | null; beneficiary: string | null; account: string | null };

function reply(value: object, status = 200) {
  return Response.json(value, { status, headers: { "Cache-Control": "private, no-store" } });
}
class InputError extends Error {}
function validate(ok: unknown, message: string): asserts ok {
  if (!ok) throw new InputError(message);
}
function required(value: unknown, label: string, limit = 100) {
  validate(typeof value === "string" && value.trim() && value.trim().length <= limit, "راجعي حقل " + label);
  return (value as string).trim();
}
function cycleCutoff(timing: ReturnType<typeof schedule>) {
  return timing.days === 0 ? timing.date : new Date(Date.parse(timing.date + "T00:00:00Z") - fortnight).toISOString().slice(0, 10);
}
const openCommission = "COALESCE((SELECT SUM(e.amount) FROM earnings e WHERE e.referral=r.id AND e.payout IS NULL),0)";
const dueCommission = "COALESCE((SELECT SUM(e.amount) FROM earnings e WHERE e.referral=r.id AND e.payout IS NULL AND e.date<=?),0)";
function keyMatch(a: string, b: string) {
  const one = new TextEncoder().encode(a);
  const two = new TextEncoder().encode(b);
  let difference = one.length ^ two.length;
  for (let i = 0; i < two.length; i++) difference |= (one[i] ?? 0) ^ two[i];
  return difference === 0;
}
async function access() {
  const db = env.DB!;
  const user = await getChatGPTUser();
  const settings = await db.prepare("SELECT * FROM settings WHERE id = 1").first<Settings>();
  const admin = !!user && settings?.admin === user.userId;
  const member = user && !admin
    ? await db.prepare("SELECT * FROM marketers WHERE email = ?").bind(user.email.toLowerCase()).first<Member>()
    : null;
  return { db, user, settings, admin, member };
}
export async function GET() {
  const { db, user, settings, admin, member } = await access();
  if (!user) return reply({ role: "guest" });
  if (!settings) return reply({ role: "setup" });
  if (!admin && !member) return reply({ role: "waiting" });
  const timing = schedule(settings.anchor);
  const cutoff = cycleCutoff(timing);
  if (admin) {
    const [marketers, referrals, payouts, history] = await db.batch([
      db.prepare("SELECT * FROM marketers ORDER BY name"),
      db.prepare(`SELECT r.*, ${openCommission} AS open, ${dueCommission} AS due FROM referrals r ORDER BY rowid DESC`).bind(cutoff),
      db.prepare("SELECT * FROM payouts ORDER BY rowid DESC"),
      db.prepare("SELECT * FROM history ORDER BY rowid DESC"),
    ]);
    return reply({ role: "admin", whatsapp: settings.whatsapp, anchor: settings.anchor, timing, marketers: marketers.results, referrals: referrals.results, payouts: payouts.results, history: history.results });
  }
  const [referrals, payouts] = await db.batch([
    db.prepare(`SELECT r.id,r.project,r.date,r.state,r.commission,${openCommission} AS open FROM referrals r WHERE r.marketer=? ORDER BY r.rowid DESC`).bind(member!.id),
    db.prepare("SELECT id, amount, date, reference, method FROM payouts WHERE marketer = ? ORDER BY rowid DESC").bind(member!.id),
  ]);
  const total = await db.prepare("SELECT COUNT(DISTINCT customer) AS total FROM referrals WHERE marketer = ?").bind(member!.id).first<number>("total");
  return reply({ role: "marketer", member, timing, linkReady: !!settings.whatsapp, referrals: referrals.results, payouts: payouts.results, total });
}

export async function POST(request: Request) {
  if (request.headers.get("Sec-Fetch-Site") === "cross-site" || !request.headers.get("Content-Type")?.startsWith("application/json")) {
    return reply({ error: "طلب غير صالح" }, 403);
  }
  const { db, user, settings, admin, member } = await access();
  if (!user) return reply({ error: "سجلي الدخول أولًا" }, 401);
  try {
    const data = await request.json() as Record<string, unknown>;
    const today = riyadhDate();
    const stamp = new Date().toISOString();
    const id = crypto.randomUUID();
    if (data.action === "setup" && !settings) {
      const secret = env.STUDIO_SETUP_KEY;
      validate(secret && typeof data.key === "string" && keyMatch(data.key, secret), "رمز التهيئة غير صحيح");
      const firstDate = new Date(Date.parse(today + "T00:00:00Z") + fortnight).toISOString().slice(0, 10);
      const result = await db.prepare("INSERT OR IGNORE INTO settings (id, admin, anchor) VALUES (1, ?, ?)").bind(user.userId, firstDate).run();
      validate(result.meta.changes === 1, "تمت تهيئة الإدارة مسبقًا");
      return reply({ success: true });
    }
    if (data.action === "details" && member) {
      const method = required(data.method, "وسيلة التحويل");
      validate(Object.hasOwn(methods, method), "اختاري وسيلة تحويل");
      const name = required(data.beneficiary, "اسم المستفيد");
      const account = required(data.account, "بيانات التحويل").replace(/\s/g, "").toUpperCase();
      validate(method === "bank" ? /^SA\d{22}$/.test(account) : /^(?:05\d{8}|(?:\+?966)5\d{8})$/.test(account), method === "bank" ? "اكتبي الآيبان السعودي كاملًا" : "اكتبي رقم الجوال السعودي المرتبط بالمحفظة");
      await db.prepare("UPDATE marketers SET method=?, beneficiary=?, account=? WHERE id=?").bind(method, name, account, member.id).run();
      return reply({ success: true });
    }
    if (!admin || !settings) return reply({ error: "هذه العملية للإدارة فقط" }, 403);
    if (data.action === "settings") {
      const raw = required(data.whatsapp, "رقم واتساب").replace(/[\s()+-]/g, "");
      const number = /^05\d{8}$/.test(raw) ? "966" + raw.slice(1) : raw;
      validate(/^9665\d{8}$/.test(number), "اكتبي رقم واتساب سعودي بصيغة 05 أو 966");
      const anchor = required(data.anchor, "تاريخ أول دورة");
      const anchorMs = Date.parse(anchor + "T00:00:00Z");
      validate(/^\d{4}-\d\d-\d\d$/.test(anchor) && Number.isFinite(anchorMs) && new Date(anchorMs).toISOString().slice(0, 10) === anchor, "اختاري تاريخًا صحيحًا");
      await db.prepare("UPDATE settings SET whatsapp=?, anchor=? WHERE id=1").bind(number, anchor).run();
    } else if (data.action === "marketer") {
      const name = required(data.name, "اسم المسوّق");
      const email = required(data.email, "البريد الإلكتروني", 200).toLowerCase();
      const code = required(data.code, "الكود", 40).normalize("NFKC").toUpperCase();
      const rate = Math.round(Number(data.rate) * 100);
      validate(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email), "البريد الإلكتروني غير صالح");
      validate(/^[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*$/u.test(code), "الكود يقبل حروفًا وأرقامًا وشرطات بين الكلمات");
      validate(Number.isInteger(rate) && rate > 0 && rate <= 10000, "أدخلي نسبة عمولة أكبر من صفر وحتى ١٠٠٪");
      if (data.id) {
        const result = await db.prepare("UPDATE marketers SET name=?, code=?, email=?, rate=?, active=? WHERE id=?").bind(name, code, email, rate, data.active ? 1 : 0, data.id).run();
        validate(result.meta.changes === 1, "حساب المسوّق غير موجود");
      } else {
        await db.prepare("INSERT INTO marketers (id,name,code,email,rate) VALUES (?,?,?,?,?)").bind(id,name,code,email,rate).run();
      }
    } else if (data.action === "referral") {
      const code = required(data.code, "كود المسوّق").normalize("NFKC").toUpperCase();
      const raw = required(data.customer, "رقم العميل").replace(/[\s()+-]/g, "");
      const customer = /^05\d{8}$/.test(raw) ? "966" + raw.slice(1) : raw;
      const project = required(data.project, "نوع الخدمة أو مرجع المشروع", 150);
      validate(/^\d{8,15}$/.test(customer), "اكتبي رقم العميل بصيغة صحيحة");
      const result = await db.prepare("INSERT INTO referrals (id,marketer,customer,project,rate,date) SELECT ?,id,?,?,rate,? FROM marketers WHERE code=?").bind(id,customer,project,today,code).run();
      validate(result.meta.changes === 1, "كود المسوّق غير موجود");
    } else if (data.action === "review") {
      const referral = required(data.id, "رقم الإحالة");
      const state = required(data.state, "حالة الطلب");
      const paid = state === "approved" ? Math.round(Number(data.paid) * 100) : 0;
      validate(["pending","approved","cancelled"].includes(state), "اختاري حالة صحيحة");
      validate(Number.isSafeInteger(paid) && paid >= 0 && paid <= 100000000 && (state !== "approved" || paid > 0), "أدخلي المبلغ المستلم فعليًا");
      const results = await db.batch([
        db.prepare(`INSERT INTO history (id,referral,state,paid,commission,date)
          SELECT ?,r.id,?,?,CAST(ROUND(?*r.rate/10000.0) AS INTEGER),?
          FROM referrals r WHERE r.id=? AND (r.state!=? OR r.paid!=?)
          AND (? >= r.paid OR NOT EXISTS(SELECT 1 FROM earnings e WHERE e.referral=r.id AND e.payout IS NOT NULL))`)
          .bind(id,state,paid,paid,stamp,referral,state,paid,paid),
        db.prepare(`DELETE FROM earnings WHERE referral=? AND payout IS NULL
          AND EXISTS(SELECT 1 FROM history h JOIN referrals r ON r.id=h.referral WHERE h.id=? AND h.paid<r.paid)`).bind(referral,id),
        db.prepare(`INSERT INTO earnings (id,referral,amount,date)
          SELECT h.id,h.referral,h.commission-COALESCE((SELECT SUM(e.amount) FROM earnings e WHERE e.referral=h.referral),0),?
          FROM history h WHERE h.id=? AND h.commission>COALESCE((SELECT SUM(e.amount) FROM earnings e WHERE e.referral=h.referral),0)`).bind(today,id),
        db.prepare(`UPDATE referrals SET state=?,paid=?,commission=(SELECT commission FROM history WHERE id=?)
          WHERE id=? AND EXISTS(SELECT 1 FROM history WHERE id=?)`).bind(state,paid,id,referral,id),
      ]);
      validate(results[3].meta.changes === 1, "لم يتغير المبلغ أو الحالة، أو تحاولين تخفيض مبلغ طلب صُرفت عليه عمولة");
    } else if (data.action === "payout") {
      const marketer = required(data.id, "المسوّق");
      const reference = required(data.reference, "مرجع الحوالة");
      const timing = schedule(settings.anchor, today);
      const cutoff = cycleCutoff(timing);
      validate(timing.eligible, "موعد أول دورة صرف ما حان");
      const expected = Number(data.amount);
      const expectedMethod = required(data.method, "وسيلة التحويل");
      const expectedBeneficiary = required(data.beneficiary, "اسم المستفيد");
      const expectedAccount = required(data.account, "حساب المستفيد");
      const results = await db.batch([
        db.prepare(`INSERT INTO payouts (id,marketer,amount,date,reference,method,beneficiary,account)
          SELECT ?,m.id,SUM(e.amount),?,?,?,?,? FROM marketers m
          JOIN referrals r ON r.marketer=m.id JOIN earnings e ON e.referral=r.id
          WHERE m.id=? AND m.method=? AND m.beneficiary=? AND m.account=? AND e.payout IS NULL AND e.date<=?
          GROUP BY m.id HAVING SUM(e.amount)>=? AND SUM(e.amount)=?`)
          .bind(id,today,reference,expectedMethod,expectedBeneficiary,expectedAccount,marketer,expectedMethod,expectedBeneficiary,expectedAccount,cutoff,minimum,expected),
        db.prepare(`UPDATE earnings SET payout=? WHERE payout IS NULL AND date<=?
          AND referral IN (SELECT id FROM referrals WHERE marketer=?)
          AND EXISTS(SELECT 1 FROM payouts WHERE id=?)`).bind(id,cutoff,marketer,id),
      ]);
      validate(results[0].meta.changes === 1, "رصيد الدورة أو بيانات التحويل تغيّرت. راجعي القائمة قبل توثيق الحوالة");
    } else {
      return reply({ error: "العملية غير معروفة" }, 400);
    }
    return reply({ success: true });
  } catch (error) {
    if (error instanceof InputError) return reply({ error: error.message }, 400);
    if (String(error).includes("UNIQUE constraint failed")) return reply({ error: "البريد أو الكود أو مرجع الحوالة مستخدم مسبقًا" }, 409);
    return reply({ error: "تعذر حفظ البيانات. حاولي مرة أخرى" }, 500);
  }
}
