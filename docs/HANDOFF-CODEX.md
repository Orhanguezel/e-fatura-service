# Codex Devir Notu — Faz 1 (İskele + Şema + Auth)

> Branch: `feat/phase-1-scaffold`. Claude (mimar) tasarımı bitirdi; Codex implemente eder.
> Kaynak: [ARCHITECTURE.md](ARCHITECTURE.md) · [WORK-PLAN.md](WORK-PLAN.md) ·
> **[SCHEMA.md](SCHEMA.md)** (birebir) · **[API-CONTRACT.md](API-CONTRACT.md)** (donmuş).

## Faz 1 kapsamı (yalnızca bunlar)

1. **Bun + Fastify 5 bootstrap** — `src/server.ts`, graceful shutdown, `GET /healthz` (db+redis kontrol).
2. **Drizzle + MySQL 8** — `src/db/schema.ts` SCHEMA.md'deki 3 tabloyu birebir tanımlar.
3. **Seed SQL** — `src/db/seed/sql/001_efatura_schema.sql` (`CREATE TABLE`, ALTER yok),
   `002_seed_dev_tenant.sql` (sportoonline, mode=test). `bun run db:seed:fresh` script'i.
4. **Auth plugin** — `src/plugins/auth.ts`: `X-Api-Key` → sha256 → `tenants.api_key_hash`
   eşleşmesi + IP allowlist; başarısız `401`/`403` (API-CONTRACT hata zarfı).
5. **errorHandler + rateLimit plugin** — hata zarfı formatı API-CONTRACT'taki gibi.
6. **`src/lib/crypto.ts`** — AES-256-GCM, `EFATURA_ENC_KEY`, format `b64(iv).b64(tag).b64(ct)`.
7. **`project.portfolio.json`** (CLAUDE.md zorunlu) + `.env.example` (boş anahtarlar) + README.
8. Route iskeletleri (`src/routes/v1/invoices.ts`, `webhooks.ts`) — **501 stub**;
   gerçek mantık Faz 2-3. Sadece şema/validasyon (zod) + auth bağlanır.

## Sınırlar (Faz 1'de YAPMA)

- NilveraProvider/InvoiceManager gerçek mantığı (Faz 2).
- BullMQ worker'ları (Faz 2).
- Webhook gönderimi, retry, sync cron (Faz 3).

## Kurallar

- TypeScript strict. Bun runtime. `.env` commit edilmez.
- SCHEMA.md ↔ `schema.ts` ↔ seed SQL **sapma yasak** (CLAUDE.md).
- API yanıt/hata formatı API-CONTRACT.md'ye **birebir** uyar (Faz 5 buna mock yazıyor).
- Bitince Antigravity doğrular: `db:seed:fresh` çalışır, `healthz` 200, auth 401/403.

## Çıktı

PR → `main`. Sonra Faz 2 için Claude `docs/PROVIDER-SPEC.md` üretir.
