# e-fatura-service — DB Şema Spec (DONMUŞ — Faz 1)

> Codex bu spec'i birebir uygular. Drizzle ORM + MySQL 8.
> **CLAUDE.md kuralı:** lokalde `ALTER TABLE` YOK. Şema `db/seed/sql/001_*_schema.sql`
> içindeki `CREATE TABLE`'a yazılır, `bun run build && bun run db:seed:fresh`
> ile sıfırdan kurulur. Drizzle `schema.ts` bu SQL ile **bire bir** eşleşir.
>
> Karar referansları WORK-PLAN.md §2 (D1–D10).

## Genel kurallar

- Engine `InnoDB`, charset `utf8mb4`, collation `utf8mb4_unicode_ci`.
- PK: `BIGINT UNSIGNED AUTO_INCREMENT`.
- Zaman: `created_at`/`updated_at` `DATETIME(3)` (UTC, app yazar; DB default yok ki Drizzle ile sapma olmasın).
- Şifreli alan formatı (D1): `base64(iv).base64(tag).base64(ciphertext)` tek `TEXT` kolonda.
- Para: `DECIMAL(15,2)`; kur `DECIMAL(15,6)`.
- Enum'lar MySQL `ENUM` değil, `VARCHAR` + uygulama-katmanı union tipi (Drizzle tarafında string-literal union; ileride değer eklemek ALTER gerektirmesin).

---

## Tablo: `tenants`

Her proje = bir tenant. Credential at-rest şifreli (D1).

| Kolon | Tip | Null | Not |
|---|---|---|---|
| `id` | BIGINT UNSIGNED PK | — | |
| `tenant_key` | VARCHAR(64) | NO | `sportoonline`, `kamanilan`… **UNIQUE** |
| `display_name` | VARCHAR(190) | NO | Ünvan |
| `vkn_tckn` | VARCHAR(11) | NO | Mükellef VKN/TCKN |
| `address` | VARCHAR(500) | NO | Fatura adresi |
| `integrator_driver` | VARCHAR(20) | NO | `nilvera` \| `edm` (D5) |
| `integrator_credentials` | TEXT | NO | Şifreli JSON (api_key, base_url, company_vkn…) (D1) |
| `api_key_hash` | CHAR(64) | NO | `X-Api-Key`'in sha256'sı, **UNIQUE** (D2) |
| `allowed_ips` | VARCHAR(500) | YES | Virgüllü IP allowlist, null=kısıtsız (D2) |
| `webhook_url` | VARCHAR(500) | YES | Servis→istemci callback |
| `webhook_secret` | TEXT | NO | Şifreli; HMAC imzası için (D4) |
| `tax_profile` | JSON | NO | KDV/istisna profili (D8), default `{}` |
| `mode` | VARCHAR(10) | NO | `test` \| `prod`, default `test` |
| `is_active` | TINYINT(1) | NO | default `1` |
| `created_at` | DATETIME(3) | NO | |
| `updated_at` | DATETIME(3) | NO | |

**İndeksler:** `UNIQUE(tenant_key)`, `UNIQUE(api_key_hash)`.

---

## Tablo: `invoices`

| Kolon | Tip | Null | Not |
|---|---|---|---|
| `id` | BIGINT UNSIGNED PK | — | |
| `tenant_id` | BIGINT UNSIGNED | NO | FK → `tenants.id` |
| `idempotency_key` | VARCHAR(190) | NO | Genelde `order_id` (D3) |
| `status` | VARCHAR(20) | NO | durum makinesi (aşağıda), default `pending` |
| `type` | VARCHAR(10) | NO | `earsiv` \| `iade`, default `earsiv` |
| `external_id` | VARCHAR(190) | YES | Entegratör referansı |
| `ettn` | CHAR(36) | YES | GİB ETTN (UUID) |
| `invoice_number` | VARCHAR(32) | YES | Resmî fatura no |
| `currency` | CHAR(3) | NO | İstek para birimi (TRY zorunlu sonuç, D8) |
| `exchange_rate` | DECIMAL(15,6) | YES | TRY≠currency ise kur |
| `total` | DECIMAL(15,2) | NO | KDV dahil TL |
| `tax_total` | DECIMAL(15,2) | NO | Toplam KDV TL |
| `request_payload` | JSON | NO | Denetim — gelen istek |
| `response_payload` | JSON | YES | Denetim — entegratör yanıtı |
| `error_message` | TEXT | YES | Son hata |
| `attempts` | TINYINT UNSIGNED | NO | retry sayacı, default `0` |
| `pdf_path` | VARCHAR(500) | YES | Saklama yolu/URL |
| `sent_at` | DATETIME(3) | YES | |
| `cancelled_at` | DATETIME(3) | YES | |
| `created_at` | DATETIME(3) | NO | |
| `updated_at` | DATETIME(3) | NO | |

**İndeksler:**
- `UNIQUE(tenant_id, idempotency_key)` — çift fatura engeli (D3).
- `INDEX(tenant_id, status)` — worker/admin sorgu.
- `INDEX(external_id)` — idempotent sync.
- FK `tenant_id` → `tenants(id)` `ON DELETE RESTRICT`.

**Durum makinesi (D6):**
```
pending ──▶ sending ──▶ sent ──▶ approved
   │           │          │
   │           └─▶ failed ─┘  (failed → retry → sending)
   └───────────────────────────▶ cancelled / refunded   (terminal)
```
Geçerli geçişler uygulama katmanında zorlanır; her geçiş `invoice_events`'e yazılır.

---

## Tablo: `invoice_events`

Durum geçiş denetim logu (kim/ne zaman/neden).

| Kolon | Tip | Null | Not |
|---|---|---|---|
| `id` | BIGINT UNSIGNED PK | — | |
| `invoice_id` | BIGINT UNSIGNED | NO | FK → `invoices.id` `ON DELETE CASCADE` |
| `from_status` | VARCHAR(20) | YES | null = ilk kayıt |
| `to_status` | VARCHAR(20) | NO | |
| `actor` | VARCHAR(40) | NO | `worker` \| `webhook` \| `admin` \| `sync-cron` |
| `reason` | VARCHAR(500) | YES | İptal/iade/hata sebebi |
| `meta` | JSON | YES | Ek bağlam (retry no, http kod…) |
| `created_at` | DATETIME(3) | NO | |

**İndeksler:** `INDEX(invoice_id, created_at)`.

---

## Drizzle ↔ seed SQL eşleşmesi

- `src/db/schema.ts` yukarıdaki 3 tabloyu tanımlar; tip union'ları:
  - `InvoiceStatus = 'pending'|'sending'|'sent'|'approved'|'failed'|'cancelled'|'refunded'`
  - `InvoiceType = 'earsiv'|'iade'`
  - `IntegratorDriver = 'nilvera'|'edm'`
- `src/db/seed/sql/001_efatura_schema.sql` aynı tabloları `CREATE TABLE IF NOT EXISTS`
  ile kurar; kolon adı/tip/index **birebir** aynı olmalı (sapma yasak — CLAUDE.md).
- Şema değişikliği gerektiğinde bu dosyaya eklenir, ALTER ile değil.

## Seed (geliştirme)

`002_seed_dev_tenant.sql`: tek tenant `sportoonline`, `mode=test`,
`integrator_driver=nilvera`, credential/webhook_secret `.env`'den şifrelenip
seed script ile yazılır (SQL'e plaintext credential yazılmaz).
