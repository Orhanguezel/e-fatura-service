# Entegratör Değiştirme Yol Haritası (Nilvera → EDM/Uyumsoft/…)

> Amaç: özel entegratör değişiminin **istemci/çekirdek/altyapıya dokunmadan**,
> tek adapter + tenant verisi ile yapılması. Soyutlama: WORK-PLAN D5,
> `domain/InvoiceProvider.ts` · `domain/ProviderFactory.ts` ·
> `domain/providers/NilveraProvider.ts` (referans desen) · `EdmProvider.ts` (iskelet).
>
> **Değişmez:** istemci uygulamalar, API-CONTRACT, servis çekirdeği
> (auth/idempotency/kuyruk/webhook/durum makinesi/**tutar builder**), DB şeması,
> Docker/Redis/MySQL/Nginx/deploy. **Değişen:** 1 adapter + registry + tenant verisi.

---

## Faz A — İş/idari ön koşul (yeni entegratör için Faz 0 tekrarı)

> Asıl "geçiş maliyeti" burası; kod değil. `docs/FAZ-0-ONKOSULLAR.md` deseni.

- [ ] Yeni entegratör (örn. Uyumsoft) **sözleşme** + hesap.
- [ ] **Sandbox** + **PROD** API/credential alınır.
- [ ] Mali mühür / mükellefiyet **aktarımı** (GİB nezdinde entegratör değişikliği —
  mali müşavir + yeni entegratör yürütür). Çift entegratör geçiş penceresi netleştir.
- [ ] Mali müşavir teyidi: KDV/iade **aynı** ama entegratörün **senaryo/şablon
  kodları** farklı olabilir → yeni entegratör dokümanından doğrula.
- [ ] Yeni entegratör API dokümanı → `docs/<X>-MAPPING.md` (NILVERA-MAPPING deseni).

## Faz B — Kod: yeni adapter (tek klasör, ~NilveraProvider boyutu)

Branch: `codex/integrator-<x>` (veya claude/*). Adımlar:

1. `src/domain/providers/<X>Provider.ts` — `InvoiceProvider` implement:
   `create / cancel / getPdf / getStatus`. Protokol farkı (SOAP↔REST) **adapter
   içinde** yutulur, dışarı sızmaz.
2. `src/domain/providers/<x>/mapPayload.ts` + `errors.ts` (Nilvera alt-klasör deseni):
   `InvoiceRequest` → entegratör payload; hata→`IntegratorError` (retryable eşleme).
3. `src/db/schema.ts` `integratorDrivers` union + zod'a `'<x>'` ekle.
4. `src/domain/ProviderFactory.ts` registry'ye `<x> → new <X>Provider(...)` ekle.
5. `tests/domain/<X>Provider.test.ts` — HTTP/SOAP mock (mock+http yol, 4xx/5xx/
   timeout→retryable, ProviderFactory resolve). `NilveraProvider.test.ts` deseni.
6. **DoD:** `bun run build` + `bun run lint` + `bun run test` (tam suite) YEŞİL,
   modül-import yan etkisi yok (B1 disiplini). Claude review → `main` merge.

> İstemci tarafı (sportoonline `EInvoiceClient` vb.) ve API-CONTRACT **değişmez**.

## Faz C — ⚠️ Eski faturaların entegratörü (kritik tasarım notu)

`tenants.integrator_driver` **tenant geneli**. Ama bir fatura **hangi
entegratörle kesildiyse** iptal/iade/durum-sorgu **o entegratöre** gitmeli
(Nilvera ETTN/external_id Uyumsoft'ta geçersiz). Tenant'ı switch edince eski
`sent/approved` faturaların `cancel`/`syncStatus`'u **yanlış entegratöre** düşer.

**Önerilen kalıcı çözüm (geçişten ÖNCE yapılmalı):**
- `invoices` tablosuna `integrator_driver` kolonu ekle (fatura oluşturulurken
  o anki driver **snapshot**'lanır). CLAUDE.md: **ALTER yok** →
  `db/seed/sql/0XX_*.sql` `CREATE TABLE`'a ekle + `db:seed:fresh`.
- `InvoiceManager.cancel/syncStatus` ve `cancelInvoice`/`syncStatus` worker'ları
  tenant driver'ı değil **`invoice.integrator_driver`**'ı kullanacak şekilde
  güncellenir (ProviderFactory'ye driver override parametresi).
- Sonuç: tenant yeni entegratöre geçse de eski faturalar eski entegratörle
  yönetilir; yalnız **yeni** faturalar yeni entegratörle kesilir.

> Bu yapılmadan geçilirse: yalnız "temiz kesme" senaryosu güvenli — eski
> faturalar terminal kabul edilip iptal/sync edilmeyecekse switch risksiz;
> aksi halde Faz C zorunlu.

## Faz D — Sandbox doğrulama (yeni entegratör)

- [ ] Pilot tenant `integrator_driver=<x>` + `integrator_credentials`=sandbox
  (şifreli), `mode=test`.
- [ ] 1 test siparişi → fatura: **PDF + ETTN** geldi, `invoices.sent/approved`.
- [ ] İptal (pencere içi) + iade (pencere dışı) → doğru durum + webhook
  (`invoice.cancelled/refunded`).
- [ ] `status-sync` cron eski/yeni doğru entegratöre sorguluyor (Faz C).
- [ ] Mali müşavir sandbox faturasını içerik/KDV onaylar.

## Faz E — Kademeli rollout (sıfır kesinti)

`integrator_driver` tenant başına → **tek tek geçiş**:
1. [ ] Pilot tenant (örn. sportoonline) PROD credential + `mode=prod`,
   `EFATURA_NILVERA_MOCK` ilgisiz (driver değişti).
2. [ ] Canlıda **tek gerçek fatura** → mali müşavir teyidi.
3. [ ] 24-48s izle (`invoice_events`, admin panel, webhook teslim, hata oranı).
4. [ ] Sorun yoksa diğer tenant'lar sırayla. Diğerleri eski entegratörde
   **etkilenmeden** çalışmaya devam eder.

## Faz F — Geri alma (rollback)

- Sorun çıkarsa: tenant `integrator_driver` **eski değere** çevrilir
  (DB veri değişikliği, anında, deploy yok).
- Faz C yapıldıysa: geçiş anından sonra yeni entegratörle kesilen faturalar
  o entegratöre pinli kalır (rollback onları etkilemez, doğru davranış).
- Adapter kodu `main`'de kalır (zararsız, registry'de durur).

## Checklist (özet)

| Faz | Sahip | Çıktı |
|---|---|---|
| A iş/idari | Firma + mali müşavir | Yeni entegratör sözleşme + credential + mükellefiyet |
| B kod | Codex/Claude | `<X>Provider` + registry + test, main'de yeşil |
| C şema (eski fatura pinleme) | Claude | `invoices.integrator_driver` + manager/worker güncel |
| D sandbox | Claude + mali müşavir | PDF/ETTN/iptal/iade/sync doğrulandı |
| E rollout | Claude | Pilot → tüm tenant, sıfır kesinti |
| F rollback | Claude | Tenant driver geri (anında) |

**Altın kural:** entegratör değişimi = veri + 1 adapter. İstemci/çekirdek/
altyapı el değmez. Faz C atlanırsa eski fatura iptal/sorgu kırılır — önce o.
