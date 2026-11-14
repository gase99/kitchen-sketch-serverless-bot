import { applyDimensionEdits, looksLikeDimensionEdit } from "../domain/schema";
import type { LayoutShape } from "../domain/layout";
import { isAllowedUser } from "../telegram/security";
import type { CallbackQuery, Message, Update } from "../telegram/types";
import type { BotContext } from "./context";
import { analyzeSketch, finish, sendLayout, sendPlan } from "./flow";
import * as M from "./messages";

/** Entry point for a single Telegram update (one serverless invocation). */
export async function handleUpdate(ctx: BotContext, update: Update): Promise<void> {
  if (update.callback_query) return handleCallback(ctx, update.callback_query);
  if (update.message) return handleMessage(ctx, update.message);
}

async function handleMessage(ctx: BotContext, msg: Message): Promise<void> {
  const chatId = msg.chat.id;
  if (!isAllowedUser(msg.from?.id, ctx.env.ALLOWED_USER_IDS)) {
    await ctx.tg.sendMessage(chatId, M.NOT_ALLOWED);
    return;
  }

  const text = msg.text?.trim();
  if (text?.startsWith("/")) return handleCommand(ctx, chatId, text);

  const fileId = pickImageFileId(msg);
  if (fileId === "unsupported") {
    await ctx.tg.sendMessage(chatId, M.UNSUPPORTED_FILE);
    return;
  }
  if (fileId) {
    // A new sketch always starts a fresh design.
    await analyzeSketch(ctx, chatId, { stage: "idle", fileId, updatedAt: Date.now() }, msg.caption?.trim() || undefined);
    return;
  }

  if (text) return handleText(ctx, chatId, text);
  await ctx.tg.sendMessage(chatId, M.SEND_PHOTO_FIRST);
}

async function handleCommand(ctx: BotContext, chatId: number, text: string): Promise<void> {
  const command = text.split(/[\s@]/)[0].toLowerCase();
  switch (command) {
    case "/start":
    case "/help":
      await ctx.tg.sendMessage(chatId, M.WELCOME, { parse_mode: "HTML" });
      return;
    case "/new":
    case "/reset":
      await ctx.store.reset(chatId);
      await ctx.tg.sendMessage(chatId, "🆕 طرح جدید شروع شد. " + M.SEND_PHOTO_FIRST);
      return;
    case "/plan": {
      const session = await ctx.store.get(chatId);
      if (!session.sketch) await ctx.tg.sendMessage(chatId, M.SEND_PHOTO_FIRST);
      else await sendPlan(ctx, chatId, session.sketch);
      return;
    }
    default:
      await ctx.tg.sendMessage(chatId, M.WELCOME, { parse_mode: "HTML" });
  }
}

async function handleText(ctx: BotContext, chatId: number, text: string): Promise<void> {
  const session = await ctx.store.get(chatId);
  if (!session.sketch || session.stage === "idle") {
    await ctx.tg.sendMessage(chatId, M.SEND_PHOTO_FIRST);
    return;
  }
  if (session.stage === "analyzing") {
    await ctx.tg.sendMessage(chatId, M.ANALYZING);
    return;
  }
  if (looksLikeDimensionEdit(text)) {
    const sketch = structuredClone(session.sketch);
    let changed: string[];
    try {
      changed = applyDimensionEdits(sketch, text);
    } catch {
      await ctx.tg.sendMessage(chatId, "❌ با این ابعاد، دیوارها یک فضای بسته تشکیل نمی‌دهند.");
      return;
    }
    if (!changed.length) {
      await ctx.tg.sendMessage(chatId, M.EDIT_HELP, { parse_mode: "HTML" });
      return;
    }
    await ctx.store.put(chatId, { ...session, stage: "plan_review", sketch });
    await sendPlan(ctx, chatId, sketch);
    return;
  }
  // Free-text correction: re-run the Vision model with the previous JSON + the user's note.
  await analyzeSketch(ctx, chatId, session, text);
}

async function handleCallback(ctx: BotContext, cq: CallbackQuery): Promise<void> {
  const chatId = cq.message?.chat.id;
  await ctx.tg.answerCallbackQuery(cq.id).catch(() => undefined);
  if (!chatId) return;
  if (!isAllowedUser(cq.from.id, ctx.env.ALLOWED_USER_IDS)) {
    await ctx.tg.sendMessage(chatId, M.NOT_ALLOWED);
    return;
  }
  const session = await ctx.store.get(chatId);
  const [scope, action] = (cq.data ?? "").split(":");

  if (scope === "plan") {
    if (action === "ok") {
      if (cq.message) await ctx.tg.editMessageReplyMarkup(chatId, cq.message.message_id).catch(() => undefined);
      return sendLayout(ctx, chatId, session, "auto");
    }
    if (action === "redo") return analyzeSketch(ctx, chatId, session);
    if (action === "edit") {
      await ctx.tg.sendMessage(chatId, M.EDIT_HELP, { parse_mode: "HTML" });
      return;
    }
  }

  if (scope === "layout") {
    if (action === "done") {
      if (cq.message) await ctx.tg.editMessageReplyMarkup(chatId, cq.message.message_id).catch(() => undefined);
      return finish(ctx, chatId, session);
    }
    if (action === "back") {
      if (!session.sketch) return void (await ctx.tg.sendMessage(chatId, M.SEND_PHOTO_FIRST));
      await ctx.store.put(chatId, { ...session, stage: "plan_review" });
      return sendPlan(ctx, chatId, session.sketch);
    }
    if (["linear", "L", "U", "auto"].includes(action)) return sendLayout(ctx, chatId, session, action as LayoutShape);
  }
}

/** Largest photo size (Telegram sends several), or an image sent as a file for full resolution. */
export function pickImageFileId(msg: Message): string | "unsupported" | undefined {
  if (msg.photo?.length) {
    const sorted = [...msg.photo].sort((a, b) => b.width * b.height - a.width * a.height);
    return (sorted.find((p) => Math.max(p.width, p.height) <= 2048) ?? sorted[sorted.length - 1]).file_id;
  }
  if (msg.document) {
    return msg.document.mime_type?.startsWith("image/") ? msg.document.file_id : "unsupported";
  }
  return undefined;
}
