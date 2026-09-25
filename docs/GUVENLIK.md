# Güvenlik modeli

Bu belge, uygulamanın saldırıya ve yetki aşımına karşı nasıl korunduğunu açıklar. Her madde kodda karşılığı olan bir önlemdir; çoğu `apps/api/test/security.test.ts` ile otomatik test edilir.

## 1. Firmalar arası izolasyon (çok kiracılı SaaS)

- Firma verisi taşıyan **her tablo `tenantId` içerir**.
- `apps/api/src/db.ts` içindeki `tenantDb(tenantId)` istemcisi, Prisma sorgu uzantısıyla **her `find/update/delete/count` sorgusuna `tenantId` koşulunu zorla ekler**, her `create`'e `tenantId` yazar ve `update` ile `tenantId` değiştirilmesini engeller.
- Rotalar yalnızca `req.db` (firma kapsamlı istemci) kullanır; ham `prisma` istemcisi sadece oturum/giriş/sayaç gibi global işlemlerde kullanılır.
- Yabancı referanslar (ör. başka firmanın modeliyle sipariş açmak) 404 ile reddedilir: referans verilen kayıt önce firma kapsamında doğrulanır.
- Test: "bir firma diğerinin kaydını göremez, değiştiremez, silemez, bağlayamaz".

## 2. Kimlik doğrulama

| Önlem | Uygulama |
|---|---|
| Şifre saklama | scrypt (N=2^15, r=8, p=1), 16 baytlık rastgele tuz, sabit zamanlı karşılaştırma |
| Şifre politikası | ≥10 karakter, harf + rakam, yaygın şifre listesi ve e-posta içeriği reddi |
| Kaba kuvvet | 5 hatalı denemede 15 dk hesap kilidi; giriş/kayıt uç noktalarında IP bazlı hız sınırı (10/15 dk, 5/saat) |
| Kullanıcı sayımı | Olmayan kullanıcı için de sahte hash doğrulanır (zamanlama farkı yok); hata mesajı her durumda aynı |
| Oturum belirteci | 256 bit rastgele; veritabanında yalnızca SHA-256 özeti tutulur (DB sızsa bile oturum çalınamaz) |
| Çerez | `HttpOnly`, `Secure` (üretimde `__Host-` ön ekiyle), `SameSite=Strict`, `Path=/` |
| Oturum süresi | 12 saat hareketsizlik / 7 gün mutlak (ayarlanabilir); kullanıcı başına en fazla 10 oturum |
| Şifre değişimi | Diğer tüm oturumları kapatır; rol değişimi veya pasifleştirme tüm oturumları kapatır |
| Yeni kullanıcı | Tek kullanımlık geçici şifre yalnızca bir kez gösterilir; ilk girişte değişim zorunlu |
| Hesabım | Kullanıcı aktif oturumlarını görür ve tek tek kapatabilir |

## 3. Yetkilendirme

- 7 rol × 30 ayrık yetki (`apps/api/src/lib/permissions.ts`). Her rota `need('yetki')` ile korunur; yetki listesi dışında bir string derleme hatası verir.
- **Alan düzeyinde gizleme** (`preSerialization` kancası): `fiyat:gor` yetkisi olmayana `unitPrice, salePrice, amount, balance, …` alanları; `personel:hassas` yetkisi olmayana `nationalId, iban, wage` alanları **hiç gönderilmez**. Ön yüzde saklamak yerine sunucuda silinir.
- Yazma tarafında da kontrol: hassas alanlar yetkisiz istekten ayıklanır (örn. depocu fiyat giremez, şef maaş yazamaz).
- Firma sahibi hesapları yalnızca firma sahibi tarafından değiştirilebilir; firmada en az bir aktif sahip kalmalıdır; kullanıcı kendi rolünü düşüremez.
- Görev tamamlama: yalnızca kendine atanan görevi, sadece durumunu değiştirebilir.

## 4. İstek güvenliği

- **CSRF:** Durum değiştiren her `/api` isteği `x-dc-csrf: 1` özel başlığı ister (tarayıcı çapraz siteden gönderemez) + üretimde `Origin` eşleşmesi + `SameSite=Strict`.
- **Hız sınırı:** genel 300 istek/dk/IP; hassas uç noktalar daha sıkı.
- **Girdi doğrulama:** Tüm gövde/sorgu parametreleri Zod şemalarıyla doğrulanır (uzunluk, aralık, enum, tarih, T.C. algoritması, IBAN biçimi, beden sayısı vb.). Gövde sınırı 1 MB.
- **Hata gizleme:** İç hatalar (Prisma, yığın izi) istemciye gitmez; kullanıcı Türkçe, genel mesaj alır. Günlüklerde çerez/yetki başlıkları maskelenir.
- **Güvenlik başlıkları:** Helmet ile sıkı CSP (`default-src 'self'`, inline script yok, `frame-ancestors 'none'`), HSTS, `Referrer-Policy`, `X-Content-Type-Options`.
- **CSV enjeksiyonu:** Excel'e aktarımda `= + - @` ile başlayan hücreler etkisizleştirilir.
- **PWA:** Servis çalışanı yalnızca statik dosyaları önbelleğe alır; API yanıtları cihazda saklanmaz.

## 5. Denetim kaydı

Tüm önemli işlemler (giriş/başarısız giriş, kullanıcı ekleme/rol değişimi, sipariş/termin değişikliği, üretim kaydı ve geri alma, stok hareketi, fason, sevkiyat, finans hareketi, ayar değişimi) `AuditLog` tablosuna kullanıcı, IP, zaman ve özet meta ile yazılır. Firma sahibi Ayarlar › Denetim kaydı ekranından görür.

## 6. Altyapı (docker-compose)

- PostgreSQL yalnızca iç ağda; dışarıya port açılmaz.
- Uygulama konteyneri root olmayan kullanıcıyla, salt okunur dosya sistemiyle, tüm Linux yetenekleri düşürülmüş (`cap_drop: ALL`, `no-new-privileges`) çalışır.
- Caddy otomatik TLS (Let's Encrypt), HSTS; HTTP → HTTPS yönlendirmesi.
- Günlük yedek betiği (`scripts/yedekle.sh`), 30 gün saklama, dosya izinleri 600.

## 7. Bilinen sınırlar ve öneriler

- E-posta ile şifre sıfırlama yoktur (e-posta servisi gerektirir); sıfırlama firma sahibi tarafından yapılır.
- İki faktörlü doğrulama (TOTP) ilk sürümde yok; oturum modeli buna hazırdır.
- Veritabanı disk şifrelemesi barındırıcı düzeyinde yapılmalıdır (KVKK için yurt içi sunucu önerilir).
- `ALLOW_SIGNUP=false` yaparak açık kaydı kapatabilirsiniz (tek firma kullanımı).
