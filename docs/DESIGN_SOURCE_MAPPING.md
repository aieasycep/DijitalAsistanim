# Design source mapping

Three inputs shaped the product; conflicts are resolved in this order:

1. **Functional behaviour — the product prompt** (highest authority). Dead prototype buttons are not copied;
   missing interactions are completed according to the product principles (proactive AI, approval before every
   external write, sources on every claim, explicit rules over learning, privacy-first).
2. **Visual design — Claude Design (`Dijital Asistan tasarım sistemi son.zip`)** — PRIMARY visual source of truth:
   colors, typography (Geist + Lora), spacing, radii, shadows, card language, Today, Morning Briefing, Meeting Prep,
   Assistant, dark mode, editorial tone.
3. **Coverage — Figma prototype (`Dijital Asistanım (2)(1).zip`)** — SECONDARY reference for screens that Claude Design
   does not show in detail (settings sub-screens, empty/error/loading states, platform-specific screens, widgets
   showcase, marketing assets). Figma screens are adapted to the Claude Design language, never copied visually.

Both archives are extracted into structured engineering specs under `docs/design-reference/specs/`
(`claude-*.md` primary, `figma-*.md` secondary). The prototypes themselves are **not** shipped: no HTML in WebViews,
no Vite bundle packaged as an app — every screen is a native React Native implementation.

## Token mapping

| Design token (Claude Design 01)                                                                                                                                                                            | Code                                                                             |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| brand/primary #5B5CE2, pressed #4B4CCB, soft #EDEDFC, text-on-soft #4547C9, dark-glow #A9AAF5                                                                                                              | `lightColors.primary / primaryPressed / primarySoft / primaryText / primaryGlow` |
| critical #E0553F · soft #FCEDE9 · text #C7432F                                                                                                                                                             | `critical / criticalSoft / criticalText`                                         |
| warning #E09A1C · soft #FDF2DC · text #9A6300                                                                                                                                                              | `warning / warningSoft / warningText`                                            |
| success #2FA062 · soft #E4F5EA · text #1E7A47                                                                                                                                                              | `success / successSoft / successText`                                            |
| info #3B82E6 · soft #E7F0FD                                                                                                                                                                                | `info / infoSoft / infoText`                                                     |
| neutral bg #F5F4F0 · surface #FFFFFF · surface-2 #F0EFEB · hairline #E9E7E1                                                                                                                                | `background / surface / surface2 / hairline`                                     |
| ink #1A1917 · secondary #6B6860 · tertiary #9B978E · disabled #B8B4AA                                                                                                                                      | `ink / inkSecondary / inkTertiary / inkDisabled`                                 |
| editorial paper #FBFAF7                                                                                                                                                                                    | `paper`                                                                          |
| dark bg #141311 · surface #1F1E1B · surface-2 8% white · text #F2F0EB · secondary #A39F96 · tertiary #7A776F · primary #8586F2 · on-primary #0F0F2A · critical #F08B78 · warning #F0B85A · success #6FCF97 | `darkColors.*`                                                                   |
| gradients dawn / night / dusk                                                                                                                                                                              | `gradients.dawn/night/dusk`, `gradientCss` (web)                                 |
| type: display 34/40, h1 28/34, h2 22/28, h3 17/23, body 15/22, secondary 14/20, kicker 12/16 caps, badge 11/14, editorial Lora 18/29, editorial display Lora 34–38                                         | `typeScale.*`                                                                    |
| radii 10/12/14/16/20/28 · spacing 4…40 · shadows 1/2/3 · button heights 52/48/40/36                                                                                                                        | `radius.*`, `spacing.*`, `shadows.*`, `sizes.*`                                  |
| Material Symbols Rounded 20/24, FILL 0 / 1                                                                                                                                                                 | `iconNames` + generated SVG glyphs (`packages/ui/src/icons/glyphs.ts`)           |

## Screen mapping

| Screen                                                                                                                                                 | Primary (Claude Design)            | Secondary (Figma)                                         | Route                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------- | --------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Onboarding value pages, auth, connect, explainer, calendar permission, preferences, personalization, VIP, first analysis, aha, notification permission | 02 Onboarding                      | OnboardingFlow.tsx                                        | `(marketing)/welcome`, `(auth)/*`, `(onboarding)/*`                                      |
| Today (light/dark, morning/evening variants)                                                                                                           | 03 · 3.1 / 3.2                     | TodayScreen.tsx                                           | `(tabs)/today`                                                                           |
| Morning Briefing, audio player, Midday Pulse, Evening Close, Weekly Review + share card                                                                | 03 · 3.3–3.8                       | MorningBriefing/MiddayPulse/EveningClose/WeeklyReport.tsx | `briefing/[kind]`, `briefing/audio`                                                      |
| Flow, Mail Intelligence, Email Detail, AI Draft Reply, Smart Follow-Up, Waiting Reply                                                                  | 04 Akış ve Mail                    | flow/*.tsx                                                | `(tabs)/flow`, `email/[id]`, `email/[id]/reply`, `followups`, `waiting`                  |
| Plan (day/week), calendar intelligence, conflict, Meeting Prep, Post Meeting, Commitments                                                              | 05 Plan ve Toplantılar             | plan/*.tsx                                                | `(tabs)/plan`, `conflict/[id]`, `meeting/[id]/prep`, `meeting/[id]/post`, `commitments`  |
| Assistant, Voice, Search/Memory, Person Intelligence, Universal Capture, Approval Center, Smart Reminder                                               | 06 Asistan Hafıza Kişiler          | assistant/_.tsx, shared/_.tsx, SmartReminderSheet.tsx     | `(tabs)/assistant`, `voice`, `search`, `person/[id]`, `capture`, `approvals`, `reminder` |
| Profile/Settings, Integrations, Data Source Control, Privacy Center, Paywall, Referral, AI Personalization                                             | 07 Hesap Gizlilik Pro              | settings/*.tsx, Paywall.tsx, Referral.tsx                 | `settings/*`, `paywall`, `referral`                                                      |
| Empty/error/loading states, toasts, sheets, widgets, interactions                                                                                      | 08 Durumlar Widgetlar Etkileşimler | states/*.tsx, WidgetShowcase.tsx                          | `@da/ui` components, `widgets/*`                                                         |
| Android Notification Intelligence                                                                                                                      | — (Figma only)                     | AndroidNotifications.tsx                                  | `settings/android-notifications` (Android only)                                          |
| Landing, pricing, legal, App Store screenshots, social ads                                                                                             | 09 Pazarlama                       | marketing/*.tsx                                           | `apps/web`                                                                               |

## Deviations from the prototypes (deliberate)

- Prototype buttons without behaviour (e.g. "Cüzdana Ekle" on a flight card when no pass exists, "Seçenekleri Gör" without options) are only rendered when the backing data exists; otherwise the action is omitted rather than dead.
- Figma's "Gmail'de Aç" fallback stays as the secondary action on the reply screen; the primary "Göndermeyi Onayla" always routes through the Approval Center.
- Travel-time hints ("06:45'te evden çıkman gerekebilir") render only when a routes provider is configured and the event has a location.
- Prices on the paywall come from the store; the design copy (199 TL / 1.490 TL) is a display fallback only.
