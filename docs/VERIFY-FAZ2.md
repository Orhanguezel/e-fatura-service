# Faz 2 — Antigravity Doğrulama Checklist

> **Durum:** Kod hazır; sandbox kanıtı **bekliyor** (Antigravity).
> Nilvera HTTP uçları `docs/NILVERA-MAPPING.md` ile hizalandı.

## Ön koşullar

- [ ] `.env` dolu: `DATABASE_URL`, `EFATURA_ENC_KEY`, `REDIS_URL`
- [ ] Tenant credential: `{"api_key":"...","base_url":"https://apitest.nilvera.com"}`
- [ ] `EFATURA_NILVERA_MOCK=false` (gerçek sandbox için)
- [ ] `bun run db:seed:fresh` başarılı
- [ ] `bun run dev` → `GET /healthz` → `200`, `db: up`

## Otomatik testler (Cursor/Codex)

```bash
bun run type-check && bun run lint && bun run test
```

Beklenen: tüm testler yeşil (builder + provider mock + auth).

## Sandbox E2E (Antigravity)

1. `POST /v1/invoices` — header: `X-Api-Key`, `Idempotency-Key: verify-faz2-001`
2. Yanıt `202`, `status: pending`
3. Worker işler → `GET /v1/invoices/{id}` → `sent` veya `approved`
4. `ettn` UUID formatında
5. `invoice_number` dolu
6. PDF: `GET /v1/invoices/{id}/pdf` veya Nilvera `GET /earchive/Draft/{uuid}/pdf` açılıyor

## Kanıt (rapora eklenecek)

| Alan | Değer |
|---|---|
| Tarih | |
| `invoice_id` | |
| `ettn` | |
| `invoice_number` | |
| PDF (dosya yolu veya ekran görüntüsü) | |
| Sonuç | PASS / FAIL |

## Mock mod (credential yokken)

`EFATURA_NILVERA_MOCK=true` veya test tenant'ta boş `api_key` → onaylı mock fatura (CI/unit için). **Faz 2 kabul kriteri değil** — sadece geliştirme.

## Blokerler

- Credential yok → sandbox E2E yapılamaz; mock ile sınırlı doğrulama.
- Redis down → kuyruk 503, worker işlemez.
