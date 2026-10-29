# راه‌اندازی پرداخت با کارت (Creem)

کد پرداخت با کارت از طریق Creem روی سایت آماده است و فقط منتظر **سه کلید** است. وقتی این سه کلید را بگذاری،
گزینهٔ **Card · Apple Pay · Google Pay** خودکار اول لیست پرداخت می‌آید (Visa، Mastercard، Apple Pay، Google Pay).
خریدار در صفحهٔ امن Creem پرداخت می‌کند و **کلیدش بلافاصله و خودکار فعال می‌شود**؛ لازم نیست کاری بکنی.

Creem «فروشندهٔ رسمی» (Merchant of Record) است: مالیات/VAT و chargeback را خودش انجام می‌دهد.
پول را به **USDC روی شبکهٔ Polygon** (کیف پول کریپتوی خودت) یا حساب بانکی محلی واریز می‌کند. مالزی پشتیبانی می‌شود.

## مراحل (حدود ۲۰ دقیقه + زمان تأیید فروشگاه)

1. **ثبت‌نام:** در https://creem.io ثبت‌نام کن.
2. **احراز هویت و فروشگاه:** اطلاعات فروشگاه و احراز هویت (KYC) را کامل کن.
   - Store name: `Unwrapped`
   - Website: `https://myunwrapped.com`
   - توضیح محصول: «Web app that analyzes the data export files people download from Instagram, TikTok and other apps, privately in the browser. One-time payments, no subscription.»
   - صفحه‌های قوانین که Creem ممکن است بپرسد: `https://myunwrapped.com/terms/`، `https://myunwrapped.com/privacy/` و `https://myunwrapped.com/pricing/`
3. **روش دریافت پول (Payout):** روش **USDC (Polygon)** را انتخاب کن و آدرس کیف پولی بده که USDC روی شبکهٔ Polygon را می‌گیرد (مثلاً Trust Wallet → USDC → شبکهٔ Polygon). کارمزد برداشت ۲٪ است.
4. **ساخت محصول:** Products → Create product
   - Name: `Unwrapped`
   - Payment type: **One-time** (نه Subscription)
   - Currency: **USD** (مهم: اگر ارز دیگری باشد، سایت پرداخت را قبول نمی‌کند)
   - Price: هر عددی، مثلاً `5` (سایت قیمت درست هر سفارش را خودش به Creem می‌فرستد)
   - Tax category: **SaaS** / Digital product
   - ذخیره کن و **Product ID** را کپی کن (با `prod_` شروع می‌شود).
5. **کلید API:** Developers → API keys → کلید **Live** را کپی کن (با `creem_` شروع می‌شود، نه `creem_test_`).
6. **Webhook:** Developers → Webhooks → Add endpoint
   - URL: `https://myunwrapped.com/api/webhook/creem`
   - Event: `checkout.completed`
   - ذخیره کن و **Signing secret** را کپی کن.
7. **گذاشتن سه کلید روی سایت:** در PowerShell، داخل پوشهٔ `C:\unwrapped-fix`، این سه دستور را یکی‌یکی اجرا کن. هر دستور مقدار را می‌پرسد؛ کلید را paste کن و Enter بزن:

```
node_modules\.bin\wrangler.cmd secret put CREEM_API_KEY
node_modules\.bin\wrangler.cmd secret put CREEM_PRODUCT_ID
node_modules\.bin\wrangler.cmd secret put CREEM_WEBHOOK_SECRET
```

بعد از دستور آخر، گزینهٔ کارت **فوراً** در صفحهٔ پرداخت سایت ظاهر می‌شود. (اگر خواستی، به Claude بگو تا دستورها را در ترمینال برایت باز کند.)

## بعد از روشن شدن
- یک خرید واقعی کوچک (Plus ۳۰ روزه، ۴.۹۹ دلار) با کارت خودت بکن تا مطمئن شوی کلید خودکار می‌آید. بعد از Creem درخواست refund بده.
- در `/admin/` سفارش با روش `creem` و وضعیت `paid` دیده می‌شود.
- اگر پرداخت انجام شد ولی کلید فعال نشد: در Creem → Developers → Webhooks ببین webhook خطا داده یا نه. اگر خطای 403 یا «challenge» دیدی، در Cloudflare → Security → Bots گزینهٔ **Bot Fight Mode** را خاموش کن (Creem در مستندات خودش همین را می‌گوید). در همین حالت «Mark paid» در پنل ادمین کلید را دستی می‌دهد.

## نکته‌ها
- پرداخت‌های حالت تست (کلید `creem_test_`) لایسنس نمی‌دهند، مگر متغیر `CREEM_ALLOW_TEST=1` گذاشته شود.
- لایسنس فقط وقتی فعال می‌شود که webhook امضاشده باشد، وضعیت `paid`، ارز USD و مبلغ کامل باشد (تست در `test/backend.test.mjs`).
- وقتی Creem روشن است، گزینهٔ پرداخت دستی (Wise) و Lemon Squeezy پنهان می‌شوند و Telegram Stars گزینهٔ دوم می‌شود.
