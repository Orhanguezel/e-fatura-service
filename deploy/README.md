# Faz 6 — VPS Deploy Runbook (guezelwebdesign 72.61.93.212)

> Sunucu emsali: `scraper-service` (Docker Compose, kendi redis container'ı,
> Nginx 127.0.0.1 upstream). `orhan` docker grubunda → compose **sudo'suz**.
> Sudo yalnız Nginx vhost + certbot için.

## Önkoşul (sunucuda mevcut, doğrulandı)

- Ubuntu 24.04, Bun 1.3.10, Docker + Compose (`orhan` docker grubunda).
- Port **8210 boş** (kamanilan 8097, kaman-social 8079, scraper 8200).
- Redis/MySQL **stack içinde** (sistem paketi YOK — apt/sudo gerekmez).

## 1. Klonla

```bash
cd /var/www
git clone https://github.com/Orhanguezel/e-fatura-service.git
cd e-fatura-service                       # main = Faz 1-4 (kabul, yeşil)
```

## 2. .env (SECRET — commit edilmez)

```bash
cp deploy/.env.prod.example .env
# Doldur:
#   MYSQL_PASSWORD / MYSQL_ROOT_PASSWORD  → openssl rand -base64 32
#   EFATURA_ENC_KEY                       → openssl rand -base64 32
#   EFATURA_ADMIN_TOKEN                   → openssl rand -hex 24
#   EFATURA_NILVERA_MOCK=true             (sandbox credential gelene kadar)
#   EFATURA_DEV_* (sportoonline tenant seed)
chmod 600 .env
```

## 3. Build + ayağa kaldır (sudo'suz)

```bash
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml ps          # mysql/redis healthy, api up
```

## 4. Şema + dev tenant seed (yalnız İLK kurulum — db:seed:fresh DROP'lar)

```bash
docker compose -f docker-compose.prod.yml exec api bun run db:seed:fresh
```

## 5. Doğrula (lokal, Nginx'ten önce)

```bash
curl -fsS http://127.0.0.1:8210/healthz          # {"status":"ok","redis":"up","db":"up"}
```

## 6. Nginx + TLS  (SUDO gerekli — kullanıcı / yetkili adım)

```bash
sudo cp nginx/efatura.conf /etc/nginx/sites-available/efatura.conf
sudo ln -sf /etc/nginx/sites-available/efatura.conf /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot certonly --webroot -w /var/www/certbot -d efatura.guezelwebdesign.com
sudo systemctl reload nginx
curl -fsS https://efatura.guezelwebdesign.com/healthz
```
(DNS efatura.guezelwebdesign.com → 72.61.93.212 yayıldı.)

## 7. Güncelleme (sonraki deploy'lar — seed YOK)

```bash
cd /var/www/e-fatura-service && git pull origin main
docker compose -f docker-compose.prod.yml up -d --build
# Şema değişimi: ALTER yok (CLAUDE.md). db/seed/sql/0XX güncellenip
# bakım penceresinde db:seed:fresh (veri kaybı kabul) — pilot öncesi.
```

## Notlar

- **Canlı gerçek fatura** (GİB) muhasebe teyidi + Nilvera prod credential
  ön koşulu — bu runbook servisi `EFATURA_NILVERA_MOCK=true` ile ayağa
  kaldırır; gerçek kesim ayrı gated adım (WORK-PLAN Faz 6 sonu).
- Admin panel: `admin/index.html` Nginx `/admin` ile servis (nginx/README.md).
- Tek hata noktası → Redis kalıcı (appendonly), `restart: unless-stopped`,
  `/healthz` + Nginx. Kuyruk servis düşse de kaybolmaz.
