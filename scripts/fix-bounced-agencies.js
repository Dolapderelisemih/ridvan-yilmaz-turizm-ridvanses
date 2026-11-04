const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'data', 'umre-acenteleri.json');
const agencies = JSON.parse(fs.readFileSync(filePath, 'utf8'));

// Hatalı dönen 8 e-posta
const bouncedEmails = [
  'info@nirvanaturizm.com.tr',
  'info@alkusturizm.com.tr',
  'info@99turizm.com.tr',
  'bilgi@erkamtur.com',
  'info@arsturizm.com',
  'info@ravzahacumre.com.tr',
  'info@ashabglobalturizm.com',
  'info@dostlarturizm.com.tr'
];

// Düzeltmeler ve güncellemeler
agencies.forEach(a => {
  if (bouncedEmails.includes(a.email)) {
    a.gonderildi = false;
    a.sonDurum = 'BOUNCED (Adres veya Alan Adı Bulunamadı)';
  } else if (a.gonderildi) {
    a.sonDurum = 'DELIVERED (Başarıyla İletildi)';
  }

  // 1. Ashab Global düzeltmesi
  if (a.id === 'AC-034') {
    a.email = 'info@ashabglobal.com';
    a.web = 'https://ashabglobal.com';
    a.not = 'Düzeltildi: info@ashabglobal.com (MX Doğrulandı)';
    a.sonDurum = 'DÜZELTİLDİ (Gönderime Hazır)';
  }

  // 2. Alkuş Turizm düzeltmesi
  if (a.id === 'AC-007') {
    a.email = 'bilgi@alkusturizm.com.tr';
    a.not = 'Düzeltildi: bilgi@alkusturizm.com.tr (MX Doğrulandı)';
    a.sonDurum = 'DÜZELTİLDİ (Gönderime Hazır)';
  }

  // 3. Erkam yerine Ekrem Turizm (Fatih)
  if (a.id === 'AC-018') {
    a.firmaAdi = 'Ekrem Turizm';
    a.yetkili = 'Hac ve Umre Operasyon Direktörlüğü';
    a.email = 'hacveumre@ekremturizm.com';
    a.web = 'https://ekremturizm.com.tr';
    a.not = 'Düzeltildi: Ekrem Turizm Fatih / İstanbul (MX Doğrulandı)';
    a.sonDurum = 'DÜZELTİLDİ (Gönderime Hazır)';
  }

  // 4. Nirvana yerine Nuri Doğan Turizm (Konya)
  if (a.id === 'AC-004') {
    a.firmaAdi = 'Nuri Doğan Turizm';
    a.yetkili = 'Hac & Umre Kafile Yönetimi';
    a.email = 'bilgi@nuridoganturizm.com.tr';
    a.web = 'https://nuridoganturizm.com.tr';
    a.not = 'Düzeltildi: Nuri Doğan Turizm Konya (MX Doğrulandı)';
    a.sonDurum = 'DÜZELTİLDİ (Gönderime Hazır)';
  }
});

fs.writeFileSync(filePath, JSON.stringify(agencies, null, 2), 'utf8');
console.log('umre-acenteleri.json güncellendi.');
