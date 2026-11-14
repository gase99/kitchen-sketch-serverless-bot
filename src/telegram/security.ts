/** Constant-time comparison for the X-Telegram-Bot-Api-Secret-Token header. */
export function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const x = enc.encode(a);
  const y = enc.encode(b);
  let diff = x.length ^ y.length;
  const len = Math.max(x.length, y.length);
  for (let i = 0; i < len; i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

export function isAuthorizedWebhook(request: Request, secret: string): boolean {
  const header = request.headers.get("x-telegram-bot-api-secret-token");
  return !!secret && !!header && timingSafeEqual(header, secret);
}

export function isAllowedUser(userId: number | undefined, allowList: string | undefined): boolean {
  const ids = (allowList ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (ids.length === 0) return true;
  return userId !== undefined && ids.includes(String(userId));
}
