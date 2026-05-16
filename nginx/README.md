# Nginx — Kurulum

> `efatura.conf`: reverse proxy. API public; **admin auth uygulama katmanında
> (`X-Admin-Token`)**, Nginx Basic Auth YOK (kullanıcı kararı).
> DNS `efatura.guezelwebdesign.com` eklendi → 72.61.93.212 (yayıldı).
> Desen: scraper-service. Internal port **8210** (VPS port tablosuyla teyit — WORK-PLAN).

## Güvenlik modeli

| Yol | Koruma |
|---|---|
| `/healthz` | Yok (liveness) |
| `/` (tenant API) | Uygulama: `X-Api-Key` (+ IP allowlist) |
| `/admin` (panel HTML) | Yok — salt kabuk, veri göstermez |
| `/v1/admin/` (admin API) | Uygulama: `X-Admin-Token` |

Panel HTML'i public; tek başına veri sızdırmaz çünkü tüm `/v1/admin`
çağrıları `X-Admin-Token` ister. **Güvenlik tek noktada:** `X-Admin-Token`
güçlü ve gizli tutulmalı (`.env`, commit edilmez — CLAUDE.md).

## 1. Statik admin dosyaları

`/admin` location `alias /var/www/e-fatura-service/admin/` serve eder:

```bash
sudo mkdir -p /var/www/e-fatura-service
sudo rsync -a --delete /path/to/e-fatura-service/admin/ /var/www/e-fatura-service/admin/
```

## 2. Nginx config

```bash
sudo cp nginx/efatura.conf /etc/nginx/sites-available/efatura.conf
sudo ln -sf /etc/nginx/sites-available/efatura.conf /etc/nginx/sites-enabled/
sudo nginx -t            # syntax testi
sudo systemctl reload nginx
```

## 3. TLS sertifikası (DNS yayıldı)

```bash
sudo certbot certonly --webroot -w /var/www/certbot -d efatura.guezelwebdesign.com
sudo systemctl reload nginx
```

## 4. Doğrulama

```bash
curl -I https://efatura.guezelwebdesign.com/healthz                  # 200
curl -I https://efatura.guezelwebdesign.com/admin/                   # 200 (panel kabuk)
curl -s  https://efatura.guezelwebdesign.com/v1/admin/invoices       # 401 (token yok)
curl -s -H "X-Admin-Token: <token>" \
        https://efatura.guezelwebdesign.com/v1/admin/invoices        # 200
```

## Notlar

- `admin/index.html` **Faz 4 kapsamı** (Codex erken yazdı, henüz review/merge
  edilmedi). `/v1/admin` endpoint'leri Faz 4'te gelir; o zamana dek panel
  fonksiyonel değildir. Faz 4 review'i ayrıca yapılacak.
- Port 8210 VPS port tablosuyla deploy fazında teyit (kamanilan 8097,
  kaman-social 8079, scraper 8200) — WORK-PLAN Faz 6.
- Şifre koruması sonradan istenirse: `/admin` + `/v1/admin/` location'larına
  `auth_basic` + `auth_basic_user_file` eklemek yeterli (git history'de mevcut).
