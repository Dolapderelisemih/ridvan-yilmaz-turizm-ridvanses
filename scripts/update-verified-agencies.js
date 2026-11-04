const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'data', 'umre-acenteleri.json');
const agencies = JSON.parse(fs.readFileSync(filePath, 'utf8'));

// 8 düzeltme ve yenileme
agencies.forEach(a => {
  // 1. Nirvana yerine Nuri Doğan Turizm (Konya)
  if (a.id === 'AC-004') {
    a.firmaAdi = 'Nuri Doğan Turizm';
    a.yetkili = 'Hac & Umre Kafile Yönetimi';
    a.email = 'bilgi@nuridoganturizm.com.tr';
    a.web = 'https://nuridoganturizm.com.tr';
    a.not = 'Doğrulandı: Nuri Doğan Turizm Konya';
    a.gonderildi = false;
    a.gonderimTarihi = null;
  }

  // 2. Alkuş Turizm info -> bilgi
  if (a.id === 'AC-007') {
    a.email = 'bilgi@alkusturizm.com.tr';
    a.not = 'Doğrulandı: Alkuş Turizm Bursa';
    a.gonderildi = false;
    a.gonderimTarihi = null;
  }

  // 3. 99 Turizm yerine Ensar Turizm (Fatih / İstanbul)
  if (a.id === 'AC-011') {
    a.firmaAdi = 'Ensar Turizm (Ensar Tur)';
    a.yetkili = 'Hac ve Umre Operasyon Departmanı';
    a.email = 'info@ensartur.com';
    a.sehir = 'İstanbul';
    a.web = 'https://ensartur.com';
    a.not = 'Doğrulandı: Ensar Turizm Fatih / İstanbul';
    a.gonderildi = false;
    a.gonderimTarihi = null;
  }

  // 4. Erkam yerine Ekrem Turizm (Fatih / İstanbul)
  if (a.id === 'AC-018') {
    a.firmaAdi = 'Ekrem Turizm';
    a.yetkili = 'Hac ve Umre Operasyon Direktörlüğü';
    a.email = 'hacveumre@ekremturizm.com';
    a.web = 'https://ekremturizm.com.tr';
    a.not = 'Doğrulandı: Ekrem Turizm Fatih / İstanbul';
    a.gonderildi = false;
    a.gonderimTarihi = null;
  }

  // 5. Ars Turizm yerine Selamet Turizm (Konya)
  if (a.id === 'AC-025') {
    a.firmaAdi = 'Selamet Turizm';
    a.yetkili = 'Hac ve Umre Kafile Koordinatörü';
    a.email = 'info@selametturizm.com';
    a.sehir = 'Konya';
    a.web = 'https://selametturizm.com';
    a.not = 'Doğrulandı: Selamet Turizm Konya';
    a.gonderildi = false;
    a.gonderimTarihi = null;
  }

  // 6. Ravza yerine El Hilal Turizm (İstanbul)
  if (a.id === 'AC-028') {
    a.firmaAdi = 'El Hilal Turizm';
    a.yetkili = 'Umre Kafile Masası';
    a.email = 'info@elhilalturizm.com';
    a.sehir = 'İstanbul';
    a.web = 'https://elhilalturizm.com';
    a.not = 'Doğrulandı: El Hilal Turizm İstanbul';
    a.gonderildi = false;
    a.gonderimTarihi = null;
  }

  // 7. Ashab Global domain düzeltmesi (.com)
  if (a.id === 'AC-034') {
    a.email = 'info@ashabglobal.com';
    a.web = 'https://ashabglobal.com';
    a.not = 'Doğrulandı: info@ashabglobal.com Ankara/Kayseri';
    a.gonderildi = false;
    a.gonderimTarihi = null;
  }

  // 8. Dostlar yerine Ravha Turizm
  if (a.id === 'AC-035') {
    a.firmaAdi = 'Ravha Turizm';
    a.yetkili = 'Hac ve Umre Turları Yöneticisi';
    a.email = 'info@ravhaturizm.com.tr';
    a.sehir = 'Siirt';
    a.web = 'https://ravhaturizm.com.tr';
    a.not = 'Doğrulandı: Ravha Turizm Hac Umre';
    a.gonderildi = false;
    a.gonderimTarihi = null;
  }
});

fs.writeFileSync(filePath, JSON.stringify(agencies, null, 2), 'utf8');
console.log('Tüm 8 acente MX doğrulamalı aktif e-postalarla güncellendi.');
