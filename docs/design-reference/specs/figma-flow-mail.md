# 04 Akış ve Mail — Figma prototype implementation spec

**Source (secondary reference):** Figma prototype, `src/screens/flow/*` — `FlowScreen.tsx`, `MailIntelligence.tsx`, `EmailDetail.tsx`, `AIDraftReply.tsx`, `SmartFollowUp.tsx`, `WaitingReply.tsx`, plus the shared pieces they render (`PageHeader`, `BottomSheet`, `SmartReminderSheet`, `SourceTag`, `Chip`, `Avatar`, `ThemeContext`, `NavigationContext`, `index.css`) and the example rows in `src/data/mock.ts`. The prototype's design brief numbers these screens **§16 Akış, §17 Mail Intelligence, §18 Email Detail, §19 AI Draft Reply, §20 Smart Follow-Up, §21 Senden Cevap Bekleyenler** (Figma page "07 Flow / Mail Intelligence"). This spec numbers them **4.1–4.6** to line up with the primary reference deck "04 Akış ve Mail"; the brief's § numbers and the prototype route IDs are given in each heading.

**Status of this reference.** It is the *secondary* reference: use it for screen coverage, interaction wiring, edge cases, sheets and states. Where visual values conflict with the primary reference (Claude design deck), the primary wins. Every value below is transcribed from the prototype source; where the prototype is inconsistent with the brief or with itself, it is called out as **Flag** so engineers make a deliberate decision instead of copying a prototype accident.

---

## 4.0 Shared foundations for this section

### 4.0.1 Prototype palette → product token map

The prototype hard-codes its own hex palette. Use product tokens as follows (never the raw hex):

| Prototype value | Where it appears | Product token |
|---|---|---|
| `#F8F8FC` | screen background, "Son Onay" preview box, status box on follow-up card | `neutral/bg` |
| `#FFFFFF` | cards, sheets, inputs | `neutral/surface` |
| `#F1F1F8` | secondary buttons, unselected tone chips, context box in reminder sheet, "Düşük Öncelik" tint | `neutral/surface-2` |
| `#E8E8F0` | input borders (1.5px), sheet handle, disabled CTA fill, non-primary action tile borders | `neutral/hairline` |
| `#F2F2F8` | section dividers, card row separators, category row border (1px) | `neutral/hairline` (lighter — same token, use at 60% alpha if a second step is wanted) |
| `#0F0F1A` | primary text, Gmail-handoff full-screen background | `ink` |
| `#6B6B80` | secondary text, secondary button labels | `ink/secondary` |
| `#A0A0B2` | tertiary text, kickers, timestamps, disabled CTA text | `ink/tertiary` (disabled CTA text → `ink/disabled`) |
| `#5B5CE2` | primary, selected chip text, AI accents | `brand/primary` |
| `#4647C7` | gradient end of every primary button (`linear-gradient(135deg, #5B5CE2 0%, #4647C7 100%)`) | `brand/primary-pressed` — treat the "brand gradient" as `brand/primary → brand/primary-pressed` at 135°; a flat `brand/primary` fill is an acceptable RN fallback |
| `#EEEEFF` | soft brand tints (Mail Özeti pill, selected reminder option, AI badge, follow-up primary action) | `brand/soft`; text on it → `brand/text-on-soft` (prototype uses `brand/primary` on soft — either is acceptable, prefer `brand/text-on-soft` for contrast) |
| `rgba(91,92,226,0.15/0.2/0.3/0.4)` | AI-insight card border, smart-reminder info border, selected chip border, selected option border | `brand/primary` at that alpha |
| `#FFEEED` / `#C0251B` | critical soft / critical text | `critical/soft` / `critical/text` |
| `#FF3B30` | "Erişim izni reddedildi" CTA | `critical` |
| `#FFF4E0` / `#8C5200` | upcoming soft / upcoming text | `warning/soft` / `warning/text` |
| `#FF9F0A` | warning CTAs in error states | `warning` |
| `#E5F2FF` / `#0051A8` | info soft / info text | `info/soft` / `info/text` |
| `#007AFF` | info CTA, sync progress bar | `info` |
| `#E8F8EE` / `#1A7A33` | success soft / success text | `success/soft` / `success/text` |
| `#34C759` | success check stroke, "Deneniyor..." text | `success` |
| `#F0ECFF` / `#5B21B6` / `#8B5CF6` | **deadline** soft / text / solid ("Cevap Beklediğin" count pill, deadline badge on Akış, "Takip Listesi" empty tint, "AI meşgul" CTA) | **No product token exists.** Decision required. Recommended: `brand/soft` + `brand/text-on-soft` (keeps deadline visually distinct from `upcoming`=warning and `critical`); alternative: fold `deadline` into `warning/*`. Do not ship a one-off violet. |
| `#EA4335` | Gmail tile in hand-off sheet/screen | vendor colour — keep literal as `vendor/gmail` |
| `rgba(15,15,26,0.45)` + blur 3px | sheet backdrop | `ink` at 45% + blur |
| Shadows `0 1px 3px rgba(15,15,26,.04–.05)`, `0 1px 4px rgba(15,15,26,.06)` | cards | shadow/xs, shadow/card |
| `0 4px 12px rgba(91,92,226,.25)`, `0 4px 16px rgba(91,92,226,.3)` | primary CTA glow | brand glow shadow (`brand/primary` 25–30%) |

**Dark mode.** Only **4.1 Akış** consumes the prototype theme (`t.bg/surface/text/textSec/textMuted`); 4.2–4.6 and every sheet are hard-coded light. The prototype dark theme is `bg #0F0F1A · surface #1E1E2E · surface2 #2A2A3C · border #3A3A50 · text #EAEAF8 · textSec #9090B8 · textMuted #6060A0 · primary #7B7CF4 · primarySoft #2A2A4A · critical #FF6B6B/#3A1A1A · success #4CD47A/#0A2A1A · warning #FFAA44/#2A1A00`. Ignore those values; map to the product dark tokens (`dark/bg`, `dark/surface`, `dark/surface-2`, `dark/text`, `dark/secondary`, `dark/tertiary`, `dark/primary`, `dark/primary-glow`, `dark/critical-text`, `dark/warning-text`, `dark/success-text`, `dark/on-primary`). Rules that apply to every screen in this section in dark:
- Soft tints (`*/soft`) become the semantic colour at ~16–20% alpha on `dark/surface`; text on them uses `dark/*-text`.
- Brand gradient buttons keep `brand/primary → brand/primary-pressed` with label `#FFFFFF`; flat brand chips/pills use `dark/primary` with `dark/on-primary` label.
- Card shadows are dropped; use a 1px `dark/surface-2` hairline instead.
- The Gmail hand-off full screen (4.4.4) is already dark (`ink` background) and is identical in both themes.

### 4.0.2 Prototype type → product type scale

Prototype font is Inter; use the product sans. Lora/editorial styles are not used anywhere in this section.

| Prototype | Product style |
|---|---|
| 32/800 −0.04em (stat "83") | `display` (34/40 600) |
| 26/700 −0.03em (tab title "Akış") | `h1` (28/34 600) |
| 22/800 −0.03em ("Gönderildi!"), 20/800 ("Gmail açılıyor…") | `h2` (22/28 600) |
| 17/700 or 17/600 −0.02em (header titles, subject, sheet titles, empty-state title), 18/700 (state-catalogue empty title) | `h3` (17/23 600) |
| 16/700 (sheet success titles) | `h3` |
| 15/700, 15/600 (sender, person names, CTAs) | `body` 15/22 at weight 600 ("body/strong") |
| 14/400 `ink` (summaries, option labels, inputs) | `body` 15/22 |
| 14 / 13 `ink/secondary` (helper text, summaries) | `secondary` 14/20 |
| 13/600–700 `ink` (sender on list rows, tone chips) | `secondary` at weight 600 |
| 12 `ink/tertiary` (meta lines, "Konu:", hand-off meta) | caption 12/16 `ink/tertiary` |
| 13/700 +0.04em caps, 12/700 +0.04em caps (section kickers) | `kicker` (12/16 600 +8% caps `ink/tertiary`) |
| 11/700 +0.04–0.05em (AI badge, urgency labels, error badges) | `badge` (11/14 700 +5%) |
| 11/600 (action pills, "gün önce" badge, "Son:" line) | `badge` |
| 10 (Akış timestamp, empty-state context kicker) | use `badge` size (11) — 10px is below the product floor |

### 4.0.3 Radii, spacing, frame

- Radii in use: 6 (source tag, badges), 8 (action pills, count pills), 10 (category-ish boxes, key-point rows, "Mail Özeti" pill, tone chips), 12 (category rows, inputs, secondary full-width buttons, icon tiles 40px), 14 (list cards, action tiles, CTAs, sheet CTAs), 16 (feed cards, follow-up cards, AI-insight card, draft textarea, primary CTA on composer), 20 (state cards, Gmail tile 72), 24 (sheet top corners), circles for avatars. Snap to the product radii set 10/12/14/16/20/28 (6→8 is fine for micro pills; 24 sheet → 20 or 28).
- Horizontal page padding is **20** everywhere (`px-5`). Vertical rhythm: header pt 8/pb 12 on the tab, `py-3` (12) on stack headers, section `pt-4` (16), list gaps 6/8/10.
- Prototype frame: 393×852, status bar 44, bottom nav **82** tall (pt 8, pb 24 = home-indicator safe area). Scrolling content on the tab screen ends with pb 16 above the nav. Sheets and overlays in the prototype carry `borderRadius: 48` only to match the device mock-up frame — **not** a product requirement.

### 4.0.4 Navigation map

| Route (prototype `ScreenName`) | Screen | Type | Bottom nav |
|---|---|---|---|
| `flow` | 4.1 Akış | **Tab** (2nd of Bugün / Akış / Plan / Asistan) | visible |
| `mail-intelligence` | 4.2 Mail Özeti | Stack push from Akış header | hidden |
| `email-detail` | 4.3 Mail Detayı | Stack push from Akış, Mail Özeti, Senden Beklenenler (and Bugün per brief) | hidden |
| `ai-draft-reply` | 4.4 Yanıt Hazırla | Stack push from Mail Detayı, Takip Etmen Gerekenler, Senden Beklenenler | hidden |
| `smart-followup` | 4.5 Takip Etmen Gerekenler | Stack push from Mail Özeti category row (and Evening Close per brief) | hidden |
| `waiting-reply` | 4.6 Senden Beklenenler | Stack push from Mail Özeti category row (and Morning Briefing per brief) | hidden |
| — | Hatırlatıcı sheet (4.7) | Bottom sheet over 4.3 / 4.5 / 4.6 | — |
| — | Görev Oluştur sheet, Orijinal Mail sheet | Bottom sheets over 4.3 | — |
| — | Son Onay sheet, Gönderildi overlay, Gmail hand-off screen | Sheet / overlay / full-screen replace over 4.4 | — |

Back behaviour in the prototype is a simple history pop (`goBack`), falling back to `today` when history is empty. `navigate('today')` from the Gönderildi overlay does **not** clear history in the prototype — in the product it must reset the stack to the Bugün tab.

### 4.0.5 Shared components (specified once, referenced below)

**PageHeader (stack screens).** Row, px 20, py 12, minHeight 52, background `neutral/bg` at 95% + backdrop blur 12, bottom border 1px `neutral/hairline` at 60%. Back button: 36×36 circle, background `neutral/surface-2` at 80%, chevron 18px (`arrow_back_ios_new`), stroke `ink` 2px, margin-right 8, offset −4 left. Title `h3`, `ink`, flex 1. Optional avatar 32 (not used on these screens).

**BottomSheet.** Backdrop `ink` 45% + blur 3px, tap = close. Panel: `neutral/surface`, top radius 24, maxHeight 85% of screen, shadow `0 −4px 40px rgba(15,15,26,.18)`, enters with `slideUp` 300ms `cubic-bezier(0.32, 0.72, 0, 1)` (translateY 20→0, opacity 0→1). Handle 36×4, radius 2, `neutral/hairline`, pt 12 pb 4. Title row px 20, pt 4, pb 12, bottom border 1px `neutral/hairline`, title `h3` `ink`. Body scrolls, pb 32. Body scroll is locked while open. No swipe-to-dismiss in the prototype — add it (gesture) in RN.

**Chip (Akış filters).** Height 32, px 14, radius 16, 13px, nowrap, no shrink. Selected: weight 600, text `brand/primary`, bg `brand/primary` 10%, border 1.5px `brand/primary` 30%. Unselected: weight 500, text `ink/secondary`, bg `neutral/surface-2` 80%, border 1px transparent. 150ms ease transition.

**SourceTag.** Inline pill, padding 3×8, radius 6, gap 4, max-width 100% with ellipsis. 5px dot + 11/500 label −0.01em. Colour is chosen by substring of the source string: contains "gmail" → bg `rgba(234,67,53,.08)`, text `#C23121`, dot `#EA4335`; "outlook" → `rgba(0,114,198,.08)` / `#0072C6` / `#0072C6`; "calendar" → `rgba(52,168,83,.08)` / `#1E7E34` / `#34A853`; "apple" → `rgba(0,122,255,.08)` / `#0066CC` / `#007AFF`; else `rgba(107,107,128,.08)` / `ink/secondary` / `ink/tertiary`. These are vendor colours; keep literal under `vendor/*`. Renders as a button but **no `onClick` is ever passed on these screens** → dead; the brief (§10) requires tapping a source to reveal the originating content.

**Avatar (hash-coloured, used on 4.5 and 4.6).** Circle, size 36 or 40, initials at `size × 0.37` px, weight 600, −0.02em, white text. Background chosen by `(charCode(initials[0]) + charCode(initials[1])) % 6` from `[#5B5CE2, #34C759, #FF9F0A, #FF3B30, #8B5CF6, #007AFF]`. **Flag:** 4.2/4.3/4.4 use a *different* avatar style (tinted initials: `critical/soft` + `critical/text` when critical, else `neutral/surface-2` + `ink/secondary`). Unify on one person-avatar component (`card/person` avatar) — recommend the tinted style, with the hash palette only when no priority is known.

**Priority badge / action pill colours** (Akış action buttons, follow-up "gün önce" badge, urgency labels):

| Priority | Background | Text |
|---|---|---|
| `critical` | `critical/soft` | `critical/text` |
| `upcoming` | `warning/soft` | `warning/text` |
| `deadline` | *(no token — see 4.0.1)* | *(no token)* |
| `info` | `info/soft` | `info/text` |
| `success` | `success/soft` | `success/text` |

**Primary CTA (full width).** Padding 14–15, radius 14 (16 on the composer), brand gradient, label 15/700 white (−0.02em on the composer), glow shadow. Pressed: `brand/primary-pressed`. Disabled (reminder sheet only): bg `neutral/hairline`, text `ink/disabled`, no shadow.
**Secondary CTA (full width).** Padding 12–13, radius 12–14, bg `neutral/surface-2`, label 14/600 `ink/secondary`, optional 14px leading icon.

### 4.0.6 Motion & haptics primitives

- `card-press`: `transform: scale(0.982)` on press, 150ms ease on transform and shadow. Apply to every tappable card.
- `animate-fade-in`: opacity 0→1, translateY 6→0, 300ms ease, `forwards`. Feed cards start at `opacity: 0` and stagger by **40ms × index** (Akış) or **60ms × index** (Takip).
- `animate-scale-in`: opacity 0→1, scale 0.96→1, 250ms ease (success overlays and sheet confirmations).
- `slideUp` (sheets): 300ms `cubic-bezier(.32,.72,0,1)`.
- Screen push: `screen-enter` = translateY 16→0 + fade, 280ms same curve (prototype class; use the platform stack transition in RN).
- Removal (Takip "Kapat"): opacity → 0 over 350ms, element removed at 400ms.
- Auto-dismiss timers: reminder confirmation 1400ms; task-created confirmation 1500ms.
- Skeleton shimmer: gradient `neutral/surface-2 → #F5F5FA → neutral/surface-2`, background-size 200%, 1.4s linear infinite; alternative pulse opacity 1→0.4→1 over 1.8s.
- Haptics: none specified in the prototype. Recommended: selection haptic on chip/tone/option select; light impact on card tap; medium impact on "Evet, Gönder" / "Görev Oluştur" / "Hatırlatıcı Oluştur"; success notification on "Gönderildi!", "Görev Oluşturuldu", "Hatırlatıcı Oluşturuldu"; warning on "Kapat" (follow-up dismissal).

### 4.0.7 Emoji → Material Symbols Rounded

The prototype uses emoji for every icon. Replace with Material Symbols Rounded:

| Emoji (prototype) | Meaning | MSR icon |
|---|---|---|
| ✉️ / ✉ | mail / Gmail | `mail` |
| 📅 | calendar, add to calendar, custom date | `calendar_month` / `event` |
| ⏰ | deadline, 30-minute reminder | `alarm` |
| ⏱️ | 1-hour reminder, sync delay | `timer` |
| 🌆 | this evening | `wb_twilight` |
| ☀️ | tomorrow morning | `wb_sunny` |
| ✨ | AI (summary, smart time, AI busy) | `auto_awesome` |
| 📦 | shipment | `package_2` |
| ⚡ | bill / utility | `bolt` |
| 🔐 / 🔑 | security alert / connection expired | `lock` / `key` |
| ⭐ | important | `star` |
| ⏳ | awaiting | `hourglass_top` |
| ℹ️ | informational | `info` |
| 📬 | low priority / inbox | `inbox` |
| ✍️ | draft reply | `edit` |
| ✅ | create task / success | `task_alt` / `check_circle` |
| 🔔 | remind | `notifications` |
| 🔄 / ⟳ | sync / refresh | `sync` / `refresh` |
| 📡 | offline | `wifi_off` |
| 🚫 | access denied | `block` |
| 🎉 | all clear | `celebration` |
| 🔗 | connect account | `link` |
| ↗ | open external | `open_in_new` |
| › chevron | row disclosure | `chevron_right` |
| ⚠️ | disclaimer | `warning` |

---

## 4.1 Akış · Light (route `flow`, brief §16)

### Purpose & placement
Second tab of the bottom nav (`Bugün / Akış / Plan / Asistan`). The brief is explicit: *"Bu ekran Gmail inbox değildir. Bütün dijital hayatın akıllı attention feed'idir."* — a single chronological-but-AI-prioritised feed that mixes mail, meetings, deadlines and life items (shipment, bill, security alert, subscription…). Bottom nav is visible.

### Layout, top to bottom
1. **Header row** — px 20, pt 8, pb 12, space-between.
   - Left: title **"Akış"** — `h1`, `ink`.
   - Right cluster, gap 8:
     - Pill button **"Mail Özeti"** — bg `brand/soft`, radius 10, padding 7×12, 12/600 `brand/primary` (→ `brand/text-on-soft`). Tap → push 4.2.
     - Avatar button 32×32 circle, brand gradient, user initial **"Y"** 13/700 white. Tap → `profile`.
2. **Filter chip row** — px 20, pb 12, gap 8, horizontal scroll (no wrap, hide scrollbar). Chips per 4.0.5. Labels in order: **"Tümü"** (default selected), **"Önemli"**, **"Mail"**, **"Takvim"**, **"Takip"**, **"Kişisel"**.
3. **Feed** — vertical scroll, px 20, pb 16, column gap 10. Each item is a **card/priority-style feed card** (the generic Akış card; the primary deck's `card/mail`, `card/calendar`, `card/life` may be substituted per type):
   - Container: `neutral/surface`, radius 16, padding 14, shadow/card, `card-press`, staggered fade-in (index × 40ms).
   - Row, gap 12, align start:
     - **Icon tile** 40×40, radius 12, tinted background per item (see rows), icon 18px, no shrink.
     - **Body** (flex 1, min-width 0):
       - Title row (space-between, gap 8, mb 4): **title** 14/600 `ink` −0.01em lh 1.3 (→ body/strong); **time label** 10px `ink/tertiary` nowrap (→ badge size).
       - **summary** 13px `ink/secondary` lh 1.4, mb 8 (→ `secondary`).
       - Footer row (space-between): **SourceTag** (left) and **action pill** (right): 11/600, radius 8, padding 5×10, colours from the priority badge table.

### Filtering & ordering
- `Tümü` → all; `Önemli` → `priority ∈ {critical, deadline}`; `Mail` → `type = email`; `Takvim` → `type = meeting`; `Takip` → `type = deadline`; `Kişisel` → `type = life`.
- After filtering, **stable sort by priority rank**: `critical 0, deadline 1, upcoming 2, info 3, success 4`. Within the same rank keep source order (server should provide time-desc within rank).

### Example rows (transcribe verbatim; these are the i18n/example fixtures)

| # | type | icon | tile tint | title | summary | source (SourceTag) | time | priority | action |
|---|---|---|---|---|---|---|---|---|---|
| 1 | email | ✉️ | `critical/soft` | "Ahmet Yılmaz — Revize teklif" | "Bugün 17:00'ye kadar revize teklif bekliyor." | "Gmail · 08:42" | "08:42" | critical | "Yanıtla" |
| 2 | meeting | 📅 | `brand/soft` | "Müşteri Toplantısı — 14:30" | "Mehmet Kaya ile Google Meet. 18 dakika kaldı." | "Google Calendar" | "14:30" | upcoming | "Hazırlan" |
| 3 | deadline | ⏰ | `warning/soft` | "Başvuru Son Tarihi" | "Başvuru bugün 17:00'de kapanıyor." | "Gmail · Kariyer · Dün" | "17:00" | deadline | "Takvime Ekle" |
| 4 | life | 📦 | `success/soft` | "Trendyol Siparişi Geliyor" | "Sipariş #TY884521 bugün 14:00–18:00 arasında teslim." | "Gmail · Trendyol" | "Bugün" | info | "Takip Et" |
| 5 | email | ✉️ | `warning/soft` | "Mehmet Kaya — Teklif değerlendirme" | "Fiyat revizyonu istiyor, bugün akşam cevap bekliyor." | "Gmail · 10:20" | "10:20" | critical | "Görüntüle" |
| 6 | life | ⚡ | `warning/soft` | "Elektrik Faturası" | "1.842 TL — Son ödeme 10 Eylül." | "Gmail · Fatura" | "10 Eylül" | upcoming | "Ödeme Yap" |
| 7 | email | ✉️ | `info/soft` | "Ayşe Demir — Sunum paylaşımı" | "Hazırladığı sunum dosyasını paylaştı, görüş istiyor." | "Gmail · 09:15" | "09:15" | info | "Görüntüle" |
| 8 | life | 🔐 | `critical/soft` | "Güvenlik Uyarısı" | "Google hesabında yeni giriş algılandı. Chrome · İstanbul." | "Gmail · Google" | "Az önce" | critical | "İncele" |

Rendered order with `Tümü`: 1, 5, 8 (critical) → 3 (deadline) → 2, 6 (upcoming) → 4, 7 (info).

### Interactive elements
| Element | Prototype behaviour | Product requirement |
|---|---|---|
| "Mail Özeti" pill | push `mail-intelligence` | same |
| Avatar "Y" | push `profile` | same |
| Filter chips | local filter state | same; persist last filter per session (localStorage-equivalent), analytics event |
| Card tap, `type = email` | push `email-detail` (always opens mock email #1) | push Mail Detayı **with the item's email id** |
| Card tap, `type = meeting` | push `meeting-prep` | same, with meeting id |
| Card tap, `type = deadline` | **nothing** | open the originating mail (Mail Detayı) or a deadline detail sheet |
| Card tap, `type = life` | **nothing** | open the life-item detail sheet/page (Kargo → tracking, Fatura → payment, Güvenlik → review) per the QA brief §3 |
| Action pill (all 8) | `stopPropagation()` only — **dead** | wire per label: "Yanıtla" → 4.4 with thread; "Hazırlan" → `meeting-prep`; "Takvime Ekle" → create-event approval; "Takip Et" → shipment tracking; "Görüntüle" → Mail Detayı; "Ödeme Yap" → bill payment hand-off; "İncele" → security review (external link to Google account activity) |
| SourceTag | not tappable | tap → show origin (open the source mail / calendar event) |

### Dead in prototype
- All eight action pills.
- Card tap for `deadline` and `life` items.
- SourceTag.
- Email cards do not pass an id (always mock #1).

### States
- **Loading:** no skeleton on this screen in the prototype. Use the "MAIL KARTI SKELETON" pattern (4.8.1): three `EmailCardSkeleton` rows inside one radius-16 surface, separated by 1px hairlines. Add a **SyncStatusBar** (4.8.1) above the feed while a Gmail sync is in progress.
- **Empty (no items at all):** not designed here; reuse the state-catalogue "Mail Akışı" variant — ✅ on `success/soft`, **"Her şey kontrol altında."** / **"Dikkat gerektiren önemli bir mail yok."**, no CTA.
- **Empty (filter yields nothing):** not designed. Recommend a compact inline empty with the same copy pattern, e.g. for `Takvim`: reuse "Bugün takvimin oldukça sakin." / "Planlanmış bir toplantın ya da etkinliğin yok." + "Etkinlik Ekle"; for `Takip`: "Bekleyen takip yok." / "Tüm açık konular kapatıldı.".
- **No account connected:** "Bağlantı Yok" variant — 🔗 on `warning/soft`, **"Mailini bağla."** / **"Gmail veya Outlook bağlayarak önemli konuları burada görebilirsin."** CTA **"Hesap Bağla"** → integrations.
- **Error / permission / offline:** use the error cards in 4.8.3 inline at the top of the feed: "Bağlantı süresi doldu." (token expired), "Erişim izni reddedildi." (OAuth denied), "İnternet bağlantısı yok." (offline — feed shows cached items below the card), "Senkronizasyon gecikiyor.".
- **Dark:** background `dark/bg`, cards `dark/surface`, title `dark/text`, summary `dark/secondary`, time `dark/tertiary`. Icon tiles and action pills are hard-coded light in the prototype → apply the 4.0.1 dark rule (semantic colour at ~18% alpha, `dark/*-text` labels). "Mail Özeti" pill → `dark/primary` at 18% with `dark/primary-glow` text. Avatar gradient unchanged.

### Data fields per feed card
`id`, `type` (`email | meeting | deadline | life`), `lifeSubtype` (`cargo | flight | reservation | payment | subscription | security`, for `life`), `iconName`, `tileTint` (semantic key), `title`, `summary`, `sourceLabel` (display string "Gmail · 08:42"), `sourceProvider` (`gmail | outlook | google-calendar | apple-calendar | notification`), `sourceRef` (provider message/event id for "show origin"), `timeLabel`, `timestamp` (ISO, for ordering/relative labels), `priority` (`critical | deadline | upcoming | info | success`), `suggestedAction` `{ label, kind, targetRef }`, `navTarget` (`email-detail | meeting-prep | life-detail | none`) + target id, `isRead`/`isDismissed`.

---

## 4.2 Mail Özeti · Light (route `mail-intelligence`, brief §17)

### Purpose & placement
Stack screen pushed from the Akış header pill. Brief: *"Bu bir inbox replacement gibi görünmesin. AI tarafından anlamlandırılmış mail intelligence ekranı olsun."* Shows today's mail volume, the six smart categories, and a short list of highlighted threads. Bottom nav hidden.

### Layout, top to bottom
1. **PageHeader** with back + title **"Mail Özeti"**.
2. **Stats hero** (non-scrolling) — px 20, py 16, bg `neutral/surface`, bottom border 1px `neutral/hairline`.
   - Baseline row, gap 8, mb 4: **"83"** `display` `ink` (prototype 32/800 −0.04em) + **"mail bugün"** 15px `ink/secondary`.
   - Line: **"6 tanesi dikkat gerektiriyor."** 14/600 `brand/primary`.
3. **Scroll area** (pb 16):
   - **Categories block** — px 20, pt 16, pb 8. Kicker **"KATEGORİLER"** (`kicker`, mb 10). Then a **list group** of six category rows, gap 6. Row: flex, gap 12, padding 11×14, radius 12, bg `neutral/surface`, border 1px `neutral/hairline`(light), 150ms transition. Selected row: bg = category soft colour, border 1.5px = category text colour at 20% alpha. Contents: icon 18px in a 28px slot; label 14/500 `ink` −0.01em (flex 1); count pill 12/700 category text colour on category soft colour, radius 8, padding 2×8; chevron 14px at 40% opacity.
   - **Email list** — px 20, pt 8. Kicker = **"ÖNE ÇIKANLAR"** when no category is selected, otherwise the selected category label upper-cased. Cards gap 8: `neutral/surface`, radius 14, padding 12×14, shadow/xs, `card-press`. Row gap 12: avatar 36 circle with initials 13/700 (critical → `critical/soft`+`critical/text`, else `neutral/surface-2`+`ink/secondary`); body: sender 13/600 `ink` + time 11 `ink/tertiary` (baseline, space-between, mb 4); subject 13px single-line ellipsis — **unread: 600 `ink`; read: 400 `ink/secondary`**; AI summary 12px `ink/tertiary` single-line ellipsis.

### Category rows (verbatim)

| key | icon | label | count | tint (soft / text) | tap |
|---|---|---|---|---|---|
| `important` | ⭐ | "Önemli" | 3 | `critical/soft` / `critical/text` | toggle filter |
| `awaiting-reply` | ✉️ | "Cevap Bekleyen" | 2 | `warning/soft` / `warning/text` | push **4.5 Takip Etmen Gerekenler** |
| `my-awaiting` | ⏳ | "Cevap Beklediğin" | 3 | deadline tint (no token) | push **4.6 Senden Beklenenler** |
| `deadline` | ⏰ | "Son Tarih İçeren" | 2 | `critical/soft` / `critical/text` | toggle filter |
| `info` | ℹ️ | "Bilgilendirme" | 18 | `info/soft` / `info/text` | toggle filter |
| `low` | 📬 | "Düşük Öncelik" | 56 | `neutral/surface-2` / `ink/tertiary` | toggle filter |

Toggle = tapping a selected row deselects it and returns to "ÖNE ÇIKANLAR".

**Flag — label/route semantics are inverted.** "Cevap Bekleyen" (threads *awaiting a reply from you*; the two `awaiting-reply` mock mails are Ahmet and Fatma waiting on Yunus) navigates to *Takip Etmen Gerekenler* (threads where *you* wait on others), and "Cevap Beklediğin" navigates to *Senden Beklenenler* (others waiting on you). The brief's own names are unambiguous: **"Senden Cevap Bekleyen" → Senden Beklenenler (4.6)** and **"Senin Cevap Beklediğin" → Takip Etmen Gerekenler (4.5)**. Use the brief's labels and wire them that way; the counts then come from the waiting-reply and follow-up services respectively.

### Default and filtered lists
- **Default ("ÖNE ÇIKANLAR")**: `priority = critical OR category = awaiting-reply` → mock emails #1 (Ahmet), #2 (Fatma), #5 (Mehmet).
- `deadline` → #5. `info` → #3, #4, #6. `important` → **no rows** (no mock email carries `category: 'important'`). `low` → **no rows**. The prototype shows a blank area in those cases — **Flag:** a per-category empty state is required (see States).

### Example email rows (verbatim, `mockEmails`)

| id | sender | initials | subject | preview | time | priority | category | aiSummary | keyPoints | isRead |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Ahmet Yılmaz | AY | "Revize fiyat teklifi - acil" | "Merhaba Yunus, revize edilmiş teklifi bugün 17:00'ye kadar..." | "08:42" | critical | awaiting-reply | "Mehmet, revize fiyat teklifinin bugün 17:00'ye kadar gönderilmesini istiyor." | "Revize fiyat teklifi" · "Bugün 17:00 son tarih" · "PDF formatı isteniyor" | false |
| 2 | Fatma Şahin | FŞ | "Q3 raporu hakkında" | "Yunus, Q3 raporunu inceleme fırsatı buldun mu?" | "Dün" | upcoming | awaiting-reply | "Fatma, Q3 raporunu inceleyip görüşünü paylaşmanı istiyor." | "Q3 raporu incelemesi" · "Geri bildirim bekleniyor" · "3 gün önce gönderildi" | true |
| 3 | Can Öztürk | CÖ | "Proje toplantısı - Pazartesi 10:00" | "Merhaba ekip, pazartesi saat 10:00'da toplantı..." | "2 gün önce" | info | info | "Can, pazartesi saat 10:00'da proje toplantısı düzenliyor." | "Pazartesi 10:00" · "Zoom üzerinden" · "Tüm ekip davetli" | true |
| 4 | Netflix | NF | "Aboneliğiniz 9 Eylül'de yenileniyor" | "Netflix aboneliğiniz otomatik olarak yenilenecek..." | "3 gün önce" | info | info | "Netflix aboneliğin 9 Eylül'de otomatik olarak yenilenecek." | "9 Eylül yenileme tarihi" · "Otomatik ödeme" · "149.99 TL" | true |
| 5 | Mehmet Kaya | MK | "Teklif üzerine son değerlendirme" | "Yunus, teklifin genelini beğendik ancak..." | "10:20" | critical | deadline | "Mehmet teklifte bazı revizyonlar istiyor, bugün akşama kadar cevap bekliyor." | "Fiyat revizesi gerekli" · "Bugün akşam son tarih" · "Telefon görüşmesi önerdi" | false |
| 6 | Ayşe Demir | AD | "Sunum dosyası paylaşımı" | "Merhaba, hazırladığım sunum dosyasını ekteyim..." | "09:15" | info | info | "Ayşe sunum dosyasını paylaştı, inceleme istiyor." | "Sunum dosyası eklendi" · "Görüş isteniyor" · "Cuma toplantısı için" | false |

**Flag (data bug):** mock email #1 is from *Ahmet Yılmaz* but its `aiSummary` says *"Mehmet, revize fiyat teklifinin…"*. Use the sender's name in the summary ("Ahmet, revize fiyat teklifinin bugün 17:00'ye kadar gönderilmesini istiyor.") in fixtures. `preview` is stored but never rendered on these screens.

### Interactive elements
| Element | Prototype | Product |
|---|---|---|
| Back | pop | same |
| Category rows (important / deadline / info / low) | toggle local filter | same; consider a full category list screen when count > ~8 |
| "Cevap Bekleyen" row | push 4.5 | push **4.6** (see flag) |
| "Cevap Beklediğin" row | push 4.6 | push **4.5** (see flag) |
| Email card | push `email-detail` (mock #1) | push Mail Detayı with `email.id` |
| Stats hero | static | optional: tap "83" → full category list |

### Dead in prototype
- Email cards do not pass an id.
- Selecting "Önemli" or "Düşük Öncelik" renders nothing (no empty state).
- No pull-to-refresh, no "show all" for the highlighted list (max 3 shown in mock).

### States
- **Loading:** stats hero shows two skeleton blocks (72×32 and 180×14); category rows render with count pills as 28×18 skeletons; list uses `EmailCardSkeleton` ×3.
- **Empty (category with no rows):** inline card — reuse the "Mail Akışı" copy for `important` ("Her şey kontrol altında." / "Dikkat gerektiren önemli bir mail yok."); for `low`/`info` a neutral "Bu kategoride mail yok." is needed (new string — not in prototype).
- **Zero mail today:** hero "0 mail bugün" + "Dikkat gerektiren bir şey yok." (new string — not in prototype).
- **Error / offline / permission:** same error cards as 4.1.
- **Dark:** hard-coded light in prototype. Hero bg `dark/surface`, "83" `dark/text`, "mail bugün" `dark/secondary`, brand line `dark/primary-glow`; rows `dark/surface` with `dark/surface-2` border; selected row = category colour at 18%.
- **Turkish upper-casing:** the prototype calls JS `toUpperCase()` on labels → "Cevap Beklediğin" becomes "CEVAP BEKLEDIĞIN" and "Bilgilendirme" becomes "BILGILENDIRME" (dotless I). Always use `toLocaleUpperCase('tr-TR')` (→ "CEVAP BEKLEDİĞİN", "BİLGİLENDİRME"), or store upper-case variants as separate i18n strings.

### Data fields
- **MailStats:** `date`, `totalToday` (83), `needsAttention` (6), `lastSyncAt`.
- **MailCategory:** `key` (`important | awaiting-reply | my-awaiting | deadline | info | low`), `label`, `count`, `tint`, `navTarget` (`filter | smart-followup | waiting-reply`).
- **EmailItem** (also used by 4.3): `id`, `threadId`, `provider`, `sender` `{ name, email, initials, personId, isVip }`, `subject`, `preview`, `receivedAt`, `timeLabel`, `priority`, `category`, `aiSummary`, `keyPoints[]`, `isRead`, `hasAttachments`, `deadlineAt` (parsed from key points), `whyImportant`.

---

## 4.3 Mail Detayı · Light (route `email-detail`, brief §18)

### Purpose & placement
Stack screen. The AI-mediated view of one important mail: who, what, the AI summary, extracted key points, and the four suggested actions. Reached from Akış (email cards), Mail Özeti (rows), Senden Beklenenler ("Maili Aç") and — per the brief — the Bugün priority card ("Yanıtı Gör"). Owns three bottom sheets: **Orijinal Mail**, **Hatırlatıcı** (4.7), **Görev Oluştur**. Bottom nav hidden.

### Layout, top to bottom
1. **PageHeader** back + **"Mail Detayı"**.
2. **Sender block** — px 20, pt 16, pb 16, bg `neutral/surface`, bottom border 1px `neutral/hairline`.
   - Row gap 12, mb 12: avatar 44 circle (`critical/soft` bg, initials 15/700 `critical/text` — **hard-coded critical regardless of priority; derive from `email.priority`**); name 15/700 `ink` ("Ahmet Yılmaz"); meta 12 `ink/tertiary` **"{time} · Gmail"** ("08:42 · Gmail").
   - Subject `h3` 17/700 `ink` −0.02em lh 1.3 ("Revize fiyat teklifi - acil").
3. **Scroll body** — px 20, pt 16:
   - **card/ai-insight ("AI ÖZETİ")** — bg gradient 135° `brand/soft → info/soft`, radius 16, padding 16, border 1px `brand/primary` 15%, mb 16. Header row gap 8, mb 12: ✨ 16px + **"AI ÖZETİ"** 12/700 `brand/primary` +0.04em (→ `kicker` in brand colour). Body 14px `ink` lh 1.55 −0.01em = `email.aiSummary`.
   - **"ÖNEMLİ NOKTALAR"** kicker (mb 10) + list group gap 6: each key point is a row `neutral/surface`, radius 10, padding 10×14, shadow/xs, with a 6px `brand/primary` dot and 14px `ink` text. Example: "Revize fiyat teklifi", "Bugün 17:00 son tarih", "PDF formatı isteniyor".
   - **SourceTag** **"Gmail · {sender} · {time}"** ("Gmail · Ahmet Yılmaz · 08:42"), mb 16.
   - Hairline 1px, mb 16.
   - **"İŞLEMLER"** kicker (mb 10) + **2×2 action grid**, gap 8, mb 16. Tile: column, centred, gap 6, padding 14×12, radius 14, icon 22px, label 12/600 −0.01em.
     - Primary tile (**"Yanıt Hazırla"** ✍️): brand gradient, no border, glow shadow `0 4px 12px brand 25%`, label white.
     - Other tiles (**"Görev Oluştur"** ✅, **"Takvime Ekle"** 📅, **"Hatırlat"** 🔔): `neutral/surface`, 1px `neutral/hairline`, shadow/xs, label `ink`.
   - **"Orijinal Maili Aç"** full-width secondary button — padding 12, radius 12, bg `neutral/surface-2`, 14/600 `ink/secondary`, leading 14px envelope icon, gap 6.

### Sheets owned by this screen

**A. "Orijinal Mail" hand-off sheet** (BottomSheet, title **"Orijinal Mail"**). Body px 20, pb 24, centred:
- Gmail tile 56×56, radius 14, bg `vendor/gmail`, ✉ 28px white, mb 14.
- **"Gmail'de Açılıyor"** 16/700 `ink`, mb 8.
- **"Orijinal mail Gmail uygulamasında açılacak. Devam etmek istiyor musun?"** 13 `ink/secondary` lh 1.55, mb 24.
- Primary **"Gmail'de Aç ↗"** (full width, padding 14, radius 14, brand gradient, 15/700 white), mb 10. Prototype: closes the sheet only — **dead**. Product: open the message via Gmail deep link (`googlegmail://` / Android intent with message id), fall back to `https://mail.google.com/mail/u/0/#all/{messageId}`; if Gmail is not installed, show the web fallback.
- Text button **"İptal"** 14 `ink/tertiary` → close.

**B. "Görev Oluştur" sheet** (BottomSheet, title **"Görev Oluştur"**). Body px 20, pb 20:
- Field 1: kicker **"GÖREV BAŞLIĞI"** 12/700 `ink/tertiary` mb 6; text input pre-filled with `email.subject`; input style padding 12, radius 12, border 1.5px `neutral/hairline`, 14px `ink`, bg `neutral/surface`. mb 12.
- Field 2: kicker **"SON TARİH"**; native date input, same style. Empty by default. mb 16.
- Primary CTA **"Görev Oluştur"** (padding 14, radius 14, brand gradient, 15/700 white).
- **Success state** (replaces the form, `animate-scale-in`, py 32 centred): 64 circle `success/soft` with ✅ 30px, mb 12; **"Görev Oluşturuldu"** 16/700 `ink` mb 4; task title 13 `ink/secondary`. Auto-closes after **1500ms** and resets.
- **Flags:** (1) the brief (redesign §8) wants the AI-extracted **title, due date, related person and source** shown, the CTA labelled **"Görevi Oluştur"**, and the write routed through the **Approval Center** when required — the prototype shows only title + empty date and creates locally; (2) pre-fill the due date from the parsed deadline ("Bugün 17:00 son tarih" → today 17:00); (3) nothing is persisted.

**C. Hatırlatıcı sheet** — see 4.7. Context string passed: **"{sender} — {subject}"** ("Ahmet Yılmaz — Revize fiyat teklifi - acil").

### Interactive elements
| Element | Prototype | Product |
|---|---|---|
| Back | pop | same |
| Sender avatar / name | static | tap → Person Intelligence (brief redesign §3) |
| "Yanıt Hazırla" | push `ai-draft-reply` | same, with `threadId` + `to` |
| "Görev Oluştur" | opens sheet B | same, with AI-extracted fields; write via Approval Center when the user's approval setting requires it |
| "Takvime Ekle" | `navigate('plan')` — lands on the Plan tab with nothing created — **dead-ish** | open a create-event approval sheet pre-filled from the deadline (e.g. "Revize teklif — Bugün 17:00"); on success show the Plan tab or a toast |
| "Hatırlat" | opens 4.7 | same |
| "Orijinal Maili Aç" | opens sheet A | same |
| "Gmail'de Aç ↗" (sheet A) | closes sheet — **dead** | deep link (see above) |
| "İptal" (sheet A) | close | same |
| SourceTag | not tappable | tap → same hand-off as "Orijinal Maili Aç" |
| Key-point rows | static | optional: tap → highlight the sentence in the original (later) |

### Dead in prototype
- "Takvime Ekle" (no event created), "Gmail'de Aç ↗" (no deep link), SourceTag, sender tap.
- The screen always renders `mockEmails[0]`; it must take an `emailId` route param.
- Task creation is local-only; reminder creation is local-only.

### States
- **Loading:** sender block with 44px circle + two text skeletons; AI-insight card with a 3-line shimmer inside the gradient container; key points 3 × 40px skeleton rows; action grid renders immediately (labels are static). While the AI summary is being generated show the **AI processing** micro-state (4.8.1) inside the insight card: "AI Analiz Yapıyor" + rotating step text.
- **AI summary unavailable:** show the error card "AI şu an meşgul." / "Analizler geçici olarak yavaşladı. Birkaç dakika içinde her şey normale dönecek." with **"Yenile"** in place of the insight card; key points hidden; the original preview text (`email.preview`) shown instead.
- **No key points:** hide the "ÖNEMLİ NOKTALAR" block entirely.
- **Offline:** cached summary renders; action tiles remain enabled but writes queue; "Orijinal Maili Aç" shows the offline error card on tap.
- **Permission (send scope missing):** no change here — handled in 4.4.
- **Dark:** sender block `dark/surface`; AI-insight gradient → `dark/primary` 18% → `info` 12% with border `dark/primary-glow` 25%, kicker `dark/primary-glow`, body `dark/text`; key-point rows `dark/surface` with `dark/surface-2` hairline; non-primary action tiles `dark/surface` + `dark/surface-2` border, label `dark/text`; secondary button `dark/surface-2` + `dark/secondary` label; sheets `dark/surface`.

### Data fields
`EmailItem` (4.2) plus: `originalUrl`/`providerMessageId` (hand-off), `personId` (sender tap), `suggestedTask { title, dueAt, relatedPersonId, sourceLabel }`, `suggestedEvent { title, startAt, endAt }`, `attachments[]`, `whyImportant` (for a future "Neden önemli?" action per brief §11).

---

## 4.4 Yanıt Hazırla · Light (route `ai-draft-reply`, brief §19)

### Purpose & placement
Stack screen: the AI-drafted reply composer. Reached from Mail Detayı ("Yanıt Hazırla"), Takip Etmen Gerekenler ("Takip Mesajı Hazırla") and Senden Beklenenler ("Yanıtla"). Brief rule, non-negotiable: **"AI hiçbir maili kullanıcı onayı olmadan göndermemelidir."** — sending always passes through the **Son Onay** sheet, and **"Göndermeyi Onayla"** is shown only when the send scope has been granted; otherwise the only CTA is **"Gmail'de Aç"**. Owns the **Son Onay** sheet, the **Gönderildi** overlay and the **Gmail açılıyor…** full-screen hand-off. Bottom nav hidden.

### Layout, top to bottom
1. **PageHeader** back + **"Yanıt Hazırla"**.
2. **Scroll body** — px 20, pt 16, pb 16:
   - **Tone selector** (mb 16): kicker **"TON"** 12/700 `ink/tertiary` +0.04em mb 8; chip row gap 8. Chip: padding 6×14, radius 10, 13/600, 150ms transition. Selected: bg `brand/primary`, text white. Unselected: bg `neutral/surface-2`, text `ink/secondary`. Options in order: **"Kısa"**, **"Profesyonel"** (default), **"Samimi"**, **"Detaylı"**.
   - **"Kime" row** — `neutral/surface`, radius 12, padding 12×14, shadow/xs, mb 12. Label **"Kime"** 12/600 `ink/tertiary` fixed width 32; then avatar 28 circle (`critical/soft`, "AY" 11/700 `critical/text`) + name 14 `ink` **"Ahmet Yılmaz"**.
   - **AI badge row** (gap 6, mb 10): pill **"AI TARAFINDAN HAZIRLANDI"** `badge` 11/700 `brand/primary` on `brand/soft`, radius 6, padding 2×8, +0.04em; then **"Düzenleyebilirsin"** 11 `ink/tertiary`.
   - **Editable draft** — multiline text area, bg `neutral/surface`, border 1.5px `neutral/hairline`, radius 16, padding 14×16, 14px `ink` lh 1.6 −0.01em, min-height 200, no resize handle, shadow `0 1px 4px rgba(15,15,26,.04)`. Default content (verbatim, five paragraphs separated by blank lines):

     ```
     Merhaba Ahmet,

     Revize fiyat teklifini ekte bulabilirsiniz. İstediğiniz değişiklikleri yansıtmaya çalıştım.

     Herhangi bir sorunuz olursa lütfen çekinmeden belirtin.

     İyi günler,
     Yunus
     ```
   - **Disclaimer** centred, 11 `ink/tertiary`, margin 8 0 16: **"⚠️ AI onayın olmadan mail göndermez"**.
   - **CTA stack** (column, gap 8):
     - Primary **"Göndermeyi Onayla"** — padding 15, radius 16, brand gradient, 15/700 white −0.02em, glow `0 4px 16px brand 30%`. → opens Son Onay.
     - Secondary **"Gmail'de Aç"** — padding 13, radius 14, `neutral/surface-2`, 14/600 `ink/secondary`, leading envelope icon 14. → Gmail hand-off screen.

### Sub-states owned by this screen

**4.4.1 "Son Onay" sheet** (BottomSheet, title **"Son Onay"**). Body px 20, py 16:
- **"Ahmet Yılmaz'a şu mail gönderilecek. Bu işlem geri alınamaz."** 14 `ink/secondary` lh 1.5, mb 16. (Template: "{recipientName}'a şu mail gönderilecek. Bu işlem geri alınamaz." — the dative suffix must follow Turkish vowel harmony: 'a / 'e; handle with an i18n helper, not string concat.)
- Preview box: bg `neutral/bg`, radius 12, padding 12×14, border 1px `neutral/hairline`, mb 20; text 13 `ink` lh 1.5 = first **120 characters** of the draft + "…".
- Primary **"Evet, Gönder"** — padding 14, radius 14, flat `brand/primary`, 15/700 white. → sends; closes sheet; shows Gönderildi overlay.
- Secondary **"İptal"** — padding 12, radius 14, `neutral/surface-2`, 14/600 `ink/secondary` → close.

**4.4.2 "Gönderildi!" overlay** — absolute full-screen over the composer, bg white 96% (`neutral/surface` 96%), z-index above header, content centred, `animate-scale-in`:
- 72 circle `success/soft` with a 32px check (stroke `success`, width 3, round caps; draw with `checkDraw` stroke-dash animation if desired), mb 16.
- **"Gönderildi!"** `h2` 22/800 `ink` −0.03em, mb 6.
- **"Ahmet Yılmaz'a iletildi."** 14 `ink/secondary`, mb 24 (template "{recipientName}'a iletildi.").
- Button **"Bugüne Dön"** — padding 12×28, radius 14, flat `brand/primary`, 15/600 white → **reset stack to the Bugün tab**.
- No back/close other than the button; Android hardware back should behave like "Bugüne Dön".

**4.4.3 Send failure** — not designed in the prototype. Required: on API failure keep the composer, show a toast/inline error "Gönderilemedi. Tekrar dene." (new string) with the "AI şu an meşgul." or "İnternet bağlantısı yok." card semantics as appropriate; never silently drop the draft.

**4.4.4 "Gmail açılıyor…" hand-off screen** — replaces the whole screen (no header), bg `ink` (#0F0F1A) in both themes, content centred with px 40:
- Gmail tile 72×72, radius 20, `vendor/gmail`, ✉ 36px, mb 20.
- **"Gmail açılıyor…"** 20/800 white −0.03em, mb 8.
- **"Taslak Gmail uygulamasına aktarıldı. Göndermek için Gmail'i kullan."** 14 white 50% lh 1.5, mb 32.
- Button **"Geri Dön"** — full width, padding 14, radius 14, bg white 10%, 14/600 white → back to the composer (prototype toggles state; product: this screen should only appear for ~600ms before the OS switches apps, and remain as the return landing).
- **Dead in prototype:** no actual hand-off. Product: build a Gmail compose deep link (`googlegmail:///co?to=…&subject=…&body=…`, Android `Intent` with `EXTRA_EMAIL/SUBJECT/TEXT` targeting `com.google.android.gm`), fall back to `mailto:`; include `In-Reply-To` when replying to a thread if the provider supports it, otherwise open the thread and copy the draft to clipboard with a toast "Taslak panoya kopyalandı" (new string).

### Interactive elements
| Element | Prototype | Product |
|---|---|---|
| Back | pop | same; if the draft was edited, confirm discard (new sheet: "Taslağı sil?" — not in prototype) |
| Tone chips | change selection only — **draft does not regenerate** (dead) | regenerate the draft with `tone` via the AI service; show a shimmer over the textarea and disable CTAs while regenerating; keep the user's manual edits by asking before overwriting (or regenerate only when untouched) |
| "Kime" row | static, hard-coded "Ahmet Yılmaz" | derive from thread (`to` = original sender; support cc later); tap → Person Intelligence |
| Textarea | free edit | same; autosave draft locally |
| "Göndermeyi Onayla" | opens Son Onay | same; **hidden/disabled when send scope missing** |
| "Gmail'de Aç" | hand-off screen (fake) | real hand-off |
| "Evet, Gönder" | marks sent, shows overlay | send via provider API; on success overlay; on failure 4.4.3 |
| "İptal" (Son Onay) | close | same |
| "Bugüne Dön" | `navigate('today')` (history not cleared) | reset to Bugün tab |
| "Geri Dön" (hand-off) | back to composer | same |

### Dead in prototype
- Tone chips (no regeneration), "Gmail'de Aç" (no deep link), hard-coded recipient and draft (no thread param), no discard confirmation, no failure state.

### States
- **Generating draft (first open):** tone row and "Kime" row render; textarea shows 5 shimmer lines; AI badge reads **"AI TARAFINDAN HAZIRLANDI"** only once generation completes (use "Hazırlanıyor…" — new string — in the meantime); CTAs disabled (`neutral/hairline` fill, `ink/disabled` text).
- **AI unavailable:** textarea empty and editable with placeholder "Yanıtını yaz…" (new string); error card "AI şu an meşgul." above CTAs with "Yenile".
- **Permission — send scope not granted:** hide **"Göndermeyi Onayla"**, promote **"Gmail'de Aç"** to primary style, and show a helper line under the disclaimer: "Göndermek için Gmail izni gerekiyor." (new string) with a link to Integrations. This is the brief's *"veya gerekli yetkiler varsa"* branch.
- **Offline:** composer editable; "Göndermeyi Onayla" disabled with the offline error card; "Gmail'de Aç" still works (hand-off is local).
- **Dark:** tone chips selected `dark/primary` + `dark/on-primary`, unselected `dark/surface-2` + `dark/secondary`; "Kime" row and textarea `dark/surface` with `dark/surface-2` border, text `dark/text`; AI badge `dark/primary` 18% + `dark/primary-glow`; disclaimer `dark/tertiary`; secondary CTA `dark/surface-2`; Son Onay preview box `dark/surface-2`; Gönderildi overlay bg `dark/bg` 96%, title `dark/text`, subtitle `dark/secondary`, check `dark/success-text`.

### Data fields
**ReplyDraft:** `id`, `threadId`, `inReplyToMessageId`, `to[] { name, email, initials, personId }`, `cc[]`, `subject` (usually "Re: …", not shown in prototype), `body`, `tone` (`kisa | profesyonel | samimi | detayli`), `generatedAt`, `isUserEdited`, `language`. **SendCapability:** `canSendViaApi` (scope), `providerAppInstalled`. **SendResult:** `status` (`sent | failed | queued`), `sentAt`, `errorCode`.

---

## 4.5 Takip Etmen Gerekenler · Light (route `smart-followup`, brief §20)

### Purpose & placement
Stack screen listing threads where **the user is waiting on someone else** and should follow up. Reached from Mail Özeti (category row — see the 4.2 inversion flag) and, per the brief, from Evening Close's "Takip Etmen Gerekenler" section. Bottom nav hidden. Owns a Hatırlatıcı sheet (4.7).

### Layout, top to bottom
1. **PageHeader** back + **"Takip Etmen Gerekenler"**.
2. **Scroll list** — px 20, pt 16, pb 16, column gap 10. Cards fade in staggered (index × 60ms).
   - **Follow-up card** (a `card/person`-style card): `neutral/surface`, radius 16, padding 16, shadow/card.
     - Header row gap 12, mb 12: **Avatar 40** (hash-coloured); name 15/700 `ink` −0.01em; **"Konu: {topic}"** 12 `ink/tertiary`; right badge **"{daysWaiting} gün önce"** 11/600, radius 8, padding 3×8 — **> 5 days → `critical/soft`+`critical/text`, otherwise `warning/soft`+`warning/text`**.
     - Status box: bg `neutral/bg`, radius 10, padding 10×12, mb 12; text 13 `ink/secondary` = `status`.
     - Button row gap 8, each 11/600, padding 7×0, radius 8:
       - **"Takip Mesajı Hazırla"** flex 2, `brand/soft` + `brand/primary` → push 4.4.
       - **"Hatırlat"** flex 1, `neutral/surface-2` + `ink/secondary` → Hatırlatıcı sheet with context **"{person} — {topic}"**.
       - **"Kapat"** flex 1, `neutral/surface-2` + `ink/secondary` → card fades out (350ms) and is removed (400ms).
3. **Empty state** (when every card is closed) — centred, pt 60: ✅ 48px mb 16; **"Hepsi tamam!"** 17/700 `ink` mb 6; **"Takip edilecek konu yok."** 14 `ink/tertiary`.

### Example rows (verbatim, `mockFollowUps`)

| id | person | initials | topic | lastMessage | status | daysWaiting | badge tint |
|---|---|---|---|---|---|---|---|
| 1 | Mehmet Kaya | MK | "Fiyat Teklifi" | "3 gün önce" | "Henüz yanıt gelmedi." | 3 | warning |
| 2 | Fatma Şahin | FŞ | "Q3 Raporu Onayı" | "5 gün önce" | "Onay bekleniyor." | 5 | warning (5 is not > 5) |
| 3 | Türk Telekom | TT | "Fatura İtirazı" | "8 gün önce" | "Destek ekibi inceliyor." | 8 | critical |

`lastMessage` is in the data but not rendered (the badge is computed from `daysWaiting`). The brief's example labels the actions **"Takip Mesajı Hazırla" / "1 Gün Sonra Hatırlat" / "Takibi Kapat"** and the redesign brief says **"Yarın Hatırlat" → Smart Reminder, "Takibi Kapat" → success state**; the prototype shortened them to "Hatırlat" / "Kapat". Keep the short labels for width, but the reminder sheet's default selection for this entry point should be **"Yarın sabah · 08:00"**.

### Interactive elements
| Element | Prototype | Product |
|---|---|---|
| Back | pop | same |
| Avatar / name | static | tap → Person Intelligence |
| "Takip Mesajı Hazırla" | push `ai-draft-reply` — which shows the hard-coded Ahmet draft (**wrong person**) | push 4.4 with `threadId`, `to = person`, `intent = follow-up` so the AI drafts a nudge ("Merhaba Mehmet, fiyat teklifi hakkında…") |
| "Hatırlat" | opens 4.7 | same, default option "Yarın sabah · 08:00" |
| "Kapat" | local removal, no undo, not persisted | persist `closedAt`; show an undo toast "Takip kapatıldı · Geri Al" (new string) for ~4s; the brief calls for a success state — the fade + toast satisfies it |

### Dead in prototype
- "Takip Mesajı Hazırla" does not carry the person/topic; "Kapat" is not persisted and has no undo; avatar/name not tappable.

### States
- **Loading:** 3 × card skeleton (40px circle, 2 text lines, 1 full-width 36px block, 3 button blocks).
- **Empty:** designed inline (above). The state catalogue has a second, different copy for the same situation — "Takip Listesi": 🎉 on deadline tint, **"Bekleyen takip yok."** / **"Tüm açık konular kapatıldı."**. **Flag:** pick one; recommend the catalogue version (it matches the product's positive tone and the shared empty-state component) and keep "Hepsi tamam!" only as the transient state right after the last card is closed.
- **Error / offline:** shared error cards; closing is queued offline.
- **Dark:** cards `dark/surface`; status box `dark/surface-2`; primary action `dark/primary` 18% + `dark/primary-glow`; secondary actions `dark/surface-2` + `dark/secondary`; badges per dark rule.

### Data fields
**FollowUpItem:** `id`, `threadId`, `person { id, name, initials, org }`, `topic`, `lastOutboundAt`, `lastMessageLabel`, `daysWaiting` (derived), `status` (AI sentence), `severity` (derived: > 5 days critical), `closedAt`, `snoozedUntil`, `sourceLabel`.

---

## 4.6 Senden Beklenenler · Light (route `waiting-reply`, brief §21)

### Purpose & placement
Stack screen listing threads where **someone is waiting on the user** — "AI e-posta konuşmalarından kullanıcının cevap vermesi gereken thread'leri tespit eder." Grouped by urgency **Acil / Bugün / Yakında**. Reached from Mail Özeti (category row — see 4.2 flag) and, per the brief, from Morning Briefing's "Senden Beklenenler" section. Bottom nav hidden. Owns a Hatırlatıcı sheet (4.7).

### Layout, top to bottom
1. **PageHeader** back + **"Senden Beklenenler"**.
2. **Scroll body** — px 20, pt 16, pb 16. One **section per urgency**, in fixed order `acil → bugun → yakinda`, each mb 16, **omitted when empty**:
   - Section label pill (mb 8): `badge` 11/700 +0.05em, upper-cased, radius 6, padding 2×8. **"ACİL"** `critical/soft`+`critical/text`; **"BUGÜN"** `warning/soft`+`warning/text`; **"YAKINDA"** `info/soft`+`info/text`. (Prototype uses JS `toUpperCase()` → "ACIL"; use the tr-TR variant "ACİL".)
   - Cards gap 8. **Waiting-reply card**: `neutral/surface`, radius 14, padding 14, shadow/xs.
     - Header row gap 12, mb 8: **Avatar 36** (hash-coloured); name 14/600 `ink`; topic 12 `ink/secondary`; right: waiting label 11 `ink/tertiary` — **`waitingHours < 24` → "{h} sa", else "{floor(h/24)} gün"**.
     - Expectation sentence 13 `ink` lh 1.45, mb 10.
     - Footer row gap 8: **"Son: {deadline}"** 11/600 in the section's text colour (flex 1); button **"Maili Aç"** 11/600 `ink/secondary` on `neutral/surface-2`, radius 8, padding 5×10; button **"Yanıtla"** 11/600 `brand/primary` on `brand/soft`; icon button **"🔔"** (`notifications`) `ink/tertiary` on `neutral/surface-2` — needs `accessibilityLabel` "Hatırlat".

### Example rows (verbatim, `mockWaitingReplies`)

| id | urgency | person | initials | topic | expectation | deadline | waitingHours → label |
|---|---|---|---|---|---|---|---|
| 1 | acil | Ahmet Yılmaz | AY | "Revize Teklif" | "Bugün 17:00'ye kadar teklifi göndermeni bekliyor." | "Bugün 17:00" | 4 → "4 sa" |
| 2 | bugun | Fatma Şahin | FŞ | "Q3 Raporu Görüşü" | "Raporu inceleyip yorumlarını paylaşmanı bekliyor." | "Yarın" | 52 → "2 gün" |
| 3 | yakinda | Can Öztürk | CÖ | "Toplantı Onayı" | "Pazartesi toplantısına katılıp katılmayacağını merak ediyor." | "Yakında" | 72 → "3 gün" |

### Interactive elements
| Element | Prototype | Product |
|---|---|---|
| Back | pop | same |
| Avatar / name | static | tap → Person Intelligence |
| "Maili Aç" | push `email-detail` (mock #1 regardless of row) | push 4.3 with the row's `emailId` |
| "Yanıtla" | push `ai-draft-reply` (hard-coded Ahmet draft) | push 4.4 with `threadId`, `to = person` |
| "🔔" | opens 4.7 with context "{person} — {topic}" | same |
| Section pills | static | optional: tap to collapse |

### Dead in prototype
- "Maili Aç" and "Yanıtla" ignore the row; no "done / dismiss" action (a thread that has been answered should disappear automatically once the reply is detected — add a manual "Tamamlandı" swipe as fallback).

### States
- **Loading:** section pill skeleton (56×18) + 2 card skeletons per section.
- **Empty (no rows in any group):** not designed. Reuse the shared empty component with new copy: "Kimse senden cevap beklemiyor." / "Açık bir konu kalmadı." (new strings — not in prototype).
- **Error / offline:** shared error cards.
- **Dark:** cards `dark/surface`; section pills per dark rule; "Son:" line uses `dark/critical-text` / `dark/warning-text` / `info` glow; buttons `dark/surface-2` + `dark/secondary`; "Yanıtla" `dark/primary` 18% + `dark/primary-glow`.

### Data fields
**WaitingReplyItem:** `id`, `threadId`, `emailId` (latest inbound message), `person { id, name, initials }`, `topic`, `expectation` (AI sentence), `deadlineLabel`, `deadlineAt`, `waitingSinceAt`, `waitingHours` (derived), `urgency` (`acil | bugun | yakinda`, derived from `deadlineAt`), `resolvedAt`.

---

## 4.7 Shared sheet — "Hatırlatıcı" (SmartReminderSheet)

Used by 4.3 ("Hatırlat"), 4.5 ("Hatırlat") and 4.6 ("🔔"). BottomSheet with title **"Hatırlatıcı"**. Body px 20, pb 20.

### Layout
1. **Context box** (only when a context string is passed): bg `neutral/surface-2`, radius 10, padding 10×12, mb 16; 13 `ink/secondary` lh 1.4. Examples: "Ahmet Yılmaz — Revize fiyat teklifi - acil", "Mehmet Kaya — Fiyat Teklifi", "Can Öztürk — Toplantı Onayı".
2. Kicker **"NE ZAMAN HATIRLATAYIM?"** (`kicker`, mb 10).
3. **Option list** (gap 6, mb 16). Row: padding 13×14, radius 12, border 1.5px `neutral/hairline`, bg `neutral/surface`, icon 18px, label 14/500 `ink` (flex 1), 150ms transition. Selected: bg `brand/soft`, border `brand/primary` 40%, and an 18px `brand/primary` circle with a white 10px check at the right.

| id | icon | label |
|---|---|---|
| `30m` | ⏰ | "30 dakika sonra" |
| `1h` | ⏱️ | "1 saat sonra" |
| `evening` | 🌆 | "Bu akşam · 19:00" |
| `tomorrow` | ☀️ | "Yarın sabah · 08:00" |
| `smart` | ✨ | "Uygun zamanda" |
| `custom` | 📅 | "Kendin seç" |

4. **Conditional panels** (fade-in):
   - When `smart` selected: info box bg `brand/soft`, radius 10, padding 10×14, border 1px `brand/primary` 20%, mb 12; text 12 `brand/primary` lh 1.5: **"✨ Takvimindeki boşluklara göre uygun zamanı Dijital Asistan seçer."**
   - When `custom` selected: picker box bg `neutral/bg`, radius 12, padding 12, border 1px `neutral/hairline`, mb 12; kicker **"TARİH VE SAAT SEÇ"** 12/700 `ink/tertiary` mb 8; row gap 8: date input (flex 1) + time input (width 90, default **"09:00"**); inputs padding 10, radius 10, border 1.5px `neutral/hairline`, 14 `ink`. Use native pickers in RN.
5. **Primary CTA "Hatırlatıcı Oluştur"** — padding 14, radius 14. Enabled: brand gradient, white. **Disabled** (nothing selected, or `custom` without a date): bg `neutral/hairline`, text `ink/disabled`, not pressable. 200ms transition.
6. **Confirmation state** (replaces body, `animate-scale-in`, py 32 centred): 64 circle `success/soft` ✅ 30px mb 12; **"Hatırlatıcı Oluşturuldu"** 16/700 `ink` mb 4; selected option label 13 `ink/secondary`. Auto-closes after **1400ms** and resets selection.

### Interactions & flags
- Tap option → select (single choice); `custom` also reveals the picker. Backdrop tap → close and reset.
- **Dead / gaps:** nothing is persisted; the confirmation shows the option label ("Kendin seç") rather than the resolved time — show the resolved datetime ("Yarın 08:00", "6 Eylül 09:00"); "Uygun zamanda" requires calendar access → when the calendar is not connected, disable that row and show the "Takvim izni verilmedi." error semantics (CTA "Ayarlara Git"); reminder creation is a write action → route through Approval Center when the user's setting requires it (brief); the "evening"/"tomorrow" absolute times (19:00 / 08:00) must come from Briefing Settings, not be hard-coded.
- **Dark:** rows `dark/surface` + `dark/surface-2` border, selected `dark/primary` 18% + border `dark/primary-glow` 40%; context box `dark/surface-2`; info box `dark/primary` 18% with `dark/primary-glow` text; disabled CTA `dark/surface-2` + `dark/tertiary`.

### Data fields
**ReminderRequest:** `contextType` (`email | follow-up | waiting-reply`), `contextId`, `contextLabel`, `option` (`30m | 1h | evening | tomorrow | smart | custom`), `fireAt` (resolved), `customDate`, `customTime`, `createdVia` (`direct | approval`).

---

## 4.8 State catalogue used by this section (from `states/LoadingStates`, `EmptyStates`, `ErrorStates`)

### 4.8.1 Loading
- **AI processing card** — `neutral/surface`, radius 20, padding 28×20, centred: 72 circle gradient `brand/soft → deadline-soft` with ✨ 30px rotating (3s linear); **"AI Analiz Yapıyor"** 15/700 `ink` −0.02em mb 6; step line 13/500 `brand/primary`, cycling every 1.8s through **"Mail analizi yapılıyor"**, **"Takvim kontrol ediliyor"**, **"Öncelikler belirleniyor"**, **"Brifing hazırlanıyor"** with animated "…" (dots every 400ms); three 6px `brand/primary` dots below (mt 16) pulsing opacity 0.25→1.
- **SyncStatusBar** — `neutral/surface`, radius 14, padding 12×16, gap 12: 32 circle `info/soft` with 🔄 16px spinning (2s); **"Senkronize ediliyor"** 13/600 `ink`; **"Gmail · Son güncelleme: az önce"** 11 `ink/secondary`; right: 48×4 progress track `neutral/hairline` with an `info` bar (60%, shimmer).
- **EmailCardSkeleton** — surface radius 14, padding 14×16: row (36 circle, 50%×13 + 35%×11 lines, 52×18 block) then 85%×14 and 70%×13 lines. Shown ×3 inside one radius-16 container with hairline separators ("MAIL KARTI SKELETON").
- **Full-screen refresh** — radius 20 card, ⟳ 36px spinning, **"Güncelleniyor"** 14/600 `ink`, **"Yeni içerik aranıyor..."** 12 `ink/tertiary`. Use for pull-to-refresh overlays on 4.1/4.2.

### 4.8.2 Empty
Shared empty component: card `neutral/surface`, radius 20, padding 28×20, centred; context kicker 10/700 `ink/tertiary` +0.05em caps (→ `badge` size); 72 circle tinted with a 32px icon, margin 12 auto 16; title 18/700 `ink` −0.02em mb 8 (→ `h3`); subtitle 13 `ink/secondary` lh 1.5, max-width 240; optional CTA mt 20, padding 10×24, radius 12, brand gradient, 13/600 white. Variants relevant here:

| context kicker | icon / tint | title | subtitle | CTA |
|---|---|---|---|---|
| "Mail Akışı" | ✅ / `success/soft` | "Her şey kontrol altında." | "Dikkat gerektiren önemli bir mail yok." | — |
| "Takip Listesi" | 🎉 / deadline tint | "Bekleyen takip yok." | "Tüm açık konular kapatıldı." | — |
| "Bağlantı Yok" | 🔗 / `warning/soft` | "Mailini bağla." | "Gmail veya Outlook bağlayarak önemli konuları burada görebilirsin." | "Hesap Bağla" |
| "Bugünkü Program" (for the Takvim filter) | 😌 / `info/soft` | "Bugün takvimin oldukça sakin." | "Planlanmış bir toplantın ya da etkinliğin yok." | "Etkinlik Ekle" |

CTAs in the catalogue are **dead** (no handlers); "Hesap Bağla" → Integrations, "Etkinlik Ekle" → create-event sheet.

### 4.8.3 Error / offline / permission
Shared error card: `neutral/surface`, radius 20, padding 24×20; left icon tile 52, radius 16, tinted; badge 10/700 caps in the semantic colour; title 15/700 `ink` −0.02em; subtitle 13 `ink/secondary` lh 1.5; button row mt 16, gap 8, each flex 1, padding 11, radius 12, 13/600 — primary filled with the semantic colour (white text), secondary `neutral/surface-2` + `ink/secondary`. While retrying the primary reads **"✓ Deneniyor..."** on `success/soft` in `success` for 1500ms.

| badge | icon / tint | title | subtitle | primary | secondary | applies to |
|---|---|---|---|---|---|---|
| "BAĞLANTI" | 🔑 / `warning` | "Bağlantı süresi doldu." | "Gmail hesabına yeniden bağlanman gerekiyor. Verilerini koruyoruz." | "Yeniden Bağlan" | "Daha Sonra" | 4.1, 4.2 (OAuth token expired) |
| "YETKİLENDİRME" | 🚫 / `critical` | "Erişim izni reddedildi." | "Google hesabında izin onaylanmadı. Tekrar denemek için aşağıya dokun." | "Tekrar Dene" | "İptal" | 4.1, 4.2, 4.4 (scope denied) |
| "TAKVİM" | 📅 / `info` | "Takvim izni verilmedi." | "Toplantı hazırlığı ve takvim akışı için takvim erişimine ihtiyacımız var." | "Ayarlara Git" | "Atla" | 4.7 "Uygun zamanda", 4.3 "Takvime Ekle" |
| "AI ANALİZ" | ✨ / deadline tint | "AI şu an meşgul." | "Analizler geçici olarak yavaşladı. Birkaç dakika içinde her şey normale dönecek." | "Yenile" | — | 4.3 summary, 4.4 draft generation |
| "BAĞLANTI" | 📡 / `ink/secondary` | "İnternet bağlantısı yok." | "Çevrimiçi olduğunda her şey otomatik olarak güncellenir." | "Tekrar Dene" | — | every screen (offline) |
| "SENKRON" | ⏱️ / `warning` | "Senkronizasyon gecikiyor." | "Sunucularla bağlantı normalden yavaş. Biraz daha bekleyebilirsin." | "Arka Planda Dene" | "Tamam" | 4.1, 4.2 |

Secondary buttons in the catalogue are **dead**; wire "Daha Sonra"/"Tamam"/"Atla" to dismiss the card for the session, "İptal" to dismiss, "Ayarlara Git" to OS settings / Integrations.

---

## 4.9 Consolidated "dead in prototype" list

| Screen | Element | Prototype | Needed |
|---|---|---|---|
| 4.1 Akış | 8 action pills ("Yanıtla", "Hazırlan", "Takvime Ekle", "Takip Et", "Görüntüle" ×2, "Ödeme Yap", "İncele") | `stopPropagation` only | per-label targets (4.1 table) |
| 4.1 Akış | card tap for `deadline` / `life` items | none | detail sheets / origin mail |
| 4.1 / 4.3 | SourceTag | never tappable | show origin |
| 4.1 / 4.2 / 4.6 | email navigation | always mock #1 | pass `emailId` |
| 4.2 Mail Özeti | "Cevap Bekleyen" / "Cevap Beklediğin" | routes inverted vs. labels | use brief labels; swap targets |
| 4.2 Mail Özeti | "Önemli" / "Düşük Öncelik" selected | blank list | empty state |
| 4.3 Mail Detayı | "Takvime Ekle" | jumps to Plan tab | create-event approval sheet |
| 4.3 Mail Detayı | "Gmail'de Aç ↗" | closes sheet | deep link + web fallback |
| 4.3 Mail Detayı | "Görev Oluştur" | local success only, title+date only | AI-extracted fields, "Görevi Oluştur", Approval Center, persistence |
| 4.3 / 4.5 / 4.6 | sender avatar / name | static | Person Intelligence |
| 4.4 Yanıt Hazırla | tone chips | no regeneration | regenerate with tone |
| 4.4 Yanıt Hazırla | "Gmail'de Aç" | fake hand-off screen | real compose deep link |
| 4.4 Yanıt Hazırla | recipient / draft | hard-coded Ahmet | from thread + AI |
| 4.4 Yanıt Hazırla | "Bugüne Dön" | history not reset | reset stack |
| 4.4 Yanıt Hazırla | send failure, discard-draft confirm, send-scope-missing branch | absent | required |
| 4.5 Takip | "Takip Mesajı Hazırla" | wrong person's draft | follow-up draft for the row |
| 4.5 Takip | "Kapat" | local, no undo, not persisted | persist + undo toast |
| 4.6 Senden Beklenenler | empty state, done/dismiss action | absent | required |
| 4.7 Hatırlatıcı | "Hatırlatıcı Oluştur" | local confirmation only; label instead of resolved time | persist (via approval when required); show resolved time; calendar-permission gate on "Uygun zamanda" |
| 4.8 catalogues | all CTAs and secondary buttons | dead | wired as listed |

**Prototype data inconsistencies to fix in fixtures:** mock email #1 summary names "Mehmet" for a mail from Ahmet; the "Cevap Bekleyen"/"Cevap Beklediğin" semantics (above); the follow-up badge threshold uses `> 5` so a 5-day wait is still amber — confirm with product (recommend `>= 5` critical, `>= 3` warning, else neutral); JS `toUpperCase` on Turkish labels.

---

## 4.10 i18n string catalogue (verbatim, grouped; suggested keys)

**Bottom nav:** `nav.today` "Bugün" · `nav.flow` "Akış" · `nav.plan` "Plan" · `nav.assistant` "Asistan".

**4.1 Akış:** `flow.title` "Akış" · `flow.mailSummary` "Mail Özeti" · `flow.avatarInitial` "Y" · `flow.filter.all` "Tümü" · `flow.filter.important` "Önemli" · `flow.filter.mail` "Mail" · `flow.filter.calendar` "Takvim" · `flow.filter.followup` "Takip" · `flow.filter.personal` "Kişisel" · actions: `action.reply` "Yanıtla", `action.prepare` "Hazırlan", `action.addToCalendar` "Takvime Ekle", `action.track` "Takip Et", `action.view` "Görüntüle", `action.pay` "Ödeme Yap", `action.review` "İncele" · example titles/summaries/sources as in the 4.1 table (fixture file, not i18n).

**4.2 Mail Özeti:** `mail.title` "Mail Özeti" · `mail.stats.count` "{count}" + `mail.stats.unit` "mail bugün" · `mail.stats.attention` "{count} tanesi dikkat gerektiriyor." · `mail.kicker.categories` "KATEGORİLER" · `mail.kicker.highlights` "ÖNE ÇIKANLAR" · `mail.cat.important` "Önemli" · `mail.cat.awaitingReply` "Cevap Bekleyen" (→ recommend "Senden Cevap Bekleyen") · `mail.cat.myAwaiting` "Cevap Beklediğin" (→ recommend "Senin Cevap Beklediğin") · `mail.cat.deadline` "Son Tarih İçeren" · `mail.cat.info` "Bilgilendirme" · `mail.cat.low` "Düşük Öncelik".

**4.3 Mail Detayı:** `email.title` "Mail Detayı" · `email.meta` "{time} · Gmail" · `email.kicker.aiSummary` "AI ÖZETİ" · `email.kicker.keyPoints` "ÖNEMLİ NOKTALAR" · `email.kicker.actions` "İŞLEMLER" · `email.action.draftReply` "Yanıt Hazırla" · `email.action.createTask` "Görev Oluştur" · `email.action.addToCalendar` "Takvime Ekle" · `email.action.remind` "Hatırlat" · `email.openOriginal` "Orijinal Maili Aç" · `email.source` "Gmail · {sender} · {time}" · hand-off sheet: `handoff.title` "Orijinal Mail", `handoff.heading` "Gmail'de Açılıyor", `handoff.body` "Orijinal mail Gmail uygulamasında açılacak. Devam etmek istiyor musun?", `handoff.cta` "Gmail'de Aç ↗", `common.cancel` "İptal" · task sheet: `task.title` "Görev Oluştur", `task.field.title` "GÖREV BAŞLIĞI", `task.field.due` "SON TARİH", `task.cta` "Görev Oluştur" (brief: "Görevi Oluştur"), `task.success` "Görev Oluşturuldu".

**4.4 Yanıt Hazırla:** `draft.title` "Yanıt Hazırla" · `draft.kicker.tone` "TON" · `draft.tone.short` "Kısa" · `draft.tone.professional` "Profesyonel" · `draft.tone.friendly` "Samimi" · `draft.tone.detailed` "Detaylı" · `draft.to` "Kime" · `draft.aiBadge` "AI TARAFINDAN HAZIRLANDI" · `draft.editable` "Düzenleyebilirsin" · `draft.disclaimer` "⚠️ AI onayın olmadan mail göndermez" · `draft.cta.approveSend` "Göndermeyi Onayla" · `draft.cta.openGmail` "Gmail'de Aç" · `draft.default` (fixture) the five-paragraph text in 4.4 · confirm sheet: `confirm.title` "Son Onay", `confirm.body` "{recipient}'a şu mail gönderilecek. Bu işlem geri alınamaz.", `confirm.yes` "Evet, Gönder", `common.cancel` "İptal" · sent: `sent.title` "Gönderildi!", `sent.body` "{recipient}'a iletildi.", `sent.backToToday` "Bugüne Dön" · hand-off screen: `gmailHandoff.title` "Gmail açılıyor…", `gmailHandoff.body` "Taslak Gmail uygulamasına aktarıldı. Göndermek için Gmail'i kullan.", `gmailHandoff.back` "Geri Dön".

**4.5 Takip Etmen Gerekenler:** `followup.title` "Takip Etmen Gerekenler" · `followup.topic` "Konu: {topic}" · `followup.daysAgo` "{days} gün önce" · `followup.action.draft` "Takip Mesajı Hazırla" · `followup.action.remind` "Hatırlat" · `followup.action.close` "Kapat" · `followup.empty.title` "Hepsi tamam!" · `followup.empty.body` "Takip edilecek konu yok." · fixture statuses: "Henüz yanıt gelmedi.", "Onay bekleniyor.", "Destek ekibi inceliyor.".

**4.6 Senden Beklenenler:** `waiting.title` "Senden Beklenenler" · `waiting.group.urgent` "Acil" / "ACİL" · `waiting.group.today` "Bugün" / "BUGÜN" · `waiting.group.soon` "Yakında" / "YAKINDA" · `waiting.hours` "{h} sa" · `waiting.days` "{d} gün" · `waiting.deadline` "Son: {deadline}" · `waiting.action.openMail` "Maili Aç" · `waiting.action.reply` "Yanıtla" · `waiting.action.remind.a11y` "Hatırlat" · fixture deadlines: "Bugün 17:00", "Yarın", "Yakında".

**4.7 Hatırlatıcı:** `reminder.title` "Hatırlatıcı" · `reminder.kicker` "NE ZAMAN HATIRLATAYIM?" · `reminder.opt.30m` "30 dakika sonra" · `reminder.opt.1h` "1 saat sonra" · `reminder.opt.evening` "Bu akşam · {time}" ("Bu akşam · 19:00") · `reminder.opt.tomorrow` "Yarın sabah · {time}" ("Yarın sabah · 08:00") · `reminder.opt.smart` "Uygun zamanda" · `reminder.opt.custom` "Kendin seç" · `reminder.smartHint` "✨ Takvimindeki boşluklara göre uygun zamanı Dijital Asistan seçer." · `reminder.customKicker` "TARİH VE SAAT SEÇ" · `reminder.cta` "Hatırlatıcı Oluştur" · `reminder.success` "Hatırlatıcı Oluşturuldu".

**4.8 States:** loading — "AI Analiz Yapıyor", "Mail analizi yapılıyor", "Takvim kontrol ediliyor", "Öncelikler belirleniyor", "Brifing hazırlanıyor", "Senkronize ediliyor", "Gmail · Son güncelleme: az önce", "Güncelleniyor", "Yeni içerik aranıyor..."; empty — "Mail Akışı", "Her şey kontrol altında.", "Dikkat gerektiren önemli bir mail yok.", "Takip Listesi", "Bekleyen takip yok.", "Tüm açık konular kapatıldı.", "Bağlantı Yok", "Mailini bağla.", "Gmail veya Outlook bağlayarak önemli konuları burada görebilirsin.", "Hesap Bağla", "Bugünkü Program", "Bugün takvimin oldukça sakin.", "Planlanmış bir toplantın ya da etkinliğin yok.", "Etkinlik Ekle"; error — "BAĞLANTI", "Bağlantı süresi doldu.", "Gmail hesabına yeniden bağlanman gerekiyor. Verilerini koruyoruz.", "Yeniden Bağlan", "Daha Sonra", "YETKİLENDİRME", "Erişim izni reddedildi.", "Google hesabında izin onaylanmadı. Tekrar denemek için aşağıya dokun.", "Tekrar Dene", "İptal", "TAKVİM", "Takvim izni verilmedi.", "Toplantı hazırlığı ve takvim akışı için takvim erişimine ihtiyacımız var.", "Ayarlara Git", "Atla", "AI ANALİZ", "AI şu an meşgul.", "Analizler geçici olarak yavaşladı. Birkaç dakika içinde her şey normale dönecek.", "Yenile", "İnternet bağlantısı yok.", "Çevrimiçi olduğunda her şey otomatik olarak güncellenir.", "SENKRON", "Senkronizasyon gecikiyor.", "Sunucularla bağlantı normalden yavaş. Biraz daha bekleyebilirsin.", "Arka Planda Dene", "Tamam", "✓ Deneniyor...".

**New strings this spec introduces (not in the prototype — need copy review):** "Bu kategoride mail yok.", "Dikkat gerektiren bir şey yok.", "Gönderilemedi. Tekrar dene.", "Hazırlanıyor…", "Yanıtını yaz…", "Göndermek için Gmail izni gerekiyor.", "Taslak panoya kopyalandı", "Taslağı sil?", "Takip kapatıldı · Geri Al", "Kimse senden cevap beklemiyor.", "Açık bir konu kalmadı.".
