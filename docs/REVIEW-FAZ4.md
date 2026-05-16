# Faz 4 — Implementasyon + Review (Claude)

> Branch: `codex/phase-4-cancel-admin`. Codex güvenilmez olduğundan Claude
> doğrudan implemente etti, [CANCEL-RULES.md](CANCEL-RULES.md)'ye birebir.
> **Verdict: KABUL — `main`'e merge edildi.**

## Teslim edilen (Faz 4 kapsamı, scope-creep YOK)

| Bileşen | Dosya |
|---|---|
| İptal/iade karar kuralı (saf, test edilebilir) | `src/domain/cancelRules.ts` |
| `InvoiceManager.cancelInvoice` (provider.cancel delege) | `src/domain/InvoiceManager.ts` |
| `transitionInvoice` patch genişletme (`cancelledAt`, `type`) | `src/lib/invoiceTransitions.ts` |
| Cancel kuyruğu — **lazy factory** (B1 deseni) | `src/queue/cancelQueue.ts` |
| Cancel worker (race-safe karar, transition, webhook) | `src/workers/cancelInvoice.ts` |
| `POST /v1/invoices/:id/cancel` (senkron 422, async 202) | `src/routes/v1/invoices.ts` |
| Admin API (`X-Admin-Token`): list / retry / events | `src/routes/v1/admin.ts` |
| env (`EFATURA_CANCEL_WINDOW_DAYS`, `EFATURA_ADMIN_TOKEN`) + wiring | ilgili dosyalar |

## Davranış (CANCEL-RULES uyumu)

- Kaynak durum `approved`/`sent` değilse veya `external_id`/`sent_at` yoksa →
  `422 invoice_rule_violation` (endpoint'te senkron, hemen).
- `sent_at` + `EFATURA_CANCEL_WINDOW_DAYS` ile: pencere içi → void
  (`cancelled`, type `earsiv`); dışı → refund (`refunded`, type `iade`).
- Endpoint 202 + kararlanan hedef durum; gerçek entegratör iptali **worker'da**
  (race-safe: karar worker'da yeniden hesaplanır), sonra webhook (Faz 3).
- Admin: `X-Admin-Token` = `EFATURA_ADMIN_TOKEN`, sabit-zaman karşılaştırma,
  tenant `X-Api-Key` admin uçlarına erişemez. `failed` → retry → `pending` +
  create kuyruğu. Events denetim listesi.
- **B1 disiplini:** cancel kuyruğu lazy factory, modül-import yan etkisi yok.

## Doğrulama (Claude, izole worktree)

- `bun run build` temiz · `bun run lint` temiz · `bun run test`
  **14 dosya / 43 test, hepsi yeşil** (tam suite deterministik).
- Yeni testler: `cancelRules.test.ts` (void/refund/422 matris),
  `adminRoutes.test.ts` (401 yetki, list, retry-422).

## Ertelenen / sınır

- `tenant.tax_profile.cancel_window_days` tenant-bazlı override **yapılmadı**
  (yalnız global env). Tam iade faturası UBL akışı MVP'de void uçuyla;
  muhasebe teyidiyle genişler. CANCEL-RULES.md'ye işlendi.
- `admin/index.html` (statik panel, Codex untracked scope-creep) bu repoda
  **track edilmedi**; admin **API** Faz 4'te tamam. Panel HTML deploy'da
  Nginx `/admin` ile servis edilir (nginx/README.md) — ayrı statik varlık.
- Redis/sandbox gerektiren E2E `VERIFY-FAZ4.md`'de bekliyor (Antigravity).
