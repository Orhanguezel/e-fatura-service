# Faz 2 Kod Review — Claude (mimar)

> ## ✅ RE-REVIEW (snapshot `9c9bf5a`): KABUL — `main`'e merge edildi
> Tüm blokerler kapandı:
> - **B1 çözüldü:** `invoiceQueue.ts` lazy factory (`getInvoiceQueue/closeInvoiceQueue`),
>   import-time `new Queue/Redis` yok; `new Worker` factory içinde. Test suite
>   tam çalışmada **23/23 yeşil** (non-determinizm bitti).
> - **B2 çözüldü:** Faz 3 sızıntısı (webhook/sync) tamamen kaldırıldı. Kapsam =
>   builder + provider(mock+http) + factory + manager + invoice-create kuyruğu.
> - **B3 çözüldü:** `bun run lint` temiz, `bun run build` temiz.
> - Para builder float-suz BigInt korunmuş; `POST /v1/invoices` doğru
>   `buildInvoiceRequest` + lazy queue kullanıyor (eski parseFloat math gitti).
> - NilveraProvider HTTP yolu sandbox credential olmadan E2E doğrulanamaz
>   (kullanıcı notu) → izole test yeşil, gerçek kanıt Faz 6'ya ertelendi.
>
> Aşağısı ilk review (tarihsel kayıt).
>
> ---
>
> Branch: `codex/phase-2-nilvera` snapshot `c561307`.
> Kıyas: [PROVIDER-SPEC.md](PROVIDER-SPEC.md) · [API-CONTRACT.md](API-CONTRACT.md) ·
> [WORK-PLAN.md](WORK-PLAN.md) · CLAUDE.md.
> **Verdict: DEĞİŞİKLİK İSTENİYOR — `main`'e merge EDİLMEDİ.**

## Olumlu (kabul edilen)

- **Para builder (`buildInvoiceRequest.ts`) mükemmel.** BigInt sabit-nokta
  (mikro-birim + kuruş), float YOK, satır-seviyesi half-up yuvarlama, global
  indirim oransal dağıtım + kalan son satıra, kargo satırı, kur çevrimi —
  PROVIDER-SPEC §2 ile birebir. Daha önce bildirdiğim `parseFloat` ihlali tam
  giderilmiş. Kapsamlı testler (USD→TRY, indirim taşması, kargo).
- Faz 1 follow-up'ları **kapatıldı**: F1-2 (`error.validation`→`validation_error`
  zarfı), F1-3 (`tenant_inactive` 403 + API-CONTRACT'a additive satır — kabul),
  F1-4 (`onDelete: restrict/cascade`).
- `ProviderFactory` + mock-mode `NilveraProvider` + `InvoiceManager` durum
  makinesi sağlam; izole testler yeşil.
- `bun run build` (tsc) temiz.

## Blokerlar (merge öncesi giderilmeli)

### B1 — Test suite non-deterministik (KRİTİK)
`bun run test` tam suite **kırmızı** (1 fail / 25). `NilveraProvider.test.ts`
**izole çalışınca geçiyor** → test kirliliği. Kök neden: **modül-seviyesi yan etki**:
- `src/workers/syncStatus.ts:17` → top-level `new Worker(...)` (import anında Redis poll başlatıyor)
- `src/queue/invoiceQueue.ts:7-13` → import anında `loadEnv()` + `new Redis()` + `new Queue()`
- `src/queue/webhookQueue.ts:9`, `src/queue/statusSyncQueue.ts:5` → import anında `new Queue()`

Tam suite bu modülleri transitif import edince arka plan ioredis reconnect +
çalışan Worker sızıp testi düşürüyor. **Çözüm:** kuyruk/worker'lar tembel/factory
ile başlatılmalı (`startCreateInvoiceWorker()` deseni doğru — diğerleri de öyle
olmalı). Modül import'u yan etkisiz olmalı.

### B2 — Scope creep: Faz 3 işi Faz 2'ye sızmış
PROVIDER-SPEC açıkça "Faz 2'de YAPMA: webhook gönderimi, sync cron (Faz 3)" dedi.
Sızan Faz 3 dosyaları: `src/lib/webhook.ts`, `src/queue/webhookQueue.ts`,
`src/workers/deliverWebhook.ts`, `src/queue/statusSyncQueue.ts`,
`src/workers/syncStatus.ts`. Bunlar Faz 3 spec'i (Claude üretecek) onaylanmadan
Faz 2 kabulüne **dahil edilmez** — ya geri çekilir ya Faz 3 branch'ine taşınır.

### B3 — 9 lint hatası (`bun run lint` kırmızı)
- `NilveraProvider.ts:192` template-literal `number` (`String()` sarmala)
- `lib/queueBackoff.ts:14` non-null assertion (`!` kaldır, guard ekle)
- `workers/createInvoice.ts:62` `let`→`const`
- `workers/index.ts:4,17` unused `syncStatusWorker` + unsafe-argument/call
- `workers/syncStatus.ts:29,53` unnecessary-condition + template-literal
- `tests/domain/NilveraProvider.test.ts:4` unused import

### B4 — Süreç ihlali (branch izolasyonu)
`docs/` yalnız Claude (WORK-PLAN §1). Codex `docs/WEBHOOK-SPEC.md` yazmış (Faz 3
mimari spec = Claude'un işi) ve `docs/API-CONTRACT.md`'yi düzenlemiş. API-CONTRACT
değişikliği F1-3'ün talep ettiğim additive satırı → **kabul**. `WEBHOOK-SPEC.md`
Faz 3'te Claude tarafından sahiplenilip yeniden yazılacak (Codex taslağı girdi
olarak değerlendirilir, otorite değil). `docs/NILVERA-MAPPING.md` PROVIDER-SPEC §9
gereği Codex çıktısı — **kabul**.

## Aksiyon (Codex'e geri — implementasyon lane'i)

1. **B1:** `invoiceQueue/webhookQueue/statusSyncQueue/syncStatus` modül-seviyesi
   yan etkilerini kaldır; factory/lazy başlatmaya çevir. `bun run test` tam suite
   yeşil olmalı (tek tek değil).
2. **B2:** Faz 3 dosyalarını (webhook + sync) Faz 2 teslimatından çıkar. Faz 2
   = builder + provider(mock+http) + factory + manager + invoice-create kuyruğu.
3. **B3:** 9 lint hatasını gider, `bun run lint` yeşil.
4. NilveraProvider HTTP yolu sandbox credential gelene kadar **doğrulanamaz**
   (kullanıcı notu); izole test yeşil olduğu için kabul, gerçek E2E Faz 6'ya
   ertelenir (VERIFY-FAZ2.md'de "blocked" işaretli kalsın).

Düzeltmeler `codex/phase-2-nilvera`'ya gelince Claude tekrar review → yeşilse
`main`'e merge. **Faz 3 spec'i Faz 2 kabul edilene kadar BAŞLATILMAZ** (WORK-PLAN
sıralı bağımlılık).
