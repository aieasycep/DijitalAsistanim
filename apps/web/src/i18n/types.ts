export type Lang = 'tr' | 'en';

export interface LegalSection {
  title: string;
  paragraphs?: string[];
  bullets?: string[];
  after?: string[];
}

export interface LegalDoc {
  title: string;
  intro: string;
  updatedLabel: string;
  sections: LegalSection[];
}

export interface ScopeRow {
  scope: string;
  label: string;
  why: string;
  when: string;
}

export interface PriorityCard {
  badge: string;
  tone: 'critical' | 'neutral' | 'deadline';
  time: string;
  title: string;
  source: string;
}

export interface Dictionary {
  meta: {
    siteName: string;
    tagline: string;
    description: string;
    ogSubtitle: string;
  };
  nav: {
    howItWorks: string;
    security: string;
    pricing: string;
    support: string;
    cta: string;
    skipToContent: string;
    language: string;
    switchTo: string;
    switchToLang: Lang;
    home: string;
  };
  hero: {
    kicker: string;
    title: string;
    subtitle: string;
    ctaPrimary: string;
    ctaSecondary: string;
    note: string;
    phoneLabel: string;
  };
  phone: {
    time: string;
    date: string;
    greeting: string;
    avatar: string;
    briefKicker: string;
    briefTitleBefore: string;
    briefCount: string;
    briefTitleAfter: string;
    briefMeta: string;
    ctaSee: string;
    ctaListen: string;
    priorities: string;
    cards: PriorityCard[];
    tabs: string[];
  };
  integrations: {
    kicker: string;
    title: string;
    note: string;
    items: { name: string; kind: 'mail' | 'calendar' | 'tasks' }[];
  };
  how: {
    kicker: string;
    title: string;
    subtitle: string;
    steps: { title: string; body: string }[];
  };
  briefing: {
    kicker: string;
    title: string;
    body: string;
    bullets: string[];
    cardKicker: string;
    cardGreeting: string;
    cardBody: string;
    cardCta: string;
  };
  mail: {
    kicker: string;
    title: string;
    subtitle: string;
    body: string;
    bullets: string[];
    count: string;
    countLabel: string;
    attentionBefore: string;
    attentionCount: string;
    attentionAfter: string;
    cards: {
      initials: string;
      tint: 'warm' | 'green';
      name: string;
      badge?: string;
      meta?: string;
      summary: string;
    }[];
  };
  meeting: {
    kicker: string;
    title: string;
    subtitle: string;
    body: string;
    screenKicker: string;
    countdown: string;
    person: string;
    personMeta: string;
    aiKicker: string;
    points: { title: string; detail: string }[];
  };
  planning: {
    kicker: string;
    title: string;
    body: string;
    screenTitle: string;
    aiKicker: string;
    aiTitle: string;
    aiDetail: string;
    aiCta: string;
    insights: { title: string; detail: string; tone: 'warning' | 'info' }[];
  };
  memory: {
    kicker: string;
    title: string;
    subtitle: string;
    body: string;
    screenTitle: string;
    user: string;
    assistant: string;
    sourcesKicker: string;
    sources: { label: string; date: string; kind: 'mail' | 'call' }[];
  };
  security: {
    kicker: string;
    title: string;
    subtitle: string;
    promises: { title: string; body: string }[];
    links: { privacy: string; oauth: string; deletion: string };
  };
  pricing: {
    kicker: string;
    title: string;
    subtitle: string;
    freeName: string;
    proName: string;
    freePrice: string;
    freeNote: string;
    monthly: string;
    annual: string;
    monthlyPrice: string;
    annualPrice: string;
    annualDetail: string;
    bestValue: string;
    perMonthLabel: string;
    trialNote: string;
    storeNote: string;
    tableFeature: string;
    rows: { label: string; free: string; pro: string }[];
    ctaPro: string;
    ctaFree: string;
    included: string;
    proIncludes: string[];
  };
  faq: {
    kicker: string;
    title: string;
    items: { q: string; a: string }[];
  };
  finalCta: {
    title: string;
    body: string;
    cta: string;
    note: string;
  };
  download: {
    kicker: string;
    title: string;
    bodyStores: string;
    bodyBeta: string;
    appStore: string;
    googlePlay: string;
    appStoreSub: string;
    googlePlaySub: string;
    requestAccess: string;
    requestSubject: string;
  };
  footer: {
    tagline: string;
    product: string;
    legal: string;
    contact: string;
    privacy: string;
    terms: string;
    dataDeletion: string;
    oauth: string;
    support: string;
    rights: string;
    languageLabel: string;
  };
  pricingPage: {
    title: string;
    description: string;
    billingTitle: string;
    billing: string[];
    referralTitle: string;
    referralBody: string;
    faqTitle: string;
  };
  supportPage: {
    title: string;
    description: string;
    intro: string;
    emailLabel: string;
    responseTime: string;
    inAppTitle: string;
    inAppBody: string;
    topicsTitle: string;
    topics: { title: string; body: string }[];
    linksTitle: string;
  };
  oauthPage: {
    title: string;
    description: string;
    intro: string;
    principlesTitle: string;
    principles: { title: string; body: string }[];
    googleTitle: string;
    googleIntro: string;
    googleRead: ScopeRow[];
    googleWrite: ScopeRow[];
    microsoftTitle: string;
    microsoftIntro: string;
    microsoftRead: ScopeRow[];
    microsoftWrite: ScopeRow[];
    readHeading: string;
    writeHeading: string;
    colScope: string;
    colLabel: string;
    colWhy: string;
    colWhen: string;
    appleTitle: string;
    appleBody: string;
    dataUseTitle: string;
    dataUse: string[];
    limitedUseTitle: string;
    limitedUseTr: string;
    limitedUseEn: string;
    revokeTitle: string;
    revokeIntro: string;
    revokeSteps: { title: string; body: string; href?: string; linkLabel?: string }[];
    revokeNote: string;
    contact: string;
  };
  appLink: {
    title: string;
    body: string;
    openInApp: string;
    deepLinkLabel: string;
    orInstall: string;
    referralTitle: string;
    referralBody: string;
    codeLabel: string;
    autoNote: string;
    backHome: string;
  };
  notFound: {
    title: string;
    body: string;
    cta: string;
  };
  legal: {
    updatedPrefix: string;
    contactTitle: string;
    tocTitle: string;
    privacy: LegalDoc;
    terms: LegalDoc;
    dataDeletion: LegalDoc;
  };
}
