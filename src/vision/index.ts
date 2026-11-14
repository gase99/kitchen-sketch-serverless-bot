import type { Env } from "../env";
import { GeminiVision } from "./gemini";
import { OpenAIVision } from "./openai";
import type { VisionProvider } from "./types";

export type { VisionInput, VisionProvider } from "./types";

export function createVisionProvider(env: Env): VisionProvider {
  const provider = env.VISION_PROVIDER ?? (env.GEMINI_API_KEY ? "gemini" : "openai");
  if (provider === "gemini") {
    if (!env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not configured");
    return new GeminiVision(env.GEMINI_API_KEY, env.GEMINI_MODEL || undefined);
  }
  if (!env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not configured");
  return new OpenAIVision(env.OPENAI_API_KEY, env.OPENAI_MODEL || undefined, env.OPENAI_BASE_URL || undefined);
}
