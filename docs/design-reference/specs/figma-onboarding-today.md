# Figma prototype · Splash, Onboarding (14 steps) and the "Bugün" cluster — Implementation Spec

Source of truth for this document: the Figma Make prototype (`src/screens/SplashScreen.tsx`, `src/screens/onboarding/OnboardingFlow.tsx`, `src/screens/today/TodayScreen.tsx`, `MorningBriefing.tsx`, `MiddayPulse.tsx`, `EveningClose.tsx`) plus the components and data those screens import (`components/cards/InsightCard`, `components/ui/Badge`, `components/special/SourceTag`, `components/layout/BottomSheet`, `components/ui/SmartReminderSheet`, `components/layout/BottomNav`, `context/ThemeContext`, `data/mock.ts`, `index.css`). The prototype is the **secondary** reference (the Claude Design canvases in `claude-0x-*.md` are primary); use this file for screen coverage, edge cases, states and copy that the canvases do not carry. Engineers should not need to open the raw TSX.

Conventions:
- Token names follow the project palette (`brand/primary`, `ink/secondary`, …). The prototype was built on a slightly different palette; §0.2 maps every raw prototype colour to the nearest token. Where no token exists the value is written `raw #HEX` with a proposed token name.
- Sizes are dp/pt as drawn on the 393×852 iOS frame (`MobileFrame`: radius 48, status bar 44 high with `9:41`, signal/wifi/battery). Bottom nav is 82 high including a 24 safe-area pad.
- Strings in `code` are verbatim copy and become i18n keys (full table in §9). Dynamic parts are marked `{n}`.
- "Dead in prototype" = drawn clickable but has no handler, or handler is a placeholder. Engineers wire real behaviour (consolidated list in §8).
- The prototype font is Inter with weights up to 900. Map to the project type scale (Inter/Lora) by role, not by weight: `display 34/40 600`, `h1 28/34 600`, `h2 22/28 600`, `h3 17/23 600`, `body 15/22`, `secondary 14/20`, `kicker 12/16 600 +8% caps`, `badge 11/14 700 +5%`, `editorial Lora 18/29`. Prototype weights 800/900 → use the token weight (600) with the larger size; do not ship 900.
- Icons: the prototype uses emoji and ad-hoc SVGs. Ship Material Symbols Rounded (suggested glyph named per element); keep emoji only where the design intentionally uses it as illustration (life cards, onboarding rows) and even there prefer a tinted icon tile.

---

## 0. Navigation model and colour mapping

### 0.1 Navigation graph implied by the prototype

```
RootStack
 ├─ 1.0 Splash                       (auto-advance 2200 ms → OnboardingStack or Main tabs)
 ├─ OnboardingStack (no tab bar, no back button drawn anywhere)
 │   ├─ 2.1  welcome                 (dark)
 │   ├─ 2.2  noise                   progress 1/14
 │   ├─ 2.3  proactive               progress 2/14
 │   ├─ 2.4  control                 progress 3/14
 │   ├─ 2.5  account                 progress 4/14
 │   ├─ 2.6  connect                 progress 5/14   (gate: ≥1 mail + ≥1 calendar)
 │   ├─ 2.7  permission (Gmail)      progress 6/14
 │   ├─ 2.8  calendar-permission     progress 7/14   (+ 2.8b denied state)
 │   ├─ 2.9  preferences             progress 8/14
 │   ├─ 2.10 personalization         progress 9/14   (gate: ≥1 chip)
 │   ├─ 2.11 vip                     progress 10/14  (skippable)
 │   ├─ 2.12 analysis                (dark, timed, no progress bar)
 │   ├─ 2.13 aha                     (no progress bar)
 │   └─ 2.14 notification            (no progress bar) → replace stack with Main tabs
 └─ Main tabs  `Bugün` · `Akış` · `Plan` · `Asistan`  (BottomNav)
     └─ 3.1 Bugün (Today)  — tab root
         ├─ 3.2 Sabah Brifing   (push, full-screen dark, tab bar hidden)
         ├─ 3.3 Gün Ortası      (push, tab bar hidden)
         ├─ 3.4 Günü Kapat      (push, tab bar hidden)
         ├─ weekly-report, approval-center, search, profile, email-detail, meeting-prep (push — specified in other files)
         ├─ Sheet: SmartReminderSheet   (bottom sheet, reusable)
         ├─ Sheet: LifeDetailSheet      (bottom sheet)
         └─ Sheet: "Neden önemli?"      (bottom sheet, per insight card)
```

Prototype navigation is a simple history stack (`navigate` pushes, `goBack` pops; with empty history `goBack` lands on `today`). `stepProgress` for onboarding is 0-based (`welcome:0 … notification:13`) over `totalSteps = 14`; the bar fills segments `i <= progress`.

Tab bar visibility rule in the prototype: the tab bar renders **only** on the four tab roots (`today`, `flow`, `plan`, `assistant`). Every pushed screen (briefings, detail, settings) hides it. Implement with a stack-over-tabs navigator.

### 0.2 Prototype colour → token map

| Prototype raw | Where used | Token to use |
|---|---|---|
| `#F8F8FC` | screen background (light) | `neutral/bg` |
| `#FFFFFF` | cards, sheets | `neutral/surface` |
| `#F1F1F8` | tertiary buttons, icon tiles, unselected check circle | `neutral/surface-2` |
| `#E8E8F0` | borders, disabled CTA bg, progress track | `neutral/hairline` |
| `#F2F2F8` | inner dividers, sheet title divider | `neutral/hairline` (lighter; acceptable to reuse) |
| `#0F0F1A` | primary text (light) **and** dark backgrounds | text → `ink`; background → `dark/bg` |
| `#6B6B80` | secondary text | `ink/secondary` |
| `#A0A0B2` | tertiary/muted text, timestamps | `ink/tertiary` |
| `#5B5CE2` | primary | `brand/primary` |
| `#4647C7` | gradient end, pressed | `brand/primary-pressed` |
| `#3A3AB5` | hero gradient far end | `raw #3A3AB5` (proposed `brand/deep`) — only inside the hero gradient |
| `#7879F1` | light indigo on dark (spinner, audio accent, sub-step text) | `dark/primary` (#8586F2) |
| `#EEEEFF` | soft indigo pills / selected rows | `brand/soft` |
| `rgba(91,92,226,.1)` | first meeting icon tile | `brand/soft` |
| `#FFEEED` / `#C0251B` / `#FF3B30` | critical soft / text / solid (badge dot, approvals count) | `critical/soft` / `critical/text` / `critical` |
| `#FFF4E0` / `#8C5200` / `#FF9F0A` | warning soft / text / solid | `warning/soft` / `warning/text` / `warning` |
| `#E8F8EE` / `#1A7A33` / `#34C759` | success soft / text / solid (live dot) | `success/soft` / `success/text` / `success` |
| `#E5F2FF` / `#0051A8` / `#007AFF` | info soft / text / solid | `info/soft` / `info/text` / `info` |
| `#F0ECFF` / `#5B21B6` / `#8B5CF6` | "SON TARİH" (deadline) badge, `Senden Beklenenler` row tint | **no token** — proposed `deadline/soft` `#F0ECFF`, `deadline/text` `#5B21B6`, `deadline` `#8B5CF6`. Fallback if product wants 4 semantic colours only: `brand/soft` + `brand/text-on-soft` |
| `linear-gradient(135deg,#5B5CE2 0%,#4647C7 100%)` | primary CTA gradient, avatar, Aha CTA | use the theme's indigo hero gradient token (`gradient/dusk` suggested for buttons) or flat `brand/primary`; both are acceptable, flat preferred for buttons |
| `linear-gradient(135deg,#5B5CE2 0%,#4647C7 60%,#3A3AB5 100%)` | Today hero card | morning hero → `gradient/dawn`; if the token is not indigo-based, reproduce the raw gradient |
| `linear-gradient(135deg,#7879F1 0%,#5B5CE2 100%)` | logo tile, splash | `gradient/dusk` (light-to-primary indigo) |
| `linear-gradient(135deg,#EEEEFF 0%,#E5F2FF 100%)` | Noise "SONRA" card | `brand/soft` → `info/soft` |
| `linear-gradient(135deg,#F8F0FF 0%,#EEF0FF 100%)` | Weekly report teaser | `raw` (proposed `brand/soft-2`); fallback `brand/soft` |
| `#E0E0EA` | toggle off track | `raw #E0E0EA` (proposed `neutral/toggle-off`) |
| `rgba(15,15,26,.45)` + blur 3 | sheet backdrop | `ink` @ 45% |
| Shadows `0 1px 4px rgba(15,15,26,.05/.06)`, `0 2px 12px rgba(15,15,26,.04)` | cards | `shadow/card` |
| `0 8px 24px rgba(91,92,226,.28)` | hero card | `shadow/brand` |

Prototype dark theme (`ThemeContext.dark`) → project dark tokens: bg `#0F0F1A`→`dark/bg`, surface `#1E1E2E`→`dark/surface`, surface2 `#2A2A3C`→`dark/surface-2`, border `#3A3A50`→`rgba(255,255,255,.08)`, text `#EAEAF8`→`dark/text`, textSec `#9090B8`→`dark/secondary`, textMuted `#6060A0`→`dark/tertiary`, primary `#7B7CF4`→`dark/primary`, primarySoft `#2A2A4A`→`dark/primary` @ 16%, critical `#FF6B6B`→`dark/critical-text`, warning `#FFAA44`→`dark/warning-text`, success `#4CD47A`→`dark/success-text`.

Only `TodayScreen` reads the theme (`t.bg`, `t.surface`, `t.surface2`, `t.text`, `t.textSec`, `t.textMuted`). Every other screen and every shared component in this cluster is hard-coded light (or hard-coded dark). §7 lists what must become theme-aware.

---

## 1. Shared components used by these screens

### 1.1 `onboarding/progress-bar`
- Row of `total` (=14) segments, `gap 4`, container `padding 8 20`, each segment `flex 1`, `height 3`, `radius 2`.
- Filled when `i <= progress`: `brand/primary`; else `neutral/hairline`. `transition background .3s`.
- Shown on steps 2.2–2.11 only. Not shown on welcome, analysis, aha, notification.

### 1.2 `button/primary` (onboarding CTA)
- Full width, `padding 16` (height ≈ 52), `radius 16`, `16/700` (use `body 15/600`, white), bg `brand/primary`. Variants seen: gradient CTA on welcome/aha (`padding 17`, `radius 18`, `17/700`, shadow `0 8px 32px rgba(91,92,226,.5)` / `0 8px 24px rgba(91,92,226,.35)`).
- Disabled (2.6, 2.10): bg `neutral/hairline`, text `ink/tertiary`, `cursor not-allowed`, `transition all .2s`.
- Text/ghost secondary under a CTA: `padding 13`, `14/500`, `ink/tertiary`, transparent (`Şimdi Değil`, `Şimdilik Atla`).
- Tertiary (`Atla`, `Bugüne Dön`, `Kapat`, `Önemli değil`): bg `neutral/surface-2`, text `ink/secondary`, `14/600`, `radius 12–14`, `padding 12–14`.

### 1.3 `row/check-benefit` (permission explainers, evening completed list)
- `padding 10 14`, bg `neutral/surface`, `radius 12`, shadow `0 1px 3px rgba(15,15,26,.04)`, `gap 10`.
- Leading circle `20`, bg `success/soft`, check glyph 10 stroke `success` (`#34C759`) on onboarding, `success/text` (`#1A7A33`) on Evening. Text `14 ink` (`secondary` token).

### 1.4 `card/priority` = prototype `InsightCard`
Used on 3.1 `Önceliklerin` (and Flow). Full anatomy:
- Container: bg `neutral/surface` (**hard-coded white — must use theme surface**), `radius 16`, `padding 16`, shadow `shadow/card` (`0 1px 4px rgba(15,15,26,.06), 0 2px 12px rgba(15,15,26,.04)`), enters with `fadeIn .3s` at `animationDelay = index × 60 ms` (starts at `opacity 0`).
- Row 1 (`gap 12`, space-between, `mb 12`): `badge/priority` left; time `11/500 ink/tertiary` right (`08:42`, `14:30`, `17:00`, `09:15`).
- Title: `15/500 ink`, `lh 1.45`, tracking −1%, `mb 10` (use `body`).
- Source tag (`mb 12`): see 1.6. **No onClick passed → dead** (product rule: tapping the source opens the original mail/event).
- Divider `1px neutral/hairline`, `mb 12`.
- Actions row (`gap 8`, wrap): one `chip/action` per `item.actions[]` — `12/600`, `radius 8`, `padding 6 12`, bg `brand/soft`, text `brand/primary`; the action literally named `Tamamlandı` renders bg `success/soft`, text `success/text` and dismisses the card locally (no persistence, no undo). Then `Neden önemli?` text button `12/500 ink/tertiary`, `margin-left auto`, `padding 6 0` (only if `whyImportant`). Then feedback pair: `👍` (tooltip `Doğru`) and `👎` (tooltip `Önemli değil`), `14`, `padding 4 6`, `radius 6`; selected 👍 bg `success/soft`; selected 👎 bg `critical/soft` and the card dismisses after `600 ms`; the non-selected glyph fades to `opacity .3`. Ship with Material `thumb_up` / `thumb_down` 18.
- "Neden önemli?" sheet: `bottom-sheet` titled `Neden önemli?`; body `padding 16 20`: `15 ink lh 1.55` = `whyImportant`; spacer 16; full-width tertiary button `Önemli değil` (`padding 12`, `radius 12`, bg `neutral/surface-2`, `14/600 ink/secondary`) → closes sheet and dismisses the card.
- Priority feedback and dismissal must be persisted and fed to the personalisation model (`ai-personalization` screen shows learned rules).

### 1.5 `badge/priority` = prototype `Badge`
`inline-flex`, `font 600`, `radius 6`, `size sm`: `9px`, `padding 2 6`, tracking +6%; `size md`: `10px`, `padding 3 8`. Ship as `badge 11/14 700 +5%` (sm may go to 10). Border `1px` at 12% of the text colour.

| priority | label | bg / text |
|---|---|---|
| `critical` | `KRİTİK` | `critical/soft` / `critical/text` |
| `upcoming` | `YAKLAŞAN` | `warning/soft` / `warning/text` |
| `deadline` | `SON TARİH` | `deadline/soft` / `deadline/text` (see §0.2) |
| `info` | `BİLGİ` | `info/soft` / `info/text` |
| `success` | `TAMAMLANDI` | `success/soft` / `success/text` |

### 1.6 `source-tag` = prototype `components/special/SourceTag` (canonical; `ui/SourceTag` is a duplicate to delete)
- `inline-flex`, `gap 4`, `padding 3 8`, `radius 6`, dot `5×5` + text `11/500`, tracking −1%, single line with ellipsis, `maxWidth 100%`.
- Colour picked by substring of the source string (case-insensitive): contains `gmail` → bg `rgba(234,67,53,.08)` text `#C23121` dot `#EA4335`; `outlook` → `rgba(0,114,198,.08)` / `#0072C6` / `#0072C6`; `calendar` → `rgba(52,168,83,.08)` / `#1E7E34` / `#34A853`; `apple` → `rgba(0,122,255,.08)` / `#0066CC` / `#007AFF`; else `rgba(107,107,128,.08)` / `ink/secondary` / `ink/tertiary`. These are provider brand colours — keep raw, add as `source/gmail` etc.
- Source string format: `{Provider} · {Person or Sender} · {Time}` (e.g. `Gmail · Ahmet Yılmaz · 08:42`, `Google Calendar · Bugün`, `Gmail · Kariyer Servisi · Dün`).
- Tap → open original item (email-detail / event). Dead in InsightCard.

### 1.7 `bottom-sheet` = prototype `BottomSheet`
- Backdrop: `ink` @ 45%, `backdrop-filter blur(3px)`, tap closes. Body scroll locked while open.
- Panel: bg `neutral/surface` (**hard-coded white**), `radius 24 24 0 0`, `maxHeight 85%` (or fixed `height` prop), enters `slideUp .3s cubic-bezier(.32,.72,0,1)` (from `translateY 20px`, opacity 0), shadow `0 -4px 40px rgba(15,15,26,.18)`.
- Grabber `36×4`, `radius 2`, `neutral/hairline`, `padding-top 12`, `padding-bottom 4`.
- Optional title: `17/600 ink` tracking −2% (`h3`), `padding 4 20 12`, bottom border `1px neutral/hairline`.
- Content area scrolls, `padding-bottom 32` (+ safe-area).
- No drag-to-dismiss in the prototype; implement swipe-down dismiss + haptic `selection` on open.

### 1.8 `sheet/smart-reminder` = prototype `SmartReminderSheet` (canonical, reused everywhere)
Opened from: `Hatırlat` on `card/priority`; the `Ödeme Yap` action on a `payment` life card (context `Ödeme: {title}`); Email detail, deadline, meeting, commitment, assistant action (other specs).
- `bottom-sheet` with title `Hatırlatıcı`; body `padding 0 20 20`.
- Context box (only when `context` given): bg `neutral/surface-2`, `radius 10`, `padding 10 12`, `mb 16`, text `13 ink/secondary lh 1.4` = context string (e.g. the insight title).
- Kicker `NE ZAMAN HATIRLATAYIM?` — `13/700 ink/tertiary` tracking +4% (`kicker` token), `mb 10`.
- Option rows (`gap 6`, `mb 16`): `padding 13 14`, `radius 12`, border `1.5px neutral/hairline`; selected: bg `brand/soft`, border `1.5px rgba(91,92,226,.4)`; `transition all .15s`. Leading emoji `18`; label `14/500 ink` flex; trailing selected check circle `18` `brand/primary` with white check `10`.

| id | icon | label |
|---|---|---|
| `30m` | ⏰ (`schedule`) | `30 dakika sonra` |
| `1h` | ⏱️ (`timer`) | `1 saat sonra` |
| `evening` | 🌆 (`wb_twilight`) | `Bu akşam · 19:00` |
| `tomorrow` | ☀️ (`wb_sunny`) | `Yarın sabah · 08:00` |
| `smart` | ✨ (`auto_awesome`) | `Uygun zamanda` |
| `custom` | 📅 (`calendar_month`) | `Kendin seç` |

- `smart` selected → info box `fadeIn`: bg `brand/soft`, `radius 10`, `padding 10 14`, border `1px rgba(91,92,226,.2)`, text `12 brand/primary lh 1.5`: `✨ Takvimindeki boşluklara göre uygun zamanı Dijital Asistan seçer.`
- `custom` selected → picker box `fadeIn`: bg `neutral/bg`, `radius 12`, `padding 12`, border `1px neutral/hairline`; kicker `TARİH VE SAAT SEÇ` `12/700 ink/tertiary mb 8`; row `gap 8`: native date input (flex 1) + native time input (`width 90`, default `09:00`), both `padding 10`, `radius 10`, border `1.5px neutral/hairline`, `14 ink`. On RN use the platform date-time picker.
- CTA `Hatırlatıcı Oluştur`: full width, `padding 14`, `radius 14`, `15/700`; enabled bg indigo gradient / white; disabled (`!selected` or `custom` without a date) bg `neutral/hairline`, text `ink/tertiary`.
- Confirm → success state (`scaleIn .25s`, `padding 32 0`, centred): circle `64` bg `success/soft` with ✅ `30` (ship `check_circle` in `success`); `Hatırlatıcı Oluşturuldu` `16/700 ink mb 4`; chosen option label `13 ink/secondary`. Sheet auto-closes after `1400 ms` and resets.
- Times `19:00` / `08:00` in the labels are the user's Evening Close / Morning Briefing preferences (2.9) — render dynamically.
- The QA brief requires reminder creation to go through Approval (`Hatırlatıcı Ayarla` approval item exists in `mockApprovals`) — decide: direct create for user-initiated reminders (this sheet) vs. approval for AI-suggested ones.
- Wording mismatch: product brief lists `30 dakika önce` / `1 saat önce` (before an event) while the sheet says `sonra` (after now). Use `önce` when the context has a fixed time (meeting, deadline), `sonra` otherwise.

### 1.9 `sheet/life-detail` (Today only)
`bottom-sheet` titled with the life item title; body `padding 0 20 20`: emoji `40` centred `mb 12`; detail `14 ink/secondary` centred `lh 1.5 mb 16`; then one row per `extra` line: `padding 11 0`, bottom border `1px neutral/hairline` except last, text `13/500 ink`; full-width tertiary button `Kapat` (`mt 16`, `padding 13`, `radius 14`, bg `neutral/surface-2`, `14/600 ink/secondary`). Field lists per type in §3.1.6 and §5.4.

### 1.10 `toggle`
`50×30` track `radius 15`; on `brand/primary`, off `raw #E0E0EA`; knob `24` white, `top 3`, `left 3 → 23`, shadow `0 1px 4px rgba(0,0,0,.18)`, spring `left .25s cubic-bezier(.34,1.56,.64,1)`, track `background .25s`. `role=switch`. (A second `Switch` component, 51×31, exists in `ui/` — duplicate; use one.)

### 1.11 `chip/select` (personalisation)
`padding 10 18`, `radius 24`, `14/600`; unselected bg `neutral/surface`, border `1.5px neutral/hairline`, text `ink`, shadow `0 1px 3px rgba(15,15,26,.04)`; selected bg `brand/primary`, text white, no border, shadow `0 2px 8px rgba(91,92,226,.25)`; `transition all .15s`.

### 1.12 `nav/bottom` = prototype `BottomNav`
- Height `82` (`padding-top 8`, `padding-bottom 24` safe area), bg `rgba(255,255,255,.95)` + `backdrop-filter blur(20px)`, top border `1px rgba(232,232,240,.8)`. Dark: `dark/surface` @ 95%, border `rgba(255,255,255,.08)`.
- Four equal tabs, column, `gap 4`, `padding 4 0`: icon `24` + label `10`, tracking +1%. Active: label `600 brand/primary`, icon stroke `2.2` and filled `rgba(91,92,226,.12)`, icon `scale 1.05` (`.2s`). Inactive: label `500 ink/tertiary`, icon stroke `1.8`.
- Tabs and suggested Material Symbols Rounded glyphs: `Bugün` → `home` (proto: house), `Akış` → `view_agenda`/`format_list_bulleted` (proto: 4 lines + active dot at bottom-right), `Plan` → `calendar_month` (proto: calendar with 3 dots), `Asistan` → `auto_awesome` (proto: circle with waveform).
- Tap → `navigate(tab)`. Re-tapping the active tab should scroll to top (not in prototype).

### 1.13 Screen header (pushed screens)
`padding 12 20` (or `height 52` on 3.2), 3 columns: back button `36` circle (light: bg `neutral/surface-2`, chevron `ink`; on dark: bg `rgba(255,255,255,.1)`, chevron white) → `goBack`; centred title `15/600` (`Sabah Brifing`, `Gün Ortası`, `Günü Kapat`); right spacer `36`. Light variant has bottom border `1px neutral/hairline`; dark variant (3.4) `1px rgba(255,255,255,.08)`. Icon: `arrow_back_ios_new` 18.

---

## 2. Screens — Splash and Onboarding

### 1.0 Splash (`splash`)
**Purpose / position.** First frame after app launch; root of the stack. Auto-advances after `2200 ms` to `onboarding` in the prototype. Real app: advance to Main tabs when a session + at least one connection exists, otherwise to 2.1; resume mid-onboarding if the account exists but no source is connected.

**Layout (dark, full-bleed).** bg `dark/bg`. Centred column (`animate-scale-in .25s`):
- Logo tile `88×88`, `radius 26`, bg `gradient/dusk` (`135deg #7879F1 → #5B5CE2`), shadow `0 20px 60px rgba(91,92,226,.5)`, `mb 20`, `float` loop (translateY 0 → −5 → 0, `3s ease-in-out infinite`). Mark: white circle `r=20` stroke 2 @ 30% + waveform polyline (`M13 22h7l3-9 4 18 3-9h5`) white stroke 2.5. Ship as an asset (`logo/mark-on-indigo`).
- Title `Dijital Asistan` — `26/900` white, tracking −4%, `mb 6` → `h1` white.
- Tagline `Bugün bilmen gerekenleri, sen sormadan söyler.` — `14` `rgba(255,255,255,.5)` → `secondary` in `dark/secondary`.
- Loader: 3 dots `6×6`, `gap 6`, absolute `bottom 60`, `rgba(255,255,255,.3)`, `wavePulse 1.2s ease-in-out infinite` staggered `0.2s` (scaleY .35 → 1).

**Interactive.** None. **States.** None (if the session check takes longer than the animation, keep the loader; never show a blank frame). **Motion.** scale-in + float + dot wave; no haptic. Respect reduce-motion (static logo).

---

### 2.1 Onboarding · Welcome (`welcome`)
**Purpose.** Brand intro, first CTA. Full-screen dark; no progress bar, no back.

**Layout.** bg `dark/bg`; centred column, `padding 0 32`, text centred.
- Logo tile `80×80`, `radius 24`, gradient as splash, shadow `0 16px 48px rgba(91,92,226,.5)`, `float`, `mb 32`; mark SVG 40.
- H1 `Dijital hayatın artık tek yerde.` — `30/900` white, tracking −4%, `lh 1.2`, `mb 16` → `display` white.
- Body `Mailini, takvimini ve açık işlerini anlayıp her gün sana kısa bir brifing hazırlar.` — `16` `rgba(255,255,255,.6)`, `lh 1.6`, `mb 48` → `body` `dark/secondary`.
- CTA `Başlayalım` — width 100% / `max 320`, `padding 17`, `radius 18`, gradient, `17/700` white tracking −2%, shadow `0 8px 32px rgba(91,92,226,.5)`.
- Legal `Devam ederek Gizlilik Politikası'nı kabul etmiş olursunuz.` — `11` `rgba(255,255,255,.25)`, `mt 16`.

**Interactive.** `Başlayalım` → 2.2. **Dead in prototype:** `Gizlilik Politikası` is plain text — make it a link to the privacy policy (in-app web view). No `Giriş yap` link for returning users on this screen (the primary canvas has one; add it here too).

---

### 2.2 Onboarding · Gürültüyü azalt (`noise`, progress 1/14)
**Layout.** bg `neutral/bg`; progress bar; content `padding 32 24 0`.
- H1 `Gürültüyü azalt.` — `28/800 ink`, tracking −4%, `lh 1.2`, `mb 12` → `h1`.
- Sub `Yüzlerce mail arasından gerçekten önemli olanı bulur.` — `15 ink/secondary lh 1.6 mb 40` → `body`.
- Visual block (flex 1, vertically centred, column `gap 12`, `mb 40`):
  - **Before card**: bg `neutral/surface`, `radius 16`, `padding 16`, shadow `0 1px 4px rgba(15,15,26,.06)`. Kicker `ÖNCE` `11/700 ink/tertiary` +5% `mb 12`. Six skeleton bars `height 8`, `radius 4`, bg `neutral/surface-2`, `gap 5`, widths `60 + sin(i)·30 %` → 60%, 85%, 87%, 64%, 37%, 31%. Big number `127 mail` `32/900` in `neutral/surface-2` (deliberately ghosted), tracking −4%, `mt 8`.
  - Arrow ⬇️ `24` centred (ship `arrow_downward` 24 `ink/tertiary`).
  - **After card**: bg gradient `brand/soft → info/soft`, `radius 16`, `padding 16`, border `1px rgba(91,92,226,.2)`. Kicker `SONRA` `11/700 brand/primary` +5% `mb 12`. Three rows `gap 8`: dot `8×8` `brand/primary` + `13/500 ink`: `Revize teklif — bugün 17:00`, `Toplantı değişikliği`, `Kritik son tarih`. Big number `3 önemli konu` `28/900 brand/primary` tracking −3% `mt 8`.
- CTA `Devam` (button/primary), `mb 16`.

**Interactive.** `Devam` → 2.3. No skip, no back (add back/swipe-back). **Motion.** none drawn; recommend the "Before" bars collapsing into the three rows on enter.

---

### 2.3 Onboarding · Proaktif (`proactive`, 2/14)
**Layout.** bg `neutral/bg`; progress; `padding 32 24 0`.
- H1 `Gününü sen sormadan hazırlarız.`; sub `Her sabah kişisel bir brifing hazır olur.` (`mb 32`).
- Mock briefing card (`float`): bg indigo gradient (`#5B5CE2 → #4647C7`), `radius 24`, `padding 20`, `mb 32`, shadow `0 16px 48px rgba(91,92,226,.3)`.
  - `Günaydın, Yunus 👋` `12/600 rgba(255,255,255,.65) mb 6`
  - `Bugün bilmen gereken 5 şey var.` `19/700` white tracking −3% `lh 1.3 mb 14`
  - Stats row `gap 12`: `3` / `mail`, `4` / `etkinlik`, `2` / `takip` — number `18/700` white, label `10 rgba(255,255,255,.6)`.
- Spacer; CTA `Devam` `mb 16`.

**Interactive.** `Devam` → 2.4. Card is static (fine). Use the real user's first name if known at this point (it is not — account comes later; keep `Yunus` as illustrative sample or use a neutral `Günaydın 👋`).

---

### 2.4 Onboarding · Kontrol sende (`control`, 3/14)
**Layout.** bg `neutral/bg`; progress; `padding 32 24 0`.
- H1 `Kontrol her zaman sende.` (no subtitle).
- List (flex 1, centred, `gap 12`): rows bg `neutral/surface`, `radius 14`, `padding 14 16`, `gap 12`, shadow `0 1px 3px rgba(15,15,26,.04)`; emoji `22` + `14/500 ink lh 1.4`:
  - 🔒 `Sen onaylamadan mail göndermeyiz.` (`lock`)
  - 👁️ `Verilerin reklam için kullanılmaz.` (`visibility_off`)
  - 🔗 `Bağlantını istediğin zaman kaldırabilirsin.` (`link_off`)
  - ✋ `Önemli işlemler onayın olmadan gerçekleşmez.` (`back_hand` / `verified_user`)
- CTA `Anladım` `mt 24 mb 16`.

**Interactive.** `Anladım` → 2.5.

---

### 2.5 Onboarding · Hesap oluştur (`account`, 4/14)
**Layout.** bg `neutral/bg`; progress; `padding 32 24 0`.
- H1 `Hesap oluştur` `24/800 ink` tracking −3% `mb 8` → `h1`/`h2`; sub `Güvenli giriş için bir yöntem seç.` `14 ink/secondary mb 32`.
- Provider buttons (column `gap 10`): full width, `padding 15 20`, `radius 14`, `15/600`, row `gap 12`, shadow `0 1px 3px rgba(15,15,26,.06)`, leading glyph `20`:
  - 🔵 `Google ile devam et` — bg `neutral/surface`, border `1.5px neutral/hairline`, text `ink`
  - ⬛ `Apple ile devam et` — bg `ink`, border `ink`, text white
  - 🔷 `Microsoft ile devam et` — bg `neutral/surface`, border `1.5px neutral/hairline`
- Divider row `margin 16 0`: line `1px neutral/hairline` — `veya` `12 ink/tertiary` — line.
- `E-posta ile devam et` — transparent, border `1.5px neutral/hairline`, `radius 14`, `padding 14`, `14/600 ink`.

**Interactive.** All four → 2.6 in the prototype (no auth). Real: Google/Apple/Microsoft native sign-in; e-mail → e-mail/OTP flow (not designed here — see `claude-02-onboarding.md` 2.5). Replace emoji with real provider logos (Apple button must follow Apple HIG: black, SF symbol logo). Missing: terms/privacy line, "already have an account" affordance — the primary canvas provides both.

**States.** Loading on the tapped provider (spinner in-button, others disabled); error toast `Giriş yapılamadı. Tekrar dene.` (proposed; not in prototype).

---

### 2.6 Onboarding · Dijital hayatını bağla (`connect`, 5/14)
**Layout.** bg `neutral/bg`; progress; `padding 24 20 16`.
- H1 `Dijital hayatını bağla.` `24/800 mb 4`; sub `En az 1 mail + 1 takvim bağla.` `14 ink/secondary mb 24`.
- Service rows (column `gap 8`, flex 1): row `padding 14 16`, `radius 14`, `gap 12`, `transition all .15s`. Unselected: bg `neutral/surface`, border `1px neutral/hairline`. Selected: bg `brand/soft`, border `2px brand/primary`. Leading emoji `22` in `32` slot; label `14/600 ink`; description `11 ink/tertiary`; trailing check circle `22`: selected bg `brand/primary` + white check `10`; unselected bg `neutral/surface-2`, border `1.5px neutral/hairline`.

| id | icon | label | description |
|---|---|---|---|
| `gmail` | 📧 | `Gmail` | `Google hesabın` |
| `outlook` | 📨 | `Outlook` | `Microsoft hesabın` |
| `gcal` | 📅 | `Google Takvim` | `Google Calendar` |
| `mcal` | 📆 | `Microsoft Takvim` | `Outlook Calendar` |
| `acal` | 🗓️ | `Apple Takvim` | `iCloud Calendar` |

- CTA `mt 16`: enabled when `connected ∩ {gmail, outlook} ≠ ∅` **and** `connected ∩ {gcal, mcal, acal} ≠ ∅` → label `Devam`; otherwise disabled with label `Mail ve takvim seç`.

**Interactive.** Row tap toggles local selection only (prototype does not run OAuth). Real: tapping a row opens the permission explainer (2.7 for mail, 2.8 for calendar) → native OAuth / EventKit → row becomes `Bağlandı`. Selected state should read as connected (add label `Bağlandı` + `check` glyph per the primary canvas `pill/connect`). `Devam` → 2.7.

**States.** Per-row connecting spinner; OAuth cancelled → row stays unselected + toast; OAuth error → error card `Erişim izni reddedildi.` (§6). Offline → disable rows with banner `İnternet bağlantısı yok.`

---

### 2.7 Onboarding · Gmail izin açıklaması (`permission`, 6/14)
**Layout.** bg `neutral/bg`; progress; `padding 32 24 16`.
- Icon 📧 `36 mb 12` (ship a `40` tile `brand/soft` with `mail` glyph).
- H1 `Gmail erişimine neden ihtiyacımız var?` `22/800 ink` tracking −3% `lh 1.3 mb 8` → `h2`.
- Benefit rows (`row/check-benefit`, `gap 8`, `margin 16 0`, flex 1): `Önemli mailleri bulmak`, `Cevap bekleyenleri tespit etmek`, `Son tarihleri anlamak`, `Takip edilecek konuları bulmak`.
- Trust box: bg `brand/soft`, `radius 14`, `padding 14 16`, `mb 24`, border `1px rgba(91,92,226,.15)`; `13/500 ink lh 1.5`: `🔒 Sen onaylamadan mail göndermeyiz. Veriler reklamverenlerle paylaşılmaz.`
- CTA `Güvenli şekilde bağla`.

**Interactive.** CTA → 2.8 (prototype). Real: launch Google OAuth (gmail.readonly + profile); on success continue; on cancel stay. **Dead/missing:** no `Şimdi değil`; the screen always says Gmail even when the user picked Outlook only — parametrise: `{Provider} erişimine neden ihtiyacımız var?` with an Outlook variant (`Outlook erişimine neden ihtiyacımız var?`) and pick provider from 2.6 selection.

---

### 2.8 Onboarding · Takvim izni (`calendar-permission`, 7/14)
**Layout (default).** bg `neutral/bg`; progress; `padding 32 24 16`.
- Icon 📅 `36 mb 12` (`calendar_month` tile).
- H1 `Takvimine neden erişmemiz gerekiyor?` `22/800` → `h2`.
- Benefit rows (`row/check-benefit`): `Gününü anlayabilmek`, `Toplantı çakışmalarını fark etmek`, `Yaklaşan etkinlikleri brifinge eklemek`, `Uygun zaman önerileri sunmak`.
- Trust box (as 2.7, `mb 20`): `🔒 Takviminde değişiklik yapmadan önce senden onay isteriz.`
- CTA `Takvim Erişimine İzin Ver` `mb 10`; ghost `Şimdi Değil`.

**Interactive.** CTA → 2.9 (prototype). Real: for Apple Takvim → EventKit `requestFullAccessToEvents`; for Google/Microsoft → OAuth calendar scope. `Şimdi Değil` → shows 2.8b in the prototype (used as a stand-in for "denied"). Real: `Şimdi Değil` skips to 2.9 with calendar unconnected; **denied by the OS** shows 2.8b.

### 2.8b Takvim erişimi kapalı (denied state, same route)
**Layout.** progress bar stays; content centred (`padding 32 24 16`, text-align centre): 📅 `48 mb 16`; H1 `Takvim erişimi kapalı` `20/800 mb 8` → `h2`; body `Dilersen Ayarlar'dan daha sonra açabilirsin. Takvim olmadan da temel özellikler çalışır.` `14 ink/secondary lh 1.55 mb 32`; CTA `Ayarları Aç` (`padding 14`, `radius 14`, `15/700`) `mb 10`; ghost `Şimdilik Atla`.

**Interactive.** `Ayarları Aç` — **dead in prototype** (`alert('Ayarlar açılıyor...')`) → `Linking.openSettings()`; on return to foreground re-check permission and auto-advance if granted. `Şimdilik Atla` → 2.9. The Today screen must then show the calendar-empty/permission card (§6).

---

### 2.9 Onboarding · Brifing saatleri (`preferences`, 8/14)
**Layout.** bg `neutral/bg`; progress; `padding 24 20 16`.
- H1 `Günün ne zaman başlıyor?` `22/800 mb 4` → `h2`; sub `Brifinglerin için en uygun zamanları ayarla.` `14 ink/secondary mb 24`.
- Rows (column `gap 10`, flex 1): bg `neutral/surface`, `radius 14`, `padding 14 16`, `gap 12`, shadow `0 1px 3px rgba(15,15,26,.04)`; emoji `22`; label `14/500 ink` flex; trailing time control `15/700 brand/primary`, bg `brand/soft`, `radius 10`, `padding 6 10` (native `<input type=time>` → RN time picker):

| icon | label | default |
|---|---|---|
| ☀️ (`wb_sunny`) | `Sabah Brifing` | `07:30` |
| 🌤️ (`partly_cloudy_day`) | `Gün Ortası` | `13:00` |
| 🌙 (`bedtime`) | `Akşam Kapanış` | `19:00` |
| 📅 (`calendar_month`) | `Hafta sonu brifing gönder` | toggle, default **off** |

- CTA `Devam` `mt 16`.

**Interactive.** Time controls open the platform time picker and store `briefing.morning / midday / evening` (HH:mm, local tz). Toggle stores `briefing.weekend`. `Devam` → 2.10. Validation to add: midday must be after morning, evening after midday (not enforced in prototype). Values feed 3.1 shortcut labels (`13:00 brifing`, `19:00 özet`), 3.3 footer (`Sonraki brifing saat 19:00'da`) and 1.8 option labels.

---

### 2.10 Onboarding · Kişiselleştirme (`personalization`, 9/14)
**Layout.** bg `neutral/bg`; progress; `padding 24 20 16`.
- H1 `Senin için neler daha önemli?` `22/800 mb 4`; sub `Birden fazla seçebilirsin.` `14 mb 24`.
- Chip cloud (`chip/select`, wrap, `gap 8`, `align-content flex-start`, flex 1): `İş`, `Aile`, `Finans`, `Seyahat`, `Alışveriş`, `Randevular`, `Son Tarihler`, `Hepsi`.
- CTA `Devam` `mt 16`, disabled until ≥1 chip.

**Interactive.** Selecting `Hepsi` clears every other chip and selects only `Hepsi`; selecting any other chip removes `Hepsi`. Store as `interests[]` (ids: `work, family, finance, travel, shopping, appointments, deadlines, all`). `Devam` → 2.11.

---

### 2.11 Onboarding · VIP kişiler (`vip`, 10/14)
**Layout.** bg `neutral/bg`; progress; `padding 24 20 16`.
- H1 `Kimlerden gelen şeyleri asla kaçırmak istemezsin?` `22/800 lh 1.3 mb 4`; sub `VIP kişilerin mesajları her zaman öne çıkar.` `14 mb 24`.
- Contact rows (column `gap 8`, flex 1): `padding 12 14`, `radius 12`, `gap 12`, `transition all .15s`; unselected bg `neutral/surface`, border `1px neutral/hairline`; selected bg `brand/soft`, border `1.5px rgba(91,92,226,.4)`. Avatar `36` circle: bg `neutral/surface-2` / selected `brand/primary`; initials `13/700 ink/secondary` / white. Name `14/500 ink`. Selected → trailing check circle `20 brand/primary`.
- Contacts (sample): `Mehmet Kaya` (MK), `Ahmet Yılmaz` (AY), `Fatma Şahin` (FŞ), `Ayşe Demir` (AD), `Can Öztürk` (CÖ), `Anne / Baba`, `Yönetici` (Y). The prototype's initials function yields `A/` for `Anne / Baba` — compute initials from alphabetic tokens only (→ `AB`).
- Footer row `gap 8 mt 16`: `Atla` (flex 1, tertiary, `padding 14`, `radius 14`, `14/600`) and `Devam` (flex 2, primary, `15/700`) — label becomes `Devam ({n})` when `n > 0`.

**Interactive.** Row toggles selection. `Atla` and `Devam` → 2.12. **Missing in prototype:** contact source. Real: suggestions = top correspondents from the just-connected mailbox (needs the first sync to have started) plus a search field / contact picker (`Kişi ara…`) and the free-form roles `Anne / Baba`, `Yönetici`, `Eş` as role chips rather than contacts. Persist as `vipPeople[]` (personId or email); editable later at `vip-people`.

---

### 2.12 Onboarding · İlk analiz (`analysis`, timed, no progress bar)
**Purpose.** "Dramatic" processing screen while the first 72-hour scan runs. Non-dismissable, no back, no CTA.

**Layout.** bg `dark/bg`; centred column `padding 0 24`.
- Spinner block `100×100 mb 40`: ring `border 3px rgba(91,92,226,.2)` with `border-top-color #7879F1` (`dark/primary`), `spin 1s linear infinite`; inner disc `76` (inset 12) bg `rgba(91,92,226,.1)` containing 🔍 `32` (`search` / `auto_awesome` in `dark/primary`).
- H2 `Dijital hayatın analiz ediliyor…` `20/700` white tracking −2% `mb 8` centred → `h2` `dark/text`.
- Step text `15 rgba(255,255,255,.7)` `mb 4` centred, `fadeIn` on each change (keyed).
- Sub text `14/600 #7879F1` (`dark/primary`) centred, `fadeIn` (only when non-empty).
- Progress dots `mt 32`, 5 × `8×8` `gap 8`: filled `#7879F1` for `i <= step`, else `rgba(255,255,255,.15)`, `transition .3s`.

**Timeline (prototype):** step `i` shows at `i × 1000 ms`; after the last step, `+1200 ms` → 2.13.

| i | text | sub |
|---|---|---|
| 0 | `Son 72 saat taranıyor…` | — |
| 1 | `E-postalar sınıflandırılıyor…` | `127 mail bulundu` |
| 2 | `Takvim kontrol ediliyor…` | `8 potansiyel önemli konu` |
| 3 | `Açık konular aranıyor…` | `4 yaklaşan etkinlik` |
| 4 | `Neredeyse bitti…` | `2 olası takip` |

**Real behaviour.** Drive steps from the actual sync job (mail fetched → classified → calendar read → open loops) with real counts in the sub line; keep a minimum of ~4 s and a maximum before falling back to "still working" (`Biraz daha sürüyor…`, proposed). Error → error card `AI şu an meşgul.` with `Yenile` (§6). Haptic: `impactLight` per step, `notificationSuccess` on completion. Respect reduce-motion (static ring + progress dots).

---

### 2.13 Onboarding · Aha (`aha`, no progress bar)
**Layout.** bg `neutral/bg`; `padding 32 20 16`.
- Header centred `mb 24`: 🎉 `40 mb 12`; H1 `Hazır.` `26/900 ink` tracking −4% `mb 8` → `display`; body `15 ink/secondary lh 1.5`: `Son 72 saatte bilmen gereken 5 şey bulduk.` where `5 şey` is `<strong>` in `ink` (i18n: `Son 72 saatte bilmen gereken {n} şey bulduk.` with `{n} şey` emphasised).
- Card list (column `gap 8`, flex 1), each `fadeIn` with `animationDelay = i × 100 ms`: bg `neutral/surface`, `radius 14`, `padding 12 14`, shadow `0 1px 4px rgba(15,15,26,.06)`; badge row `mb 8` (badge `9/700`, tracking +6%, `radius 5`, `padding 2 6`); text `13/500 ink mb 4`; source `11 ink/tertiary`.

| badge | text | source |
|---|---|---|
| `KRİTİK` (`critical/soft`/`critical/text`) | `Ahmet Yılmaz senden bugün 17:00'ye kadar teklif bekliyor.` | `Gmail` |
| `YAKLAŞAN` (`warning/soft`/`warning/text`) | `14:30'da Mehmet ile müşteri toplantın var.` | `Google Calendar` |
| `SON TARİH` (`deadline/soft`/`deadline/text`) | `Başvuru bugün saat 17:00'de kapanıyor.` | `Gmail` |
| `BİLGİ` (`info/soft`/`info/text`) | `Trendyol siparişin bugün geliyor.` | `Gmail` |
| `BİLGİ` | `TK2412 uçuşun yarın 09:15'de.` | `Gmail` |

- CTA `Brifingimi Gör` `mt 20`, `padding 17`, `radius 18`, gradient, `17/700` tracking −2%, shadow `0 8px 24px rgba(91,92,226,.35)`.

**Interactive.** `Brifingimi Gör` → 2.14. Cards are not tappable (**dead**) — tapping should deep-link to the corresponding insight after onboarding (optional). Real data: the top 5 insights from the first analysis; if fewer than 3, show a softer headline (`Şimdilik sakin görünüyor.` proposed) and still continue.

---

### 2.14 Onboarding · Bildirim izni (`notification`, no progress bar)
**Layout.** bg `neutral/bg`; `padding 32 24 16`.
- 🔔 `36 mb 12` (`notifications` tile).
- H1 `Sadece önemli olduğunda haber verelim.` `22/800 lh 1.3 mb 4`; sub `Gereksiz bildirim göndermeyiz.` `14 mb 24`.
- Example rows (column `gap 8`, flex 1): bg `neutral/surface`, `radius 12`, `padding 12 14`, `gap 10`, shadow xs; emoji `18`; text `13 ink italic lh 1.4` (quotes are part of the string):
  - ☀️ `"Bugün bilmen gereken 5 şey var."`
  - ⚠️ `"Ahmet senden bugün 17:00'ye kadar dönüş bekliyor."`
  - 📅 `"14:30 toplantına 20 dakika kaldı."`
  - 📦 `"Kargon bugün geliyor."`
- Buttons column `gap 8 mt 24`: `Bildirimleri Aç` (gradient primary, `radius 16`, `padding 16`, `16/700`); ghost `Şimdi Değil`.

**Interactive.** Both → Main tabs / 3.1 (prototype). Real: `Bildirimleri Aç` → OS permission prompt (iOS `requestPermissions`, Android 13+ `POST_NOTIFICATIONS`), then replace the stack with Main tabs regardless of the answer; store `notifications.permission`. `Şimdi Değil` → Main tabs; Today may later show a soft banner to enable notifications. Android-only extra step (`Telefon Bildirimleri`, Notification Listener) exists in the primary canvas, not in this prototype.

---

## 3. Screens — the "Bugün" cluster

### 3.1 Bugün · Light (`today`, tab root)
**Purpose.** The product's home: answers "what matters today". Tab 1 of 4; bottom nav visible. Pull-to-refresh expected (not in prototype).

**Layout top-to-bottom.** bg `neutral/bg` (`t.bg`).

**3.1.1 Header** (`padding 8 20 0`, row, space-between, not scrolling)
- Left: date `Cumartesi, 5 Eylül` — `13/500 ink/tertiary` (`t.textMuted`), `mb 1` → `secondary`; greeting `Günaydın, Yunus` — `26/700 ink` (`t.text`), tracking −3%, `lh 1.2` → `h1`. Greeting is time-of-day dependent (`Günaydın` / `İyi öğlenler` / `İyi akşamlar` proposed; only `Günaydın` exists in the prototype) + first name.
- Right cluster (`gap 8`), three `36×36` circles:
  1. **Approvals** — bg `warning/soft`, ⭐ `16` (ship `verified` / `task_alt` in `warning/text`), red badge `16` circle at `top −2 right −2`, bg `critical`, `9/800` white = `pendingApprovals` (`3`); hidden when 0. Tap → `approval-center`. Accessibility label `Onay bekleyenler, {n}`.
  2. **Search** — bg `neutral/surface-2` (`t.surface2`), magnifier `16` stroke `ink/secondary` (`search`). Tap → `search`.
  3. **Avatar** — indigo gradient, initial `Y` `14/700` white. Tap → `profile`.

**3.1.2 Scroll area** `padding 16 20 16`, sections in order:

**A. Hero briefing card (`card/ai-insight` hero)** — whole card tappable (`card-press`: `scale .982` on press, `.15s`) → `morning-briefing`; `mb 16`; bg `gradient/dawn` (raw `135deg #5B5CE2 0% → #4647C7 60% → #3A3AB5 100%`); `radius 20`; `padding 18 20`; shadow `0 8px 24px rgba(91,92,226,.28)`.
- Row 1 (space-between, `mb 12`): left — kicker `SABAH BRİFİNGİ` `11/600 rgba(255,255,255,.7)` +5% with a live dot `5×5` `success` and glow `0 0 6px rgba(52,199,89,.6)` (`gap 8`, `mb 4`); title `Bugün bilmen gereken\n5 şey var.` `19/700` white tracking −3% `lh 1.3` (i18n `Bugün bilmen gereken {n} şey var.`, forced line break before `{n}`). Right — play disc `44` circle bg `rgba(255,255,255,.18)`, glyph: circle stroke 1.5 + play triangle, white (`play_circle` 24).
- Subline `2 dakikalık brifing hazır` `13 rgba(255,255,255,.75) mb 14` (i18n `{m} dakikalık brifing hazır`).
- Mini stats row (`gap 12`, each centred): `3` `önemli mail`, `4` `etkinlik`, `2` `takip`, `1` `son tarih` — number `16/700` white tracking −2%, label `10/500 rgba(255,255,255,.65)`. Kicker label changes with time of day (`GÜN ORTASI`, `AKŞAM KAPANIŞ`) in the real app; only the morning variant is drawn.
- Buttons row `mt 12 gap 8`: `Dinle` — bg `rgba(255,255,255,.2)`, `radius 10`, `padding 7 14`, `12/600` white, leading play glyph `12`; `Brifing Aç` — transparent, border `1px rgba(255,255,255,.35)`, text `rgba(255,255,255,.85)`. Both `stopPropagation` and → `morning-briefing`. Real: `Dinle` opens 3.2 **with playback auto-started**; `Brifing Aç` opens 3.2 paused.
- Dark: same gradient; no change.

**B. `Önceliklerin` section** (`mb 8`)
- Header row (`mb 12`): `Önceliklerin` `17/700 ink` tracking −2% → `h3`; right count `{n} konu` `12/600 brand/primary` (`4 konu`).
- Column `gap 10` of `card/priority` (§1.4) for each insight, stagger `i × 60 ms`. Action routing in the prototype: `Yanıtı Gör` → `email-detail`; `Hazırlan` → `meeting-prep`; `Hatırlat` → `sheet/smart-reminder` with `context = item.title`; `Tamamlandı` → local dismiss. **Dead:** `Takvime Ekle` (deadline card) and `Görüntüle` (info card) have no handler — wire `Takvime Ekle` → create-event approval sheet (`Takvim Etkinliği Oluştur`) and `Görüntüle` → `email-detail`. Count should decrement on dismiss (static in prototype). When the list is empty show the `Her şey kontrol altında.` empty card (§6).

**C. `Programın` section** (`mt 16 mb 16`) — `card/calendar` compact rows
- Title `Programın` `17/700` `mb 12`.
- Column `gap 8`, one row per meeting (stagger `i × 50 + 200 ms`, `card-press`): bg `neutral/surface` (`t.surface`), `radius 14`, `padding 12 14`, shadow `0 1px 4px rgba(15,15,26,.05)`, row `gap 12`.
  - Icon tile `44` `radius 12`: first row bg `brand/soft` (`rgba(91,92,226,.1)`) with calendar glyph stroke `brand/primary`; other rows bg `neutral/surface-2` (**hard-coded `#F1F1F8`**) glyph `ink/tertiary` (`calendar_today` 20).
  - Title `14/600 ink` tracking −1% `mb 2`; meta `{time} · {duration} · {platform}` `12 ink/secondary` (e.g. `14:30 · 60 dk · Google Meet`).
  - Trailing pill only when `minutesLeft` set: `{n}dk` `11/600 brand/primary`, bg `brand/soft`, `padding 3 8`, `radius 8` (`18dk`).
- Tap any row → `meeting-prep` (prototype passes no id — pass `meetingId`). Sort ascending by start time and hide finished meetings (prototype order is 14:30, 10:00, 16:00 and the 10:00 standup also appears as completed in 3.4). Empty → `Bugün takvimin oldukça sakin.` card with `Etkinlik Ekle`.

**D. `Dijital Hayatın` section** (`mb 16`) — `card/life` horizontal rail
- Title `Dijital Hayatın` `17/700` `mb 12`.
- Horizontal scroll (`gap 10`, `padding-bottom 4`, no scrollbar, should bleed to the right edge with `padding-left 20`). Card: bg `neutral/surface`, `radius 16`, `padding 14`, `minWidth 160`, shadow card, stagger `i × 40 + 300 ms`. Emoji `24 mb 8` (ship tinted tile `36` `radius 10`); title `13/600 ink lh 1.3 mb 3`; detail `11 ink/tertiary lh 1.3 mb 10`; action chip `11/600 brand/primary`, bg `brand/soft`, `radius 8`, `padding 5 10`.
- Only the chip is tappable in the prototype; make the whole card tappable too. Routing (`openLifeDetail`): `payment` → `sheet/smart-reminder` with context `Ödeme: {title}`; all other types → `sheet/life-detail` with the type's field list (§5.4).

| id | type | icon | title | detail | time | action |
|---|---|---|---|---|---|---|
| 1 | `cargo` | 📦 | `Trendyol siparişin bugün geliyor` | `Sipariş #TY884521 · Teslimat aralığı 14:00–18:00` | `Bugün` | `Takip Et` |
| 2 | `flight` | ✈️ | `TK2412 · İstanbul → Antalya` | `Yarın 09:15 kalkış · Terminal 1 · 2B kapısı` | `Yarın 09:15` | `Uçuş Detayı` |
| 3 | `payment` | ⚡ | `Elektrik faturası` | `1.842 TL · Son ödeme: 10 Eylül` | `10 Eylül` | `Ödeme Yap` |
| 4 | `subscription` | 🎬 | `Netflix yenileniyor` | `149,99 TL · 9 Eylül'de otomatik ödeme` | `9 Eylül` | `Yönet` |
| 5 | `reservation` | 🍽️ | `Akşam yemeği rezervasyonu` | `Nusr-Et Beşiktaş · Cumartesi 20:30 · 4 kişi` | `Cumartesi 20:30` | `Detaylar` |
| 6 | `security` | 🔐 | `Google hesabında yeni giriş` | `Chrome · Windows · İstanbul · Az önce` | `Az önce` | `İncele` |

- Note the action label `Ödeme Yap` opens a *reminder* sheet — misleading; the QA brief renames life actions to `Takibi Gör` (cargo), `Detayı Gör` + `Takvime Ekle` (flight), `Detayı Gör` + `Hatırlat` (reservation), `Hatırlat` (payment), `Yenileme Detayı` (subscription), `Kaynağı Aç` (security). Adopt those labels; keep the prototype ones as fallbacks in the string table.
- Empty rail → hide the section entirely.

**E. Shortcut pair** (`gap 12 mb 16`, two flex-1 buttons, `card-press`): bg `neutral/surface`, `radius 14`, `padding 12 14`, shadow card, row `gap 12`, text-left.
- 🌤️ `20` + `Gün Ortası` `12/600 ink` / `13:00 brifing` `10 ink/tertiary` → `midday-pulse`.
- 🌙 `20` + `Akşam Kapanış` `12/600` / `19:00 özet` `10` → `evening-close`.
- Times come from 2.9 preferences (`{HH:mm} brifing`, `{HH:mm} özet`). Before the scheduled time the destination shows a "not ready yet" state (§6); after, the real content.

**F. Weekly report teaser** (full width, `card-press`): bg gradient `#F8F0FF → #EEF0FF` (`brand/soft` fallback), `radius 14`, `padding 14 16`, row `gap 12`: 📊 `24` (`bar_chart` tile); `Haftalık Raporun Hazır` `13/600 ink mb 1`; `684 mail analiz edildi · 2 sa 48 dk kazandırıldı` `11 ink/secondary` (i18n `{mails} mail analiz edildi · {time} kazandırıldı`); chevron `16` `brand/primary` (`chevron_right`). → `weekly-report`. Show only when a weekly report exists (e.g. Monday–Sunday after generation); hide otherwise.

- Bottom spacer `16` (+ tab bar).

**3.1.3 Sheets on this screen.** `sheet/smart-reminder` (§1.8, `reminderCtx`), `sheet/life-detail` (§1.9, `lifeDetail`), per-card `Neden önemli?` (§1.4).

**3.1.4 Data needed** (see §5/§6): `user.firstName`, `today.date`, `pendingApprovals`, `briefing{type, itemCount, durationMin, isReady, stats{importantMail, events, followUps, deadlines}}`, `insights[]`, `meetings[]`, `lifeItems[]`, `preferences{morning, midday, evening}`, `weeklyReport{mailsAnalyzed, timeSaved, isReady}`.

**3.1.5 States.**
- *Loading:* keep header; hero shows `AIProcessingState`-style shimmer (`AI Analiz Yapıyor` + rotating `Mail analizi yapılıyor` / `Takvim kontrol ediliyor` / `Öncelikler belirleniyor` / `Brifing hazırlanıyor`) or the `InsightCardSkeleton` (§6.1) ×2 under `Önceliklerin`, `MeetingCardSkeleton` ×2 under `Programın`; life rail hidden. Shimmer `1.4s`.
- *Refreshing (pull):* `SyncStatusBar` row at the top of the scroll: 🔄 tile `32` `info/soft`, `Senkronize ediliyor` `13/600`, `Gmail · Son güncelleme: az önce` `11 ink/secondary`, mini progress `48×4` `info`. Full-screen variant `Güncelleniyor` / `Yeni içerik aranıyor...`.
- *Empty:* section-level cards from §6.2 (`Her şey kontrol altında.`, `Bugün takvimin oldukça sakin.`, `Bekleyen takip yok.`); no-connection replaces the hero with `Mailini bağla.` + `Hesap Bağla` → `integrations`.
- *Error/offline:* banner above the hero using §6.3 cards (`İnternet bağlantısı yok.`, `Bağlantı süresi doldu.` → `Yeniden Bağlan`, `Senkronizasyon gecikiyor.`, `AI şu an meşgul.`); cached content stays visible.
- *Permission denied (calendar):* `Programın` shows `Takvim izni verilmedi.` card with `Ayarlara Git` / `Atla`.
- *Notifications not granted:* optional soft banner (not drawn).

**3.1.6 Dark (`Bugün · Dark`).** `t` swaps bg/surface/text; everything else in this screen is hard-coded and must be tokenised: `card/priority` white → `dark/surface`; meeting icon tile `#F1F1F8` → `dark/surface-2`; `brand/soft` pills → `dark/primary @ 16%` with text `dark/primary`; approvals button `warning/soft` → `dark/warning-text @ 16%`; weekly teaser gradient → `dark/surface-2`; sheets (`bottom-sheet` white) → `dark/surface`; hero unchanged; dividers `rgba(255,255,255,.08)`; badge soft colours at 16–20% alpha of their dark text tokens (`dark/critical-text`, `dark/warning-text`, `dark/success-text`, `info`).

**3.1.7 Motion/haptics.** Cards `fadeIn .3s` (translateY 6 → 0) with the staggers above; press scale `.982`; dismissing a priority card should animate height collapse (prototype removes instantly). Haptics (proposed): `selection` on chip/action tap, `notificationSuccess` on `Tamamlandı` and reminder created, `impactMedium` on 👎.
