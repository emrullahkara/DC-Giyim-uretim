# Modül tasarımı ve gerekçeleri

Bu belge, her modülün **atölyedeki hangi gerçek sorunu** çözmek için bu şekilde tasarlandığını açıklar.

## Temel akış

```
Sipariş (asorti) ──► İş emri ──► Aşamalar (rota) ──► Mamul depo ──► Sevkiyat ──► Fatura / cari
                        │            │   ▲
                        │            │   └── Fason dönüşü (aşamaya işlenir)
                        │            └────── Fason gönderimi
                        └── Kesim kaydı ──► Kumaş deposundan (top/parti) düşüm
```

## 1. Kontrol Kulesi — "Sabah ilk baktığım ekran"
Atölye sahibinin en büyük yükü, her şeyi aklında tutmak ve tek tek sormaktır. Kontrol Kulesi sistemdeki tüm veriyi tarar ve **aksiyon gerektiren** durumları önem sırasına göre listeler. Her uyarının bir "git / kayıt gir / dönüş gir" butonu vardır.

Uyarı kuralları:

| Kural | Seviye |
|---|---|
| Sipariş termini geçti, tamamlanmadı | Kritik |
| Sipariş ilerlemesi, geçen süreye göre olması gerekenin %20'den fazla gerisinde | Uyarı |
| Termin yaklaşıyor ve henüz iş emri açılmadı | Uyarı |
| Termine N gün kaldı (ayarlanabilir) | Bilgi |
| İş emri termini geçti | Kritik |
| Bir aşamada fire oranı sınırı aştı (ayarlanabilir, varsayılan %5) | Uyarı |
| Fason teslimi gecikti (3 günden fazla kritik) | Uyarı / Kritik |
| Fason işi eksik adetle kapandı (son 30 gün) | Uyarı |
| Malzeme minimum stok altında | Uyarı |
| Açık siparişlerin reçete ihtiyacı depodaki stoktan fazla | Kritik |
| Çek/senet vadesi yaklaştı veya geçti | Uyarı / Kritik |
| Saat 10'u geçti, bugünün puantajı girilmedi | Bilgi |
| Görevin son tarihi geçti | Uyarı |

**Termin risk hesabı:** `olması gereken ilerleme = (bugün − sipariş tarihi) / (termin − sipariş tarihi)`; `gerçek ilerleme = iş emirlerinin aşama tamamlanma oranlarının ağırlıklı ortalaması`. Ayrıca kalan adet / kalan gün ile "günde kaç adet çıkmalı" hesaplanır.

## 2. Siparişler
- İki tür: **Mağaza satışı** (kendi modelimiz) ve **Marka fason işi** (markanın modeli, çoğu zaman markanın kumaşı).
- Kalemler **model × renk × beden asortisi** olarak girilir (sektörün gerçek dili).
- Tek tıkla her kalem için modelin üretim rotasına göre iş emri açılır.
- Termin değişikliği denetim kaydına eski tarihle birlikte yazılır (müşteriyle anlaşmazlıkta kanıt).

## 3. İş emri ve aşamalar
- Her model kendi **rotasına** sahiptir (ör. Kot: Kesim → Dikim → Yıkama → Ütü → Paket; Gömlek: Kesim → Nakış → Dikim → Ütü → Paket). Aşamalar firma tarafından ayarlanabilir.
- **Kayıp adet kuralı:** Bir aşamaya, önceki aşamadan çıkan sağlam adetten fazlası girilemez. Böylece "kesimde 500 vardı, pakette 470 çıktı, 30 nerede?" sorusu aşama bazında cevaplanır.
- Son aşamada (paket) sağlam adet **beden kırılımıyla mamul depoya** girer.
- Yanlış girilen kayıt 24 saat içinde geri alınabilir (sonraki aşamaya geçmemişse).

## 4. Kesim / pastal
- Pastal kat sayısı, pastal boyu, kullanılan kumaş ve kesilen beden adetleri girilir.
- Kumaş hangi **parti ve toptan** kesildiyse oradan düşülür → ton farkı çıkarsa geriye izlenir.
- Reçetedeki birim sarfiyat × kesilen adet ile gerçek kullanım karşılaştırılır → **sarfiyat farkı %**.

## 5. Fason
- Fasona gönderimde iş emri ve aşama seçilirse o aşama "fasonda" olarak işaretlenir; dönüşler doğrudan aşamaya işlenir.
- Kısmi dönüşler, fire/defolu adetler, **eksikle kapatma** (kayıp adet iş emrine fire olarak yazılır).
- **Fasoncu karnesi:** zamanında teslim oranı (%60 ağırlık) + kalite (%40 ağırlık) − eksik teslim cezası = 0–100 puan. Bir sonraki işi kime vereceğinize veriyle karar verirsiniz.

## 6. Depo
- Malzeme türleri: kumaş, astar, aksesuar, iplik, etiket, ambalaj.
- Birimler: metre, kg, adet, top, paket, koni, düzine.
- Toplu top girişi: bir irsaliyede gelen onlarca top tek formda girilir.
- **Emanet (müşteri malı) kumaş:** Markanın gönderdiği kumaş ayrı işaretlenir; kendi stok değerinize karışmaz.
- Sayım: sayılan miktar girilir, fark otomatik düzeltme hareketi olur.

## 7. Model / teknik föy ve maliyet
`birim maliyet = (Σ sarfiyat × malzeme birim fiyatı + Σ operasyon parça başı ücreti) × (1 + genel gider %)`
Satış fiyatı girilirse kâr marjı hesaplanır. Operasyon dakikaları (SAM) toplam iş yükünü gösterir.

## 8. Personel
- Ücret tipleri: aylık, yevmiye (günlük), parça başı.
- Puantaj: geldi / yarım gün / gelmedi / izinli / raporlu + fazla mesai saati. Telefonda tek dokunuşla.
- Parça başı kayıt: personel × iş emri × operasyon × adet; ücret operasyondan otomatik gelir.
- Aylık **tahmini** hak ediş: taban + fazla mesai (×1,5) + parça başı − avans. Resmi bordro değildir.
- T.C. kimlik (algoritma doğrulamalı), IBAN ve ücret **KVKK kapsamında hassas** alan olarak yalnızca yetkiliye gösterilir.

## 9. Finans
- Cari hareketler: satış faturası, alış faturası, fason faturası, tahsilat, ödeme.
- Bakiye: pozitif = alacağımız, negatif = borcumuz.
- Çek/senet portföyü: alınan/verilen, vade, banka, seri no; durum (portföyde, ciro edildi, tahsil edildi, ödendi, karşılıksız, iade). Çek girilirken istenirse otomatik tahsilat/ödeme hareketi oluşur.

## 10. Rol tasarımı (kim neyi görür)

| Rol | Tipik kişi | Görür / yapar |
|---|---|---|
| Firma Sahibi | Patron | Her şey + kullanıcı yönetimi + denetim kaydı |
| Yönetici | Fabrika müdürü | Her şey (kullanıcı yönetimi ve denetim hariç) |
| Muhasebe | Muhasebeci | Cari, finans, fiyatlar, personel hassas bilgileri, raporlar |
| Üretim Şefi | Atölye şefi / modelhane | Sipariş (görme), üretim, fason, kalite, model, puantaj — **fiyat görmez** |
| Depo | Depocu | Kumaş/malzeme ve mamul depo, sevkiyat — **fiyat görmez** |
| Kalite | Kaliteci | Kalite kayıtları, üretim görme |
| Operatör | Bant şefi, tablet başındaki kişi | Yalnızca üretim kaydı girme |
