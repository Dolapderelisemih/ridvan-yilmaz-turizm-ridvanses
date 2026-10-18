# 🕋 Rıdvan Yılmaz Turizm — RıdvanSes Canlı Rehberlik ve Kafile Yönetim Sistemi

**Rıdvan Yılmaz Turizm** misafirleri ve rehber hocaları için Kâbe tavafı, Sa'y ve Mekke/Medine Siyer ziyaretlerinde fiziksel kulaklık cihazlarına ihtiyaç duymadan kendi cep telefonları üzerinden çalışan **Canlı Sesli Rehberlik, Soru-Cevap (El Kaldır), Canlı SOS GPS Konum Takip ve Yaka Kartı QR Sistemi**.

## ✨ Temel Özellikler

1. **🎧 Hacı Dinleme Ekranı (`/dinle`)**
   - Üyeliksiz ve şifresiz, sadece **Kafile Kodu** (Örn: `RY-KASIM`, `RY-2026`) veya **Yaka Kartı QR Kodu** ile tek dokunuşta katılım.
   - **Tavaf Kesintisiz Dinleme Modu:** `WakeLock API` + `MediaSession API` + Arka Plan Ses Koruyucu sayesinde telefon ekranı kilitlense veya cebe konsa bile ses kesilmez.
   - **%200 Ses Güçlendirici (GainNode)**, **El Kaldır / Söz İste**, **3 Saniye Basılı Tut Canlı GPS SOS**, **Sesli Tavaf/Sa'y Duaları** ve **6 Dil Desteği** (`TR`, `AR`, `EN`, `FR`, `ID`, `UR`).
   - **PWA (Uygulama Olarak Yükle):** Tek dokunuşla iPhone ve Android ana ekranına uygulama olarak kurulur.

2. **🎙️ Rehber (Hoca) Canlı Yayın Konsolu (`/rehber`)**
   - Gerçek mikrofonla canlı yayın başlatma (`RY-KASIM` — Ömer Ali Gültekin, `RY-2026` — Rıdvan Yılmaz Hoca).
   - El kaldıran hacılara tek tıkla mikrofon yetkisi verme (`🎙️ Söz Ver` / `🔇 Sözü Bitir`).
   - Tek tuşla kafileye sesli/görsel acil duyuru gönderme.
   - Kaybolan hacıların SOS çağrılarını Google Haritalar üzerinde canlı koordinatla görme.

3. **🛡️ Acente Yönetim Paneli (`/panel`) & Yaka Kartı Üretici (`/yaka-karti`)**
   - Yeni umre kafilesi oluşturma, canlı odaları izleme.
   - Her kafile için **A4 Boyun Askılı QR Yaka Kartı Yazdırma** ve **Tek Tıkla WhatsApp Grubu Davet Mesajı** üretme.

## 🚀 Kurulum ve Çalıştırma

```bash
npm install
npm start
```

Tarayıcıda `http://localhost:3000` adresini açın.
- **PDF Kullanım Rehberi:** `/Ridvan_Yilmaz_Turizm_RidvanSes_Kullanim_Rehberi.pdf`
