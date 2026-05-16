# e-fatura-service — Mimari Plan

> Merkezi e-arşiv / e-fatura mikroservisi. Bağımsız repo, scraper-service deseni.
> Tüm Türkiye e-ticaret projeleri (sportoonline, kamanilan, konigsmassage,
> GZLTemizlik) tek bir servisten fatura keser.
> Stack kararı: **Fastify 5 + Bun + Drizzle ORM + MySQL 8** (vps-guezel standardı).
> Deploy kararı: **bağımsız GitHub repo + PM2 + internal port + Nginx 443**
> (scraper-service ile aynı model).

## 1. Neden Mikroservis

- 5+ proje aynı GİB/mali mühür uyumuna ihtiyaç duyuyor → tek yerde çözülür.
- Entegratör API'si, retry, durum senkronu, denetim kaydı tek codebase.
- Entegratör değişimi (Nilvera↔EDM) hiçbir istemciyi etkilemez.
- Emsal: `scraper-service` (merkezi, kendi repo, Nginx+internal port, pilot).

## 2. Konum & Deploy

| Öğe | Değer |
|---|---|
| Repo | github.com/Orhanguezel/e-fatura-service (bağımsız, scraper-service gibi) |
| Dizin | `/home/orhan/Documents/Projeler/e-fatura-service` |
| Runtime | Bun + Fastify 5 |
| DB | MySQL 8 + Drizzle ORM |
| Queue | Redis (BullMQ) — kalıcı kuyruk, servis düşse de kayıp yok |
| Port | internal **8210** (öneri) — Nginx 443 dış. **VPS port tablosu ile çakışma teyit edilecek** (kamanilan 8097, kaman-social 8079, scraper 8200) |
| Process | PM2 `e-fatura-service` |
| URL | efatura.guezelwebdesign.com (Nginx reverse proxy, scraper deseni) |

## 3. Multi-Tenant Model

Her proje = bir **tenant**. İstemci yalnızca `tenant_key` + sipariş verisi gönderir;
mali mühür/entegratör detayını bilmez.

Tenant kaydı (servis DB'sinde, credential şifreli):
- `tenant_key` (sportoonline, kamanilan, ...)
- VKN/TCKN, ünvan, adres
- entegratör driver + credential (Nilvera api_key vb.) — at-rest şifreli
- KDV profili, fatura branding/şablon, test/prod modu
- izinli IP / callback (webhook) URL'si + imzalama secret'ı

## 4. API Sözleşmesi (v1)

Auth: tenant başına `X-Api-Key` (servis ↔ servis, internal network).
Idempotency: `Idempotency-Key` header **zorunlu** (genelde `order_id`).

| Endpoint | Açıklama |
|---|---|
| `POST /v1/invoices` | Fatura oluştur. Body: alıcı, kalemler, KDV, kargo, indirim, para birimi, idempotency-key. 202 + `invoice_id`. |
| `GET /v1/invoices/{id}` | Durum + ETTN + invoice_number. |
| `GET /v1/invoices/{id}/pdf` | PDF (binary/redirect). |
| `POST /v1/invoices/{id}/cancel` | İptal veya iade faturası (kural servise gömülü). |
| `POST /v1/webhooks/test` | İstemci callback doğrulama. |
| `GET /healthz` | Liveness (PM2/Nginx). |

**Webhook (servis → istemci)**: durum değişiminde (`sent`, `approved`,
`failed`, `cancelled`) tenant callback URL'sine imzalı POST. İstemci
erişilemezse üstel retry; istemci ayrıca `GET` ile poll edebilir (idempotent).

## 5. İç Mimari

```
src/
  server.ts                      # Fastify bootstrap
  plugins/                       # auth(apiKey), errorHandler, rateLimit
  routes/v1/invoices.ts
  routes/v1/webhooks.ts
  domain/
    InvoiceProvider.ts           # arayüz (önceki plandan taşındı)
    InvoiceManager.ts            # orkestratör + durum makinesi
    providers/NilveraProvider.ts # birincil adapter
    providers/EdmProvider.ts     # ikincil (sonra)
    InvoiceRequest.ts / InvoiceResult.ts
  queue/
    invoiceQueue.ts              # BullMQ
    workers/createInvoice.ts     # entegratör çağrısı + retry/backoff
    workers/cancelInvoice.ts
    workers/syncStatus.ts        # GİB durum senkronu (cron)
  db/
    schema.ts                    # Drizzle: tenants, invoices, invoice_events
    seed/sql/0XX_*_schema.sql    # CLAUDE.md: ALTER yok, CREATE TABLE'a ekle
  lib/crypto.ts                  # credential at-rest şifreleme
```

`InvoiceProvider` arayüzü ve durum makinesi önceki sportoonline planından
**aynen** taşınır — sadece artık Laravel app'te değil serviste yaşar.

## 6. Veri Modeli (Drizzle + seed SQL)

**CLAUDE.md kuralı**: lokalde `ALTER TABLE` yok. Şema değişimi
`db/seed/sql/0XX_*_schema.sql` içindeki `CREATE TABLE`'a eklenir,
`db:seed:fresh` ile sıfırdan kurulur.

- `tenants` — yukarıdaki tenant alanları, credential şifreli
- `invoices` — tenant_id, idempotency_key (tenant+key unique), external_id/ettn,
  invoice_number, status, type(`earsiv`/`iade`), total/tax/currency,
  request_payload, response_payload, error_message, attempts, sent_at,
  cancelled_at, pdf_path
- `invoice_events` — durum geçiş denetim logu (kim/ne zaman/neden)

Durum makinesi (`pending → sending → sent → approved`, `failed`→retry,
`cancelled/refunded`) önceki plandan değişmez.

## 7. Akış

1. Satış tamamlanır → istemci `POST /v1/invoices` (idempotency-key=order_id).
2. Servis: idempotency kontrolü → `invoices` `pending` → 202 döner (istemci
   bloke olmaz) → BullMQ'ya iş.
3. Worker: `InvoiceManager.create()` → `NilveraProvider` → entegratör UBL-TR
   üretir, **mali mühürle imzalar**, GİB'e iletir.
4. Sonuç → `sent/approved`, ETTN+invoice_number+pdf_path kaydedilir.
5. Servis tenant webhook'una imzalı bildirim → istemci siparişe fatura linkler.
6. Hata → `failed`, backoff retry (tries=5); tükenirse alarm + admin "tekrar
   gönder". Idempotency: external_id doluysa yeniden göndermez, sadece sync.

İptal/iade: e-arşiv iptal süresi geçmediyse `cancel`, geçtiyse iade faturası —
kural serviste, muhasebe teyidi ön koşul.

## 8. İstemci Tarafı (sportoonline / Laravel)

Servise göre sportoonline planı sadeleşir: ağır mantık serviste.

- `App\Services\EInvoiceClient` — ince HTTP client (Laravel `Http`):
  `create()`, `getPdf()`, `cancel()`. Sadece e-fatura-service'i çağırır.
- `OrderInvoiceObserver` → `CreateEInvoiceJob` → `EInvoiceClient->create()`
  (idempotency-key = order id). Entegratör/mali mühür bilgisi **app'te yok**.
- Webhook controller: servis callback'ini doğrula (imza) → sipariş fatura
  durumunu/pdf linkini güncelle.
- Lokal sportoonline ↔ lokal e-fatura-service (Docker/host) ile geliştirilir.

Detay: `quickecommerce/docs/EARSIV-FATURA-ENTEGRASYON-PLANI.md` (güncellendi).

## 9. Test Stratejisi

- Nilvera sandbox (`test_mode`) — gerçek GİB'e gitmez.
- Unit: provider HTTP mock, InvoiceRequest builder (KDV/indirim/kargo/çoklu
  para birimi → TL) — en kritik bölüm.
- Integration: `POST /v1/invoices` → worker → webhook fake → durum assert.
- Contract: istemci (sportoonline) ↔ servis sözleşme testi (Vitest).
- Hata: 4xx/5xx, timeout, geçersiz VKN, idempotency tekrarı, retry tükenmesi.
- Kabul: sandbox'ta PDF+ETTN doğrulanır; canlıda tek gerçek fatura ile
  muhasebe teyidi → tam açılış.

## 10. Fazlama

| Faz | İçerik |
|---|---|
| 0 | Ön koşul: tenant başına mali mühür + Nilvera sözleşmesi + test credential |
| 1 | Repo iskelesi, Fastify+Drizzle, tenants/invoices şema, auth plugin |
| 2 | NilveraProvider + InvoiceRequest builder + BullMQ worker + sandbox test |
| 3 | Webhook + idempotency + retry + status sync cron |
| 4 | İptal/iade + admin panel (tekrar gönder/izleme) |
| 5 | sportoonline EInvoiceClient entegrasyonu (pilot tenant) |
| 6 | VPS deploy (PM2+Nginx+port), canlı tek-fatura teyidi, diğer tenant'lar |

## 11. Riskler

- **Faz 0 bloke edici**: mali mühür/sözleşme her tenant için ayrı; erken başlat.
- **Tek hata noktası**: servis çökerse fatura kesilmez → kuyruk kalıcı (Redis),
  istemci "fatura beklemede" gösterir, senkron bağımlılık yok. Healthz+alarm.
- **Port çakışması**: 8210 önerisi VPS tablosuyla teyit edilecek.
- **Credential güvenliği**: tenant entegratör anahtarları at-rest şifreli,
  `.env` commit edilmez (CLAUDE.md), internal network + IP allowlist.
- **KDV/istisna/çoklu para birimi**: muhasebe danışmanı ile netleştirilmeli;
  e-arşiv TL zorunlu, kur faturada gösterilir.
- **Entegratör API değişimi**: provider soyutlaması izole eder.

## 12. Açık Sorular

1. Pilot tenant sportoonline mı (öneri: evet)? Diğerleri hangi sırada?
2. Her tenant ayrı entegratör mi, hepsi Nilvera mı?
3. VPS: scraper-service ile aynı sunucu mu, port 8210 uygun mu?
4. Webhook mu poll mu — istemci tercihi (ikisi de desteklenecek, varsayılan?).
5. KDV profilleri / iade politikası — muhasebe kararı (tenant bazlı).
