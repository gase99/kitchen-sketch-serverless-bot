import type { ApiResponse, File, InlineKeyboardMarkup, Message } from "./types";

const API_BASE = "https://api.telegram.org";

export class TelegramError extends Error {
  constructor(
    readonly method: string,
    readonly code: number | undefined,
    description: string | undefined,
  ) {
    super(`Telegram ${method} failed (${code ?? "?"}): ${description ?? "unknown error"}`);
  }
}

/**
 * Thin, dependency-free Telegram Bot API client built on fetch().
 * Works unchanged on Cloudflare Workers, Deno, Bun, Node 18+ and AWS Lambda (Node 20).
 */
export class TelegramApi {
  constructor(
    private readonly token: string,
    private readonly fetchImpl: typeof fetch = (...args) => fetch(...args),
  ) {}

  async call<T>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    const res = await this.fetchImpl(`${API_BASE}/bot${this.token}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(params),
    });
    return this.unwrap<T>(method, res);
  }

  private async callMultipart<T>(method: string, form: FormData): Promise<T> {
    const res = await this.fetchImpl(`${API_BASE}/bot${this.token}/${method}`, {
      method: "POST",
      body: form,
    });
    return this.unwrap<T>(method, res);
  }

  private async unwrap<T>(method: string, res: Response): Promise<T> {
    const data = (await res.json().catch(() => ({ ok: false }))) as ApiResponse<T>;
    if (!data.ok) throw new TelegramError(method, data.error_code ?? res.status, data.description);
    return data.result as T;
  }

  sendMessage(
    chatId: number,
    text: string,
    extra: { reply_markup?: InlineKeyboardMarkup; parse_mode?: "HTML"; reply_to_message_id?: number } = {},
  ): Promise<Message> {
    return this.call("sendMessage", {
      chat_id: chatId,
      text,
      link_preview_options: { is_disabled: true },
      ...extra,
    });
  }

  editMessageText(
    chatId: number,
    messageId: number,
    text: string,
    extra: { reply_markup?: InlineKeyboardMarkup; parse_mode?: "HTML" } = {},
  ): Promise<Message | true> {
    return this.call("editMessageText", { chat_id: chatId, message_id: messageId, text, ...extra });
  }

  editMessageReplyMarkup(chatId: number, messageId: number, markup?: InlineKeyboardMarkup) {
    return this.call("editMessageReplyMarkup", {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: markup ?? { inline_keyboard: [] },
    });
  }

  sendChatAction(chatId: number, action: "typing" | "upload_document" | "upload_photo") {
    return this.call<true>("sendChatAction", { chat_id: chatId, action });
  }

  answerCallbackQuery(callbackQueryId: string, text?: string) {
    return this.call<true>("answerCallbackQuery", { callback_query_id: callbackQueryId, text });
  }

  sendDocument(
    chatId: number,
    file: { name: string; content: string | Uint8Array; mime: string },
    extra: { caption?: string; parse_mode?: "HTML"; reply_markup?: InlineKeyboardMarkup } = {},
  ): Promise<Message> {
    const form = new FormData();
    form.set("chat_id", String(chatId));
    form.set("document", new Blob([file.content], { type: file.mime }), file.name);
    if (extra.caption) form.set("caption", extra.caption);
    if (extra.parse_mode) form.set("parse_mode", extra.parse_mode);
    if (extra.reply_markup) form.set("reply_markup", JSON.stringify(extra.reply_markup));
    return this.callMultipart("sendDocument", form);
  }

  getFile(fileId: string): Promise<File> {
    return this.call("getFile", { file_id: fileId });
  }

  /** Downloads a file previously uploaded to Telegram (max 20 MB for bots). */
  async downloadFile(fileId: string): Promise<{ bytes: Uint8Array; mime: string }> {
    const file = await this.getFile(fileId);
    if (!file.file_path) throw new TelegramError("getFile", undefined, "file_path missing");
    const res = await this.fetchImpl(`${API_BASE}/file/bot${this.token}/${file.file_path}`);
    if (!res.ok) throw new TelegramError("downloadFile", res.status, res.statusText);
    const bytes = new Uint8Array(await res.arrayBuffer());
    return { bytes, mime: detectImageMime(bytes, res.headers.get("content-type"), file.file_path) };
  }
}

/** Telegram's file server answers with application/octet-stream, so trust the bytes first. */
export function detectImageMime(bytes: Uint8Array, header: string | null, path: string): string {
  const b = bytes;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "image/webp";
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return "image/gif";
  const type = header?.split(";")[0].trim().toLowerCase();
  if (type?.startsWith("image/")) return type;
  const ext = path.split(".").pop()?.toLowerCase();
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "heic" || ext === "heif") return `image/${ext}`;
  return "image/jpeg";
}
