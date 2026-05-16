# İptal / İade Kuralları (Faz 4)

> Muhasebe teyidi öncesi **varsayılan** kurallar. `tenant.tax_profile.cancel_window_days`
> ile tenant bazında override edilebilir.

## Geçerli kaynak durumlar

| Mevcut `status` | `POST .../cancel` |
|---|---|
| `approved`, `sent` | Kabul (202, kuyruk) |
| `pending`, `sending` | `422` — henüz kesinleşmedi |
| `failed` | `422` — önce admin retry |
| `cancelled`, `refunded` | `422` — terminal |

`external_id` / `sent_at` yoksa entegratör iptali yapılamaz → `422`.

## İptal vs iade

```
sent_at üzerinden geçen süre ≤ cancel_window_days  → void (status: cancelled)
sent_at üzerinden geçen süre > cancel_window_days → refund (status: refunded, type: iade)
```

- Varsayılan pencere: **7 gün** (`EFATURA_CANCEL_WINDOW_DAYS`).
- Void: Nilvera `POST /Invoices/{UUID}/Cancel`
- Refund (MVP): aynı cancel ucu + `type=iade` kaydı; tam iade faturası UBL akışı Faz 4+ muhasebe teyidi sonrası genişletilir.

## Admin

- `X-Admin-Token` = `EFATURA_ADMIN_TOKEN` (commit edilmez).
- Tenant `X-Api-Key` admin uçlarına erişemez.
