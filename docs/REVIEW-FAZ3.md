# Faz 3 — Implementasyon + Review (Claude)

> Branch: `codex/phase-3-reliability`. Codex teslimleri güvenilmez olduğundan
> (kullanıcı: "eksikleri tamamla / sırayla devam et") Claude **doğrudan
> implemente etti**, [WEBHOOK-SPEC.md](WEBHOOK-SPEC.md)'ye birebir.
> **Verdict: KABUL — `main`'e merge edildi.**

## Teslim edilen (WEBHOOK-SPEC kapsamı, scope-creep YOK)

| Bileşen | Dosya |
|---|---|
| İmza + payload + event eşleme (saf, test edilebilir) | `src/lib/webhook.ts` |
| Webhook teslim kuyruğu — **lazy factory** (B1 deseni) | `src/queue/webhookQueue.ts` |
| Teslim worker'ı (imzalı POST, retry, tükenince event log) | `src/workers/deliverWebhook.ts` |
| Durum geçişinde kuyruğa atma (idempotent jobId) | `src/lib/webhookNotify.ts` |
| Status-sync cron — **lazy factory**, JobScheduler API | `src/workers/syncStatus.ts` |
| `POST /v1/webhooks/test` (imzalı test, 200/502/422) | `src/routes/v1/webhooks.ts` |
| Wiring: createInvoice hook, env, workers/index, route kaydı | ilgili dosyalar |

## Spec uyumu

- **İmza (API-CONTRACT D4):** `sha256=` + HMAC-SHA256(`timestamp + "." + rawBody`,
  decrypt(`webhook_secret`)). `X-Efatura-Event/Timestamp/Signature` başlıkları.
- **Retry:** `webhook-deliver` BullMQ, 6 deneme, `reliabilityBackoffStrategy`
  (1m→5m→30m→2h→6h, Faz 2'den paylaşıldı). Tükenince `invoice_events`
  (`actor=webhook`) + error log.
- **Idempotency (D3):** `enqueueInvoiceWebhook` deterministik `jobId`
  (`wh:<invoiceId>:<event>`) → aynı (fatura,event) tek iş; pending/sending no-op.
- **Status sync:** repeatable job (`STATUS_SYNC_CRON`, vars. `*/15 * * * *`),
  `sent`+`external_id` faturalar → `getStatus` → değişimde transition + webhook.
- **B1 disiplini:** tüm kuyruk/worker **lazy factory**, modül-import yan etkisi
  YOK. `bun run test` tam suite deterministik.

## Doğrulama (Claude, izole worktree)

- `bun run build` temiz · `bun run lint` temiz · `bun run test` **12 dosya / 30 test, hepsi yeşil**.
- Yeni testler: `tests/webhook.test.ts` (imza/doğrulama/tamper/event/payload),
  `tests/webhooksRoute.test.ts` (200/502/422, imza başlıkları, fetch mock).

## Bilinen sınır

Redis/sandbox gerektiren uçtan uca (gerçek BullMQ teslim + cron tetik) kanıtı
`VERIFY-FAZ3.md` checklist'inde **bekliyor** (Antigravity, ortam ayağa kalkınca).
Kod yolu unit/route testleriyle kapalı; mantık doğrulandı.

## Süreç notu

Faz 3 spec'i Codex erken taslamış, scope-creep'le Faz 2'ye sızmıştı (REVIEW-FAZ2
B2). Bu implementasyon spec'e sadık, scope-creep yok, B1 tekrarı yok.
