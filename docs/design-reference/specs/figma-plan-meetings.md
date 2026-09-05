# Figma prototype spec — Plan tab & meeting flows

**Scope:** the five screens under `src/screens/plan/` of the Figma prototype — Plan (tab), Takvim Çakışması, Toplantı Hazırlık (Meeting Prep), Toplantı Sonrası (Post Meeting), Taahhütler (Commitment Tracker) — plus the shared chrome they depend on (PageHeader, BottomSheet, BottomNav) and the generic loading / empty / error states that apply to them.

**Role of this document:** the Figma prototype is the *secondary* reference (screen coverage, edge cases, states, interaction intent). Where it conflicts with the primary HTML canvas, the canvas wins on visuals; this spec wins on *which screens/states/strings exist* and *what every control must do*.

**Numbering:** the prototype's own design brief (`dijital-asistan-product-design.md`) numbers these screens **22 Commitment Tracker, 23 Plan Ekranı, 24 Takvim Çakışması, 25 Meeting Prep, 26 Meeting Sonrası**. The IA page labels them "Plan Alt Ekranlar: Takvim Çakışması · Toplantı Hazırlık · Toplantı Sonrası · Taahhütler". Those IDs are used below.

**Sources transcribed (read in full):** `PlanScreen.tsx`, `MeetingPrep.tsx`, `CalendarConflict.tsx`, `PostMeeting.tsx`, `CommitmentTracker.tsx`, `data/mock.ts` (`mockCommitments`, `mockMeetings`), `types.ts`, `components/layout/{PageHeader,BottomSheet,BottomNav}.tsx`, `context/{ThemeContext,NavigationContext}.tsx`, `App.tsx`, `index.css`, `screens/states/{LoadingStates,EmptyStates,ErrorStates,IAPage,UserFlows}.tsx`, and the three pasted design briefs.

---

## 0. Cross-cutting conventions

### 0.1 Prototype value → design token map

The prototype hard-codes an older palette. Engineers must use the token on the right; never the hex on the left.

| Prototype value | Where it appears | Token to use |
|---|---|---|
| `#F8F8FC` (`t.bg`) | screen backgrounds | `neutral/bg` |
| `#FFFFFF` (`t.surface`) | cards, sheet, segment active | `neutral/surface` |
| `#F1F1F8` (`t.surface2`) | segment track, secondary buttons, back-button circle | `neutral/surface-2` |
| `#E8E8F0` (`t.border`) | borders, disabled button fill, sheet handle | `neutral/hairline` |
| `#F2F2F8` | very light dividers (header bottom, sheet title divider, meeting card border) | `neutral/hairline` at 60% |
| `#0F0F1A` (`t.text`) | primary text | `ink` |
| `#6B6B80` (`t.textSec`) | secondary text | `ink/secondary` |
| `#A0A0B2` (`t.textMuted`) | tertiary text, inactive segment, day labels | `ink/tertiary` |
| `#5B5CE2` | primary, kickers, links, numbered bullets | `brand/primary` |
| `#4647C7` | gradient end colour | `brand/primary-pressed` |
| `linear-gradient(135deg,#5B5CE2,#4647C7)` | hero, primary CTAs, avatar | **brand gradient** = `brand/primary → brand/primary-pressed`, 135° |
| `#EEEEFF` (`t.primarySoft`) | AI cards, avatar bg, selected option | `brand/soft` |
| `#F0ECFF` + `#5B21B6` ("deadline" purple) | "Taahhütler" pill on Plan header | `brand/soft` + `brand/text-on-soft` |
| `linear-gradient(135deg,#EEEEFF,#E5F2FF)` | AI banner, AI timeline block, sheet hero | **AI-soft gradient** = `brand/soft → info/soft`, 135° (candidate for `gradient/dawn` if the canvas defines it that way) |
| `rgba(91,92,226,.15/.2/.4)` | AI card borders | `brand/primary` at 15 / 20 / 40 % |
| `#C0251B` | critical text | `critical/text` |
| `#FFEEED` | critical fill | `critical/soft` |
| `rgba(192,37,27,.15)` | critical border | `critical/text` at 15 % |
| `#1A7A33` / `#E8F8EE` | success text / fill | `success/text` / `success/soft` |
| `#8C5200` / `#FFF4E0` | warning text / fill | `warning/text` / `warning/soft` |
| `#E5F2FF` | info fill | `info/soft` |
| `#0F0F1A` as a full-screen background (handoff) | Meet handoff screen | `dark/bg` (or `gradient/night`) |
| `rgba(15,15,26,.45)` + blur 3 | sheet backdrop | `ink` at 45 % + blur 3 |
| Shadows `0 1px 3px rgba(15,15,26,.04)` / `0 1px 4px rgba(15,15,26,.05–.06)` | cards | shadow/xs |
| `0 4px 12px rgba(91,92,226,.25)` | primary CTA glow | `brand/primary` at 25 %, y4 blur12 |

Dark theme in the prototype (`ThemeContext.dark`): bg `#0F0F1A`, surface `#1E1E2E`, surface2 `#2A2A3C`, border `#3A3A50`, text `#EAEAF8`, textSec `#9090B8`, textMuted `#6060A0`, primary `#7B7CF4`, primarySoft `#2A2A4A`, critical `#FF6B6B`/`#3A1A1A`, success `#4CD47A`/`#0A2A1A`, warning `#FFAA44`/`#2A1A00`. Map to: `dark/bg`, `dark/surface`, `dark/surface-2`, hairline = `rgba(255,255,255,.08)`, `dark/text`, `dark/secondary`, `dark/tertiary`, `dark/primary`, soft fills = colour at 16–20 % alpha over `dark/surface`, `dark/critical-text`, `dark/success-text`, `dark/warning-text`. **Only Plan reads `t.*`; Takvim Çakışması, Toplantı Sonrası and Taahhütler are hard-coded light in the prototype and must be re-tokenised.**

### 0.2 Prototype type sizes → type scale

| Prototype | Token |
|---|---|
| 26/700, −0.03em ("Plan") | `h1` (28/34 600) |
| 22/800 −0.03em (sheet time, success titles, "Toplantın bitti.") | `h2` (22/28 600) — the canvas weight is 600; prototype 800 is a legacy |
| 21/800 (hero name) | `h2` |
| 20/800 (handoff title) | `h2` |
| 17/600 −0.02em (page header / sheet title) | `h3` (17/23 600) |
| 16/700 | `h3` |
| 15/600–700 (CTAs, list titles) | `body` 15/22, weight 600 |
| 14/400–600 | `body` 15/22 or `secondary` 14/20 — use `secondary` for the 14 px greys, `body` for 14 px `ink` |
| 13 | `secondary` (13/18 allowed as "caption" if the canvas defines it) |
| 12/700 +0.03–0.05em caps | `kicker` (12/16 600 +8 % caps `ink/tertiary`; brand-coloured kickers use `brand/primary`) |
| 11/700 +0.04em caps | `badge` (11/14 700 +5 %) |
| 10/700 (status pills, "ÖNERİLEN") | `badge` |
| 10/500 (day-of-week label) | `badge` weight 500 |
| Inter (prototype) | product sans; editorial Lora is **not** used on any Plan screen |

Icons: the prototype uses emoji (✨ 📅 ⚠️ ✅ 📹 📝 🎯 🕐 ✉️ 📋 🏥 ⏱️). Replace with Material Symbols Rounded: `auto_awesome`, `calendar_month`/`event`, `warning`, `check_circle`, `videocam`, `edit_note`, `target`/`flag`, `schedule`, `mail`, `checklist`, `local_hospital`, `timer`. Keep the emoji only where the canvas explicitly does.

### 0.3 Navigation model

`App.tsx`: `MAIN_TABS = ['today','flow','plan','assistant']` → only these render the BottomNav. Everything else is a **stack push with no bottom nav**.

| Route id | Screen | Type |
|---|---|---|
| `plan` | 23 Plan | Tab (BottomNav visible, "Plan" active) |
| `calendar-conflict` | 24 Takvim Çakışması | Stack (back chevron) |
| `meeting-prep` | 25 Toplantı Hazırlık | Stack (back chevron) |
| `post-meeting` | 26 Toplantı Sonrası | Stack (custom header, back → `plan`) |
| `commitments` | 22 Taahhütler | Stack (back chevron) |
| in-screen | "AI Öneri" sheet (Plan) | Bottom sheet |
| in-screen | "Ertele" sheet (Taahhütler) | Bottom sheet |
| in-screen | Meet handoff | Full-screen modal state inside Meeting Prep |

`goBack()` pops the history stack; if empty it falls to `today`. Routes navigated *to* from these screens: `profile`, `person-intelligence`, `email-detail`, `today`, `plan`.

Design brief "FLOW 3 — Toplantı Hazırlığı" (UserFlows): **Takvim Etkinliği → Meeting Prep → İlgili Mailler → Not Al → Toplantı Sonrası**. Global rules from the same page that constrain these screens:
- "🔒 Write actions (mail gönder, takvim oluştur) her zaman kullanıcı onayı gerektirir" — moving a meeting, creating a task block, saving a commitment reminder are write actions.
- "✨ AI önerileri aksiyonla bitmeli: 'Şimdi ne yapmalıyım?' sorusu her adımda cevaplı".
- "↩ Geri gidebilme her akışta mevcut olmalı".

### 0.4 Shared chrome

**BottomNav** (Plan tab active): height 82 (padding-top 8, padding-bottom 24 for home indicator), bg `neutral/surface` at 95 % + blur 20, top border `neutral/hairline` at 80 %. Four equal tabs, each: 24 px icon + label 10/500 (+0.01em); active = `brand/primary`, weight 600, icon scale 1.05 (200 ms), stroke 2.2 and 8–12 % brand fill; inactive = `ink/tertiary`, stroke 1.8. Labels verbatim: **"Bugün"**, **"Akış"**, **"Plan"**, **"Asistan"**. Plan icon = calendar with three dots.

**PageHeader** (`showBack`, optional `title`): min-height 52, padding 20 h / 12 v, bg `neutral/bg` at 95 % + blur 12, bottom border `neutral/hairline` at 60 %. Back button 36×36 circle, bg `neutral/surface-2` at 80 %, 18 px chevron-left `ink`, margin-right 8, margin-left −4. Title `h3` `ink`, flex 1. Back → `goBack()`.

**BottomSheet**: absolute full-screen overlay `ink` 45 % + blur 3 (tap = close); panel bg `neutral/surface`, top radius 24 (nearest token: radius/28 — confirm against canvas), max-height 85 %, shadow `0 −4px 40px rgba(15,15,26,.18)`; handle 36×4 radius 2 `neutral/hairline`, padding-top 12 / bottom 4; optional title row padding 20 h, 4 top, 12 bottom, bottom border hairline-light, title `h3`; content scrolls, padding-bottom 32. Enter animation `slideUp` 300 ms `cubic-bezier(.32,.72,0,1)` (translateY 20→0, fade). No swipe-to-dismiss in prototype — add it in RN (gesture + backdrop tap).

**card-press**: `transform: scale(.982)` on `:active`, 150 ms ease (RN: Pressable with scale animation).

---

## 23. Plan · Light (tab)

### Purpose / placement
Third tab. "Calendar + tasks + commitments birleşimi" — daily timeline of calendar events and AI task blocks, with proactive AI suggestions (free-slot planning) and conflict alerts. Entry points to Taahhütler, Toplantı Hazırlık, Takvim Çakışması and Profil.

### Layout, top to bottom

Screen bg `neutral/bg`. All horizontal padding 20.

1. **Header block** (padding 20 h / 8 top / 12 bottom, non-scrolling)
   - Row (margin-bottom 12): left `h1` **"Plan"** (`ink`, −0.03em). Right cluster, gap 8:
     - **pill button "Taahhütler"** — bg `brand/soft`, text `brand/text-on-soft`, 12/600, padding 7 v / 12 h, radius 10, no border → `navigate('commitments')`.
     - **avatar button** — 32×32 circle, brand gradient, initial **"Y"** 13/700 white → `navigate('profile')`.
   - **Segmented control** (`Gün | Hafta`): track bg `neutral/surface-2`, radius 12, padding 3; two segments flex 1, padding 7 v, radius 10, 14/600; active: bg `neutral/surface`, `ink`, shadow `0 1px 4px rgba(15,15,26,.10)`; inactive: transparent, `ink/tertiary`; `transition: all .2s`. Labels **"Gün"**, **"Hafta"**.

2. **Date strip** (horizontal scroll, gap 12, padding 20 h / 12 bottom, non-scrolling vertically). Seven items **"Paz", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt"** rendered with dates 1…7; today = "Cmt". Each item: day label 10/500 +0.02em (`brand/primary` if today, else `ink/tertiary`), margin-bottom 4; circle 32×32 radius 16 — today: bg `brand/primary`, number 14/700 white; other: transparent, number 14/500 `ink`. Must be data-driven in production (current ISO week, real day numbers, locale `tr-TR`).

3. **AI suggestion banner** (`card/ai-insight`, compact) — margin 0 20 12: bg AI-soft gradient, radius 12, padding 10 v / 14 h, border 1 px `brand/primary` 15 %; row, gap 10, align center:
   - ✨ 18 px (→ `auto_awesome` in `brand/primary`)
   - text column: line 1 13/500 `ink` lh 1.4 **"Yarın 14:00–16:30 arasında 2,5 saat boşluğun var."**; line 2 11/600 `brand/primary` **"Teklif hazırlama görevini buraya yerleştirebilirim."**
   - button **"Planla"** — bg `brand/primary`, white 11/700, padding 5 v / 10 h, radius 8 → opens the **AI Öneri** sheet.

4. **Timeline** (fills remaining height, vertical scroll, padding 20 h / 16 bottom). Eleven hourly rows `08:00 … 18:00`; each row `flex`, gap 12, min-height 52:
   - time gutter width 44, padding-top 12, label 11/500 `ink/tertiary`.
   - lane: flex 1, left border 1 px `neutral/hairline`, padding-left 12, top 8, bottom 4.
   - **Empty slot**: 36 px spacer.
   - **Event block** (`card-press`): radius 12, padding 10 v / 12 h, shadow xs.
     - type `ai` → bg AI-soft gradient, border **1 px dashed** `brand/primary` 40 %; kicker **"✨ AI ÖNERİSİ"** 11/700 +0.04em `brand/primary`.
     - type `meeting` → bg `neutral/surface`, border 1 px hairline-light; kicker **"📅 TOPLANTI"** 11/700 +0.04em `ink/secondary`.
     - after kicker: duration chip text `${duration}sa` 10 px `ink/tertiary` (renders **"2sa"**, **"1sa"**, **"1.5sa"** — fix to Turkish format "2 sa", "1 sa", "1,5 sa").
     - title 13/600 `ink` −0.01em; optional platform line 11 px `ink/tertiary`, margin-top 2.
     - Blocks do **not** span multiple rows by duration in the prototype (a 2 h block occupies only the 09:00 row). Production: height = duration × row height, or keep the prototype's list-style rendering — decide with the canvas.

   Timeline rows (verbatim data):

   | time | event | type | duration | platform |
   |---|---|---|---|---|
   | 08:00 | — | | | |
   | 09:00 | **Teklif Hazırlama** | ai | 2 | — |
   | 10:00 | — | | | |
   | 11:00 | — | | | |
   | 12:00 | — | | | |
   | 13:00 | — | | | |
   | 14:00 | **Mehmet Kaya · Müşteri Toplantısı** | meeting | 1 | **Google Meet** |
   | 15:00 | — | | | |
   | 16:00 | **Can Öztürk · Proje Kickoff** | meeting | 1.5 | **Zoom** |
   | 17:00 | — | | | |
   | 18:00 | — | | | |

5. **Conflict alert** (critical banner; in the prototype's DOM it sits *below* the scroll area, i.e. pinned above the bottom nav — treat as a sticky footer banner) — margin 0 20 12: bg `critical/soft`, radius 14, padding 12 v / 14 h, border 1 px `critical/text` 15 %; row gap 10, align start:
   - ⚠️ 18 px (`warning` icon, `critical/text`)
   - title **"Takvim Çakışması"** 13/700 `critical/text`, margin-bottom 2; body 12 px `ink/secondary` lh 1.4 **"14:00–15:00 müşteri toplantısı ile 14:30 doktor randevusu çakışıyor."**
   - button **"Çöz"** — bg `neutral/surface`, `critical/text` 11/600, padding 5 v / 10 h, radius 8 → `navigate('calendar-conflict')`.

6. **BottomNav** — Plan active.

### AI Öneri sheet (BottomSheet, title **"AI Öneri"**)

Content padding 20 h / 24 bottom.

**Default state**
- Hero card: bg AI-soft gradient, radius 14, padding 16, margin-bottom 20, border 1 px `brand/primary` 20 %.
  - row: ✨ 18 px + kicker **"ÖNERİLEN ZAMAN BLOĞU"** 11/700 +0.05em `brand/primary`, margin-bottom 8
  - time **"14:00 – 16:30"** `h2` (22/800 in proto) `ink` −0.03em, margin-bottom 4
  - task **"Teklif hazırla"** 14/600 `brand/primary`, margin-bottom 12
  - rationale 12 px `ink/tertiary` lh 1.5 **"Yarın bu aralıkta 2,5 saatlik boşluk var. Mehmet Kaya toplantısından önce teklifin hazır olması için ideal zaman."**
- Button stack, gap 10, all full-width, padding 14, radius 14:
  - **"Onayla"** — brand gradient, white 15/700 → switch to confirmed state, set `timelineHasTask = true`, auto-close after **1800 ms** (also resets confirmed flag on close).
  - **"Saati Değiştir"** — bg `neutral/surface-2`, `ink/secondary` 14/600 → **dead in prototype**.
  - **"İptal"** — transparent, `ink/tertiary` 14/600 → close sheet.

**Confirmed state** (replaces content; column centred, padding 32 v, gap 12)
- 64×64 circle `success/soft`, ✅ 28 px (`check_circle` `success`)
- **"Takvime eklendi"** 16/700 `ink`
- **"Yarın 14:00–16:30 bloğu "Teklif hazırla" görevi olarak eklendi."** 13 px `ink/tertiary`, centred.

**Known gap:** `timelineHasTask` is set but never read — the confirmed block never appears on the timeline. QA brief §6 requires: "Onay sonrası timeline'a AI task block eklenmiş state göster." Production: after Onayla, insert an `ai` block "Teklif hazırla" 14:00–16:30 on *tomorrow's* day (and switch the date strip to tomorrow, or show a toast with "Göster" if staying on today). Creating the calendar block is a write action → confirm via this sheet is the consent step (matches Approval Center's `create-event` type).

### Interactive elements

| Element | Prototype behaviour | Production |
|---|---|---|
| "Taahhütler" pill | → `commitments` | same |
| Avatar "Y" | → `profile` | same |
| Segment "Gün" / "Hafta" | toggles state only; **content never changes** | Hafta = 7-column week grid (or 7 stacked day sections); persist last choice |
| Date strip item | cursor pointer, **no handler** | select day; timeline + banner re-query; today gets `brand/primary` circle, selected-non-today gets `brand/soft` circle |
| "Planla" | opens AI Öneri sheet | same |
| Meeting block tap | → `meeting-prep` (no id passed) | pass `meetingId` |
| AI block tap | `card-press` visual only, **no handler** | open task detail / edit sheet (title, time, "Takvimden kaldır") |
| "Çöz" | → `calendar-conflict` | pass `conflictId` |
| Sheet "Onayla" | confirmed → auto-close 1.8 s | + insert block, haptic success |
| Sheet "Saati Değiştir" | **dead** | open time-range picker (start/end, 15-min steps) pre-filled 14:00–16:30, then return to sheet with new times |
| Sheet "İptal" / backdrop | close | same; also record "dismissed" so the same suggestion is not re-surfaced today |

### States
- **Loading**: header + segment + date strip render immediately; timeline rows show 2× `MeetingCardSkeleton` (card bg surface, radius 14, padding 14 v / 16 h, gap 14; left column 36 wide with blocks 36×13 r4 + 28×20 r5; right column blocks 70 %×14 r5, 50 %×12 r4, 40 %×12 r4; pulse 1.8 s opacity 1→.4, block fill `neutral/hairline`). AI banner shows a shimmer card of the same height (52). AI processing copy if the suggestion is being computed: **"Takvim kontrol ediliyor"** (from the generic step list "Mail analizi yapılıyor" → "Takvim kontrol ediliyor" → "Öncelikler belirleniyor" → "Brifing hazırlanıyor").
- **Empty day** (no events): generic empty variant — icon 📅, emoji 😌, context **"Bugünkü Program"**, title **"Bugün takvimin oldukça sakin."**, subtitle **"Planlanmış bir toplantın ya da etkinliğin yok."**, action **"Etkinlik Ekle"**, tint `info/soft`. Keep the hour gutter behind it or replace the timeline entirely — canvas decides.
- **No AI suggestion**: hide the banner (no placeholder).
- **No conflict**: hide the footer banner.
- **Calendar permission denied**: full-timeline error variant — 📅, badge **"TAKVİM"**, title **"Takvim izni verilmedi."**, subtitle **"Toplantı hazırlığı ve takvim akışı için takvim erişimine ihtiyacımız var."**, primary **"Ayarlara Git"**, secondary **"Atla"**, tint `info`.
- **Offline**: 📡, badge **"BAĞLANTI"**, **"İnternet bağlantısı yok."**, **"Çevrimiçi olduğunda her şey otomatik olarak güncellenir."**, primary **"Tekrar Dene"**. Cached timeline may still render underneath with a top strip.
- **Sync slow**: ⏱️, badge **"SENKRON"**, **"Senkronizasyon gecikiyor."**, **"Sunucularla bağlantı normalden yavaş. Biraz daha bekleyebilirsin."**, **"Arka Planda Dene"** / **"Tamam"**.
- **AI busy** (suggestion failed): ✨, badge **"AI ANALİZ"**, **"AI şu an meşgul."**, **"Analizler geçici olarak yavaşladı. Birkaç dakika içinde her şey normale dönecek."**, **"Yenile"**.
- **Dark**: bg `dark/bg`, surface `dark/surface`, segment track `dark/surface-2` (prototype bug: active segment stays `#fff` and day numbers stay `#0F0F1A` in dark — use `dark/surface`/`dark/text`), timeline rule `rgba(255,255,255,.08)`, AI blocks = `dark/primary` 16 % fill with dashed `dark/primary-glow` border, conflict banner = `critical` 18 % fill with `dark/critical-text`, avatar unchanged.

### Motion / haptics
- Segment switch 200 ms; date-strip selection 200 ms colour; event `card-press` scale .982/150 ms; sheet slideUp 300 ms; confirmed state auto-dismiss 1800 ms.
- Recommended haptics (none in web proto): selection tick on segment/date; light impact on block tap; success notification on "Onayla".

### Data fields
- `Day { date, isToday, events[], aiSuggestion?, conflict? }`
- `TimelineEvent { id, start, end, durationHours, title, type: 'meeting'|'ai'|'task', platform?, personId?, joinUrl?, source }`
- `AiSlotSuggestion { id, start, end, taskTitle, rationale, relatedMeetingId, line1, line2 }`
- `Conflict { id, title, summary, events[2], suggestedResolution }` (see 24)
- `Commitment` count for the header pill badge (optional).

### i18n keys (suggested)
`plan.title`, `plan.commitments`, `plan.segment.day`, `plan.segment.week`, `plan.days.[sun..sat]`, `plan.ai.line1`, `plan.ai.line2`, `plan.ai.cta`, `plan.block.kicker.ai`, `plan.block.kicker.meeting`, `plan.block.duration`, `plan.conflict.title`, `plan.conflict.body`, `plan.conflict.cta`, `plan.sheet.title`, `plan.sheet.kicker`, `plan.sheet.task`, `plan.sheet.rationale`, `plan.sheet.confirm`, `plan.sheet.changeTime`, `plan.sheet.cancel`, `plan.sheet.done.title`, `plan.sheet.done.body`.

---

## 24. Takvim Çakışması (stack)

### Purpose / placement
"Smart conflict alert": two overlapping calendar events from different providers, an AI-proposed fix, and three resolution options. Reached from the Plan conflict banner "Çöz" (design brief also lists the alert actions **"Seçenekleri Gör"** / **"Yoksay"** — the prototype's banner only implements "Çöz" ≈ Seçenekleri Gör; add **"Yoksay"** as a dismiss affordance on the banner in production).

### Layout, top to bottom
Screen bg `neutral/bg` (hard-coded `#F8F8FC`; no dark support in prototype).

1. **PageHeader** — back chevron + title **"Takvim Çakışması"**.
2. Scroll area padding 20 h / 16 top / 24 bottom.
3. **Warning hero** (`card/priority` critical variant): bg `critical/soft`, radius 16, padding 16, margin-bottom 20, border 1 px `critical/text` 15 %.
   - row gap 12, margin-bottom 12: ⚠️ 32 px; title **"Çakışma Tespit Edildi"** 16/700 −0.02em `critical/text`; sub **"Bugün saat 14:00–15:00"** 12 px `ink/secondary`.
   - two event rows, gap 8; each bg white 80 % (dark: `dark/surface` 80 %), radius 10, padding 10 v / 12 h, row gap 10: icon 20 px; label 13/600 `ink`; meta 11 px `ink/tertiary` `"{time} · {source}"`.

   | icon | label | time | source |
   |---|---|---|---|
   | 📅 | **Müşteri Toplantısı** | **14:00–15:00** | **Google Calendar** |
   | 🏥 | **Doktor Randevusu** | **14:30–15:30** | **Apple Calendar** |

4. **AI suggestion card** (`card/ai-insight`): bg `brand/soft`, radius 16, padding 16, margin-bottom 20, border 1 px `brand/primary` 20 %; kicker row ✨ + **"AI ÖNERİSİ"** 12/700 +0.04em `brand/primary`, margin-bottom 12; body 14 px `ink` lh 1.5: **"Müşteri toplantısını 13:00'e almayı önerebilirim. Mehmet'in takviminde de bu saat uygun görünüyor."** — "13:00'e" is bold.
5. Section kicker **"SEÇENEKLER"** 13/700 +0.04em `ink/tertiary`, margin-bottom 10.
6. **Options list group** (gap 8). Each option is a full-width button: bg `neutral/surface`, radius 14, padding 14 v / 16 h, left-aligned, shadow xs; recommended option border **2 px `brand/primary`**, others 1 px `neutral/hairline`. Content: label 14/600 `ink` margin-bottom 3; sub 12 px `ink/tertiary`; recommended badge top-right **"ÖNERİLEN"** 10/700 `brand/primary` on `brand/soft`, radius 6, padding 2 v / 6 h, margin-left 8, nowrap.

   | label | sub | recommended | prototype action |
   |---|---|---|---|
   | **Müşteri toplantısını 13:00'e al** | **AI önerisi · Takvim güncelleme gerekiyor** | yes | → resolved state |
   | **Doktor randevusunu iptal et** | **Randevu sisteminde değişiklik gerekiyor** | no | **dead** |
   | **Beni hatırlat, kendim çözeyim** | **1 saat sonra hatırlatılır** | no | **dead** |

### Resolved state (full screen, replaces everything incl. header; `animate-scale-in`)
Centred column, bg `neutral/bg`:
- 72×72 circle `success/soft`, ✅ 32 px, margin-bottom 16
- **"Çözüldü!"** `h2` (22/800) `ink` −0.03em, margin-bottom 6
- **"Müşteri toplantısı 13:00'e alındı."** 14 px `ink/secondary`, margin-bottom 24
- button **"Plana Dön"** — bg `brand/primary`, white 15/600, padding 12 v / 28 h, radius 14 → `navigate('plan')` (prototype pushes; production should pop to Plan and clear the conflict banner).

### Interactive elements → production behaviour
- Recommended option: this is a calendar **write action** (move event, notify Mehmet). Prototype resolves instantly; production must either (a) show an inline confirm ("Toplantıyı 13:00'e taşı ve Mehmet'e bildir?") or (b) route through Approval Center (`move-event`). After success: update both providers, dismiss conflict, show resolved state, haptic success.
- "Doktor randevusunu iptal et": open the appointment's source (deep link / email) or a confirm dialog; on confirm, cancel/delete the Apple Calendar event, mark conflict resolved with copy "Doktor randevusu iptal edildi." (proposed, not in proto).
- "Beni hatırlat, kendim çözeyim": create a reminder +1 h (matches Smart Reminder / `set-reminder`), toast "1 saat sonra hatırlatılacak" (proposed), pop back to Plan; banner stays.
- Back chevron: pop.

### States
- **Loading**: hero renders from cached conflict immediately; AI card shows shimmer (3 lines) until suggestion arrives; options list disabled until AI card resolves (recommended flag depends on it).
- **AI unavailable**: hide AI card + "ÖNERİLEN" badge; options still work.
- **Resolution failed** (provider write error): keep options, show error banner "Senkronizasyon gecikiyor." variant with **"Arka Planda Dene"** / **"Tamam"**.
- **Offline**: options that need writes are disabled with the offline error variant copy; "Beni hatırlat" remains available (local).
- **Dark**: bg `dark/bg`; hero = `critical` 18 % on `dark/surface`, title `dark/critical-text`; event rows `dark/surface-2`; AI card `dark/primary` 16 %; options `dark/surface` with hairline `rgba(255,255,255,.08)`, recommended border `dark/primary`; success circle `success` 20 %.

### Data fields
`Conflict { id, date, windowStart, windowEnd, events: [{ id, title, start, end, provider: 'google'|'apple'|'outlook', icon }], aiSuggestion: { text, proposedStart, proposedEnd, targetEventId, counterpartAvailability }, options: [{ id, label, sub, recommended, kind: 'move'|'cancel'|'remind' }] }`.

### i18n keys
`conflict.title`, `conflict.detected`, `conflict.window`, `conflict.ai.kicker`, `conflict.ai.body`, `conflict.options.kicker`, `conflict.option.move.{label,sub}`, `conflict.option.cancel.{label,sub}`, `conflict.option.remind.{label,sub}`, `conflict.recommended`, `conflict.resolved.title`, `conflict.resolved.body`, `conflict.resolved.cta`.

---

## 25. Toplantı Hazırlık / Meeting Prep (stack)

### Purpose / placement
"Çok önemli özel ekran" — the signature pre-meeting brief. Opened from a Plan timeline meeting block, from the Today card "14:30'da Mehmet ile müşteri toplantın var." → **"Hazırlan"**, or from a pre-meeting notification. Contains: hero with countdown, AI talking points, person card, context sections, note capture, and CTAs to start the meeting or go to the post-meeting flow.

### Layout, top to bottom
Screen bg `neutral/bg` (uses `t.bg`).

1. **PageHeader** — back chevron only, no title (frosted default background).
2. **Hero** (full-bleed, brand gradient 135°, padding 16 top / 20 h / 20 bottom):
   - kicker **"TOPLANTIYA HAZIRLAN"** 12/700 +0.05em white 65 %, margin-bottom 6
   - name **"Mehmet Kaya"** `h2` (21/800) white −0.03em, margin-bottom 4
   - **"14:30 · Google Meet"** 14 px white 80 %, margin-bottom 12
   - countdown chip: bg white 20 %, radius 8, padding 4 v / 10 h, **"⏱️ 18 dakika kaldı"** 13/700 white. Live: recompute every minute; at ≤5 min switch chip to `warning` tint; at 0 → "Başladı".
3. Scroll area, padding-bottom 16.
4. **AI key points** (`card/ai-insight`; padding 20 h / 16 top, margin-bottom 16): bg `brand/soft`, radius 16, padding 14 v / 16 h, border 1 px `brand/primary` 20 %.
   - kicker row ✨ 14 px + **"TOPLANTIDA KONUŞMAN GEREKEN 3 ŞEY"** 12/700 +0.04em `brand/primary`, margin-bottom 12
   - three rows gap 8: numbered disc 22×22 bg `brand/primary`, digit 11/700 white; text 13/500 `ink` lh 1.4:
     1. **Revize fiyat teklifi — güncellenen rakamları paylaş**
     2. **Teslim tarihi — kesin tarih belirle**
     3. **Sözleşme maddesi #7 — müzakere et**
5. **Person card** (`card/person`; padding 20 h, margin-bottom 12): full-width button, bg `neutral/surface`, radius 14, padding 13 v / 16 h, shadow xs, row gap 12:
   - avatar 40×40 circle `brand/soft`, initials **"MK"** 16/700 `brand/primary`
   - name **"Mehmet Kaya"** 14/700 `ink`; meta **"Son iletişim: 4 gün önce · 3 açık konu"** 12 px `ink/tertiary`
   - chevron-right 14 px `ink` 30 %
   - → `navigate('person-intelligence')` (pass `personId`).
6. **Context sections** (padding 20 h; column gap 10). Each: bg `neutral/surface`, radius 14, padding 14 v / 16 h, shadow xs; header row icon + title **uppercased** 12/700 +0.03em `ink/tertiary`, margin-bottom 8; body 13 px `ink` lh 1.55, `white-space: pre-line`.

   | icon | title (source) | rendered header | body |
   |---|---|---|---|
   | 🎯 | Toplantının Amacı | **TOPLANTININ AMACI** | **Revize fiyat teklifinin son değerlendirmesi ve sözleşme şartlarının görüşülmesi.** |
   | 🕐 | Son Görüşmeniz | **SON GÖRÜŞMENİZ** | **Son görüşme 4 gün önce. Fiyat teklifi tartışıldı, Mehmet bazı revizyonlar istedi.** |
   | ✉️ | Son E-postalar | **SON E-POSTALAR** + right-aligned link **"Aç →"** 11/600 `brand/primary` | **2 mail: "Revize fiyat teklifi - acil" (bugün 08:42) ve "Teklif üzerine son değerlendirme" (bugün 10:20).** |
   | 📋 | Açık Konular | **AÇIK KONULAR** | **• Revize fiyat teklifi gönderilmedi**<br>**• Teslim tarihi netleşmedi**<br>**• Sözleşme maddesi #7 tartışılmadı** |

   - Only "Son E-postalar" is tappable (whole card) → `navigate('email-detail')`. Production: list each mail as its own row and open the tapped one.
   - **Uppercasing bug:** JS `toUpperCase()` turns "Görüşmeniz" into "GÖRÜŞMENIZ" (dotless). Use `toLocaleUpperCase('tr-TR')` or store the caps strings as separate i18n values.
   - Design brief lists three more optional sections not built: **"Senden beklenenler"**, **"Senin beklediklerin"**, **"İlgili dosyalar varsa referans"** — render only when data exists.
7. **Note capture** (padding 20 h, margin-top 16):
   - closed: full-width button, padding 13, radius 14, bg `neutral/surface`, border **1.5 px dashed** `neutral/hairline`, row gap 8: 📝 16 px + **"Not Al…"** 14/500 `ink/tertiary`.
   - open: container bg `neutral/surface`, radius 14, padding 12 v / 14 h, border 1.5 px solid `brand/primary`; multiline text input autofocus, placeholder **"Toplantı notlarını buraya yaz…"**, 14 px `ink` lh 1.6, min-height 100, no resize.
   - Notes are local state only in the prototype (never saved). Production: autosave to `meeting.notes` (debounced), carry into Toplantı Sonrası and Person Intelligence. Redesign brief §15: "Voice veya text note eklenebilsin" → add a mic button inside the open state (reuse VoiceAssistant capture).
8. **CTA row** (padding 20 h, margin-top 16, gap 12):
   - **"2 Dk Özet"** — flex 1, padding 14, radius 14, brand gradient, white 14/700, shadow `brand/primary` 25 % y4 b12 → prototype navigates to `post-meeting` (**mis-wired**; design brief calls this "2 Dakikalık Özet": a 2-minute read/listen summary of the brief). Production: open a "2 Dakikalık Özet" sheet/page (TTS-able summary of sections 4–6); keep Post Meeting reachable via the meeting-end trigger and via "Toplantıyı Bitir" (see below).
   - **"Toplantıyı Başlat"** — flex 1, padding 14, radius 14, bg `neutral/surface-2`, `ink/secondary` 14/600 → **Meet handoff** state.

### Meet handoff state (full-screen modal state, replaces the whole screen; no header)
bg `dark/bg` (`#0F0F1A`; or `gradient/night`), content centred, padding 0 40:
- 72×72 tile, radius 20, brand gradient, 📹 32 px (`videocam`), margin-bottom 20
- **"Google Meet açılıyor…"** `h2` (20/800) white −0.03em, margin-bottom 8 (platform name comes from `meeting.platform`: "Zoom açılıyor…", "Teams açılıyor…")
- **"Mehmet Kaya ile toplantın başlamak üzere. Hazır olduğunda uygulamaya geç."** 14 px white 50 % lh 1.5, margin-bottom 32
- row gap 10: **"Geri Dön"** flex 1, padding 13, radius 14, bg white 10 %, white 60 % 14/600 → back to prep; **"Meet'i Aç ↗"** flex 2, brand gradient, white 14/700 → **dead in prototype**. Production: `Linking.openURL(meeting.joinUrl)` (Meet / Zoom / Teams deep link, fall back to https), then after return show a "Toplantı devam ediyor" chip on Plan/Today and, when `end` passes, trigger Toplantı Sonrası. Label per platform: "Meet'i Aç ↗" / "Zoom'u Aç ↗" / "Teams'i Aç ↗".

### Interactive elements summary

| Element | Prototype | Production |
|---|---|---|
| Back chevron | pop | same |
| Person card | → `person-intelligence` | pass id |
| "Son E-postalar" card / "Aç →" | → `email-detail` | per-mail rows, pass emailId |
| Other section cards | inert | inert (long-press copy optional) |
| "Not Al…" → textarea | local only | persist, mic button |
| "2 Dk Özet" | → `post-meeting` (mis-wired) | 2-minute summary; add explicit **"Toplantıyı Bitir"**/auto-trigger for Post Meeting |
| "Toplantıyı Başlat" | handoff state | same + deep link |
| Handoff "Geri Dön" | back to prep | same |
| Handoff "Meet'i Aç ↗" | **dead** | open join URL |

### States
- **Loading**: hero renders from calendar event immediately (name, time, platform, countdown); AI key points card → shimmer with 3 lines + kicker; sections → 4× card skeleton (title 40 %×12, body 90 %×13 + 70 %×13); person card → `MeetingCardSkeleton` geometry. AI processing copy while generating: "Mail analizi yapılıyor" → "Takvim kontrol ediliyor" → "Öncelikler belirleniyor".
- **No history with this person** (first meeting): AI card shows generic points; "Son Görüşmeniz" hidden; person meta "İlk görüşme" (proposed copy); "Son E-postalar" hidden if none.
- **AI busy**: replace key-points card with inline error ✨ **"AI şu an meşgul."** / **"Analizler geçici olarak yavaşladı. Birkaç dakika içinde her şey normale dönecek."** / **"Yenile"**; rest of the screen still usable.
- **Calendar permission revoked** while open: full-screen 📅 **"Takvim izni verilmedi."** variant (see 23).
- **Mail not connected**: sections from mail hidden; show generic empty **"Mailini bağla."** / **"Gmail veya Outlook bağlayarak önemli konuları burada görebilirsin."** / **"Hesap Bağla"** as a card in place of "Son E-postalar".
- **Offline**: cached brief renders with a top strip 📡 **"İnternet bağlantısı yok."**; "Toplantıyı Başlat" still opens the handoff (deep link works if the app is installed).
- **Meeting already started / ended**: countdown chip → "Başladı" / "Bitti"; primary CTA becomes "Toplantı Sonrası" → 26.
- **Dark**: bg `dark/bg`; hero gradient unchanged (white text); AI card `dark/primary` 16 % with `dark/primary-glow` kicker; surfaces `dark/surface`; dashed note border `rgba(255,255,255,.16)`; handoff already dark.

### Motion / haptics
Hero countdown ticks; note field expands in place (150 ms height); `card-press` on person/mail cards; handoff cross-fade 250 ms (`animate-scale-in`); haptic light on "Toplantıyı Başlat", success when the join URL opens.

### Data fields
`MeetingPrep { meetingId, title ("Müşteri Değerlendirme Toplantısı" in mockMeetings — Plan shows "Mehmet Kaya · Müşteri Toplantısı"; unify), person { id, name, initials, lastContact, openLoops }, start (note: Plan block says 14:00, prep hero says 14:30 — unify), durationMin (60), platform, joinUrl, minutesLeft, purpose, lastMeetingSummary, relatedEmails [{ id, subject, receivedAt }], openTopics [string], talkingPoints [3 strings], expectationsFromYou?, expectationsFromThem?, files?, notes }`.

### i18n keys
`prep.kicker`, `prep.platformLine`, `prep.countdown`, `prep.ai.kicker`, `prep.person.meta`, `prep.section.purpose`, `prep.section.lastMeeting`, `prep.section.emails`, `prep.section.emails.open`, `prep.section.openTopics`, `prep.note.cta`, `prep.note.placeholder`, `prep.cta.summary`, `prep.cta.start`, `prep.handoff.title`, `prep.handoff.body`, `prep.handoff.back`, `prep.handoff.open`.

---

## 26. Toplantı Sonrası / Post Meeting (stack)

### Purpose / placement
Post-meeting capture: confirm the meeting ended, ask for a follow-up in natural language, let AI turn it into a commitment, save. Reached in the prototype from Meeting Prep "2 Dk Özet"; intended trigger is the meeting end (calendar end time / notification tap) and the final step of FLOW 3.

### Layout, top to bottom
Screen bg `neutral/bg` (hard-coded light).

1. **Custom header** (not PageHeader): padding 20 h / 12 v, bottom border hairline-light; left back button 36×36 circle bg `neutral/surface-2`, chevron 18 px `ink` → `navigate('plan')` (prototype pushes; production: pop); centre title **"Toplantı Sonrası"** 15/600 `ink`; right 36 px spacer for symmetry.
2. Scroll area padding 20 h / 24 top / 24 bottom.
3. **Confirmation header** (centred, margin-bottom 24): 60×60 circle `success/soft`, ✅ 28 px, margin-bottom 12; `h1` (22/800) **"Toplantın bitti."** `ink` −0.03em, margin-bottom 6; meta 14 px `ink/secondary` **"Mehmet Kaya · Müşteri Toplantısı · 60 dk"**.
4. **Capture card**: bg `neutral/surface`, radius 16, padding 16, shadow `0 1px 4px rgba(15,15,26,.05)`, margin-bottom 20:
   - prompt **"Takip edilecek bir konu var mı?"** 14/700 `ink`, margin-bottom 12
   - multiline input: bg `neutral/bg`, border 1.5 px `neutral/hairline`, radius 12, padding 12, 14 px `ink` lh 1.55, min-height 90, placeholder (with the quotes) **"Mehmet'e yarın teklif göndereceğim."**
   - Design brief: "Kullanıcı elle veya sesle" → add a mic button (bottom-right of the field) in production.
5. **AI extraction card** (`card/ai-insight`; appears with `animate-fade-in` as soon as the input is non-blank): bg `brand/soft`, radius 14, padding 14 v / 16 h, margin-bottom 20, border 1 px `brand/primary` 20 %:
   - kicker **"✨ YENİ TAAHHÜT"** 11/700 +0.04em `brand/primary`, margin-bottom 8
   - commitment **"Mehmet'e teklif gönder"** 15/600 `ink`, margin-bottom 4
   - **"Yarın · Taahhütler listesine eklenecek"** 12 px `ink/tertiary`
   - **Prototype is static** — the card ignores the typed text. Production: debounce 600 ms, call extraction → `{ text, toPerson, dueDate }`; show a shimmer version of this card while extracting; if nothing extractable, show "Taahhüt bulunamadı — yine de not olarak kaydet" (proposed copy); allow tapping the card to edit person/date.
6. **"Kaydet"** — full width, padding 15, radius 16, 15/700 −0.02em; enabled: brand gradient, white; disabled (blank input): bg `neutral/hairline`, `ink/tertiary`, `cursor: not-allowed`. Enabled → saved state.

### Saved state (full screen, replaces everything; `animate-scale-in`)
Centred, bg `neutral/bg`:
- 72×72 circle `brand/soft` with check SVG 32 px stroke `brand/primary` 3 px (prototype draws the check itself; use `check` icon), margin-bottom 16
- **"Taahhüt Kaydedildi"** `h2` (22/800) `ink`, margin-bottom 6
- **"Mehmet'e teklif gönder"** 14 px `ink/secondary`, margin-bottom 8
- **"Yarın hatırlatılacak"** 12 px `ink/tertiary`, margin-bottom 28
- **"Bugüne Dön"** — bg `brand/primary`, white 15/600, padding 12 v / 28 h, radius 14 → `navigate('today')` (production: reset stack to Today tab).

### Interactive elements

| Element | Prototype | Production |
|---|---|---|
| Back | → `plan` (push) | pop; if opened from a notification, go to Plan |
| Text input | local state | + voice input; autosave draft |
| AI card | static, non-interactive | tap to edit extracted fields |
| "Kaydet" | saved state when non-blank | create `Commitment` (status pending, source `meeting:{id}`), schedule reminder (`set-reminder` — a write action; the save button is the consent), append notes from Meeting Prep, haptic success |
| "Bugüne Dön" | → `today` | same |
| (missing) "Atla" / "Takip yok" | — | add a tertiary "Takip edilecek konu yok" link under Kaydet so the flow can end without input |

### States
- **Loading**: none needed (all local) except the AI card shimmer during extraction.
- **Extraction failed / AI busy**: keep input, replace AI card with inline ✨ **"AI şu an meşgul."** + **"Yenile"**; Kaydet still saves the raw text as a note.
- **Offline**: save locally, queue reminder; saved-state subline "Çevrimiçi olduğunda senkronize edilecek" (proposed).
- **Dark**: bg `dark/bg`, capture card `dark/surface`, input bg `dark/surface-2` with hairline `rgba(255,255,255,.08)`, AI card `dark/primary` 16 %, disabled Kaydet `dark/surface-2` + `dark/tertiary`, success/brand circles at 20 % alpha.

### Data fields
`PostMeeting { meetingId, personName, meetingTitle, durationMin, rawInput, extracted: { commitmentText, toPersonId, toName, dueDate, dueLabel ("Yarın") }, notesFromPrep }` → creates `Commitment` (see 22).

### i18n keys
`post.title`, `post.ended`, `post.meta`, `post.prompt`, `post.placeholder`, `post.ai.kicker`, `post.ai.dueLine`, `post.save`, `post.saved.title`, `post.saved.reminder`, `post.saved.cta`.

---

## 22. Taahhütler / Commitment Tracker (stack)

### Purpose / placement
List of promises the user made (detected by AI from e-mails and meetings, or captured in 26) with status, recipient, date, source and actions. Opened from the Plan header pill "Taahhütler". Also the destination of "Taahhütler listesine eklenecek" in 26.

### Layout, top to bottom
Screen bg `neutral/bg` (hard-coded light).

1. **PageHeader** — back chevron + title **"Taahhütler"**.
2. **Summary strip** (non-scrolling): padding 20 h / 12 v, bg `neutral/surface`, bottom border hairline-light; text 13 px `ink/secondary` **"AI e-postalarından tespit ettiği {n} açık taahhüt var."** where `n` = items with status ≠ done (initially **3**). Use ICU plural; note the source wording says "e-postalarından" although one item comes from a Zoom meeting — production copy: "AI'ın tespit ettiği {n} açık taahhüt var." (proposed) or keep verbatim.
3. Scroll list, padding 20 h / 16 top / 16 bottom, column gap 10. Cards enter with `animate-fade-in` (300 ms, translateY 6→0) staggered `index × 50 ms`, initial opacity 0.
4. **Commitment card** (`card/priority`-style list card): bg `neutral/surface`, radius 16, padding 16, shadow `0 1px 4px rgba(15,15,26,.06)`.
   - Row 1 (align start, margin-bottom 8): quote **"{commitment}"** — rendered with literal double quotes — 14/600 `ink` lh 1.4 −0.01em, flex 1; **status pill** 10/700 radius 6 padding 2 v / 7 h, margin-left 8, nowrap:

     | status | label | fill | text |
     |---|---|---|---|
     | pending | **Bekliyor** | `warning/soft` | `warning/text` |
     | done | **Tamamlandı** | `success/soft` | `success/text` |
     | overdue | **Gecikti** | `critical/soft` | `critical/text` |

   - Row 2 (gap 16, margin-bottom 12): two labelled values — label 10/600 +0.04em `ink/tertiary` (**"KİME"**, **"TARİH"**), value 12/500 `ink`; the date value is `critical/text` when overdue.
   - Row 3: **"Kaynak: {source}"** 11 px `ink/tertiary`, margin-bottom 12.
   - Row 4 (only when status ≠ done; gap 8; buttons 12/600, radius 8, padding 7 v, no border):
     - **"Tamamlandı"** flex 2 — `success/text` on `success/soft` → `markDone(id)`: status → done, pill turns green, action row disappears, summary count decrements.
     - **"Ertele"** flex 1 — `warning/text` on `warning/soft` → opens **Ertele** sheet for that item.
     - **"Kaynağı Gör"** flex 1 — `ink/secondary` on `neutral/surface-2` → `navigate('email-detail')` (generic; production must open the actual source: email id, or meeting recording/notes for `Zoom toplantısı`).

   Rows (`mockCommitments`, verbatim):

   | id | commitment | to (KİME) | source (Kaynak) | date (TARİH) | status |
   |---|---|---|---|---|---|
   | 1 | **Cuma teklif göndereceğim.** | **Mehmet Kaya** | **Gmail · 2 Eylül** | **Cuma, 6 Eylül** | pending |
   | 2 | **Pazartesi seni arayacağım.** | **Ahmet Yılmaz** | **Gmail · 1 Eylül** | **Pazartesi, 8 Eylül** | pending |
   | 3 | **Dosyayı yarın paylaşırım.** | **Fatma Şahin** | **Gmail · 4 Eylül** | **Bugün** | overdue |
   | 4 | **Sunumu hazırlayıp göndereceğim.** | **Can Öztürk** | **Zoom toplantısı · 3 Eylül** | **Perşembe, 4 Eylül** | done |

   Ordering in prototype = insertion order. Production: overdue first, then pending by due date, done last (collapsed group "Tamamlananlar" optional).

### Ertele sheet (BottomSheet, title **"Ertele"**)
Content padding 20 h / 20 bottom.

**Default state**
- prompt **"Yeni bir tarih seç:"** 14 px `ink/secondary`, margin-bottom 16
- option list (column gap 8, margin-bottom 16): full-width buttons, padding 12 v / 14 h, radius 12, 14/500 `ink`, left-aligned; selected: bg `brand/soft`, border 1.5 px `brand/primary` 40 %; unselected: bg `neutral/bg`, border 1.5 px `neutral/hairline`. Options in order: **"Yarın"**, **"2 gün sonra"**, **"Önümüzdeki hafta"**, **"Özel tarih"**. The first three set the selection; **"Özel tarih" has no handler (dead as a button)** — the native date input below is what actually provides a custom date.
- native `<input type="date">`: full width, padding 12, radius 12, border 1.5 px `neutral/hairline`, 14 px `ink`, bg `neutral/surface`; shows a value only when the selection is an ISO string. Production: tapping "Özel tarih" should open the platform date picker (RN `DateTimePicker`) and, once picked, show the formatted date as the option's subtitle; remove the always-visible raw input.
- **"Kaydet"** — full width, padding 14, radius 14, 15/700; enabled: brand gradient white; disabled (no selection): bg `neutral/hairline`, `ink/tertiary`, not-allowed → `confirmReschedule()`.

**Rescheduled state** (replaces content for **1400 ms**, then sheet closes and item updates): centred column, padding 32 v: 64×64 circle `success/soft`, ✅ 28 px, margin-bottom 12; **"Ertelendi"** 15/700 `ink`.

After close the item gets `date = selected label` (or **"Yarın"** fallback) and `status = pending` (an overdue item becomes pending). **Bug to fix:** an ISO date from the picker is written verbatim ("2026-09-10") — format as "Çarşamba, 10 Eylül" via `tr-TR`.

### Interactive elements

| Element | Prototype | Production |
|---|---|---|
| Back | pop | same |
| "Tamamlandı" | local status flip | persist; optional undo toast "Geri Al" (proposed); haptic success |
| "Ertele" | opens sheet | same; write reminder date |
| "Kaynağı Gör" | → `email-detail` (no id) | open the real source by `sourceType/sourceRef` |
| Card body tap | inert | open commitment detail (edit text/person/date, delete) — proposed |
| Sheet options | select | same |
| "Özel tarih" | **dead** | open date picker |
| Sheet "Kaydet" | rescheduled → auto-close 1.4 s | same |
| Backdrop / handle | close | + swipe down |
| (missing) swipe actions | — | optional swipe-right = Tamamlandı, swipe-left = Ertele, mirroring the priority-card pattern |

### States
- **Loading**: summary strip shows a 60 %×13 skeleton line; list shows 3 card skeletons (row 80 %×14, two 30 %×10 + 40 %×12 pairs, 50 %×11, three button blocks 8 px radius).
- **Empty** (no open commitments): nearest generic variant — 🔄 / 🎉, context **"Takip Listesi"**, title **"Bekleyen takip yok."**, subtitle **"Tüm açık konular kapatıldı."**, tint `brand/soft`. Summary strip copy becomes "…0 açık taahhüt var." or hide the strip.
- **Not detected yet / mail not connected**: 📬 **"Mailini bağla."** / **"Gmail veya Outlook bağlayarak önemli konuları burada görebilirsin."** / **"Hesap Bağla"**.
- **Offline**: list from cache; actions queue; strip shows 📡 **"İnternet bağlantısı yok."** compact.
- **Error loading**: ✨ **"AI şu an meşgul."** / **"Yenile"** in place of the list.
- **Dark**: bg `dark/bg`; strip and cards `dark/surface`; pills → status colour at 18 % fill with `dark/{warning,success,critical}-text`; action buttons same treatment; sheet `dark/surface`, unselected options `dark/surface-2`, selected `dark/primary` 16 % with `dark/primary` border.

### Motion / haptics
Card stagger 50 ms; status pill colour cross-fade 200 ms on completion; sheet slideUp 300 ms; "Ertelendi" hold 1400 ms. Haptics (recommended): success on Tamamlandı and Ertele confirm; selection on option tap.

### Data fields (domain model)
`Commitment { id, text, toPersonId?, toName, sourceType: 'gmail'|'outlook'|'zoom'|'meet'|'teams'|'manual'|'post-meeting', sourceRef (emailId | meetingId), sourceLabel ("Gmail · 2 Eylül"), detectedAt, dueDate (ISO), dueLabel ("Cuma, 6 Eylül" | "Bugün"), status: 'pending'|'done'|'overdue', remindAt?, completedAt?, rescheduledFrom? }`. `overdue` is derived (`dueDate < today && status !== 'done'`), not stored.

### i18n keys
`commitments.title`, `commitments.summary` (plural), `commitments.status.pending`, `commitments.status.done`, `commitments.status.overdue`, `commitments.label.to`, `commitments.label.date`, `commitments.source`, `commitments.action.done`, `commitments.action.postpone`, `commitments.action.viewSource`, `commitments.sheet.title`, `commitments.sheet.prompt`, `commitments.sheet.option.tomorrow`, `commitments.sheet.option.twoDays`, `commitments.sheet.option.nextWeek`, `commitments.sheet.option.custom`, `commitments.sheet.save`, `commitments.sheet.done`.

---

## Consolidated: dead / mis-wired in prototype

| Screen | Control | Prototype | Required behaviour |
|---|---|---|---|
| 23 Plan | Segment **"Hafta"** | changes highlight only | week view |
| 23 Plan | Date strip days | no handler | select day, reload timeline |
| 23 Plan | AI timeline block ("Teklif Hazırlama") | pressable look, no handler | task detail / edit |
| 23 Plan sheet | **"Saati Değiştir"** | no handler | time-range picker |
| 23 Plan sheet | **"Onayla"** | shows success but never adds the block (`timelineHasTask` unused) | insert AI block on tomorrow's timeline (QA §6) |
| 24 Çakışma | **"Doktor randevusunu iptal et"** | no handler | cancel flow with confirm |
| 24 Çakışma | **"Beni hatırlat, kendim çözeyim"** | no handler | +1 h reminder, pop |
| 24 Çakışma | **"Müşteri toplantısını 13:00'e al"** | resolves instantly | write action → confirm/Approval Center, then resolve |
| 24 Çakışma | Banner **"Yoksay"** (from brief) | not built | dismiss banner |
| 25 Prep | **"2 Dk Özet"** | navigates to Post Meeting | 2-minute summary; Post Meeting via meeting end / "Toplantıyı Bitir" |
| 25 Prep | **"Meet'i Aç ↗"** | no handler | `Linking.openURL(joinUrl)` |
| 25 Prep | Note textarea | never persisted | autosave + voice |
| 25 Prep | Sections other than "Son E-postalar" | inert | inert (OK) |
| 26 Post | AI card | static, ignores input | real extraction |
| 26 Post | Back | pushes `plan` | pop |
| 26 Post | "Bugüne Dön" | pushes `today` | reset to Today tab |
| 22 Taahhütler | **"Özel tarih"** option | no handler | date picker |
| 22 Taahhütler | **"Kaynağı Gör"** | generic `email-detail` | open actual source |
| 22 Taahhütler | ISO date written raw | formatting bug | `tr-TR` format |

## Consolidated: prototype inconsistencies to resolve with the canvas

1. Meeting time: Plan block at **14:00** (1 h) vs Prep hero **"14:30 · Google Meet"** vs mockMeetings `time: '14:30', duration: '60 dk'` vs Conflict "Müşteri Toplantısı 14:00–15:00". Pick one source of truth (calendar event).
2. Meeting title: "Mehmet Kaya · Müşteri Toplantısı" (Plan, Post) vs "Müşteri Değerlendirme Toplantısı" (mock) vs "Müşteri Toplantısı" (Conflict).
3. Date strip: hard-coded "Paz…Cmt" with dates 1–7 and today = "Cmt 7", while commitments reference "Cuma, 6 Eylül" / "Perşembe, 4 Eylül" — must be computed.
4. Duration formatting "1.5sa" → "1,5 sa".
5. Turkish uppercasing of section titles (dotless-i bug).
6. Three screens are hard-coded light; token them for dark.
7. Sheet radius 24 vs token radii (20/28) — canvas decides.
8. Brief §25 lists extra Prep sections (Senden beklenenler / Senin beklediklerin / İlgili dosyalar) not in the build.
9. Summary strip says "e-postalarından" though sources include meetings.
