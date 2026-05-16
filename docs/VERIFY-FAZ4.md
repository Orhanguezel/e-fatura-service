# Faz 4 — Antigravity Doğrulama Checklist

## Admin panel
- [ ] `GET /admin` HTML açılıyor
- [ ] `EFATURA_ADMIN_TOKEN` ile liste yükleniyor
- [ ] `failed` faturada **Tekrar gönder** → `pending` + kuyruk

## İptal
- [ ] `approved` fatura + 7 gün içi → `202 { status: cancelled }`
- [ ] Eski `sent_at` → `202 { status: refunded }`
- [ ] Worker sonrası `GET /v1/invoices/{id}` terminal durum
- [ ] Webhook `invoice.cancelled` / `invoice.refunded`

## Negatif
- [ ] `pending` fatura → `422 invoice_rule_violation`
- [ ] Yanlış admin token → `401`
