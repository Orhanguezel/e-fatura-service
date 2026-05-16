# Nginx + Admin Basic Auth — Kurulum

> `efatura.conf`: API public, **admin (panel + `/v1/admin`) HTTP Basic Auth arkasında**.
> DNS `efatura.guezelwebdesign.com` kullanıcı tarafından eklendi (yayılma bekleyebilir).
> Desen: scraper-service. Internal port **8210** (VPS port tablosuyla teyit — WORK-PLAN).

## Güvenlik modeli (katmanlı)

| Yol | Koruma |
|---|---|
| `/healthz` | Yok (liveness) |
| `/` (tenant API) | Uygulama: `X-Api-Key` (+ IP allowlist) |
| `/admin` (panel HTML) | **Nginx Basic Auth** |
| `/v1/admin/` (admin API) | **Nginx Basic Auth** + uygulama `X-Admin-Token` |

Panel HTML'i artık public değil; Basic Auth + uygulama token'ı birlikte.

## 1. htpasswd oluştur (VPS'te — SECRET, repoya KOYMA)

```bash
sudo apt-get install -y apache2-utils          # htpasswd aracı
sudo mkdir -p /etc/nginx/efatura
sudo htpasswd -c /etc/nginx/efatura/.htpasswd admin   # parola sorar
# ek kullanıcı: sudo htpasswd /etc/nginx/efatura/.htpasswd kullanici2
sudo chown root:www-data /etc/nginx/efatura/.htpasswd
sudo chmod 640 /etc/nginx/efatura/.htpasswd
```

> `.htpasswd` **commit edilmez** (CLAUDE.md sır kuralı). `.gitignore` kapsar.

## 2. Statik admin dosyaları

`/admin` location `alias /var/www/e-fatura-service/admin/` serve eder.
Deploy'da repo `admin/` dizinini oraya kopyala (veya symlink):

```bash
sudo mkdir -p /var/www/e-fatura-service
sudo rsync -a --delete /path/to/e-fatura-service/admin/ /var/www/e-fatura-service/admin/
```

## 3. Nginx config

```bash
sudo cp nginx/efatura.conf /etc/nginx/sites-available/efatura.conf
sudo ln -sf /etc/nginx/sites-available/efatura.conf /etc/nginx/sites-enabled/
sudo nginx -t            # syntax testi
sudo systemctl reload nginx
```

## 4. TLS sertifikası (DNS yayıldıktan sonra)

```bash
sudo certbot certonly --webroot -w /var/www/certbot -d efatura.guezelwebdesign.com
sudo systemctl reload nginx
```
> DNS henüz yayılmadıysa certbot başarısız olur — `dig efatura.guezelwebdesign.com`
> sunucu IP'sini gösterince tekrar dene. O ana kadar 443 bloğu için geçici
> self-signed sertifika kullanılabilir veya 80 üzerinden test edilir.

## 5. Doğrulama

```bash
curl -I https://efatura.guezelwebdesign.com/healthz                 # 200, auth yok
curl -I https://efatura.guezelwebdesign.com/admin/                  # 401 (auth yok)
curl -I -u admin:PAROLA https://efatura.guezelwebdesign.com/admin/  # 200
curl -I https://efatura.guezelwebdesign.com/v1/admin/invoices       # 401
```

## Notlar

- `admin/index.html` **Faz 4 kapsamı** (Codex erken yazdı, henüz review/merge
  edilmedi). Bu Nginx koruması güvenlik için bağımsız teslim edildi; admin
  panel/API'nin Faz 4 review'i ayrıca yapılacak.
- Port 8210 VPS port tablosuyla deploy fazında teyit (kamanilan 8097,
  kaman-social 8079, scraper 8200) — WORK-PLAN Faz 6.
- Alternatif: ayrı `admin.efatura...` subdomain istenirse `/admin` yerine ayrı
  `server` bloğu; mekanizma (auth_basic) aynı.
