import { toBase64 } from "./base64";
import { parseJsonLoose } from "./gemini";
import { KITCHEN_SKETCH_JSON_SCHEMA } from "../domain/schema";
import { SYSTEM_PROMPT, userPrompt } from "./prompt";
import type { VisionInput, VisionProvider } from "./types";

/**
 * OpenAI Chat Completions with image input. Also works with any OpenAI-compatible gateway
 * (OpenRouter, Together, Groq, Cloudflare AI Gateway, ...) via OPENAI_BASE_URL.
 */
export class OpenAIVision implements VisionProvider {
  readonly name = "openai";

  constructor(
    private readonly apiKey: string,
    private readonly model = "gpt-4o-mini",
    private readonly baseUrl = "https://api.openai.com/v1",
    private readonly fetchImpl: typeof fetch = (...a) => fetch(...a),
  ) {}

  async extract(input: VisionInput): Promise<unknown> {
    const res = await this.fetchImpl(`${this.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({
        model: this.model,
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: `${SYSTEM_PROMPT}\n\nJSON schema:\n${JSON.stringify(KITCHEN_SKETCH_JSON_SCHEMA)}`,
          },
          {
            role: "user",
            content: [
              { type: "text", text: userPrompt(input.previous, input.correction) },
              { type: "image_url", image_url: { url: `data:${input.mime};base64,${toBase64(input.image)}`, detail: "high" } },
            ],
          },
        ],
      }),
    });
    const data = (await res.json()) as any;
    if (!res.ok) throw new Error(`OpenAI ${res.status}: ${data?.error?.message ?? res.statusText}`);
    const text: string | undefined = data?.choices?.[0]?.message?.content;
    if (!text) throw new Error("OpenAI returned no content");
    return parseJsonLoose(text);
  }
}
