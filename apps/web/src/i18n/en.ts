import { type Dictionary } from './types';

export const en: Dictionary = {
  meta: {
    siteName: 'Dijital Asistan',
    tagline: 'Tells you what you need to know today — before you ask.',
    description:
      'Dijital Asistan understands your mail, calendar and open tasks and prepares a short briefing for you every day. A proactive personal assistant for iOS and Android.',
    ogSubtitle: 'Mail · Calendar · Tasks · One briefing every morning',
  },
  nav: {
    howItWorks: 'How it works',
    security: 'Security',
    pricing: 'Pricing',
    support: 'Support',
    cta: 'Start for free',
    skipToContent: 'Skip to content',
    language: 'Language',
    switchTo: 'Türkçe',
    switchToLang: 'tr',
    home: 'Home',
  },
  hero: {
    kicker: 'Personal assistant for iOS and Android',
    title: 'Tells you what you need to know today — before you ask.',
    subtitle:
      'Dijital Asistan understands your mail, calendar and open tasks and prepares a short briefing for you every day.',
    ctaPrimary: 'Start for free',
    ctaSecondary: 'How does it work?',
    note: 'Nothing is sent without your approval. Start on the free plan and move to Pro when you are ready.',
    phoneLabel: 'Today screen: the morning briefing and the day’s priorities',
  },
  phone: {
    time: '9:41',
    date: 'SATURDAY, 5 SEPTEMBER',
    greeting: 'Good morning, Yunus',
    avatar: 'Y',
    briefKicker: 'BRIEFING READY · 07:58',
    briefTitleBefore: 'There are ',
    briefCount: '5',
    briefTitleAfter: ' things you need to know today.',
    briefMeta: '3 important emails · 4 events · 2 follow-ups',
    ctaSee: 'See my briefing',
    ctaListen: 'Listen · 2 min',
    priorities: 'YOUR PRIORITIES',
    cards: [
      {
        badge: 'URGENT',
        tone: 'critical',
        time: '08:42',
        title: 'Ahmet expects the revised proposal from you by 17:00 today.',
        source: 'Gmail · Ahmet Yılmaz · 08:42',
      },
      {
        badge: 'MEETING',
        tone: 'neutral',
        time: '14:30',
        title: '14:30 client meeting with Mehmet. Your last conversation was 4 days ago.',
        source: 'Google Calendar · Client meeting · 60 min',
      },
      {
        badge: 'DEADLINE',
        tone: 'deadline',
        time: '17:00',
        title: 'The application closes today at 17:00.',
        source: 'Gmail · Startup Programme · Yesterday 16:10',
      },
    ],
    tabs: ['Today', 'Flow', 'Plan', 'Assistant'],
  },
  integrations: {
    kicker: 'CONNECTIONS',
    title: 'Works with the tools you already use.',
    note: 'It starts once you connect at least one mailbox and one calendar. Apple Calendar is read from the device; no separate sign-in.',
    items: [
      { name: 'Gmail', kind: 'mail' },
      { name: 'Outlook', kind: 'mail' },
      { name: 'Google Calendar', kind: 'calendar' },
      { name: 'Microsoft Calendar', kind: 'calendar' },
      { name: 'Apple Calendar', kind: 'calendar' },
      { name: 'Google Tasks', kind: 'tasks' },
      { name: 'Microsoft To Do', kind: 'tasks' },
    ],
  },
  how: {
    kicker: 'HOW IT WORKS',
    title: 'Three steps, ready every morning.',
    subtitle:
      'Setup takes a few minutes. After that the assistant works in the background; you only see what matters.',
    steps: [
      {
        title: 'Connect your accounts',
        body: 'Connect Gmail or Outlook and your calendar. Before every permission we say plainly what we need and why; write permissions are only requested once you approve an action.',
      },
      {
        title: 'The assistant analyses',
        body: 'Emails, events and tasks are read in one stream. People waiting on you, deadlines, proposals and contracts come forward; promotions and notifications stay quietly in the background.',
      },
      {
        title: 'Your briefing is ready',
        body: 'Every morning at the time you choose, a short summary: priorities, schedule, who is waiting on you, deadlines. If you would rather not read, listen in 2 minutes.',
      },
    ],
  },
  briefing: {
    kicker: 'MORNING BRIEFING',
    title: 'We prepare your day before you ask.',
    body: 'Every morning, a short briefing made for that day: priorities, schedule, people waiting on you, deadlines and personal updates. Every line shows its source; one tap takes you to the email or event.',
    bullets: [
      'Audio briefing: chapter by chapter, in 2 minutes',
      'Midday pulse and evening close keep you current all day (Pro)',
      'Weekly review: what got done, how much time you saved',
    ],
    cardKicker: 'MORNING BRIEFING · 08:00',
    cardGreeting: 'Good morning, Yunus',
    cardBody:
      'You have no meetings before noon. At 14:30 you have a client meeting with Mehmet. Among 46 incoming emails, 3 topics need your attention.',
    cardCta: 'Listen to the briefing · 2 min',
  },
  mail: {
    kicker: 'MAIL INTELLIGENCE',
    title: '83 emails. Only 4 that really matter.',
    subtitle: 'It reads the rest for you.',
    body: 'It scans your inbox and tells apart people waiting on you, deadlines, proposals and contracts. Every important topic arrives as a one-sentence summary with its source.',
    bullets: [
      'Who is waiting for your reply? No email gets forgotten.',
      'Tracks the emails you sent that got no answer and drafts the follow-up (Pro)',
      'Shipments, flights, payments and subscriptions are derived from email content; no extra integrations',
    ],
    count: '83',
    countLabel: 'emails came in',
    attentionBefore: '',
    attentionCount: '4',
    attentionAfter: ' of them need attention.',
    cards: [
      {
        initials: 'AY',
        tint: 'warm',
        name: 'Ahmet Yılmaz',
        badge: 'URGENT',
        summary: 'Wants the revised price proposal as a PDF by 17:00 today.',
      },
      {
        initials: 'SK',
        tint: 'green',
        name: 'Selin Kaya',
        meta: 'Yesterday',
        summary: 'Waiting for your comment on clause 4 of the contract draft.',
      },
    ],
  },
  meeting: {
    kicker: 'MEETING PREP',
    title: 'Never walk into a meeting unprepared.',
    subtitle: '20 minutes before: the 3 things you need to talk about.',
    body: 'Before a meeting, your latest exchanges with the other side, open topics and mutual expectations are gathered in one card. When it ends, the promises you made are captured and followed up.',
    screenKicker: 'PREPARE FOR THE MEETING',
    countdown: '18 min',
    person: 'Mehmet Yılmaz',
    personMeta: 'Client meeting · 14:30 · 60 min',
    aiKicker: '3 THINGS TO TALK ABOUT',
    points: [
      { title: 'Price', detail: 'Revised proposal expected by 17:00.' },
      { title: 'Delivery date', detail: 'Asking for approval for early October.' },
      { title: 'Contract', detail: 'Draft has been open for 2 weeks.' },
    ],
  },
  planning: {
    kicker: 'CALENDAR INTELLIGENCE',
    title: 'It doesn’t just show your calendar. It understands it.',
    body: 'It finds gaps, spots conflicts first, accounts for travel time and suggests placing your tasks into suitable slots. It asks for your approval before touching your calendar.',
    screenTitle: 'Plan',
    aiKicker: 'CALENDAR INTELLIGENCE',
    aiTitle: 'You have a 2.5-hour gap tomorrow between 14:00 and 16:30.',
    aiDetail: 'I can place the “prepare proposal” task here.',
    aiCta: 'Schedule',
    insights: [
      {
        title: 'Tomorrow is quite busy.',
        detail: 'Your 09:00 and 10:00 meetings are back to back.',
        tone: 'warning',
      },
      {
        title: 'You may need to leave at 12:50 for the 13:30 doctor.',
        detail: '38 min traffic estimate',
        tone: 'info',
      },
    ],
  },
  memory: {
    kicker: 'ASSISTANT AND MEMORY',
    title: 'Ask your digital life.',
    subtitle: 'Your mail, calendar and notes in one memory.',
    body: 'It answers your questions with sources. Over time it learns who matters, which topics come first and when to remind you. Every suggestion can be corrected; say “show this less” and it learns.',
    screenTitle: 'Assistant',
    user: 'What did Mehmet and I last talk about?',
    assistant:
      'On 1 September you discussed price and delivery date. Mehmet asked for a revised proposal for early-October delivery; you said you would send it on Friday.',
    sourcesKicker: 'SOURCES',
    sources: [
      { label: 'Re: Proposal · Gmail', date: '1 Sep', kind: 'mail' },
      { label: 'Call notes', date: '1 Sep', kind: 'call' },
    ],
  },
  security: {
    kicker: 'SECURITY AND PRIVACY',
    title: 'You are always in control.',
    subtitle:
      'What we read, how long we keep it and how to delete it — always visible inside the app.',
    promises: [
      {
        title: 'We never send email without your approval.',
        body: 'Every action — sending an email, creating or moving an event — lands in the Approval Centre first. Write permissions are requested only at your first approval, as a separate step.',
      },
      {
        title: 'Your data is never sold to advertisers.',
        body: 'We do not build ad profiles or hand data to third parties for marketing. Your email content is not used to train AI models.',
      },
      {
        title: 'Data is encrypted in transit and at rest.',
        body: 'Connections are protected with TLS; OAuth tokens are stored encrypted on the server. Raw email bodies are not written to memory — only summaries and selected excerpts are kept.',
      },
      {
        title: 'You decide how long we keep it.',
        body: '30 days, 90 days, 1 year or until you delete it. You can download your data, wipe your analysis history or delete your account entirely.',
      },
    ],
    links: {
      privacy: 'Privacy Policy',
      oauth: 'Which permissions, and why?',
      deletion: 'Data deletion',
    },
  },
  pricing: {
    kicker: 'PRICING',
    title: 'Start free. Move to Pro when you are ready.',
    subtitle:
      'Free is transparent: 1 mailbox, 1 calendar, the morning briefing, limited AI. Pro brings your whole digital life into one briefing.',
    freeName: 'Free',
    proName: 'Pro',
    freePrice: '0 TL',
    freeNote: 'Free forever',
    monthly: 'Monthly',
    annual: 'Annual',
    monthlyPrice: '199 TL / month',
    annualPrice: '1,490 TL / year',
    annualDetail: '124 TL per month · save 38%',
    bestValue: 'Best value',
    perMonthLabel: 'month',
    trialNote:
      '7-day free trial — subject to store terms. We remind you 24 hours before the trial ends; cancel any time.',
    storeNote:
      'Subscriptions are purchased and managed through the App Store or Google Play. Prices include VAT and may differ by store currency.',
    tableFeature: 'Feature',
    rows: [
      { label: 'Connected mailboxes', free: '1', pro: 'up to 10' },
      { label: 'Connected calendars', free: '1', pro: 'up to 10' },
      { label: 'Morning briefing', free: '✓', pro: '✓' },
      { label: 'Midday pulse and evening close', free: '—', pro: '✓' },
      { label: 'Meeting prep', free: '—', pro: '✓' },
      { label: 'Smart follow-ups and commitments', free: '—', pro: '✓' },
      { label: 'Audio briefing', free: '—', pro: '✓' },
      { label: 'AI memory and VIP people', free: '—', pro: '✓' },
      { label: 'Advanced planning', free: '—', pro: '✓' },
      { label: 'Assistant questions', free: '10 / day', pro: '300 / day' },
    ],
    ctaPro: 'Try Pro free for 7 days',
    ctaFree: 'Start with Free',
    included: 'Included in Free',
    proIncludes: [
      'Unlimited AI analysis, multiple accounts',
      'Midday and evening briefings',
      'Meeting prep',
      'Smart follow-ups and commitments',
      'Audio briefing',
      'AI memory and VIP people',
      'Advanced planning',
    ],
  },
  faq: {
    kicker: 'FAQ',
    title: 'Common questions',
    items: [
      {
        q: 'Does Dijital Asistan read my email?',
        a: 'Yes. It reads the email in the accounts you connect in order to find and summarise what matters. Raw email bodies are not written to memory; only summaries and selected excerpts are kept, for as long as you choose. You can see what we access under Settings → Privacy & Security.',
      },
      {
        q: 'Can it send email on my behalf?',
        a: 'Not without your approval. Reply drafts and follow-ups land in the Approval Centre; the send permission is requested only at your first approval, as a separate step. The same rule applies to calendar changes.',
      },
      {
        q: 'Which accounts are supported?',
        a: 'Gmail, Outlook (Microsoft 365 and personal accounts), Google Calendar, Microsoft Calendar, Apple Calendar (from the device), Google Tasks and Microsoft To Do. Free includes 1 mailbox and 1 calendar; Pro lets you connect up to 10 accounts.',
      },
      {
        q: 'What does the free plan include?',
        a: 'One mailbox and one calendar connection, a briefing every morning, 10 assistant questions a day and the core of mail intelligence. No credit card, no time limit.',
      },
      {
        q: 'How does the trial work?',
        a: 'Pro plans come with a 7-day free trial; trial terms follow App Store and Google Play rules. We remind you 24 hours before it ends. Cancel and you pay nothing; otherwise the plan you chose starts.',
      },
      {
        q: 'Is my data end-to-end encrypted?',
        a: 'Data is encrypted in transit (TLS) and at rest; OAuth tokens are encrypted separately. To produce summaries our servers need to process the content, so this is not end-to-end encryption and we do not claim it is.',
      },
      {
        q: 'Is my data used to train AI models?',
        a: 'No. Your data is processed only to produce your briefings, summaries and answers. Our agreements with AI providers require that data sent to them is not used for model training.',
      },
      {
        q: 'How do I delete my account and data?',
        a: 'In the app, go to Settings → Privacy & Security → Delete my account. Connection permissions are revoked and all data and subscription mappings are permanently deleted within 30 days. You can also write to gizlilik@dijitalasistan.app.',
      },
    ],
  },
  finalCta: {
    title: 'Have your briefing ready tomorrow morning.',
    body: 'Connect your accounts; the first analysis takes a few minutes. The next morning, at the time you chose, your first briefing is waiting.',
    cta: 'Start for free',
    note: 'iOS and Android · Start on the free plan · Nothing is sent without your approval',
  },
  download: {
    kicker: 'DOWNLOAD',
    title: 'Put the app on your phone.',
    bodyStores:
      'Download from the App Store for iOS or Google Play for Android. One account works on both platforms.',
    bodyBeta:
      'Dijital Asistan is currently in an invite-only beta. Write to us for TestFlight access on iOS or Google Play internal testing on Android; we usually send invites within one business day.',
    appStore: 'App Store',
    googlePlay: 'Google Play',
    appStoreSub: 'for iPhone',
    googlePlaySub: 'for Android',
    requestAccess: 'Request beta access',
    requestSubject: 'Dijital Asistan beta access',
  },
  footer: {
    tagline: 'Tells you what you need to know today — before you ask.',
    product: 'Product',
    legal: 'Legal',
    contact: 'Contact',
    privacy: 'Privacy Policy',
    terms: 'Terms of Service',
    dataDeletion: 'Data Deletion',
    oauth: 'OAuth Permissions',
    support: 'Support',
    rights: 'All rights reserved.',
    languageLabel: 'Language',
  },
  pricingPage: {
    title: 'Pricing',
    description:
      'Dijital Asistan Free and Pro plans: 199 TL/month or 1,490 TL/year with a 7-day free trial. Transparent comparison, no hidden terms.',
    billingTitle: 'Billing, renewal and cancellation',
    billing: [
      'Pro subscriptions are purchased through the App Store (iOS) or Google Play (Android); payment is charged to your store account.',
      'The free trial is offered only on your first subscription and where store terms allow. Cancel at least 24 hours before the trial ends and you are not charged.',
      'The subscription renews automatically at the end of each period and continues at the same price until you cancel. Price changes are announced in advance as required by store rules.',
      'Cancellations and refunds follow store policies: App Store subscription settings on iOS, the Google Play subscriptions section on Android. The “Manage subscription” link in the app takes you to the right place.',
      'If you move from Pro back to Free, your connected accounts and data stay; only Pro-exclusive features switch off.',
    ],
    referralTitle: 'Invite a friend',
    referralBody:
      'When someone you invite receives their first briefing, you both get 14 days of Pro. Find your invite link in the app under Settings → Invite a friend.',
    faqTitle: 'Pricing questions',
  },
  supportPage: {
    title: 'Support',
    description:
      'Dijital Asistan support: connection issues, notifications, subscriptions and account deletion. We usually reply within 1–2 business days.',
    intro:
      'Hit a problem, or have an idea? Write to us; we usually reply within 1–2 business days.',
    emailLabel: 'Email',
    responseTime: 'Response time: usually 1–2 business days',
    inAppTitle: 'Write from inside the app',
    inAppBody:
      'Go to Settings → Feedback. You can optionally attach diagnostics; they never include email content.',
    topicsTitle: 'Common topics',
    topics: [
      {
        title: 'Connection fails or has expired',
        body: 'Under Settings → Connections, use “Reconnect” next to the account. Corporate Microsoft accounts may require admin consent; ask your administrator to approve the Dijital Asistan app.',
      },
      {
        title: 'No notifications',
        body: 'Make sure notifications are enabled in system settings and that the category is on under Settings → Notifications in the app. Quiet hours and “Only notify if it really matters” reduce notifications by design.',
      },
      {
        title: 'Subscription, trial and refunds',
        body: 'Subscriptions are managed through the App Store or Google Play. Settings → Subscription → Manage subscription takes you to the store. If a purchase is missing, try “Restore purchases”.',
      },
      {
        title: 'I want to download or delete my data',
        body: 'Under Settings → Privacy & Security you can download your data as JSON, delete your analysis history or close your account entirely. Details are on the Data Deletion page.',
      },
    ],
    linksTitle: 'Useful links',
  },
  oauthPage: {
    title: 'OAuth permissions',
    description:
      'Which permissions Dijital Asistan requests from Google and Microsoft accounts, why, when — and how to revoke them.',
    intro:
      'Dijital Asistan connects to Google and Microsoft accounts with OAuth to understand your mail and calendar. This page explains, one by one, which permissions we request, why and when. We never see your password; access is granted through a token that belongs to you and can be revoked at any moment.',
    principlesTitle: 'Our principles',
    principles: [
      {
        title: 'Least privilege',
        body: 'Only read permissions are requested at the start. No permission is requested that a feature does not need.',
      },
      {
        title: 'Progressive write access',
        body: 'Permissions to send email, create events or add tasks are requested only when you approve such an action for the first time, through a separate consent screen.',
      },
      {
        title: 'No action without approval',
        body: 'Even after write access is granted, every send and every calendar change lands in the Approval Centre first. Nothing is sent without your approval.',
      },
      {
        title: 'Transparent scope',
        body: 'Granted permissions are listed in plain language in the app under Settings → Privacy & Security → Connected accounts.',
      },
    ],
    googleTitle: 'Google (Gmail, Google Calendar, Google Tasks)',
    googleIntro:
      'When you connect a Google account, the following read permissions are requested. Write permissions are requested only when you first approve the related action.',
    googleRead: [
      {
        scope: 'openid · email · profile',
        label: 'Identity',
        why: 'To recognise your account and show your email address and name. Not used for anything else.',
        when: 'Sign-in and first connection',
      },
      {
        scope: 'gmail.readonly',
        label: 'Read mail',
        why: 'To find important emails, detect who is waiting on you and which deadlines exist, and produce one-sentence summaries. Shipment, flight, payment and subscription signals are also derived from email content.',
        when: 'Gmail connection',
      },
      {
        scope: 'calendar.readonly',
        label: 'Read calendar',
        why: 'To understand your day, see conflicts, build the meeting-prep card and suggest free slots.',
        when: 'Google Calendar connection',
      },
      {
        scope: 'tasks.readonly',
        label: 'Read tasks',
        why: 'To include open tasks from Google Tasks lists in your briefing and planning.',
        when: 'Google Tasks connection (optional)',
      },
    ],
    googleWrite: [
      {
        scope: 'gmail.send',
        label: 'Send mail',
        why: 'To send the replies and follow-ups you approved in the Approval Centre on your behalf. Only emails you approved, with the content you approved, are sent.',
        when: 'At your first email approval',
      },
      {
        scope: 'calendar.events',
        label: 'Create and move events',
        why: 'To add or move the events you approved (for example a deadline detected in an email or a suggested focus block).',
        when: 'At your first calendar approval',
      },
      {
        scope: 'tasks',
        label: 'Create tasks',
        why: 'To add the tasks you approved to Google Tasks.',
        when: 'At your first task approval',
      },
    ],
    microsoftTitle: 'Microsoft (Outlook, Microsoft Calendar, Microsoft To Do)',
    microsoftIntro:
      'Personal Microsoft accounts and Microsoft 365 work accounts are supported. On corporate accounts only the permissions granted to you are used; your company policies remain in force.',
    microsoftRead: [
      {
        scope: 'openid · email · profile · offline_access · User.Read',
        label: 'Identity and session',
        why: 'To recognise your account and keep the connection alive without asking you to sign in every time (refresh token).',
        when: 'Sign-in and first connection',
      },
      {
        scope: 'Mail.Read',
        label: 'Read mail',
        why: 'To find important topics in your work email, understand conversations waiting for a reply, and detect proposals, contracts and deadlines.',
        when: 'Outlook connection',
      },
      {
        scope: 'Calendars.Read',
        label: 'Read calendar',
        why: 'To understand your day, see conflicts and build meeting prep.',
        when: 'Microsoft Calendar connection',
      },
      {
        scope: 'Tasks.Read',
        label: 'Read tasks',
        why: 'To include open tasks from Microsoft To Do lists in your briefing.',
        when: 'Microsoft To Do connection (optional)',
      },
    ],
    microsoftWrite: [
      {
        scope: 'Mail.Send',
        label: 'Send mail',
        why: 'To send the replies and follow-ups you approved on your behalf.',
        when: 'At your first email approval',
      },
      {
        scope: 'Calendars.ReadWrite',
        label: 'Create and move events',
        why: 'To add or move the events you approved.',
        when: 'At your first calendar approval',
      },
      {
        scope: 'Tasks.ReadWrite',
        label: 'Create tasks',
        why: 'To add the tasks you approved to Microsoft To Do.',
        when: 'At your first task approval',
      },
    ],
    readHeading: 'Read permissions (at connection time)',
    writeHeading: 'Write permissions (progressive, only with your approval)',
    colScope: 'Scope',
    colLabel: 'What',
    colWhy: 'Why',
    colWhen: 'When it is requested',
    appleTitle: 'Apple Calendar and Reminders',
    appleBody:
      'Apple Calendar and Reminders do not use OAuth; they are read from the device through iOS’s own permission prompt. You can change that permission any time under iOS Settings → Privacy & Security → Calendars.',
    dataUseTitle: 'How is data obtained through these permissions used?',
    dataUse: [
      'Data is processed only for features that serve you: briefings, summaries, priorities, meeting prep, follow-ups, planning and assistant answers.',
      'Raw email bodies are not written to permanent memory; summaries, labels and short excerpts are kept for the retention period you choose.',
      'Data is not used for advertising, not sold to advertisers or data brokers, and not shared with third parties for marketing.',
      'Data is not used to train AI models. Our agreements with AI providers require this.',
      'Humans may read your data only with your explicit consent (for example for a support request), when a security review requires it, or under legal obligation.',
      'OAuth tokens are encrypted on the server with AES-256-GCM; when you disconnect an account the tokens are deleted and the grant is revoked on the Google/Microsoft side as well.',
    ],
    limitedUseTitle: 'Google API Services User Data Policy',
    limitedUseTr:
      'Dijital Asistan’ın Google API’lerinden alınan bilgileri kullanımı ve aktarımı, Sınırlı Kullanım gereklilikleri de dahil olmak üzere Google API Hizmetleri Kullanıcı Verileri Politikası’na uygundur.',
    limitedUseEn:
      "Dijital Asistan's use and transfer of information received from Google APIs will adhere to the Google API Services User Data Policy, including the Limited Use requirements.",
    revokeTitle: 'How to revoke permissions',
    revokeIntro:
      'You can remove access from three places; whichever you choose, tokens are deleted from our server and syncing stops.',
    revokeSteps: [
      {
        title: 'From the app',
        body: 'Settings → Connections → choose the account → Remove connection. Data from that account is cleaned up according to your retention setting; you can also delete your analysis history immediately.',
      },
      {
        title: 'From your Google account',
        body: 'Google Account → Security → Third-party apps & services → Dijital Asistan → Remove access.',
        href: 'https://myaccount.google.com/permissions',
        linkLabel: 'Open the Google permissions page',
      },
      {
        title: 'From your Microsoft account',
        body: 'Microsoft account → Privacy → App access → Dijital Asistan → Remove these permissions. For work accounts use the “My Apps” portal.',
        href: 'https://account.live.com/consent/Manage',
        linkLabel: 'Open the Microsoft permissions page',
      },
    ],
    revokeNote:
      'After revocation the refresh token on the Google/Microsoft side becomes invalid and the app cannot fetch new data for that account. To delete your account entirely, see the Data Deletion page.',
    contact: 'Questions about permissions: ',
  },
  appLink: {
    title: 'This link opens in the app.',
    body: 'If Dijital Asistan is installed, the button below takes you straight to the right screen. If not, install the app first and tap the link again.',
    openInApp: 'Open in app',
    deepLinkLabel: 'App link',
    orInstall: 'Don’t have the app yet?',
    referralTitle: 'A friend invited you.',
    referralBody:
      'Install the app and use this code; after your first briefing you both get 14 days of Pro.',
    codeLabel: 'Invite code',
    autoNote: 'If you opened this on your phone, we try to open the app automatically.',
    backHome: 'Back to home',
  },
  notFound: {
    title: 'Page not found.',
    body: 'The page you are looking for may have moved or never existed. You can continue from the home page.',
    cta: 'Back to home',
  },
  legal: {
    updatedPrefix: 'Last updated',
    contactTitle: 'Contact',
    tocTitle: 'Contents',
    privacy: {
      title: 'Privacy Policy',
      intro:
        'This policy explains which personal data is processed, for what purpose and for how long when you use the Dijital Asistan mobile app and website (the “Service”). It fulfils our duty to inform under the Turkish Personal Data Protection Law No. 6698 (KVKK) and the EU General Data Protection Regulation (GDPR).',
      updatedLabel: '5 September 2026',
      sections: [
        {
          title: '1. Data controller',
          paragraphs: [
            'The Service is provided by Dijital Asistan (“we”). For any question or request about your personal data, write to gizlilik@dijitalasistan.app.',
          ],
        },
        {
          title: '2. What data do we process?',
          paragraphs: ['To provide the Service we process the following categories of data:'],
          bullets: [
            'Account data: name, email address, time zone, language preference, sign-in method (Google, Apple, Microsoft or email).',
            'Connected account data: the identity of the mail, calendar and task accounts you connect, the OAuth scopes granted, and encrypted access/refresh tokens.',
            'Email data: metadata such as sender, recipients, subject and date, and the content of emails in connected accounts; the summaries, labels, priority decisions and short excerpts produced from them. Raw email bodies are not written to permanent memory; they are processed transiently for analysis.',
            'Calendar and task data: event titles, times, attendees, locations and descriptions; task lists and due dates.',
            'People: contact details derived from mail and calendar, interaction frequency, and the VIP people you mark.',
            'Captured content: screenshots, PDFs, links and notes you add to the app, and the information extracted from them.',
            'Learned preferences: personalisation rules derived from your feedback, such as “show this less” or marking someone as VIP.',
            'Android notification data (only if you grant access): notification text from the apps you select. Verification codes and password-manager notifications are never stored.',
            'Device and usage data: device type, OS version, app version, push token, crash reports and product-analytics events (such as which screens are used; never email content).',
            'Subscription data: purchase status, plan, trial and renewal dates. Payment details are handled by the App Store or Google Play; we never see card details.',
            'Support correspondence: what you share when you write to us, plus optional diagnostics.',
          ],
        },
        {
          title: '3. Why do we process data?',
          bullets: [
            'To produce daily briefings, priorities, summaries, meeting prep, follow-ups, planning suggestions and assistant answers.',
            'To carry out the actions you approve (sending email, creating/moving events, adding tasks).',
            'To send push notifications according to your category and quiet-hours preferences.',
            'To personalise the Service and improve it based on learned preferences.',
            'To manage your subscription and apply trial and referral entitlements.',
            'To detect errors, keep the Service secure, prevent abuse and meet legal obligations.',
            'To respond to support requests.',
          ],
          after: [
            'We do not profile you for advertising and do not sell your data to advertisers or data brokers. We do not use your data to train AI models.',
          ],
        },
        {
          title: '4. Legal basis',
          paragraphs: [
            'Under KVKK Art. 5 and GDPR Art. 6 we process your data on these bases: performance of the service contract (briefings, summaries and notifications); your explicit consent (connecting mail and calendar accounts, Android notification access, optional analytics); our legitimate interests (security, debugging, improving the Service); and our legal obligations (financial records, official requests).',
            'Where processing is based on consent you can withdraw it at any time; withdrawal does not affect the lawfulness of processing carried out before it.',
          ],
        },
        {
          title: '5. Connected accounts and OAuth permissions',
          paragraphs: [
            'We connect to Google and Microsoft accounts using OAuth 2.0; we never see your password. Only read scopes are requested initially; scopes for sending email, creating events and adding tasks are requested only when you first approve such an action. The OAuth Permissions page explains every scope and its purpose in detail.',
            "Dijital Asistan's use and transfer of information received from Google APIs will adhere to the Google API Services User Data Policy, including the Limited Use requirements. Google user data is used only to provide and improve user-facing features; it is not used for advertising; and it is not read by humans except in limited cases (your explicit consent, security, legal obligation).",
            'Apple Calendar and Reminders are read from the device through the iOS permission system; this data is processed solely to provide features.',
          ],
        },
        {
          title: '6. Processing with artificial intelligence',
          paragraphs: [
            'Summaries, priority decisions, drafts and assistant answers are generated with large language models (Anthropic and/or OpenAI APIs). Only the data a feature requires is sent for processing; our agreements with these providers require that the data is not used for model training and is not retained beyond processing.',
            'AI output can contain errors. That is why no action such as sending email or changing your calendar is carried out without your approval, and every important item is shown together with its source.',
          ],
        },
        {
          title: '7. Retention',
          paragraphs: [
            'You decide how long analysis results (summaries, priority decisions, the memory index) are kept:',
          ],
          bullets: [
            '30 days, 90 days (default), 1 year, or until you delete them. Change it under Settings → Privacy & Security → Data retention; the change applies going forward and older records are removed by the daily cleanup job.',
            'Account data and connections are kept for as long as your account is open.',
            'When you delete your account, all personal data is permanently deleted or anonymised within 30 days at the latest. Copies in backups are removed within the backup rotation cycle.',
            'Financial records and documents we are legally required to keep are retained for the period prescribed by law.',
          ],
        },
        {
          title: '8. Who we share data with (sub-processors)',
          paragraphs: [
            'We rely on the following providers to run the Service. Each is bound by contract to process your data only on our instructions and for the stated purpose:',
          ],
          bullets: [
            'Supabase — database, authentication, file storage and server functions (hosting).',
            'Anthropic and/or OpenAI — AI summarisation, classification and drafting (no model training).',
            'RevenueCat — mapping subscription status with the App Store / Google Play.',
            'Sentry — error and crash reports (no email content is sent).',
            'PostHog — product analytics (screen and feature usage; no email content is sent).',
            'Expo Push (Expo Application Services) — delivery of push notifications.',
            'Google and Microsoft — the APIs of the accounts you connect; data is retrieved from these providers with your authorisation and the actions you approve are sent to them.',
            'Apple App Store and Google Play — purchases and payments.',
          ],
          after: [
            'Beyond these, we share your data only under a legal obligation, an official request or your explicit instruction. We do not sell your data.',
          ],
        },
        {
          title: '9. International transfers',
          paragraphs: [
            'Some of our sub-processors are located in the European Union and the United States. These transfers are made under KVKK Art. 9 and GDPR Chapter V on the basis of your explicit consent and/or standard contractual clauses and data-processing agreements.',
          ],
        },
        {
          title: '10. Security',
          bullets: [
            'Data is encrypted with TLS in transit and at the disk level at rest.',
            'OAuth access and refresh tokens are additionally encrypted at the application level with AES-256-GCM, with regular key rotation.',
            'Row-level access rules make each user’s data visible only to that user.',
            'Critical operations such as token decryption, sending email, calendar writes and data deletion are recorded in an audit log.',
            'The Service is not end-to-end encrypted: our servers must process the content to produce summaries.',
          ],
        },
        {
          title: '11. Your rights',
          paragraphs: ['Under KVKK Art. 11 and GDPR Arts. 15–22 you have the right to:'],
          bullets: [
            'Learn whether your data is processed and request information about it.',
            'Access your data and download it in a portable format (JSON) — Settings → Privacy & Security → Download my data.',
            'Have incomplete or inaccurate data corrected.',
            'Have your data deleted — Settings → Privacy & Security → Delete my account, or gizlilik@dijitalasistan.app.',
            'Object to processing and withdraw consent.',
            'Contest automated decisions: priority decisions and suggestions can always be corrected, and no action happens without your approval.',
            'Lodge a complaint with the Turkish Personal Data Protection Authority (KVKK) or the supervisory authority in your country.',
          ],
          after: ['We respond to requests within 30 days at the latest.'],
        },
        {
          title: '12. Children',
          paragraphs: [
            'The Service is not designed for people under 18 and we do not knowingly collect data from anyone under 18. If we become aware of such data, we delete it.',
          ],
        },
        {
          title: '13. Cookies and the website',
          paragraphs: [
            'Our website uses a single strictly necessary cookie to remember your language preference; it uses no advertising or tracking cookies.',
          ],
        },
        {
          title: '14. Changes',
          paragraphs: [
            'We may update this policy from time to time. We announce material changes in the app and/or by email. The current version is always published on this page.',
          ],
        },
      ],
    },
    terms: {
      title: 'Terms of Service',
      intro:
        'These terms govern the use of the Dijital Asistan mobile app and website (the “Service”). By using the Service you accept them. How we handle personal data is described in the Privacy Policy.',
      updatedLabel: '5 September 2026',
      sections: [
        {
          title: '1. The Service',
          paragraphs: [
            'Dijital Asistan is a personal productivity app that analyses the mail, calendar and task accounts you connect and provides daily briefings, priorities, summaries, meeting prep, follow-up suggestions and an AI assistant. The Service consists of the iOS and Android apps and this website.',
          ],
        },
        {
          title: '2. Eligibility and your account',
          bullets: [
            'You must be at least 18 years old to use the Service.',
            'Your account is personal; you are responsible for keeping your sign-in details safe and for activity under your account.',
            'You must own, or be authorised to connect, the accounts you connect. On corporate accounts, complying with your employer’s policies is your responsibility.',
          ],
        },
        {
          title: '3. Approval principle and AI output',
          paragraphs: [
            'The Service does not send email, create or move calendar events or add tasks on your behalf unless you approve the specific action in the Approval Centre. You are responsible for every action you approve.',
            'Summaries, priorities, drafts and answers are generated by AI and may contain errors, omissions or misinterpretations. Verifying important information against its source is your responsibility. The Service does not provide legal, financial, medical or other professional advice.',
          ],
        },
        {
          title: '4. Acceptable use',
          paragraphs: ['When using the Service you agree not to:'],
          bullets: [
            'Connect accounts you are not authorised to use or attempt to access other people’s data.',
            'Use the Service for spam, fraud, harassment or unlawful content.',
            'Circumvent the Service’s security, reverse-engineer it, or overload it with automated tools.',
            'Resell the Service or offer it to third parties.',
          ],
        },
        {
          title: '5. Plans, subscriptions and trial',
          bullets: [
            'The Free plan costs nothing and includes a limited feature set. The Pro plan is offered as a monthly (199 TL / month) or annual (1,490 TL / year) subscription; current prices are shown in the store and may vary by local currency.',
            'Pro subscriptions are purchased through the App Store or Google Play; payment, renewal, cancellation and refunds are subject to the respective store’s terms.',
            'Where available, a 7-day free trial is offered (subject to store terms). If the trial is not cancelled at least 24 hours before it ends, the selected plan is charged.',
            'Subscriptions renew automatically at the end of each period. Cancelling does not affect access to Pro features until the end of the paid period.',
            'Referral programme: when someone you invite receives their first briefing, both of you receive 14 days of Pro. The programme is limited to 6 invites per year; entitlements may be cancelled in case of abuse.',
          ],
        },
        {
          title: '6. Third-party services',
          paragraphs: [
            'The Service connects to third-party APIs such as Google, Microsoft and Apple. Your use of those services is governed by their own terms. If a third party restricts, interrupts or changes access, related features may be limited; we cannot be held responsible for this.',
          ],
        },
        {
          title: '7. Intellectual property',
          paragraphs: [
            'The Service, its software, design and brand belong to us. You receive a personal, non-transferable, non-exclusive licence to use the Service. The content in the accounts you connect and the data you capture remain yours; you grant us only the limited processing rights needed to provide the Service.',
          ],
        },
        {
          title: '8. Availability and changes',
          paragraphs: [
            'We work to keep the Service available without interruption, but maintenance, updates or third-party causes may lead to downtime. We may change or discontinue features with reasonable notice; if a paid feature is removed, a proportional refund is provided within store rules.',
          ],
        },
        {
          title: '9. Limitation of liability',
          paragraphs: [
            'The Service is provided “as is”. To the extent permitted by applicable law we are not liable for indirect, incidental or consequential damages arising from a missed deadline, an inaccurate summary, an email that was sent or data loss. Our total liability is limited to the amount you paid for the Service in the 12 months before the event. Mandatory consumer-protection provisions remain unaffected.',
          ],
        },
        {
          title: '10. Termination',
          paragraphs: [
            'You can delete your account at any time from within the app. We may suspend or close your account if you breach these terms; except for serious breaches we notify you in advance. After termination your data is deleted within the periods described in the Privacy Policy.',
          ],
        },
        {
          title: '11. Governing law and disputes',
          paragraphs: [
            'These terms are governed by the laws of the Republic of Türkiye. The courts and enforcement offices of Istanbul have jurisdiction; if you act as a consumer, the consumer arbitration committees and courts of your place of residence are also competent.',
          ],
        },
        {
          title: '12. Changes and contact',
          paragraphs: [
            'We may update these terms; material changes are announced in the app, and continuing to use the Service after a change means you accept it. Questions can be sent to destek@dijitalasistan.app.',
          ],
        },
      ],
    },
    dataDeletion: {
      title: 'Data Deletion',
      intro:
        'You control your data. This page explains how to delete your account and data, how long it takes and what is retained.',
      updatedLabel: '5 September 2026',
      sections: [
        {
          title: 'Delete your account in the app',
          paragraphs: ['The fastest way is inside the app; it takes a few minutes.'],
          bullets: [
            'Open Dijital Asistan and tap your avatar in the top right.',
            'Go to Settings → Privacy & Security → Delete my account.',
            'Read the summary of what will be deleted, type “DELETE” to confirm and tap Permanently delete my account. You may be asked to sign in again for security.',
            'If you have an active Pro subscription, cancel it separately through the store; deleting your account does not cancel a store subscription automatically.',
          ],
        },
        {
          title: 'Request deletion by email',
          paragraphs: [
            'If you cannot access the app, send an email with the subject “Account deletion request” to gizlilik@dijitalasistan.app from the address registered to your account. To verify your identity we send a confirmation link to that address; deletion starts once you confirm.',
          ],
        },
        {
          title: 'What is deleted',
          bullets: [
            'Your account data (name, email, preferences) and sessions.',
            'Your connected accounts and all OAuth tokens; the grants on the Google and Microsoft side are revoked as well.',
            'All summaries, labels, priority decisions, the memory index, people, the VIP list and learned preferences produced from mail, calendar and task data.',
            'Captured content (screenshots, PDFs, notes) and the information extracted from it.',
            'Push tokens, briefing history, audio files and export packages.',
            'The subscription mapping (RevenueCat identifier). Your purchase record in the store remains with Apple/Google.',
          ],
        },
        {
          title: 'What is retained',
          bullets: [
            'Financial records we are legally required to keep (invoice and payment summaries) for the period prescribed by law — without personal content.',
            'The minimum records needed to prevent abuse (for example the referral-programme usage counter), in anonymised form.',
          ],
        },
        {
          title: 'How long it takes',
          paragraphs: [
            'Your account is deactivated and syncing stops the moment we receive your request. All data is permanently deleted within 30 days at the latest; copies in backups are removed within the backup rotation cycle. We email you when deletion is complete.',
          ],
        },
        {
          title: 'If you only want to delete your history',
          paragraphs: [
            'You can wipe your analysis history without closing your account: Settings → Privacy & Security → Delete analysis history. Summaries, priority decisions and the memory index are deleted; your connections and settings remain. Under Data retention you can also choose 30 days, 90 days, 1 year or “until I delete it”.',
          ],
        },
        {
          title: 'If you want to remove a connection',
          paragraphs: [
            'To remove access for a single account, use Settings → Connections → choose the account → Remove connection, or remove Dijital Asistan’s access from your Google/Microsoft account settings. Details are on the OAuth Permissions page.',
          ],
        },
        {
          title: 'Download your data before deleting',
          paragraphs: [
            'Settings → Privacy & Security → Download my data gives you all your data as JSON. We notify you when the package is ready; the download link is valid for 24 hours. OAuth tokens are never included.',
          ],
        },
      ],
    },
  },
};
