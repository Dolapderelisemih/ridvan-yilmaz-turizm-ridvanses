const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '..', 'data', 'umre-acenteleri.json');
let list = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));

// 1. Alkuş Turizm (AC-007)
const alkus = list.find(a => a.id === 'AC-007');
if (alkus) {
  alkus.firmaAdi = 'Alkuş Turizm';
  alkus.yetkili = 'Fatih Alkuş / Kafile Yönetimi';
  alkus.email = 'fatih@alkusturizm.com';
  alkus.sehir = 'Bursa';
  alkus.web = 'https://alkusturizm.com';
  alkus.not = 'Diyanet & TÜRSAB Doğrulandı: fatih@alkusturizm.com';
  alkus.gonderildi = false;
  alkus.sonDurum = 'DÜZELTİLDİ (Gönderime Hazır)';
}

// 2. Dostlar Turizm / Hacılar Turizm (AC-035)
const dostlar = list.find(a => a.id === 'AC-035');
if (dostlar) {
  dostlar.firmaAdi = 'Hacılar Turizm (Güzel Dostlar Turizm)';
  dostlar.yetkili = 'Hac ve Umre Operasyon Direktörlüğü';
  dostlar.email = 'hacilarturizm@gmail.com';
  dostlar.sehir = 'İstanbul';
  dostlar.web = 'https://www.hacilar.com.tr';
  dostlar.not = 'Doğrulandı: Hacılar Turizm Fatih/İstanbul (hacilarturizm@gmail.com)';
  dostlar.gonderildi = false;
  dostlar.sonDurum = 'DÜZELTİLDİ (Gönderime Hazır)';
}

// 3. Ashab Global Turizm (AC-034)
const ashab = list.find(a => a.id === 'AC-034');
if (ashab) {
  ashab.firmaAdi = 'Ashab Global Turizm';
  ashab.yetkili = 'Kafile Koordinasyon Ekibi';
  ashab.email = 'info@ashabglobal.com';
  ashab.sehir = 'Ankara';
  ashab.web = 'https://ashabglobal.com';
  ashab.not = 'Doğrulandı: Ashab Global Turizm (Yandex MX: info@ashabglobal.com)';
  ashab.gonderildi = false;
  ashab.sonDurum = 'DÜZELTİLDİ (Gönderime Hazır)';
}

// 4. Ravha Turizm / Ravza Hac Umre (AC-028)
const ravha = list.find(a => a.id === 'AC-028');
if (ravha) {
  ravha.firmaAdi = 'Ravha Turizm (Ravza Umre Organizasyonu)';
  ravha.yetkili = 'Hac ve Umre Kafile Sorumlusu';
  ravha.email = 'info@ravhaturizm.com.tr';
  ravha.sehir = 'Siirt & İstanbul';
  ravha.web = 'https://ravhaturizm.com.tr';
  ravha.not = 'Doğrulandı: Ravha Turizm (Aktif MX: info@ravhaturizm.com.tr)';
  ravha.gonderildi = false;
  ravha.sonDurum = 'DÜZELTİLDİ (Gönderime Hazır)';
}

// 5. Asr Tour / Asr Turizm (Yeni Giriş: AC-036)
if (!list.some(a => a.email === 'info@asrtour.com')) {
  list.push({
    id: 'AC-036',
    firmaAdi: 'Asr Tour (Asr Turizm)',
    yetkili: 'Hac ve Umre Operasyon Yöneticisi',
    email: 'info@asrtour.com',
    sehir: 'Antalya',
    web: 'https://asrtour.com',
    not: 'TÜRSAB A-14794 Doğrulandı: info@asrtour.com',
    gonderildi: false,
    gonderimTarihi: null,
    sonDurum: 'DÜZELTİLDİ (Gönderime Hazır)'
  });
}

// 6. Darül Erkam Tur / Erkam Turizm (Yeni Giriş: AC-037)
if (!list.some(a => a.email === 'bilgi@darulerkamtur.com')) {
  list.push({
    id: 'AC-037',
    firmaAdi: 'Darül Erkam Tur (Erkam Turizm)',
    yetkili: 'Hac & Umre Kafile Koordinasyonu',
    email: 'bilgi@darulerkamtur.com',
    sehir: 'Kayseri',
    web: 'https://darulerkamtur.com',
    not: 'Doğrulandı: Darül Erkam Tur (bilgi@darulerkamtur.com)',
    gonderildi: false,
    gonderimTarihi: null,
    sonDurum: 'DÜZELTİLDİ (Gönderime Hazır)'
  });
}

// 7. 99 Turizm / 99 Seyahat (Yeni Giriş: AC-038)
if (!list.some(a => a.email === 'alisambur049@gmail.com')) {
  list.push({
    id: 'AC-038',
    firmaAdi: '99 Turizm (99 Seyahat)',
    yetkili: 'Ali Sambur / Kafile Yönetimi',
    email: 'alisambur049@gmail.com',
    sehir: 'Bursa',
    web: 'https://99turizm.com.tr',
    not: 'Diyanet Resmi Kayıtlı: alisambur049@gmail.com (Osmangazi/Bursa)',
    gonderildi: false,
    gonderimTarihi: null,
    sonDurum: 'DÜZELTİLDİ (Gönderime Hazır)'
  });
}

// 8. Safa Turizm / Safa Tur (Yeni Giriş: AC-039)
if (!list.some(a => a.email === 'acente@safatur.com.tr')) {
  list.push({
    id: 'AC-039',
    firmaAdi: 'Safa Turizm (Safa Tur)',
    yetkili: 'Hac ve Umre Operasyon Müdürlüğü',
    email: 'acente@safatur.com.tr',
    sehir: 'İstanbul & Eskişehir',
    web: 'https://safatur.com.tr',
    not: 'TÜRSAB Onaylı: acente@safatur.com.tr (Promail MX)',
    gonderildi: false,
    gonderimTarihi: null,
    sonDurum: 'DÜZELTİLDİ (Gönderime Hazır)'
  });
}

fs.writeFileSync(DATA_FILE, JSON.stringify(list, null, 2), 'utf8');

const pending = list.filter(a => !a.gonderildi);
console.log('Güncelleme tamamlandı.');
console.log(`Gönderim bekleyen düzeltilmiş acente sayısı: ${pending.length}`);
pending.forEach(p => console.log(`- [${p.id}] ${p.firmaAdi} -> ${p.email} (${p.sehir})`));
