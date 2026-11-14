import { billOfMaterials, type KitchenLayout, type LayoutShape, type LayoutWarning, type UnitType } from "../domain/layout";
import { buildPlan } from "../domain/plan";
import type { KitchenSketch } from "../domain/schema";
import type { InlineKeyboardButton, InlineKeyboardMarkup } from "../telegram/types";

export const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);

export const WELCOME = `سلام! 👋 من دستیار طراحی آشپزخانه هستم.

📸 عکس <b>اسکیس دستی</b> نقشهٔ آشپزخانه را بفرستید (ترجیحاً از روبه‌رو، با نور کافی و اعداد خوانا).

مراحل کار:
1️⃣ تحلیل تصویر با هوش مصنوعی و استخراج دیوارها، درها، پنجره‌ها و ابعاد
2️⃣ نمایش <b>پلان دوبعدی دیوارها</b> برای بررسی و اصلاح
3️⃣ پس از تایید شما، تولید <b>چیدمان یونیت‌ها</b> (خطی، L یا U) و لیست کابینت‌ها

دستورها:
/new — شروع طرح جدید
/plan — نمایش دوبارهٔ پلان فعلی
/help — راهنما`;

export const EDIT_HELP = `✏️ <b>اصلاح پلان</b>
• اصلاح عددی ابعاد: <code>W1=380 W3=250</code> (ارتفاع سقف: <code>H=260</code>)
• یا توضیح متنی بفرستید تا هوش مصنوعی دوباره تحلیل کند، مثلاً:
  «پنجره روی دیوار W2 است و عرض در ۸۰ سانت است»`;

export const ANALYZING = "⏳ در حال تحلیل اسکیس با هوش مصنوعی… (معمولاً ۱۰ تا ۲۰ ثانیه)";
export const SEND_PHOTO_FIRST = "ابتدا عکس اسکیس آشپزخانه را بفرستید 📸";
export const NOT_ALLOWED = "⛔️ شما اجازهٔ استفاده از این ربات را ندارید.";
export const UNSUPPORTED_FILE = "فقط فایل تصویری (JPG / PNG / WEBP) پشتیبانی می‌شود.";

const SHAPE_FA: Record<Exclude<LayoutShape, "auto">, string> = { linear: "خطی (یک دیوار)", L: "L شکل", U: "U شکل" };

const UNIT_FA: Record<UnitType, string> = {
  sink: "یونیت سینک",
  dishwasher: "ماشین ظرفشویی",
  hob: "گاز / اجاق صفحه‌ای",
  fridge: "یخچال (ایستاده)",
  corner: "کابینت کنج (Blind)",
  cabinet: "کابینت زمینی",
  filler: "فیلر",
  hood: "هود",
  "wall-cabinet": "کابینت دیواری",
};

const WARNING_FA: Record<LayoutWarning, string> = {
  U_NOT_POSSIBLE: "چیدمان U برای این فضا ممکن نیست؛ چیدمان L پیشنهاد شد.",
  U_NARROW_AISLE: "عرض راهروی وسط چیدمان U کمتر از ۱۲۰ سانتی‌متر است.",
  L_NOT_POSSIBLE: "چیدمان L برای این فضا ممکن نیست؛ چیدمان خطی پیشنهاد شد.",
  NO_SINK: "فضای کافی برای سینک پیدا نشد.",
  NO_DISHWASHER: "کنار سینک فضای ۶۰ سانتی برای ماشین ظرفشویی نبود.",
  NO_HOB: "فضای کافی برای گاز پیدا نشد.",
  NO_FRIDGE: "فضای کافی برای یخچال ایستاده پیدا نشد.",
};

const DIR_FA = { east: "→", south: "↓", west: "←", north: "↑" } as const;

export function planCaption(sketch: KitchenSketch): string {
  const plan = buildPlan(sketch);
  const walls = sketch.walls.map((w) => `${w.id}${DIR_FA[w.direction]} ${w.length}`).join(" | ");
  const doors = sketch.openings.filter((o) => o.type === "door");
  const windows = sketch.openings.filter((o) => o.type === "window");
  const lines = [
    "📐 <b>پلان دوبعدی دیوارها</b>",
    `مساحت: ${plan.area.toFixed(1)} m² — ارتفاع سقف: ${sketch.ceilingHeight} cm`,
    `دیوارها (cm): ${walls}`,
    `درها: ${doors.map((d) => `${d.id} روی ${d.wallId} (عرض ${d.width})`).join("، ") || "—"}`,
    `پنجره‌ها: ${windows.map((w) => `${w.id} روی ${w.wallId} (عرض ${w.width})`).join("، ") || "—"}`,
    `اطمینان مدل: ${Math.round(sketch.confidence * 100)}٪`,
  ];
  if (sketch.notes.length) lines.push(`یادداشت‌ها: ${esc(sketch.notes.slice(0, 3).join(" · "))}`);
  lines.push("", "اگر درست است «تایید» را بزنید؛ در غیر این صورت اصلاحات را بنویسید.");
  return truncate(lines.join("\n"), 1000);
}

export function layoutCaption(layout: KitchenLayout): string {
  const lines = [
    `🍳 <b>چیدمان پیشنهادی: ${SHAPE_FA[layout.shape]}</b>`,
    `دیوارهای استفاده‌شده: ${layout.wallIds.join("، ")}`,
    `طول کانتر: ${layout.counterLength} cm — تعداد یونیت‌ها: ${layout.units.length}`,
  ];
  for (const w of layout.warnings) lines.push(`⚠️ ${WARNING_FA[w]}`);
  return truncate(lines.join("\n"), 1000);
}

export function bomMessage(layout: KitchenLayout): string {
  const rows = billOfMaterials(layout).map((r) => `${String(r.count).padStart(2)} × ${String(r.width).padStart(3)}cm  ${UNIT_FA[r.type]}`);
  return `🧾 <b>لیست یونیت‌ها</b>\n<pre>${esc(rows.join("\n"))}</pre>`;
}

export function planKeyboard(viewUrl?: string): InlineKeyboardMarkup {
  const rows: InlineKeyboardButton[][] = [
    [{ text: "✅ تایید و چیدمان یونیت‌ها", callback_data: "plan:ok" }],
    [
      { text: "✏️ اصلاح", callback_data: "plan:edit" },
      { text: "🔁 تحلیل مجدد", callback_data: "plan:redo" },
    ],
  ];
  if (viewUrl) rows.push([{ text: "🌐 مشاهده در مرورگر", url: viewUrl }]);
  return { inline_keyboard: rows };
}

export function layoutKeyboard(viewUrl?: string): InlineKeyboardMarkup {
  const rows: InlineKeyboardButton[][] = [
    [
      { text: "خطی", callback_data: "layout:linear" },
      { text: "L شکل", callback_data: "layout:L" },
      { text: "U شکل", callback_data: "layout:U" },
    ],
    [
      { text: "⬅️ بازگشت به پلان", callback_data: "layout:back" },
      { text: "✅ نهایی", callback_data: "layout:done" },
    ],
  ];
  if (viewUrl) rows.push([{ text: "🌐 مشاهده در مرورگر", url: viewUrl }]);
  return { inline_keyboard: rows };
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}
