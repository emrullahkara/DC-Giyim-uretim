# DC Giyim-Üretim

**Tekstil ve konfeksiyon atölyeleri için üretim takip platformu.**
Pantolonsu, gömlekçisi, montçusu, kabancısı, abiyecisi, triko atölyesi… Kendi üretip mağazaya satan da, markaya fason çalışan da tek ekrandan yönetir.

> "Keşke bu uygulamayı daha önce bilseydik" dedirtmek için yapıldı: Atölye sahibinin kafasında, defterde, WhatsApp'ta, Excel'de dağınık duran takibi tek yerde toplar ve **sorun büyümeden haber verir.**

---

## Ne işe yarar? (Atölye sahibinin gözünden)

| Her gün yaşanan sorun | DC Giyim-Üretim'in çözümü |
|---|---|
| "Sipariş termine yetişecek mi?" diye her gün bantları tek tek dolaşmak | **Kontrol Kulesi**: plan/gerçek ilerlemeyi karşılaştırır. Geride kalan siparişi *gecikmeden önce* işaretler, "termine yetişmek için günde X adet çıkmalı" der |
| Fasoncuya giden malın ne zaman, kaç adet döneceğini bilmemek; eksik dönüşü sonradan fark etmek | **Fason Takibi**: gönderim–dönüş–fire–eksik, gecikme alarmı ve **fasoncu karnesi** (zamanında teslim %, fire %, puan) |
| Kumaşın sipariş ortasında bitmesi | **Malzeme ihtiyacı**: açık siparişler × model reçetesi − depo = eksik kumaş/aksesuar, önceden uyarır |
| "Bu kadar kumaş nereye gitti?" | **Kesim kaydı** (pastal kat × boy): kumaşı top/parti bazında düşer, reçeteye göre **sarfiyat farkını** gösterir |
| Ton farkı çıktığında hangi toptan kesildiğini bilmemek | **Top / parti (lot) takibi**: her kesim hangi parti ve toptan yapıldı kayıtlı |
| Aşamalar arasında kaybolan adetler | Bir aşamaya, bir önceki aşamadan çıkan adetten fazlası girilemez: **kayıp adet anında görünür** |
| Çek/senet vadesini kaçırmak | **Vade takibi**: ödenecek ve tahsil edilecek çekler için önceden uyarı |
| Puantaj, yevmiye, parça başı, avans hesabı | **Personel**: telefondan 30 saniyede puantaj, parça başı kayıt, aylık tahmini hak ediş |
| Çalışanın fiyat/maliyet görmesi | **Yetki kontrolü**: fiyatlar ve personel maaşları sadece yetkilisine gönderilir (sunucu tarafında gizlenir) |

## Modüller

1. **Kontrol Kulesi** — Tek ekranda tüm uyarılar (kritik / uyarı / bilgi), termin takibi, darboğaz (aşamalarda bekleyen iş), günlük çıkış grafiği, eksik malzeme, cari durum, görevler.
2. **Siparişler** — Mağaza satışı / marka fason işi; beden asortisi (renk × beden); termin riski; tek tıkla iş emri; malzeme ihtiyacı.
3. **Atölye Panosu** — Aşama bazlı kanban (Kesim → Dikim → Ütü → Kalite → Paket…). Telefonda "Kayıt gir" butonuyla anında üretim girişi.
4. **İş Emirleri** — Aşama zinciri, kesim/pastal kaydı, üretim hareketleri (24 saat içinde geri alma), fason ve kalite bağlantıları, föy yazdırma.
5. **Fason Takibi** — İrsaliyeli gönderim, kısmi/tam dönüş, fire, eksikle kapatma, gecikme alarmı, fasoncu karnesi.
6. **Kalite Kontrol** — Aşama bazlı kontrol, hata tiplerine göre Pareto analizi.
7. **Modeller (Teknik föy)** — Beden seti, renkler, üretim rotası, reçete (kumaş/aksesuar sarfiyatı), operasyonlar (dakika, parça başı ücret), **birim maliyet ve kâr marjı**.
8. **Kumaş & Malzeme Deposu** — Kumaş, astar, aksesuar, iplik, etiket, ambalaj; top/parti girişi, çıkış, fire, fasona çıkış, sayım; kritik stok; **müşteri malı (emanet) kumaş**.
9. **Mamul & Sevkiyat** — Model/renk/beden stok matrisi, irsaliyeli sevkiyat, siparişe bağlı sevk, otomatik satış faturası kaydı.
10. **Personel** — Kartlar, puantaj, parça başı üretim, avans, aylık tahmini hak ediş (aylık / yevmiye / parça başı).
11. **Cariler** — Müşteri, tedarikçi, fasoncu (bir cari birden fazla türde olabilir), bakiye.
12. **Finans & Çek** — Cari hareketler, bakiyeler, çek/senet portföyü ve vade takibi.
13. **Görevler** — Kişiye atanan işler, geciken görev uyarısı.
14. **Raporlar** — Dönemsel üretim, aşama çıkışları, fason, müşteri bazlı sevkiyat, kalite; Excel'e aktarım.
15. **Ayarlar** — Aşamalar, varsayılan rota, beden setleri, kategoriler, hata tipleri, bölümler, uyarı eşikleri; kullanıcılar ve roller; denetim kaydı.

Ayrıntılı tasarım gerekçeleri: [docs/MODULLER.md](docs/MODULLER.md)

## Güvenlik özeti

- **Çok firmalı izolasyon**: Her sorguya firma kimliği sunucu tarafında zorla eklenir; bir firma başka firmanın kaydına id bilse bile erişemez (testlerle kanıtlı).
- **Rol tabanlı yetki** (7 rol, 30 yetki): Firma Sahibi, Yönetici, Muhasebe, Üretim Şefi, Depo, Kalite, Operatör.
- **Alan düzeyinde gizleme**: Fiyat/maliyet ve personelin T.C. no, IBAN, maaş bilgileri yetkisiz kullanıcıya **hiç gönderilmez**.
- Oturum: HttpOnly + Secure + SameSite=Strict çerez, sunucuda karma (hash) olarak saklanan rastgele belirteç, hareketsizlik ve mutlak süre sınırı.
- Şifre: scrypt ile tuzlanmış özet, güçlü şifre politikası, 5 hatalı denemede 15 dk kilit, ilk girişte zorunlu değişim.
- CSRF koruması, hız sınırı, sıkı CSP ve güvenlik başlıkları, girdi doğrulama, iç hataların gizlenmesi, **denetim kaydı**.

Ayrıntılar: [docs/GUVENLIK.md](docs/GUVENLIK.md)

## Kurulum

Canlıya alma (Docker, otomatik HTTPS, yedekleme): [docs/KURULUM.md](docs/KURULUM.md)

Geliştirme ortamı:

```bash
npm install
cp apps/api/.env.example apps/api/.env      # DATABASE_URL'i düzenleyin
npm run db:migrate -w apps/api
npm run dev:api     # http://localhost:3000
npm run dev:web     # http://localhost:5173
npm test            # API testleri (PostgreSQL gerekir)
```

Demo verisi (isteğe bağlı): `DEMO_EMAIL=demo@firma.com DEMO_PASSWORD='GucluBirParola2026' npm run db:seed -w apps/api`

## Teknoloji

- **Arka uç:** Node.js 22, Fastify 5, Prisma 6, PostgreSQL 16, Zod
- **Ön yüz:** React 19, Vite, Tailwind CSS 4, TanStack Query, PWA (telefona uygulama gibi eklenir)
- **Yayın:** Docker Compose + Caddy (Let's Encrypt ile otomatik HTTPS)
