/**
 * RıdvanSes / Umre Acenteleri Otomatik Mail Gönderim Motoru
 * Kullanım:
 *   node scripts/send-outreach.js --preview
 *   node scripts/send-outreach.js --test
 *   node scripts/send-outreach.js --send
 */

const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const { generateEmail } = require('./email-template');

// .env dosyasını otomatik oku (varsa)
const ENV_PATH = path.join(__dirname, '..', '.env');
if (fs.existsSync(ENV_PATH)) {
  const envContent = fs.readFileSync(ENV_PATH, 'utf8');
  envContent.split('\n').forEach(line => {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (match) {
      const key = match[1];
      let value = match[2] || '';
      value = value.replace(/(^['"]|['"]$)/g, '').trim();
      process.env[key] = value;
    }
  });
}

const DATA_FILE = path.join(__dirname, '..', 'data', 'umre-acenteleri.json');
const LOG_FILE = path.join(__dirname, '..', 'data', 'outreach-log.json');
const SENDER_EMAIL = 'otomasyonsistemlerisemih@gmail.com';
const SENDER_NAME = 'Semih Bey | Umre Ses Sistemleri';

// Gmail Uygulama Şifresi: Çevre değişkeni (GMAIL_APP_PASSWORD) veya config'den alınır
const GMAIL_PASSWORD = process.env.GMAIL_APP_PASSWORD || '';

function createTransporter() {
  if (!GMAIL_PASSWORD) {
    throw new Error('GMAIL_APP_PASSWORD tanımlanmamış. Lütfen 16 haneli Google Uygulama Şifrenizi belirtin.');
  }

  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: SENDER_EMAIL,
      pass: GMAIL_PASSWORD.replace(/\s+/g, '') // boşlukları temizle
    }
  });
}

function loadAgencies() {
  if (!fs.existsSync(DATA_FILE)) {
    throw new Error(`Veri dosyası bulunamadı: ${DATA_FILE}`);
  }
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}

function saveAgencies(agencies) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(agencies, null, 2), 'utf8');
}

function appendLog(entry) {
  let logs = [];
  try {
    if (fs.existsSync(LOG_FILE)) {
      logs = JSON.parse(fs.readFileSync(LOG_FILE, 'utf8'));
    }
  } catch {}
  logs.push({ ...entry, timestamp: new Date().toISOString() });
  fs.writeFileSync(LOG_FILE, JSON.stringify(logs, null, 2), 'utf8');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function run() {
  const args = process.argv.slice(2);
  const isPreview = args.includes('--preview');
  const isTest = args.includes('--test');
  const isSend = args.includes('--send');

  console.log('===========================================================');
  console.log('  🕋 UMRE ACENTELERİ B2B E-POSTA OTOMASYON MOTORU');
  console.log(`  Gönderici: ${SENDER_NAME} <${SENDER_EMAIL}>`);
  console.log('===========================================================');

  const agencies = loadAgencies();
  console.log(`Kayıtlı toplam acente sayısı: ${agencies.length}`);

  // 1. ÖNİZLEME MODU (--preview)
  if (isPreview || (!isTest && !isSend)) {
    console.log('\n[MOD: ÖNİZLEME]');
    const sample = agencies[0] || { firmaAdi: 'Örnek Umre Turizm', yetkili: 'Yetkili', sehir: 'İstanbul' };
    const mail = generateEmail(sample);
    console.log(`Konu  : ${mail.subject}`);
    console.log(`Alıcı : ${sample.firmaAdi} <${sample.email}>`);
    console.log('\n--- DÜZ METİN ÖNİZLEME ---\n');
    console.log(mail.text);
    console.log('\n[BİLGİ] E-posta göndermek için:');
    console.log('  1. Kendi adresinize test maili: node scripts/send-outreach.js --test');
    console.log('  2. Acentelere gerçek gönderim : node scripts/send-outreach.js --send\n');
    return;
  }

  // 2. KENDİ ADRESİNE TEST GÖNDERİMİ (--test)
  if (isTest) {
    console.log('\n[MOD: KENDİ ADRESİME TEST GÖNDERİMİ]');
    console.log(`Hedef Adres: ${SENDER_EMAIL}`);

    const sampleAgency = {
      firmaAdi: 'Rıdvan Yılmaz Turizm & Örnek Acente',
      yetkili: 'Semih Bey',
      sehir: 'Bursa',
      email: SENDER_EMAIL
    };
    const { subject, text, html } = generateEmail(sampleAgency);

    try {
      const transporter = createTransporter();
      console.log('Gmail sunucusuna bağlanılıyor...');
      await transporter.verify();
      console.log('✅ Gmail bağlantısı doğrulandı.');

      console.log('Test e-postası gönderiliyor...');
      const info = await transporter.sendMail({
        from: `"${SENDER_NAME}" <${SENDER_EMAIL}>`,
        to: SENDER_EMAIL,
        subject: `[TEST ÖNİZLEME] ${subject}`,
        text,
        html
      });

      console.log(`\n🎉 Test e-postası başarıyla gönderildi!`);
      console.log(`Message ID: ${info.messageId}`);
      console.log(`Lütfen ${SENDER_EMAIL} gelen kutunuzu kontrol edin.`);
    } catch (err) {
      console.error('\n❌ E-posta gönderilemedi:', err.message);
      if (err.message.includes('GMAIL_APP_PASSWORD') || err.message.includes('Invalid login')) {
        console.log('\n👉 ÇÖZÜM: Google hesabınızda 2 Adımlı Doğrulamayı açıp https://myaccount.google.com/apppasswords adresinden 16 haneli bir "Uygulama Şifresi" almanız gerekmektedir.');
      }
    }
    return;
  }

  // 3. GERÇEK GÖNDERİM (--send)
  if (isSend) {
    console.log('\n[MOD: GERÇEK ACENTE GÖNDERİMİ]');
    const pending = agencies.filter((a) => !a.gonderildi);
    console.log(`Gönderim bekleyen acente sayısı: ${pending.length}`);

    if (pending.length === 0) {
      console.log('Tüm acentelere zaten gönderilmiş! Gönderilecek bekleyen acente yok.');
      return;
    }

    let transporter;
    try {
      transporter = createTransporter();
      await transporter.verify();
      console.log('✅ Gmail bağlantısı doğrulandı.\n');
    } catch (err) {
      console.error('❌ Gmail bağlantı hatası:', err.message);
      return;
    }

    let sentCount = 0;
    for (const agency of pending) {
      console.log(`-----------------------------------------------------------`);
      console.log(`[${sentCount + 1}/${pending.length}] Gönderiliyor: ${agency.firmaAdi} (${agency.email})`);

      const { subject, text, html } = generateEmail(agency);

      try {
        const info = await transporter.sendMail({
          from: `"${SENDER_NAME}" <${SENDER_EMAIL}>`,
          to: agency.email,
          subject,
          text,
          html
        });

        console.log(`✅ Başarıyla İletildi! (ID: ${info.messageId})`);
        agency.gonderildi = true;
        agency.gonderimTarihi = new Date().toISOString();
        saveAgencies(agencies);

        appendLog({
          status: 'SUCCESS',
          agencyId: agency.id,
          firmaAdi: agency.firmaAdi,
          email: agency.email,
          messageId: info.messageId
        });

        sentCount++;

        // Spam'a düşmemek için acenteler arası rastgele 45 - 65 saniye bekleme
        if (sentCount < pending.length) {
          const delaySec = Math.floor(Math.random() * 20) + 45;
          console.log(`⏳ Spam koruması: Sonraki acente için ${delaySec} saniye bekleniyor...`);
          await sleep(delaySec * 1000);
        }
      } catch (err) {
        console.error(`❌ Gönderim Başarısız:`, err.message);
        appendLog({
          status: 'ERROR',
          agencyId: agency.id,
          firmaAdi: agency.firmaAdi,
          email: agency.email,
          error: err.message
        });
      }
    }

    console.log('\n===========================================================');
    console.log(`Gönderim tamamlandı. Toplam iletilen: ${sentCount}/${pending.length}`);
    console.log('===========================================================');
  }
}

run().catch(console.error);
