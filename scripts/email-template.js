/**
 * RıdvanSes / Umre Canlı Ses ve Kafile Yönetim Sistemi
 * Acente Pazarlama & B2B Tanıtım E-posta Şablonu
 */

function generateEmail(agency = {}) {
  const firmaAdi = agency.firmaAdi || 'Değerli Acente Yetkilisi';
  const yetkili = agency.yetkili || 'Hac ve Umre Operasyon Yöneticisi';
  const sehir = agency.sehir ? `${agency.sehir} Çıkışlı ` : '';

  const subject = `🕋 ${firmaAdi} İçin Dijital Umre Ses Rehberi & Kafile Sistemi (Kulaklık Cihaz Masrafına Son)`;

  const text = `Sayın ${firmaAdi} Yetkilileri, (${yetkili}),

${sehir}Hac ve Umre kafilelerinizde tavaf, Sa'y ve Mekke/Medine ziyaretlerinde yaşadığınız fiziksel kulaklık cihazı kiralama, şarj çantası taşıma, pil bitmesi ve frekans kopması problemlerine son veren yeni nesil "Canlı Dijital Rehberlik Sistemi"ni firmanıza sunmak istiyoruz.

SİSTEMİN ${firmaAdi} ACENTESİNE KAZANDIRACAKLARI:
1. Cihaz Masrafı Yok: Hacılarımız ek bir kulaklık cihazı taşımadan, kendi cep telefonları üzerinden tek dokunuşla hocanın canlı sesini dinler.
2. Üyelik & Şifre Yok: Yaka kartındaki QR kodu okutarak veya Kafile Kodu ile saniyeler içinde bağlanır.
3. Tavafta Kesintisiz Dinleme: Telefon ekranı kapansa veya cebe konsa bile ses asla kesilmez (Arka Plan Ses & WakeLock Koruması).
4. İki Yönlü Soru-Cevap: Hacı ekrandan "El Kaldırır", rehber hoca konsoldan tek tıkla söz hakkı verir.
5. Canlı GPS SOS Haritası: Kalabalıkta kaybolan hacı 3 saniye basılı tutarak rehbere canlı Google Harita konumunu iletir.
6. Acentenize Özel Markalama (White-Label): Firmanızın kendi logosu, kendi kafile kodları ve kurumsal kimliğiyle kullanım.
7. Suudi Arabistan (Cidde) Bulut Sunucusu: Ses trafiği doğrudan Suudi Arabistan Cidde Veri Merkezi üzerinden yerel STC, Mobily ve Zain hatlarıyla 15–25 ms sıfır gecikmeyle akar (500+ kişilik canlı stres testiyle %100 kesintisizliği belgelenmiştir).

CANLI SİSTEMİ HEMEN İNCELEYİN:
- Canlı Web Portalı (Referans): https://ses.ridvanyilmazturizm.com/
- Acente Tanıtım & Çözüm Dosyası (Örnek PDF): https://ses.ridvanyilmazturizm.com/Selamet_Turizm_Ozel_Sistem_Sunumu.pdf
- Sistem Kullanım Rehberi (PDF): https://ses.ridvanyilmazturizm.com/Ridvan_Yilmaz_Turizm_RidvanSes_Kullanim_Rehberi.pdf
*(Not: Bu canlı altyapı Türkiye'de ilk olarak Rıdvan Yılmaz Turizm kafilelerinde başarıyla hayata geçirilmiştir. Şimdi aynı sistemi firmanızın kendi kurumsal logosu ve kafile kodlarıyla kullanımınıza sunuyoruz.)*

🎁 SIFIR RİSKLİ ÖZEL TEKLİF:
Sistemin kolaylığını, tavafta sağladığı konforu ve hacılarınızın memnuniyetini bizzat tecrübe etmeniz için; İLK UMRE KAFİLENİZDE FİRMANIZA ÖZEL (kendi logonuz, kafile kodunuz ve baskıya hazır A4 QR yaka kartlarınızla) TAMAMEN ÜCRETSİZ kurulum yapıyoruz. Memnun kalırsanız devam edersiniz.

Sistemi ilk kafilenizde ücretsiz denemek veya size özel canlı demo almak için bu e-postayı yanıtlayabilir veya WhatsApp'tan doğrudan ulaşabilirsiniz.

Saygılarımızla,
Semih Bey — Umre Otomasyon & Canlı Ses Sistemleri
WhatsApp / İletişim: +90 545 787 03 48 (0545 787 03 48)
E-posta: otomasyonsistemlerisemih@gmail.com
Canlı Sistem: https://ses.ridvanyilmazturizm.com/

---
Bu bilgilendirme e-postası sektör profesyonellerine özel olarak iletilmiştir. Gelecekte e-posta almak istemiyorsanız bu maili 'İstemiyorum' yazarak yanıtlamanız yeterlidir.`;

  const html = `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
  <style>
    body { margin: 0; padding: 0; background-color: #f4f6f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1f2937; line-height: 1.6; }
    .email-container { max-width: 620px; margin: 24px auto; background: #ffffff; border-radius: 14px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.06); border: 1px solid #e5e7eb; }
    .email-header { background: linear-gradient(135deg, #09372b 0%, #0f5a47 100%); padding: 32px 28px; text-align: center; color: #ffffff; }
    .email-header h1 { margin: 12px 0 6px; font-size: 22px; font-weight: 800; letter-spacing: -0.02em; color: #fbf7ee; }
    .email-header p { margin: 0; font-size: 13px; color: #c4d7cf; text-transform: uppercase; letter-spacing: 0.08em; font-weight: 600; }
    .badge-gold { display: inline-block; background: #d4af37; color: #09372b; font-weight: 800; font-size: 11px; padding: 4px 12px; border-radius: 999px; text-transform: uppercase; }
    .email-body { padding: 32px 28px; }
    .greeting { font-size: 16px; font-weight: 700; color: #0f5a47; margin-bottom: 12px; }
    .lead-text { font-size: 14.5px; color: #374151; margin-bottom: 22px; }
    .features-card { background: #f8faf9; border: 1px solid #d1fae5; border-radius: 12px; padding: 20px; margin-bottom: 24px; }
    .feature-item { display: flex; align-items: flex-start; margin-bottom: 14px; }
    .feature-item:last-child { margin-bottom: 0; }
    .feature-icon { font-size: 18px; margin-right: 12px; line-height: 1.2; flex-shrink: 0; }
    .feature-title { font-weight: 700; font-size: 14px; color: #064e3b; margin-bottom: 2px; }
    .feature-desc { font-size: 13px; color: #4b5563; }
    .cta-container { text-align: center; margin: 28px 0; }
    .btn-primary { display: inline-block; background: #0f5a47; color: #ffffff !important; text-decoration: none; padding: 13px 26px; border-radius: 8px; font-weight: 700; font-size: 14px; box-shadow: 0 4px 12px rgba(15,90,71,0.25); }
    .btn-secondary { display: inline-block; background: #ffffff; color: #0f5a47 !important; border: 1.5px solid #0f5a47; text-decoration: none; padding: 11px 22px; border-radius: 8px; font-weight: 700; font-size: 13px; margin-left: 8px; }
    .stats-row { display: table; width: 100%; margin: 22px 0; border-top: 1px solid #e5e7eb; border-bottom: 1px solid #e5e7eb; padding: 16px 0; }
    .stat-col { display: table-cell; width: 33.33%; text-align: center; }
    .stat-num { font-size: 18px; font-weight: 800; color: #0f5a47; }
    .stat-lbl { font-size: 11px; color: #6b7280; text-transform: uppercase; margin-top: 2px; }
    .email-footer { background: #f9fafb; padding: 22px 28px; text-align: center; font-size: 12px; color: #6b7280; border-top: 1px solid #e5e7eb; }
    .contact-box { background: #ecfdf5; border: 1px dashed #059669; border-radius: 8px; padding: 14px; margin: 20px 0; text-align: center; font-size: 13px; }
  </style>
</head>
<body>

  <div class="email-container">
    <!-- Header -->
    <div class="email-header">
      <span class="badge-gold">🕋 YENİ NESİL UMRE TEKNOLOJİSİ</span>
      <h1>${firmaAdi} İçin Canlı Ses Sistemi</h1>
      <p>Fiziksel Kulaklık Cihazı Masrafı ve Şarj Derdine Son</p>
    </div>

    <!-- Body -->
    <div class="email-body">
      <div class="greeting">Sayın ${firmaAdi} Yetkilileri,</div>
      <div class="lead-text">
        ${sehir}Hac ve Umre kafilelerinizde Kâbe tavafı, Sa'y ve Siyer ziyaretlerinde hacılarınızın hocayı rahatça dinleyebilmesi için her yıl yüksek meblağlarla <strong>cihaz kiralama, şarj çantası taşıma, pil ve kayıp kulaklık masrafları</strong> ile uğraşmaktan yoruldunuz mu?
        <br><br>
        <strong>RıdvanSes</strong>, ek hiçbir cihaza gerek kalmadan, hacılarınızın doğrudan kendi cep telefonları üzerinden çalışan <strong>Canlı Sesli Rehberlik, El Kaldır Soru-Cevap ve GPS Harita Takip Sistemi</strong>dir.
        <br><br>
        <em>Bu teknoloji Türkiye'de ilk olarak <strong>Rıdvan Yılmaz Turizm</strong> kafilelerinde uygulanmış ve yüzlerce hacı ile rüştünü ispatlamıştır. Şimdi aynı güçlü altyapıyı <strong>tamamen ${firmaAdi} adına ve logonuzla (White-Label)</strong> firmanızın hizmetine sunuyoruz.</em>
      </div>

      <!-- Feature Card -->
      <div class="features-card">
        <div class="feature-item">
          <div class="feature-icon">🎧</div>
          <div>
            <div class="feature-title">Ek Cihaz Yok — Hacının Kendi Telefonu</div>
            <div class="feature-desc">Hacılarınız üyelik/şifre girmeden sadece Yaka Kartındaki QR kodu okutarak veya kafile kodunu girerek yayına bağlanır.</div>
          </div>
        </div>

        <div class="feature-item">
          <div class="feature-icon">🔒</div>
          <div>
            <div class="feature-title">Tavafta Ekran Kilitliyken Kesintisiz Dinleme</div>
            <div class="feature-desc">Özel arka plan ses motoru ve WakeLock teknolojisi sayesinde telefon cebe konsa bile hocanın sesi asla kesilmez.</div>
          </div>
        </div>

        <div class="feature-item">
          <div class="feature-icon">🎙️</div>
          <div>
            <div class="feature-title">İki Yönlü El Kaldır (Söz İste)</div>
            <div class="feature-desc">Hacı ekrandan söz ister; rehber hoca panelden tek tıkla mikrofon yetkisi vererek sorusunu tüm kafileye dinletir.</div>
          </div>
        </div>

        <div class="feature-item">
          <div class="feature-icon">📍</div>
          <div>
            <div class="feature-title">Kaybolan Hacı İçin Canlı GPS SOS Haritası</div>
            <div class="feature-desc">Tavafta veya otel yolunda kaybolan hacı 3 saniye basılı tutarak rehbere anlık Google Harita koordinatını iletir.</div>
          </div>
        </div>

        <div class="feature-item">
          <div class="feature-icon">🏷️</div>
          <div>
            <div class="feature-title">${firmaAdi} İçin Özel Markalama (White-Label)</div>
            <div class="feature-desc">Sistem tamamen firmanızın adı, kurumsal renkleri ve kendi kafile kodlarınızla hazır teslim edilir.</div>
          </div>
        </div>

        <div class="feature-item">
          <div class="feature-icon">🇸🇦</div>
          <div>
            <div class="feature-title">Suudi Arabistan (Cidde) Bulut Sunucusu (15–25 ms)</div>
            <div class="feature-desc">Ses akışı doğrudan Cidde Veri Merkezi üzerinden yerel STC, Mobily ve Zain operatör hatlarıyla sıfır gecikmeyle hacıya ulaşır. 500+ eşzamanlı hacı ile test edilmiş %100 kesintisiz altyapı.</div>
          </div>
        </div>
      </div>

      <!-- Stats -->
      <div class="stats-row">
        <div class="stat-col">
          <div class="stat-num">%0 Cihaz</div>
          <div class="stat-lbl">Kiralama Maliyeti</div>
        </div>
        <div class="stat-col">
          <div class="stat-num">Tek Dokunuş</div>
          <div class="stat-lbl">QR ile Katılım</div>
        </div>
        <div class="stat-col">
          <div class="stat-num">6 Farklı Dil</div>
          <div class="stat-lbl">Çok Uluslu Destek</div>
        </div>
      </div>

      <!-- Free Trial Banner -->
      <div style="background: linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%); border: 2px solid #f59e0b; border-radius: 12px; padding: 22px 20px; margin: 26px 0; text-align: center; box-shadow: 0 4px 14px rgba(245, 158, 11, 0.12);">
        <span style="display: inline-block; background: #b45309; color: #ffffff; font-weight: 800; font-size: 11px; padding: 4px 14px; border-radius: 999px; text-transform: uppercase; margin-bottom: 8px; letter-spacing: 0.05em;">🎁 SIFIR RİSKLE DENEYİN</span>
        <h3 style="margin: 6px 0 8px; font-size: 17px; font-weight: 800; color: #78350f;">İlk Umre Kafilenizde %100 ÜCRETSİZ Kurulum & Test İmkanı</h3>
        <p style="margin: 0; font-size: 13.5px; color: #92400e; line-height: 1.55;">
          Sistemin tavafta sağladığı kolaylığı ve hacılarınızın memnuniyetini bizzat görmeniz için; <strong>ilk umre kafilenizde firmanıza özel (kendi logonuz, kafile kodunuz ve baskıya hazır A4 QR yaka kartlarınızla) tamamen ÜCRETSİZ</strong> kurulum yapıyoruz. Memnun kalırsanız devam edersiniz.
        </p>
      </div>

      <!-- Action Buttons -->
      <div class="cta-container">
        <a href="https://ses.ridvanyilmazturizm.com/" target="_blank" class="btn-primary">🌐 Canlı Sistemi Hemen Test Edin</a>
        <a href="https://ses.ridvanyilmazturizm.com/Selamet_Turizm_Ozel_Sistem_Sunumu.pdf" target="_blank" class="btn-secondary">📄 Örnek Tanıtım Dosyası (PDF)</a>
      </div>

      <!-- Contact Info Box -->
      <div class="contact-box">
        <strong>${firmaAdi} kafilelerinizde bu sistemi test etmek veya acentenize özel demo kurmamız için:</strong><br>
        Bu e-postayı doğrudan yanıtlayabilir veya WhatsApp'tan ulaşabilirsiniz:<br>
        📞 <strong>WhatsApp / Tel:</strong> <a href="https://wa.me/905457870348" style="color:#059669; font-weight:700;">+90 545 787 03 48</a> &nbsp;|&nbsp; ✉️ <strong>E-posta:</strong> otomasyonsistemlerisemih@gmail.com
      </div>

      <p style="font-size:13px; color:#4b5563; margin-top:16px;">
        Hayırlı ve bereketli sezonlar dileriz.<br>
        <strong>Semih Bey</strong><br>
        <span style="font-size:12px; color:#6b7280;">Umre Kafile Yönetim & Canlı Ses Sistemleri</span>
      </p>
    </div>

    <!-- Footer -->
    <div class="email-footer">
      <p style="margin: 0 0 6px;">Bu tanıtım e-postası, hac ve umre organizasyonu yapan turizm acentelerine sektörel bilgilendirme amacıyla iletilmiştir.</p>
      <p style="margin: 0;">Gelecekte benzer bilgilendirme almak istemiyorsanız bu e-postayı <strong>"İstemiyorum"</strong> yazarak yanıtlayabilirsiniz.</p>
    </div>
  </div>

</body>
</html>`;

  return { subject, text, html };
}

module.exports = { generateEmail };
