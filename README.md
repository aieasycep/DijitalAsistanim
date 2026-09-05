# Dijital Asistan

**Bugün bilmen gerekenleri, sen sormadan söyler.**

Dijital Asistan, Gmail / Outlook / takvim / görev kaynaklarını okuyup güne dair önemli olanı çıkaran, sabah-öğle-akşam brifingleri hazırlayan, toplantılara hazırlayan ve verdiğin sözleri takip eden kişisel komuta merkezidir. Bir inbox, takvim ya da sohbet uygulaması klonu değildir: **okur, önceliklendirir, önerir; sen onaylamadan hiçbir şey göndermez veya değiştirmez.**

- iOS + Android (Expo / React Native), web sitesi (Next.js), backend (Supabase: Postgres + RLS + Edge Functions)
- Türkçe varsayılan, İngilizce tam destek; açık/koyu tema; erişilebilirlik
- AI sağlayıcısı değiştirilebilir (Anthropic / OpenAI); her AI çıktısı zod ile doğrulanır, her içgörü kaynağına bağlanır

## Monorepo

```
apps/
  mobile/        Expo SDK 57 · expo-router · TanStack Query · Zustand · Reanimated · Maestro E2E
  web/           Next.js 16 · landing, pricing, privacy, terms, support, data-deletion, oauth, universal-link fallback
packages/
  design-tokens/ Renk, tipografi, spacing, motion, ikon tokenları (Claude Design kaynaklı)
  domain/        Tipler, enum'lar, SourceRef, EDGE_FUNCTIONS kataloğu, deep link'ler, analytics olayları
  validation/    zod şemaları (API girdileri + AI yapılandırılmış çıktıları)
  i18n/          tr/en sözlükleri, tarih/sayı biçimlendirme
  ui/            React Native bileşen kütüphanesi (primitives + composite)
  api-client/    DataSource sözleşmesi + Supabase adaptörü + Demo adaptörü
  server-core/   Çalışma ortamından bağımsız backend mantığı (Deno + Node): önceliklendirme, triage, AI, sağlayıcılar, senkron, onaylar…
supabase/
  migrations/    46 tablo, tümünde RLS · guard trigger'ları · RPC'ler · storage bucket'ları · pg_cron
  functions/     42 Edge Function (Deno) + paylaşılan yardımcılar ve zamanlanmış işler
  seed/          Tasarımdaki örnek veriyle birebir seed
  tests/         pgTAP RLS testleri
docs/            Mimari, veri modeli, OAuth, AI hattı, güvenlik, gizlilik, dağıtım, mağaza kontrol listeleri…
scripts/         Migration doğrulama, DB testleri, ikon/asset üretimi, gizli anahtar taraması, ölü kod taraması
```

## Hızlı başlangıç

Gereksinimler: Node 22, pnpm 10.33, (backend için) Supabase CLI ve Docker, (mobil için) Xcode / Android Studio, (E2E için) Maestro.

```bash
pnpm install
cp .env.example .env            # ve gerektiğinde apps/mobile/.env, apps/web/.env.local, supabase/.env.local
```

### Demo modu (backend gerekmez)

```bash
EXPO_PUBLIC_DATA_MODE=demo pnpm mobile     # Expo dev client; deterministik örnek veri, tüm akışlar çalışır
```

Demo modu yalnızca geliştirme/önizleme derlemelerinde açılabilir; production derlemelerde `resolveMode` demo'yu reddeder.

### Gerçek backend

```bash
pnpm supabase:start                       # yerel Supabase (Postgres 16, pgvector, pg_cron, pgTAP)
pnpm supabase:reset                       # migration'lar + seed
pnpm supabase:functions                   # Edge Function'ları yerelde servis et
EXPO_PUBLIC_DATA_MODE=supabase pnpm mobile
pnpm web                                  # http://localhost:3000
```

## Komutlar

| Komut | Ne yapar |
| --- | --- |
| `pnpm check:all` | format + lint + typecheck + unit/integration testleri + web build + Expo config doğrulama + migration doğrulama + ölü kod + gizli anahtar taraması |
| `pnpm lint` / `pnpm format:check` | ESLint 9 (flat config) / Prettier 3 |
| `pnpm typecheck` | Tüm paketler (`tsc --noEmit`) |
| `pnpm typecheck:functions` | Edge Function'lar için `deno check` |
| `pnpm test:unit` | Vitest (design-tokens, domain, validation, i18n, api-client, server-core) |
| `pnpm test:mobile` | jest-expo + React Native Testing Library |
| `pnpm test:db` | pgTAP RLS/politika testleri (yerel Postgres gerekir) |
| `pnpm validate:migrations` | Migration'ları temiz bir veritabanına uygular, tüm tablolarda RLS'i doğrular |
| `pnpm --filter @da/mobile e2e` | Maestro akışları A–L (`apps/mobile/maestro/flows`) |
| `pnpm build:web` | Next.js production build |

## Ürün ilkeleri (koda gömülü)

1. **Onay olmadan yazma yok.** Mail gönderme, takvim oluşturma/taşıma, görev/hatırlatıcı/söz kaydı yalnızca `approval_actions` üzerinden; durum makinesi hem `@da/server-core/approvals` hem de Postgres trigger'larıyla zorlanır. Yürütme idempotent'tir.
2. **Uydurma yok.** Tarih, tutar, kod gibi gerçekler yalnızca kaynakta açıkça geçiyorsa çıkarılır (`evidence` alanı); belirsizlik "Kaynakta kesinleşmiyor." olarak gösterilir. Asistan yanıtları grounding kontrolünden geçer.
3. **Açık kurallar > öğrenilen tercihler.** 10 seviyeli öncelik motoru (`@da/server-core/priority`); kullanıcı kuralları ve VIP'ler her zaman öğrenilen sinyalleri ezer.
4. **En az yetki.** OAuth önce yalnızca okuma kapsamı ister; yazma kapsamı ilk onayda kademeli olarak istenir. Refresh token'lar sunucuda AES-256-GCM ile şifrelenir, cihaza asla inmez.
5. **Gizlilik.** Analytics'e mail içeriği/konu/isim/e-posta/asistan metni asla gitmez; yerel önbellek şifrelidir ve ham mail gövdesi tutmaz; saklama süresi kullanıcı seçimlidir (30g/90g/1y/süresiz); veri dışa aktarma ve hesap silme self-servis.
6. **Maliyet disiplini.** 3 aşamalı mail hattı: kural tabanlı triage → küçük modelle toplu sınıflandırma → yalnızca gerekli olanlarda derin analiz; parmak izi önbelleği aynı içeriği iki kez modele göndermez; günlük token bütçesi plan bazlı.

## Dokümantasyon

`docs/` altında: `ARCHITECTURE`, `DATA_MODEL`, `AI_PIPELINE`, `OAUTH_SETUP`, `GOOGLE_OAUTH_VERIFICATION`, `SECURITY`, `PRIVACY_DATA_FLOW`, `DEPLOYMENT`, `APP_STORE_CHECKLIST`, `TESTING`, `DESIGN_SOURCE_MAPPING`, `KNOWN_PLATFORM_LIMITATIONS`, `IMPLEMENTATION_REPORT` (özellik matrisi).

## Harici kimlik bilgileri

Uygulama kimlik bilgisi olmadan da çalışır (demo modu; AI anahtarı yoksa kural tabanlı çıktılar; TTS/STT yoksa cihaz motorları; webhook yoksa polling). Production için gerekenler `.env.example` içinde bölüm bölüm açıklanmıştır: Supabase, `TOKEN_ENCRYPTION_KEY`, Google/Microsoft OAuth, Apple Sign in, Anthropic/OpenAI, (opsiyonel) embedding/TTS/STT, RevenueCat, Expo push, Sentry, PostHog, Google Routes.

## Lisans

Tüm hakları saklıdır. Bu depo Dijital Asistan ürününün kaynak kodudur.
