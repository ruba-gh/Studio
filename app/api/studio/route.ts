import { env } from "cloudflare:workers";
import { canAttempt, checkPassword, createSession, dashboardOrigin, dashboardRequest, endSession, matches, passwordHash, principalFor } from "../../../lib/studio-auth";
import { fortnight, methods, minimum, riyadhDate, schedule } from "../../../lib/studio";

export const dynamic = "force-dynamic";
type Settings = { admin: string; whatsapp: string; anchor: string };
type Member = { id: string; name: string; code: string; rate: number; active: number; method: string | null; beneficiary: string | null; account: string | null };

function reply(value: object, status = 200, cookie?: string) {
  const headers = new Headers({ "Cache-Control": "private, no-store" });
  if (cookie) headers.set("Set-Cookie", cookie);
  return Response.json(value, { status, headers });
}
async function signedIn(principal: string, request: Request) {
  const session = await createSession(principal, request);
  return reply({ success: true, ...(session.token ? { token: session.token } : {}) }, 200, session.cookie);
}

function cors(response: Response, request: Request) {
  response.headers.append("Vary", "Origin");
  if (dashboardRequest(request)) response.headers.set("Access-Control-Allow-Origin", dashboardOrigin);
  return response;
}

export function OPTIONS(request: Request) {
  if (!dashboardRequest(request)) return cors(new Response(null, { status: 403 }), request);
  return cors(new Response(null, { status: 204, headers: {
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Max-Age": "600",
  } }), request);
}

export async function GET(request: Request) {
  return cors(await readDashboard(request), request);
}

export async function POST(request: Request) {
  return cors(await updateDashboard(request), request);
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
function passwordInput(value: unknown) {
  validate(typeof value === "string" && value.length >= 10 && value.length <= 128, "كلمة المرور تحتاج من ١٠ إلى ١٢٨ حرفًا");
  return value;
}
const memberFields = "id,name,code,rate,active,method,beneficiary,account";
async function access(request: Request) {
  const db = env.DB!;
  const principal = await principalFor(request);
  const settings = await db.prepare("SELECT * FROM settings WHERE id = 1").first<Settings>();
  const admin = principal === "admin" && !!settings;
  const member = principal && !admin
    ? await db.prepare(`SELECT ${memberFields} FROM marketers WHERE id=? AND active=1`).bind(principal).first<Member>()
    : null;
  return { db, settings, admin, member };
}
async function readDashboard(request: Request) {
  const { db, settings, admin, member } = await access(request);
  if (!settings) return reply({ role: env.STUDIO_SETUP_KEY ? "setup" : "unavailable" });
  if (!admin && !member) return reply({ role: "guest" });
  const timing = schedule(settings.anchor);
  const cutoff = cycleCutoff(timing);
  if (admin) {
    const [marketers, referrals, payouts, history] = await db.batch([
      db.prepare(`SELECT ${memberFields} FROM marketers ORDER BY name`),
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

async function updateDashboard(request: Request) {
  if ((request.headers.get("Sec-Fetch-Site") === "cross-site" && !dashboardRequest(request)) || !request.headers.get("Content-Type")?.startsWith("application/json")) {
    return reply({ error: "طلب غير صالح" }, 403);
  }
  const { db, settings, admin, member } = await access(request);
  try {
    const data = await request.json() as Record<string, unknown>;
    validate(data && typeof data === "object", "طلب غير صالح");
    const today = riyadhDate();
    const stamp = new Date().toISOString();
    const id = crypto.randomUUID();
    if (data.action === "logout") return reply({ success: true }, 200, await endSession(request));
    if (data.action === "login" || data.action === "setup") {
      if (!await canAttempt(request, data.action)) return reply({ error: "وصلت للحد الأقصى للمحاولات. جرّب بعد قليل." }, 429);
      if (data.action === "setup") {
        validate(!dashboardRequest(request), "يتم تفعيل حساب الإدارة من رابط الموقع الأساسي.");
        const secret = env.STUDIO_SETUP_KEY;
        validate(!settings && secret && typeof data.key === "string" && matches(data.key, secret), "رمز التهيئة غير صحيح أو تم تفعيل الحساب مسبقًا");
        const password = passwordInput(data.password);
        const firstDate = new Date(Date.parse(today + "T00:00:00Z") + fortnight).toISOString().slice(0, 10);
        const result = await db.prepare("INSERT OR IGNORE INTO settings (id,admin,anchor) VALUES (1,?,?)").bind(await passwordHash(password), firstDate).run();
        validate(result.meta.changes === 1, "تم تفعيل حساب الإدارة مسبقًا. سجّلي الدخول.");
        return await signedIn("admin", request);
      }
      const username = required(data.username, "اسم الدخول", 40).normalize("NFKC").toUpperCase();
      const password = required(data.password, "كلمة المرور", 128);
      const isAdmin = username === "ADMIN";
      const account = isAdmin ? null : await db.prepare("SELECT id,password FROM marketers WHERE code=? AND active=1").bind(username).first<{id: string; password: string}>();
      if (!await checkPassword(typeof data.password === "string" ? data.password : password, isAdmin ? settings?.admin : account?.password)) {
        return reply({ error: "اسم الدخول أو كلمة المرور غير صحيحة" }, 401);
      }
      return await signedIn(isAdmin ? "admin" : account!.id, request);
    }
    if (data.action === "password" && (admin || member)) {
      const hash = admin ? settings?.admin : await db.prepare("SELECT password FROM marketers WHERE id=?").bind(member!.id).first<string>("password");
      validate(typeof data.current === "string" && data.current.length <= 128 && await checkPassword(data.current, hash), "كلمة المرور الحالية غير صحيحة");
      const next = await passwordHash(passwordInput(data.password));
      const principal = admin ? "admin" : member!.id;
      await db.batch([
        admin ? db.prepare("UPDATE settings SET admin=? WHERE id=1").bind(next) : db.prepare("UPDATE marketers SET password=? WHERE id=?").bind(next, principal),
        db.prepare("DELETE FROM sessions WHERE principal=?").bind(principal),
      ]);
      return await signedIn(principal, request);
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
      const code = required(data.code, "الكود", 40).normalize("NFKC").toUpperCase();
      const rate = Math.round(Number(data.rate) * 100);
      validate(code !== "ADMIN" && /^[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*$/u.test(code), "اختاري كودًا غير ADMIN من حروف أو أرقام");
      validate(Number.isInteger(rate) && rate > 0 && rate <= 10000, "أدخلي نسبة عمولة أكبر من صفر وحتى ١٠٠٪");
      if (data.id) {
        const marketer = required(data.id, "المسوّق");
        const active = data.active ? 1 : 0;
        const hash = data.password ? await passwordHash(passwordInput(data.password)) : null;
        const results = await db.batch([
          db.prepare("UPDATE marketers SET name=?, code=?, rate=?, active=?, password=COALESCE(?,password) WHERE id=?").bind(name,code,rate,active,hash,marketer),
          db.prepare("DELETE FROM sessions WHERE principal=? AND (? IS NOT NULL OR ?=0)").bind(marketer,hash,active),
        ]);
        validate(results[0].meta.changes === 1, "حساب المسوّق غير موجود");
      } else {
        await db.prepare("INSERT INTO marketers (id,name,code,rate,password) VALUES (?,?,?,?,?)").bind(id,name,code,rate,await passwordHash(passwordInput(data.password))).run();
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
    if (String(error).includes("UNIQUE constraint failed")) return reply({ error: "الكود أو مرجع الحوالة مستخدم مسبقًا" }, 409);
    console.error("Studio operation failed", error instanceof Error ? error.message : "unexpected error");
    return reply({ error: "تعذر حفظ البيانات. حاولي مرة أخرى" }, 500);
  }
}
