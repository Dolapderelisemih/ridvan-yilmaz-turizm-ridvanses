const fs = require('fs');
const path = require('path');

const selametGuide = {
  id: 'guide-selamet',
  name: 'Selamet Turizm Kafile Rehberi',
  title: 'Selamet Turizm Baş Rehberi & Kafile Sorumlusu',
  phone: '+90 545 787 03 48',
  email: 'info@selametturizm.com',
  specialty: 'Kâbe Tavafı, Canlı Dua Yayını, Siyer Anlatımları ve Kafile Koordinasyonu',
  status: 'live',
  assignedTour: 'SELAMET-2026'
};

const selametTour = {
  id: 'tour-selamet-2026',
  code: 'SELAMET-2026',
  name: '🕋 Selamet Turizm — Özel Umre Kafilesi (Demo & Test)',
  dateText: 'Kasım - Aralık 2026',
  duration: '14 Gün (Mekke - Medine)',
  guideId: 'guide-selamet',
  guideName: 'Selamet Turizm Kafile Rehberi',
  makkahHotel: 'Mekke 5★ Harem Oteli (Kâbe Önü)',
  madinahHotel: 'Medine Ravza Oteli (Mescid-i Nebevî Yakını)',
  pin: '',
  pinProtected: false,
  status: 'live',
  capacity: 150,
  registeredCount: 46,
  description: 'Selamet Turizm kafilelerine özel kristal netliğinde dijital sesli rehberlik, anlık tavaf duaları, interaktif el kaldırma/soru-cevap ve noktasal GPS kayıp hacı acil SOS takip sistemi.',
  rooms: [
    { id: 'genel', name: 'Selamet Turizm — Ana Kafile & Tavaf Yayını', guide: 'Selamet Turizm Kafile Rehberi', active: true },
    { id: 'irshad', name: 'Manevi Sohbet & Ziyaretler Odası', guide: 'Selamet Turizm Kafile Rehberi', active: true }
  ]
};

const selametAnn = {
  id: 'ann-selamet-1',
  tourCode: 'SELAMET-2026',
  title: 'Selamet Turizm Ses Sistemine Hoş Geldiniz',
  message: 'Kıymetli Selamet Turizm misafirlerimiz; ses sistemimize başarıyla bağlandınız. Kulaklığınızı takarak rehberimizin sesini kristal netliğinde dinleyebilir, soru sormak için "El Kaldır" butonunu kullanabilirsiniz.',
  sender: 'Selamet Turizm Kafile Rehberi',
  createdAt: '16:00',
  urgent: true
};

function updateFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

  // Add guide if not exists
  if (!data.guides.some(g => g.id === selametGuide.id)) {
    data.guides.push(selametGuide);
  }

  // Add tour if not exists (add to beginning)
  if (!data.tours.some(t => t.code === selametTour.code)) {
    data.tours.unshift(selametTour);
  }

  // Add announcement if not exists
  if (!data.announcements.some(a => a.id === selametAnn.id)) {
    data.announcements.unshift(selametAnn);
  }

  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  console.log(`Updated ${filePath}`);
}

updateFile(path.join(__dirname, '..', 'data', 'runtime.json'));
updateFile(path.join(__dirname, '..', 'data', 'seed.json'));
