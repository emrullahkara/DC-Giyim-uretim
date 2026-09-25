# Kurulum ve yayına alma

## Gereksinimler

- Bir sunucu (VPS): 2 çekirdek, 2–4 GB RAM, 20 GB disk yeterlidir. KVKK için Türkiye'de barındırılan bir sağlayıcı önerilir.
- Alan adı (ör. `uretim.firmaniz.com`) ve DNS **A kaydı** sunucu IP'sine yönlendirilmiş.
- Sunucuda Docker ve Docker Compose (`curl -fsSL https://get.docker.com | sh`).

## Adımlar (yaklaşık 10 dakika)

```bash
# 1) Kodu sunucuya alın
git clone https://github.com/emrullahkara/DC-Giyim-uretim.git /opt/dc-giyim
cd /opt/dc-giyim

# 2) Ayar dosyasını oluşturun ve düzenleyin
cp .env.example .env
nano .env        # DOMAIN, ACME_EMAIL, POSTGRES_PASSWORD (openssl rand -base64 32)

# 3) Başlatın (ilk derleme birkaç dakika sürer)
docker compose up -d --build

# 4) Kontrol
docker compose ps
docker compose logs -f app
```

Tarayıcıdan `https://alan-adiniz` adresine girin. **İlk kayıt** ekranından firmanızı oluşturun; bu hesap **Firma Sahibi** olur. Sonra Ayarlar › Kullanıcılar'dan çalışan hesaplarını açın.

> Tek firma kullanacaksanız ilk kayıttan sonra `.env` içinde `ALLOW_SIGNUP=false` yapıp `docker compose up -d` ile yeniden başlatın; böylece kimse yeni firma açamaz.

## Güncelleme

```bash
cd /opt/dc-giyim
git pull
docker compose up -d --build
```

Veritabanı şeması açılışta otomatik güncellenir (`prisma migrate deploy`); veri silinmez.

## Yedekleme

```bash
./scripts/yedekle.sh                 # yedekler/ klasörüne .sql.gz
./scripts/geri-yukle.sh yedekler/dcgiyim-20260101-0330.sql.gz
```

Otomatik günlük yedek için `crontab -e`:

```
30 3 * * * cd /opt/dc-giyim && ./scripts/yedekle.sh >> yedek.log 2>&1
```

Yedek dosyalarını düzenli olarak sunucu dışına (başka bir disk/bulut) kopyalayın.

## Ortam değişkenleri

| Değişken | Açıklama | Varsayılan |
|---|---|---|
| `DOMAIN` | Alan adı (HTTPS ve CSRF için) | — |
| `ACME_EMAIL` | Let's Encrypt bildirimleri | — |
| `POSTGRES_PASSWORD` | Veritabanı şifresi | — |
| `ALLOW_SIGNUP` | Açık firma kaydı | `true` |
| `SESSION_IDLE_HOURS` | Hareketsiz oturum süresi | `12` |
| `SESSION_MAX_DAYS` | En uzun oturum süresi | `7` |

## Telefona ekleme (PWA)

Uygulama tarayıcıdan açıldıktan sonra Android'de "Ana ekrana ekle", iPhone'da Paylaş › "Ana Ekrana Ekle" ile uygulama gibi kullanılır. Atölye panosu ve puantaj ekranları dokunmatik için tasarlanmıştır.

## Sorun giderme

- **Sertifika alınamıyor:** DNS A kaydının sunucuyu gösterdiğinden ve 80/443 portlarının açık olduğundan emin olun (`ufw allow 80,443/tcp`).
- **Uygulama açılmıyor:** `docker compose logs app` — genelde `DATABASE_URL` veya şifre hatası.
- **Giriş yapamıyorum / hesap kilitli:** 15 dakika bekleyin veya firma sahibi Ayarlar › Kullanıcılar'dan şifre sıfırlasın.
