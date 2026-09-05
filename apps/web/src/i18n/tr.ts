import { type Dictionary } from './types';

export const tr: Dictionary = {
  meta: {
    siteName: 'Dijital Asistan',
    tagline: 'Bugün bilmen gerekenleri, sen sormadan söyler.',
    description:
      'Dijital Asistan mailini, takvimini ve açık işlerini anlayıp her gün sana kısa bir brifing hazırlar. iOS ve Android için proaktif kişisel asistan.',
    ogSubtitle: 'Mail · Takvim · Görevler · Her sabah tek brifingde',
  },
  nav: {
    howItWorks: 'Nasıl çalışır?',
    security: 'Güvenlik',
    pricing: 'Fiyatlandırma',
    support: 'Destek',
    cta: 'Ücretsiz Başla',
    skipToContent: 'İçeriğe atla',
    language: 'Dil',
    switchTo: 'English',
    switchToLang: 'en',
    home: 'Ana sayfa',
  },
  hero: {
    kicker: 'iOS ve Android için kişisel asistan',
    title: 'Bugün bilmen gerekenleri, sen sormadan söyler.',
    subtitle:
      'Dijital Asistan mailini, takvimini ve açık işlerini anlayıp her gün sana kısa bir brifing hazırlar.',
    ctaPrimary: 'Ücretsiz Başla',
    ctaSecondary: 'Nasıl Çalışır?',
    note: 'Sen onaylamadan hiçbir şey göndermez. Ücretsiz planla başla, hazır olduğunda Pro’ya geç.',
    phoneLabel: 'Bugün ekranı: sabah brifingi ve günün öncelikleri',
  },
  phone: {
    time: '9:41',
    date: '5 EYLÜL CUMARTESİ',
    greeting: 'Günaydın, Yunus',
    avatar: 'Y',
    briefKicker: 'BRİFİNG HAZIR · 07:58',
    briefTitleBefore: 'Bugün bilmen gereken ',
    briefCount: '5',
    briefTitleAfter: ' şey var.',
    briefMeta: '3 önemli mail · 4 etkinlik · 2 takip',
    ctaSee: 'Brifingimi Gör',
    ctaListen: 'Dinle · 2 dk',
    priorities: 'ÖNCELİKLERİN',
    cards: [
      {
        badge: 'ACİL',
        tone: 'critical',
        time: '08:42',
        title: 'Ahmet senden bugün 17:00’ye kadar revize teklif bekliyor.',
        source: 'Gmail · Ahmet Yılmaz · 08:42',
      },
      {
        badge: 'TOPLANTI',
        tone: 'neutral',
        time: '14:30',
        title: '14:30 Mehmet ile müşteri toplantısı. Son görüşmeniz 4 gün önceydi.',
        source: 'Google Takvim · Müşteri toplantısı · 60 dk',
      },
      {
        badge: 'SON TARİH',
        tone: 'deadline',
        time: '17:00',
        title: 'Başvuru bugün 17:00’de kapanıyor.',
        source: 'Gmail · Girişim Programı · Dün 16:10',
      },
    ],
    tabs: ['Bugün', 'Akış', 'Plan', 'Asistan'],
  },
  integrations: {
    kicker: 'BAĞLANTILAR',
    title: 'Zaten kullandığın araçlarla çalışır.',
    note: 'En az bir mail ve bir takvim bağladığında başlar. Apple Takvim cihazdan okunur; ayrı giriş gerekmez.',
    items: [
      { name: 'Gmail', kind: 'mail' },
      { name: 'Outlook', kind: 'mail' },
      { name: 'Google Takvim', kind: 'calendar' },
      { name: 'Microsoft Takvim', kind: 'calendar' },
      { name: 'Apple Takvim', kind: 'calendar' },
      { name: 'Google Tasks', kind: 'tasks' },
      { name: 'Microsoft To Do', kind: 'tasks' },
    ],
  },
  how: {
    kicker: 'NASIL ÇALIŞIR?',
    title: 'Üç adımda, her sabah hazır.',
    subtitle:
      'Kurulum birkaç dakika sürer. Sonrasında asistan arka planda çalışır; sen yalnızca önemli olanı görürsün.',
    steps: [
      {
        title: 'Hesaplarını bağla',
        body: 'Gmail veya Outlook’unu ve takvimini bağla. Her izin öncesinde neye, neden ihtiyaç duyduğumuzu açıkça söyleriz; yazma izinleri ancak sen bir işlemi onayladığında istenir.',
      },
      {
        title: 'Asistan analiz eder',
        body: 'Mailler, etkinlikler ve görevler tek akışta okunur. Cevap bekleyenler, son tarihler, teklifler ve sözleşmeler öne çıkar; promosyonlar ve bildirimler sessizce arka planda kalır.',
      },
      {
        title: 'Brifingin hazır',
        body: 'Her sabah seçtiğin saatte kısa bir özet: öncelikler, program, senden cevap bekleyenler, son tarihler. Okumak istemezsen 2 dakikada dinle.',
      },
    ],
  },
  briefing: {
    kicker: 'SABAH BRİFİNGİ',
    title: 'Gününü sen sormadan hazırlarız.',
    body: 'Her sabah, o güne özel kısa bir brifing: öncelikler, program, senden cevap bekleyenler, son tarihler ve kişisel gelişmeler. Her satırın kaynağı görünür; bir dokunuşla ilgili maile ya da etkinliğe gidersin.',
    bullets: [
      'Sesli brifing: bölüm bölüm, 2 dakikada',
      'Öğle nabzı ve akşam kapanışı ile gün boyu güncel (Pro)',
      'Haftalık özet: neler tamamlandı, ne kadar zaman kazandın',
    ],
    cardKicker: 'SABAH BRİFİNGİ · 08:00',
    cardGreeting: 'Günaydın, Yunus',
    cardBody:
      'Öğlene kadar toplantın bulunmuyor. Saat 14:30’da Mehmet ile müşteri toplantın var. Gelen 46 mail arasında 3 konu dikkat gerektiriyor.',
    cardCta: 'Brifingi Dinle · 2 dk',
  },
  mail: {
    kicker: 'MAİL ZEKÂSI',
    title: '83 mail. Gerçekten önemli olan 4.',
    subtitle: 'Gerisini senin için okur.',
    body: 'Gelen kutunu tarar; cevap bekleyenleri, son tarihleri, teklifleri ve sözleşmeleri ayırt eder. Her önemli konu tek cümlelik bir özet ve kaynağıyla gelir.',
    bullets: [
      'Kim senden cevap bekliyor? Unutulan mail kalmaz.',
      'Gönderdiğin ve cevap gelmeyen mailleri takip eder; takip mesajı hazırlar (Pro)',
      'Kargo, uçuş, ödeme ve abonelik sinyalleri mail içeriğinden türetilir; ek entegrasyon gerekmez',
    ],
    count: '83',
    countLabel: 'mail geldi',
    attentionBefore: '',
    attentionCount: '4',
    attentionAfter: ' tanesi dikkat gerektiriyor.',
    cards: [
      {
        initials: 'AY',
        tint: 'warm',
        name: 'Ahmet Yılmaz',
        badge: 'ACİL',
        summary: 'Revize fiyat teklifini bugün 17:00’ye kadar PDF olarak istiyor.',
      },
      {
        initials: 'SK',
        tint: 'green',
        name: 'Selin Kaya',
        meta: 'Dün',
        summary: 'Sözleşme taslağının 4. maddesi için yorumunu bekliyor.',
      },
    ],
  },
  meeting: {
    kicker: 'TOPLANTI HAZIRLIĞI',
    title: 'Toplantıya hazırlıksız girme.',
    subtitle: '20 dakika önce: konuşman gereken 3 şey.',
    body: 'Toplantıdan önce karşı tarafla son yazışmaların, açık konular ve karşılıklı beklentiler tek kartta toplanır. Toplantı bitince verdiğin sözleri yakalar, takibe alır.',
    screenKicker: 'TOPLANTIYA HAZIRLAN',
    countdown: '18 dk',
    person: 'Mehmet Yılmaz',
    personMeta: 'Müşteri toplantısı · 14:30 · 60 dk',
    aiKicker: 'KONUŞMAN GEREKEN 3 ŞEY',
    points: [
      { title: 'Fiyat', detail: 'Revize teklif 17:00’ye kadar bekleniyor.' },
      { title: 'Teslim tarihi', detail: 'Ekim başı için onay istiyor.' },
      { title: 'Sözleşme', detail: 'Taslak 2 haftadır açık.' },
    ],
  },
  planning: {
    kicker: 'TAKVİM ZEKÂSI',
    title: 'Takvimini sadece göstermez. Anlar.',
    body: 'Boşlukları bulur, çakışmaları önce görür, yol süresini hesaba katar ve görevlerini uygun saatlere yerleştirmeyi önerir. Takvimine dokunmadan önce senden onay ister.',
    screenTitle: 'Plan',
    aiKicker: 'TAKVİM ZEKÂSI',
    aiTitle: 'Yarın 14:00–16:30 arasında 2,5 saat boşluğun var.',
    aiDetail: 'Teklif hazırlama görevini buraya yerleştirebilirim.',
    aiCta: 'Planla',
    insights: [
      {
        title: 'Yarın oldukça yoğun.',
        detail: '09:00 ve 10:00 toplantıların arka arkaya.',
        tone: 'warning',
      },
      {
        title: '13:30 doktor için 12:50’de çıkman gerekebilir.',
        detail: '38 dk trafik tahmini',
        tone: 'info',
      },
    ],
  },
  memory: {
    kicker: 'ASİSTAN VE HAFIZA',
    title: 'Dijital hayatına sor.',
    subtitle: 'Mailin, takvimin ve notların tek hafızada.',
    body: 'Sorularına kaynak göstererek cevap verir. Seni zamanla öğrenir: kimler önemli, hangi konular öncelikli, ne zaman hatırlatmalı. Her öneri düzeltilebilir; “bunu daha az göster” dediğinde öğrenir.',
    screenTitle: 'Asistan',
    user: 'Mehmet ile en son ne konuştuk?',
    assistant:
      '1 Eylül’de fiyat ve teslim tarihini konuştunuz. Mehmet Ekim başı teslim için revize teklif istedi; sen Cuma göndereceğini söyledin.',
    sourcesKicker: 'KAYNAKLAR',
    sources: [
      { label: 'Re: Teklif · Gmail', date: '1 Eyl', kind: 'mail' },
      { label: 'Görüşme notları', date: '1 Eyl', kind: 'call' },
    ],
  },
  security: {
    kicker: 'GÜVENLİK VE GİZLİLİK',
    title: 'Kontrol her zaman sende.',
    subtitle:
      'Neyi okuduğumuzu, ne kadar sakladığımızı ve nasıl sileceğini uygulamanın içinden her zaman görebilirsin.',
    promises: [
      {
        title: 'Sen onaylamadan mail göndermeyiz.',
        body: 'Mail gönderme, etkinlik oluşturma veya taşıma gibi her işlem önce Onay Merkezi’ne düşer. Yazma izinleri yalnızca ilk onayında, ayrı bir adımda istenir.',
      },
      {
        title: 'Verilerin reklamverenlere satılmaz.',
        body: 'Reklam profili çıkarmayız, üçüncü taraflara pazarlama amacıyla veri vermeyiz. Mail içeriklerin yapay zekâ modellerini eğitmek için kullanılmaz.',
      },
      {
        title: 'Veriler aktarım sırasında ve saklanırken şifrelenir.',
        body: 'Bağlantılar TLS ile korunur; OAuth belirteçleri sunucuda şifreli tutulur. Ham mail gövdeleri hafızaya yazılmaz; yalnızca özetler ve seçili alıntılar saklanır.',
      },
      {
        title: 'Ne kadar saklanacağına sen karar verirsin.',
        body: '30 gün, 90 gün, 1 yıl ya da sen silene kadar. Verilerini indirebilir, analiz geçmişini veya hesabını tamamen silebilirsin.',
      },
    ],
    links: {
      privacy: 'Gizlilik Politikası',
      oauth: 'Hangi izinleri, neden istiyoruz?',
      deletion: 'Veri silme',
    },
  },
  pricing: {
    kicker: 'FİYATLANDIRMA',
    title: 'Ücretsiz başla. Hazır olduğunda Pro’ya geç.',
    subtitle:
      'Free şeffaf: 1 mail, 1 takvim, sabah brifingi, sınırlı AI. Pro tüm dijital hayatını tek brifingde toplar.',
    freeName: 'Free',
    proName: 'Pro',
    freePrice: '0 TL',
    freeNote: 'Her zaman ücretsiz',
    monthly: 'Aylık',
    annual: 'Yıllık',
    monthlyPrice: '199 TL / ay',
    annualPrice: '1.490 TL / yıl',
    annualDetail: 'ayda 124 TL · %38 tasarruf',
    bestValue: 'En Avantajlı',
    perMonthLabel: 'ay',
    trialNote:
      '7 gün ücretsiz deneme — mağaza koşullarına bağlı. Deneme bitmeden 24 saat önce hatırlatırız; istediğin zaman iptal edebilirsin.',
    storeNote:
      'Abonelikler App Store veya Google Play üzerinden alınır ve yönetilir. Fiyatlar KDV dahildir; mağaza yerel para birimine göre farklılık gösterebilir.',
    tableFeature: 'Özellik',
    rows: [
      { label: 'Bağlı mail hesabı', free: '1', pro: '10’a kadar' },
      { label: 'Bağlı takvim', free: '1', pro: '10’a kadar' },
      { label: 'Sabah brifingi', free: '✓', pro: '✓' },
      { label: 'Öğle nabzı ve akşam kapanışı', free: '—', pro: '✓' },
      { label: 'Toplantı hazırlığı', free: '—', pro: '✓' },
      { label: 'Akıllı takip ve taahhütler', free: '—', pro: '✓' },
      { label: 'Sesli brifing', free: '—', pro: '✓' },
      { label: 'AI hafıza ve VIP kişiler', free: '—', pro: '✓' },
      { label: 'Gelişmiş planlama', free: '—', pro: '✓' },
      { label: 'Asistan soruları', free: '10 / gün', pro: '300 / gün' },
    ],
    ctaPro: 'Pro’yu 7 gün ücretsiz dene',
    ctaFree: 'Free ile başla',
    included: 'Free plana dahil',
    proIncludes: [
      'Sınırsız AI analiz, birden fazla hesap',
      'Öğle ve akşam brifingi',
      'Toplantı hazırlığı',
      'Akıllı takip ve taahhütler',
      'Sesli brifing',
      'AI hafıza ve VIP kişiler',
      'Gelişmiş planlama',
    ],
  },
  faq: {
    kicker: 'SIK SORULANLAR',
    title: 'Merak edilenler',
    items: [
      {
        q: 'Dijital Asistan maillerimi okuyor mu?',
        a: 'Evet; bağladığın hesaplardaki mailleri, önemli olanları bulmak ve özetlemek için okur. Ham mail gövdeleri hafızaya yazılmaz; yalnızca özetler ve seçili alıntılar, senin belirlediğin süre boyunca saklanır. Hangi verilere eriştiğimizi Ayarlar → Gizlilik ve Güvenlik altında görebilirsin.',
      },
      {
        q: 'Benim adıma mail gönderebilir mi?',
        a: 'Sen onaylamadan hayır. Yanıt taslakları ve takip mesajları Onay Merkezi’ne düşer; gönderme izni yalnızca ilk onayında ve ayrı bir adımda istenir. Takvim değişiklikleri için de aynı kural geçerlidir.',
      },
      {
        q: 'Hangi hesaplar destekleniyor?',
        a: 'Gmail, Outlook (Microsoft 365 ve kişisel hesaplar), Google Takvim, Microsoft Takvim, Apple Takvim (cihazdan), Google Tasks ve Microsoft To Do. Free planda 1 mail ve 1 takvim, Pro’da 10’a kadar hesap bağlayabilirsin.',
      },
      {
        q: 'Ücretsiz plan neleri içeriyor?',
        a: 'Bir mail ve bir takvim bağlantısı, her sabah brifing, günlük 10 asistan sorusu ve mail zekâsının temel kısmı. Kredi kartı gerekmez, süre sınırı yoktur.',
      },
      {
        q: 'Deneme süresi nasıl işliyor?',
        a: 'Pro planlar için 7 günlük ücretsiz deneme sunulur; deneme koşulları App Store ve Google Play kurallarına bağlıdır. Deneme bitmeden 24 saat önce hatırlatırız. İptal edersen ücret alınmaz; etmezsen seçtiğin plan başlar.',
      },
      {
        q: 'Verilerim uçtan uca şifreli mi?',
        a: 'Veriler aktarım sırasında (TLS) ve saklanırken şifrelenir; OAuth belirteçleri ayrıca şifrelenir. Özetleri üretebilmek için sunucularımız içeriği işler; bu nedenle uçtan uca şifreleme değildir ve bunu iddia etmeyiz.',
      },
      {
        q: 'Verilerim yapay zekâ modellerini eğitmek için kullanılıyor mu?',
        a: 'Hayır. Verilerin yalnızca senin brifingini, özetlerini ve cevaplarını üretmek için işlenir. AI sağlayıcılarımızla yaptığımız sözleşmeler, gönderilen verilerin model eğitiminde kullanılmamasını gerektirir.',
      },
      {
        q: 'Hesabımı ve verilerimi nasıl silerim?',
        a: 'Uygulamada Ayarlar → Gizlilik ve Güvenlik → Hesabımı Sil adımını izle. Bağlantı izinleri iptal edilir, tüm veriler ve abonelik eşlemesi 30 gün içinde kalıcı olarak silinir. Dilersen gizlilik@dijitalasistan.app adresine de yazabilirsin.',
      },
    ],
  },
  finalCta: {
    title: 'Yarın sabah brifingin hazır olsun.',
    body: 'Hesabını bağla; ilk analiz birkaç dakika sürer. Ertesi sabah seçtiğin saatte ilk brifingin seni bekliyor.',
    cta: 'Ücretsiz Başla',
    note: 'iOS ve Android · Ücretsiz planla başla · Sen onaylamadan hiçbir şey göndermez',
  },
  download: {
    kicker: 'İNDİR',
    title: 'Uygulamayı telefonuna kur.',
    bodyStores:
      'iOS için App Store’dan, Android için Google Play’den indir. Aynı hesapla iki platformda da kullanabilirsin.',
    bodyBeta:
      'Dijital Asistan şu anda davetli beta aşamasında. iOS için TestFlight, Android için Google Play dahili test erişimi almak üzere bize yaz; davetini genellikle bir iş günü içinde gönderiyoruz.',
    appStore: 'App Store',
    googlePlay: 'Google Play',
    appStoreSub: 'iPhone için',
    googlePlaySub: 'Android için',
    requestAccess: 'Beta erişimi iste',
    requestSubject: 'Dijital Asistan beta erişimi',
  },
  footer: {
    tagline: 'Bugün bilmen gerekenleri, sen sormadan söyler.',
    product: 'Ürün',
    legal: 'Yasal',
    contact: 'İletişim',
    privacy: 'Gizlilik Politikası',
    terms: 'Kullanım Şartları',
    dataDeletion: 'Veri Silme',
    oauth: 'OAuth İzinleri',
    support: 'Destek',
    rights: 'Tüm hakları saklıdır.',
    languageLabel: 'Dil',
  },
  pricingPage: {
    title: 'Fiyatlandırma',
    description:
      'Dijital Asistan Free ve Pro planları: 199 TL/ay veya 1.490 TL/yıl, 7 gün ücretsiz deneme. Şeffaf karşılaştırma, gizli koşul yok.',
    billingTitle: 'Ödeme, yenileme ve iptal',
    billing: [
      'Pro abonelikleri App Store (iOS) veya Google Play (Android) üzerinden satın alınır; ödeme mağaza hesabından tahsil edilir.',
      'Ücretsiz deneme yalnızca ilk abonelikte ve mağaza koşulları izin verdiğinde sunulur. Deneme bitmeden en az 24 saat önce iptal edersen ücret alınmaz.',
      'Abonelik, dönem sonunda otomatik yenilenir; iptal etmediğin sürece aynı fiyattan devam eder. Fiyat değişikliklerinde mağaza kuralları gereği önceden bilgilendirilirsin.',
      'İptal ve iade talepleri mağaza politikalarına tabidir: iOS için App Store abonelik ayarları, Android için Google Play abonelikler bölümü. Uygulama içinden “Aboneliği yönet” bağlantısı seni doğru yere götürür.',
      'Pro’dan Free’ye dönersen bağlı hesapların ve verilerin kalır; yalnızca Pro’ya özel özellikler kapanır.',
    ],
    referralTitle: 'Arkadaşını davet et',
    referralBody:
      'Davet ettiğin kişi ilk brifingini aldığında ikiniz de 14 gün Pro kazanırsınız. Davet bağlantını uygulamada Ayarlar → Arkadaşını Davet Et altında bulabilirsin.',
    faqTitle: 'Fiyatlandırma hakkında sık sorulanlar',
  },
  supportPage: {
    title: 'Destek',
    description:
      'Dijital Asistan destek: bağlantı sorunları, bildirimler, abonelik ve hesap silme. Genellikle 1–2 iş günü içinde yanıt veririz.',
    intro:
      'Bir sorun mu var, bir fikrin mi? Bize yaz; genellikle 1–2 iş günü içinde yanıt veririz.',
    emailLabel: 'E-posta',
    responseTime: 'Yanıt süresi: genellikle 1–2 iş günü',
    inAppTitle: 'Uygulama içinden yaz',
    inAppBody:
      'Ayarlar → Geri Bildirim adımından bize yazabilirsin. İstersen tanılama bilgilerini ekleyebilirsin; bu bilgiler mail içeriği içermez.',
    topicsTitle: 'Sık karşılaşılan konular',
    topics: [
      {
        title: 'Bağlantı kurulamıyor veya süresi doldu',
        body: 'Ayarlar → Bağlantılar altında ilgili hesabın yanındaki “Yeniden bağlan” seçeneğini kullan. Kurumsal Microsoft hesaplarında yönetici onayı gerekebilir; bu durumda yöneticinden Dijital Asistan uygulamasına izin vermesini iste.',
      },
      {
        title: 'Bildirim gelmiyor',
        body: 'Sistem ayarlarında bildirimlerin açık olduğundan ve uygulama içinde Ayarlar → Bildirimler altında ilgili kategorinin etkin olduğundan emin ol. Sessiz saatler ve “Yalnızca gerçekten önemliyse bildir” ayarı bildirimleri azaltabilir.',
      },
      {
        title: 'Abonelik, deneme ve iade',
        body: 'Abonelikler App Store veya Google Play üzerinden yönetilir. Ayarlar → Abonelik → Aboneliği yönet seni mağazaya götürür. Satın alımını göremiyorsan “Satın alımları geri yükle” seçeneğini dene.',
      },
      {
        title: 'Verilerimi indirmek veya silmek istiyorum',
        body: 'Ayarlar → Gizlilik ve Güvenlik altında verilerini JSON olarak indirebilir, analiz geçmişini silebilir veya hesabını tamamen kapatabilirsin. Ayrıntılar Veri Silme sayfasında.',
      },
    ],
    linksTitle: 'Faydalı bağlantılar',
  },
  oauthPage: {
    title: 'OAuth izinleri',
    description:
      'Dijital Asistan’ın Google ve Microsoft hesaplarından hangi izinleri, neden ve ne zaman istediği; izinleri nasıl kaldıracağın.',
    intro:
      'Dijital Asistan, mailini ve takvimini anlamak için Google ve Microsoft hesaplarına OAuth ile bağlanır. Bu sayfa hangi izinleri, neden ve ne zaman istediğimizi tek tek açıklar. Şifreni asla görmeyiz; erişim sana ait bir belirteçle sağlanır ve istediğin an geri alınabilir.',
    principlesTitle: 'İlkelerimiz',
    principles: [
      {
        title: 'En az yetki',
        body: 'Başlangıçta yalnızca okuma izinleri istenir. Bir özelliğin çalışması için gerekmeyen hiçbir izin talep edilmez.',
      },
      {
        title: 'Kademeli yazma izni',
        body: 'Mail gönderme, etkinlik oluşturma veya görev ekleme izinleri ancak sen ilk kez böyle bir işlemi onayladığında, ayrı bir izin ekranıyla istenir.',
      },
      {
        title: 'Onaysız işlem yok',
        body: 'Yazma izni verilmiş olsa bile her gönderim ve takvim değişikliği önce Onay Merkezi’ne düşer. Sen onaylamadan hiçbir şey gönderilmez.',
      },
      {
        title: 'Şeffaf kapsam',
        body: 'Verilen izinler uygulamada Ayarlar → Gizlilik ve Güvenlik → Bağlı Hesaplar altında düz Türkçe olarak listelenir.',
      },
    ],
    googleTitle: 'Google (Gmail, Google Takvim, Google Tasks)',
    googleIntro:
      'Google hesabını bağladığında aşağıdaki okuma izinleri istenir. Yazma izinleri ancak ilgili işlemi ilk kez onayladığında talep edilir.',
    googleRead: [
      {
        scope: 'openid · email · profile',
        label: 'Kimlik',
        why: 'Hesabını tanımak, e-posta adresini ve adını göstermek. Başka bir amaçla kullanılmaz.',
        when: 'Giriş ve ilk bağlantı',
      },
      {
        scope: 'gmail.readonly',
        label: 'Mail okuma',
        why: 'Önemli mailleri bulmak, senden cevap bekleyenleri ve son tarihleri tespit etmek, tek cümlelik özetler üretmek. Kargo, uçuş, ödeme ve abonelik sinyalleri de mail içeriğinden türetilir.',
        when: 'Gmail bağlantısı',
      },
      {
        scope: 'calendar.readonly',
        label: 'Takvim okuma',
        why: 'Günün programını anlamak, çakışmaları görmek, toplantıya hazırlık kartı üretmek ve uygun boşlukları önermek.',
        when: 'Google Takvim bağlantısı',
      },
      {
        scope: 'tasks.readonly',
        label: 'Görev okuma',
        why: 'Google Tasks listelerindeki açık görevleri brifinge ve planlamaya dahil etmek.',
        when: 'Google Tasks bağlantısı (isteğe bağlı)',
      },
    ],
    googleWrite: [
      {
        scope: 'gmail.send',
        label: 'Mail gönderme',
        why: 'Onay Merkezi’nde onayladığın yanıt ve takip mesajlarını senin adına göndermek. Yalnızca onayladığın mailler, onayladığın içerikle gönderilir.',
        when: 'İlk mail onayında',
      },
      {
        scope: 'calendar.events',
        label: 'Etkinlik oluşturma ve taşıma',
        why: 'Onayladığın etkinlikleri takvime eklemek veya taşımak (örneğin mailde tespit edilen bir son tarih ya da önerilen bir odak bloğu).',
        when: 'İlk takvim onayında',
      },
      {
        scope: 'tasks',
        label: 'Görev oluşturma',
        why: 'Onayladığın görevleri Google Tasks’a eklemek.',
        when: 'İlk görev onayında',
      },
    ],
    microsoftTitle: 'Microsoft (Outlook, Microsoft Takvim, Microsoft To Do)',
    microsoftIntro:
      'Kişisel Microsoft hesapları ve Microsoft 365 iş hesapları desteklenir. Kurumsal hesaplarda yalnızca sana verilen izinler kullanılır; şirket politikaların geçerli kalır.',
    microsoftRead: [
      {
        scope: 'openid · email · profile · offline_access · User.Read',
        label: 'Kimlik ve oturum',
        why: 'Hesabını tanımak ve bağlantıyı her seferinde yeniden giriş istemeden sürdürebilmek (yenileme belirteci).',
        when: 'Giriş ve ilk bağlantı',
      },
      {
        scope: 'Mail.Read',
        label: 'Mail okuma',
        why: 'İş maillerinde önemli konuları bulmak, cevap bekleyen konuşmaları anlamak, teklif, sözleşme ve son tarihleri tespit etmek.',
        when: 'Outlook bağlantısı',
      },
      {
        scope: 'Calendars.Read',
        label: 'Takvim okuma',
        why: 'Günün programını anlamak, çakışmaları görmek, toplantı hazırlığı üretmek.',
        when: 'Microsoft Takvim bağlantısı',
      },
      {
        scope: 'Tasks.Read',
        label: 'Görev okuma',
        why: 'Microsoft To Do listelerindeki açık görevleri brifinge dahil etmek.',
        when: 'Microsoft To Do bağlantısı (isteğe bağlı)',
      },
    ],
    microsoftWrite: [
      {
        scope: 'Mail.Send',
        label: 'Mail gönderme',
        why: 'Onayladığın yanıt ve takip mesajlarını senin adına göndermek.',
        when: 'İlk mail onayında',
      },
      {
        scope: 'Calendars.ReadWrite',
        label: 'Etkinlik oluşturma ve taşıma',
        why: 'Onayladığın etkinlikleri takvime eklemek veya taşımak.',
        when: 'İlk takvim onayında',
      },
      {
        scope: 'Tasks.ReadWrite',
        label: 'Görev oluşturma',
        why: 'Onayladığın görevleri Microsoft To Do’ya eklemek.',
        when: 'İlk görev onayında',
      },
    ],
    readHeading: 'Okuma izinleri (bağlantı sırasında)',
    writeHeading: 'Yazma izinleri (kademeli, yalnızca onayınla)',
    colScope: 'Kapsam',
    colLabel: 'Ne',
    colWhy: 'Neden',
    colWhen: 'Ne zaman istenir',
    appleTitle: 'Apple Takvim ve Hatırlatıcılar',
    appleBody:
      'Apple Takvim ve Hatırlatıcılar OAuth kullanmaz; iOS’un kendi izin ekranıyla cihazdan okunur. Verilen izni iOS Ayarlar → Gizlilik ve Güvenlik → Takvimler altından istediğin an değiştirebilirsin.',
    dataUseTitle: 'Bu izinlerle elde edilen veriler nasıl kullanılır?',
    dataUse: [
      'Veriler yalnızca sana yönelik özellikler için işlenir: brifingler, özetler, öncelikler, toplantı hazırlığı, takipler, planlama ve asistan cevapları.',
      'Ham mail gövdeleri kalıcı hafızaya yazılmaz; özetler, etiketler ve kısa alıntılar senin seçtiğin saklama süresi boyunca tutulur.',
      'Veriler reklam amacıyla kullanılmaz, reklamverenlere veya veri simsarlarına satılmaz, üçüncü taraflara pazarlama amacıyla verilmez.',
      'Veriler yapay zekâ modellerini eğitmek için kullanılmaz. AI sağlayıcılarımızla yaptığımız sözleşmeler bunu gerektirir.',
      'İnsanlar verilerini yalnızca açık rızanla (ör. bir destek talebi için), güvenlik incelemesi gerektiğinde veya yasal zorunlulukla okuyabilir.',
      'OAuth belirteçleri sunucuda AES-256-GCM ile şifrelenir; bağlantıyı kaldırdığında belirteçler silinir ve Google/Microsoft tarafında da iptal edilir.',
    ],
    limitedUseTitle: 'Google API Hizmetleri Kullanıcı Verileri Politikası',
    limitedUseTr:
      'Dijital Asistan’ın Google API’lerinden alınan bilgileri kullanımı ve aktarımı, Sınırlı Kullanım gereklilikleri de dahil olmak üzere Google API Hizmetleri Kullanıcı Verileri Politikası’na uygundur.',
    limitedUseEn:
      "Dijital Asistan's use and transfer of information received from Google APIs will adhere to the Google API Services User Data Policy, including the Limited Use requirements.",
    revokeTitle: 'İzinleri nasıl kaldırırsın?',
    revokeIntro:
      'Erişimi üç yerden kaldırabilirsin; hangisini seçersen seç, belirteçler sunucumuzdan silinir ve eşitleme durur.',
    revokeSteps: [
      {
        title: 'Uygulamadan',
        body: 'Ayarlar → Bağlantılar → hesabı seç → Bağlantıyı Kaldır. O hesaba ait veriler saklama sürene göre temizlenir; dilersen analiz geçmişini hemen silebilirsin.',
      },
      {
        title: 'Google hesabından',
        body: 'Google Hesabı → Güvenlik → Üçüncü taraf uygulamalar ve hizmetler → Dijital Asistan → Erişimi kaldır.',
        href: 'https://myaccount.google.com/permissions',
        linkLabel: 'Google izin sayfasını aç',
      },
      {
        title: 'Microsoft hesabından',
        body: 'Microsoft hesabı → Gizlilik → Uygulama erişimi → Dijital Asistan → Bu izinleri kaldır. İş hesaplarında “Uygulamalarım” sayfasını kullan.',
        href: 'https://account.live.com/consent/Manage',
        linkLabel: 'Microsoft izin sayfasını aç',
      },
    ],
    revokeNote:
      'İzin kaldırıldıktan sonra Google/Microsoft tarafındaki yenileme belirteci geçersiz olur; uygulama o hesap için yeni veri çekemez. Hesabını tamamen silmek için Veri Silme sayfasına bak.',
    contact: 'İzinler hakkında sorun için: ',
  },
  appLink: {
    title: 'Bu bağlantı uygulamada açılır.',
    body: 'Dijital Asistan yüklüyse aşağıdaki düğmeyle doğrudan ilgili ekrana gidersin. Yüklü değilse önce uygulamayı kur, sonra bağlantıya tekrar dokun.',
    openInApp: 'Uygulamada aç',
    deepLinkLabel: 'Uygulama bağlantısı',
    orInstall: 'Uygulama yüklü değil mi?',
    referralTitle: 'Bir arkadaşın seni davet etti.',
    referralBody:
      'Uygulamayı kurup bu kodu kullandığında ilk brifinginden sonra ikiniz de 14 gün Pro kazanırsınız.',
    codeLabel: 'Davet kodu',
    autoNote: 'Telefondan açtıysan uygulama otomatik olarak açılmaya çalışılır.',
    backHome: 'Ana sayfaya dön',
  },
  notFound: {
    title: 'Sayfa bulunamadı.',
    body: 'Aradığın sayfa taşınmış ya da hiç var olmamış olabilir. Ana sayfadan devam edebilirsin.',
    cta: 'Ana sayfaya dön',
  },
  legal: {
    updatedPrefix: 'Son güncelleme',
    contactTitle: 'İletişim',
    tocTitle: 'İçindekiler',
    privacy: {
      title: 'Gizlilik Politikası',
      intro:
        'Bu politika, Dijital Asistan mobil uygulaması ve web sitesi (“Hizmet”) kullanılırken hangi kişisel verilerin, hangi amaçla ve ne süreyle işlendiğini açıklar. 6698 sayılı Kişisel Verilerin Korunması Kanunu (KVKK) ve Avrupa Birliği Genel Veri Koruma Tüzüğü (GDPR) kapsamındaki aydınlatma yükümlülüğümüz bu metinle yerine getirilir.',
      updatedLabel: '5 Eylül 2026',
      sections: [
        {
          title: '1. Veri sorumlusu',
          paragraphs: [
            'Hizmet, Dijital Asistan (“biz”) tarafından sunulur. Kişisel verilerinle ilgili her türlü soru ve talebin için gizlilik@dijitalasistan.app adresine yazabilirsin.',
          ],
        },
        {
          title: '2. Hangi verileri işliyoruz?',
          paragraphs: ['Hizmeti sunmak için aşağıdaki veri kategorilerini işleriz:'],
          bullets: [
            'Hesap bilgileri: ad, e-posta adresi, saat dilimi, dil tercihi, oturum açma yöntemi (Google, Apple, Microsoft veya e-posta ile giriş).',
            'Bağlı hesap bilgileri: bağladığın mail, takvim ve görev hesaplarının kimliği, verilen OAuth kapsamları ve şifrelenmiş erişim/yenileme belirteçleri.',
            'Mail verileri: bağlı hesaplardaki maillerin gönderen, alıcı, konu, tarih gibi üst verileri ile içerikleri; bunlardan üretilen özetler, etiketler, öncelik kararları ve kısa alıntılar. Ham mail gövdeleri kalıcı hafızaya yazılmaz; analiz için geçici olarak işlenir.',
            'Takvim ve görev verileri: etkinlik başlıkları, saatler, katılımcılar, konum ve açıklamalar; görev listeleri ve son tarihler.',
            'Kişiler: mail ve takvimden türetilen iletişim bilgileri, etkileşim sıklığı ve senin işaretlediğin VIP kişiler.',
            'Yakaladığın içerikler: uygulamaya eklediğin ekran görüntüleri, PDF’ler, bağlantılar ve notlar ile bunlardan çıkarılan bilgiler.',
            'Öğrenilen tercihler: “bunu daha az göster”, VIP işaretleme gibi geri bildirimlerinden türetilen kişiselleştirme kuralları.',
            'Android bildirim verileri (yalnızca izin verirsen): seçtiğin uygulamalardan gelen bildirim metinleri. Doğrulama kodları ve şifre yöneticisi bildirimleri asla kaydedilmez.',
            'Cihaz ve kullanım verileri: cihaz türü, işletim sistemi sürümü, uygulama sürümü, anlık bildirim belirteci, çökme raporları ve ürün analitiği olayları (hangi ekranların kullanıldığı gibi; mail içeriği içermez).',
            'Abonelik verileri: satın alma durumu, plan, deneme ve yenileme tarihleri. Ödeme bilgilerin App Store veya Google Play tarafından işlenir; kart bilgilerini görmeyiz.',
            'Destek yazışmaları: bize yazdığında paylaştığın bilgiler ve isteğe bağlı tanılama verileri.',
          ],
        },
        {
          title: '3. Verileri hangi amaçlarla işliyoruz?',
          bullets: [
            'Günlük brifingler, öncelikler, özetler, toplantı hazırlığı, takipler, planlama önerileri ve asistan cevapları üretmek.',
            'Senin onayladığın işlemleri (mail gönderme, etkinlik oluşturma/taşıma, görev ekleme) yerine getirmek.',
            'Anlık bildirimler göndermek (kategori ve sessiz saat tercihlerine göre).',
            'Hizmeti kişiselleştirmek ve öğrenilen tercihlerine göre iyileştirmek.',
            'Aboneliğini yönetmek, deneme ve davet haklarını uygulamak.',
            'Hataları tespit etmek, güvenliği sağlamak, kötüye kullanımı önlemek ve yasal yükümlülükleri yerine getirmek.',
            'Destek taleplerine yanıt vermek.',
          ],
          after: [
            'Verilerini reklam amacıyla profillemeyiz, reklamverenlere veya veri simsarlarına satmayız. Verilerini yapay zekâ modellerini eğitmek için kullanmayız.',
          ],
        },
        {
          title: '4. Hukuki dayanak',
          paragraphs: [
            'KVKK m. 5 ve GDPR m. 6 kapsamında verilerini şu dayanaklarla işleriz: Hizmet sözleşmesinin kurulması ve ifası (brifing, özet ve bildirimler); açık rızan (mail ve takvim hesaplarını bağlaman, Android bildirim erişimi, isteğe bağlı analitik); meşru menfaatimiz (güvenlik, hata ayıklama, hizmetin iyileştirilmesi); yasal yükümlülüklerimiz (mali kayıtlar, resmi talepler).',
            'Rızaya dayalı işlemelerde rızanı istediğin zaman geri alabilirsin; geri alma, geri alma anına kadar yapılan işlemenin hukuka uygunluğunu etkilemez.',
          ],
        },
        {
          title: '5. Bağlı hesaplar ve OAuth izinleri',
          paragraphs: [
            'Google ve Microsoft hesaplarına OAuth 2.0 ile bağlanırız; şifreni görmeyiz. Başlangıçta yalnızca okuma kapsamları istenir; mail gönderme, etkinlik oluşturma ve görev ekleme kapsamları ancak sen ilk kez böyle bir işlemi onayladığında talep edilir. Hangi kapsamların hangi amaçla istendiği OAuth İzinleri sayfasında ayrıntılı olarak açıklanır.',
            'Dijital Asistan’ın Google API’lerinden alınan bilgileri kullanımı ve aktarımı, Sınırlı Kullanım gereklilikleri de dahil olmak üzere Google API Hizmetleri Kullanıcı Verileri Politikası’na uygundur. Google kullanıcı verileri yalnızca sana yönelik özellikleri sunmak ve iyileştirmek için kullanılır; reklam için kullanılmaz; sınırlı istisnalar (açık rızan, güvenlik, yasal zorunluluk) dışında insanlar tarafından okunmaz.',
            'Apple Takvim ve Hatırlatıcılar iOS izin sistemiyle cihazdan okunur; bu veriler yalnızca özellikleri sunmak için işlenir.',
          ],
        },
        {
          title: '6. Yapay zekâ ile işleme',
          paragraphs: [
            'Özetler, öncelik kararları, taslaklar ve asistan cevapları, büyük dil modelleri (Anthropic ve/veya OpenAI API’leri) kullanılarak üretilir. İşleme sırasında yalnızca ilgili özelliğin gerektirdiği kadar veri gönderilir; sağlayıcılarla yaptığımız sözleşmeler bu verilerin model eğitiminde kullanılmamasını ve işleme dışında saklanmamasını gerektirir.',
            'Yapay zekâ çıktıları hata içerebilir. Bu nedenle mail gönderme ve takvim değişikliği gibi her işlem, sen onaylamadan gerçekleştirilmez ve her önemli bilgi kaynağıyla birlikte gösterilir.',
          ],
        },
        {
          title: '7. Saklama süreleri',
          paragraphs: [
            'Analiz sonuçlarının (özetler, öncelik kararları, hafıza dizini) ne kadar saklanacağına sen karar verirsin:',
          ],
          bullets: [
            '30 gün, 90 gün (varsayılan), 1 yıl veya sen silene kadar. Ayarlar → Gizlilik ve Güvenlik → Veri Saklama altından değiştirilebilir; değişiklik ileriye dönük uygulanır ve eski kayıtlar günlük temizleme işiyle silinir.',
            'Hesap bilgileri ve bağlantılar, hesabın açık olduğu sürece saklanır.',
            'Hesabını sildiğinde tüm kişisel verilerin en geç 30 gün içinde kalıcı olarak silinir veya anonimleştirilir. Yedeklerdeki kopyalar yedekleme döngüsü içinde temizlenir.',
            'Mali kayıtlar ve yasal olarak saklanması zorunlu belgeler ilgili mevzuatın öngördüğü süre boyunca tutulur.',
          ],
        },
        {
          title: '8. Verilerin paylaşıldığı taraflar (alt işleyiciler)',
          paragraphs: [
            'Hizmeti sunmak için aşağıdaki hizmet sağlayıcılarla çalışırız. Her biri sözleşmeyle verilerini yalnızca bizim talimatımızla ve belirtilen amaçla işlemekle yükümlüdür:',
          ],
          bullets: [
            'Supabase — veritabanı, kimlik doğrulama, dosya depolama ve sunucu fonksiyonları (barındırma).',
            'Anthropic ve/veya OpenAI — yapay zekâ ile özetleme, sınıflandırma ve taslak üretimi (model eğitimi yok).',
            'RevenueCat — abonelik durumunun App Store / Google Play ile eşlenmesi.',
            'Sentry — hata ve çökme raporları (mail içeriği gönderilmez).',
            'PostHog — ürün analitiği (ekran ve özellik kullanımı; mail içeriği gönderilmez).',
            'Expo Push (Expo Application Services) — anlık bildirimlerin iletilmesi.',
            'Google ve Microsoft — bağladığın hesapların API’leri; veriler senin yetkilendirmenle bu sağlayıcılardan alınır ve onayladığın işlemler bu sağlayıcılara iletilir.',
            'Apple App Store ve Google Play — satın alma ve ödeme işlemleri.',
          ],
          after: [
            'Bunların dışında verilerini yalnızca yasal bir zorunluluk, resmi bir talep ya da senin açık talimatın olduğunda paylaşırız. Verilerini satmayız.',
          ],
        },
        {
          title: '9. Yurt dışına aktarım',
          paragraphs: [
            'Alt işleyicilerimizin bir kısmı Avrupa Birliği ve Amerika Birleşik Devletleri’nde bulunur. Bu aktarımlar KVKK m. 9 ve GDPR Bölüm V kapsamında, açık rızan ve/veya standart sözleşme hükümleri ile veri işleme sözleşmelerine dayanarak yapılır.',
          ],
        },
        {
          title: '10. Güvenlik',
          bullets: [
            'Veriler aktarım sırasında TLS ile, saklanırken disk düzeyinde şifrelenir.',
            'OAuth erişim ve yenileme belirteçleri ayrıca uygulama düzeyinde AES-256-GCM ile şifrelenir ve anahtarlar düzenli olarak döndürülür.',
            'Her kullanıcının verisi satır düzeyinde erişim kurallarıyla yalnızca kendisine açıktır.',
            'Belirteç çözme, mail gönderme, takvim yazma ve veri silme gibi kritik işlemler denetim kaydına alınır.',
            'Hizmet uçtan uca şifreli değildir: özetleri üretebilmek için sunucularımızın içeriği işlemesi gerekir.',
          ],
        },
        {
          title: '11. Hakların',
          paragraphs: ['KVKK m. 11 ve GDPR m. 15–22 kapsamında şu haklara sahipsin:'],
          bullets: [
            'Verilerinin işlenip işlenmediğini öğrenme ve bilgi talep etme.',
            'Verilerine erişme ve taşınabilir biçimde (JSON) indirme — Ayarlar → Gizlilik ve Güvenlik → Verilerimi İndir.',
            'Eksik veya yanlış verilerin düzeltilmesini isteme.',
            'Verilerinin silinmesini isteme — Ayarlar → Gizlilik ve Güvenlik → Hesabımı Sil veya gizlilik@dijitalasistan.app.',
            'İşlemeye itiraz etme ve rızayı geri alma.',
            'Otomatik karar verme sonuçlarına itiraz etme: öncelik kararları ve öneriler her zaman düzeltilebilir; hiçbir işlem sen onaylamadan gerçekleşmez.',
            'Kişisel Verileri Koruma Kurulu’na (KVKK) veya bulunduğun ülkedeki denetim otoritesine şikâyette bulunma.',
          ],
          after: ['Taleplerini en geç 30 gün içinde yanıtlarız.'],
        },
        {
          title: '12. Çocuklar',
          paragraphs: [
            'Hizmet 18 yaşından küçükler için tasarlanmamıştır ve bilerek 18 yaş altından veri toplamayız. Böyle bir durumu fark edersek verileri sileriz.',
          ],
        },
        {
          title: '13. Çerezler ve web sitesi',
          paragraphs: [
            'Web sitemiz yalnızca dil tercihini saklamak için zorunlu bir çerez kullanır; reklam veya izleme çerezi kullanmaz.',
          ],
        },
        {
          title: '14. Değişiklikler',
          paragraphs: [
            'Bu politikayı zaman zaman güncelleyebiliriz. Önemli değişiklikleri uygulama içinde ve/veya e-posta ile bildiririz. Güncel sürüm her zaman bu sayfada yayımlanır.',
          ],
        },
      ],
    },
    terms: {
      title: 'Kullanım Şartları',
      intro:
        'Bu şartlar, Dijital Asistan mobil uygulaması ve web sitesinin (“Hizmet”) kullanımını düzenler. Hizmeti kullanarak bu şartları kabul etmiş olursun. Kişisel verilerinin işlenmesi Gizlilik Politikası’nda açıklanır.',
      updatedLabel: '5 Eylül 2026',
      sections: [
        {
          title: '1. Hizmetin tanımı',
          paragraphs: [
            'Dijital Asistan; bağladığın mail, takvim ve görev hesaplarını analiz ederek günlük brifingler, öncelikler, özetler, toplantı hazırlığı, takip önerileri ve bir yapay zekâ asistanı sunan bir kişisel üretkenlik uygulamasıdır. Hizmet iOS ve Android uygulamaları ile bu web sitesinden oluşur.',
          ],
        },
        {
          title: '2. Uygunluk ve hesap',
          bullets: [
            'Hizmeti kullanmak için en az 18 yaşında olmalısın.',
            'Hesabın sana özeldir; oturum bilgilerini korumaktan ve hesabın altında yapılan işlemlerden sen sorumlusun.',
            'Bağladığın hesapların sahibi olmalı veya bunları bağlamaya yetkili olmalısın. Kurumsal hesaplarda işvereninin politikalarına uymak senin sorumluluğundadır.',
          ],
        },
        {
          title: '3. Onay ilkesi ve yapay zekâ çıktıları',
          paragraphs: [
            'Hizmet, senin adına mail göndermez, takvim etkinliği oluşturmaz veya taşımaz, görev eklemez — sen ilgili işlemi Onay Merkezi’nde onaylamadıkça. Onayladığın her işlemden sen sorumlusun.',
            'Özetler, öncelikler, taslaklar ve cevaplar yapay zekâ ile üretilir ve hata, eksiklik veya yanlış yorum içerebilir. Her önemli bilgiyi kaynağından doğrulamak senin sorumluluğundadır. Hizmet hukuki, mali, tıbbi veya benzeri profesyonel tavsiye vermez.',
          ],
        },
        {
          title: '4. Kabul edilebilir kullanım',
          paragraphs: ['Hizmeti kullanırken şunları yapmamayı kabul edersin:'],
          bullets: [
            'Başkasına ait hesapları izinsiz bağlamak veya başkalarının verilerine erişmeye çalışmak.',
            'Hizmeti spam, dolandırıcılık, taciz veya yasa dışı içerik için kullanmak.',
            'Hizmetin güvenliğini aşmaya, tersine mühendislik yapmaya, otomatik araçlarla aşırı yük oluşturmaya çalışmak.',
            'Hizmeti yeniden satmak veya üçüncü taraflara sunmak.',
          ],
        },
        {
          title: '5. Planlar, abonelik ve deneme',
          bullets: [
            'Free plan ücretsizdir ve sınırlı özellikler içerir. Pro plan aylık (199 TL / ay) veya yıllık (1.490 TL / yıl) abonelikle sunulur; güncel fiyatlar mağazada gösterilir ve yerel para birimine göre değişebilir.',
            'Pro abonelikleri App Store veya Google Play üzerinden satın alınır; ödeme, yenileme, iptal ve iade işlemleri ilgili mağazanın koşullarına tabidir.',
            'Uygun olduğunda 7 günlük ücretsiz deneme sunulur (mağaza koşullarına bağlı). Deneme süresi bitmeden en az 24 saat önce iptal edilmezse seçilen plan ücreti tahsil edilir.',
            'Abonelik dönem sonunda otomatik yenilenir. İptal, dönem sonuna kadar Pro özelliklerine erişimi etkilemez.',
            'Davet programı: davet ettiğin kişi ilk brifingini aldığında her iki tarafa 14 gün Pro tanımlanır. Program yılda 6 davetle sınırlıdır; kötüye kullanım halinde haklar iptal edilebilir.',
          ],
        },
        {
          title: '6. Üçüncü taraf hizmetler',
          paragraphs: [
            'Hizmet; Google, Microsoft ve Apple gibi üçüncü taraf hizmetlerin API’lerine bağlanır. Bu hizmetlerin kullanımı kendi şartlarına tabidir. Üçüncü tarafların erişimi kısıtlaması, kesintiye uğratması veya değiştirmesi durumunda ilgili özellikler sınırlanabilir; bundan sorumlu tutulamayız.',
          ],
        },
        {
          title: '7. Fikri mülkiyet',
          paragraphs: [
            'Hizmet, yazılımı, tasarımı ve markası bize aittir. Sana Hizmeti kişisel, devredilemez ve münhasır olmayan bir lisansla kullanma hakkı verilir. Bağladığın hesaplardaki içerikler ve yakaladığın veriler senindir; bize yalnızca Hizmeti sunmak için gereken sınırlı işleme hakkını verirsin.',
          ],
        },
        {
          title: '8. Kullanılabilirlik ve değişiklikler',
          paragraphs: [
            'Hizmeti kesintisiz sunmak için çaba gösteririz ancak bakım, güncelleme veya üçüncü taraf kaynaklı nedenlerle kesintiler olabilir. Özellikleri makul bir bildirimle değiştirebilir veya sonlandırabiliriz; ücretli bir özelliğin kaldırılması durumunda mağaza kuralları çerçevesinde orantılı iade yapılır.',
          ],
        },
        {
          title: '9. Sorumluluğun sınırlandırılması',
          paragraphs: [
            'Hizmet “olduğu gibi” sunulur. Yürürlükteki hukukun izin verdiği ölçüde; kaçırılan bir son tarih, yanlış bir özet, gönderilen bir mail ya da veri kaybından doğan dolaylı, arızi veya sonuç olarak ortaya çıkan zararlardan sorumlu değiliz. Toplam sorumluluğumuz, zarardan önceki 12 ayda Hizmet için ödediğin tutarla sınırlıdır. Tüketici haklarına ilişkin emredici hükümler saklıdır.',
          ],
        },
        {
          title: '10. Fesih',
          paragraphs: [
            'Hesabını istediğin zaman uygulama içinden silebilirsin. Bu şartların ihlali halinde hesabını askıya alabilir veya kapatabiliriz; ciddi ihlaller dışında önceden bildiririz. Fesih sonrasında verilerin Gizlilik Politikası’nda açıklanan süreler içinde silinir.',
          ],
        },
        {
          title: '11. Uygulanacak hukuk ve uyuşmazlıklar',
          paragraphs: [
            'Bu şartlar Türkiye Cumhuriyeti hukukuna tabidir. Uyuşmazlıklarda İstanbul mahkemeleri ve icra daireleri yetkilidir; tüketici sıfatıyla hareket ediyorsan yerleşim yerindeki tüketici hakem heyetleri ve mahkemeleri de yetkilidir.',
          ],
        },
        {
          title: '12. Değişiklikler ve iletişim',
          paragraphs: [
            'Bu şartları güncelleyebiliriz; önemli değişiklikleri uygulama içinde bildiririz ve değişiklikten sonra Hizmeti kullanmaya devam etmen kabul anlamına gelir. Sorularını destek@dijitalasistan.app adresine iletebilirsin.',
          ],
        },
      ],
    },
    dataDeletion: {
      title: 'Veri Silme',
      intro:
        'Verilerin üzerindeki kontrol sende. Bu sayfa, hesabını ve verilerini nasıl sileceğini, ne kadar sürede silineceğini ve neyin saklanacağını açıklar.',
      updatedLabel: '5 Eylül 2026',
      sections: [
        {
          title: 'Hesabını uygulama içinden sil',
          paragraphs: ['En hızlı yol uygulamanın içindedir; birkaç dakika sürer.'],
          bullets: [
            'Dijital Asistan’ı aç ve sağ üstteki avatarına dokun.',
            'Ayarlar → Gizlilik ve Güvenlik → Hesabımı Sil adımını izle.',
            'Neyin silineceğini gösteren özeti oku, onaylamak için “SİL” yaz ve Hesabımı Kalıcı Olarak Sil düğmesine dokun. Güvenlik için yeniden giriş istenebilir.',
            'Aktif bir Pro aboneliğin varsa mağaza üzerinden ayrıca iptal etmen gerekir; hesap silme, mağaza aboneliğini otomatik olarak iptal etmez.',
          ],
        },
        {
          title: 'E-posta ile silme talebi',
          paragraphs: [
            'Uygulamaya erişemiyorsan, hesabında kayıtlı e-posta adresinden gizlilik@dijitalasistan.app adresine “Hesap silme talebi” konulu bir e-posta gönder. Kimliğini doğrulamak için hesabındaki e-posta adresine bir onay bağlantısı yollarız; onayladıktan sonra silme işlemi başlar.',
          ],
        },
        {
          title: 'Ne silinir?',
          bullets: [
            'Hesap bilgilerin (ad, e-posta, tercihler) ve oturumların.',
            'Bağlı hesapların ve tüm OAuth belirteçleri; Google ve Microsoft tarafındaki izinler de iptal edilir.',
            'Mail, takvim ve görev verilerinden üretilen tüm özetler, etiketler, öncelik kararları, hafıza dizini, kişiler, VIP listesi ve öğrenilen tercihler.',
            'Yakaladığın içerikler (ekran görüntüleri, PDF’ler, notlar) ve bunlardan çıkarılan bilgiler.',
            'Bildirim belirteçleri, brifing geçmişi, ses dosyaları ve dışa aktarım paketleri.',
            'Abonelik eşlemesi (RevenueCat kimliği). Mağazadaki satın alma kaydın Apple/Google tarafında kalır.',
          ],
        },
        {
          title: 'Ne saklanır?',
          bullets: [
            'Yasal olarak saklanması zorunlu mali kayıtlar (fatura ve ödeme özetleri), ilgili mevzuatın öngördüğü süre boyunca — kişisel içerik olmadan.',
            'Kötüye kullanımı önlemek için gereken asgari kayıtlar (ör. davet programı kullanım sayacı), anonimleştirilmiş biçimde.',
          ],
        },
        {
          title: 'Ne kadar sürer?',
          paragraphs: [
            'Silme talebin alındığı anda hesabın devre dışı kalır ve eşitleme durur. Tüm veriler en geç 30 gün içinde kalıcı olarak silinir; yedeklerdeki kopyalar yedekleme döngüsü içinde temizlenir. Silme tamamlandığında e-posta ile bilgilendiriliriz.',
          ],
        },
        {
          title: 'Yalnızca geçmişini silmek istersen',
          paragraphs: [
            'Hesabını kapatmadan analiz geçmişini silebilirsin: Ayarlar → Gizlilik ve Güvenlik → Analiz Geçmişini Sil. Özetler, öncelik kararları ve hafıza dizini silinir; bağlantıların ve ayarların kalır. Ayrıca Veri Saklama altından 30 gün, 90 gün, 1 yıl veya “ben silene kadar” seçeneklerinden birini seçebilirsin.',
          ],
        },
        {
          title: 'Bağlantı izinlerini kaldırmak istersen',
          paragraphs: [
            'Tek bir hesabın erişimini kaldırmak için Ayarlar → Bağlantılar → hesabı seç → Bağlantıyı Kaldır adımını kullan ya da Google/Microsoft hesap ayarlarından Dijital Asistan’ın erişimini kaldır. Ayrıntılar OAuth İzinleri sayfasında.',
          ],
        },
        {
          title: 'Silmeden önce verilerini indir',
          paragraphs: [
            'Ayarlar → Gizlilik ve Güvenlik → Verilerimi İndir ile tüm verilerini JSON olarak alabilirsin. Paket hazırlandığında bildirim gönderir; indirme bağlantısı 24 saat geçerlidir. OAuth belirteçleri pakete dahil edilmez.',
          ],
        },
      ],
    },
  },
};
