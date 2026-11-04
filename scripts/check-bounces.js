const imaps = require('imap-simple');
const fs = require('fs');
const path = require('path');

// .env oku
const env = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
const passMatch = env.match(/GMAIL_APP_PASSWORD\s*=\s*(.*)/);
const pass = passMatch ? passMatch[1].trim().replace(/\s+/g, '') : '';

const config = {
  imap: {
    user: 'otomasyonsistemlerisemih@gmail.com',
    password: pass,
    host: 'imap.gmail.com',
    port: 993,
    tls: true,
    authTimeout: 10000,
    tlsOptions: { rejectUnauthorized: false }
  }
};

async function checkBounces() {
  console.log('Gmail IMAP sunucusuna bağlanılıyor...');
  let connection;
  try {
    connection = await imaps.connect(config);
    console.log('✅ IMAP bağlantısı başarılı.');

    await connection.openBox('INBOX');

    // Son 24 saatteki veya okunmamış/tüm bildirim maillerini ara
    const searchCriteria = [
      ['OR', ['FROM', 'mailer-daemon@googlemail.com'], ['HEADER', 'subject', 'Delivery Status Notification']]
    ];
    const fetchOptions = {
      bodies: ['HEADER', 'TEXT'],
      markSeen: false
    };

    const messages = await connection.search(searchCriteria, fetchOptions);
    console.log(`\nToplam tespit edilen iletilemedi (Bounce) bildirimi: ${messages.length}`);

    const bounces = [];

    for (const item of messages) {
      const header = item.parts.find(part => part.which === 'HEADER');
      const subject = header?.body?.subject?.[0] || 'Konusuz';
      const date = header?.body?.date?.[0] || '';
      
      const textPart = item.parts.find(part => part.which === 'TEXT');
      const body = textPart?.body || '';

      // Hatanın hangi e-postaya ait olduğunu bulalım
      // Google bounce maillerinde genellikle "The response from the remote server was: ... to <xyz@domain.com>" veya "Your message wasn't delivered to xyz@domain.com"
      const emailMatches = body.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g) || [];
      const targetEmails = emailMatches.filter(e => 
        !e.includes('googlemail.com') && 
        !e.includes('gmail.com') && 
        !e.includes('google.com')
      );
      const uniqueTargets = [...new Set(targetEmails)];

      // Hata sebebini bulalım
      let reason = 'Bilinmiyor';
      if (body.includes('Address not found') || body.includes('550-5.1.1') || body.includes('550 5.1.1')) {
        reason = 'E-posta adresi bulunamadı (Address not found / 550)';
      } else if (body.includes('Domain not found') || body.includes('DNS')) {
        reason = 'Alan adı (Domain/DNS) geçersiz veya bulunamadı';
      } else if (body.includes('Mailbox is full') || body.includes('Quota')) {
        reason = 'Gelen kutusu dolu (Mailbox full)';
      } else if (body.includes('blocked') || body.includes('Spam')) {
        reason = 'Spam/Güvenlik filtresi reddetti';
      }

      bounces.push({
        date,
        subject,
        failedEmails: uniqueTargets,
        reason
      });
    }

    console.log('\n--- TESPİT EDİLEN HATALI E-POSTALAR LİSTESİ ---');
    const allFailed = new Set();
    bounces.forEach((b, idx) => {
      console.log(`\n[${idx + 1}] Tarih: ${b.date}`);
      console.log(`    Konu : ${b.subject}`);
      console.log(`    Sebep: ${b.reason}`);
      console.log(`    Hedef: ${b.failedEmails.join(', ') || 'Metinden ayrıştırılamadı'}`);
      b.failedEmails.forEach(e => allFailed.add(e));
    });

    console.log('\n=============================================');
    console.log('TÜM GEÇERSİZ / İLETİLEMEYEN E-POSTALAR:');
    console.log([...allFailed]);
    console.log('=============================================');

    fs.writeFileSync(
      path.join(__dirname, '..', 'data', 'bounced-emails.json'),
      JSON.stringify([...allFailed], null, 2),
      'utf8'
    );

    connection.end();
  } catch (err) {
    console.error('IMAP Hatası:', err.message);
    if (connection) connection.end();
  }
}

checkBounces();
