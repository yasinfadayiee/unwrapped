# راه‌اندازی پرداخت با کارت و PayPal (Lemon Squeezy)

کد پرداخت با کارت روی سایت آماده است و فقط منتظر چهار کلید است. وقتی این چهار کلید را بگذاری، گزینهٔ
**Card · PayPal** خودکار اول لیست پرداخت می‌آید (Visa، Mastercard، Apple Pay، Google Pay، PayPal).
Lemon Squeezy «فروشندهٔ رسمی» (Merchant of Record) است: مالیات/VAT و chargeback را خودش انجام می‌دهد و پول را به حساب بانکی یا PayPal تو واریز می‌کند.

چرا مهم است: تا امروز (۲۹ اکتبر ۲۰۲۶) ۲۴ سفارش ثبت شده و هیچ‌کدام از مشتری‌های واقعی پرداخت نکرده‌اند.
تنها پیام پشتیبانی هم این بوده: «چطور بدون کریپتو پرداخت کنم؟». بیشتر مشتری‌ها نه کریپتو دارند نه Telegram Stars.

## مراحل (حدود ۱۵ دقیقه + زمان تأیید فروشگاه)

1. در https://lemonsqueezy.com ثبت‌نام کن، یک Store بساز و بخش **Identity verification** و **Payouts** (بانک یا PayPal) را کامل کن.
   قبل از اینکه پرداخت واقعی بگیری، Lemon Squeezy باید فروشگاه را تأیید (Activate) کند.
2. **Products → New product**: نام `Unwrapped`، نوع پرداخت **Single payment**، قیمت هر عددی (مثلاً ۵ دلار؛ سایت برای هر سفارش قیمت درست را خودش می‌فرستد). ذخیره کن.
   بعد روی محصول ← Variant ← عدد **Variant ID** را بردار.
3. **Settings → Stores**: عدد **Store ID** را بردار.
4. **Settings → API → Create API key**: کلید را کپی کن.
5. **Settings → Webhooks → +**:
   - URL: `https://myunwrapped.com/api/webhook/lemonsqueezy`
   - Signing secret: یک رمز تصادفی طولانی بساز و نگه دار
   - Events: فقط `order_created`
6. چهار کلید را خودت در ترمینال بگذار (هر دستور مقدار را می‌پرسد):

```
node_modules\.bin\wrangler.cmd secret put LEMONSQUEEZY_API_KEY
node_modules\.bin\wrangler.cmd secret put LEMONSQUEEZY_STORE_ID
node_modules\.bin\wrangler.cmd secret put LEMONSQUEEZY_VARIANT_ID
node_modules\.bin\wrangler.cmd secret put LEMONSQUEEZY_WEBHOOK_SECRET
```

بعد از آخرین دستور، گزینهٔ کارت فوراً در صفحهٔ پرداخت سایت ظاهر می‌شود و Telegram Stars به گزینهٔ دوم می‌رود.

## نکته‌ها
- پرداخت‌های حالت تست (Test mode) لایسنس نمی‌دهند، مگر متغیر `LEMONSQUEEZY_ALLOW_TEST=1` گذاشته شود.
- لایسنس فقط وقتی فعال می‌شود که webhook امضاشده، وضعیت `paid` و مبلغ کامل باشد (تست در `test/backend.test.mjs`).
- اگر Lemon Squeezy فروشگاه را تأیید نکرد، جایگزین‌ها: Paddle یا Polar.sh (کد جدا لازم دارند؛ به Claude بگو).
