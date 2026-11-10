# RıdvanSes v72 — Ses Kalitesi, DSP Sadakati ve Süreklilik Denetimi

Tarih: 2026-11-10  
Taban HEAD: 14f2c9fd5ace6e2f2b2f86d789ce44e7c29e0de3 (uygulanmış v71)  
Çalışma alanı: D:/umresesliyazılım

## 1. Karar ve Uygulama Durumu

Değiştirilmemiş v71 gerçek CLI’da **60/60 PASS, exit 0** verdi; ek sayısal problar **4 P2 ve 1 P3** kalite kusuru gösterdi. Bu beş kusura yönelik aşağıdaki tek **v72 unified diff’i**, çalışma ağacına uygulandı ve doğrudan `node scripts/verify-system.js` üzerinde **62/62 PASS, exit 0** ile doğrulandı (`git apply --reverse --check --ignore-space-change -` → `exit 0`).

**Uygulama durumu: UYGULANDI VE DOĞRULANDI (v72 — 62/62 PASS).** AUDIT_FIX_SUMMARY.md / AUDIT_REPORT.md silinmeleri korundu.

Kapanış iddiası bu sentetik/deterministik durumlar içindir. Gerçek Arapça/Türkçe dinleme skoru, mobil donanım matrisi, sahada echo/kalabalık izolasyonu veya tüm ağ koşullarında sıfır hece kaybı kanıtı üretilmedi. Özellikle gürültünün altında kalan ilk ünsüzler ve 60 ms’yi aşan kayıp için aşağıdaki işletim sınırları geçerlidir.

## 2. Beş somut bulgu ve v72 çözümü

Satırlar değiştirilmemiş v71 içindir. Ölçümler baseline üretim DSP kodundan alınmıştır; yalnız kaynakta bir sabit bulunmasına dayanmaz.

| Kimlik / önem | Kök neden ve v71 negatif ölçümü | v72 adayındaki çözüm / pozitif ölçüm |
|---|---|---|
| P3-72-01 — Capture faz tablosu basamakları | public/pcm-capture-worklet.js:40 fazı floor(...*256) ile seçiyor; alt faz kalanı atılıyor. 44,1→24 kHz, 8 kHz/0,5 peak sinüs artık bozulması −58,00 dB; 997 Hz tam kernel→PCM16 THD+N −75,87 dB | 256 faz aralığı + 257’nci endpoint ve katsayılar arasında doğrusal interpolasyon. Aynı 8 kHz artık −120,62 dB; gerçek PCM16 çıkış THD+N −89,83 dB. 48 kHz tam-sayı yolu korunuyor |
| P2-72-02 — Uzun konuşmanın noise floor’a dönüşmesi / başlangıç attenuasyonu | capture:117 rolling minima her 4 s’de konuşmayla doluyor, n[k] artıyor; :131 7,5 dB açılma eşiği 5 dB giriş fixture’ını açmıyor. 10/20 dB kesintisiz çok harmonikli sinyalin 8–9 s kazancı 0,126 (−17,99 dB); ilk 400 ms’de de zorunlu aynı attenuation | Konuşma hold’unda yukarı noise-learning durur, aşağı öğrenme sürer. İkinci dereceden ton öngörücüsü durağan sinüsü ayrı tutarak eski tone/noise reddini korur. Açılma 4,5 dB (reject’e bağlı 3,1–5,9), hysteresis 2 dB. 5/10/20 dB uzun ses kazancı 1; durağan gürültü yanlış açılma %0. Kalibrasyon sırasında unity gain + UI’da sesin iletildiği açık bilgisi |
| P2-72-03 — Kayıpsız negatif clock drift’te starvation | public/pcm-player-worklet.js:286 yalnız P kontrolü error*0.01 kullanıyor. Minimum target 80 ms’de −1000 ppm için gerekli −100 ms sabit kuyruk hatası fiziksel olarak sağlanamaz. 240 s kayıpsız probunda 276 late, 132.960 PLC örneği, 1 starvation; sıfıra yakın kesit ~303 ms | Anti-windup PI: Kp=0,04 s⁻¹, Ki=0,0004 s⁻²; düzeltme ±1000 ppm, mevcut 2 s slew filtresi. ±100/500/1000 ppm × 240 s gerçek render matrisinde late=0, PLC=0, starvation=0 |
| P2-72-04 — Düşük hız FIR başlangıcı fade’i geçiyor | player:232 sıfırlanan 193-tap FIR’e ani kaynak step’i veriliyor. FIR group delay 4 ms; 5 ms çıkış fade’i bu sırada büyük ölçüde açılmış oluyor. 0→−0,2 DC stresinde maxStep 8 kHz=0,130492; 16 kHz=0,145227 | Kaynak örneğine FIR/ASRC öncesinde 120 örnek/5 ms raised-cosine startup rampası; reset ve starvation’da yenilenir. Final maxStep 8 kHz=0,0078514; 16 kHz=0,0039267. Tüm hızlarda ilk örnek 0 ve hızla ölçeklenen slope sınırı PASS |
| P2-72-05 — Hermite görüntüleri ve katlanan artıklar | player:303 dört örnekli kübik interpolasyon, ideal bant sınırlı yeniden örnekleme değil. Sabit ratio’da 16 kHz çıkış/5,6 kHz giriş artık −26,49 dB; 48 kHz çıkış/8 kHz giriş −14,65 dB ve −1,476 dB gain kaybı. Alçak hızın giriş FIR’i interpolasyon sırasında üretilen görüntüleri önleyemez | 32-tap Blackman fractional-delay FIR, 256 interpolasyonlu faz aralığı. 193-tap düşük hız anti-alias FIR korunur. Aynı artıklar −93,17 / −80,42 dB; 8 kHz gain hatası ~−0,0008 dB. 17 kaynak örneği / 0,708 ms nedensel gecikme; gelecekteki paket erken çekilmez |

Bu tablo bir dinleyici anketi/MOS sonucu değildir. Sinüs artığının duyulurluğu frekansa, seviyeye, kulaklığa ve maskelemeye bağlıdır; ölçülen kusur algoritmik bozulmanın kendisidir.

### 2.1 Gain, gate ve profile davranışındaki bilinçli değişiklikler

- Warm-up/resetLock sırasında ilk 400 ms attenuasyon kaldırıldı. Bu aralıkta ortam sesi de geçer; rehber UI metni bunu açıklar. Gizlilik için mute aynı rampalı kontrolle çalışmaya devam eder.
- SNR eşiği varsayılan reject=0,5 için 4,5 dB; kapanma 2,5 dB. Hold=24×10 ms; gain attack=3 ms, release=120 ms; 10–90% karşılıkları yaklaşık 6,6 / 264 ms. Enerji zarfı alpha=0,005 @24 kHz ≈8,3 ms; karar hop’u 10 ms; lookahead 10 ms; comfort delay 3 ms.
- “4 bant” dört enerji kestirimidir; çıkışta tek broadband gain kullanılır. Bu bir beamformer, konuşmacı kimlik ayrıştırıcı veya dört ayrı spektral denoiser değildir.
- Tone predictor residual/energy ≤0,0005 olan durağan sinüs için yukarı noise-learning açık kalır. Eski ADIM-4.9’un 1 s sessizlik sonrası −35 dBFS/700 Hz tonu hâlâ tabana öğrenilir: g≈0,126, n[1]≈1,71×10⁻⁴. Eski test kaldırılmadı/gevşetilmedi.
- Comfort fade gerçek comfort-noise üretmez; 600 ms kapalı durum sonrası 80 ms zaman sabitiyle sıfıra iner. Açılmada 2 ms yükseliş ve 3 ms gecikme vardır. Bu mekanizma düşük SNR’daki algılanamayan ilk ünsüzü kendi başına kurtaramaz.
- PI integral’i kayıp/boş kuyrukta ve saturasyonu büyüten yönde birikmez. Reset yeni clock durumuna temiz başlar; loss/jitter/trim kararı ve 80–260 ms target sınırları korunur.
- Sinc tablosu yalnız constructor’da kurulur; render sırasında yeni tablo/FFT/Promise yoktur. Reset source/ring/FIR tarihçesini temizler. Mevcut 3 ms PLC recovery ve frame-boundary trim crossfade’i korunur.

## 3. Ölçüm yöntemi ve kapsam

Gerçek production worklet/kernel sınıfları ve rehberin Float32→PCM16 fonksiyonu kullanıldı. Yeni kalıcı testler trusted DSP kaynağını vm.compileFunction ile host realm’de çalıştırır; yüz milyonlarca render işleminde VM global erişim maliyeti ölçüme karışmaz. DSP fonksiyonları taklit edilmez. Worklet port/hardware kabuğu taklittir; işletim sistemi audio thread’i ölçülmüş değildir.

THD+N/artık: 2 s sinüsün oturmuş 1 s kesitinde least-squares sin/cos/DC fit’i; artık RMS/fundamental RMS, dB. Bu değer harmonikler ile örnekleme görüntüleri/spur’larını içerir. Quantization SNR ayrıca gerçek Int16 decode’u ile Float32 farkından hesaplandı. “−150 dB’den küçük” sayılar nümerik taban olarak okunmalı; analog mikrofon performansı veya PCM16’nın 150+ dB çözünürlüğü değildir.

Gate fixture: 24 kHz, sabit seed uniform white noise RMS=0,035 (dBFS referansı; dB SPL değil); 220/880/1760 Hz harmonikleri, normalize RMS=1; güçlü ses için SNR 5/10/20 dB. Prefix/coda zarfı güçlü vowel’in 0,12’si (−18,42 dB), prefix 80 ms, vowel 400 ms civarı, coda 140 ms civarı. Long probe 10 s; son kazanç 8–9 s’de ölçüldü. Ayrı s/ş/f/h/t-k bant probları aşağıda verilmiştir; gerçek dil korpusu ve STOI/PESQ/MOS skoru kullanılmadı.

Player fixture: 197 Hz, peak=0,25, gerçek 480-örnek/20 ms paketler, 128-örnek render quantum. Tam %1/%3/%5 kayıp: 8 s/400 paket içinde 4/12/20 aralıklı tekil kayıp; ayrı 2/3/5 ardışık kayıp. Burst arrival’da her 1 s aralıkta bir grup 60/120/180 ms tutulup birlikte bırakıldı. Drift: ±100/500/1000 ppm değişen gönderim saati, her biri 240 s, paket kaybı yok. Saat düzeltmesi ses perdesini az miktarda değiştirir: 1000 ppm ≈1,73 cent; sıfır pitch değişimi iddiası yoktur.

Reset fixture 0→±0,2 DC, startup/rebuffer stresidir; maxStep=|y[n]−y[n−1]|. Tonlu trim/loss maxStep’leri bu DC stres tablosuyla doğrudan karşılaştırılmamalıdır. MaxStep tek başına psikoakustik “duyulmaz click” kanıtı değildir.

## 4. Capture ve mikrofon ön zinciri

Birincil gUM isteği echoCancellation=true, noiseSuppression=false, autoGainControl=false, mono/48 kHz tercihidir. Böylece birincil yolda browser NS/AGC’nin uygulama gate/limiter’iyle zorunlu üst üste binmesi istenmiyor. AEC’nin ve cihazın iç işleyişi tarayıcıya bağlıdır. audio:true fallback’i bu tercihleri korumaz; o yolda gerçek getSettings() ile cihaz doğrulaması gerekir. Bu tur bir telefonun AEC/NS/AGC algoritması ölçülmedi. [Media Capture standardı](https://www.w3.org/TR/mediacapture-streams/) bu işlemleri ayrı constraint/settings olarak tanımlar.

Ön zincirde HP85 Hz, 210 Hz/−2,5 dB peaking, 3,2 kHz/+2 dB presence, LP10,5 kHz ve kullanıcı gain’i vardır. DynamicsCompressorNode bu aktif hatta yoktur. Worklet ayrıca ~80 Hz DC blocker uygular; dolayısıyla alçak frekans kesimleri üst üste gelir. Alıcı HP65/+1,5 dB presence ve volume/soft-clipper ekler. Bu, bass gövdesini azaltan ve 3 kHz’i yükselten bir EQ tercihidir; “flat” yanıt değildir.

Aşağıdaki EQ değerleri normatif biquad formülleriyle analitik modeldir; gerçek tarayıcı OfflineAudioContext render’ı değildir. HP/LP’de Q=−3,0103 değeri dB biriminde Butterworth’e karşılık gelir; negatif bir lineer Q hatası değildir. WaveShaper eğrisinin uç değer eşlemesi ve nominal çıkış aralığı için de [Web Audio standardı](https://www.w3.org/TR/webaudio/) esas alındı.

| Hz | Guide ön EQ dB | Worklet DC dB | RX EQ dB | Birlikte dB |
|---|---|---|---|---|
| 80 | -3.873 | -3.096 | -1.569 | -8.893 |
| 100 | -2.346 | -2.235 | -0.711 | -5.647 |
| 160 | -2.063 | -1.058 | -0.111 | -3.587 |
| 210 | -2.603 | -0.678 | -0.030 | -3.666 |
| 1000 | 0.196 | -0.119 | 0.239 | -0.038 |
| 3000 | 1.951 | -0.094 | 1.500 | 3.003 |
| 8000 | -0.549 | -0.091 | 0.263 | -0.733 |

Birlikte sütununda default guide gain=1, açık gate×0,8 ve listener volume=1,2 bulunur; capture FIR passband’i yaklaşık unity, limiter inaktiftir. 80–210 Hz’de kayıp, duyulan ses gövdesinin cihazdan bağımsız DSP katkısıdır. Kör EQ değişikliği yapılmadı; düşük frekans gövdesini artırmak rüzgâr/rumble geçişini de artırır.

### 4.1 FIR ve PCM ölçümleri

| Giriş Hz | 100–8000 Hz ripple dB | 12 kHz+ grid en zayıf red dB | Grid en zayıf Hz | 8 kHz tone artığı v71→v72 dB |
|---|---|---|---|---|
| 44100 | 0.0002548 | -91.04 | 12000 | -58.00 → -120.62 |
| 48000 | 0.0003140 | -88.34 | 12000 | -229.41 → <−150 (nümerik taban) |

Ripple sweep: 100–8000 Hz/100 Hz grid ve faz 0/64/128/192/256; stop sweep 12 kHz’den giriş Nyquist’ine aynı grid. Sonuç örneklenmiş grid sınırıdır; aradaki her frekans için matematiksel global minimum sertifikası değildir. “Her stopband noktasında −118 dB” yorumu doğru değildir; v71 header’daki bu mutlak ifade adayda düzeltildi.

| Paket | Giriş Hz | Float32 THD+N dB | PCM16 THD+N dB | Quant SNR dB | Float32 peak |
|---|---|---|---|---|---|
| v71 | 44100 | -76.06 | -75.87 | 88.35 | 0.394573 |
| v71 | 48000 | -149.30 | -89.83 | 88.35 | 0.394566 |
| v72 | 44100 | -138.42 | -89.83 | 88.38 | 0.394566 |
| v72 | 48000 | -149.30 | -89.83 | 88.35 | 0.394566 |

997 Hz için kernel girişi peak=0,5, continuousSpeech=true, comfortFade=false; ölçüm WebAudio ön EQ’sunu içermez. 48 kHz performansı korunurken 44,1 kHz’in kuantizasyondan önce ürettiği spur giderildi. Dither eklenmedi; düşük seviyeli PCM16 kuantizasyonunun deterministik karakteri devam eder. Loud limiter mevcut ceiling ~0,98’i korur; clipping öncesi doğru mikrofon seviyesi hâlâ gereklidir.

### 4.2 Hece zarfı, frikatifler ve sınırlar

| SNR dB | v71 uzun ses son gain | v72 vowel min | v72 coda min | v72 uzun ses son min | v72 kısa cold onset min |
|---|---|---|---|---|---|
| 5 | 0.126 | 0.9702 | 1 | 1 | 1 |
| 10 | 0.126 | 0.9702 | 1 | 1 | 1 |
| 20 | 0.126 | 1 | 1 | 1 | 1 |

Ayrı bantlı prefix/coda modeli s=4–8 kHz, ş=2–5 kHz, f=1–4 kHz, h=0,5–5 kHz, t/k=2–7 kHz içinde 8 eşit RMS sinüsün fazlı toplamını kullanır; beyaz gürültü üstüne kısa noise-like burst olarak bindirilir. Vowel seviyesiyle verilen SNR’ın −18,42 dB altındaki prefix’i ölçer. Lookahead hizası +10 ms ile kontrol edildi.

| Vowel SNR dB | Model | Prefix mean v71→v72 | Coda mean v71→v72 | Uzun okuma prefix min |
|---|---|---|---|---|
| 5 | s | 0.126 → 0.130 | 0.126 → 1.000 | 1.000 |
| 5 | ş | 0.126 → 0.130 | 0.126 → 1.000 | 1.000 |
| 5 | f | 0.126 → 0.130 | 0.126 → 1.000 | 1.000 |
| 5 | h | 0.126 → 0.130 | 0.126 → 1.000 | 1.000 |
| 5 | t/k | 0.126 → 0.130 | 0.126 → 1.000 | 1.000 |
| 10 | s | 0.126 → 0.130 | 1.000 → 1.000 | 1.000 |
| 10 | ş | 0.126 → 0.130 | 1.000 → 1.000 | 1.000 |
| 10 | f | 0.126 → 0.130 | 1.000 → 1.000 | 1.000 |
| 10 | h | 0.126 → 0.130 | 1.000 → 1.000 | 1.000 |
| 10 | t/k | 0.126 → 0.130 | 1.000 → 1.000 | 1.000 |
| 20 | s | 0.126 → 0.316 | 1.000 → 1.000 | 1.000 |
| 20 | ş | 0.126 → 0.859 | 1.000 → 1.000 | 1.000 |
| 20 | f | 0.126 → 0.859 | 1.000 → 1.000 | 1.000 |
| 20 | h | 0.126 → 0.859 | 1.000 → 1.000 | 1.000 |
| 20 | t/k | 0.126 → 0.859 | 1.000 → 1.000 | 1.000 |

Ek cold-start probunda ilk andan kesintisiz konuşma kalibrasyona da girerse, varsayılan profilin 1–2 s kazancı v72’de 0,126…0,132 kalır; uzun okuma profili aynı probu gain=1 ile geçirir. Dolayısıyla default otomatik profil için ilk 400 ms sessiz ortam kalibrasyonu hâlâ bir çalışma önkoşuludur. Bu adayın warm-up değişikliği, anında başlayan bütün bir cümleyi otomatik tanıdığı anlamına gelmez.

5 dB vowel koşulunda bu prefix’in yerel SNR’ı yaklaşık −13,4 dB’dir. Otomatik gate’in böyle bir sesi “rehber ünsüzü” olarak güvenle ayırması beklenemez. Coda hold sayesinde korunur; uzun okuma profilinde prefix gain=1 korunur ve **ortam da geçer**. Uzun kıraat/dua için mevcut uzun okuma profilinin bu ödünleşimi önemlidir. Bunlar gerçek konuşmada hece doğruluğu yüzdesi değildir.

## 5. Player resampling, jitter ve PLC

### 5.1 Sabit ratio’da interpolasyon sadakati ve düşük hız FIR’i

| Çıkış Hz | Ton Hz | v71 artık dB | v72 artık dB | v72 gain hatası dB |
|---|---|---|---|---|
| 8000 | 997 | <−150 (nümerik taban) | <−150 (nümerik taban) | 0.0000 |
| 8000 | 2800 | <−150 (nümerik taban) | <−150 (nümerik taban) | 0.0002 |
| 16000 | 997 | -85.34 | -110.68 | 0.0000 |
| 16000 | 5600 | -26.49 | -93.17 | 0.0001 |
| 24000 | 997 | <−150 (nümerik taban) | <−150 (nümerik taban) | 0.0000 |
| 24000 | 8000 | <−150 (nümerik taban) | <−150 (nümerik taban) | 0.0000 |
| 44100 | 997 | -73.61 | -114.96 | 0.0000 |
| 44100 | 8000 | -14.46 | -81.99 | -0.0010 |
| 48000 | 997 | -85.34 | -110.67 | 0.0000 |
| 48000 | 8000 | -14.65 | -80.42 | -0.0008 |

Interpolasyon karşılaştırmasında servo ratio=1 tutuldu, target mevcut kuyrukla eşitlendi; frekans modulation artığıyla interpolasyon görüntüsü karıştırılmadı. Aday 32-tap tablo + phase interpolation kullanır. Düşük hız 193-tap FIR’in kendisi değiştirilmedi.

| Çıkış Hz | Giriş ton Hz | 193-tap FIR gain dB |
|---|---|---|
| 8000 | 1000 | -0.00 |
| 8000 | 4080 | -76.44 |
| 8000 | 4800 | -107.39 |
| 8000 | 6000 | -113.55 |
| 16000 | 1000 | -0.00 |
| 16000 | 8160 | -95.97 |
| 16000 | 9600 | -113.56 |
| 16000 | 10000 | -124.51 |

Bu alias tablosu 193-tap FIR’in kaynak domain’inde ölçülen gain’idir. Mevcut ADIM-5.V60 ayrıca gerçek render’da 8/16 kHz alias reddini sınar ve geçti. Giriş anti-alias filtresi ile fractional interpolator görüntüleri ayrı ölçüldü; birinin başarısı diğerinin yerine sayılmadı.

### 5.2 Tam kayıp / burst / jitter sonuçları

| Koşul | Süre s | Çıkış Hz | PLC örneği | Late | maxStep | En uzun sıfıra yakın ms |
|---|---|---|---|---|---|---|
| Tam %1 tekil | 8 | 48000 | 1920 | 0 | 0.0079408 | 0.000 |
| Tam %3 tekil | 8 | 48000 | 5760 | 0 | 0.0083080 | 0.000 |
| Tam %5 tekil | 8 | 48000 | 9600 | 0 | 0.0080113 | 0.000 |
| 2 ardışık / 40 ms | 5 | 48000 | 960 | 0 | 0.0082775 | 0.000 |
| 3 ardışık / 60 ms | 5 | 48000 | 1440 | 0 | 0.0082775 | 0.000 |
| 5 ardışık / 100 ms | 5 | 48000 | 2400 | 0 | 0.0082775 | 39.792 |
| 60 ms arrival burst | 8 | 48000 | 0 | 0 | 0.0064487 | 0.000 |
| 120 ms arrival burst | 8 | 48000 | 5760 | 12 | 0.0064546 | 0.000 |
| 180 ms arrival burst | 8 | 48000 | 15360 | 32 | 0.0064540 | 19.917 |

60 ms arrival burst’ü fixture’ta tamamen tamponlandı. 120/180 ms burst’lerde **geç paket ve PLC vardır**: aday “sıfır kayıp” sağlamıyor. Target’ın büyümesi mevcut oynatma kuyruğunda bir anda o kadar ses yaratmaz. 80–260 ms sınırı bir garanti edilmiş ağ tolerans zarfı değildir. Birdenbire eklenen 180 ms gecikme, mevcut ~100 ms timeline’ı aşabilir.

5 ardışık kayıpta pitch PLC 60 ms’de sıfıra söner; yaklaşık 40 ms gerçek bilgi yoktur. 3 ms raised-cosine recovery discontinuity’yi sınırlar, eksik heceyi geri getiremez. Sustained backlog/active trim de gecikmeyi sınırlamak için konuşma süresi atar; “phase korunuyor” demek “kelime kaybı yok” demek değildir.

### 5.3 Reset, starvation ve trim

| Çıkış Hz | Reset maxStep v71 | Reset maxStep v72 | Starvation restart v72 | İlk örnek |
|---|---|---|---|---|
| 8000 | 0.1304923 | 0.0078514 | 0.0078505 | 0 |
| 16000 | 0.1452266 | 0.0039267 | 0.0039261 | 0 |
| 24000 | 0.0026399 | 0.0033569 | 0.0033565 | 0 |
| 44100 | 0.0014279 | 0.0018247 | 0.0018245 | 0 |
| 48000 | 0.0013145 | 0.0016771 | 0.0016769 | 0 |

Yüksek hızlarda ek source rampasıyla sayısal slope önceki output-only fade’e göre biraz değişir; tüm final aday sonuçları hızla ölçeklenen 96 amplitude-unit/s DC slope sınırının altındadır. Düşük hızdaki 0,13–0,145 sıçrama giderildi. Filtre ringing’ini bir zero-crossing araması tek başına çözmez; DC fixture’ın sıfır geçişi yoktur.

| Paket | Active overflow q | Atılan frame | Resync | phase/fi korundu | 197 Hz maxStep |
|---|---|---|---|---|---|
| v71 | 30 | 18 | 0 | true | 0.0064483 |
| v72 | 30 | 18 | 0 | true | 0.0064476 |

Bu, aktif oyuncuya 40 ek frame enqueue edilen kontrollü backlog probudur; gerçek 180 ms ağ koşulu ile karıştırılmaz. Atılan 18 frame=360 ms konuşmadır. Ayrıca 600 ms teslim kesintisi + toplu geliş içeren catch-up stresinde:

| Hz | catchup drop frame | maxStep | Starvation | Sıfıra yakın ms |
|---|---|---|---|---|
| 8000 | 19 | 0.0392541 | 1 | 426.75 |
| 16000 | 19 | 0.0207266 | 1 | 435.81 |
| 24000 | 19 | 0.0154075 | 1 | 438.67 |
| 44100 | 20 | 0.0090088 | 1 | 440.57 |
| 48000 | 19 | 0.0082958 | 1 | 438.65 |

Bu son stres 80–260 ms hedefinin dışındadır; kesintisiz konuşma kanıtı olarak sunulmaz.

Capture mute/unmute ayrıca peak=0,3/197 Hz ve 0,64–0,896 s mute aralığıyla ölçüldü:

| Paket | Giriş Hz | Mute maxStep | Unmute maxStep |
|---|---|---|---|
| v71 | 44100 | 0.0083286 | 0.0113619 |
| v71 | 48000 | 0.0086173 | 0.0113458 |
| v72 | 44100 | 0.0083198 | 0.0113475 |
| v72 | 48000 | 0.0086173 | 0.0113458 |

### 5.4 Clock drift ve işlem bütçesi

| ppm | v71 late/PLC/stop | v72 late/PLC/stop | v72 min kuyruk frame | v72 ratio min…max | 128-block max Δratio ppm |
|---|---|---|---|---|---|
| -1000 | 276/132960/1 | 0/0/0 | 2 | 0.9990021…1.0002717 | 1.903 |
| -500 | 0/0/0 | 0/0/0 | 2 | 0.9994111…1.0005110 | 1.903 |
| -100 | 0/0/0 | 0/0/0 | 2 | 0.9998466…1.0007122 | 1.903 |
| 100 | 0/0/0 | 0/0/0 | 3 | 0.9999051…1.0008032 | 1.780 |
| 500 | 0/0/0 | 0/0/0 | 3 | 0.9999051…1.0009437 | 1.780 |
| 1000 | 0/0/0 | 0/0/0 | 4 | 0.9999071…1.0010000 | 1.780 |

Tüm altı aday satırında late/PLC/starvation=0; kuyruk en az 2 paket kaldı. Integral bir clock estimator’ın bütün sahadaki ağ davranışlarını çözdüğü iddia edilmez. PI parametreleri jitter/loss ve mevcut tüm regresyonlarla birlikte sınandı.

| DSP | Hz | v71 P99 ms | v72 P99 ms | v72 max ms | Quantum bütçesi ms |
|---|---|---|---|---|---|
| player | 8000 | 0.1867 | 0.1515 | 0.3123 | 16.000 |
| player | 16000 | 0.0727 | 0.1284 | 0.2678 | 8.000 |
| player | 44100 | 0.0351 | 0.0334 | 0.8507 | 2.902 |
| player | 48000 | 0.0526 | 0.0600 | 0.5738 | 2.667 |
| capture | 44100 | 0.1038 | 0.1542 | 0.8270 | 2.902 |
| capture | 48000 | 0.1076 | 0.1254 | 1.3622 | 2.667 |

CPU probu bu Windows/Node makinesinde trusted kaynak, 128 örnek/quantum, 200 warm-up + 2000 ölçüm yapar. Tablolar constructor/table hazırlığını ve gerçek browser audio thread/OS yükünü içermez. Desktop ölçümünde quantum bütçesi aşılmadı; düşük güçlü telefon için cihaz testi yine gerekir.

## 6. Transport ve ses motoru sürekliliği

Bu aday server/shim protokolünü değiştirmez: 24 kHz mono PCM16, 480 örnek, 12+960=972 bayt; source/mediaEpoch/seq sözleşmesi korunur. Native WS, HTTP ve şifreli MQTT frame eşliği, duplicate seq tekilleştirme, Blob generation, stop/resume bariyerleri ve General/alt oda controller mirası mevcut V53…V71 testleriyle geçti. Son CLI bu kaynakları gerçekten çalıştırdı; bu bölüm yalnız “fonksiyon adı var” kontrolü değildir.

Aynı source/media epoch ile tekrar gelen trusted snapshot applyRxAudioState’te idempotent reddedilir; sırf transport ACK’si yüzünden yeni media reset’i oluşturulmaz. Gerçek source/epoch değişimi, stop ve farklı odaya connect eski sesi bilerek sıfırlar. Reset rampası click’i sınırlar; yeniden prebuffer gecikmesi hâlâ vardır. Network reconnect’inin yeni socket’le baştan bağlanması ile aynı shim içindeki atomik native promotion birbirine eşit sayılmadı.

ADIM-3.V59: 300 gerçek WS listener; 270 sağlıklı hedefe 32400/32400 frame, bozuk=0. Slow queue drop=1500, hard isolation=3. Local fan-out p50/p95/p99/max=13.3/25.54/36.18/43.99 ms; event-loop P99=25.07 ms. Bu, 300 fiziksel mobil cihaz/300 HTTP+MQTT saha testi veya mikrofon-hoparlör toplam gecikmesi değildir.

### 6.1 Çıkış headroom’u

Default volume %120, maksimum %200; guide gain %60…%180. Player ceiling ±0,99 sonrasında +1,5 dB presence ve volume gelir, ardından WaveShaper vardır. Dolayısıyla “player peak<1” olması gain sonrasında hiç nonlinear işleme girilmediği anlamına gelmez.

| Volume | PCM peak | Pre-shaper peak | Statik çıkış peak | Statik THD+N dB |
|---|---|---|---|---|
| 1.2 | 0.2 | 0.2852 | 0.2852 | <−150 (nümerik taban) |
| 1.2 | 0.8 | 1.1410 | 0.9563 | -23.46 |
| 1.2 | 0.98 | 1.3977 | 0.9563 | -16.48 |
| 2 | 0.2 | 0.4754 | 0.4754 | <−150 (nümerik taban) |
| 2 | 0.8 | 1.9016 | 0.9563 | -13.04 |
| 2 | 0.98 | 2.3295 | 0.9563 | -10.55 |

Bu değerler gerçek createTransparentSoftClipperCurve örneklerinden lineer lookup edilen **statik eğri modelidir**; browser’ın 4x oversampling filtresi render edilmedi. Örneğin güçlü 3 kHz/0,8 peak PCM, default %120’de nonlinear bölgeye girer. Tavan korunur fakat ses distorsiyonsuz değildir. Dinleyici volume’unu yükseltmek kaynağın SNR’ını iyileştirmez; mikrofon/ADC’de zaten kırpılmış sesi son limiter kurtaramaz. Bu tasarlanmış overload davranışı ayrı bir sıfır-distortion iddiasıyla kapatılmadı.

## 7. Doğrulama, kalan saha sınırları ve dosya bütünlüğü

Çalıştırılan komutlar:

```text
node scripts/verify-system.js
# Değiştirilmemiş v71: 60/60 PASS, exit 0

node --require <TEMP>/rys-v72-preload.cjs scripts/verify-system.js
# Final rapor diff'i bellekte: 62/62 PASS, exit 0

git apply --check --ignore-space-change -
# Asıl v71 ağacında: exit 0

git apply --reverse --check --ignore-space-change -
# v72 uygulanmış bağımsız TEMP Git kopyasında: exit 0
```

Preload yalnız source reads/CommonJS compile ve aday node --check girdisini değiştirir; gerçek CLI, HTTP/WS sunucusu ve testler çalışır. Capture ES module sözdizimi kontrolü stdin’de --input-type=module kullanır. Verifier’ın raporu kaynak/test cevabı gibi okuması engellidir. Testlerde DSP replacement/mock yoktur; browser node kabuğu ve sanal ağ saatleri açıklanan modellerdir.

Yeni ADIM-5.V72.CAPTURE ve ADIM-5.V72.PLAYER iki ek PASS kaydıdır. Eski 60 sonuç korunur; yalnız yeni cache/worklet URL beklentileri 72’ye güncellendi. Eski stationary-tone regressyonu da korunur. Her yeni ana kriter v71 ölçümünde başarısızdır: −58 dB FIR artığı; 0,126 uzun ses gain’i; 132.960 kayıpsız drift PLC örneği; 0,145227 reset step’i; −26,49 dB ASRC artığı. Böylece yeni ölçümler mevcut suite’in kaçırdığı durumları ayırır.

Final adayda **62 PASS / 0 FAIL, exit 0**; preload ve bağımsız TEMP repo temizlendi. İleri check, TEMP apply, ters check exit 0; uygulanan 12 hedefin yalnız CRLF→LF normalize hash’leri bellekte sınanan adayla **12/12** eşleşti. Asıl uygulama/test dosyaları hiçbir aşamada candidate ile kalıcı olarak değiştirilmedi; runtime her CLI finally bloğunda başlangıç raw byte’larına döndürüldü ve son SHA/Buffer eşliği kontrol edildi.

Kalan doğrulama sınırları:

- Farklı telefon/kulaklıkta AEC/AGC/NS ve OS ekran kilidi/arama davranışı gerçek cihazla ölçülmedi.
- Tek mikrofon ve enerji gate’i aynı banttaki yakındaki farklı konuşmacıyı güvenilir biçimde ayıramaz; cross-device speaker echo için bilinen referans olmadan %100 iptal iddiası yoktur.
- SNR altında kalan prefix, ani >buffer network gecikmesi ve 60 ms üzeri kayıp için sıfır hece kaybı onayı verilmedi. Aday bunları “sıfır hata” diye etiketlemiyor.
- Sinüs / zarf / yapay frikatif sonuçları insan değerlendirmesi, STOI/PESQ veya Arapça/Türkçe corpus intelligibility skoru yerine geçmez.
- Yeni 32-tap ASRC ve gate noise-freeze politikası cihaz ve gerçek kalabalık kayıtlarıyla saha kabulünden geçmelidir. Kalibrasyondaki full gain bilinçli, UI’da bildirilen davranış değişikliğidir.

Seçilmiş başlangıç = son raw SHA-256 değerleri (rapor hariç tüm mevcut takipli 61 dosya ayrıca eşleşir):

| Dosya | Başlangıç = son raw SHA-256 |
|---|---|
| public/pcm-capture-worklet.js | 30340ea62d03b35c3239220460cb48176d1005fb18efbea05c4c06d8d6e6911a |
| public/pcm-player-worklet.js | 062a66aa91bc775bd94b3dfb231243cd6b6e4ff5623893100a79512e0a629af7 |
| public/rehber.html | 1339b29b98a0c5dd63d9eaab7fcecaf6bc21e0679a1c14b8e125ac0e74e41c3d |
| public/dinle.html | cc7af976d628804675f015bc834b3b094325f15080372733e39068d572bba27c |
| public/vercel-ws-shim.js | 2946aca9501946bfe0751c7cb0a9623a0d09ebf81980b8d207a8788e691aadfa |
| public/sw.js | 58e27fa11b1f3d8c80ba89f94f846eff3933b6490aba787a07675a59dac3b35e |
| scripts/verify-system.js | 7800b23776df907540c8c5850a5b333b76440025440e2ce898c46cf7a84a5691 |
| server.js | 381a56e29bd2ea85e37cb8bb7130729cf0e51c79b3de1f129ddd2edcc9bd847f |
| data/runtime.json | 087e97acb7b29e389c4ac4da3014ce2aee8de575cd9d602c3af2eae3e11a32c4 |

## 8. Uygulanmış v72 unified diff

Çalışma ağacına uygulanmış ve `node scripts/verify-system.js` ile **62/62 PASS, exit 0** olarak doğrulanmıştır (`git apply --reverse --check --ignore-space-change -` → `exit 0`). Hedefler: iki worklet, scripts/verify-system.js, sw.js ve sekiz HTML (12 dosya). server.js, vercel-ws-shim.js ve runtime patch’e dahil değildir. SW/shim URL’leri v72; iki değişen worklet de v=72-audio. Diff kimliği: **42633 UTF-8/LF bayt**, SHA-256 **c0c2c93d5403e7e08ee8ed0f3acc4f4cbfef35c99525f96811cd13daca17f143**; fence ve rapor açıklamaları hash kapsamı dışındadır.


```diff
diff --git a/public/ani-kitabi.html b/public/ani-kitabi.html
--- a/public/ani-kitabi.html
+++ b/public/ani-kitabi.html
@@ -7,7 +7,7 @@
   <meta name="description" content="Rıdvan Yılmaz Turizm Umre ve Siyer yolculuğunuzun baskıya hazır A4 manevi hatıra kitapçığı ve imzalı Umre Ziyaret Beratı." />
   <link rel="icon" type="image/svg+xml" href="/icons/icon-512.svg" />
   <link rel="stylesheet" href="/css/style.css?v=19" />
-  <script src="/vercel-ws-shim.js?v=71"></script>
+  <script src="/vercel-ws-shim.js?v=72"></script>
   <style>
     body {
       background: #e9e2d5;
diff --git a/public/dinle.html b/public/dinle.html
--- a/public/dinle.html
+++ b/public/dinle.html
@@ -16,7 +16,7 @@
   <link rel="canonical" href="https://ses.ridvanyilmazturizm.com/dinle" />
   <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
   <link rel="stylesheet" href="/css/style.css?v=19" />
-  <script src="/vercel-ws-shim.js?v=71"></script>
+  <script src="/vercel-ws-shim.js?v=72"></script>
   <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
   <script src="/js/umrah-steps-map.js?v=47"></script>
   <style>
@@ -1727,7 +1727,7 @@
       rxPlayerWorkletLoading=true;window.__ryRxAudioStatus='loading';
       state.timer=setTimeout(()=>failed('load-timeout'),3000);
       let loading;
-      try{loading=ctx.audioWorklet.addModule('/pcm-player-worklet.js?v=61-audio');}
+      try{loading=ctx.audioWorklet.addModule('/pcm-player-worklet.js?v=72-audio');}
       catch(error){failed('load-error');return;}
       Promise.resolve(loading)
         .then(()=>{
@@ -2688,7 +2688,7 @@
     if ('serviceWorker' in navigator) {
       window.addEventListener('load', () => {
         // PATCH: sw-register-v53
-        navigator.serviceWorker.register('/sw.js?v=71').catch(() => {});
+        navigator.serviceWorker.register('/sw.js?v=72').catch(() => {});
       });
     }
 
diff --git a/public/index.html b/public/index.html
--- a/public/index.html
+++ b/public/index.html
@@ -82,7 +82,7 @@
   <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png?v=19" />
   <title>Rıdvan Yılmaz Turizm | RıdvanSes — Dijital Sesli Rehberlik & Kafile Sistemi</title>
   <link rel="stylesheet" href="/css/style.css?v=19" />
-  <script src="/vercel-ws-shim.js?v=71"></script>
+  <script src="/vercel-ws-shim.js?v=72"></script>
   <style>
     .hero {
       padding: 64px 0 76px;
diff --git a/public/login.html b/public/login.html
--- a/public/login.html
+++ b/public/login.html
@@ -10,7 +10,7 @@
   <meta name="robots" content="noindex, nofollow" />
   <link rel="canonical" href="https://ses.ridvanyilmazturizm.com/login" />
   <link rel="stylesheet" href="/css/style.css?v=19" />
-  <script src="/vercel-ws-shim.js?v=71"></script>
+  <script src="/vercel-ws-shim.js?v=72"></script>
   <style>
     .login-shell {
       max-width: 460px;
diff --git a/public/panel.html b/public/panel.html
--- a/public/panel.html
+++ b/public/panel.html
@@ -29,7 +29,7 @@
       window.location.href = '/login?next=/panel';
     }
   </script>
-  <script src="/vercel-ws-shim.js?v=71"></script>
+  <script src="/vercel-ws-shim.js?v=72"></script>
   <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
   <script src="/js/umrah-steps-map.js?v=47"></script>
   <style>
diff --git a/public/pcm-capture-worklet.js b/public/pcm-capture-worklet.js
--- a/public/pcm-capture-worklet.js
+++ b/public/pcm-capture-worklet.js
@@ -3,8 +3,8 @@
 // PATCH: capture-v51
 // PATCH: capture-v50
 // RıdvanSes v50 — Gerçek Zamanlı AudioWorklet Yakalama Motoru
-// 193-Tap 256-Faz Blackman Windowed-Sinc Polyphase Anti-Aliasing FIR (RysFir24 — >-118 dB Stopband)
-// + 400ms Kalibrasyon ve 4s Rolling Minima Tabanlı 4-Bant Yakın-Alan Ses Kilidi (RysNearExpander)
+// 193-tap Blackman FIR; 256 linearly interpolated phase intervals + endpoint.
+// + 400ms unity-gain calibration and speech-frozen 4-band rolling-minima expander.
 // + Worklet & ScriptProcessor Ortak 480-Örnek (20 ms @ 24 kHz) Çekirdeği (RysCaptureKernel)
 
 class RysFir24 {
@@ -14,9 +14,9 @@
     this.t = 0;
     this.count = 0;
     this.r = new Float32Array(512);
-    this.table = new Float32Array(256 * 193);
+    this.table = new Float32Array(257 * 193);
     const fc = Math.min(10200 / rate, 0.45);
-    for (let p = 0; p < 256; p++) {
+    for (let p = 0; p <= 256; p++) {
       let sum = 0;
       for (let k = 0; k < 193; k++) {
         const d = k - 96 + p / 256;
@@ -37,11 +37,15 @@
     while (Math.floor(this.t / 24000) < this.count) {
       const pos = this.t / 24000;
       const b = Math.floor(pos);
-      const p = Math.min(255, Math.floor((pos - b) * 256));
+      const phase = (pos - b) * 256;
+      const p = Math.min(255, Math.floor(phase));
+      const mix = phase - p;
       let y = 0;
       for (let k = 0; k < 193; k++) {
         if (b - k >= 0) {
-          y += this.r[(b - k) & 511] * this.table[p * 193 + k];
+          const h = this.table[p * 193 + k];
+          const next = this.table[(p + 1) * 193 + k];
+          y += this.r[(b - k) & 511] * (h + (next - h) * mix);
         }
       }
       emit(y);
@@ -68,8 +72,9 @@
     this.age = 0;
     this.look = new Float32Array(240);
     this.li = 0;
-    this.g = 0.126;
+    this.g = 1;
     this.hold = 0;
+    this.toneEnergy=0;this.toneCorr=0;this.toneError=0;this.toneX1=0;this.toneX2=0;
     this.ready = false;
   }
 
@@ -92,6 +97,14 @@
     const x = 0.9793 * (this.hpY + raw - this.hpX);
     this.hpX = raw;
     this.hpY = Math.abs(x)<1e-20?0:x;
+    // A stationary sinusoid is predictable by a second-order recurrence.
+    // Do not freeze its noise estimate as if it were sustained harmonic speech.
+    this.toneEnergy+=.001*(x*x-this.toneEnergy);
+    this.toneCorr+=.001*(x*this.toneX1-this.toneCorr);
+    const cos=Math.max(-1,Math.min(1,this.toneCorr/(this.toneEnergy+1e-20)));
+    const residual=x-2*cos*this.toneX1+this.toneX2;
+    this.toneError+=.001*(residual*residual-this.toneError);
+    this.toneX2=this.toneX1;this.toneX1=x;
     for (let k = 0; k < 3; k++) {
       this.lp[k] += this.a[k] * (x - this.lp[k]);
     }
@@ -106,6 +119,9 @@
     if (++this.count === 240) {
       this.count = 0;
       this.age += 0.01;
+      // A speech interval must not become the next noise floor when minima rotate.
+      const open=4.5+(this.reject-.5)*4;
+      const speechLikely=this.ready&&this.hold>0&&this.toneError>this.toneEnergy*.0005;
       for (let k = 0; k < 4; k++) {
         this.cur[k] = Math.min(this.cur[k], this.e[k]);
         let c = this.cur[k];
@@ -114,7 +130,7 @@
         }
         const t = this.age < 0.4 ? this.e[k] : Math.max(1e-10, c * 1.4);
         const alpha = this.age < 0.4 ? 0.25 : t < this.n[k] ? 0.08 : 0.02;
-        this.n[k] += alpha * (t - this.n[k]); // independent of gate/hold
+        if(!speechLikely||t<this.n[k])this.n[k] += alpha * (t - this.n[k]);
       }
       if (++this.hops === 50) {
         this.hops = 0;
@@ -128,15 +144,15 @@
       const e = this.e[1] + 1.3 * this.e[2] + 0.35 * this.e[3];
       const n = this.n[1] + 1.3 * this.n[2] + 0.35 * this.n[3] + 1e-12;
       const snr = 10 * Math.log10((e + 1e-12) / n);
-      const open = 7.5 + (this.reject - 0.5) * 4;
+      // 2 dB hysteresis stays above the measured stationary noise excess.
       const rumble = (this.e[1] + this.e[2]) / (this.e[0] + 1e-12) > 0.8;
-      if (this.ready && rumble && snr > (this.hold ? open - 4 : open)) {
+      if (this.ready && rumble && snr > (this.hold ? open - 2 : open)) {
         this.hold = 24;
       } else if (this.hold) {
         this.hold--;
       }
     }
-    const want = this.ready && (this.hold || this.continuousSpeech) ? 1 : 0.126;
+    const want = !this.ready || this.hold || this.continuousSpeech ? 1 : 0.126;
     this.g += (want - this.g) * (1 - Math.exp(-1 / (24000 * (want > this.g ? 0.003 : 0.12))));
     const d = this.look[this.li];
     this.look[this.li] = x;
@@ -167,7 +183,7 @@
     this.accept = (s) => {
       const v = this.gate.step(s);
       this.mg += ((this.muted ? 0 : 1) - this.mg) * 0.0083;
-      const active=this.gate.ready&&(this.gate.hold>0||this.gate.continuousSpeech);
+      const active=!this.gate.ready||this.gate.hold>0||this.gate.continuousSpeech;
       this.quietSamples=active?0:this.quietSamples+1;
       const want=(!this.comfortFade||active||this.quietSamples<=14400)?1:0;
       if(want!==this.comfortTarget){
diff --git a/public/pcm-player-worklet.js b/public/pcm-player-worklet.js
--- a/public/pcm-player-worklet.js
+++ b/public/pcm-player-worklet.js
@@ -2,7 +2,7 @@
 // PATCH: player-v52
 // PATCH: player-v51
 // PATCH: player-v50
-// RıdvanSes v50 — Sıra Numarası (Seq) Tabanlı Jitter Tamponu, 48..400 Lag Pitch-PLC ve ±1000 ppm Hermite ASRC Oynatıcı
+// RıdvanSes v72 — Seq jitter buffer, pitch PLC, PI clock servo and band-limited fractional ASRC.
 const RYS_MOD = 0x80000000;
 function rysDiff(a, b) {
   return ((a - b + 0x40000000) & 0x7fffffff) - 0x40000000;
@@ -95,11 +95,29 @@
   }
 }
 
+// 32-tap fractional-delay FIR, 256 interpolated phase intervals.
+// The separate 193-tap input FIR still supplies the low-rate anti-alias guard.
+function rysFractionalTable(){
+  const table=new Float32Array(257*32);
+  for(let p=0;p<=256;p++){
+    let sum=0;
+    for(let k=0;k<32;k++){
+      const d=k-15-p/256;
+      const w=.42-.5*Math.cos(2*Math.PI*k/31)+.08*Math.cos(4*Math.PI*k/31);
+      const h=(Math.abs(d)<1e-10?1:Math.sin(Math.PI*d)/(Math.PI*d))*w;
+      table[p*32+k]=h;sum+=h;
+    }
+    for(let k=0;k<32;k++)table[p*32+k]/=sum;
+  }
+  return table;
+}
+
 class RysPcmPlayerProcessor extends AudioWorkletProcessor {
   constructor() {
     super();
     this.rate = typeof sampleRate === 'number' && sampleRate > 0 ? sampleRate : 48000;
     this.hb = 0;
+    this.resampleTable = rysFractionalTable();
     this.target = 0.120;
     this.jitter = 0;
     this.lastArrival = null;
@@ -122,6 +140,7 @@
 
   _reset() {
     this.rxFir=this.rate<24000?new RysOutputFir(this.rate):null;
+    this.sourceFade = 0;
     this.plc = new RysPitchPlc();
     this.plcFrame = new Float32Array(480);
     this.recoveryFrame=new Float32Array(480);this.continuation=new Float32Array(480);
@@ -136,11 +155,10 @@
     this.missing = 0;
     this.wait = 0;
     this.phase = 0;
+    this.resampleRing = new Float32Array(32);
+    this.resamplePos = 0;
     this.ratio = 1;
-    this.y0 = 0;
-    this.y1 = 0;
-    this.y2 = 0;
-    this.y3 = 0;
+    this.driftIntegral = 0;
     this.primed = false;
     this.resetFrom = this.lastOut || 0;
     this.resetFade = 0;
@@ -229,7 +247,12 @@
 
   _pull() {
     if (this.fi >= 480) this._nextFrame();
-    const x=this.frame[this.fi++];
+    let x=this.frame[this.fi++];
+    // Ramp every fresh source before FIR/ASRC history; the low-rate FIR
+    // delays an abrupt step past the output fade (4 ms group delay).
+    if(this.sourceFade<120){
+      x*=.5-.5*Math.cos(Math.PI*(++this.sourceFade)/120);
+    }
     return this.rxFir?this.rxFir.step(x):x;
   }
 
@@ -283,27 +306,31 @@
     }else this.catchupAge=0;
     const queued = this.q.size * 480 + (480 - this.fi);
     const error = queued / 24000 - this.target;
-    const wanted = 1 + Math.max(-0.001, Math.min(0.001, error * 0.01));
+    // PI removes static clock error without consuming the jitter safety margin.
+    const proportional = error * .04;
+    const control = proportional + this.driftIntegral;
+    if(this.missing===0&&this.q.size>0&&
+      (Math.abs(control)<.001||error*control<0)){
+      this.driftIntegral=Math.max(-.001,Math.min(.001,
+        this.driftIntegral+error*(n/this.rate)*.0004));
+    }
+    const wanted = 1 + Math.max(-0.001, Math.min(0.001, proportional + this.driftIntegral));
     this.ratio += (wanted - this.ratio) * Math.min(1, n / (this.rate * 2));
     const step = (24000 / this.rate) * this.ratio;
     if (!this.primed) {
-      this.y0 = 0;
-      this.y1 = this._pull();
-      this.y2 = this._pull();
-      this.y3 = this._pull();
+      this.resampleRing.fill(0);this.resamplePos=0;
+      // Causal 17-source-sample delay: do not prefetch a future packet early.
       this.phase = 0;
       this.primed = true;
     }
     for (let i = 0; i < n; i++) {
       const t = this.phase;
-      const a = this.y0;
-      const b = this.y1;
-      const c = this.y2;
-      const d = this.y3;
-      const c1 = 0.5 * (c - a);
-      const c2 = a - 2.5 * b + 2 * c - 0.5 * d;
-      const c3 = 0.5 * (d - a) + 1.5 * (b - c);
-      let y = ((c3 * t + c2) * t + c1) * t + b;
+      const phase=t*256,row=Math.min(255,Math.floor(phase)),mix=phase-row;
+      let y=0;
+      for(let k=0;k<32;k++){
+        const h=this.resampleTable[row*32+k],next=this.resampleTable[(row+1)*32+k];
+        y+=this.resampleRing[(this.resamplePos+k)&31]*(h+(next-h)*mix);
+      }
       if (this.fade < this.fadeN) {
         const w = 0.5 - 0.5 * Math.cos((Math.PI * this.fade) / (this.fadeN - 1));
         y = this.blend[this.fade] * (1 - w) + y * w;
@@ -317,10 +344,8 @@
       this.phase += step;
       while (this.phase >= 1) {
         this.phase -= 1;
-        this.y0 = this.y1;
-        this.y1 = this.y2;
-        this.y2 = this.y3;
-        this.y3 = this._pull();
+        this.resampleRing[this.resamplePos]=this._pull();
+        this.resamplePos=(this.resamplePos+1)&31;
       }
     }
     // 300 ms'den uzun eksik ses: ileride gerçek ses gelince yeniden ön tamponla.
@@ -331,7 +356,7 @@
       this.primed = false;
       this.fi = 480;
       this.haveHistory = false;this.missing=0;this.pendingQueueBlend=false;this.catchupAge=0;this.catchupArmed=false;this.plc=new RysPitchPlc();
-      this.rxFir=this.rate<24000?new RysOutputFir(this.rate):null;
+      this.rxFir=this.rate<24000?new RysOutputFir(this.rate):null;this.sourceFade=0;
       this.resetFrom = this.lastOut;
       this.resetFade = 0;
     }
diff --git a/public/rehber.html b/public/rehber.html
--- a/public/rehber.html
+++ b/public/rehber.html
@@ -28,7 +28,7 @@
       window.location.href = '/login?next=/rehber';
     }
   </script>
-  <script src="/vercel-ws-shim.js?v=71"></script>
+  <script src="/vercel-ws-shim.js?v=72"></script>
   <script src="/js/umrah-steps-map.js?v=47"></script>
   <style>
     .console-wrap {
@@ -1297,7 +1297,7 @@
     function resetGuideVoiceLock(){
       syncGuideAudioProfile(true);
       const box=document.getElementById('voiceTestStatusBox');
-      if(box){box.style.display='block';box.textContent='Ortam yeniden ölçülüyor: ilk 400 ms konuşmadan bekleyin. Uzun okuma ve dip ses tercihleri korunur.';}
+      if(box){box.style.display='block';box.textContent='Ortam yeniden ölçülüyor: ilk 400 ms ses iletilir; mümkünse konuşmadan bekleyin. Uzun okuma ve dip ses tercihleri korunur.';}
     }
 
     function toggleGuideMicMute(forceState) {
@@ -1601,7 +1601,7 @@
         if (isGuideMicMuted) {
           label.textContent = '🔇 Mikrofon Geçici Sessizde (Özel Konuşma Modu)';
         } else if (!m.ready) {
-          label.textContent = '400 ms ortam ölçümü: konuşmadan bekleyin';
+          label.textContent = '400 ms ortam ölçümü; ses iletiliyor, kısa süre bekleyin';
         } else {
           const dbVal = rms > 0.0001 ? Math.max(-48, Math.min(0, Math.round(20 * Math.log10(rms)))) : -48;
           label.textContent =
@@ -1700,7 +1700,7 @@
         const zero=own(ctx.createGain());zero.gain.value=0;
         source.connect(highPass);highPass.connect(mudCut);mudCut.connect(presence);presence.connect(lowPass);lowPass.connect(gain);
         const onFrame=message=>{if(current())handleGuideMicFloatChunk(message);};
-        const url='/pcm-capture-worklet.js?v=60-audio';
+        const url='/pcm-capture-worklet.js?v=72-audio';
         const options=()=>({muted:isGuideMicMuted,reject:guideSideVoiceRejectLevel,
           continuousSpeech:guideContinuousSpeech,comfortFade:guideComfortFade});
         if(ctx.audioWorklet&&typeof AudioWorkletNode!=='undefined'){
diff --git a/public/rota.html b/public/rota.html
--- a/public/rota.html
+++ b/public/rota.html
@@ -9,7 +9,7 @@
   <link rel="icon" type="image/svg+xml" href="/icons/icon-512.svg" />
   <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
   <link rel="stylesheet" href="/css/style.css?v=19" />
-  <script src="/vercel-ws-shim.js?v=71"></script>
+  <script src="/vercel-ws-shim.js?v=72"></script>
   <style>
     .rota-hero-strip {
       background:
diff --git a/public/sw.js b/public/sw.js
--- a/public/sw.js
+++ b/public/sw.js
@@ -1,17 +1,17 @@
 // PATCH: sw-v53
 // PATCH: sw-v53
 // PATCH: sw-v53
-const CACHE_NAME = 'ridvanses-pwa-v71';
+const CACHE_NAME = 'ridvanses-pwa-v72';
 const ASSETS_TO_CACHE = [
   '/',
   '/dinle',
   '/rota',
   '/ani-kitabi',
   '/css/style.css',
-  '/vercel-ws-shim.js?v=71',
+  '/vercel-ws-shim.js?v=72',
   '/js/umrah-steps-map.js',
-  '/pcm-capture-worklet.js?v=60-audio',
-  '/pcm-player-worklet.js?v=61-audio',
+  '/pcm-capture-worklet.js?v=72-audio',
+  '/pcm-player-worklet.js?v=72-audio',
   '/manifest.json',
   '/icons/icon-512.png',
   '/icons/icon-192.png',
diff --git a/public/yaka-karti.html b/public/yaka-karti.html
--- a/public/yaka-karti.html
+++ b/public/yaka-karti.html
@@ -8,7 +8,7 @@
   <meta name="robots" content="noindex, nofollow" />
   <link rel="canonical" href="https://ses.ridvanyilmazturizm.com/yaka-karti" />
   <link rel="stylesheet" href="/css/style.css?v=19" />
-  <script src="/vercel-ws-shim.js?v=71"></script>
+  <script src="/vercel-ws-shim.js?v=72"></script>
   <style>
     .print-toolbar {
       background: linear-gradient(155deg, #06231B 0%, #093529 100%);
diff --git a/scripts/verify-system.js b/scripts/verify-system.js
--- a/scripts/verify-system.js
+++ b/scripts/verify-system.js
@@ -1567,9 +1567,9 @@
     if(mode!=='join')assert.equal(body.joinContext??null,null);
     else{assert.equal(body.subscriptionContext.pin,'1453');assert.equal(body.subscriptionContext.deviceId,'device');}
   }
-  const sw=read('public/sw.js');assert(sw.includes("ridvanses-pwa-v71"));assert(sw.includes('/vercel-ws-shim.js?v=71'));
+  const sw=read('public/sw.js');assert(sw.includes("ridvanses-pwa-v72"));assert(sw.includes('/vercel-ws-shim.js?v=72'));
   for(const f of fs.readdirSync(path.join(root,'public')).filter(f=>f.endsWith('.html'))){
-    for(const m of read('public/'+f).matchAll(/vercel-ws-shim\.js\?v=(\d+)/g))assert.equal(m[1],'71',f+' stale shim');
+    for(const m of read('public/'+f).matchAll(/vercel-ws-shim\.js\?v=(\d+)/g))assert.equal(m[1],'72',f+' stale shim');
   }
   if(typeof recordResult==='function')recordResult('ADIM-5.V54','Ek kaynak testleri: profil/taşma, aktif trim/starvation/wrap, tek failback ACK/sıra, HTTP kapsamı ve cache sürümü',true);
   console.log('V54 PASS: 3 sample rates; DSP/profile bounds; PLC restart/wrap; single join/ACK for 3 modes; pending/coalescer order; POST context; all shim URLs');
@@ -2352,8 +2352,8 @@
   rateBox.Date.now=()=>60000;limiter({...req,ip:'fresh'},response,()=>admitted++);assert.equal(admitted,2);
   assert(server.includes('rysSendAudio(peer.ws,fallbackPayload,false)'));
   assert(!server.includes('fallbackJsonStr'));
-  assert(read('public/sw.js').includes('pcm-player-worklet.js?v=61-audio'));
-  assert(read('public/sw.js').includes('pcm-capture-worklet.js?v=60-audio'));
+  assert(read('public/sw.js').includes('pcm-player-worklet.js?v=72-audio'));
+  assert(read('public/sw.js').includes('pcm-capture-worklet.js?v=72-audio'));
   recordResult('ADIM-5.V59','8/16/44.1/48k DSP; FIR rejection; DC/limiter/partition; PLC/jitter/catchup; mic mute/retry; gain ramps; bounded CGNAT buckets',true);
   console.log('V59 DSP METRICS '+JSON.stringify({rates:dsp,fixture200HzMaxStep:+maxStep.toFixed(6),concealedSamples:p.stats.concealed}));
   console.log('V59 UNIT PASS: numerical model checks; no physical headset or lock-screen guarantee');
@@ -2534,9 +2534,9 @@
     p.rxFir.r.fill(1);p.playing=true;p.expected=0;p.missing=15;
     p.process([],[[new Float32Array(128)]]);assert(!p.playing);assert(p.rxFir.r.every(x=>x===0));
   }
-  const sw=read('public/sw.js');assert(sw.includes('ridvanses-pwa-v71'));
-  for(const asset of ['pcm-player-worklet.js?v=61-audio','pcm-capture-worklet.js?v=60-audio'])assert(sw.includes(asset));
-  assert(guide.includes('pcm-capture-worklet.js?v=60-audio'));assert(read('public/dinle.html').includes('pcm-player-worklet.js?v=61-audio'));
+  const sw=read('public/sw.js');assert(sw.includes('ridvanses-pwa-v72'));
+  for(const asset of ['pcm-player-worklet.js?v=72-audio','pcm-capture-worklet.js?v=72-audio'])assert(sw.includes(asset));
+  assert(guide.includes('pcm-capture-worklet.js?v=72-audio'));assert(read('public/dinle.html').includes('pcm-player-worklet.js?v=72-audio'));
   console.log('V60 UNIT METRICS '+JSON.stringify({lifecycleChecks:checks,alias}));
   recordResult('ADIM-5.V60','Low-rate player anti-alias; source/reset/starvation; guide permission/module/preview/heal races; explicit capture shutdown; cache60',true);
   console.log('V60 UNIT PASS');
@@ -2744,8 +2744,8 @@
     assert(published.filter(m=>['room-state','stream-state'].includes(m.type)).every(m=>(m.audioSourceId||m.room?.audioSourceId)==='stable-page'));
     checks.push('MQTT-room-and-stream-source-parity');
   }
-  const sw=read('public/sw.js');assert(sw.includes('ridvanses-pwa-v71'));assert(sw.includes('pcm-player-worklet.js?v=61-audio'));
-  assert(sw.includes('pcm-capture-worklet.js?v=60-audio'));
+  const sw=read('public/sw.js');assert(sw.includes('ridvanses-pwa-v72'));assert(sw.includes('pcm-player-worklet.js?v=72-audio'));
+  assert(sw.includes('pcm-capture-worklet.js?v=72-audio'));
   console.log('V61 UNIT METRICS '+JSON.stringify({checks,reset,capture24kFrames:frames.length}));
   recordResult('ADIM-5.V61','Socket/Blob/retry/source ownership; 5-rate reset/starvation de-click; 24k capture; source schema/digest/MQTT; cache61',true);
   console.log('V61 UNIT PASS');
@@ -2983,7 +2983,7 @@
     }
     checks.push('failed-poll-retry-keeps-latest-stop-and-resume-only');
   }
-  const sw=read('public/sw.js');assert(sw.includes('ridvanses-pwa-v71'));assert(sw.includes('pcm-player-worklet.js?v=61-audio'));assert(sw.includes('pcm-capture-worklet.js?v=60-audio'));
+  const sw=read('public/sw.js');assert(sw.includes('ridvanses-pwa-v72'));assert(sw.includes('pcm-player-worklet.js?v=72-audio'));assert(sw.includes('pcm-capture-worklet.js?v=72-audio'));
   console.log('V62 UNIT METRICS '+JSON.stringify({checks,coalescerPostStopAudio:0,receiverPostStopFrames:0}));
   recordResult('ADIM-5.V62','Stop/mode/source barriers across coalescer, relay, receiver, demo lifecycle and server; idle reconnect; cache62',true);
   console.log('V62 UNIT PASS');
@@ -3168,7 +3168,7 @@
     const epoch=h.g.rxAudioDeliveryEpoch;s.onmessage({data:JSON.stringify({type:'room-state',room:{...state(1,true),audioStateKnown:true}})});
     assert(h.player.q.has(1001));assert.equal(h.g.rxAudioDeliveryEpoch,epoch);checks.push('unknown-to-known-live-snapshot-preserves-current-pcm');
   }
-  const sw=read('public/sw.js');assert(sw.includes('ridvanses-pwa-v71'));assert(sw.includes('pcm-player-worklet.js?v=61-audio'));assert(sw.includes('pcm-capture-worklet.js?v=60-audio'));
+  const sw=read('public/sw.js');assert(sw.includes('ridvanses-pwa-v72'));assert(sw.includes('pcm-player-worklet.js?v=72-audio'));assert(sw.includes('pcm-capture-worklet.js?v=72-audio'));
   console.log('V63 UNIT METRICS '+JSON.stringify({checks,snapshotRecovered:true,staleStateResets:0,renewalFirstPcmPreserved:true}));
   recordResult('ADIM-5.V63','Ordered state/snapshot recovery; terminal disconnect; source reset; inheritance; MQTT parity; renewal state-before-PCM; cache63',true);
   console.log('V63 UNIT PASS');
@@ -3355,7 +3355,7 @@
     deliver(state(12,12,true,'mic'));assert.equal(stopped,1);assert.equal(h.g.activeGuideDemoSources.size,0);
     checks.push('demo-topic-keeps-current-note-and-mode-change-stops-it');
   }
-  const sw=read('public/sw.js');assert(sw.includes('ridvanses-pwa-v71'));assert(sw.includes('pcm-player-worklet.js?v=61-audio'));assert(sw.includes('pcm-capture-worklet.js?v=60-audio'));
+  const sw=read('public/sw.js');assert(sw.includes('ridvanses-pwa-v72'));assert(sw.includes('pcm-player-worklet.js?v=72-audio'));assert(sw.includes('pcm-capture-worklet.js?v=72-audio'));
   console.log('V64 UNIT METRICS '+JSON.stringify({checks,postResumeOldFrames:0,capturedOldBatchFrames:0,currentPendingPreserved:true,topicTimelinePreserved:true}));
   recordResult('ADIM-5.V64','Media epoch across PCM/synth/coalescer/server/receiver; topic continuity; Blob fencing; stop-resume during relay-open; pending-media preservation; cache64',true);console.log('V64 UNIT PASS');
 }
@@ -3519,7 +3519,7 @@
     const good=member('rys56-good','c'.repeat(48));g.serveRysRelay(good,{auth:true,method:'POST',body:{requestSeq:1}},response(),'good',{type:'join',role:'guide'});assert.equal(good.lastSeen,35001);
     checks.push('auth-failure-retires-verified-privileged-capability-public-ID-cannot-disconnect-legacy-no-failed-lease-renewal');
   }
-  const sw=read('public/sw.js');assert(sw.includes('ridvanses-pwa-v71'));assert(sw.includes('pcm-player-worklet.js?v=61-audio'));assert(sw.includes('pcm-capture-worklet.js?v=60-audio'));
+  const sw=read('public/sw.js');assert(sw.includes('ridvanses-pwa-v72'));assert(sw.includes('pcm-player-worklet.js?v=72-audio'));assert(sw.includes('pcm-capture-worklet.js?v=72-audio'));
   console.log('V65 UNIT METRICS '+JSON.stringify({checks,unprimedFrames:0,retryFirstPcmPreserved:true,fullQueueStopDelivered:true,failedAuthLeaseExtensions:0}));
   recordResult('ADIM-5.V65','Controller readiness; retry control-first and latched full-queue stop; submitted-epoch ACK; auth-failure cleanup and lease/public-ID safety; cache65',true);console.log('V65 UNIT PASS');
 }
@@ -3693,8 +3693,8 @@
     h.s.close();assert(h.clients.every(c=>c.ended===1));assert.equal(h.received.length,0);
     checks.push('100-replacements-bounded-active-clients-invalidate-before-synchronous-end');
   }
-  const sw=fs.readFileSync(path.join(PUBLIC_DIR,'sw.js'),'utf8');assert(sw.includes('ridvanses-pwa-v71'));assert(sw.includes('vercel-ws-shim.js?v=71'));
-  assert(sw.includes('pcm-player-worklet.js?v=61-audio'));assert(sw.includes('pcm-capture-worklet.js?v=60-audio'));
+  const sw=fs.readFileSync(path.join(PUBLIC_DIR,'sw.js'),'utf8');assert(sw.includes('ridvanses-pwa-v72'));assert(sw.includes('vercel-ws-shim.js?v=72'));
+  assert(sw.includes('pcm-player-worklet.js?v=72-audio'));assert(sw.includes('pcm-capture-worklet.js?v=72-audio'));
   console.log('V66 UNIT METRICS '+JSON.stringify({checks,clientsAfterDelayedClose:0,staleDelivered:0,activeClientsMax:2,replacements:100}));
   recordResult('ADIM-5.V66','MQTT loader/client/suback/timer ownership across route, close and native takeover; bounded replacement; cache66',true);console.log('V66 UNIT PASS');
 }
@@ -3815,8 +3815,8 @@
     sockets.clear();const idle=member('idle-expired','json-expired');g.heartbeat();assert.equal(idle.ws.terminated,1);assert.equal(idle.currentRoom,null);
     checks.push('real-binary-and-JSON-ingress-reject-expired-credentials-idle-heartbeat-cleans-membership');
   }
-  const sw=fs.readFileSync(path.join(PUBLIC_DIR,'sw.js'),'utf8');assert(sw.includes('ridvanses-pwa-v71'));assert(sw.includes('vercel-ws-shim.js?v=71'));
-  assert(sw.includes('pcm-player-worklet.js?v=61-audio'));assert(sw.includes('pcm-capture-worklet.js?v=60-audio'));
+  const sw=fs.readFileSync(path.join(PUBLIC_DIR,'sw.js'),'utf8');assert(sw.includes('ridvanses-pwa-v72'));assert(sw.includes('vercel-ws-shim.js?v=72'));
+  assert(sw.includes('pcm-player-worklet.js?v=72-audio'));assert(sw.includes('pcm-capture-worklet.js?v=72-audio'));
   console.log('V67 UNIT METRICS '+JSON.stringify({checks,expiredGuidePresent:false,expiryGraceMs:0,revokedGuideTerminated:1,revokedAdminTerminated:1,healthyTerminated:0,publicFamilyTerminated:0,cancelledPrepare:true}));
   recordResult('ADIM-5.V67','Native live credential expiry/revoke, token rotation, pending handoff cleanup, public-family isolation and HTTP/static compatibility; cache67',true);console.log('V67 UNIT PASS');
 }
@@ -3975,8 +3975,8 @@
     assert.equal(h.room('siyer').audioSourceId,'page');assert.equal(h.room('siyer').audioMediaEpoch,10);assert.equal(h.room('siyer').isLive,true);
     checks.push('dedicated-guide-downgrade-restores-General-source-state-epoch-inheritance');
   }
-  const sw=fs.readFileSync(path.join(PUBLIC_DIR,'sw.js'),'utf8');assert(sw.includes('ridvanses-pwa-v71'));assert(sw.includes('vercel-ws-shim.js?v=71'));
-  assert(sw.includes('pcm-player-worklet.js?v=61-audio'));assert(sw.includes('pcm-capture-worklet.js?v=60-audio'));
+  const sw=fs.readFileSync(path.join(PUBLIC_DIR,'sw.js'),'utf8');assert(sw.includes('ridvanses-pwa-v72'));assert(sw.includes('vercel-ws-shim.js?v=72'));
+  assert(sw.includes('pcm-player-worklet.js?v=72-audio'));assert(sw.includes('pcm-capture-worklet.js?v=72-audio'));
   console.log('V68 UNIT METRICS '+JSON.stringify({checks,collisionCases,crossRoleGuideEvictions:0,downgradeOwner:null,sameRoleReconnect:true,terminalStop:true,coveredByGenel:true}));
   recordResult('ADIM-5.V68','Role-isolated device dedup; native/HTTP/legacy collisions; same-role reconnect; same-socket downgrade/owner release/terminal stop and General inheritance; cache68',true);console.log('V68 UNIT PASS');
 }
@@ -4156,8 +4156,8 @@
     assert.equal(h.room().activePublisherClientId,null);assert(h.room('target').clients.has('current'));
     checks.push('cross-tour-prior-guide-removal-does-not-suppress-target-tour-reconciliation');
   }
-  const sw=fs.readFileSync(path.join(PUBLIC_DIR,'sw.js'),'utf8');assert(sw.includes('ridvanses-pwa-v71'));assert(sw.includes('vercel-ws-shim.js?v=71'));
-  assert(sw.includes('pcm-player-worklet.js?v=61-audio'));assert(sw.includes('pcm-capture-worklet.js?v=60-audio'));
+  const sw=fs.readFileSync(path.join(PUBLIC_DIR,'sw.js'),'utf8');assert(sw.includes('ridvanses-pwa-v72'));assert(sw.includes('vercel-ws-shim.js?v=72'));
+  assert(sw.includes('pcm-player-worklet.js?v=72-audio'));assert(sw.includes('pcm-capture-worklet.js?v=72-audio'));
   console.log('V69 UNIT METRICS '+JSON.stringify({checks,vacatedOwners:0,reconciliationsPerAffectedTour:1,sameRoomTerminalControls:0,generalControllerReady:true,crossTourSync:true}));
   recordResult('ADIM-5.V69','Cross-room guide replacement owner cleanup; terminal/General reconciliation after membership install; same-room continuity; existing-context and duplicate-room coverage; cache69',true);console.log('V69 UNIT PASS');
 }
@@ -4770,6 +4770,107 @@
   }
 }
 
+
+async function runStep5V72QualityChecks(){
+  const assert=require('node:assert/strict'),vm=require('node:vm');
+  const read=f=>fs.readFileSync(path.join(ROOT_DIR,f),'utf8').replace(/\r\n/g,'\n');
+  const capture=read('public/pcm-capture-worklet.js'),player=read('public/pcm-player-worklet.js'),guide=read('public/rehber.html');
+  const db=x=>20*Math.log10(Math.max(1e-20,x));
+  const rms=a=>Math.sqrt(a.reduce((s,x)=>s+x*x,0)/a.length);
+  // Compile trusted production DSP in the host realm: no browser globals or I/O.
+  // This avoids VM global-lookup overhead in four minutes of actual 128-sample rendering.
+  const make=(source,rate=48000)=>{
+    const scope={},base=class{constructor(){this.port={postMessage(){}};}};
+    scope.AudioWorkletProcessor=base;
+    vm.compileFunction(source.replace(/^export .*$/mg,''),['globalThis','sampleRate','AudioWorkletProcessor','registerProcessor'])
+      (scope,rate,base,(name,K)=>scope.P=K);
+    return scope;
+  };
+  const cap=make(capture);
+  const fit=function(a,f,rate){let ss=0,cc=0,sc=0,s1=0,c1=0,ys=0,yc=0,y1=0;for(let i=0;i<a.length;i++){const s=Math.sin(2*Math.PI*f*i/rate),c=Math.cos(2*Math.PI*f*i/rate),y=a[i];ss+=s*s;cc+=c*c;sc+=s*c;s1+=s;c1+=c;ys+=y*s;yc+=y*c;y1+=y;}const A=[[ss,sc,s1,ys],[sc,cc,c1,yc],[s1,c1,a.length,y1]];for(let k=0;k<3;k++){const d=A[k][k];for(let j=k;j<4;j++)A[k][j]/=d;for(let i=0;i<3;i++)if(i!==k){const q=A[i][k];for(let j=k;j<4;j++)A[i][j]-=q*A[k][j];}}const b=A.map(x=>x[3]);let er=0;for(let i=0;i<a.length;i++){const e=a[i]-b[0]*Math.sin(2*Math.PI*f*i/rate)-b[1]*Math.cos(2*Math.PI*f*i/rate)-b[2];er+=e*e;}return{amp:Math.hypot(b[0],b[1]),dc:b[2],thdnDb:db(Math.sqrt(er/a.length)/(Math.hypot(b[0],b[1])/Math.SQRT2))};};
+  const gateProbe=function(snr=10,mode='phrase',profile={}){const g=new cap.RysNearExpander(profile),dt=1/24000,N=mode==='long'?24000*10:24000*3;let seed=1234567;const data=[];const noise=()=>{seed=(1664525*seed+1013904223)>>>0;return(seed/4294967296-.5)*Math.sqrt(12);};const nAmp=.035;let opened=0,trans=0,prev=0;for(let i=0;i<N;i++){const t=i*dt;let env=0;if(mode==='long'){env=t>=.8?1:0;}else if(mode==='cold'){env=t<.25?1:t>=1&&t<1.25?1:0;}else{const rel=t-.8;env=rel>=0&&rel<.08?.12:rel<.48&&rel>=.08?1:rel<.62&&rel>=.48?.12:0;}const voiced=(.65*Math.sin(2*Math.PI*220*t)+.35*Math.sin(2*Math.PI*880*t)+.28*Math.sin(2*Math.PI*1760*t))/Math.sqrt((.65**2+.35**2+.28**2)/2);const x=nAmp*noise()+nAmp*Math.pow(10,snr/20)*env*voiced;g.step(x);const open=g.hold>0;if(open!==prev){trans++;prev=open;}if(open)opened++;if(i%240===0)data.push({t:+t.toFixed(2),gain:g.g,hold:g.hold,noise:Array.from(g.n),energy:Array.from(g.e)});}const period=(a,b)=>{const s=data.filter(x=>x.t>=a&&x.t<b);return{minGain:+Math.min(...s.map(x=>x.gain)).toFixed(4),meanGain:+(s.reduce((v,x)=>v+x.gain,0)/s.length).toFixed(4),open:s.filter(x=>x.hold>0).length+'/'+s.length};};return{snr,mode,regions:{cold:period(.02,.24),onset:period(.8,.88),vowel:period(.9,1.25),coda:period(1.28,1.42),longEarly:period(1,2),longLate:period(8,9)},openedMs:opened/24,trans,data};};
+  const noiseProbe=function(cap,seconds=12){const g=new cap.RysNearExpander();let z=1234567,open=0,maxG=0;for(let i=0;i<24000*seconds;i++){z=(1664525*z+1013904223)>>>0;g.step(.035*(z/4294967296-.5)*Math.sqrt(12));if(i>=24000){if(g.hold)open++;maxG=Math.max(maxG,g.g);}}return{openPct:open/(24000*(seconds-1))*100,finalGain:g.g,maxGain:maxG};};
+  const sim=function({rate=48000,seconds=5,ppm=0,loss=0,burstLoss=0,jitter=0,catchup=false,source=player,tone=197}={}){const b=make(source,rate),p=new b.P(),events=[],nFrames=Math.ceil((seconds+.8)*50*(1+ppm/1e6));let seed=37;for(let seq=0;seq<nFrames;seq++){seed=(1664525*seed+1013904223)>>>0;if(loss&&Math.floor((seq+1)*loss+.5)>Math.floor(seq*loss+.5))continue;if(burstLoss&&seq>=75&&seq<75+burstLoss)continue;let at=seq*.020/(1+ppm/1e6);if(jitter){const k=seq%50;if(k>=20&&k<20+Math.round(jitter/.02))at=Math.max(at,(seq-k+20)*.02+jitter);}if(catchup&&seq>=50&&seq<80)at=Math.max(at,1.6);events.push({seq,at,samples:Float32Array.from({length:480},(_,i)=>.25*Math.sin(2*Math.PI*tone*(seq*480+i)/24000))});}events.sort((a,c)=>a.at-c.at||a.seq-c.seq);let ei=0,prev=0,maxStep=0,maxQ=0,minQ=Infinity,ratioMin=1,ratioMax=1,maxRatioDelta=0,oldRatio=1,started=false,stops=0,zeroRun=0,maxZero=0;const output=[],frame=new Float32Array(128),qTrace=[];for(let index=0;index<seconds*rate;index+=128){const now=index/rate;while(ei<events.length&&events[ei].at<=now){const m=events[ei++];p._push({...m,arrival:m.at*1000});maxQ=Math.max(maxQ,p.q.size);}p.process([],[[frame]]);if(started&&!p.playing)stops++;started=p.playing;ratioMin=Math.min(ratioMin,p.ratio);ratioMax=Math.max(ratioMax,p.ratio);maxRatioDelta=Math.max(maxRatioDelta,Math.abs(p.ratio-oldRatio));oldRatio=p.ratio;if(now>.5)minQ=Math.min(minQ,p.q.size);if(index%(128*200)===0)qTrace.push([+now.toFixed(2),p.q.size,+p.ratio.toFixed(7)]);for(const y of frame){if(!Number.isFinite(y))throw Error('nonfinite');if(now>.4){maxStep=Math.max(maxStep,Math.abs(y-prev));if(Math.abs(y)<1e-7){zeroRun++;maxZero=Math.max(maxZero,zeroRun);}else zeroRun=0;}prev=y;if(seconds<20)output.push(y);}}return {rate,seconds,ppm,loss,burstLoss,jitter,stats:{...p.stats},maxStep,maxQ,minQ,ratioMin,ratioMax,maxRatioDelta,stops,maxZeroMs:maxZero/rate*1000,target:p.target,output,qTrace};};
+  const captureMetrics=[],gateMetrics=[];
+  const pcmBox={Uint8Array,Math,btoa:s=>Buffer.from(s,'binary').toString('base64')};
+  vm.createContext(pcmBox);vm.runInContext(v70Pick(guide,'floatTo16BitBase64'),pcmBox);
+  for(const rate of [44100,48000]){
+    const fir=new cap.RysFir24(rate),out=[];
+    for(let i=0;i<rate*2;i++)fir.push(.5*Math.sin(2*Math.PI*8000*i/rate),x=>out.push(x));
+    const tone=fit(out.slice(24000),8000,24000);assert(tone.thdnDb<-100,'fractional FIR phase spurs '+rate);
+    const frames=[],k=new cap.RysCaptureKernel(rate,{continuousSpeech:true,comfortFade:false},m=>frames.push(...m.samples));
+    for(let at=0;at<rate*2;at+=128)k.process(Float32Array.from({length:Math.min(128,rate*2-at)},(_,j)=>.5*Math.sin(2*Math.PI*997*(at+j)/rate)),at/rate);
+    assert.equal(frames.length,48000);const floats=frames.slice(24000),bytes=Buffer.from(pcmBox.floatTo16BitBase64(floats),'base64');
+    const pcm=Float32Array.from({length:floats.length},(_,i)=>bytes.readInt16LE(2*i)/32768);
+    const thdn=fit(pcm,997,24000).thdnDb;assert(thdn<-85,'capture PCM16 fidelity '+rate+' '+thdn);
+    assert(floats.every(x=>Math.abs(x)<.98));
+    captureMetrics.push({rate,fir8000ThdnDb:+tone.thdnDb.toFixed(2),pcm997ThdnDb:+thdn.toFixed(2)});
+  }
+  for(const snr of [5,10,20]){
+    const phrase=gateProbe(snr,'phrase'),long=gateProbe(snr,'long'),cold=gateProbe(snr,'cold');
+    assert(phrase.regions.vowel.minGain>.95,'5/10/20dB vowel');
+    assert(phrase.regions.coda.minGain>.95,'soft coda hangover');
+    assert(long.regions.longLate.minGain>.98,'speech must not become noise when minima rotate');
+    assert(cold.regions.cold.minGain>.98,'no forced -18dB calibration attenuation');
+    const tail=phrase.data.filter(x=>x.t>=2.5&&x.t<2.9);assert(tail.every(x=>x.gain<.14),'gate must release after speech');
+    gateMetrics.push({snr,vowelMin:phrase.regions.vowel.minGain,codaMin:phrase.regions.coda.minGain,
+      weakPrefixMean:phrase.regions.onset.meanGain,longLateMin:long.regions.longLate.minGain,warmupMin:cold.regions.cold.minGain});
+  }
+  const stationary=noiseProbe(cap);assert.equal(stationary.openPct,0);assert(stationary.finalGain<.127);
+  console.log('V72 CAPTURE METRICS '+JSON.stringify({captureMetrics,gateMetrics,stationary}));
+  recordResult('ADIM-5.V72.CAPTURE','Interpolated FIR phase fidelity; actual PCM16 THD+N; 5/10/20dB envelope, long-vowel/noise discrimination and calibration continuity',true);
+
+  const interpolation=[],reset=[],network=[],drift=[];
+  for(const rate of [8000,16000,24000,44100,48000]){
+    const P=make(player,rate).P;
+    for(const hz of new Set([997,Math.min(5600,rate*.35),Math.min(8000,rate*.35)])){
+      const p=new P(),out=[];let seq=0;
+      for(let at=0;at<rate*2;at+=128){
+        while(p.q.size<12){const s=seq++;p._push({seq:s,arrival:s*20,samples:Float32Array.from({length:480},(_,i)=>.25*Math.sin(2*Math.PI*hz*(s*480+i)/24000))});}
+        // Isolate interpolation error from intentional clock servo modulation.
+        p.target=(p.q.size*480+480-p.fi)/24000;p.ratio=1;p.driftIntegral=0;
+        const a=new Float32Array(128);p.process([],[[a]]);out.push(...a);
+      }
+      const f=fit(out.slice(Math.round(rate*.5),Math.round(rate*1.5)),hz,rate);
+      assert(f.thdnDb<-75,'ASRC image rejection '+rate+'/'+hz+' '+f.thdnDb);
+      assert(Math.abs(db(f.amp/.25))<.02,'ASRC passband');
+      interpolation.push({rate,hz,residualDb:+f.thdnDb.toFixed(2),gainDb:+db(f.amp/.25).toFixed(4)});
+    }
+    const p=new P(),push=(seq,v)=>{for(let i=0;i<12;i++)p._push({seq:seq+i,arrival:(seq+i)*20,samples:new Float32Array(480).fill(v)});};
+    const render=seconds=>{const a=[];for(let i=0;i<Math.ceil(rate*seconds/128);i++){const b=new Float32Array(128);p.process([],[[b]]);a.push(...b);}return a;};
+    const maxStep=a=>{let last=0,max=0;for(const y of a){assert(Number.isFinite(y));max=Math.max(max,Math.abs(y-last));last=y;}return max;};
+    push(0,.2);render(.1);p.port.onmessage({data:{type:'reset'}});render(.03);push(100,-.2);
+    const a=render(.03),rs=maxStep(a);assert.equal(a[0],0);assert(rs<.004*24000/rate,'reset slope bound '+rate+' '+rs);
+    render(1);assert(!p.playing);push(1000,.2);const b=render(.03),ss=maxStep(b);assert.equal(b[0],0);assert(ss<.004*24000/rate,'starvation slope bound');
+    reset.push({rate,resetStep:+rs.toFixed(7),starveStep:+ss.toFixed(7)});
+  }
+  for(const loss of [.01,.03,.05]){
+    const r=sim({loss,seconds:8});assert.equal(r.stats.concealed,Math.round(400*loss)*480);assert.equal(r.stops,0);assert(r.maxStep<.04);
+    network.push({...r,output:undefined,qTrace:undefined});
+  }
+  for(const burstLoss of [2,3,5]){
+    const r=sim({burstLoss,seconds:5});assert.equal(r.stats.concealed,480*burstLoss);assert(r.maxStep<.04);
+    network.push({...r,output:undefined,qTrace:undefined});
+  }
+  for(const jitter of [.06,.12,.18]){
+    const r=sim({jitter,seconds:8});assert(r.maxStep<.04);assert.equal(r.stats.resync,0);
+    network.push({...r,output:undefined,qTrace:undefined});
+  }
+  for(const rate of [8000,16000,24000,44100,48000]){
+    const r=sim({rate,catchup:true,seconds:4});assert(r.stats.catchupDropped>0);assert(r.maxStep<.05);
+    network.push({...r,output:undefined,qTrace:undefined});
+  }
+  for(const ppm of [-1000,-500,-100,100,500,1000]){
+    const r=sim({rate:24000,seconds:240,ppm});
+    assert.equal(r.stats.concealed,0,'loss-free clock drift must not synthesize PLC '+ppm);
+    assert.equal(r.stats.late,0);assert.equal(r.stops,0);assert(r.minQ>=1);
+    assert(r.ratioMin>=.999-1e-9&&r.ratioMax<=1.001+1e-9);assert(r.maxRatioDelta<.00001);
+    drift.push({...r,output:undefined,qTrace:undefined});
+  }
+  console.log('V72 PLAYER METRICS '+JSON.stringify({interpolation,reset,network,drift}));
+  recordResult('ADIM-5.V72.PLAYER','Band-limited ASRC; five-rate reset/starvation and catch-up; 1/3/5% and burst PLC; 60/120/180ms jitter; four-minute +/-1000ppm drift',true);
+}
+
 async function main() {
   const runtimePath = path.join(ROOT_DIR, 'data', 'runtime.json');
   const runtimeSnapshot = fs.existsSync(runtimePath) ? fs.readFileSync(runtimePath, 'utf8') : null;
@@ -4795,6 +4896,7 @@
     await runStep5V69AudioChecks();
     await runStep5V70AudioChecks();
     await runStep5V71AudioChecks();
+    await runStep5V72QualityChecks();
 
     console.log('\n====================================================================');
     console.log(`TÜM DOĞRULAMA TESTLERİ TAMAMLANDI: ${results.length} / ${results.length} [BAŞARILI / PASS]`);
```
