import type { Env } from "./env";
import { createContext } from "./handlers/context";
import { handleUpdate } from "./handlers/update";
import { SessionStore } from "./storage/session";
import { isAuthorizedWebhook } from "./telegram/security";
import type { Update } from "./telegram/types";

/**
 * Cloudflare Worker entry point. Every request is an independent, short-lived invocation:
 *
 *   POST /webhook      Telegram → bot (secured with X-Telegram-Bot-Api-Secret-Token)
 *   GET  /view/:id     HTML page showing a rendered plan / layout (SVG stored in KV)
 *   GET  /view/:id.svg raw SVG
 *   GET  /             health check
 *
 * The webhook acknowledges Telegram immediately (HTTP 200) and continues the slow work
 * (file download, Vision AI call, rendering) in ctx.waitUntil(), so Telegram never times out
 * or re-delivers the update while the AI is thinking.
 */
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/webhook") {
      if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
      if (!isAuthorizedWebhook(request, env.TELEGRAM_WEBHOOK_SECRET)) return new Response("Unauthorized", { status: 401 });

      let update: Update;
      try {
        update = await request.json<Update>();
      } catch {
        return new Response("Bad Request", { status: 400 });
      }
      const botCtx = createContext(env, url.origin);
      ctx.waitUntil(
        handleUpdate(botCtx, update).catch((err) => console.error("update failed", update.update_id, err)),
      );
      return new Response("ok");
    }

    const view = url.pathname.match(/^\/view\/([a-f0-9]{32})(\.svg)?$/);
    if (view && request.method === "GET") {
      const svg = await new SessionStore(env.SESSIONS).getDrawing(view[1]);
      if (!svg) return new Response("Not found or expired", { status: 404 });
      const headers = {
        "cache-control": "private, max-age=3600",
        "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; img-src data:",
        "x-content-type-options": "nosniff",
      };
      if (view[2]) return new Response(svg, { headers: { ...headers, "content-type": "image/svg+xml; charset=utf-8" } });
      return new Response(viewerHtml(svg, view[1]), { headers: { ...headers, "content-type": "text/html; charset=utf-8" } });
    }

    if (url.pathname === "/" && request.method === "GET") {
      return Response.json({ ok: true, service: "kitchen-sketch-serverless-bot" });
    }
    return new Response("Not Found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;

function viewerHtml(svg: string, id: string): string {
  const inline = svg.replace(/ width="\d+" height="\d+"/, ' width="100%"');
  return `<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Kitchen plan</title>
<style>body{margin:0;font-family:Tahoma,sans-serif;background:#f4f4f4}main{max-width:1100px;margin:auto;padding:12px}
.card{background:#fff;border-radius:12px;padding:8px;box-shadow:0 1px 4px #0002}a{display:inline-block;margin:12px 4px;color:#1565c0}</style>
</head><body><main><div class="card" dir="ltr">${inline}</div><a href="/view/${id}.svg" download="kitchen.svg">⬇️ دانلود SVG</a></main></body></html>`;
}
