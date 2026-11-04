const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');
const { generateEmail } = require('./email-template');

// .env oku
const env = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
const passMatch = env.match(/GMAIL_APP_PASSWORD\s*=\s*(.*)/);
const pass = passMatch ? passMatch[1].trim() : '';

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'otomasyonsistemlerisemih@gmail.com',
    pass: pass.replace(/\s+/g, '')
  }
});

// Semerşah Turizm Örneği
const sampleAgency = {
  firmaAdi: 'Semerşah Turizm',
  yetkili: 'Hac ve Umre Operasyon Direktörlüğü',
  sehir: 'İstanbul',
  email: 'info@semersahturizm.com'
};

const mail = generateEmail(sampleAgency);

console.log('Semerşah Turizm için özel hazırlanan e-posta gönderiliyor...');

transporter.sendMail({
  from: '"Semih Bey - Umre Ses Sistemleri" <otomasyonsistemlerisemih@gmail.com>',
  to: 'otomasyonsistemlerisemih@gmail.com', // Kendi adresinize geliyor
  subject: '[BAŞKA FİRMA ÖRNEĞİ] ' + mail.subject,
  text: mail.text,
  html: mail.html
}).then(info => {
  console.log('✅ Semerşah Turizm örnek e-postası başarıyla iletildi!');
  console.log('Message ID:', info.messageId);
}).catch(err => {
  console.error('❌ Hata:', err.message);
});
