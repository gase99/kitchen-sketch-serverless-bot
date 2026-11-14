#!/usr/bin/env node
// Finds or creates the Workers KV namespace and writes its id into wrangler.toml.
// Used by CI so a fresh fork deploys with zero manual Cloudflare dashboard steps.
//
//   CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=... node scripts/ensure-kv.mjs [title]
//
// Docs: https://developers.cloudflare.com/api/resources/kv/subresources/namespaces/
import { readFileSync, writeFileSync } from "node:fs";

const title = process.argv[2] || process.env.KV_NAMESPACE_TITLE || "kitchen-sketch-bot-sessions";
const token = process.env.CLOUDFLARE_API_TOKEN;
const account = process.env.CLOUDFLARE_ACCOUNT_ID;
if (!token || !account) {
  console.error("CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID are required");
  process.exit(1);
}

const base = `https://api.cloudflare.com/client/v4/accounts/${account}/storage/kv/namespaces`;
const headers = { authorization: `Bearer ${token}`, "content-type": "application/json" };

async function cf(url, init) {
  const res = await fetch(url, { headers, ...init });
  const data = await res.json();
  if (!data.success) throw new Error(`Cloudflare API: ${JSON.stringify(data.errors)}`);
  return data.result;
}

let namespace;
for (let page = 1; !namespace; page++) {
  const list = await cf(`${base}?per_page=100&page=${page}`);
  namespace = list.find((n) => n.title === title);
  if (list.length < 100) break;
}
if (!namespace) {
  namespace = await cf(base, { method: "POST", body: JSON.stringify({ title }) });
  console.log(`Created KV namespace "${title}"`);
} else {
  console.log(`Using existing KV namespace "${title}"`);
}

const toml = readFileSync("wrangler.toml", "utf8");
const updated = toml.replace(/(binding\s*=\s*"SESSIONS"\s*\nid\s*=\s*)"[^"]*"/, `$1"${namespace.id}"`);
if (updated === toml && !toml.includes(namespace.id)) throw new Error("Could not find the SESSIONS kv_namespaces entry in wrangler.toml");
writeFileSync("wrangler.toml", updated);
