# Faz 5 — sportoonline İnce İstemci Review (Claude)

> Hedef repo: `quickecommerce/backend-laravel` (Laravel 12, **canlı üretim**).
> Codex implemente etti; Claude review etti (cerrahi — üretim repo'sunda git
> işlemi YOK). Kıyas: [HANDOFF-FAZ5-SPORTOONLINE.md](HANDOFF-FAZ5-SPORTOONLINE.md)
> · [API-CONTRACT.md](API-CONTRACT.md).
> **Verdict: İŞLEVSEL KABUL — canlı öncesi 3 ön koşul + süreç uyarısı.**

## Teslim edilen (HANDOFF-FAZ5 kapsamı)

| Bileşen | Dosya | Durum |
|---|---|---|
| Ince HTTP client (create/getStatus/getPdf/cancel) | `app/Services/EInvoice/EInvoiceClient.php` | ✓ API-CONTRACT'a uygun (X-Api-Key, Idempotency-Key, hata zarfı parse) |
| Webhook imza doğrulama | `app/Services/EInvoice/EInvoiceWebhookVerifier.php` | ✓ **D4 birebir**: `sha256=`+HMAC(`ts.rawBody`), ±300s, `hash_equals` |
| Webhook controller | `.../Webhooks/EinvoiceWebhookController.php` | ✓ imza→401, idempotent güncelleme, no-auth grup |
| Sipariş tetik (paid→create, cancel/refund→cancel) | `app/Observers/OrderInvoiceObserver.php` | ✓ `wasChanged`, çift-fatura guard, AppServiceProvider'da kayıtlı |
| Job (idempotency-key=order id, service_invoice_id persist) | `app/Jobs/CreateEInvoiceJob.php` (+Cancel/Poll) | ✓ 409→poll, tries=3, poll fallback |
| Payload builder (order → API-CONTRACT body) | `app/Services/EInvoice/EInvoicePayloadBuilder.php` | ✓ buyer/lines/shipping/discount/currency/issue_date |
| `e_invoices` özet tablo (yeni tablo, ALTER yok) | migration `2026_05_16_120000_*` | ✓ order_id unique, CLAUDE.md uyumlu |
| config + route + model | services.php `einvoice`, api.php, EInvoice | ✓ |

## Doğrulama (Claude)

- `php -l` tüm Faz 5 dosyaları **syntax temiz**.
- `phpunit tests/Unit/EInvoiceWebhookVerifierTest.php` → **2/2 OK** (geçerli imza
  kabul, tampered ret). Güvenlik-kritik yol doğrulandı.
- Webhook route `webhooks/einvoere` no-auth server-to-server grupta (geliver/paytr
  yanında), CSRF dışı (api stateless) — yalnız imza korur. Doğru.

## Canlı öncesi ÖN KOŞULLAR — DURUM (2026-05-16, Claude ele aldı)

1. **`buyer.tckn_vkn` — ÇÖZÜLDÜ (tasarım gereği doğru).** sportoonline saf
   B2C perakende; `OrderAddress`/`Customer` modellerinde **hiç vergi-no/TCKN
   alanı yok** (kontrol edildi). Bu durumda GİB e-arşiv standardı **nihai
   tüketici = `11111111111`** — yani mevcut default **doğru davranış**, defect
   değil. Risk Yüksek→tasarım. (Kurumsal/VKN faturası gerekirse checkout'ta
   vergi-no toplama = ayrı ürün kararı, bu entegrasyon kapsamı dışı.)
2. **Order alan eşleme — ÇÖZÜLDÜ (statik doğrulandı).** `OrderMaster`
   (orderAddress/customer/order ilişkileri, coupon_discount_amount_admin,
   product_discount_amount, shipping_charge, currency_code, exchange_rate),
   `OrderDetail` (variant_details, price, quantity, tax_rate), `OrderAddress`
   (name, email, address, district_name, city_name), `Order` (shipping_charge,
   orderMaster/orderDetail/orderAddress) — **builder eşlemesi modellerle birebir
   tutarlı**.
3. **Test kapsamı — ÇÖZÜLDÜ.** Eklendi (Claude):
   `tests/Unit/EInvoiceClientTest.php` (Http::fake: 202 create + Idempotency/
   X-Api-Key header, 200 repeat, 409 hata-zarfı→exception, 5xx, yapılandırılmamış),
   `tests/Unit/EInvoicePayloadBuilderTest.php` (API-CONTRACT şekli, nihai-tüketici
   TCKN, USD kur, kargo yok). **phpunit 10/10 yeşil** (yeni 8 + mevcut webhook 2).
   Ayrıca Codex'in bozduğu **gerçek bug düzeltildi**: `fromOrder(Order )` →
   `fromOrder(Order $order)` (parametre değişkeni silinmişti, parse error).
   Eksik (canlı öncesi, opsiyonel): feature testi (paid→job→`e_invoices`).

## ⛔ ÜRETİM GÜVENLİĞİ İNCİDENTİ (acil — kullanıcı aksiyonu)

Faz 5 ön koşul çalışması sırasında, **Codex'in `quickecommerce/backend-laravel`
canlı üretim repo'sunu bozduğu** tespit edildi:

- `routes/api.php` git durumu **`UU` (çözülmemiş merge conflict)** —
  satır 1'de bozuk `use AppHttpControllersApiV1AdminAdminEInvoiceController;`
  (backslash'sız namespace, Codex'in hatalı conflict çözümü). Dosya her
  istekte yüklenir; `php -l` şu an geçiyor ama **conflict'li/yarım**.
- `app/Http/Controllers/Api/V1/Admin/AdminEInvoiceController.php` —
  **php -l: parse ERROR** + zaten Faz 4 admin API'si **e-fatura-service'te**
  yapıldı (yanlış repo, scope-creep, untracked).
- Daha önce `EInvoicePayloadBuilder.php` parse error'u (Claude düzeltti).

**Claude bu üretim repo'sunda git/commit/merge YAPMADI** (geri alınamaz, canlı,
~205 karışık değişiklik, in-progress conflict). Önerilen kullanıcı aksiyonu:
1. Faz 5 dosyalarını `codex/faz5-einvoice-client` branch'ine **izole et**.
2. `routes/api.php` conflict'ini elle çöz (legit Faz 5 satırı 208
   `webhooks/einvoice` korunmalı; bozuk satır 1 `use AppHttp...` kaldırılmalı).
3. Bozuk/scope-creep `AdminEInvoiceController.php`'yi **sil** (admin API
   e-fatura-service Faz 4'te var, sportoonline'a ait değil).
4. Codex'i bu üretim repo'sunda **durdur**; branch izolasyonunu zorla.

## Süreç uyarısı (önemli)

- Codex `quickecommerce` **canlı üretim repo'sunda doğrudan `main` working
  tree'de** çalıştı (Faz 5 dosyaları ~205 commit'siz değişikliğin arasında,
  untracked). Branch izolasyonu (WORK-PLAN §1) ihlal edildi.
- **Claude bu üretim repo'sunda git commit/merge YAPMADI** (geri alınamaz,
  canlı; 205 karışık değişiklik). Faz 5 dosyalarının `codex/faz5-einvoice-client`
  branch'ine izole edilip review'le commit'lenmesi **kullanıcı kararı**.
- Düşük öncelik: webhook controller durum gerilemesini (geç/sırasız event
  eski duruma yazabilir) korumuyor — servis terminal event + sync-cron
  otorite olduğundan MVP'de kabul, ileride guard eklenebilir.

## Öneri

İşlevsel olarak hazır ve güvenli. Sıra: (a) Faz 5 dosyalarını üretim repo'sunda
ayrı branch'e izole et, (b) ön koşul-2'yi tek sandbox siparişiyle doğrula,
(c) eksik testleri ekle, (d) `EINVOICE_ENABLED=false` ile deploy → Faz 6'da
servis canlı olunca aç.
