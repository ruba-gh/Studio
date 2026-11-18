import { api, clearSession, referralLink } from "./connection.js";

const select = (selector) => document.querySelector(selector);
const modal = select("#modal");
const labels = {
  overview: ["نظرة عامة", "تابعي نشاط الشركاء والرصيد ومواعيد الصرف."],
  marketers: ["المسوّقون", "إدارة الحسابات والأكواد ونسب العمولة."],
  referrals: ["الإحالات", "تسجيل الطلبات ومراجعة العمولات."],
  payouts: ["التحويلات", "الأرصدة المستحقة وسجل الحوالات."],
  settings: ["الإعدادات", "إعدادات الحساب والبرنامج."],
  policy: ["سياسة العمولات", "آلية تسجيل الإحالات واعتماد العمولة وصرفها."],
};
const states = { pending: "بانتظار الدفع", approved: "عمولة معتمدة", cancelled: "ملغي" };
const methods = { barq: "برق", stc: "STC", bank: "حوالة بنكية" };
const currency = new Intl.NumberFormat("ar-SA", { maximumFractionDigits: 2 });
const dates = new Intl.DateTimeFormat("ar-SA-u-ca-gregory", { dateStyle: "medium", timeZone: "Asia/Riyadh" });
const minimum = 10000;
let data;
let section = "overview";
let inFlight = false;
let lastModalTrigger;
let filter = { query: "", state: "" };

function safe(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
}
const money = (halalas) => currency.format((Number(halalas) || 0) / 100) + " ر.س";
const date = (value) => value ? dates.format(new Date(value)) : "—";
const isAdmin = () => data.role === "admin";
const marketers = () => isAdmin() ? data.marketers : [data.member];
const nameOf = (id) => marketers().find((member) => member.id === id)?.name ?? "—";
const sum = (rows, field) => rows.reduce((total, row) => total + (Number(row[field]) || 0), 0);
const eligible = (id) => data.timing.eligible ? sum(data.referrals.filter((row) => row.marketer === id), "due") : 0;
const markup = (value) => "<bdi>" + safe(value) + "</bdi>";

function feedback(selector, text, error = false) {
  const element = select(selector);
  element.hidden = !text;
  element.textContent = text;
  element.classList.toggle("error", error);
  if (selector === "#dashboard-feedback") element.setAttribute("role", error ? "alert" : "status");
}

function action(label, command, options = {}) {
  return `<button type="button" class="button ${options.variant || "subtle"}" data-action="${command}" ${options.id ? `data-id="${safe(options.id)}"` : ""} ${options.disabled ? "disabled" : ""}>${safe(label)}</button>`;
}
function panel(title, content, extra = "") {
  return `<section class="panel"><header class="panel-heading"><h2>${safe(title)}</h2>${extra}</header>${content}</section>`;
}
function empty(title, description) {
  return `<div class="empty"><strong>${safe(title)}</strong><p>${safe(description)}</p></div>`;
}
function table(columns, rows, onEmpty) {
  if (!rows.length) return onEmpty;
  return `<div class="table-wrap" tabindex="0"><table><thead><tr>${columns.map((name) => `<th scope="col">${safe(name)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}
function badge(status, paid = false) {
  return `<span class="badge ${paid ? "paid" : safe(status)}">${paid ? "تم الصرف" : safe(states[status] ?? status)}</span>`;
}
function cycle() {
  const days = data.timing.days;
  return `<div class="panel cycle split-bar"><div><h2>دورة الصرف</h2><p>${date(data.timing.date)} · الحد الأدنى ${money(minimum)}</p></div><strong>${days === 0 ? "موعد الصرف اليوم" : `متبقي ${currency.format(days)} يوم`}</strong></div>`;
}

function referralsTable(rows, searched = false) {
  const admin = isAdmin();
  const columns = admin
    ? ["الخدمة", "المسوّق", "رقم العميل", "المستلم", "التاريخ", "الحالة", "العمولة", "الإجراء"]
    : ["الخدمة", "التاريخ", "الحالة", "العمولة"];
  return table(columns, rows.map((row) => [
    safe(row.project),
    ...(admin ? [safe(nameOf(row.marketer)), markup(row.customer), money(row.paid)] : []),
    date(row.date), badge(row.state, row.commission > 0 && row.open === 0), money(row.commission),
    ...(admin ? [action("مراجعة", "review", { id: row.id })] : []),
  ]), searched ? empty("ما فيه نتائج", "جرّبي تغيير البحث أو الفلتر.") : empty("ما فيه إحالات حتى الآن", admin ? "تقدرين تضيفين إحالة من كود المسوّق." : "تظهر هنا الطلبات اللي تسجلت بكودك."));
}

function overview() {
  const cards = [
    [isAdmin() ? "إجمالي الإحالات" : "عملاء من طرفك", currency.format(isAdmin() ? data.referrals.length : data.total)],
    ["الرصيد المعتمد", money(sum(data.referrals, "open"))],
    [isAdmin() ? "المتاح للصرف" : "العمولات المصروفة", money(isAdmin()
      ? marketers().map(({ id }) => eligible(id)).filter((value) => value >= minimum).reduce((total, value) => total + value, 0)
      : sum(data.payouts, "amount"))],
  ];
  const cardView = cards.map(([label, value]) => `<article class="card"><span>${label}</span><strong>${value}</strong></article>`).join("");
  let link = "";
  if (!isAdmin()) {
    link = `<section class="panel panel-body split-bar"><div><h2>رابط الإحالة</h2><p class="muted">${markup(data.member.code)} · عمولة ${currency.format(data.member.rate / 100)}٪</p></div>${action("نسخ الرابط", "copy", { id: data.member.id, variant: "secondary", disabled: !data.linkReady })}</section>`;
  } else if (!data.whatsapp) {
    link = `<section class="panel panel-body split-bar"><div><h2>رقم واتساب الستوديو</h2><p class="muted">أضيفي الرقم لتفعيل روابط الإحالة.</p></div>${action("الإعدادات", "settings", { variant: "secondary" })}</section>`;
  }
  return `<div class="cards">${cardView}</div>${cycle()}${link}${panel("آخر الإحالات", referralsTable(data.referrals.slice(0, 5)), action("عرض الكل", "referrals"))}`;
}

function marketerPage() {
  return panel("حسابات المسوّقين", table(["الاسم", "الكود", "العمولة", "الإحالات", "الحالة", "الإجراءات"], marketers().map((row) => [
    safe(row.name), markup(row.code), currency.format(row.rate / 100) + "٪",
    currency.format(data.referrals.filter((referral) => referral.marketer === row.id).length),
    row.active ? "نشط" : "موقوف",
    `<div class="cell-actions">${action("تعديل", "edit-marketer", { id: row.id })}${action("نسخ الرابط", "copy", { id: row.id, disabled: !data.whatsapp || !row.active })}</div>`,
  ]), empty("ما فيه مسوّقون حتى الآن", "أضيفي اسم المسوّق وكوده ونسبة العمولة.")));
}

function referralsPage() {
  const history = isAdmin() && data.history.length ? panel("سجل اعتماد العمولات", table(["الخدمة", "التاريخ", "الحالة", "المستلم", "العمولة"], data.history.map((row) => [
    safe(data.referrals.find((referral) => referral.id === row.referral)?.project),
    date(row.date), badge(row.state), money(row.paid), money(row.commission),
  ]))) : "";
  return panel("سجل الإحالات", `<div class="panel-body search-bar">
    <label>بحث<input id="search-referrals" type="search" value="${safe(filter.query)}" placeholder="ابحثي في الإحالات"></label>
    ${choose("حالة الإحالة", "referral-state", { "": "جميع الحالات", ...states, paid: "تم الصرف" }, filter.state, false)}
    </div><div id="referral-results"></div>`) + history;
}
function filterReferrals() {
  const query = filter.query.trim().toLocaleLowerCase("ar");
  const rows = data.referrals.filter((row) => {
    const state = row.commission > 0 && row.open === 0 ? "paid" : row.state;
    const text = [row.project, isAdmin() ? nameOf(row.marketer) : "", isAdmin() ? row.customer : ""].join(" ").toLocaleLowerCase("ar");
    return (!filter.state || state === filter.state) && (!query || text.includes(query));
  });
  select("#referral-results").innerHTML = referralsTable(rows, Boolean(query || filter.state));
}

function payoutsPage() {
  const amounts = isAdmin() ? panel("أرصدة المسوّقين", table(["المسوّق", "الرصيد المعتمد", "المتاح للصرف", "وسيلة التحويل", "المستفيد", "الحساب", "الإجراء"], marketers().map((row) => {
    const available = eligible(row.id);
    return [
      safe(row.name), money(sum(data.referrals.filter((referral) => referral.marketer === row.id), "open")), money(available >= minimum ? available : 0), safe(methods[row.method] || "—"),
      safe(row.beneficiary || "—"), markup(row.account || "—"), action("توثيق حوالة", "payout", { id: row.id, disabled: available < minimum || !row.account }),
    ];
  }), empty("ما فيه أرصدة", "تظهر بيانات الصرف عند إضافة المسوّقين."))) : "";
  const admin = isAdmin();
  const history = table([...(admin ? ["المسوّق"] : []), "المبلغ", "التاريخ", "الوسيلة", "المرجع"], data.payouts.map((row) => [
    ...(admin ? [safe(nameOf(row.marketer))] : []), money(row.amount), date(row.date), safe(methods[row.method]), markup(row.reference),
  ]), empty("ما فيه حوالات موثّقة", "تظهر الحوالة هنا بعد تسجيلها."));
  return cycle() + amounts + panel("الحوالات الموثّقة", history);
}

function input(label, name, value = "", { type = "text", required = true, dir = "auto", attrs = "" } = {}) {
  return `<label>${safe(label)}<input name="${name}" value="${safe(value)}" type="${type}" dir="${dir}" ${required ? "required" : ""} ${attrs}></label>`;
}
function password(label, name = "password", fresh = false, required = true) {
  return `<label>${label}<span class="password-box"><input name="${name}" type="password" dir="ltr" autocomplete="${fresh ? "new-password" : "current-password"}" ${fresh ? 'minlength="10"' : ""} maxlength="128" ${required ? "required" : ""}><button type="button" data-show aria-label="إظهار كلمة المرور">إظهار</button></span></label>`;
}
function choose(label, name, options, current = "", required = true) {
  return `<label>${label}<select name="${name}" ${required ? "required" : ""}>${Object.entries(options).sort(([left], [right]) => Number(Boolean(left)) - Number(Boolean(right))).map(([key, value]) => `<option value="${safe(key)}" ${key === current ? "selected" : ""}>${safe(value)}</option>`).join("")}</select></label>`;
}
function form(command, fields, label = "حفظ") {
  return `<form data-submit="${command}">${fields}<div><button class="button primary" type="submit">${label}</button></div></form>`;
}
function settingsPage() {
  const member = data.member;
  const details = isAdmin() ? form("settings",
    input("رقم واتساب الستوديو", "whatsapp", data.whatsapp, { type: "tel", dir: "ltr" }) +
    input("تاريخ أول دورة صرف", "anchor", data.anchor, { type: "date", dir: "ltr" }) + "<p class='muted'>تتكرر الدورة كل ١٤ يومًا بتوقيت الرياض.</p>"
  ) : form("details",
    choose("وسيلة التحويل", "method", methods, member.method || "barq") +
    input("اسم المستفيد", "beneficiary", member.beneficiary) +
    input(member.method === "bank" ? "الآيبان السعودي" : "رقم الجوال المرتبط بالمحفظة", "account", member.account, { dir: "ltr" })
  );
  return panel(isAdmin() ? "إعدادات البرنامج" : "بيانات التحويل", `<div class="panel-body">${details}</div>`)
    + panel("تغيير كلمة المرور", `<div class="panel-body">${form("password", password("كلمة المرور الحالية", "current") + password("كلمة المرور الجديدة", "password", true), "تحديث كلمة المرور")}</div>`);
}
function policyPage() {
  return panel("سياسة العمولات", `<dl class="panel-body">
    <dt>تسجيل الإحالة</dt><dd>يفتح رابط المسوّق واتساب برسالة فيها كوده. بعد ما يرسلها العميل، تسجل الإدارة طلبه باسم صاحب الكود.</dd>
    <dt>اعتماد العمولة</dt><dd>تُحسب العمولة بالنسبة المتفق عليها من المبلغ المستلم فعليًا. تُعتمد عمولة العربون عند استلامه، وتضاف عمولة الدفعة التالية عند استلامها. الطلبات الملغاة ما عليها عمولة.</dd>
    <dt>الصرف</dt><dd>تُراجع العمولات كل أسبوعين. الحد الأدنى للتحويل ١٠٠ ريال، ويترحل الرصيد الأقل للدورة التالية.</dd>
    <dt>بيانات التحويل</dt><dd>تقدرين تختارين برق أو STC أو حوالة بنكية من الإعدادات. يظهر مبلغ التحويل وتاريخه ومرجعه بعد توثيق الحوالة.</dd>
  </dl>`);
}

function showPage() {
  const pages = { overview, marketers: marketerPage, referrals: referralsPage, payouts: payoutsPage, settings: settingsPage, policy: policyPage };
  const nav = select("#nav");
  const canUse = Object.keys(labels).filter((key) => key !== "marketers" || isAdmin());
  nav.innerHTML = canUse.map((key) => `<button class="button subtle nav-button" type="button" data-nav="${key}" ${section === key ? 'aria-current="page"' : ""}>${labels[key][0]}</button>`).join("");
  select("#breadcrumb").textContent = isAdmin() ? "لوحة الإدارة" : "لوحة المسوّق";
  const profile = isAdmin() ? "ستوديو ربى" : data.member.name;
  select("#profile").innerHTML = `<span class="avatar" aria-hidden="true">${safe(isAdmin() ? "ر" : profile[0])}</span><span><b>${safe(profile)}</b><small>${isAdmin() ? "الإدارة" : "مسوّق"}</small></span>`;
  select("#page-title").textContent = labels[section][0];
  select("#page-summary").textContent = labels[section][1];
  const add = select("#page-action");
  add.hidden = !isAdmin() || !["overview", "marketers", "referrals"].includes(section);
  add.dataset.action = section === "marketers" ? "edit-marketer" : "referral";
  add.textContent = section === "marketers" ? "إضافة مسوّق" : "إضافة إحالة";
  select("#page").innerHTML = pages[section]();
  if (section === "referrals") filterReferrals();
}

function go(next) {
  section = next;
  select("#sidebar").classList.remove("open");
  select("#menu").setAttribute("aria-expanded", "false");
  feedback("#dashboard-feedback", "");
  showPage();
  select("#page-title").tabIndex = -1;
  select("#page-title").focus();
}

function showLogin(message = "") {
  data = undefined;
  clearSession();
  section = "overview";
  filter = { query: "", state: "" };
  if (modal.open) modal.close();
  select("#modal-content").replaceChildren();
  select("#page").replaceChildren();
  select("#profile").replaceChildren();
  select("#nav").replaceChildren();
  select("#dashboard").hidden = true;
  select("#login").hidden = false;
  const loginForm = select("#sign-in");
  loginForm.reset();
  const field = loginForm.elements.namedItem("password");
  if (field.type === "text") loginForm.querySelector("[data-show]").click();
  feedback("#login-error", message, true);
}

function openModal(command, id, trigger) {
  if (!isAdmin()) return;
  const member = marketers().find((row) => row.id === id);
  const referral = data.referrals.find((row) => row.id === id);
  const available = eligible(id);
  let title, fields;
  if (command === "edit-marketer") {
    title = member ? "تعديل المسوّق" : "إضافة مسوّق";
    fields = input("الاسم", "name", member?.name, { attrs: 'maxlength="100"' })
      + input("الكود واسم الدخول", "code", member?.code, { attrs: 'maxlength="40"' })
      + password(member ? "كلمة مرور جديدة (اختياري)" : "كلمة مرور المسوّق", "password", true, !member)
      + input("نسبة العمولة ٪", "rate", member ? member.rate / 100 : "", { type: "number", attrs: 'min=".01" max="100" step=".01"' })
      + (member ? `<input type="hidden" name="id" value="${safe(member.id)}"><label class="checkbox"><input type="checkbox" name="active" ${member.active ? "checked" : ""}>الحساب والرابط نشطان</label>` : "");
  } else if (command === "referral") {
    const active = marketers();
    if (!active.length) {
      go("marketers");
      feedback("#dashboard-feedback", "أضيفي مسوّق قبل تسجيل إحالة.", true);
      return;
    }
    title = "إضافة إحالة";
    fields = choose("المسوّق", "code", Object.fromEntries([["", "اختاري مسوّقًا"], ...active.map((row) => [row.code, row.name + " · " + row.code])]))
      + input("رقم العميل", "customer", "", { type: "tel", dir: "ltr" })
      + input("الخدمة أو مرجع المشروع", "project", "", { attrs: 'maxlength="150"' });
  } else if (command === "review" && referral) {
    title = "مراجعة الإحالة";
    fields = `<p class="muted">${safe(referral.project)} · نسبة العمولة ${currency.format(referral.rate / 100)}٪</p><input type="hidden" name="id" value="${safe(referral.id)}">`
      + choose("الحالة", "state", states, referral.state)
      + input("إجمالي المستلم بالريال", "paid", referral.paid / 100, { type: "number", attrs: 'min="0" step=".01"' });
  } else if (command === "payout" && member && member.account && available >= minimum) {
    title = "توثيق الحوالة";
    fields = `<p class="muted">${safe(member.name)} · ${money(available)} · ${safe(methods[member.method])}<br>${safe(member.beneficiary)} · ${markup(member.account)}</p>`
      + ["id", "amount", "method", "beneficiary", "account"].map((key) => `<input type="hidden" name="${key}" value="${safe(key === "amount" ? available : member[key])}">`).join("")
      + input("مرجع الحوالة المنفذة", "reference");
  } else return;
  select("#modal-title").textContent = title;
  select("#modal-content").innerHTML = form(command === "edit-marketer" ? "marketer" : command, fields, command === "payout" ? "توثيق الحوالة" : "حفظ");
  feedback("#modal-error", "");
  lastModalTrigger = trigger;
  modal.showModal();
}

async function copyLink(id) {
  const member = marketers().find((row) => row.id === id);
  if (!member) return;
  const link = referralLink(member.code);
  try {
    await navigator.clipboard.writeText(link);
    feedback("#dashboard-feedback", "تم نسخ رابط الإحالة.");
  } catch {
    feedback("#dashboard-feedback", link);
  }
}
async function refresh() {
  const result = await api();
  if (result.role !== "admin" && result.role !== "marketer") {
    showLogin("انتهت الجلسة. سجلي الدخول من جديد.");
    return false;
  }
  data = result;
  select("#login").hidden = true;
  select("#dashboard").hidden = false;
  showPage();
  return true;
}

document.addEventListener("click", (event) => {
  const item = event.target.closest("button");
  if (!item) return;
  if (item.hasAttribute("data-show")) {
    const field = item.previousElementSibling;
    const reveal = field.type === "password";
    field.type = reveal ? "text" : "password";
    item.textContent = reveal ? "إخفاء" : "إظهار";
    item.setAttribute("aria-label", reveal ? "إخفاء كلمة المرور" : "إظهار كلمة المرور");
  }
  if (item.hasAttribute("data-close")) modal.close();
  if (item.dataset.nav) go(item.dataset.nav);
  const command = item.dataset.action;
  if (["settings", "referrals"].includes(command)) go(command);
  if (command === "copy") void copyLink(item.dataset.id);
  if (["edit-marketer", "referral", "review", "payout"].includes(command)) openModal(command, item.dataset.id, item);
});
modal.addEventListener("close", () => {
  select("#modal-content").replaceChildren();
  if (lastModalTrigger?.isConnected) lastModalTrigger.focus();
});
select("#menu").addEventListener("click", (event) => {
  const open = select("#sidebar").classList.toggle("open");
  event.currentTarget.setAttribute("aria-expanded", String(open));
});
select("#sign-out").addEventListener("click", async () => {
  if (inFlight) return;
  try {
    await api({ action: "logout" });
    showLogin();
  } catch {
    showLogin("تم إغلاق لوحة حسابك. تعذر تأكيد تسجيل الخروج على الخادم.");
  }
});
document.addEventListener("input", (event) => {
  if (event.target.id !== "search-referrals") return;
  filter.query = event.target.value;
  filterReferrals();
});
document.addEventListener("change", (event) => {
  if (event.target.name === "referral-state") {
    filter.state = event.target.value;
    filterReferrals();
  }
  if (event.target.name === "method") {
    const account = event.target.form.elements.namedItem("account");
    account.labels[0].firstChild.textContent = event.target.value === "bank" ? "الآيبان السعودي" : "رقم الجوال المرتبط بالمحفظة";
    account.value = event.target.value === data.member.method ? (data.member.account || "") : "";
  }
});
document.addEventListener("submit", async (event) => {
  const element = event.target;
  if (element.id !== "sign-in" && !element.dataset.submit) return;
  event.preventDefault();
  if (inFlight) return;
  const command = element.id === "sign-in" ? "login" : element.dataset.submit;
  const feedbackBox = command === "login" ? "#login-error" : modal.open ? "#modal-error" : "#dashboard-feedback";
  feedback(feedbackBox, "");
  const submit = element.querySelector("[type=submit]");
  submit.disabled = true;
  inFlight = true;
  try {
    await api({ ...Object.fromEntries(new FormData(element)), action: command });
    if (modal.open) modal.close();
    if (command === "login") element.reset();
    if (await refresh() && command !== "login") feedback("#dashboard-feedback", "تم الحفظ.");
  } catch (error) {
    feedback(modal.open || feedbackBox !== "#modal-error" ? feedbackBox : "#dashboard-feedback", error.message, true);
  } finally {
    inFlight = false;
    submit.disabled = false;
  }
});
