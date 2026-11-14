import type { Env } from "../env";
import { SessionStore } from "../storage/session";
import { TelegramApi } from "../telegram/api";
import { createVisionProvider, type VisionProvider } from "../vision";

export interface BotContext {
  env: Env;
  tg: TelegramApi;
  store: SessionStore;
  vision: () => VisionProvider;
  /** Public https origin of this deployment, used for "open in browser" links. */
  origin: string;
}

export function createContext(env: Env, origin: string): BotContext {
  const ttl = Number(env.SESSION_TTL_SECONDS) || undefined;
  return {
    env,
    tg: new TelegramApi(env.TELEGRAM_BOT_TOKEN),
    store: new SessionStore(env.SESSIONS, ttl),
    vision: () => createVisionProvider(env),
    origin,
  };
}
