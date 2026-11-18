import { db } from "./db.ts";
import { GET, OPTIONS, POST } from "./api.ts";

async function referral(path: string) {
  const code = decodeURIComponent(path).normalize("NFKC").toUpperCase();
  const row = await db.prepare("select m.code, s.whatsapp from marketers m cross join settings s where s.id=1 and m.active=1 and m.code=?")
    .bind(code).first<{ code: string; whatsapp: string }>();
  if (!row?.whatsapp) return new Response("رابط الإحالة غير متاح", { status: 404 });
  const url = new URL("https://wa.me/" + row.whatsapp);
  url.searchParams.set("text", "ارجو ارسال الكود لضمان حق المسوق (" + row.code + ")");
  return new Response(null, { status: 302, headers: { Location: url.href, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
}

const handlers = { GET, POST, OPTIONS };
Deno.serve(async (request) => {
  try {
    const path = new URL(request.url).pathname;
    const code = path.match(/\/studio\/r\/([^/]+)\/?$/)?.[1];
    if (code && request.method === "GET") return await referral(code);
    if (!path.match(/\/studio\/?$/)) return new Response("Not found", { status: 404 });
    const handler = handlers[request.method as keyof typeof handlers];
    return handler ? await handler(request) : new Response("Method not allowed", { status: 405 });
  } catch (error) {
    console.error("Studio request failed:", error instanceof Error ? error.message : "unexpected error");
    const response = Response.json({ error: "تعذر الاتصال بلوحة الشركاء." }, { status: 500 });
    if (request.headers.get("Origin") === "https://ruba-gh.github.io") {
      response.headers.set("Access-Control-Allow-Origin", "https://ruba-gh.github.io");
      response.headers.set("Vary", "Origin");
    }
    return response;
  }
});
