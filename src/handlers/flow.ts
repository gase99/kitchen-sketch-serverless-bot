import { generateLayout, type LayoutShape } from "../domain/layout";
import { normalizeSketch, SketchValidationError, type KitchenSketch } from "../domain/schema";
import { renderSvg } from "../render/svg";
import { renderTechnicalSvg } from "../render/technical";
import type { Session } from "../storage/session";
import type { BotContext } from "./context";
import * as M from "./messages";

function viewUrl(ctx: BotContext, id: string): string | undefined {
  return ctx.origin.startsWith("https://") ? `${ctx.origin}/view/${id}` : undefined;
}

/** Step 2: download the sketch from Telegram, run the Vision model and validate the JSON. */
export async function analyzeSketch(
  ctx: BotContext,
  chatId: number,
  session: Session,
  correction?: string,
): Promise<void> {
  if (!session.fileId) {
    await ctx.tg.sendMessage(chatId, M.SEND_PHOTO_FIRST);
    return;
  }
  const previous = session.sketch;
  const status = await ctx.tg.sendMessage(chatId, M.ANALYZING);
  await ctx.tg.sendChatAction(chatId, "typing").catch(() => undefined);
  await ctx.store.put(chatId, { ...session, stage: "analyzing" });

  let sketch: KitchenSketch;
  try {
    const { bytes, mime } = await ctx.tg.downloadFile(session.fileId);
    const raw = await ctx.vision().extract({ image: bytes, mime, previous: correction ? previous : undefined, correction });
    sketch = normalizeSketch(raw);
  } catch (err) {
    console.error("analysis failed", err);
    const reason =
      err instanceof SketchValidationError
        ? "نقشه به صورت یک فضای بسته با دیوارهای عمود بر هم خوانده نشد."
        : "ارتباط با سرویس هوش مصنوعی ناموفق بود.";
    await ctx.store.put(chatId, { ...session, stage: previous ? "plan_review" : "idle" });
    await ctx.tg.editMessageText(
      chatId,
      status.message_id,
      `❌ ${reason}\nلطفاً عکس واضح‌تری بفرستید یا اصلاحات را به صورت متن بنویسید.`,
    );
    return;
  }

  await ctx.store.put(chatId, { ...session, stage: "plan_review", sketch });
  await ctx.tg.editMessageText(chatId, status.message_id, "✅ تحلیل انجام شد.");
  await sendPlan(ctx, chatId, sketch);
}

/** Step 3a: render and send the 2D wall plan for user review. */
export async function sendPlan(ctx: BotContext, chatId: number, sketch: KitchenSketch): Promise<void> {
  const svg = renderSvg(sketch, undefined, "Wall plan");
  const id = await ctx.store.putDrawing(svg);
  await ctx.tg.sendChatAction(chatId, "upload_document").catch(() => undefined);
  await ctx.tg.sendDocument(
    chatId,
    { name: "kitchen-plan.svg", content: svg, mime: "image/svg+xml" },
    { caption: M.planCaption(sketch), parse_mode: "HTML", reply_markup: M.planKeyboard(viewUrl(ctx, id)) },
  );
}

/** Step 3b: after confirmation, generate and send the cabinet layout + bill of materials. */
export async function sendLayout(
  ctx: BotContext,
  chatId: number,
  session: Session,
  shape: LayoutShape = "auto",
): Promise<void> {
  if (!session.sketch) {
    await ctx.tg.sendMessage(chatId, M.SEND_PHOTO_FIRST);
    return;
  }
  const layout = generateLayout(session.sketch, shape);
  const svg = renderTechnicalSvg(session.sketch, layout);
  const id = await ctx.store.putDrawing(svg);
  await ctx.store.put(chatId, { ...session, stage: "layout_review", shape: layout.shape });
  await ctx.tg.sendChatAction(chatId, "upload_document").catch(() => undefined);
  await ctx.tg.sendDocument(
    chatId,
    { name: `kitchen-layout-${layout.shape}.svg`, content: svg, mime: "image/svg+xml" },
    { caption: M.layoutCaption(layout), parse_mode: "HTML", reply_markup: M.layoutKeyboard(viewUrl(ctx, id)) },
  );
}

export async function finish(ctx: BotContext, chatId: number, session: Session): Promise<void> {
  if (!session.sketch) {
    await ctx.tg.sendMessage(chatId, M.SEND_PHOTO_FIRST);
    return;
  }
  const layout = generateLayout(session.sketch, session.shape ?? "auto");
  await ctx.store.put(chatId, { ...session, stage: "done" });
  await ctx.tg.sendMessage(chatId, `${M.bomMessage(layout)}\n\n🎉 طرح نهایی شد. برای طرح جدید عکس دیگری بفرستید.`, {
    parse_mode: "HTML",
  });
}
