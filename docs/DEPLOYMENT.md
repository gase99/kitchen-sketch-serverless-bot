<div dir="rtl">

# 🚀 راهنمای کامل استقرار و تنظیم وب‌هوک

این راهنما ربات را **بدون هیچ سرور همیشه روشن** و با پلن‌های رایگان مستقر می‌کند. در معماری سرورلس، تلگرام هر آپدیت را با یک درخواست HTTPS به آدرس وب‌هوک شما می‌فرستد (`setWebhook`). روش Polling یعنی `getUpdates` اصلاً استفاده نمی‌شود. این دو روش با هم کار نمی‌کنند و تا وقتی وب‌هوک فعال است، `getUpdates` خطا می‌دهد.

## فهرست

1. [پیش‌نیازها](#1-پیشنیازها)
2. [ساخت ربات در BotFather](#2-ساخت-ربات-در-botfather)
3. [کلید Vision AI](#3-کلید-vision-ai)
4. [حساب و API Token در Cloudflare](#4-حساب-و-api-token-در-cloudflare)
5. [روش A: استقرار خودکار با GitHub Actions (پیشنهادی)](#5-روش-a-استقرار-خودکار-با-github-actions-پیشنهادی)
6. [روش B: استقرار دستی با Wrangler](#6-روش-b-استقرار-دستی-با-wrangler)
7. [تنظیم و مدیریت وب‌هوک تلگرام](#7-تنظیم-و-مدیریت-وبهوک-تلگرام)
8. [توسعهٔ محلی با تونل](#8-توسعهٔ-محلی-با-تونل)
9. [متغیرها و تنظیمات](#9-متغیرها-و-تنظیمات)
10. [محدودیت‌های پلن رایگان](#10-محدودیتهای-پلن-رایگان)
11. [عیب‌یابی](#11-عیبیابی)
12. [استقرار روی پلتفرم‌های دیگر (AWS Lambda، Vercel، ...)](#12-استقرار-روی-پلتفرمهای-دیگر)

---

## 1. پیش‌نیازها

- Node.js نسخهٔ ۲۰ یا بالاتر (فقط برای توسعهٔ محلی یا استقرار دستی)
- حساب رایگان [Cloudflare](https://dash.cloudflare.com/sign-up)
- حساب GitHub برای CI/CD
- کلید Google Gemini (رایگان) یا OpenAI

## 2. ساخت ربات در BotFather

1. در تلگرام به [@BotFather](https://t.me/BotFather) پیام بدهید و `/newbot` را بفرستید.
2. نام و یوزرنیم ربات را وارد کنید. یوزرنیم باید به `bot` ختم شود.
3. **توکن** دریافتی (مثل `123456789:AAH...`) را نگه دارید. این مقدار `TELEGRAM_BOT_TOKEN` است.
4. یک رشتهٔ تصادفی برای امضای وب‌هوک بسازید. این مقدار `TELEGRAM_WEBHOOK_SECRET` است و فقط کاراکترهای `A-Z a-z 0-9 _ -` را می‌پذیرد (حداکثر ۲۵۶ کاراکتر):

```bash
openssl rand -hex 32
```

## 3. کلید Vision AI

| Provider | نحوهٔ دریافت | متغیر | مدل پیش‌فرض |
|---|---|---|---|
| **Google Gemini** (پلن رایگان دارد) | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) | `GEMINI_API_KEY` | `gemini-3.5-flash` |
| OpenAI | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) | `OPENAI_API_KEY` | `gpt-4o-mini` |
| سرویس‌های سازگار با OpenAI (OpenRouter، Groq، ...) | پنل همان سرویس | `OPENAI_API_KEY` + `OPENAI_BASE_URL` | از طریق `OPENAI_MODEL` |

انتخاب Provider با متغیر `VISION_PROVIDER` در `wrangler.toml` انجام می‌شود (`gemini` یا `openai`).

> سهمیه‌های پلن رایگان Gemini ممکن است تغییر کند. مقدار فعلی را در AI Studio ببینید.

## 4. حساب و API Token در Cloudflare

1. وارد [داشبورد Cloudflare](https://dash.cloudflare.com) شوید. **Account ID** را از صفحهٔ **Workers & Pages** (ستون سمت راست) یا از URL داشبورد بردارید.
2. اگر اولین بار است از Workers استفاده می‌کنید، در **Workers & Pages** یک زیردامنهٔ `workers.dev` انتخاب کنید (مثلاً `abas`). آدرس نهایی ربات به این شکل خواهد بود:
   `https://kitchen-sketch-bot.<subdomain>.workers.dev`
3. به [My Profile → API Tokens](https://dash.cloudflare.com/profile/api-tokens) بروید، **Create Token** را بزنید و قالب **Edit Cloudflare Workers** را انتخاب کنید. این قالب دسترسی Workers Scripts و Workers KV را دارد. Account را محدود کنید و توکن را بسازید.

## 5. روش A: استقرار خودکار با GitHub Actions (پیشنهادی)

در مخزن گیت‌هاب به **Settings → Secrets and variables → Actions → New repository secret** بروید و این Secretها را اضافه کنید:

| Secret | الزامی | توضیح |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` | ✅ | توکن مرحلهٔ ۴ |
| `CLOUDFLARE_ACCOUNT_ID` | ✅ | شناسهٔ حساب Cloudflare |
| `TELEGRAM_BOT_TOKEN` | ✅ | توکن BotFather |
| `TELEGRAM_WEBHOOK_SECRET` | ✅ | رشتهٔ تصادفی مرحلهٔ ۲ |
| `GEMINI_API_KEY` | یکی از این دو | کلید Gemini |
| `OPENAI_API_KEY` | یکی از این دو | کلید OpenAI |

اختیاری: در تب **Variables** متغیر `WORKER_URL` را تعریف کنید. این کار فقط زمانی لازم است که دامنهٔ اختصاصی دارید یا آدرس به صورت خودکار تشخیص داده نمی‌شود.

بعد از این مرحله، هر **push به `main`** (یا اجرای دستی از تب Actions با `workflow_dispatch`) فایل [`deploy.yml`](../.github/workflows/deploy.yml) را اجرا می‌کند:

```
test (typecheck + vitest)
  └─▶ deploy
        1. Check required secrets
        2. scripts/ensure-kv.mjs        → اگر KV namespace وجود ندارد آن را می‌سازد و id را در wrangler.toml می‌گذارد
        3. wrangler deploy              → استقرار Worker (cloudflare/wrangler-action@v3)
        4. wrangler secret bulk         → آپلود Secretها روی Worker
        5. scripts/telegram-webhook.mjs → setWebhook (با secret_token) + setMyCommands
        6. Smoke test                   → بررسی سلامت سرویس و رد شدن درخواست بدون امضا (401)
```

فایل [`ci.yml`](../.github/workflows/ci.yml) هم روی Pull Requestها تست، تایپ‌چک و Bundle check را بدون استقرار اجرا می‌کند.

> برای محافظت بیشتر، در **Settings → Environments → production** می‌توانید تایید دستی (Required reviewers) فعال کنید.

## 6. روش B: استقرار دستی با Wrangler

```bash
npm ci
npx wrangler login                                   # ورود به Cloudflare از طریق مرورگر

# ساخت KV و قرار دادن id در wrangler.toml (فقط بار اول)
npx wrangler kv namespace create SESSIONS
#   → id خروجی را به جای REPLACE_WITH_KV_NAMESPACE_ID قرار دهید

# Secretها
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put TELEGRAM_WEBHOOK_SECRET
npx wrangler secret put GEMINI_API_KEY

# استقرار
npx wrangler deploy
#   → آدرس را یادداشت کنید: https://kitchen-sketch-bot.<subdomain>.workers.dev

# ثبت وب‌هوک
TELEGRAM_BOT_TOKEN=... TELEGRAM_WEBHOOK_SECRET=... \
WORKER_URL=https://kitchen-sketch-bot.<subdomain>.workers.dev \
npm run webhook:set
```

## 7. تنظیم و مدیریت وب‌هوک تلگرام

مستندات رسمی: [setWebhook](https://core.telegram.org/bots/api#setwebhook) · [getWebhookInfo](https://core.telegram.org/bots/api#getwebhookinfo) · [Marvin's Marvellous Guide to All Things Webhook](https://core.telegram.org/bots/webhooks)

### با اسکریپت پروژه

```bash
npm run webhook:set      # setWebhook + setMyCommands
npm run webhook:info     # وضعیت، تعداد آپدیت‌های در صف و آخرین خطا
npm run webhook:delete   # حذف وب‌هوک
```

### با curl

```bash
TOKEN="123456789:AA..."
SECRET="your-random-secret"
URL="https://kitchen-sketch-bot.<subdomain>.workers.dev/webhook"

# ثبت
curl -s "https://api.telegram.org/bot$TOKEN/setWebhook" \
  -H 'content-type: application/json' \
  -d "{\"url\":\"$URL\",\"secret_token\":\"$SECRET\",\"allowed_updates\":[\"message\",\"callback_query\"],\"max_connections\":40}"

# بررسی
curl -s "https://api.telegram.org/bot$TOKEN/getWebhookInfo"

# حذف (مثلاً برای برگشت به حالت محلی)
curl -s "https://api.telegram.org/bot$TOKEN/deleteWebhook"
```

### نکات مهم وب‌هوک

- **HTTPS اجباری است.** پورت‌های مجاز تلگرام 443، 80، 88 و 8443 هستند و آدرس `workers.dev` روی 443 با گواهی معتبر کار می‌کند.
- **`secret_token`**: تلگرام این مقدار را در هدر `X-Telegram-Bot-Api-Secret-Token` همهٔ درخواست‌ها می‌فرستد. Worker هر درخواستی را که این هدر را نداشته باشد یا مقدارش اشتباه باشد با `401` رد می‌کند (مقایسه در زمان ثابت انجام می‌شود). فایل مربوط: [`src/telegram/security.ts`](../src/telegram/security.ts).
- **`allowed_updates`**: فقط `message` و `callback_query` دریافت می‌شوند تا تعداد اجراها کم بماند.
- **پاسخ سریع**: اگر وب‌هوک خطا برگرداند یا پاسخ ندهد، تلگرام چند بار دوباره تلاش می‌کند. به همین دلیل Worker بلافاصله `200 OK` برمی‌گرداند و کارهای طولانی (دانلود عکس و فراخوانی AI) را در `ctx.waitUntil()` ادامه می‌دهد.
- محدودیت حجم دانلود فایل برای ربات‌ها از طریق `getFile` برابر **۲۰ مگابایت** است.

## 8. توسعهٔ محلی با تونل

```bash
cp .dev.vars.example .dev.vars        # مقادیر را پر کنید
npm run dev                           # http://localhost:8787 (KV محلی شبیه‌سازی می‌شود)

# در ترمینال دوم یک آدرس HTTPS عمومی بسازید (بدون نیاز به حساب):
npx cloudflared tunnel --url http://localhost:8787
#   → https://xxxx.trycloudflare.com

WORKER_URL=https://xxxx.trycloudflare.com TELEGRAM_BOT_TOKEN=... TELEGRAM_WEBHOOK_SECRET=... npm run webhook:set
```

> اگر از یک ربات هم برای حالت محلی و هم برای Production استفاده می‌کنید، بعد از پایان کار محلی وب‌هوک را دوباره روی آدرس Worker تنظیم کنید یا یک بار Deploy را اجرا کنید. راه بهتر این است که یک ربات جدا برای توسعه بسازید.

## 9. متغیرها و تنظیمات

| نام | نوع | پیش‌فرض | توضیح |
|---|---|---|---|
| `TELEGRAM_BOT_TOKEN` | Secret | — | توکن ربات |
| `TELEGRAM_WEBHOOK_SECRET` | Secret | — | امضای وب‌هوک |
| `GEMINI_API_KEY` / `OPENAI_API_KEY` | Secret | — | کلید Vision AI |
| `VISION_PROVIDER` | var | `gemini` | `gemini` یا `openai` |
| `GEMINI_MODEL` | var | `gemini-3.5-flash` | مدل Gemini |
| `GEMINI_THINKING_LEVEL` | var | `low` | سطح «فکر کردن» مدل‌های Gemini 3 به بعد (`minimal`، `low`، `medium`، `high`). سطح پایین‌تر سریع‌تر جواب می‌دهد و در محدودیت زمانی Worker می‌ماند |
| `OPENAI_MODEL` | var | `gpt-4o-mini` | مدل OpenAI |
| `OPENAI_BASE_URL` | var | `https://api.openai.com/v1` | برای سرویس‌های سازگار |
| `ALLOWED_USER_IDS` | var | خالی | فهرست شناسه‌های عددی کاربران مجاز (جداشده با کاما) |
| `SESSION_TTL_SECONDS` | var | `604800` | مدت نگه‌داری وضعیت و نقشه‌ها در KV |

متغیرهای `var` در بخش `[vars]` فایل [`wrangler.toml`](../wrangler.toml) تعریف می‌شوند. Secretها را هیچ‌وقت commit نکنید.

## 10. محدودیت‌های پلن رایگان

| سرویس | محدودیت پلن رایگان (طبق مستندات Cloudflare) | تاثیر روی این ربات |
|---|---|---|
| Workers | ۱۰۰٬۰۰۰ درخواست در روز، **۱۰ میلی‌ثانیه CPU** برای هر اجرا | زمان انتظار برای پاسخ شبکه (تلگرام و AI) جزو CPU حساب نمی‌شود. پردازش JSON و ساخت SVG سبک است |
| `waitUntil` | حداکثر حدود ۳۰ ثانیه بعد از ارسال پاسخ | مدل‌های Flash یا mini معمولاً زیر ۲۰ ثانیه جواب می‌دهند |
| Workers KV | ۱۰۰٬۰۰۰ خواندن و **۱٬۰۰۰ نوشتن** در روز | هر طرح کامل حدوداً ۵ تا ۸ بار در KV می‌نویسد، یعنی ظرفیت چیزی حدود ۱۰۰ طرح در روز |

برای ترافیک بالاتر از پلن Workers Paid استفاده کنید یا پردازش AI را به [Cloudflare Queues](https://developers.cloudflare.com/queues/) منتقل کنید.

## 11. عیب‌یابی

| مشکل | راه‌حل |
|---|---|
| ربات جواب نمی‌دهد | خروجی `npm run webhook:info` را ببینید. فیلد `last_error_message` علت را نشان می‌دهد |
| `401 Unauthorized` در `last_error_message` | `TELEGRAM_WEBHOOK_SECRET` در Worker با مقداری که در `setWebhook` داده‌اید یکی نیست. Deploy را دوباره اجرا کنید |
| `Conflict: can't use getUpdates method while webhook is active` | کد یا ابزار دیگری روی همین توکن Polling می‌کند. آن را متوقف کنید |
| «ارتباط با سرویس هوش مصنوعی ناموفق بود» | کلید API، سهمیه و نام مدل را بررسی کنید و لاگ‌ها را با `npx wrangler tail` ببینید |
| ابعاد اشتباه خوانده شده | با `W1=380` اصلاح کنید یا توضیح متنی بفرستید. عکس واضح و روبه‌رو بهترین نتیجه را می‌دهد |
| خطای KV در CI | توکن Cloudflare باید دسترسی **Workers KV Storage: Edit** داشته باشد |
| آدرس Worker در CI تشخیص داده نشد | متغیر `WORKER_URL` را در Variables مخزن تعریف کنید |

لاگ زنده:

```bash
npx wrangler tail
```

## 12. استقرار روی پلتفرم‌های دیگر

هستهٔ برنامه، یعنی `domain/`، `render/`، `vision/` و `telegram/`، فقط به `fetch` استاندارد وابسته است و به Cloudflare گره نخورده است. برای انتقال به پلتفرم دیگر فقط دو چیز را عوض کنید:

1. **ورودی HTTP**، یعنی `src/index.ts`
2. **ذخیره‌ساز وضعیت**، یعنی `SessionStore` با همان سه متد `get`، `put` و `delete`

| پلتفرم | ورودی | ذخیره‌ساز | کار پس‌زمینه |
|---|---|---|---|
| **AWS Lambda** (Node 20، Function URL یا API Gateway) | `export const handler = async (event) => ...` | DynamoDB با TTL | پاسخ را بعد از `await handleUpdate` بدهید (Timeout تلگرام را در نظر بگیرید) یا از Lambda async invoke یا SQS استفاده کنید |
| Vercel / Netlify Functions | `export default async (req) => ...` | Upstash Redis | `waitUntil` از `@vercel/functions` |
| Deno Deploy | `Deno.serve(handler)` | Deno KV | — |

نمونهٔ `serverless.yml` برای AWS Lambda:

```yaml
service: kitchen-sketch-bot
provider:
  name: aws
  runtime: nodejs20.x
  timeout: 60
  environment:
    TELEGRAM_BOT_TOKEN: ${ssm:/kitchen-bot/telegram-token}
    TELEGRAM_WEBHOOK_SECRET: ${ssm:/kitchen-bot/webhook-secret}
    GEMINI_API_KEY: ${ssm:/kitchen-bot/gemini-key}
functions:
  webhook:
    handler: dist/lambda.handler
    url: true          # Lambda Function URL (HTTPS) → setWebhook
```

</div>
