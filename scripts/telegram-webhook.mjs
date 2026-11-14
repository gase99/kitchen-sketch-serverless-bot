#!/usr/bin/env node
// Manage the Telegram webhook without any server: set | info | delete
//
//   TELEGRAM_BOT_TOKEN=... TELEGRAM_WEBHOOK_SECRET=... WORKER_URL=https://<name>.<sub>.workers.dev \
//     node scripts/telegram-webhook.mjs set
//
// Docs: https://core.telegram.org/bots/api#setwebhook

const [, , command = "info"] = process.argv;
const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) fail("TELEGRAM_BOT_TOKEN is required");

const api = async (method, params = {}) => {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(params),
  });
  const data = await res.json();
  if (!data.ok) fail(`${method}: ${data.description}`);
  return data.result;
};

const COMMANDS = [
  { command: "start", description: "شروع و راهنما" },
  { command: "new", description: "شروع طرح جدید" },
  { command: "plan", description: "نمایش دوبارهٔ پلان فعلی" },
  { command: "help", description: "راهنما" },
];

switch (command) {
  case "set": {
    const base = (process.env.WORKER_URL || "").replace(/\/$/, "");
    const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
    if (!base.startsWith("https://")) fail("WORKER_URL must be an https:// URL");
    if (!secret || !/^[A-Za-z0-9_-]{1,256}$/.test(secret)) fail("TELEGRAM_WEBHOOK_SECRET must be 1-256 chars of A-Z a-z 0-9 _ -");
    await api("setWebhook", {
      url: `${base}/webhook`,
      secret_token: secret,
      allowed_updates: ["message", "callback_query"],
      max_connections: 40,
      drop_pending_updates: process.env.DROP_PENDING_UPDATES === "true",
    });
    await api("setMyCommands", { commands: COMMANDS });
    console.log(`Webhook set to ${base}/webhook`);
    print(await api("getWebhookInfo"));
    break;
  }
  case "info":
    print(await api("getWebhookInfo"));
    break;
  case "delete":
    await api("deleteWebhook", { drop_pending_updates: false });
    console.log("Webhook deleted");
    break;
  default:
    fail(`Unknown command "${command}". Use: set | info | delete`);
}

function print(info) {
  const { url, pending_update_count, last_error_date, last_error_message } = info;
  console.log(JSON.stringify({ url, pending_update_count, last_error_date, last_error_message }, null, 2));
}

function fail(msg) {
  console.error(`Error: ${msg}`);
  process.exit(1);
}
