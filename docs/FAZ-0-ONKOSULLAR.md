# Faz 0 — Kod Harici Ön Koşullar (Üyelik / API / Mali / Muhasebe)

> Servis kodu (Faz 1-6) **hazır ve canlı** (`https://efatura.guezelwebdesign.com`,
> `EFATURA_NILVERA_MOCK=true` → gerçek GİB'e gitmiyor). Aşağıdakiler **iş/idari**
> adımlar; tamamlanmadan **gerçek (yasal) e-Arşiv fatura kesilemez**.
> Sorumluluk: firma sahibi + mali müşavir. Claude/kod tarafı bunları üretemez.

## 1. Nilvera hesabı + sözleşme (entegratör)

| Ne | Nerede | Çıktı |
|---|---|---|
| Üyelik / firma kaydı | https://www.nilvera.com (Kayıt → ticari sözleşme) | Nilvera hesabı |
| **Sandbox/TEST API anahtarı** | Nilvera panel → API/Entegrasyon (test ortamı) | `apitest.nilvera.com` api_key |
| **PROD API anahtarı** | Sözleşme + mükellefiyet + mühür sonrası | `api.nilvera.com` api_key |
| Firma/şube + fatura serisi tanımı | Nilvera panel | seri/şablon |

**KRİTİK SORU (Nilvera'ya sor):** "Özel entegratör mührüyle mi imzalanıyor,
yoksa bizim **kendi mali mührümüz** mi gerekli?"
- Özel entegratör modeli → Nilvera kendi mührüyle imzalar, **kendi mali mühre
  gerek YOK** (madde 2 atlanır). Çoğu entegratörde bu mümkün.
- Kendi mührü modeli → madde 2 zorunlu.

## 2. Mali Mühür (yalnız Nilvera "kendi mührün" derse)

| Ne | Nerede | Not |
|---|---|---|
| **Mali Mühür sertifikası** (tüzel kişi) | Kamu SM / TÜBİTAK — https://mportal.kamusm.gov.tr | VKN ile başvuru + ödeme; **birkaç hafta sürebilir, erken başlat** |
| Şahıs şirketi ise | Mali Mühür **veya** NES (nitelikli e-imza) | Mali müşavire sor |
| Mührün Nilvera'ya yüklenmesi | Nilvera panel | entegratör imzalama için |

## 3. GİB e-Arşiv mükellefiyeti

- e-Arşiv fatura mükellefi olma **başvurusu/izni** (genelde Nilvera üzerinden
  veya GİB portal). Mali müşavir + Nilvera birlikte halleder.
- Mevcut e-Fatura/e-Arşiv mükellefiyeti varsa entegratör değişiklik bildirimi.

## 4. Muhasebe / Mali Müşavir teyidi (bloke edici)

Mali müşavirden **yazılı** netleştir:
- [ ] **KDV oranları** — spor ürünleri %20 mi? İstisna/farklı oranlı kalem var mı?
- [ ] **İstisna senaryoları** — ihracat, tevkifat, konaklama vb. (sportoonline'da var mı?)
- [ ] **İade/iptal politikası** — e-Arşiv iptal süresi içinde iptal mi, dışında iade faturası mı? Pencere kaç gün? (kod varsayılan **7 gün**, `EFATURA_CANCEL_WINDOW_DAYS`)
- [ ] **Nihai tüketici vs kurumsal** — sportoonline B2C, TCKN toplanmıyor →
  GİB nihai tüketici `11111111111` kullanılıyor. Mali müşavir onaylasın;
  kurumsal (VKN'li) fatura istenirse checkout'ta vergi-no toplama gerekir (ayrı iş).
- [ ] **Fatura serisi / numara formatı** + e-Arşiv senaryo tipi.
- [ ] Para birimi: e-Arşiv **TL zorunlu**; çoklu kur kuru faturada gösterilir (kod hazır).

## 5. Firma bilgileri (servis tenant kaydına girilecek)

Aşağıdakiler servis DB'sinde `tenants` kaydına (sportoonline) yazılır:
- [ ] Resmî ünvan, **VKN**, **vergi dairesi**, MERSİS no, ticaret sicil no
- [ ] Fatura adresi (resmî)
- [ ] e-Arşiv fatura üzerinde **logo/branding** (varsa Nilvera şablonu)
- [ ] İade/iletişim bilgisi

## 6. Altyapı / paylaşım (çoğu YAPILDI — referans)

- [x] `efatura.guezelwebdesign.com` DNS + TLS + servis canlı (mock)
- [x] Servis ↔ sportoonline `X-Api-Key` + webhook secret (dev üretildi)
- [ ] **PROD geçişte:** sunucuda `.env` → `EFATURA_NILVERA_MOCK=false`,
  tenant `integrator_credentials` = **Nilvera PROD api_key** (şifreli),
  sportoonline `EINVOICE_*` env'leri prod değerlerle (`EINVOICE_ENABLED=true`)
- [ ] **Güvenlik:** sudo parolası SCHEMA.md'ye yazılmıştı → **rotate et**

## 7. Test → Canlı kabul (sıra)

1. [ ] Nilvera **sandbox** api_key → tenant'a gir, mock kapat (sadece test)
2. [ ] Sandbox'ta 1 test siparişi → fatura kes → **PDF + ETTN doğrula**
3. [ ] Mali müşavir sandbox faturasını içerik/KDV açısından onaylar
4. [ ] PROD api_key → tenant, `NILVERA_MOCK=false`
5. [ ] Canlıda **tek gerçek fatura** → mali müşavir teyidi → tam açılış

## Özet — kim, nereye üye olmalı

| Adım | Kim | Nereye |
|---|---|---|
| Nilvera üyelik + sözleşme | Firma sahibi | nilvera.com |
| Mali mühür (gerekiyorsa) | Firma sahibi | kamusm.gov.tr (Kamu SM) |
| e-Arşiv mükellefiyet | Mali müşavir + Nilvera | GİB / Nilvera |
| KDV/istisna/iade/seri kararı | Mali müşavir | (yazılı teyit) |
| Firma bilgileri + prod credential | Firma sahibi → Claude/deploy | servis `.env`/tenant |

---

## 8. sportoonline — şimdi karar/hazırlık (Nilvera cevabı beklenirken)

| Karar / bilgi | Neden |
|---|---|
| Hangi firma/**VKN** ile fatura kesilecek (sportoonline'ı işleten tüzel kişi) | Nilvera hesabı + GİB mükellefiyeti bu VKN'ye açılır |
| **Tahmini aylık fatura adedi** (~X/ay) | Nilvera kontör/paket fiyatını buna göre verir |
| **Mali müşavir** (ad + iletişim) | GİB e-Arşiv mükellefiyeti + KDV/iade teyidi |
| e-Arşiv (B2C) — zaten karar | Nilvera'ya "e-Fatura değil, e-Arşiv API" demek için |

> ⚠️ Nilvera'nın "3 Yıllık E-İmza" kampanyası **bizim ihtiyacımız DEĞİL** (o e-İmza/NES).
> Gereken: **e-Arşiv API entegrasyonu (özel entegratör)** + gerekiyorsa **Mali Mühür** (tüzel kişi).

## 9. Nilvera'ya gönderilecek mesaj (sportoonline adına — şablon)

> **Konu: e-Arşiv API Entegrasyonu — Bilgi ve Test Ortamı Talebi**
>
> Merhaba,
>
> Sportoonline (sportoonline.com) e-ticaret sitemiz için **API üzerinden e-Arşiv
> fatura** kesimi yapmak istiyoruz. Özel entegratör çözümünüzle ilgileniyoruz;
> teknik entegrasyonumuz hazır, yalnızca hesap ve API erişimi için ilerlemek istiyoruz.
>
> Lütfen şu konularda bilgi verir misiniz:
>
> 1. **Mali mühür:** Faturalar **sizin özel entegratör mührünüzle** mi imzalanıyor,
>    yoksa bizim **kendi Mali Mührümüzü** mü temin etmemiz gerekiyor? (Gerekiyorsa süreç/süre?)
> 2. **Fiyatlandırma:** e-Arşiv API paketi / kontör fiyatı nasıl?
>    (Aylık tahmini fatura adedimiz: **~[ADET]/ay**.)
> 3. **Test ortamı:** Entegrasyonu doğrulamak için **sandbox/test API anahtarını**
>    öncelikli alabilir miyiz?
> 4. **Mükellefiyet:** GİB e-Arşiv mükellefiyet açılışı için bizden/mali
>    müşavirimizden hangi belge/adımlar gerekiyor?
>
> Firma/iletişim:
> - Ünvan / VKN: **[ŞİRKET ÜNVANI] / [VKN]**
> - Vergi dairesi: **[VERGİ DAİRESİ]**
> - Yetkili: **[AD SOYAD]** — Tel: **[TELEFON]** — E-posta: **[E-POSTA]**
> - Mali müşavir: **[AD / İLETİŞİM]**
>
> Önceliğimiz **test ortamı API anahtarını** alıp entegrasyonu doğrulamak;
> ardından sözleşme ve canlı geçişi planlamak.
>
> Teşekkürler,
> **[AD SOYAD]** — Sportoonline

`[...]` alanları firma bilgileriyle doldurulur.

## 10. Nilvera cevabı sonrası akış

1. **Sandbox API anahtarı** → Claude tenant'a şifreli işler, `EFATURA_NILVERA_MOCK=false`
   (test) → test siparişiyle **PDF + ETTN** doğrulanır.
2. Mali müşavir KDV/istisna/iade'yi **yazılı** teyit eder.
3. Sözleşme + (gerekiyorsa) mali mühür → **PROD API anahtarı** → canlıda
   **tek gerçek fatura** teyidi → tam açılış.
