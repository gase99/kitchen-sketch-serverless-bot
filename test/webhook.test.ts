import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import worker from "../src/index";
import type { Env } from "../src/env";
import sample from "../examples/sample-sketch.json";
import { FakeKV } from "./helpers";

const TOKEN = "123:TEST";
const SECRET = "s3cr3t_token";

type Call = { method: string; body: any };

function setup() {
  const kv = new FakeKV();
  const env = {
    SESSIONS: kv as unknown as KVNamespace,
    TELEGRAM_BOT_TOKEN: TOKEN,
    TELEGRAM_WEBHOOK_SECRET: SECRET,
    VISION_PROVIDER: "gemini",
    GEMINI_API_KEY: "g-key",
  } satisfies Env;
  const calls: Call[] = [];
  let geminiRequest: any;

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.startsWith(`https://api.telegram.org/file/bot${TOKEN}/`)) {
      // Telegram's file server really answers with a generic content type.
      return new Response(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]), { headers: { "content-type": "application/octet-stream" } });
    }
    if (url.startsWith(`https://api.telegram.org/bot${TOKEN}/`)) {
      const method = url.split("/").pop()!;
      let body: any = {};
      if (init?.body instanceof FormData) body = Object.fromEntries(init.body.entries());
      else if (typeof init?.body === "string") body = JSON.parse(init.body);
      calls.push({ method, body });
      const result =
        method === "getFile" ? { file_id: "f", file_unique_id: "u", file_path: "photos/file_1.jpg" } : { message_id: calls.length, chat: { id: 1 } };
      return Response.json({ ok: true, result });
    }
    if (url.includes("generativelanguage.googleapis.com")) {
      geminiRequest = JSON.parse(String(init?.body));
      return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify(sample) }] } }] });
    }
    throw new Error(`Unexpected fetch ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);

  const send = async (update: unknown, secret = SECRET) => {
    const pending: Promise<unknown>[] = [];
    const ctx = { waitUntil: (p: Promise<unknown>) => pending.push(p), passThroughOnException() {} } as unknown as ExecutionContext;
    const res = await worker.fetch(
      new Request("https://bot.example.workers.dev/webhook", {
        method: "POST",
        headers: { "content-type": "application/json", "x-telegram-bot-api-secret-token": secret },
        body: JSON.stringify(update),
      }) as any,
      env,
      ctx,
    );
    await Promise.all(pending);
    return res;
  };

  return { env, kv, calls, send, gemini: () => geminiRequest };
}

const from = { id: 42, is_bot: false, first_name: "Ali" };
const chat = { id: 1, type: "private" as const };

describe("webhook", () => {
  beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => undefined));
  afterEach(() => vi.unstubAllGlobals());

  it("rejects requests without the secret token", async () => {
    const { send, calls } = setup();
    const res = await send({ update_id: 1 }, "wrong");
    expect(res.status).toBe(401);
    expect(calls).toHaveLength(0);
  });

  it("runs the full sketch → plan → layout → finish flow", async () => {
    const { send, calls, kv, gemini } = setup();

    const res = await send({
      update_id: 10,
      message: {
        message_id: 1,
        from,
        chat,
        date: 0,
        photo: [
          { file_id: "small", file_unique_id: "a", width: 320, height: 240 },
          { file_id: "large", file_unique_id: "b", width: 1280, height: 960 },
        ],
      },
    });
    expect(res.status).toBe(200);
    expect(calls.find((c) => c.method === "getFile")?.body.file_id).toBe("large");
    expect(gemini().contents[0].parts[0].inlineData).toEqual({ mimeType: "image/jpeg", data: "/9j/4A==" });
    const planDoc = calls.find((c) => c.method === "sendDocument")!;
    expect(planDoc.body.caption).toContain("پلان دوبعدی");
    expect(JSON.parse(planDoc.body.reply_markup).inline_keyboard[0][0].callback_data).toBe("plan:ok");
    expect(JSON.parse(String(kv.store.get("session:1"))).stage).toBe("plan_review");

    calls.length = 0;
    await send({ update_id: 11, message: { message_id: 2, from, chat, date: 0, text: "W1=۴۰۰" } });
    expect(calls.find((c) => c.method === "sendDocument")?.body.caption).toContain("W1→ 400");

    calls.length = 0;
    await send({ update_id: 12, callback_query: { id: "cb", from, message: { message_id: 5, chat, date: 0 }, data: "plan:ok" } });
    expect(calls[0].method).toBe("answerCallbackQuery");
    const layoutDoc = calls.find((c) => c.method === "sendDocument")!;
    expect(layoutDoc.body.caption).toContain("چیدمان پیشنهادی");
    expect(String(layoutDoc.body.document.name ?? "")).toMatch(/kitchen-layout-/);
    expect(JSON.parse(String(kv.store.get("session:1"))).stage).toBe("layout_review");

    calls.length = 0;
    await send({ update_id: 13, callback_query: { id: "cb2", from, message: { message_id: 6, chat, date: 0 }, data: "layout:done" } });
    expect(calls.find((c) => c.method === "sendMessage")?.body.text).toContain("لیست یونیت‌ها");
    expect(JSON.parse(String(kv.store.get("session:1"))).stage).toBe("done");
  });

  it("serves rendered drawings from KV", async () => {
    const { send, kv, env } = setup();
    await send({ update_id: 20, message: { message_id: 1, from, chat, date: 0, photo: [{ file_id: "x", file_unique_id: "x", width: 800, height: 600 }] } });
    const key = [...kv.store.keys()].find((k) => k.startsWith("drawing:"))!;
    const id = key.slice("drawing:".length);
    const ctx = { waitUntil() {}, passThroughOnException() {} } as unknown as ExecutionContext;
    const html = await worker.fetch(new Request(`https://bot.example/view/${id}`) as any, env, ctx);
    expect(html.headers.get("content-type")).toContain("text/html");
    const svg = await worker.fetch(new Request(`https://bot.example/view/${id}.svg`) as any, env, ctx);
    expect(await svg.text()).toMatch(/^<svg/);
    const missing = await worker.fetch(new Request(`https://bot.example/view/${"0".repeat(32)}`) as any, env, ctx);
    expect(missing.status).toBe(404);
  });

  it("reports a friendly error when the AI output is unusable", async () => {
    const { send, calls } = setup();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes("generativelanguage")) return Response.json({ candidates: [{ content: { parts: [{ text: '{"walls":[]}' }] } }] });
        if (url.includes("/file/bot")) return new Response(new Uint8Array([1]));
        const method = url.split("/").pop()!;
        calls.push({ method, body: typeof init?.body === "string" ? JSON.parse(init.body) : {} });
        return Response.json({ ok: true, result: method === "getFile" ? { file_path: "a.jpg" } : { message_id: 1 } });
      }),
    );
    await send({ update_id: 30, message: { message_id: 1, from, chat, date: 0, photo: [{ file_id: "x", file_unique_id: "x", width: 800, height: 600 }] } });
    expect(calls.find((c) => c.method === "editMessageText")?.body.text).toContain("❌");
  });
});
