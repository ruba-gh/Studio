"use client";

import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { ArrowDownLeft, ArrowUpLeft, CalendarDays, Check, ChevronLeft, CircleHelp, ClipboardList, Copy, CreditCard, Eye, EyeOff, FileText, Gauge, Link2, LockKeyhole, LogOut, Menu, Plus, Settings, Users, Wallet, X } from "lucide-react";
import { displayDate, methods, minimum, money, states } from "../lib/studio";

type Method = keyof typeof methods;
type State = keyof typeof states;
type Marketer = { id: string; name: string; code: string; rate: number; active: number; method: Method | null; beneficiary: string | null; account: string | null };
type Referral = { id: string; marketer?: string; customer?: string; project: string; state: State; date: string; paid?: number; rate?: number; commission: number; open: number; due?: number };
type Payout = { id: string; marketer?: string; amount: number; date: string; reference: string; method: Method; beneficiary?: string; account?: string };
type History = { id: string; referral: string; state: State; paid: number; commission: number; date: string };
type Timing = { days: number; date: string; eligible: boolean };
type Data = { role: "guest" | "unavailable" | "setup" } | { role: "admin"; marketers: Marketer[]; referrals: Referral[]; payouts: Payout[]; history: History[]; whatsapp: string; anchor: string; timing: Timing } | { role: "marketer"; member: Marketer; referrals: Referral[]; payouts: Payout[]; timing: Timing; total: number; linkReady: boolean };
type Modal = { type: "marketer"; row?: Marketer } | { type: "referral" } | { type: "review"; row: Referral } | { type: "payout"; row: Marketer; amount: number };
const navigation = [
  { id: "overview", text: "نظرة عامة", icon: Gauge },
  { id: "marketers", text: "المسوّقون", icon: Users },
  { id: "referrals", text: "الإحالات", icon: ClipboardList },
  { id: "payouts", text: "التحويلات", icon: Wallet },
  { id: "settings", text: "الإعدادات", icon: Settings },
  { id: "policy", text: "سياسة العمولات", icon: FileText },
] as const;
type Tab = typeof navigation[number]["id"];

function Brand() {
  return <div className="brand"><div className="mark" aria-hidden="true">ر<span>.</span></div><div><b>ستوديو ربى</b><small>برنامج الشركاء</small></div></div>;
}
function Card({ label, value, note, icon: Icon }: { label: string; value: ReactNode; note?: string; icon: typeof Gauge }) {
  return <article className="stat"><div className="stat-icon"><Icon size={20}/></div><p>{label}</p><strong>{value}</strong>{note && <small>{note}</small>}</article>;
}
function Empty({ title, text }: { title: string; text: string }) {
  return <div className="empty"><div className="empty-icon"><ClipboardList size={24}/></div><b>{title}</b><p>{text}</p></div>;
}
function Badge({ state, paid }: { state: State; paid?: boolean }) {
  return <span className={"badge " + (paid ? "settled" : state)}>{paid ? "تم الصرف" : states[state]}</span>;
}
function Policy() {
  return <section className="panel policy"><div className="stat-icon"><FileText size={21}/></div><h2>سياسة العمولات</h2>
    <dl><dt>رابطك وكودك</dt><dd>لكل مسوّق رابط خاص يفتح واتساب ستوديو ربى برسالة جاهزة فيها كوده. يرسل العميل الرسالة، ثم تسجل الإدارة الطلب باسم صاحب الكود.</dd>
    <dt>احتساب العمولة</dt><dd>تتفق الإدارة معك على نسبتك قبل النشر. تُحتسب العمولة على المبلغ المستلم فعليًا بعد تأكيد الدفع. إذا دفع العميل عربونًا، تُعتمد عمولته عند الاستلام وتضاف عمولة باقي المبلغ عند دفعه. تظهر الإحالة بانتظار الدفع إلى حين اعتماده. الطلب الملغى ما عليه عمولة.</dd>
    <dt>دورة الصرف</dt><dd>تتم مراجعة العمولات المعتمدة كل أسبوعين. الحد الأدنى للتحويل ١٠٠ ريال. إذا كان رصيدك أقل، يترحل كامل الرصيد للدورة التالية حتى يوصل للحد الأدنى.</dd>
    <dt>بيانات التحويل</dt><dd>أضيف بياناتك من لوحة المسوّق واختر برق أو STC أو حوالة بنكية. بعد تنفيذ الحوالة تسجل الإدارة قيمتها وتاريخها ومرجعها في حسابك.</dd>
    <dt>النشر</dt><dd>انشر الإعلان في القروبات اللي تسمح بالإعلانات. استخدم رابطك الخاص مع الإعلان حتى يظهر الكود في رسالة العميل.</dd></dl>
  </section>;
}

function PasswordField({ label = "كلمة المرور", name = "password", fresh = false, required = true }: { label?: string; name?: string; fresh?: boolean; required?: boolean }) {
  const [visible, setVisible] = useState(false);
  return <label>{label}<span className="password-field"><input name={name} type={visible ? "text" : "password"} autoComplete={fresh ? "new-password" : "current-password"} minLength={fresh ? 10 : undefined} maxLength={128} required={required} dir="ltr"/><button type="button" className="icon" aria-label={visible ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"} onClick={() => setVisible(!visible)}>{visible ? <EyeOff size={17}/> : <Eye size={17}/>}</button></span></label>;
}

export default function Studio() {
  const [data, setData] = useState<Data | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [modal, setModal] = useState<Modal | null>(null);
  const [notice, setNotice] = useState<{ message: string; bad?: boolean }>();
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [method, setMethod] = useState<Method>("barq");
  const refresh = useCallback(async () => {
    const response = await fetch("/api/studio", { cache: "no-store" });
    if (!response.ok) throw new Error("تعذر تحميل البيانات");
    const next = await response.json() as Data;
    setData(next);
    if (next.role === "marketer") setMethod(next.member.method ?? "barq");
  }, []);
  useEffect(() => {
    refresh().catch(() => setNotice({ message: "تعذر الاتصال بلوحة الشركاء. حدّث الصفحة وحاول مرة أخرى.", bad: true }));
  }, [refresh]);
  async function save(event: FormEvent<HTMLFormElement>, fields: Record<string, unknown>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    setBusy(true);
    setNotice(undefined);
    try {
      const response = await fetch("/api/studio", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...values, ...fields }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "تعذر حفظ البيانات");
      setModal(null);
      if (["login", "setup", "logout"].includes(String(fields.action))) setTab("overview");
      if (fields.action === "password") form.reset();
      await refresh();
      if (!["login", "setup", "logout"].includes(String(fields.action))) setNotice({ message: "تم الحفظ" });
    } catch (error) {
      setNotice({ message: error instanceof Error ? error.message : "تعذر حفظ البيانات", bad: true });
    } finally {
      setBusy(false);
    }
  }
  async function copy(code: string) {
    const link = location.origin + "/r/" + encodeURIComponent(code);
    try {
      await navigator.clipboard.writeText(link);
      setNotice({ message: "تم نسخ رابط المسوّق" });
    } catch {
      setNotice({ message: link });
    }
  }
  const feedback = notice && <div className={"notice " + (notice.bad ? "bad" : "")} role={notice.bad ? "alert" : "status"}><span>{notice.message}</span><button className="icon" aria-label="إغلاق التنبيه" onClick={() => setNotice(undefined)}><X size={17}/></button></div>;

  if (!data || data.role === "guest" || data.role === "unavailable" || data.role === "setup") {
    return <div className="login-page"><main className="login-shell"><div className="login-side"><Brand/><div className="login-title"><div className="stat-icon"><LockKeyhole size={19}/></div><h1>{data?.role === "setup" ? "تهيئة حساب الإدارة" : "تسجيل الدخول"}</h1><p>{data?.role === "setup" ? "استخدمي رمز التهيئة مرة واحدة لاختيار كلمة مرورك." : "ادخل إلى لوحة شركاء ستوديو ربى."}</p></div>
      {feedback}
      {data?.role === "guest" && <form className="login-form" onSubmit={e => save(e, { action: "login" })}><label>اسم الدخول<input name="username" autoComplete="username" placeholder="كود المسوّق أو admin" maxLength={40} required dir="auto"/></label><PasswordField/><button className="primary" disabled={busy}>{busy ? "جارٍ الدخول…" : "دخول"} <ArrowUpLeft size={17}/></button></form>}
      {data?.role === "setup" && <form className="login-form" onSubmit={e => save(e, { action: "setup" })}><label>رمز التهيئة<input name="key" type="password" autoComplete="off" dir="ltr" required/></label><PasswordField label="اختاري كلمة مرور الإدارة" fresh/><p className="field-note">اسم دخول الإدارة <bdi>admin</bdi></p><button className="primary" disabled={busy}>{busy ? "جارٍ التفعيل…" : "تفعيل الحساب"} <ArrowUpLeft size={17}/></button></form>}
      {data?.role === "unavailable" && <p role="status">حساب الإدارة بانتظار التهيئة.</p>}
      {!data && !notice && <p role="status">جارٍ التحميل…</p>}
      </div><div className="welcome-art" aria-hidden="true"><div className="art-orbit a"/><div className="art-orbit b"/><div className="art-orbit c"/><span className="art-star">✳</span><div className="art-card link-card"><Link2 size={27}/></div><div className="art-card wallet-card"><Wallet size={37}/></div><div className="art-card arrow-card"><ArrowDownLeft size={25}/></div></div>
    </main></div>;
  }
  if (!("timing" in data)) return null;

  const isAdmin = data.role === "admin";
  const marketers = isAdmin ? data.marketers : [data.member];
  const unpaid = data.referrals.filter(row => row.open > 0);
  const balance = unpaid.reduce((sum, row) => sum + row.open, 0);
  const settled = data.payouts.reduce((sum, row) => sum + row.amount, 0);
  const due = (id: string) => !data.timing.eligible ? 0 : unpaid.filter(row => row.marketer === id).reduce((sum, row) => sum + (row.due ?? 0), 0);
  const marketerName = (id?: string) => marketers.find(row => row.id === id)?.name ?? "—";
  const page = navigation.find(x => x.id === tab)!;
  const go = (next: Tab) => { setTab(next); setExpanded(false); };
  const cycle = <section className="cycle"><div><div className="cycle-label"><CalendarDays size={17}/> دورة الصرف</div><h2>{data.timing.days === 0 ? "موعد الصرف اليوم" : <>متبقي <span>{new Intl.NumberFormat("ar-SA").format(data.timing.days)}</span> يوم</>}</h2><p>{displayDate(data.timing.date)} <i/> الحد الأدنى للصرف {money(minimum)}</p></div><div className="cycle-art" aria-hidden="true"><CalendarDays size={66} strokeWidth={1}/></div></section>;

  function referralTable(rows: Referral[]) {
    return rows.length ? <div className="table-wrap"><table><thead><tr><th>الخدمة</th>{isAdmin && <><th>المسوّق</th><th>رقم العميل</th><th>المستلم</th></>}<th>التاريخ</th><th>الحالة</th><th>العمولة</th>{isAdmin && <th>الإجراء</th>}</tr></thead><tbody>{rows.map(row => <tr key={row.id}><td><b>{row.project}</b></td>{isAdmin && <><td>{marketerName(row.marketer)}</td><td><bdi>{row.customer}</bdi></td><td>{money(row.paid ?? 0)}</td></>}<td>{displayDate(row.date)}</td><td><Badge state={row.state} paid={row.commission > 0 && row.open === 0}/></td><td>{money(row.commission)}</td>{isAdmin && <td><button className="text-btn" onClick={() => setModal({ type: "review", row })}>مراجعة</button></td>}</tr>)}</tbody></table></div>
      : <Empty title="لا توجد إحالات حتى الآن" text={isAdmin ? "سجلي طلب العميل بالكود اللي وصلك على واتساب." : "تظهر هنا الإحالات اللي تسجلها الإدارة بكودك."}/>;
  }

  return <div className="app-shell">
    <aside className={expanded ? "sidebar expanded" : "sidebar"}><Brand/><div className="nav-heading">لوحة {isAdmin ? "الإدارة" : "المسوّق"}</div><nav aria-label="أقسام اللوحة">{navigation.filter(item => isAdmin || item.id !== "marketers").map(({ id, text, icon: Icon }) => <button key={id} className={tab === id ? "active" : ""} onClick={() => go(id)} aria-current={tab === id ? "page" : undefined}><Icon size={19}/>{text}{tab === id && <ChevronLeft size={15} className="chevron"/>}</button>)}</nav><div className="sidebar-bottom"><button className="policy-short" onClick={() => go("policy")}><CircleHelp size={17}/> كيف تُصرف العمولة؟</button><form onSubmit={e => save(e, { action: "logout" })}><button disabled={busy}><LogOut size={18}/> تسجيل الخروج</button></form></div></aside>
    <main className="main"><header className="topbar"><div className="breadcrumb"><button className="mobile-menu icon" onClick={() => setExpanded(!expanded)} aria-label="القائمة" aria-expanded={expanded}><Menu size={22}/></button><span>برنامج الشركاء</span><ChevronLeft size={14}/><b>{page.text}</b></div><div className="profile"><div>{isAdmin ? "ر" : data.member.name.slice(0,1)}</div><span><b>{isAdmin ? "ستوديو ربى" : data.member.name}</b><small>{isAdmin ? "الإدارة" : "مسوّق"}</small></span></div></header>
    <div className="content"><div className="title"><div><h1>{page.text}</h1><p>{tab === "overview" ? (isAdmin ? "تابعي إحالات المسوّقين والعمولات المستحقة." : "تابع إحالاتك ورصيد عمولتك من مكان واحد.") : { marketers: "إدارة الأكواد ونسب العمولة وحسابات المسوّقين.", referrals: "متابعة الطلبات الواردة ومبالغها المعتمدة.", payouts: "متابعة الأرصدة وسجل الحوالات.", settings: isAdmin ? "ضبط وجهة الروابط وجدول الصرف." : "حدّث بيانات استلام عمولتك.", policy: "تتبّع الإحالة واحتساب العمولة ومواعيد التحويل." }[tab]}</p></div>
      {isAdmin && (tab === "overview" || tab === "referrals" || tab === "marketers") && <button className="primary" onClick={() => setModal({ type: tab === "marketers" ? "marketer" : "referral" })}><Plus size={19}/>{tab === "marketers" ? "إضافة مسوّق" : "إضافة إحالة"}</button>}</div>{!modal && feedback}
    {tab === "overview" && <>{cycle}<div className="stats">
      <Card label={isAdmin ? "إجمالي الإحالات" : "العملاء من طرفك"} value={isAdmin ? data.referrals.length : data.total} icon={Users}/>
      <Card label="الرصيد المعتمد" value={money(balance)} note="عمولات ما زالت في الرصيد" icon={Wallet}/>
      <Card label={isAdmin ? "المستحق في دورة الصرف" : "إجمالي العمولة المصروفة"} value={money(isAdmin ? marketers.reduce((sum, row) => sum + (due(row.id) >= minimum ? due(row.id) : 0), 0) : settled)} icon={CreditCard}/>
    </div>
    {!isAdmin && <section className="panel share"><div className="stat-icon"><Link2 size={20}/></div><div><h2>رابطك الخاص</h2><p>كود الإحالة <bdi>{data.member.code}</bdi> · العمولة {data.member.rate / 100}٪</p></div><button className="secondary" disabled={!data.linkReady || !data.member.active} onClick={() => copy(data.member.code)}><Copy size={16}/> نسخ الرابط</button></section>}
    {isAdmin && (!data.whatsapp || !marketers.length) && <section className="panel share"><div className="stat-icon"><Settings size={20}/></div><div><h2>{!data.whatsapp ? "فعّلي روابط واتساب" : "أضيفي أول مسوّق"}</h2><p>{!data.whatsapp ? "أضيفي رقم واتساب الستوديو لتجهيز وجهة الروابط." : "حددي الكود وكلمة المرور ونسبة العمولة."}</p></div><button className="secondary" onClick={() => !data.whatsapp ? go("settings") : setModal({ type: "marketer" })}>{!data.whatsapp ? "الإعدادات" : "إضافة مسوّق"}<ArrowUpLeft size={16}/></button></section>}
    <section className="panel"><div className="panel-head"><h2>آخر الإحالات</h2><button className="text-btn" onClick={() => go("referrals")}>كل الإحالات <ChevronLeft size={15}/></button></div>{referralTable(data.referrals.slice(0,5))}</section></>}
    {tab === "marketers" && isAdmin && <section className="panel"><div className="panel-head"><h2>حسابات المسوّقين</h2></div>{!marketers.length ? <Empty title="ما أضفتِ مسوّقين بعد" text="أضيفي الاسم والكود وكلمة المرور ونسبة العمولة المتفق عليها."/> : <div className="table-wrap"><table><thead><tr><th>اسم المسوّق</th><th>الكود</th><th>النسبة</th><th>الإحالات</th><th>الحالة</th><th>الإجراءات</th></tr></thead><tbody>{marketers.map(row => <tr key={row.id}><td><b>{row.name}</b></td><td><bdi>{row.code}</bdi></td><td>{row.rate / 100}٪</td><td>{data.referrals.filter(ref => ref.marketer === row.id).length}</td><td>{row.active ? "نشط" : "الرابط موقوف"}</td><td><div className="actions"><button className="text-btn" onClick={() => setModal({ type: "marketer", row })}>تعديل</button><button className="icon" disabled={!data.whatsapp || !row.active} onClick={() => copy(row.code)} aria-label={"نسخ رابط " + row.name}><Copy size={17}/></button></div></td></tr>)}</tbody></table></div>}</section>}
    {tab === "referrals" && <><section className="panel"><div className="panel-head"><h2>سجل الإحالات</h2></div>{referralTable(data.referrals)}</section>{isAdmin && data.history.length > 0 && <section className="panel"><div className="panel-head"><h2>سجل اعتماد العمولات</h2></div><div className="table-wrap"><table><thead><tr><th>الخدمة</th><th>التاريخ</th><th>الحالة</th><th>المستلم</th><th>العمولة</th></tr></thead><tbody>{data.history.map(row => <tr key={row.id}><td>{data.referrals.find(ref => ref.id === row.referral)?.project}</td><td>{displayDate(row.date)}</td><td><Badge state={row.state}/></td><td>{money(row.paid)}</td><td>{money(row.commission)}</td></tr>)}</tbody></table></div></section>}</>}
    {tab === "payouts" && <>{cycle}
      {isAdmin && <section className="panel"><div className="panel-head"><h2>أرصدة المسوّقين</h2></div>{!marketers.length ? <Empty title="لا توجد أرصدة" text="تظهر أرصدة المسوّقين وبيانات التحويل هنا."/> : <div className="table-wrap"><table><thead><tr><th>المسوّق</th><th>الرصيد المعتمد</th><th>المتاح للصرف</th><th>الوسيلة والمستفيد</th><th>بيانات التحويل</th><th>الإجراء</th></tr></thead><tbody>{marketers.map(row => { const eligible = due(row.id); return <tr key={row.id}><td><b>{row.name}</b></td><td>{money(unpaid.filter(ref => ref.marketer === row.id).reduce((sum, ref) => sum + ref.open, 0))}</td><td>{money(eligible >= minimum ? eligible : 0)}</td><td>{row.method ? methods[row.method] : "لم تُضف"}{row.beneficiary && <small>{row.beneficiary}</small>}</td><td><bdi>{row.account || "—"}</bdi></td><td><button className="secondary" disabled={eligible < minimum || !row.account} onClick={() => setModal({ type: "payout", row, amount: eligible })}>توثيق التحويل</button></td></tr>; })}</tbody></table></div>}</section>}
      <section className="panel"><div className="panel-head"><h2>الحوالات الموثّقة</h2></div>{data.payouts.length ? <div className="table-wrap"><table><thead><tr>{isAdmin && <th>المسوّق</th>}<th>المبلغ</th><th>التاريخ</th><th>الوسيلة</th>{isAdmin && <th>حساب المستفيد</th>}<th>مرجع الحوالة</th></tr></thead><tbody>{data.payouts.map(row => <tr key={row.id}>{isAdmin && <td>{marketerName(row.marketer)}</td>}<td><b>{money(row.amount)}</b></td><td>{displayDate(row.date)}</td><td>{methods[row.method]}</td>{isAdmin && <td>{row.beneficiary}<small><bdi>{row.account}</bdi></small></td>}<td><bdi>{row.reference}</bdi></td></tr>)}</tbody></table></div> : <Empty title="لا توجد حوالات موثّقة" text="يظهر المبلغ والتاريخ والمرجع بعد تسجيل الحوالة."/ >}</section></>}
    {tab === "settings" && <section className="panel form-panel"><h2>{isAdmin ? "إعدادات البرنامج" : "بيانات التحويل"}</h2>
    {isAdmin ? <form onSubmit={e => save(e, { action: "settings" })}><label>واتساب ستوديو ربى<input name="whatsapp" defaultValue={data.whatsapp} placeholder="05XXXXXXXX" dir="ltr" required/></label><label>تاريخ أول دورة صرف<input name="anchor" type="date" defaultValue={data.anchor} required/></label><p className="field-note">تتكرر دورة الصرف كل ١٤ يومًا بتوقيت الرياض.</p><button className="primary" disabled={busy}>حفظ الإعدادات <Check size={17}/></button></form> :
    <form onSubmit={e => save(e, { action: "details" })}><label>وسيلة التحويل<select name="method" value={method} onChange={e => setMethod(e.target.value as Method)}>{Object.entries(methods).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label><label>اسم المستفيد<input name="beneficiary" defaultValue={data.member.beneficiary ?? ""} required maxLength={100}/></label><label>{method === "bank" ? "الآيبان السعودي" : "رقم الجوال المرتبط بالمحفظة"}<input key={method} name="account" dir="ltr" defaultValue={data.member.method === method ? data.member.account ?? "" : ""} placeholder={method === "bank" ? "SA…" : "05XXXXXXXX"} required/></label><button className="primary" disabled={busy}>حفظ بيانات التحويل <Check size={17}/></button></form>}</section>}
    {tab === "settings" && <section className="panel form-panel"><h2>تغيير كلمة المرور</h2><form onSubmit={e => save(e, { action: "password" })}><PasswordField name="current" label="كلمة المرور الحالية"/><PasswordField label="كلمة المرور الجديدة" fresh/><button className="primary" disabled={busy}>تحديث كلمة المرور</button></form></section>}
    {tab === "policy" && <Policy/>}
    </div></main>
    {modal && isAdmin && <dialog open className="dialog" aria-modal="true" aria-labelledby="dialog-title" onKeyDown={e => { if (e.key === "Escape") setModal(null); }}><div className="dialog-body"><div className="panel-head"><h2 id="dialog-title">{modal.type === "marketer" ? (modal.row ? "تعديل المسوّق" : "إضافة مسوّق") : modal.type === "referral" ? "إضافة إحالة" : modal.type === "review" ? "مراجعة الإحالة" : "توثيق الحوالة"}</h2><button className="icon" onClick={() => setModal(null)} aria-label="إغلاق"><X size={20}/></button></div>{feedback}
    {modal.type === "marketer" && <form onSubmit={e => save(e, { action: "marketer", id: modal.row?.id })}><label>الاسم<input autoFocus name="name" defaultValue={modal.row?.name} required/></label><label>الكود واسم الدخول<input name="code" placeholder="مثال RAGHAD" dir="auto" defaultValue={modal.row?.code} required/></label><PasswordField label={modal.row ? "كلمة مرور جديدة (اختياري)" : "كلمة مرور المسوّق"} fresh required={!modal.row}/><label>نسبة العمولة ٪<input name="rate" type="number" min=".01" max="100" step=".01" defaultValue={modal.row ? modal.row.rate / 100 : undefined} required/></label>{modal.row && <label className="check"><input name="active" type="checkbox" defaultChecked={!!modal.row.active}/> رابط واتساب نشط</label>}<button className="primary" disabled={busy}>حفظ المسوّق</button></form>}
    {modal.type === "referral" && <form onSubmit={e => save(e, { action: "referral" })}><label>كود المسوّق<select autoFocus name="code" required defaultValue=""><option value="" disabled>اختاري الكود الظاهر في رسالة واتساب</option>{marketers.map(row => <option key={row.id} value={row.code}>{row.name} · {row.code}</option>)}</select></label><label>رقم واتساب العميل<input name="customer" placeholder="05XXXXXXXX" dir="ltr" type="tel" required/></label><label>نوع الخدمة أو مرجع المشروع<input name="project" placeholder="مثال بورتفوليو" required maxLength={150}/></label><button className="primary" disabled={busy || !marketers.length}>حفظ الإحالة</button></form>}
    {modal.type === "review" && <form onSubmit={e => save(e, { action: "review", id: modal.row.id })}><p className="field-note">{modal.row.project} · نسبة العمولة وقت الإحالة {Number(modal.row.rate) / 100}٪</p><label>الحالة<select autoFocus name="state" defaultValue={modal.row.state}>{Object.entries(states).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></label><label>إجمالي المستلم حتى الآن بالريال<input type="number" name="paid" min="0" step=".01" defaultValue={(modal.row.paid ?? 0) / 100}/></label><button className="primary" disabled={busy}>حفظ المراجعة</button></form>}
    {modal.type === "payout" && <form onSubmit={e => save(e, { action: "payout", id: modal.row.id, amount: modal.amount, method: modal.row.method, beneficiary: modal.row.beneficiary, account: modal.row.account })}><p className="field-note">{modal.row.name} · {money(modal.amount)} · {modal.row.method && methods[modal.row.method]}</p><p className="field-note">{modal.row.beneficiary} · <bdi>{modal.row.account}</bdi></p><label>مرجع الحوالة بعد تنفيذها<input autoFocus name="reference" dir="auto" required/></label><button className="primary" disabled={busy}>توثيق الحوالة المنفذة</button></form>}
    </div></dialog>}
  </div>;
}
