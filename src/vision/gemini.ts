import { KITCHEN_SKETCH_JSON_SCHEMA } from "../domain/schema";
import { toBase64 } from "./base64";
import { SYSTEM_PROMPT, userPrompt } from "./prompt";
import type { VisionInput, VisionProvider } from "./types";

/** Google Gemini (generous free tier) via the REST generateContent endpoint with JSON-schema output. */
export class GeminiVision implements VisionProvider {
  readonly name = "gemini";

  constructor(
    private readonly apiKey: string,
    private readonly model = "gemini-2.5-flash",
    private readonly fetchImpl: typeof fetch = (...a) => fetch(...a),
  ) {}

  async extract(input: VisionInput): Promise<unknown> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.model)}:generateContent`;
    const res = await this.fetchImpl(url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": this.apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [
          {
            role: "user",
            parts: [
              { inlineData: { mimeType: input.mime, data: toBase64(input.image) } },
              { text: userPrompt(input.previous, input.correction) },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: "application/json",
          responseSchema: KITCHEN_SKETCH_JSON_SCHEMA,
        },
      }),
    });
    const data = (await res.json()) as any;
    if (!res.ok) throw new Error(`Gemini ${res.status}: ${data?.error?.message ?? res.statusText}`);
    const text: string | undefined = data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text ?? "").join("");
    if (!text) throw new Error(`Gemini returned no content (${data?.candidates?.[0]?.finishReason ?? "unknown"})`);
    return parseJsonLoose(text);
  }
}

export function parseJsonLoose(text: string): unknown {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  return JSON.parse(start >= 0 && end > start ? cleaned.slice(start, end + 1) : cleaned);
}
