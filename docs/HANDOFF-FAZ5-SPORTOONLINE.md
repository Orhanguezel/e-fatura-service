# Faz 5 Devir Notu — sportoonline İnce İstemci (Codex)

> **Hedef repo:** `quickecommerce/backend-laravel` (Laravel 12) — AYRI repo.
> **Branch:** `codex/faz5-einvoice-client` (quickecommerce repo'sunda).
> Claude (mimar) tasarladı; Codex implemente eder; Claude review + merge.
> Kaynak otorite: **[API-CONTRACT.md](API-CONTRACT.md) (DONMUŞ)** ·
> [ARCHITECTURE.md](ARCHITECTURE.md) §8 ·
> `quickecommerce/docs/EARSIV-FATURA-ENTEGRASYON-PLANI.md` §11.

## Neden şimdi (sıralı bağımlılık)

WORK-PLAN: **Faz 5, Faz 1 sonrası paralel** — yalnız donmuş API-CONTRACT'a
ihtiyaç duyar, Faz 2/3'ü beklemez. Faz 1 `main`'e merge edildi, kontrat dondu.
Faz 2 henüz kabul edilmedi → Faz 5 **mock e-fatura-service**'e karşı geliştirilir;
gerçek servis Faz 2 kabul edilince bağlanır (kontrat değişmez).

## Kapsam (yalnız bunlar)

sportoonline ağır mantık tutmaz; ince HTTP istemci. Mevcut Laravel desenleri
izlenir (`IyzicoService`/`GeliverService` + `config/services.php` + `test_mode`).

### 1. `App\Services\EInvoiceClient`
Laravel `Http` ile e-fatura-service'i çağıran ince client. Entegratör/mali mühür
bilgisi **app'te YOK**. Metotlar API-CONTRACT'a birebir:
- `create(array $payload, string $idempotencyKey): array`
  → `POST /v1/invoices`, header `X-Api-Key` + `Idempotency-Key`. 202/200 döner.
- `getStatus(int $invoiceId): array` → `GET /v1/invoices/{id}` (idempotent poll).
- `getPdf(int $invoiceId): string|RedirectResponse` → `GET /v1/invoices/{id}/pdf`.
- `cancel(int $invoiceId, string $reason): array` → `POST /v1/invoices/{id}/cancel`.
- Timeout + retry (transient 5xx/timeout) ; hata → API-CONTRACT hata zarfını
  (`error.code`) parse edip domain exception fırlat (`EInvoiceServiceException`).

### 2. `config/services.php` → `einvoice` bloğu
```php
'einvoice' => [
    'base_url'  => env('EINVOICE_BASE_URL'),     // lokal: mock; prod: efatura.guezelwebdesign.com
    'api_key'   => env('EINVOICE_API_KEY'),       // tenant key (sportoonline)
    'webhook_secret' => env('EINVOICE_WEBHOOK_SECRET'),
    'timeout'   => env('EINVOICE_TIMEOUT', 10),
],
```
`.env.example`'a **boş** anahtarlar (CLAUDE.md: `.env` commit edilmez).

### 3. Sipariş tetiği — mevcut `OrderObserver`'a ekleme
`app/Observers/OrderObserver.php` zaten var. Sipariş `paid`/`completed`
geçişinde **`CreateEInvoiceJob` dispatch** (queue — satış akışı GİB latency'sine
bloke OLMAZ). Gözlemci ağır iş yapmaz, yalnız job atar. Çift fatura guard:
`e_invoices` özet tablosunda `order_id` unique + job içinde idempotency.

### 4. `App\Jobs\CreateEInvoiceJob`
`OrderMaster`/`OrderDetail`/`OrderAddress`'ten API-CONTRACT `POST /v1/invoices`
gövdesini kurar (buyer, lines[name,quantity,unit,unit_price,vat_rate,discount],
shipping, global_discount, currency, exchange_rate, issue_date, note).
`EInvoiceClient->create(payload, idempotencyKey = (string)$order->id)`.
Servis 202 → `e_invoices` satırı `pending`/`sending`. `tries=5`, `backoff()`
üstel. **Tutar app'te yeniden hesaplanmaz** — servis otoritedir (API-CONTRACT);
app yalnız ham kalemleri gönderir.

### 5. Webhook controller — `POST /webhooks/einvoice`
e-fatura-service callback'i. API-CONTRACT "Webhook" bölümüne göre doğrula:
1. `X-Efatura-Timestamp` tazeliği ±5 dk değilse 400 (replay koruması).
2. İmza: `sha256=` + HMAC-SHA256(`timestamp . "." . rawBody`, `webhook_secret`);
   `hash_equals` ile sabit-zaman karşılaştır. Uymazsa 401.
3. `idempotency_key` ile siparişi bul → `e_invoices` özetini güncelle
   (`status`, `ettn`, `invoice_number`, `pdf_url`). **İdempotent**: aynı event
   tekrar gelirse no-op. 2xx dön.
- Route `web`/`api` CSRF dışı; yalnız imza ile korunur.

### 6. `e_invoices` özet tablosu — Laravel migration (ALTER YOK)
CLAUDE.md: lokalde ALTER yok → **yeni tablo migration** (mevcut tabloya kolon
değil). Yalnız **özet** tutulur; kaynak serviste.
| Kolon | Not |
|---|---|
| id | pk |
| order_id | FK orders, **unique** (idempotency) |
| service_invoice_id | servisteki `invoice_id` |
| status | servis durumunun aynası |
| ettn / invoice_number | null'lanabilir |
| pdf_url | servis PDF linki |
| last_error | son hata |
| timestamps | |

### 7. Müşteri/Admin UI
Sipariş detay + e-postada "Faturayı indir" → servis PDF'ine proxy/redirect
(`EInvoiceClient->getPdf`). Admin'de "yeniden gönder" → servise iletir.

## Mock e-fatura-service (paralel geliştirme)
Gerçek servis Faz 2 kabul edilene kadar: API-CONTRACT'a uygun basit stub
(`POST /v1/invoices`→202; kısa süre sonra `invoice.approved` webhook'u + `GET`
poll cevabı). Contract testi (Pest/PHPUnit) bu mock'a karşı yazılır. Faz 2
kabul → `EINVOICE_BASE_URL` lokal gerçek servise çevrilir, kontrat değişmez.

## Sınırlar (Faz 5'te YAPMA)
- Entegratör/Nilvera/mali mühür mantığı (serviste, app'te asla).
- Tutar/KDV yeniden hesabı (servis otorite).
- e-fatura-service repo'suna dokunma (ayrı repo, ayrı branch).

## Test (DoD)
- Unit: `EInvoiceClient` `Http::fake()` (202/200/4xx/5xx/timeout → exception eşleme).
- Unit: webhook imza doğrulama (geçerli/bozuk imza/eski timestamp).
- Feature: sipariş `paid` → `CreateEInvoiceJob` → mock → `e_invoices.sent`.
- Contract: mock e-fatura-service ↔ EInvoiceClient (API-CONTRACT uyumu).
- Idempotency: aynı sipariş iki kez → tek `e_invoices`, çift fatura yok.

## Süreç (branch izolasyonu — WORK-PLAN §1)
- Codex `quickecommerce` repo'sunda `codex/faz5-einvoice-client` branch'inde çalışır.
- e-fatura-service `docs/` yalnız Claude. Bu spec otorite; sapma için Claude'a sor.
- Codex bitince Claude review → quickecommerce `main`'e merge (Claude).
- Çıktı raporu: `bun`/`composer` test yeşil + contract testi + mock E2E kanıtı.
