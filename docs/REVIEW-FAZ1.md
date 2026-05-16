# Faz 1 Kod Review — Claude (mimar)

> Kapsam: commit `553b034` "feat(faz-1): iskele + şema + auth".
> Kıyas: [HANDOFF-CODEX.md](HANDOFF-CODEX.md) · [SCHEMA.md](SCHEMA.md) ·
> [API-CONTRACT.md](API-CONTRACT.md) · CLAUDE.md · PROJECT_PORTFOLIO_STANDARD.md.
> Sonuç: **Faz 1 kapsam ve kalite olarak SAĞLAM**; 2 defect Claude tarafından
> düzeltildi, 4 küçük not Faz 2 öncesi giderilecek.

## Genel değerlendirme

Commit `553b034` Faz 1 kapsamına tam uyuyor: route'lar 501 stub,
Faz 2 bağımlılıkları (bullmq/ioredis/decimal) sızmamış, scope temiz.
- **Şema**: `001_*.sql` ↔ `schema.ts` ↔ SCHEMA.md birebir. DATETIME(3),
  utf8mb4_unicode_ci, FK (`RESTRICT`/`CASCADE`), unique/idx — doğru. ALTER yok.
- **Kripto (D1)**: AES-256-GCM, `iv.tag.ciphertext` base64, key hex/base64/utf8
  32-byte doğrulama, authTag — sağlam.
- **Auth (D2)**: sha256 hash lookup + `safeEqualHash` sabit-zaman + IP allowlist
  + `is_active` — doğru.
- **TS strict**: `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` —
  beklenenin üstünde sıkı. type-check temiz, 5 test yeşil.
- `.env.example` boş sırlarla, `.env` gitignore'lu — CLAUDE.md uyumlu.

## Bulgular

| # | Önem | Bulgu | Aksiyon |
|---|---|---|---|
| F1-1 | **Orta-Yüksek** | `002_seed_dev_tenant.sql` `fresh.ts`'in beklediği `{{API_KEY_HASH}}`/`{{INTEGRATOR_CREDENTIALS}}`/`{{WEBHOOK_SECRET}}` placeholder'ları yerine **gömülü şifreli blob'lar** içeriyordu → farklı `EFATURA_ENC_KEY`'de decrypt patlar, template kodu ölü. Ayrıca `tax_profile` anahtarı `default_tax_rate`, PROVIDER-SPEC `default_vat_rate` bekliyor. | ✅ **Claude düzeltti**: placeholder'lara çevrildi, `tax_profile` `{default_vat_rate, exemptions, withholding}` ile hizalandı. |
| F1-6 | **Yüksek** | `project.portfolio.json` PROJECT_PORTFOLIO_STANDARD.md'ye **uymuyordu** (zorunlu `title/summary/category/services/techs` yok; `name/stack/type` kullanılmış). CLAUDE.md: uyumsuz = iş tamamlanmış sayılmaz. | ✅ **Claude düzeltti**: şablona göre yeniden yazıldı, `category: SERVICE PLATFORM`, `status: in-development`. |
| F1-2 | Düşük | `errorHandler` Fastify'in **kendi JSON-schema validasyon** hatasını `validation_error`'a eşlemiyor (`request_error`'a düşüyor). zod `.parse` doğru (`ZodError→validation_error`). API-CONTRACT validasyonu `validation_error` bekliyor. | Faz 2: `error.validation` dalı eklensin (Codex). |
| F1-3 | Düşük | `tenantInactive()` kodu `request_error` (403) — API-CONTRACT hata tablosunda yok. | Faz 2: `tenant_inactive` kodu ekle + API-CONTRACT'a işle. |
| F1-4 | Düşük | `schema.ts` `.references(() => tenants.id)` `onDelete` belirtmiyor; SQL `RESTRICT`/`CASCADE` ile drift. Seed SQL otorite (CLAUDE.md) olduğu için kırılma yok. | Faz 2: Drizzle `references`'a `onDelete` ekle (tutarlılık). |
| F1-5 | Bilgi | `health.ts` Redis kontrolü ham TCP connect (PING değil). Faz 1 liveness için yeterli. | Faz 3: gerçek Redis client ile PING. |

## Karar

Faz 1 **kabul** (F1-1, F1-6 düzeltildi). F1-2..F1-5 Faz 2 başında Codex'e
görev. Kritik olmayan notlar canlıyı bloke etmez.

## Süreç notu (önemli)

`553b034` sonrası Codex **aynı branch'te (`feat/phase-1-scaffold`) Faz 2'yi
implemente etmeye başlamış** — CLAUDE.md "aynı dosyada iki AI yok" ihlali.
Çözüm: branch izolasyonu (WORK-PLAN §1 güncellendi); Codex'in Faz 2 işi
`codex/phase-2-nilvera` branch'ine taşındı, kaybedilmedi.
