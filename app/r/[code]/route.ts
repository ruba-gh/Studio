import { env } from "cloudflare:workers";
import { formatWhatsAppMessage } from "../../../lib/studio";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ code: string }> }) {
  const { code } = await context.params;
  const db = env.DB;
  const row = db && await db.prepare(
    "SELECT s.whatsapp, s.whatsapp_message, m.code FROM marketers m CROSS JOIN settings s WHERE m.code = ? AND m.active = 1 AND m.archived_at IS NULL",
  ).bind(code.normalize("NFKC").toUpperCase()).first<{whatsapp: string; whatsapp_message: string | null; code: string}>();
  const headers = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };
  if (!row?.whatsapp) {
    return new Response("رابط المسوّق غير متاح حاليًا", { status: 404, headers: { ...headers, "Content-Type": "text/plain; charset=utf-8" } });
  }
  const url = new URL("https://wa.me/" + row.whatsapp);
  url.searchParams.set("text", formatWhatsAppMessage(row.whatsapp_message, row.code));
  return new Response(null, { status: 302, headers: { ...headers, Location: url.toString() } });
}
