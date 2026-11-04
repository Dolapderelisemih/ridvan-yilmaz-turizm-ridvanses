const imaps = require('imap-simple');
const fs = require('fs');
const path = require('path');

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

async function printBounceDetails() {
  const connection = await imaps.connect(config);
  await connection.openBox('INBOX');

  const searchCriteria = [
    ['SINCE', 'October 23, 2026'],
    ['OR', ['FROM', 'mailer-daemon@googlemail.com'], ['HEADER', 'subject', 'Delivery Status Notification']]
  ];
  const fetchOptions = {
    bodies: ['HEADER', 'TEXT'],
    markSeen: false
  };

  const messages = await connection.search(searchCriteria, fetchOptions);
  console.log(`Bugünkü toplam hata sayısı: ${messages.length}`);

  for (let i = 0; i < messages.length; i++) {
    const item = messages[i];
    const textPart = item.parts.find(p => p.which === 'TEXT');
    const body = textPart ? textPart.body : '';
    console.log(`\n=================== HATA DETAYI #${i + 1} ===================`);
    // Extract the error message lines
    const lines = body.split('\n');
    const relevantLines = lines.filter(l => 
      l.includes('The response was') || 
      l.includes('The response from the remote server was') ||
      l.includes('550') ||
      l.includes('DNS') ||
      l.includes('not found') ||
      l.includes('failed') ||
      l.includes('Technical details of permanent failure')
    );
    console.log(relevantLines.slice(0, 5).join('\n'));
  }

  connection.end();
}

printBounceDetails().catch(console.error);
