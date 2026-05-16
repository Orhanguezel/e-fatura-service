# Faz 3 — Antigravity Doğrulama Checklist

> Webhook + idempotency + retry + status-sync cron.

## Otomatik

```bash
bun run type-check && bun run lint && bun run test
```

## Senaryolar

### Idempotency
- [ ] Aynı `Idempotency-Key` + aynı body → `200`
- [ ] Aynı key + farklı body → `409 idempotency_conflict`

### Webhook imza
- [ ] Tenant `webhook_url` ayarlı
- [ ] `POST /v1/webhooks/test` → `200 { ok: true }`
- [ ] İstemci `X-Efatura-Signature` (`sha256=...`) ve ISO `X-Efatura-Timestamp` doğrular

### Fatura akışı
- [ ] `POST /v1/invoices` → worker → `GET /v1/invoices/{id}` `approved|sent`
- [ ] Tenant callback'te `invoice.approved` (veya `invoice.sent`) event gelir

### Retry
- [ ] Webhook endpoint 500 döndürürse kuyruk yeniden dener (log/BullMQ)
- [ ] 5 retry sonrası job failed kalır, fatura DB'de doğru durumda

### Status sync
- [ ] `sent` + `external_id` kayıtları cron ile `approved`'a geçebilir (sandbox'a bağlı)

## Kanıt

| Senaryo | Sonuç | Not |
|---|---|---|
| Idempotency 200 | | |
| Idempotency 409 | | |
| Webhook test | | |
| Retry exhausted | | |
