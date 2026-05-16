# e-fatura-service — İş Planı & Orkestrasyon (4-AI)

> Bu doküman ARCHITECTURE.md'nin uygulama planıdır. Claude Code (mimar) yazar.
> Kod yazımı bu doküman onaylandıktan sonra fazlara göre Codex'e devredilir.
>
> **Kullanıcı kararları (2026-05-16):**
> - Faz 0: sportoonline için **tam hazır** (mali mühür + Nilvera prod sözleşmesi).
>   → canlı tek-fatura teyidine kadar gidilebilir.
> - Entegratör: **çoklu entegratör baştan** — tenant bazlı driver, Faz 1'de
>   Nilvera adapter + EDM iskeleti birlikte tasarlanır.
> - VPS: scraper ile **aynı sunucu** (vps-guezel 72.61.93.212), port **deploy
>   fazında teyit** (8210 öneri; tablo: kamanilan 8097, kaman-social 8079,
>   scraper 8200, scraper-redis 6390).
> - AI akışı: **Claude tasarla → Codex yaz → Antigravity doğrula → Cursor cila**.

---

## 1. AI Rol Dağılımı

| AI | Rol | Çıktı |
|---|---|---|
| **Claude Code** | Mimar/stratejist. Şema, API kontratı, kripto/auth/webhook tasarımı, review, root-cause | `docs/` spec + kontrat dosyaları, kod review |
| **Codex** | Toplu implementasyon. Faz spec'ini koda döker | `src/` modülleri, testler |
| **Antigravity** | Doğrulama. Test çalıştırma, sandbox fatura/PDF teyidi, admin UI screenshot | Test raporu, kabul kanıtı |
| **Cursor** | Cila. Refactor, tip sıkılaştırma, boilerplate, lint/format | Temizlenmiş diff |

**Çakışma önleme — BRANCH İZOLASYONU (kullanıcı kararı 2026-05-16):**
1. **Her AI kendi branch'inde çalışır. Aynı branch'te iki AI YOK.**
   - Claude → `claude/*` (spec, review, fix, merge)
   - Codex → `codex/*` (implementasyon, örn. `codex/phase-2-nilvera`)
   - Cursor → `cursor/*` (refactor/cila)
   - Antigravity → doğrulama (kod yazmaz; bulguyu rapora)
2. **`main`'e merge + commit + deploy yalnızca Claude.** Codex/Cursor branch'lerini
   Claude review edip merge eder; doğrudan `main`'e push yok.
3. `docs/` spec'leri yalnızca Claude yazar (Faz spec çakışması biter).
4. Akış sıralı: Claude spec → Codex implement (kendi branch) → Claude review →
   Antigravity verify → Cursor polish (kendi branch) → Claude merge.
5. Codex bir fazı bitirmeden Antigravity doğrulamaz.
6. Branch isimleri faz içerir: `codex/phase-N-<konu>`. Faz bitince Claude
   `main`'e merge eder, sonraki faz yeni branch.

---

## 2. Kilitlenen Mimari Kararlar (Codex bunlara uyar)

| # | Karar | Detay |
|---|---|---|
| D1 | **Credential şifreleme** | `lib/crypto.ts` AES-256-GCM. Anahtar `EFATURA_ENC_KEY` (32 byte, .env, commit edilmez). Saklama: `base64(iv).base64(tag).base64(ciphertext)`. |
| D2 | **Tenant auth** | `X-Api-Key` header. DB'de **sha256 hash** saklanır, plaintext değil. Opsiyonel IP allowlist (`tenants.allowed_ips`). |
| D3 | **Idempotency** | `invoices` üzerinde `UNIQUE(tenant_id, idempotency_key)`. Tekrar istek → mevcut kaydı **200** ile döner (yeni 202 değil). |
| D4 | **Webhook imzası** | HMAC-SHA256(body, `tenant.webhook_secret`). Header `X-Efatura-Signature` + `X-Efatura-Timestamp` (replay koruması, ±5dk). |
| D5 | **Driver registry** | `tenants.integrator_driver` enum `('nilvera','edm')`. `domain/ProviderFactory.ts` driver'ı resolve eder. Faz 1'de EDM adapter `NotImplementedError` fırlatan iskelet. |
| D6 | **Durum makinesi** | `pending → sending → sent → approved`; `failed → (retry) → sending`; `cancelled` / `refunded` terminal. Geçişler `invoice_events`'e loglanır. |
| D7 | **Queue** | BullMQ, **ayrı Redis instance** (scraper-redis 6390 ile paylaşılmaz). Kuyruklar: `invoice-create`, `invoice-cancel`, `status-sync` (repeatable cron job). |
| D8 | **Para birimi** | e-arşiv **TL zorunlu**. Çoklu para birimi → builder TL'ye çevirir, kuru faturada gösterir. KDV/istisna profili `tenants.tax_profile` (JSON). |
| D9 | **Portföy zorunluluğu** | Repo kökünde `project.portfolio.json` (CLAUDE.md kuralı) Faz 1 çıktısıdır. |
| D10 | **Şema değişimi** | ALTER yok. `db/seed/sql/0XX_*_schema.sql` `CREATE TABLE`'a eklenir, `db:seed:fresh` ile sıfırdan kurulur (CLAUDE.md). |

**Hâlâ açık (muhasebe/kullanıcı kararı — scaffold'u bloke etmez):**
- KDV profilleri & iade politikası tenant bazında (muhasebe danışmanı) → `tax_profile` JSON şeması Faz 2'de muhasebe teyidiyle doldurulur.
- Webhook mu poll mu varsayılan → **öneri: webhook varsayılan**, poll (`GET /v1/invoices/{id}`) her zaman idempotent fallback olarak açık.

---

## 3. API Kontratı (v1) — Faz 1'de DONDURULUR

Bu kontrat Faz 1 sonunda kilitlenir; Faz 5 (sportoonline client) buna karşı
**mock servisle paralel** geliştirilir.

| Endpoint | İstek | Yanıt |
|---|---|---|
| `POST /v1/invoices` | `X-Api-Key`, `Idempotency-Key`; body: alıcı, kalemler, KDV, kargo, indirim, currency | `202 {invoice_id, status}` (yeni) / `200 {...}` (tekrar) |
| `GET /v1/invoices/{id}` | `X-Api-Key` | `200 {status, ettn, invoice_number, pdf_url}` |
| `GET /v1/invoices/{id}/pdf` | `X-Api-Key` | `302 redirect` / binary |
| `POST /v1/invoices/{id}/cancel` | `X-Api-Key`; body: reason | `202 {status}` |
| `POST /v1/webhooks/test` | `X-Api-Key` | tenant callback doğrulama |
| `GET /healthz` | — | `200` liveness |

Webhook (servis→istemci): `sent/approved/failed/cancelled` geçişinde imzalı
POST → `tenant.webhook_url`. Erişilemezse üstel retry; istemci ayrıca poll eder.

---

## 4. Faz Planı & Görev Paketleri

Bağımlılık: **F1 → F2 → F3 → F4 → F6**. **F5, F1 sonrası paralel** (mock servisle).

### Faz 1 — İskele + Şema + Auth (bloke edici temel)
**Branch:** `feat/phase-1-scaffold`

| Sahip | Görev | Dosyalar |
|---|---|---|
| Claude | Şema tasarımı, API kontratı dondurma, kripto/auth spec | `docs/SCHEMA.md`, `docs/API-CONTRACT.md` (bu doküman + ARCHITECTURE'dan türet) |
| Codex | Bun+Fastify 5 bootstrap, Drizzle kurulum, `tenants/invoices/invoice_events` şema + seed SQL, `apiKey` auth plugin, `crypto.ts`, `healthz`, `project.portfolio.json`, `.env.example` | `src/server.ts`, `src/plugins/*`, `src/db/schema.ts`, `src/db/seed/sql/001_*_schema.sql`, `src/lib/crypto.ts`, `project.portfolio.json` |
| Antigravity | `db:seed:fresh` çalışır, `healthz` 200, auth plugin reddi (401) doğrula | test raporu |
| Cursor | tsconfig strict, lint/format, tip cila | — |
**Çıktı:** Şema kurulu, API kontratı dondu, auth çalışıyor.

### Faz 2 — NilveraProvider + Builder + Worker (sandbox)
**Branch:** `feat/phase-2-nilvera`

| Sahip | Görev | Dosyalar |
|---|---|---|
| Claude | `InvoiceProvider` arayüzü + `InvoiceRequest/Result` DTO + `ProviderFactory` + KDV/indirim/kargo/çoklu-kur builder kuralları spec'i (muhasebe teyidiyle) | `docs/PROVIDER-SPEC.md` |
| Codex | `domain/InvoiceProvider.ts`, `InvoiceManager.ts`, `providers/NilveraProvider.ts`, `providers/EdmProvider.ts` (iskelet), `InvoiceRequest/Result.ts`, `queue/invoiceQueue.ts`, `workers/createInvoice.ts` | `src/domain/*`, `src/queue/*` |
| Antigravity | Nilvera **sandbox** ile gerçek fatura kes → PDF + ETTN doğrula | sandbox kanıtı |
| Cursor | Builder matematik refactor, edge-case tip daraltma | — |
**Çıktı:** Sandbox'ta fatura kesiliyor, PDF+ETTN geliyor.

### Faz 3 — Webhook + Idempotency + Retry + Status Sync
**Branch:** `feat/phase-3-reliability`

| Sahip | Görev | Dosyalar |
|---|---|---|
| Claude | Webhook imza protokolü, retry/backoff politikası, sync-cron spec | `docs/WEBHOOK-SPEC.md` |
| Codex | `routes/v1/webhooks.ts`, idempotency guard, backoff (tries=5), `workers/syncStatus.ts` (cron), `invoice_events` log | `src/routes/v1/*`, `src/queue/workers/*` |
| Antigravity | Idempotency tekrarı, retry tükenmesi, webhook imza doğrulama senaryoları | test raporu |
| Cursor | Hata sınıfları, error handler cila | `src/plugins/errorHandler.ts` |
**Çıktı:** Güvenilir asenkron akış, kalıcı kuyruk.

### Faz 4 — İptal/İade + Admin Panel
**Branch:** `feat/phase-4-cancel-admin`

| Sahip | Görev | Dosyalar |
|---|---|---|
| Claude | İptal vs iade-faturası kural ağacı (muhasebe ön koşul), admin yetki modeli | `docs/CANCEL-RULES.md` |
| Codex | `workers/cancelInvoice.ts`, `cancel` endpoint, admin API (listeleme/tekrar gönder) | `src/queue/workers/cancelInvoice.ts`, `src/routes/v1/*` |
| Antigravity | Admin panel UI screenshot doğrulama, "tekrar gönder" akışı | UI kanıtı |
| Cursor | Admin UI bileşen cila | admin paneli |
**Çıktı:** İptal/iade + operasyonel izleme.

### Faz 5 — sportoonline İnce İstemci (PARALEL, F1 sonrası)
**Repo:** `quickecommerce/backend-laravel` (ayrı repo, çakışma yok)
**Branch:** `feat/einvoice-client`

| Sahip | Görev | Dosyalar |
|---|---|---|
| Claude | Laravel client kontrat eşleştirme review | review |
| Codex | `App\Services\EInvoiceClient`, `OrderInvoiceObserver`, `CreateEInvoiceJob`, webhook controller, `e_invoices` özet tablo migration | quickecommerce Laravel app |
| Antigravity | lokal sportoonline ↔ lokal e-fatura-service uçtan uca | E2E kanıtı |
| Cursor | Laravel kod cila | — |
**Çıktı:** sportoonline pilot tenant olarak servisi tüketiyor.
**Not:** F1 kontratı donduktan sonra mock servisle başlar; gerçek servisi F2 sonrası bağlar.

### Faz 6 — VPS Deploy + Canlı Teyit + Diğer Tenant'lar
**Sahip:** Claude (plan) → Codex (script) → Antigravity (canlı tek-fatura teyidi)
- VPS port tablosu teyit (8210 vs çakışma), ayrı Redis portu (öneri 6391 internal-only).
- PM2 `e-fatura-service`, Nginx `efatura.guezelwebdesign.com` 443.
- Canlıda **tek gerçek fatura** → muhasebe teyidi → tam açılış.
- sportoonline yeşil → sonraki tenant'lar (kamanilan, konigsmassage, GZLTemizlik) tenant kaydı ekleyerek.

---

## 5. İlk Aksiyon (onay sonrası)

1. `git init` + ilk commit (docs).
2. **Faz 1 branch** aç, Claude `docs/SCHEMA.md` + `docs/API-CONTRACT.md` üretir.
3. Codex Faz 1 implementasyona başlar.

## 6. Riskler (ARCHITECTURE §11 + plan)

- Tek hata noktası → kalıcı Redis kuyruğu, istemci "beklemede", healthz+alarm.
- Port/Redis çakışması → Faz 6'da tablo teyidi (ayrı Redis portu).
- KDV/iade muhasebe kararı → F2/F4'te muhasebe teyidi ön koşul.
- Credential güvenliği → D1/D2, internal network + IP allowlist.
- Çoklu entegratör → ProviderFactory izolasyonu, EDM iskeleti F1'den.
