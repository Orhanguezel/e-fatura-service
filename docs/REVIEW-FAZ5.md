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

## Canlı öncesi ÖN KOŞULLAR (bloke edici değil ama go-live şart)

1. **`buyer.tckn_vkn` placeholder** (`config einvoice.default_tckn`,
   vars. `11111111111`). Gerçek alıcı kimliği siparişten toplanmıyor. e-arşiv
   nihai tüketici/kimlik kuralı muhasebe ile netleşmeli; sandbox'ta sorun değil,
   **canlıda gerçek VKN/TCKN veya nihai-tüketici akışı** gerekir. (Yüksek)
2. **Order alan eşleme doğrulaması.** Builder `orderMaster/orderDetail`,
   `variant_details`, `tax_rate`, `coupon_discount_amount_admin`,
   `shipping_charge` kullanıyor (null-coalesce ile crash etmez ama **fatura
   doğruluğu** bu eşlemeye bağlı). Tek gerçek siparişle üretilen payload
   gözden geçirilmeli (sandbox). (Orta)
3. **Test kapsamı ince.** Yalnız webhook verifier unit testi var. HANDOFF DoD:
   `EInvoiceClient` Http::fake (202/200/4xx/5xx), feature (paid→job→`e_invoices`),
   contract testi eksik. Canlı öncesi eklenmeli. (Orta)

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
