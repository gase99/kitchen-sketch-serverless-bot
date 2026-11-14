export interface Env {
  SESSIONS: KVNamespace;

  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_WEBHOOK_SECRET: string;

  VISION_PROVIDER?: "gemini" | "openai";
  GEMINI_API_KEY?: string;
  GEMINI_MODEL?: string;
  /** Gemini 3+ thinking level: minimal | low | medium | high ("" disables the override). */
  GEMINI_THINKING_LEVEL?: string;
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
  OPENAI_BASE_URL?: string;

  /** Comma-separated Telegram user IDs. Empty = everyone may use the bot. */
  ALLOWED_USER_IDS?: string;
  /** Lifetime of conversation state and rendered drawings, in seconds. */
  SESSION_TTL_SECONDS?: string;
}
