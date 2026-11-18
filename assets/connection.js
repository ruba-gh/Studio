const backend = "https://studio-ruba-partners.greykrill1024.chatgpt.site";
let token = "";

export async function api(payload) {
  const headers = { Accept: "application/json" };
  if (payload) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = "Bearer " + token;
  let response;
  try {
    response = await fetch(backend + "/api/studio", {
      method: payload ? "POST" : "GET",
      headers,
      body: payload ? JSON.stringify(payload) : undefined,
      credentials: "omit",
      cache: "no-store",
    });
  } catch {
    throw new Error("تعذر الاتصال بلوحة الشركاء. جرّبي مرة ثانية.");
  }
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "تعذر إتمام العملية.");
  if (typeof result.token === "string") token = result.token;
  return result;
}

export function clearSession() {
  token = "";
}

export function referralLink(code) {
  return backend + "/r/" + encodeURIComponent(code);
}
