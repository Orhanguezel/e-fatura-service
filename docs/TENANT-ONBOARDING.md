# Yeni Tenant Ekleme Runbook (portföy projeleri → e-fatura-service)

> Merkezi servis multi-tenant: her proje bir **tenant**. Yeni proje
> e-Arşiv isterse **çekirdek/altyapı değişmez**; tenant kaydı + ince istemci.
> İlk uygulayan: **GoldMoodAstro** (sportoonline'dan sonra).

## Karar matrisi — iş/idari (Faz 0 tekrarı GEREKİR Mİ?)

| Durum | Faz 0 | Maliyet |
|---|---|---|
| **Aynı firma/VKN** (sportoonline ile) | ❌ Tekrar YOK | Ek sözleşme/mükellefiyet yok; mevcut Nilvera hesabı kapsar |
| Farklı firma/VKN | ✅ Yeni Faz 0 (`FAZ-0-ONKOSULLAR.md`) | Ayrı Nilvera hesabı + mükellefiyet |

> **GoldMoodAstro: FARKLI firma/VKN** (kullanıcı düzeltmesi 2026-05-16:
> bambaşka firma, ayrı tenant) → **kendi Faz 0'ını yapar** (`FAZ-0-ONKOSULLAR.md`):
> kendi Nilvera hesabı/sözleşme/key + mali mühür + GİB mükellefiyeti + mali
> müşavir teyidi. Sportoonline credential'ı kullanılamaz. Servis tarafı yine
> değişmez (yeni tenant_key + kendi şifreli Nilvera key'i).

## Credential matrisi (ne ALINIR / ne ÜRETİLİR)

**Aynı firma/VKN tenant** (örnek senaryo — yeni proje mevcut bir VKN'ye eklenirse):

| Kalem | Dışarıdan alınır mı | Açıklama |
|---|---|---|
| Nilvera hesabı/sözleşme/API key | ❌ Hayır | Mevcut VKN tenant'ının PROD key'i yeniden kullanılır |
| Mali mühür / GİB mükellefiyeti | ❌ Hayır | Aynı VKN zaten mükellef |
| `tenant_key` | ✅ Servis üretir | Projeye özel |
| **`X-Api-Key`** | ✅ Servis üretir | Her tenant **FARKLI** (izolasyon), app `.env`'ine |
| **`webhook_secret`** | ✅ Servis üretir | Her tenant farklı (HMAC) |
| `integrator_credentials` | ✅ Servis yazar | Aynı VKN → **aynı Nilvera key**, şifreli |

→ Aynı-VKN tenant **dışarıya hiçbir başvuru yapmaz**; tüm anahtarlar servis
tarafından üretilir/yeniden kullanılır. Tek karar (mali müşavir): aynı VKN
altında **ayrı fatura serisi/şube** isteniyor mu (muhasebe ayrıştırması;
Nilvera panel konfigürasyonu, yeni hesap değil).

**Farklı firma/VKN tenant** → ek olarak `FAZ-0-ONKOSULLAR.md` (kendi Nilvera
hesabı + mükellefiyet) gerekir.

## Adımlar

### 1. Tenant kaydı (servis DB)
- `tenants` satırı: `tenant_key` (örn. `goldmoodastro`), VKN/ünvan/adres
  (aynı firma → sportoonline ile aynı VKN), `integrator_driver` (`nilvera`),
  `integrator_credentials` (aynı firma → aynı Nilvera key, **şifreli**),
  `webhook_url` (projenin callback'i), `webhook_secret` (yeni üret),
  `api_key` (yeni üret, hash'lenir), `tax_profile`, `mode`.
- ALTER yok (CLAUDE.md): seed SQL deseni veya admin ile eklenir.
- Çıktı: projeye özel `X-Api-Key` + `webhook_secret`.

### 2. İnce istemci — **projenin stack'ine göre** (kod kopyası DEĞİL, desen aynı)

| Proje | Stack | İstemci |
|---|---|---|
| sportoonline | Laravel | `App\Services\EInvoiceClient` (PHP) — `HANDOFF-FAZ5-SPORTOONLINE.md` |
| **GoldMoodAstro** | **Bun + TS** (Fastify ailesi) | TS HTTP client — ayrı HANDOFF (aşağıda) |

Her istemci aynı **donmuş API-CONTRACT**'a konuşur:
`POST /v1/invoices` (X-Api-Key + Idempotency-Key=order/ödeme id), webhook imza
doğrulama (HMAC D4: `sha256=`+HMAC(`ts.rawBody`, secret), ±300s), `e_invoices`
özet tablo (projenin DB'sinde, ALTER yok), config bloğu (`.env`, commit yok).

Bileşenler (her stack'te muadili):
- HTTP client: `create/getStatus/getPdf/cancel`
- Satış/ödeme tamamlandı tetiği → kuyruk/job → servise `create`
- Webhook endpoint (`/webhooks/einvoice`) — imza doğrula → özet güncelle (idempotent)
- `e_invoices` özet tablo migration
- `EINVOICE_ENABLED=false` ile deploy → servis canlı olunca aç

### 3. Doğrulama
- Sandbox tenant + test ödemesi → PDF+ETTN, iptal/iade, webhook, idempotency.
- Mali müşavir KDV/senaryo teyidi: aynı VKN ise mevcut profil; **farklı VKN ise
  tenant'ın kendi mali müşaviri/vergi profili** (ayrı Faz 0).

## GoldMoodAstro — özel notlar

- **Firma/VKN:** ⚠️ sportoonline'dan **bağımsız tüzel kişi** (kullanıcı
  düzeltmesi 2026-05-16). → **kendi Faz 0'ını yapar** (kendi Nilvera hesabı/
  key + mali mühür + GİB mükellefiyeti + mali müşavir). Sportoonline credential
  paylaşılmaz. Servis: ayrı tenant + goldmoodastro'nun kendi şifreli Nilvera key'i.
- **Gelir modeli:** web/site ödemesi (Iyzico/Stripe) — sportoonline'a en yakın;
  ödeme tamamlanınca fatura. (Mobil in-app satın alma DEĞİL → Apple/Google
  merchant-of-record komplikasyonu yok.)
- **Stack:** backend Bun+TS → istemci TS; sportoonline Laravel kodunun **kopyası
  değil**, aynı kontrat/desenin TS muadili. Ayrı HANDOFF spec'i Claude üretir.
- **Sıra/gate:** ⏸ **Sportoonline Nilvera'da canlı (gerçek fatura teyitli)
  OLMADAN goldmoodastro'ya BAŞLAMA** (kullanıcı kararı 2026-05-16). Şimdilik
  yalnız plan; sportoonline yeşil → goldmoodastro tenant + TS istemci sırada.
- Proje içi plan: `goldmoodastro/doc/E-ARSIV-PLAN.md` (bu runbook'un projeye
  özel özeti).

## Sonraki tenant'lar
Kamanilan, GZLTemizlik, konigsmassage… aynı runbook. Aynı firma/VKN ise Faz 0
yok; farklıysa `FAZ-0-ONKOSULLAR.md`. Servis çekirdeği her zaman dokunulmaz.
