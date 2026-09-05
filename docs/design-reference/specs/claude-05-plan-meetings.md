# 05 · Plan ve Toplantılar — Implementation Spec

Source of truth: Claude Design canvas `05 Plan ve Toplantilar.dc.html` (8 artboards, all 390×844 iOS frames). This document transcribes every artboard, every visible Turkish string, every interactive element, and the trailing `<script type="text/x-dc">` data arrays (`PREP`, `DAY`, `WEEK`, and the derived `days / daysDark / day / dayDark / week / bars` render values). Engineers should not need the raw HTML.

Conventions used below:
- Token names follow the project palette (`brand/primary`, `ink/secondary`, …). Where the prototype uses a colour that has **no token**, it is written as `raw #HEX` with a proposed token name so it can be added to the theme.
- Sizes are in dp/pt exactly as drawn on the 390-wide frame.
- Strings in `code` are verbatim copy and become i18n keys. Dynamic parts are marked `{n}`.
- "Design note" = the author's caption under the artboard (transcribed verbatim, in Turkish).
- "Dead in prototype" = drawn as a static element with no behaviour; engineers must wire real behaviour. **This canvas has no JavaScript click handlers at all — every control is static — so every interactive element in this file is dead in the prototype.** The per-screen lists say what each one must do.
- "Inferred" = not drawn in the prototype; a recommendation so the engineer does not have to guess. Confirm with design if in doubt.

---

## 0. Page overview, navigation map and design principles

Canvas title: `05 · Plan ve Toplantılar`

Author's page statement (verbatim):

> Plan takvimi göstermez, anlar. Zaman çizelgesi tek sütun; etkinlik, AI görev bloğu (kesik çerçeve) ve yaşam etkinliği (sıcak yüzey) üç ayrı yüzeyle ayrılır; sol renk şeridi kullanılmaz. Toplantı hazırlığı ürünün imza ekranıdır: koyu “3 şey” kartı her zaman ilk görünen öğedir.

Key rules that fall out of that statement (engineers must respect these):
1. **No left colour stripe** on timeline items. Item type is communicated purely by surface (background + border), never by a leading accent bar.
2. **Three surfaces** on the timeline: `event` (white surface), `ai` (dashed indigo frame, labelled `Önerilen`), `life` (warm cream surface). A fourth pseudo-type `gap` (transparent, dashed hairline) labels free time explicitly — "boşluk da bilgidir" (a gap is information too).
3. **Meeting prep is the signature screen.** The dark "3 şey" card must be the first thing visible above the fold, on every device size. Do not put anything scrollable above it except the header and the person row.
4. Week view is **not a grid**; it is a density story (stacked bars) plus intelligence cards.
5. Every intelligence card has **at most 2 actions**.
6. Resolutions are **never auto-applied**; the user's choice is submitted for confirmation (`Seçtiğin çözüm onayına sunulur, otomatik uygulanmaz.`).

### 0.1 Navigation graph

```
MainTabs
 └─ Plan tab (tab 3 of 4: Bugün / Akış / Plan / Asistan)
     ├─ 5.1  Plan/Day            (tab root, segmented "Gün" selected)      — light
     ├─ 5.1D Plan/Day            (same screen, dark theme)
     ├─ 5.2  Plan/Week           (tab root, segmented "Hafta" selected)
     │         └─ insight card "Seçenekleri Gör" → 5.3
     ├─ 5.3  Plan/ConflictDetail (push, back arrow) 
     │         └─ Sheet: ConflictResolution  (bottom sheet, opens automatically on entry)
     ├─ 5.4  Meeting/Prep        (push from timeline row, from 5.2 "Hazırlığı Buraya Koy",
     │                             from Bugün card/calendar, or from the T-20min notification) — light
     ├─ 5.5  Meeting/Prep        (same screen, dark theme)
     │         ├─ "2 Dakikalık Özeti Oku" → 5.6
     │         └─ "Not Al"                → 5.7 (keyboard mode) [inferred]
     ├─ 5.6  Meeting/Summary     (modal, full-screen, close "×", editorial paper surface)
     └─ 5.7  Meeting/PostCapture (modal, full-screen, close "×"; opened from the
                                   T+1min silent notification or from the meeting itself)
```

Tab bar visibility: 5.1, 5.1D, 5.2 show the tab bar. 5.3, 5.4, 5.5, 5.6, 5.7 **hide** the tab bar (they are pushed/modal detail screens; the prototype draws no tab bar on them and their bottom area is either a sheet, a sticky CTA, or a plain home indicator).

### 0.2 Example-data timeline (so engineers understand the fixture story)

All artboards tell one story around the customer **Mehmet Yılmaz**:
- Timeline (5.1) shows today's day with `14:30 Mehmet ile müşteri toplantısı` and an AI-suggested `16:00 Teklif hazırlama` block.
- Week view (5.2) shows a busy Wednesday and a conflict on `Çarşamba 14:00 / 14:30`.
- Conflict detail (5.3) is `ÇARŞAMBA · 10 EYLÜL`, 14:00 customer meeting vs 14:30 doctor.
- Prep (5.4/5.5) is at 14:12, 18 minutes before the 14:30 meeting.
- Summary (5.6) is at 14:13.
- Post-capture (5.7) is at 15:31, one minute after the meeting ended 15:30.

Note on fixture inconsistencies (do not replicate as logic): the 5.1 day strip marks Friday (`Cum`) as today with day numbers `1..7`, while 5.2 marks Saturday (`Cmt`) as today for `7–13 EYLÜL`. These are placeholders; real day-of-month and today come from the device clock.

---

## 1. Shared chrome and components (used across this canvas)

### 1.1 Device frame (design only — not app UI)
- 390×844, corner radius 44. Status bar height 54, content bottom-aligned with 8 bottom padding: time on the left 15/600 (`9:41`, `21:14`, `14:12`, `14:13`, `15:31` per artboard), icons `signal_cellular_alt`, `wifi`, `battery_full` (Material Symbols Rounded, 17).
- Home indicator 134×5, radius 3, 8 from bottom; `rgba(27,25,23,.25)` on light, `rgba(255,255,255,.4)` on dark.
- Real app: use safe-area insets. Bottom paddings of 44 in the prototype = safe-area bottom + ~10; bottom paddings of 28 inside the tab bar = safe-area bottom.

### 1.2 Screen backgrounds
- Light app screens (5.1, 5.2, 5.3, 5.4, 5.7): `neutral/bg` #F5F4F0.
- Dark app screens (5.1D, 5.5): `dark/bg` #141311, text `dark/text` #F2F0EB.
- Reading view (5.6): `editorial/paper` #FBFAF7.

### 1.3 Tab-root header (5.1, 5.1D, 5.2)
- Content column padding `14 20 0`, vertical gap 16 between blocks.
- Row: title `Plan` — h1 28/34 600, letter-spacing -0.02em, `ink` (light) / `dark/text` (dark). Right: **segmented control** (see 1.4).

### 1.4 Segmented control `Gün | Hafta`
- Container: pill radius 999, padding 3, bg `neutral/hairline` #E9E7E1 (light) / `dark/surface-2` rgba(255,255,255,.08) (dark). Font 13/600.
- Segment: height 30, padding 0 14, radius 999.
  - Selected (light): bg `neutral/surface` #FFF, text `ink`, shadow `0 1px 3px rgba(27,25,23,.12)`.
  - Unselected (light): transparent, text `ink/secondary` #6B6860.
  - Selected (dark): bg `dark/text` #F2F0EB, text `dark/bg` #141311, no shadow (the "inverted" rule).
  - Unselected (dark): transparent, text `dark/secondary` #A39F96.
- Labels: `Gün`, `Hafta`. Selecting switches between 5.1 and 5.2 in place (same tab root, no push). Inferred motion: 200 ms cross-fade of content + selected-thumb slide; light haptic `selection` on change.

### 1.5 Bottom tab bar (5.1, 5.1D, 5.2)
- Sticky bottom, height 90, padding `8 8 28`, `backdrop-filter: blur(20px)`.
  - Light: bg `rgba(255,255,255,.92)`, border-top `1px solid rgba(27,25,23,.06)`.
  - Dark: bg `rgba(20,19,17,.92)`, border-top `1px solid rgba(255,255,255,.08)`.
- 4 equal items, column, gap 3, label 11/500. Icon 26.
  - `sunny` `Bugün`
  - `dynamic_feed` `Akış`
  - `calendar_today` `Plan` — **active** on this canvas: icon `FILL 1`, colour `brand/primary` (light) / `brand/dark-glow` #A9AAF5 (dark).
  - `auto_awesome` `Asistan`
  - Inactive colour: `ink/tertiary` #9B978E (light) / `dark/tertiary` #7A776F (dark).
- Home indicator overlays inside the bar.

### 1.6 Detail-screen header (5.3, 5.4, 5.5, 5.6, 5.7)
- Row, space-between, 3 slots.
- Left: 36×36 circle button. Light: bg `neutral/surface`, shadow `0 1px 2px rgba(27,25,23,.08)`. Dark: bg `dark/surface` #1F1E1B, ring `0 0 0 1px rgba(255,255,255,.08)`. Icon 20: `arrow_back` (push screens 5.3/5.4/5.5) or `close` (modal screens 5.6/5.7).
- Centre: kicker 12/600, letter-spacing 0.08em, `ink/tertiary` (light) / `dark/tertiary` (dark). Uppercase.
- Right: either an empty 36 spacer (5.3, 5.7), a countdown pill (5.4/5.5), or a second 36 circle button (5.6 `headphones`).

### 1.7 Card surfaces
- **Card/elevated (light)**: bg `neutral/surface`, shadow `0 1px 2px rgba(27,25,23,.04), 0 6px 20px rgba(27,25,23,.05)`. Radius 16 (insight rows), 18 (list groups), 20 (hero / chart / transcript / commitments).
- **Card/elevated (dark)**: bg `dark/surface` #1F1E1B, ring `0 0 0 1px rgba(255,255,255,.06)` instead of shadow.
- **Hero AI card ("card/ai-insight hero")**: radius 20, padding 16.
  - Light bg: `radial-gradient(140% 100% at 0% 0%, #E4E4FA 0%, #FFFFFF 60%)` — `raw #E4E4FA`, propose token `brand/glow-tint` (a shade between `brand/soft` #EDEDFC and `brand/dark-glow`). Shadow as card/elevated.
  - Dark bg: `radial-gradient(140% 100% at 0% 0%, rgba(133,134,242,.28) 0%, #1F1E1B 60%)` (= `dark/primary` @28% into `dark/surface`), ring `0 0 0 1px rgba(255,255,255,.06)`.
  - Kicker: `auto_awesome` icon 16 with `FILL 1` + uppercase label 12/600, letter-spacing 0.06em, colour `brand/primary` (light) / `brand/dark-glow` #A9AAF5 (dark).
- **Insight row card ("card/ai-insight compact")**: radius 16, padding `14 16`, row, gap 12, align-start. Leading icon 20 whose colour carries meaning (see 5.2). Title 15/600 -0.01em `ink`; body 13/19 `ink/secondary`; action row margin-top 8, gap 14, 13/600 — primary action `brand/text-on-soft` #4547C9, secondary action `ink/secondary`.
- **List group ("list group")**: radius 18, padding `4 16`; rows padding `11 0`, separated by `border-top 1px solid rgba(27,25,23,.06)` (light) / `rgba(255,255,255,.06)` (dark) on every row except the first.

### 1.8 Buttons
- **Primary L (52)**: height 52, radius 16, 15/600. Light: bg `brand/primary`, text #FFF, shadow `0 8px 24px rgba(91,92,226,.28)` on 5.4 (no shadow on 5.7). Dark: bg `dark/primary` #8586F2, text `dark/on-primary` #0F0F2A, no shadow. Pressed: `brand/primary-pressed` #4B4CCB (inferred).
- **Secondary L (52)**: height 52, padding 0 18, radius 16, 15/600. Light: bg `neutral/surface`, text `ink`, shadow `0 1px 2px rgba(27,25,23,.08)`. Dark: bg `dark/surface`, text `dark/text`, ring `0 0 0 1px rgba(255,255,255,.08)`.
- **Icon square (52)**: 52×52, radius 16, same surface as Secondary L, icon 22.
- **Primary M (40)**: height 40, padding 0 16, radius 12, 14/600, leading icon 18, gap 6. Light bg `brand/primary` #FFF text; dark bg `dark/primary`, `dark/on-primary` text.
- **Ghost M (40)**: height 40, padding 0 14, radius 12, 14/600, text `ink/secondary` (light) / `dark/secondary` (dark), no background.
- **Text action (13)**: 13/600 inline text, `brand/text-on-soft` (primary) or `ink/secondary` (secondary). Minimum tap target 44 high (inferred; extend hit area).
- **Chip (30)**: height 30, padding 0 10, radius 999, 12/500 or 12/600, leading icon 15, gap 4–5.

### 1.9 Sticky bottom CTA (5.4, 5.5)
- `position: sticky; bottom: 0`, padding `16 20 44`, row gap 10.
- Background fade: `linear-gradient(180deg, rgba(245,244,240,0) 0%, #F5F4F0 45%)` (light) / `linear-gradient(180deg, rgba(20,19,17,0) 0%, #141311 45%)` (dark). Content above reserves 130 bottom padding so the last list group can scroll clear of the CTA.

### 1.10 Icons
Material Symbols Rounded throughout. Icons used on this canvas: `signal_cellular_alt`, `wifi`, `battery_full`, `sunny`, `dynamic_feed`, `calendar_today`, `auto_awesome`, `event_available`, `event`, `videocam`, `self_improvement`, `groups`, `flag`, `restaurant`, `bolt`, `directions_car`, `error`, `arrow_back`, `medical_services`, `event_repeat`, `schedule`, `visibility_off`, `chevron_right`, `target`, `history`, `mail`, `radio_button_unchecked`, `person`, `schedule_send`, `close`, `headphones`, `call`, `description`, `handshake`, `check_circle`, `keyboard`. `FILL 1` is used only on: active tab icon, `auto_awesome` in AI kickers, `check_circle` in 5.7.

---

## 2. Screens

---

### 5.1 Plan · Gün (Light)

**Purpose.** Root of the Plan tab in day mode. A single-column timeline of the selected day with a "calendar intelligence" hero card above it. Answers "what does my day actually look like, including free time and what the assistant suggests I do with it".

**Navigation.** Tab root (`Plan` tab, segment `Gün`). Tab bar visible. Status bar `9:41`.

**Layout top → bottom** (content padding `14 20 0`, gap 16):

1. **Header row** — `Plan` h1 + segmented control (`Gün` selected, `Hafta` unselected). See 1.3/1.4.

2. **Day strip** — row, `justify-content: space-between`, 7 day chips (skeleton hint: 7).
   - Chip: 42×60, radius 14, column, centred, gap 2.
     - line 1: weekday abbreviation 11/500, opacity .8
     - line 2: day number 17/600
     - line 3: 4×4 dot, radius 2 (activity indicator)
   - Chip colours (light):
     - Today (index 4 = `Cum` in fixture): bg `ink` #1A1917, text #FFF, dot `brand/dark-glow` #A9AAF5.
     - Past days (index 0–3): bg `neutral/surface` #FFF, text `ink`, dot `raw #E0DED7` (propose `neutral/hairline-strong`; also used for the sheet grabber in 5.3).
     - Next day with events (index 5 = `Cmt`): bg `neutral/surface`, text `ink`, dot `brand/primary` #5B5CE2.
     - Day without events (index 6 = `Paz`): bg `neutral/surface`, text `ink`, dot transparent.
   - Dot semantics (inferred from fixture): hairline = past day with events, primary = upcoming day with events, glow = today, transparent = no events.
   - Fixture strings: `Pzt` `Sal` `Çar` `Per` `Cum` `Cmt` `Paz` with numbers `1` … `7`.
   - Interaction: tap chip → selects that day, timeline below reloads for it; the hero card may change. Horizontal swipe on the strip → previous/next week (inferred). Tapping today's chip while already selected scrolls timeline to "now" (inferred).

3. **Hero card `TAKVİM ZEKÂSI`** — hero AI card (1.7), radius 20, padding 16.
   - Kicker: `auto_awesome` (FILL) + `TAKVİM ZEKÂSI`, `brand/primary`.
   - Title (margin-top 8): 16/23 600, -0.01em, `text-wrap: pretty`: `Yarın 14:00–16:30 arasında 2,5 saat boşluğun var.`
   - Body (margin-top 4): 14/20 `ink/secondary`: `Teklif hazırlama görevini buraya yerleştirebilirim.`
   - Actions (margin-top 12, row gap 8):
     - Primary M: icon `event_available` + `Planla`
     - Ghost M: `Başka zaman`
   - Behaviour: `Planla` → creates the AI task block (`type: ai`) in the suggested slot on the calendar (writes a calendar event / internal task block; requires confirmation toast, see States); the hero card collapses/advances to the next suggestion. `Başka zaman` → opens a slot picker (inferred; alternative: dismisses and asks the assistant for other slots). Dead in prototype: both.

4. **Timeline** — column, padding-bottom 16 (skeleton hint: 6 rows; fixture has 7).
   - Row: row, gap 12, `min-height 68`.
     - Time column: width 44, 12/500, `ink/tertiary` #9B978E, padding-top 8, right-aligned. Text e.g. `09:00`.
     - Content column: flex 1, padding `4 0`, `border-top 1px solid rgba(27,25,23,.07)` (the hour hairline).
       - **Item card**: radius 14, padding `10 14`, column gap 2.
         - Title row: icon 16 (colour per type) + title 15/600 -0.01em.
         - Meta: 12, colour per type.
   - **Surface per type (light)** — this is the whole visual language of the timeline:

     | type | bg | border | title colour | icon colour | meta colour |
     |---|---|---|---|---|---|
     | `event` | `neutral/surface` #FFF | `1px solid rgba(27,25,23,.06)` | `ink` | `ink/secondary` | `ink/tertiary` |
     | `ai` | `raw #F7F7FE` (propose `brand/tint`, lighter than `brand/soft`) | `1px dashed` `brand/dark-glow` #A9AAF5 | `ink` | `brand/primary` | `brand/text-on-soft` #4547C9 |
     | `life` | `raw #FDF6EC` (propose `warning/tint` / `life/surface`, lighter than `warning/soft`) | `1px solid rgba(27,25,23,.06)` | `ink` | `ink/secondary` | `ink/tertiary` |
     | `gap` | transparent | `1px dashed rgba(27,25,23,.15)` | `ink/tertiary` | `ink/disabled` #B8B4AA | `ink/tertiary` |

   - **Fixture rows (`DAY` array, verbatim, in order):**

     | # | t | title | meta | icon | type |
     |---|---|---|---|---|---|
     | 1 | `09:00` | `Haftalık ekip` | `60 dk · Ofis` | `event` | event |
     | 2 | `11:00` | `Ürün gözden geçirme` | `30 dk · Online` | `videocam` | event |
     | 3 | `12:00` | `2 saat boşluk` | `Öğle yemeği ve odaklanma için uygun` | `self_improvement` | gap |
     | 4 | `14:30` | `Mehmet ile müşteri toplantısı` | `60 dk · Ofis · Hazırlık hazır` | `groups` | event |
     | 5 | `16:00` | `Teklif hazırlama` | `Önerilen · 45 dk · AI görev bloğu` | `auto_awesome` | ai |
     | 6 | `17:00` | `Başvuru son saati` | `Girişim programı · Mailden tespit edildi` | `flag` | event |
     | 7 | `20:30` | `Akşam yemeği · Karaköy` | `Rezervasyon · 4 kişi` | `restaurant` | life |

   - Interaction (all dead in prototype):
     - Tap `event` row → if it is a meeting with attendees and prep exists → 5.4 Meeting/Prep; otherwise → event detail (not designed on this canvas; reuse card/calendar detail from 03).
     - Tap `ai` row → opens the AI task block detail with `Onayla / Taşı / Kaldır` (inferred). The `Önerilen` prefix in meta means it is a suggestion not yet confirmed; once the user confirms, the row should become a solid `event` surface (inferred from the "Önerilen" language).
     - Tap `gap` row → opens the hero-style suggestion for that gap (what to place there) (inferred).
     - Tap `life` row → life event detail (reservation info, map) — reuse card/life (inferred).
     - `Hazırlık hazır` in meta is a status string, not a button; the prep is reached by tapping the row.
     - Long-press row → context menu (move / delete / open source mail) (inferred, optional).
   - Vertical scroll: the header + day strip are **not** sticky in the prototype (they scroll with content). Inferred: keep the day strip sticky under the header on scroll for usability; confirm with design.

5. **Tab bar** — see 1.5 (`Plan` active).

**Design note (verbatim):** `Üç yüzey: etkinlik (beyaz), AI görev bloğu (kesik indigo çerçeve, “Önerilen”), yaşam (sıcak krem). Boşluklar açıkça “2 saat boşluk” olarak etiketlenir; boşluk da bilgidir.`

**Dead in prototype:** segmented `Gün`/`Hafta`, all 7 day chips, `Planla`, `Başka zaman`, all 7 timeline rows, all 4 tab bar items.

**Data fields needed** — see §3.1 `TimelineItem`, §3.2 `DayChip`, §3.5 `CalendarInsight` (hero variant).

---

### 5.1D Plan · Gün · Dark

**Purpose / navigation.** Identical to 5.1; dark theme. Status bar `21:14`.

**Differences only:**
- Screen bg `dark/bg` #141311; all base text `dark/text` #F2F0EB.
- Segmented control: container `dark/surface-2`; selected `Gün` bg `dark/text` with `dark/bg` text, no shadow; unselected `dark/secondary`.
- Day chips (`daysDark`):
  - Today: bg `dark/text` #F2F0EB, text `dark/bg` #141311, **no ring**, dot `brand/primary` #5B5CE2 (note: the dot on the inverted chip uses the light-theme primary, not `dark/primary`).
  - Other days: bg `dark/surface` #1F1E1B, text `dark/text`, ring `0 0 0 1px rgba(255,255,255,.06)`.
  - Dots: past days `raw #3A3936` (propose `dark/hairline-strong`), next day with events `dark/primary` #8586F2, none → transparent.
- Hero card: dark hero gradient (1.7); kicker `brand/dark-glow` #A9AAF5; title `dark/text`; body `dark/secondary` #A39F96; `Planla` bg `dark/primary` #8586F2 with `dark/on-primary` #0F0F2A text; `Başka zaman` text `dark/secondary`.
- Timeline: time column `dark/tertiary` #7A776F; hour hairline `rgba(255,255,255,.07)`.
- **Surface per type (dark)** (`dayDark`):

  | type | bg | border | title | icon | meta |
  |---|---|---|---|---|---|
  | `event` | `dark/surface` #1F1E1B | `1px solid rgba(255,255,255,.06)` | `dark/text` | `dark/secondary` #A39F96 | `dark/tertiary` #7A776F |
  | `ai` | `rgba(133,134,242,.12)` (= `dark/primary` @12%) | `1px dashed` `dark/primary` #8586F2 | `dark/text` | `dark/primary-glow` #A9AAF5 | `dark/primary-glow` #A9AAF5 |
  | `life` | `rgba(240,184,90,.10)` (= `dark/warning-text` @10%) | `1px solid rgba(255,255,255,.06)` | `dark/text` | `dark/secondary` | `dark/tertiary` |
  | `gap` | transparent | `1px dashed rgba(255,255,255,.15)` | `dark/tertiary` #7A776F | `raw #5E5B54` (propose `dark/disabled`) | `dark/tertiary` |

- Tab bar dark variant (1.5): active `Plan` = `brand/dark-glow` #A9AAF5.
- Home indicator `rgba(255,255,255,.4)`.

**Design note (verbatim):** `Aynı üç yüzey dark tokenlarla: etkinlik #1F1E1B, AI bloğu %12 indigo + kesik #8586F2, yaşam %10 amber. Bugün günü ters çevrilir (#F2F0EB üzerine #141311), segment seçimi de aynı kuralı izler.`

---

### 5.2 Plan · Hafta + Takvim Zekâsı

**Purpose.** Root of the Plan tab in week mode. Not a calendar grid: a density chart of the week plus a stack of intelligence cards (busy-ness, travel, opportunity, conflict). This is where the assistant tells the user what to change about the week.

**Navigation.** Tab root (`Plan` tab, segment `Hafta`). Tab bar visible. Status bar `9:41`. `Seçenekleri Gör` pushes 5.3.

**Layout top → bottom** (content padding `14 20 0`, gap 16):

1. **Header row** — `Plan` h1 + segmented control (`Hafta` selected).

2. **Density chart card ("card/week-density")** — card/elevated, radius 20, padding 16, bg `neutral/surface`.
   - Header row (baseline aligned, space-between):
     - kicker 12/600 +0.08em `ink/tertiary`: `7–13 EYLÜL · YOĞUNLUK` (pattern `{startDay}–{endDay} {MONTH} · YOĞUNLUK`)
     - count 12 `ink/tertiary`: `18 etkinlik` (pattern `{n} etkinlik`)
   - Chart area (margin-top 14): row, gap 8, align-end, **height 120**. 7 columns (skeleton hint: 7), each a column flex `justify-content: flex-end`, gap 3, containing **2 stacked bars** (skeleton hint: 2), each radius 5, full column width, explicit pixel heights.
     - Bar order top→bottom: `bars[0]` (meetings) then `bars[1]` (focus). Heights are minutes-to-px scaled by the client; fixture values are raw px.
     - Bar colours:
       - normal day: `bars[0]` `raw #D9D6F7` (propose `brand/soft-strong`), `bars[1]` `brand/soft` #EDEDFC
       - `hot` day: `bars[0]` `raw #F3B7AE` (propose `critical/soft-strong`), `bars[1]` `critical` #E0553F
       - `today`: `bars[0]` `brand/primary` #5B5CE2, `bars[1]` `brand/dark-glow` #A9AAF5
   - Day labels (margin-top 8): row gap 8, each flex 1, centred, 11/600. Colour: today → `brand/primary`; hot → `critical/text` #C7432F; else `ink/secondary`.
   - Legend (margin-top 12): row gap 14, 11 `ink/tertiary`, each with a 10×10 radius-3 swatch and gap 5:
     - swatch `#D9D6F7` — `Toplantı`
     - swatch `#EDEDFC` — `Odak`
     - swatch `#F3B7AE` — `Yoğun`
   - **Fixture (`WEEK` array, verbatim):**

     | d | bars[0] px | bars[1] px | flags |
     |---|---|---|---|
     | `Pzt` | 38 | 20 | |
     | `Sal` | 26 | 14 | |
     | `Çar` | 54 | 30 | `hot` |
     | `Per` | 30 | 10 | |
     | `Cum` | 22 | 26 | |
     | `Cmt` | 16 | 8 | `today` |
     | `Paz` | 8 | 0 | |

   - Interaction (dead in prototype): tap a column → switch to `Gün` with that day selected (inferred). Horizontal swipe on the card → previous/next week (inferred).

3. **Section kicker** — `TAKVİM ZEKÂSI`, 12/600 +0.08em `ink/tertiary`, padding `4 4 0`.

4. **Insight cards** — 4 × insight row card (1.7), gap 16 (last card has `margin-bottom 16`). Icon colour = category:

   | # | icon | icon colour (category) | title | body | actions |
   |---|---|---|---|---|---|
   | 1 | `bolt` | `warning/text` #9A6300 (busy) | `Yarın oldukça yoğun.` | `09:00 ve 10:00 toplantıların arka arkaya. Arada mola yok; 10:00'ı 10:15'e kaydırabilirim.` | primary `10:15'e Kaydır` · secondary `Böyle Kalsın` |
   | 2 | `directions_car` | `info/text` #2262BE (travel) | `13:30 doktor randevusu için 12:50'de çıkman gerekebilir.` | `Kadıköy → Nişantaşı · 38 dk trafik tahmini · Randevu maili, 28 Ağu` | primary `12:40'a Hatırlat` |
   | 3 | `self_improvement` | `brand/primary` #5B5CE2 (opportunity) | `16:00 toplantısı öncesi 45 dakika boşluğun var.` | `Yatırımcı görüşmesi için hazırlık notunu okumaya yeter.` | primary `Hazırlığı Buraya Koy` |
   | 4 | `error` | `critical/text` #C7432F (conflict) | `Çarşamba 14:00 müşteri toplantısı ile 14:30 doktor çakışıyor.` | *(no body)* | primary `Seçenekleri Gör` |

   - Title uses `text-wrap: pretty` on cards 2 and 4.
   - Behaviour (all dead in prototype):
     - `10:15'e Kaydır` → proposes moving the 10:00 meeting to 10:15; per rule 6 this opens a confirmation (attendee mail draft if others are invited) rather than writing immediately. On confirm: toast `Toplantı 10:15'e taşındı` (inferred string) and card dismisses.
     - `Böyle Kalsın` → dismisses the card; the insight is snoozed for that event (never re-shown).
     - `12:40'a Hatırlat` → schedules a local reminder notification at 12:40; button turns into a confirmed state (inferred: `Hatırlatıcı kuruldu`).
     - `Hazırlığı Buraya Koy` → creates an `ai` task block "Hazırlık" in the 45-min gap and links it to the meeting prep (5.4); toast on success.
     - `Seçenekleri Gör` → push 5.3 (conflict detail with resolution sheet already open).
     - Tapping the card body (not an action) → for conflict → 5.3; for others → the related event in day view (inferred).
   - Rule: **max 2 actions per card**. Card ordering: conflicts should sort first in production (the fixture shows it last for storytelling); confirm with design.

5. **Tab bar** — see 1.5.

**Design note (verbatim):** `Hafta görünümü grid değil yoğunluk hikâyesi. Zekâ kartları: ikon rengi anlam taşır (amber yoğunluk, mavi ulaşım, indigo fırsat, coral çakışma); her kartın en fazla 2 aksiyonu var.`

**Dark mode.** Not drawn for 5.2. Inferred mapping: card bg `dark/surface` + ring; chart bar colours → normal `rgba(133,134,242,.35)` / `rgba(133,134,242,.16)`, hot `dark/critical-text` #F08B78 / `critical`, today `dark/primary` / `dark/primary-glow`; label colours → `dark/primary`, `dark/critical-text`, `dark/secondary`; legend `dark/tertiary`; icon colours → `dark/warning-text` #F0B85A, `info` #3B82E6, `dark/primary-glow`, `dark/critical-text`; primary text action `dark/primary-glow`; secondary `dark/secondary`.

**Dead in prototype:** segmented control, chart columns, all 6 text actions, 4 card bodies, tab bar.

**Data fields needed** — §3.3 `WeekDensity`, §3.5 `CalendarInsight`.

---

### 5.3 Takvim Çakışması · Çözüm sayfası açık

**Purpose.** Conflict detail: shows the two overlapping events, a one-sentence rationale, and (as a bottom sheet that is already open when the screen appears) the ordered list of resolutions with the AI recommendation first.

**Navigation.** Pushed from 5.2 (`Seçenekleri Gör`) or from a conflict notification / Bugün priority card. Tab bar hidden. The **bottom sheet opens automatically** on entry (the prototype shows the sheet state as the default state of this screen). Status bar `9:41`. Frame height is fixed 844 (no scroll).

**Layout top → bottom** (content padding `14 20 0`, gap 16), underneath the scrim:

1. **Header** (1.6): `arrow_back` button · kicker `ÇARŞAMBA · 10 EYLÜL` (pattern `{WEEKDAY} · {d} {MONTH}`) · 36 spacer.

2. **Title block**
   - Kicker row: icon `error` 16 (not filled) + `TAKVİM ÇAKIŞMASI`, 12/600 +0.06em, colour `critical/text` #C7432F.
   - Title (margin-top 8): 26/32 600 -0.02em `ink`: `Bu iki etkinlik çakışıyor.`

3. **Conflict pair ("conflict visualiser")** — relative container, column gap 8:
   - **Card A (first event)**: card/elevated radius 16, padding `14 16`, row gap 12, align-centre.
     - time: width 48, 14/600: `14:00`
     - title 15/600 -0.01em: `Müşteri toplantısı`
     - meta 12 `ink/tertiary`: `60 dk · Mehmet Yılmaz · Ofis`
     - trailing icon 18 `ink/secondary`: `groups`
   - **Card B (second event, life surface)**: bg `raw #FDF6EC` (life surface, same as timeline `life`), radius 16, padding `14 16`, `border 1px solid rgba(27,25,23,.06)`, **margin-left 24** (offset to the right to show overlap).
     - time `14:30` · title `Doktor randevusu` · meta `30 dk · Nişantaşı · Randevu maili` · icon `medical_services`
   - **Overlap marker**: absolute, left 0, top 50%, 16×2, radius 1, bg `critical` #E0553F, translateY(-1px). It sits in the 24 px indent left of Card B, at the vertical midpoint of the pair.
   - Surface choice: Card A takes the surface of its own item type (event → white); Card B takes its type (life/personal → cream). Keep this dynamic — a work/work conflict would be two white cards.

4. **Rationale**: 14/21 `ink/secondary`, `text-wrap: pretty`: `Toplantı 15:00'te biter; doktora 38 dakika yol var. Doktor randevusunu kaydırmak en az kişiyi etkiler.`

5. **Scrim**: absolute inset 0, `rgba(27,25,23,.35)`. Tapping the scrim closes the sheet (inferred), revealing the page above; the page then needs a way to reopen it — inferred: a sticky primary button `Çözüm Seç` (string not in prototype).

6. **Bottom sheet `Nasıl çözelim?`** — absolute bottom, bg `neutral/surface`, radius `28 28 0 0`, padding `10 20 44`, shadow `0 -10px 40px rgba(27,25,23,.12)`.
   - Grabber: 36×5 radius 3, `raw #E0DED7` (`neutral/hairline-strong`), centred, margin-bottom 14.
   - Title: 19/600 -0.01em: `Nasıl çözelim?`
   - Subtitle (margin-top 2): 13 `ink/secondary`: `Seçtiğin çözüm onayına sunulur, otomatik uygulanmaz.`
   - Option list (margin-top 12), rows `min-height 60`, row gap 12, each with `border-top 1px solid rgba(27,25,23,.06)` (including the first row):
     - Leading icon 20 in a 24-wide slot; title 15/500 `ink`; subtitle 12; trailing `chevron_right` 18 `raw #C9C5BC` (propose `ink/chevron`; between `ink/disabled` and `neutral/hairline`).

     | # | icon | icon colour | title | subtitle | subtitle style | chevron |
     |---|---|---|---|---|---|---|
     | 1 | `auto_awesome` | `brand/primary` | `Doktoru 15:45'e al` | `Önerilen · Klinikte 15:45 boş görünüyor` | 12/600 `brand/text-on-soft` #4547C9 | yes |
     | 2 | `event_repeat` | `ink/secondary` | `Toplantıyı 13:00'a öner` | `Mehmet'e öneri maili taslağı hazırlanır` | 12 `ink/tertiary` | yes |
     | 3 | `schedule` | `ink/secondary` | `Toplantıyı 30 dk kısalt` | `14:00–14:30 · Doktora zamanında yetişirsin` | 12 `ink/tertiary` | yes |
     | 4 | `visibility_off` | `ink/secondary` | `Böyle kalsın` | `Bu çakışmayı bir daha gösterme` | 12 `ink/tertiary` | **no** |

   - Behaviour (all dead in prototype):
     - Row 1 (`recommended`) → opens a confirmation step (reschedule the appointment to 15:45; if the source was a mail/booking, draft a reply). Nothing is written until the user confirms.
     - Row 2 → opens a pre-filled mail draft to the other attendee proposing 13:00 (mail composer from 04 Akış). Sending the mail is the confirmation.
     - Row 3 → confirmation dialog to shorten the meeting to 14:00–14:30 (updates the calendar event; notify attendees if any).
     - Row 4 → marks the conflict as dismissed forever (`dismissedConflictIds`), closes the sheet and pops back to 5.2; the conflict card disappears from 5.2.
     - Chevron indicates "leads to a further step"; row 4 has no chevron because it completes immediately.
   - Home indicator inside the sheet.

**Design note (verbatim):** `Çakışma görselleştirmesi: ikinci kart sağa kaydırılır ve kısa coral çizgi üst üste binmeyi işaret eder. Çözümler sıralıdır; ilki AI önerisi ve gerekçesi.`

**Motion (inferred).** Sheet slides up over 300 ms with the scrim fading in as the screen is pushed; drag-to-dismiss on the grabber. Selecting an option: `impactLight` haptic; completing a resolution: `notificationSuccess`.

**Dark mode.** Not drawn. Inferred: page bg `dark/bg`; Card A `dark/surface`+ring; Card B `rgba(240,184,90,.10)` + ring; marker `dark/critical-text` #F08B78; kicker `dark/critical-text`; sheet bg `dark/surface`, grabber `rgba(255,255,255,.2)`, row borders `rgba(255,255,255,.06)`, chevron `raw #5E5B54`, recommended subtitle `dark/primary-glow`.

**Dead in prototype:** back button, both event cards, scrim, grabber, 4 option rows.

**Data fields needed** — §3.6 `CalendarConflict`, §3.7 `ResolutionOption`.

---

### 5.4 Toplantıya Hazırlan · Light · İmza ekran

**Purpose.** The product's signature screen: a meeting briefing shown ~20 minutes before a meeting. First fold = header, person row, and the dark **"3 şey"** card (the three things you must talk about). Below the fold = the evidence, grouped by source. Sticky CTA to read the 2-minute summary or take a note.

**Navigation.** Push (back arrow). Entry points: the T-20 min notification (`Toplantıdan 20 dk önce bildirim`), tapping a meeting row on 5.1, `Hazırlık hazır` meetings on Bugün (card/calendar), the person chip on 5.7, and 5.2 card 3. Tab bar hidden. Status bar `14:12`. Screen scrolls; content padding `6 20 130` (130 reserves space for the sticky CTA), gap 16.

**Layout top → bottom:**

1. **Header** (1.6): `arrow_back` · kicker `TOPLANTIYA HAZIRLAN` · **countdown pill**: chip height 30, padding 0 10, radius 999, bg `warning/soft` #FDF2DC, text `warning/text` #9A6300, 12/600, icon `schedule` 15 + `18 dk` (pattern `{n} dk`; counts down live — inferred; below 5 min switch to `critical/soft` + `critical/text`, and after the meeting starts show `Başladı` — inferred strings).

2. **Person row (card/person, inline, no card surface)** — row gap 14, padding `4 0`, align-centre:
   - Avatar 56 circle, initials 20/600. Fixture: bg `raw #DCE4F5`, text `raw #2B3F73`, `MY`. (Avatar colours are per-person hashed pairs; propose an `avatar/palette` of 6–8 bg/text pairs; this pair is "blue".)
   - Name 24/30 600 -0.02em `ink`: `Mehmet Yılmaz`
   - Sub (margin-top 2) 14 `ink/secondary`: `Müşteri toplantısı · 14:30 · 60 dk · Ofis` (pattern `{meetingTitle} · {start} · {duration} dk · {location}`)
   - Trailing `chevron_right` 22 `ink/disabled` #B8B4AA.
   - Tap → person profile (06 Kişiler). Dead in prototype.

3. **"3 şey" card (card/ai-insight · hero-dark)** — bg `ink` #1A1917, text #FFF, radius 24, padding 20, shadow `0 12px 32px rgba(27,25,23,.18)`.
   - Kicker: `auto_awesome` (FILL) 16 + `KONUŞMAN GEREKEN 3 ŞEY`, 12/600 +0.06em, colour `brand/dark-glow` #A9AAF5.
   - List (margin-top 14, column gap 14). Each item: row gap 14 — number badge 26 circle bg `rgba(255,255,255,.12)` 13/600; then title 17/600 -0.01em and body (margin-top 2) 14/20 `rgba(255,255,255,.7)`.

     | # | title | body |
     |---|---|---|
     | `1` | `Fiyat` | `Revize teklif 17:00'ye kadar bekleniyor; %8 indirim sınırını netleştir.` |
     | `2` | `Teslim tarihi` | `Ekim başı için onay istiyor; üretim takvimi 6 Ekim'i gösteriyor.` |
     | `3` | `Sözleşme` | `Taslak 2 haftadır açık; hukuk yorumu bekliyor.` |

   - Always exactly 3 items (the kicker hard-codes `3 ŞEY`). If the model returns fewer, the kicker string must adapt (`KONUŞMAN GEREKEN {n} ŞEY`) — inferred.
   - Tap on an item → scrolls to / highlights its evidence rows below (inferred, optional).

4. **Evidence sections** — one block per `PREP` section (skeleton hint: 6 sections × 1 row). Block = kicker + list group.
   - Section kicker: 12/600 +0.08em `ink/tertiary`, padding `0 4 8`.
   - List group (1.7): bg `neutral/surface`, radius 18, padding `4 16`, card/elevated shadow.
   - Row: row, align-start, gap 12, padding `11 0`, `border-top` = `1px solid rgba(27,25,23,.06)` for rows after the first, `0` for the first.
     - Icon tile 30×30 radius 10, bg `neutral/surface-2` #F0EFEB, icon 17 `ink/secondary`.
     - Text 15/21 -0.01em `ink`, `text-wrap: pretty`; meta (margin-top 2) 12 `ink/tertiary`.

   **Fixture (`PREP` array, verbatim, in order):**

   | Section kicker | icon | text `r.t` | meta `r.m` |
   |---|---|---|---|
   | `TOPLANTININ AMACI` | `target` | `Eylül teklifinin son hâlini netleştirmek ve Ekim teslimatı için onay almak.` | `Takvim davetinden çıkarıldı` |
   | `SON GÖRÜŞMENİZ` | `history` | `1 Eylül · Fiyat aralığı ve teslim süresi konuşuldu. Mehmet revize teklif istedi; sen Cuma göndereceğini söyledin.` | `4 gün önce · Görüşme notları` |
   | `SON MAİLLER` | `mail` | `Re: Teklif — “Fiyatı Ekim teslimatına göre güncelleyebilir misiniz?”` | `Mehmet · Dün 18:20` |
   | `SON MAİLLER` (row 2) | `mail` | `Teklif v2 gönderildi (PDF)` | `Sen · 2 Eyl 10:05` |
   | `AÇIK KONULAR` | `radio_button_unchecked` | `Sözleşme taslağı hukuk yorumu bekliyor` | `14 gün` |
   | `AÇIK KONULAR` (row 2) | `radio_button_unchecked` | `Nakliye maliyeti kimde?` | `1 Eylül görüşmesi` |
   | `SENDEN BEKLENENLER` | `person` | `Revize teklif · PDF` | `Bugün 17:00` |
   | `SENİN BEKLEDİKLERİN` | `schedule_send` | `Teklif v2 için geri bildirim` | `3 gündür bekliyor` |

   - Row behaviour (dead in prototype): mail rows → open that mail thread (04 Akış mail detail); `SON GÖRÜŞMENİZ` → open the meeting note; `AÇIK KONULAR` rows are open items (the unchecked radio icon is a status glyph — tapping the row opens the item; tapping the icon may mark it resolved — inferred); `SENDEN BEKLENENLER` → open the commitment (task) detail; `SENİN BEKLEDİKLERİN` → open the waiting-on item with a `Hatırlat` action (inferred).
   - Sections with zero rows are omitted entirely (never show an empty group).

5. **Sticky CTA** (1.9): row gap 10.
   - Primary L (flex 1, with indigo shadow): `2 Dakikalık Özeti Oku` → 5.6.
   - Secondary L: `Not Al` → 5.7 in keyboard (typed) mode, pre-meeting (inferred; the prototype only shows the post-meeting voice variant).

**Design note (verbatim):** `Toplantıdan 20 dk önce bildirim, ekranın ilk katlaması “3 şey” kartıyla biter. Geri kalan bölümler kaynaklı kanıt. Bu ekran mağaza görselinde de kullanılır.`

**Notification (from the design note):** local/push notification 20 minutes before a meeting that has prep; tapping it deep-links to 5.4 for that meeting. Suggested notification copy (not in prototype): title `{personName} ile toplantı 20 dk sonra`, body the first "3 şey" title list — confirm with design/08.

**Dead in prototype:** back button, countdown pill (static `18 dk`), person row, 3 "şey" items, all 8 evidence rows, `2 Dakikalık Özeti Oku`, `Not Al`.

**Data fields needed** — §3.8 `MeetingPrep`.

---

### 5.5 Toplantıya Hazırlan · Dark

**Purpose / navigation / layout.** Identical to 5.4. Status bar `14:12`. Differences only:

- Screen bg `dark/bg`, text `dark/text`.
- Back button: bg `dark/surface`, ring `rgba(255,255,255,.08)`. Kicker `dark/tertiary` #7A776F.
- Countdown pill: bg `rgba(217,139,11,.18)` (≈ `warning` @18%; `raw #D98B0B` — propose `dark/warning-soft`), text `dark/warning-text` #F0B85A.
- Avatar: colours **inverted** — bg `raw #2B3F73`, text `raw #DCE4F5`. Sub text `dark/secondary`. Chevron `raw #5E5B54` (`dark/disabled`).
- **"3 şey" card becomes an indigo gradient** (a black card would vanish on a black screen): bg `linear-gradient(160deg, #2C2C7A 0%, #4A4BC8 100%)` (`raw`; propose `gradient/night-indigo` or reuse `gradient/night` if it matches), text #FFF, radius 24, padding 20, shadow `0 12px 32px rgba(91,92,226,.25)`.
  - Kicker colour `raw #D6D6FB` (propose `brand/on-gradient-kicker`).
  - Number badge bg `rgba(255,255,255,.16)`; body text `rgba(255,255,255,.75)`.
  - Same 3 strings as 5.4.
- Evidence sections: kicker `dark/tertiary`; group bg `dark/surface` with ring `rgba(255,255,255,.06)`; row separators `1px solid rgba(255,255,255,.06)`; icon tile bg `rgba(255,255,255,.08)`, icon `dark/secondary`; text `dark/text`; meta `dark/tertiary`. Same `PREP` strings (`prepDark`).
- Sticky CTA: fade `rgba(20,19,17,0) → #141311 at 45%`. Primary L: bg `dark/primary` #8586F2, text `dark/on-primary` #0F0F2A, **no shadow**. Secondary L: bg `dark/surface`, text `dark/text`, ring `rgba(255,255,255,.08)`.
- Home indicator `rgba(255,255,255,.4)`.

**Design note (verbatim):** `Dark'ta koyu kart siyah üstünde kaybolacağı için “3 şey” kartı indigo gradyana döner; birincil buton açık indigo, üzerinde koyu metin (kontrast 9:1).`

---

### 5.6 2 Dakikalık Özet · Okuma görünümü

**Purpose.** A long-form editorial "where did you leave off" narrative for the upcoming meeting, in the same voice as the morning briefing (Lora serif, bold date emphasis, source chips at the bottom). Can be listened to via TTS.

**Navigation.** Full-screen modal presented from 5.4/5.5 (`2 Dakikalık Özeti Oku`); closes with `×`. Tab bar hidden. Status bar `14:13`. Frame height fixed 844 in the prototype; in the app the body must scroll if the narrative is longer, with the sources block pinned at the end of content (`margin-top: auto` in the prototype pushes it to the bottom when content is short).

**Layout top → bottom** (bg `editorial/paper` #FBFAF7; content padding `6 24 40`, gap 22):

1. **Header** (1.6): left 36 circle `close` · kicker `2 DAKİKALIK ÖZET` · right 36 circle `headphones` (bg `neutral/surface`, shadow).
   - `headphones` → starts TTS of the same text (design note: `Kulaklık ikonu aynı metni sesli okur.`). While playing, swap to `pause` icon and show progress (inferred). Dead in prototype.

2. **Title block**
   - Byline: Lora italic 15, `ink/secondary`: `Mehmet Yılmaz · 14:30` (pattern `{personName} · {start}`)
   - Title (margin-top 6): Lora 30/36, weight 500, -0.02em, `text-wrap: pretty`: `Nerede kalmıştınız?`
   - Note: the type-scale token `editorial-display` is Lora 34–38; the prototype uses 30/36 here. Use 30/36 for this screen (it is a fixed title, not a briefing headline) unless design consolidates.

3. **Body paragraphs** — Lora 17/28, `ink`, `text-wrap: pretty`, gap 22 between paragraphs. Emphasised spans are weight 600 (dates). (Type-scale token `editorial` is Lora 18/29; the prototype draws 17/28. Either is acceptable; keep one constant app-wide.)

   - P1: `Mehmet ile en son **1 Eylül'de** konuştunuz. Fiyat aralığını ve teslim süresini ele aldınız; Mehmet Ekim başı teslimat için revize teklif istedi, sen Cuma göndereceğini söyledin. Teklif v2'yi **2 Eylül'de** gönderdin; henüz yanıt gelmedi.`
   - P2: `Dün akşam gelen mailde fiyatın Ekim teslimatına göre güncellenmesini istedi. Bu, %8 indirim sınırını ve üretim takviminin gösterdiği **6 Ekim** tarihini konuşmanı gerektiriyor.`
   - P3: `Sözleşme taslağı iki haftadır hukuk yorumu bekliyor; Mehmet'in bunu sorması muhtemel. Nakliye maliyetinin kimde olacağı ilk görüşmede açık kalmıştı.`
   - (`**…**` marks the 600-weight spans; the summary payload should carry inline emphasis ranges — see §3.9.)

4. **Sources block** (`margin-top: auto`, column gap 8):
   - Kicker `KAYNAKLAR` 12/600 +0.08em `ink/tertiary`.
   - Chip row (wrap, gap 6): chip height 30, padding 0 10, radius 999, bg `neutral/surface`, 12/500 `ink`, shadow `0 1px 2px rgba(27,25,23,.06)`, icon 15 `ink/secondary`, gap 5:
     - `mail` `3 mail` (pattern `{n} mail`)
     - `call` `1 görüşme notu` (pattern `{n} görüşme notu`)
     - `description` `Teklif v2.pdf` (attachment file name)
   - Tap chip → opens the source list / the file (mail chip → filtered thread list; note chip → note; file chip → attachment preview). Dead in prototype.

5. Home indicator.

**Design note (verbatim):** `Okuma görünümü brifingle aynı editoryal sesi kullanır: Lora, kalın tarih vurguları, altta kaynak çipleri. Kulaklık ikonu aynı metni sesli okur.`

**Dark mode.** Not drawn. Inferred: bg `dark/bg` (or a slightly warm `#171613` "dark paper" — propose `editorial/paper-dark`), text `dark/text`, byline `dark/secondary`, chips `dark/surface` + ring, kicker `dark/tertiary`.

**Dead in prototype:** close, headphones, 3 source chips.

**Data fields needed** — §3.9 `MeetingSummary`.

---

### 5.7 Toplantı Sonrası Yakalama · Ses girişi

**Purpose.** One minute after a meeting ends, a silent notification invites the user to capture follow-ups by voice. Speech is transcribed live and commitments are detected in real time; nothing is written until `Kaydet`.

**Navigation.** Full-screen modal (close `×`). Entry: T+1 min silent notification, or a `Not Al` action (typed variant). Tab bar hidden. Status bar `15:31`. Frame fixed 844.

**Layout top → bottom** (bg `neutral/bg`; content padding `6 20 44`, gap 18):

1. **Header** (1.6): `close` · kicker `TOPLANTI SONRASI` · 36 spacer.

2. **Title block**
   - Meta 13 `ink/secondary`: `Mehmet Yılmaz · 14:30–15:30` (pattern `{personName} · {start}–{end}`)
   - Title (margin-top 6) 28/34 600 -0.02em: `Toplantın bitti.`
   - Sub (margin-top 6) 16/23 `ink/secondary`: `Takip etmen gereken bir şey var mı?`

3. **Transcript card** — card/elevated radius 20, padding 16, bg `neutral/surface`.
   - Live transcript 16/24 **italic** `ink`, wrapped in typographic quotes: `“Mehmet'e yarın teklif göndereceğim. Sözleşme için hukuktan Perşembe'ye kadar yorum isteyeceğim.”`
   - Row (margin-top 12, gap 8): **waveform** + status 12 `ink/tertiary`: `0:07 · dinleniyor` (pattern `{m:ss} · dinleniyor`).
   - Waveform spec (from `bars` render value): container height 20, row gap 3, 26 bars, each width 3 radius 2. Bar `i` height = `6 + ((i*7) % 5) * 3` → repeating `6, 12, 18, 9, 15` px. Bars `i < 18` are `brand/primary` (already spoken/processed), bars `i ≥ 18` are `raw #D9D6F7` (`brand/soft-strong`, pending). In the app drive bar heights from live mic amplitude and the filled count from elapsed audio; keep 26 bars at 390 width.
   - While listening, the card should show a subtle pulse on the waveform (inferred). Tapping the card pauses/resumes listening (inferred).

4. **Commitments card (card/ai-insight hero)** — hero gradient (1.7), radius 20, padding 16.
   - Kicker: `auto_awesome` (FILL) + `2 YENİ TAAHHÜT` (pattern `{n} YENİ TAAHHÜT`; singular `1 YENİ TAAHHÜT`; `0` → hide the card entirely — inferred), `brand/primary`.
   - List (margin-top 10, gap 10); each row: padding `10 12`, radius 14, bg `neutral/surface`, shadow `0 1px 2px rgba(27,25,23,.06)`, row gap 12, align-centre:
     - `handshake` 20 `brand/primary`
     - title 15/600 -0.01em; sub 12 `ink/tertiary`
     - trailing `check_circle` 20 `FILL 1` `success` #2FA062 — means **"tespit edildi"** (detected), NOT "saved".

     | # | title | sub |
     |---|---|---|
     | 1 | `Mehmet'e teklif gönder` | `Yarın · Mehmet Yılmaz` |
     | 2 | `Hukuktan sözleşme yorumu iste` | `Perşembe · Hukuk ekibi` |

     (pattern for sub: `{dueLabel} · {ownerOrCounterpartyName}`)
   - Rows appear with a spring-in animation as they are detected (inferred). Tapping a row → edit sheet (title, due date, person); swipe left → discard the detection (inferred; both dead in prototype).

5. **Bottom actions** (`margin-top: auto`, row gap 10):
   - Primary L (flex 1, **no** shadow on this screen): `Kaydet` → stops recording, persists the note + creates the detected commitments (tasks / Akış items), dismisses the modal with a toast (inferred string: `Not ve 2 taahhüt kaydedildi`).
   - Icon square 52: `keyboard` → switches to typed input (text field replaces the transcript card; waveform hidden). Dead in prototype.
   - `×` (header) → discards; if there is transcript content, confirm discard (inferred: `Kaydı silmek istiyor musun?`).

6. Home indicator.

**Design note (verbatim):** `Toplantı bitiminde 1 dakika sonra sessiz bildirim. Konuşma anında taahhüde dönüşür; yeşil onay “tespit edildi” demek, yazma işlemi yalnızca Kaydet ile.`

**Notification (from the design note):** silent (no sound, no vibration) local notification 1 minute after a calendar meeting's end; deep-links to 5.7 for that meeting. Suggested copy (not in prototype): `Toplantın bitti · Takip etmen gereken bir şey var mı?`.

**Permissions.** Microphone (and speech recognition on iOS) are required for voice mode. If denied: open in keyboard mode automatically and show an inline note under the input (inferred: `Mikrofon izni kapalı. Ayarlar'dan açabilirsin.`) with a `Ayarlar` link.

**Dark mode.** Not drawn. Inferred: transcript card `dark/surface` + ring, italic `dark/text`, waveform `dark/primary` / `rgba(133,134,242,.3)`; commitments card dark hero gradient, rows `dark/surface-2`, check `dark/success-text` #6FCF97; `Kaydet` `dark/primary`/`dark/on-primary`; keyboard button `dark/surface` + ring.

**Dead in prototype:** close, transcript card, waveform, 2 commitment rows, `Kaydet`, keyboard button.

**Data fields needed** — §3.10 `PostMeetingCapture`.

---

## 3. Domain model — fields required by these screens

Field names are proposals; keep them stable across RN and Next.js.

### 3.1 `TimelineItem` (5.1)
- `id`
- `type`: `'event' | 'ai' | 'life' | 'gap'`
- `start` (ISO), `end` (ISO), `durationMin`
- `title` (e.g. `Haftalık ekip`, `2 saat boşluk` — for gaps the title is generated: `{n} saat boşluk` / `{n} dk boşluk`)
- `meta` — display string assembled from: `durationMin` (`60 dk`), `locationLabel` (`Ofis`, `Online`), `status` (`Hazırlık hazır`), `suggestionFlag` (`Önerilen`), `sourceLabel` (`Mailden tespit edildi`, `Rezervasyon`), `attendeeCount` (`4 kişi`), `gapHint` (`Öğle yemeği ve odaklanma için uygun`). Store the parts; join with ` · ` in the view.
- `icon` (Material symbol name): `event`, `videocam`, `self_improvement`, `groups`, `auto_awesome`, `flag`, `restaurant`, …
- `isOnline`, `location`
- `attendees[]` → `Person` refs; `primaryPersonId` (Mehmet)
- `hasPrep: boolean` (drives `Hazırlık hazır` and navigation to 5.4)
- `source`: `{ kind: 'calendar' | 'mail' | 'reservation' | 'ai', refId }`
- `suggestionState` (ai only): `'suggested' | 'accepted' | 'rejected'`
- `deadlineFlag` (for `Başvuru son saati` type events)

### 3.2 `DayChip` (5.1 strip)
- `date`, `weekdayShort` (`Pzt`…`Paz`), `dayNumber`
- `isToday`, `isSelected`, `isPast`
- `eventCount` → dot state: `none | past | upcoming | today`

### 3.3 `WeekDensity` (5.2 chart)
- `weekStart`, `weekEnd` (`7–13 EYLÜL`), `totalEventCount` (`18 etkinlik`)
- `days[7]`: `{ date, weekdayShort, meetingMinutes, focusMinutes, isToday, isHot }` — `isHot` = busy threshold flagged by the model/service; bars scale minutes → px against the week max within a 120 px area.

### 3.4 `CalendarInsight` — hero variant (5.1)
- `id`, `kind: 'gap-suggestion'`
- `title` (`Yarın 14:00–16:30 arasında 2,5 saat boşluğun var.`), `body`
- `proposedSlot { start, end }`, `linkedTaskId` (`Teklif hazırlama`)
- `primaryAction { label: 'Planla', type: 'schedule' }`, `secondaryAction { label: 'Başka zaman', type: 'reschedule' }`

### 3.5 `CalendarInsight` — compact variant (5.2)
- `id`, `category: 'busy' | 'travel' | 'opportunity' | 'conflict'` (drives icon + icon colour)
- `icon` (override optional)
- `title`, `body` (nullable)
- `actions[≤2]`: `{ label, kind: 'shift' | 'dismiss' | 'remind' | 'placePrep' | 'openConflict', payload }`
- `relatedEventIds[]`, `conflictId` (for `conflict`)
- Travel payload: `originLabel` (`Kadıköy`), `destinationLabel` (`Nişantaşı`), `travelMinutes` (38), `leaveAt` (12:50), `remindAt` (12:40), `sourceMail { subject, date: '28 Ağu' }`

### 3.6 `CalendarConflict` (5.3)
- `id`, `date` (`ÇARŞAMBA · 10 EYLÜL`)
- `a: TimelineItem` (14:00 `Müşteri toplantısı`, 60 dk, `Mehmet Yılmaz`, `Ofis`, icon `groups`)
- `b: TimelineItem` (14:30 `Doktor randevusu`, 30 dk, `Nişantaşı`, source `Randevu maili`, icon `medical_services`)
- `rationale` (`Toplantı 15:00'te biter; doktora 38 dakika yol var. …`)
- `travelMinutesBetween` (38)
- `options: ResolutionOption[]` (ordered; first is recommended)
- `dismissed: boolean`

### 3.7 `ResolutionOption` (5.3 sheet)
- `id`, `kind: 'move-b' | 'propose-a' | 'shorten-a' | 'keep'`
- `icon` (`auto_awesome`, `event_repeat`, `schedule`, `visibility_off`)
- `title`, `subtitle`
- `isRecommended` (renders `Önerilen · …` subtitle in `brand/text-on-soft` and `auto_awesome` icon in `brand/primary`)
- `needsFurtherStep` (chevron shown)
- `payload`: new time (`15:45`, `13:00`), new duration (30), draft-mail template ref

### 3.8 `MeetingPrep` (5.4 / 5.5)
- `meetingId`, `person { id, fullName, initials, avatarColorKey }`
- `meeting { title, start, durationMin, location }`
- `minutesUntilStart` (countdown pill)
- `topThree[3]`: `{ n, title, body }`
- `sections[]`: `{ key: 'purpose' | 'lastConversation' | 'recentMails' | 'openItems' | 'expectedFromYou' | 'youAreWaitingOn', kicker, rows[] }`
  - `row`: `{ icon, text, meta, deepLink { kind: 'mail' | 'note' | 'task' | 'calendar' | 'file', refId } }`
- Kicker strings by key: `TOPLANTININ AMACI`, `SON GÖRÜŞMENİZ`, `SON MAİLLER`, `AÇIK KONULAR`, `SENDEN BEKLENENLER`, `SENİN BEKLEDİKLERİN`
- `summaryAvailable: boolean` (enables `2 Dakikalık Özeti Oku`)

### 3.9 `MeetingSummary` (5.6)
- `meetingId`, `personName`, `start`
- `title` (`Nerede kalmıştınız?`)
- `paragraphs[]`: `{ text, emphasis: [{ start, end }] }` (600-weight ranges: `1 Eylül'de`, `2 Eylül'de`, `6 Ekim`)
- `sources[]`: `{ icon: 'mail' | 'call' | 'description', label, kind, refIds[] }` (`3 mail`, `1 görüşme notu`, `Teklif v2.pdf`)
- `ttsAvailable`, `estimatedReadSeconds` (≈120 → "2 dakikalık")

### 3.10 `PostMeetingCapture` (5.7)
- `meetingId`, `personName`, `start`, `end`
- `mode: 'voice' | 'keyboard'`
- `transcript` (live), `elapsedSeconds` (`0:07`), `listeningState: 'listening' | 'paused' | 'stopped'`
- `waveform: number[26]` (normalised amplitudes) and `processedBarCount`
- `detectedCommitments[]`: `{ id, title, dueLabel, dueDate, counterparty { name, kind: 'person' | 'team' }, status: 'detected' | 'edited' | 'discarded' }`
- On `Kaydet` → `MeetingNote { meetingId, text, commitments[] }` persisted; commitments become tasks that surface in Akış / Bugün.

---

## 4. States (loading, empty, error, offline, permissions)

None of these states are drawn on this canvas (they are covered generically in `08 Durumlar`). The `hint-placeholder-count` attributes in the source define the **skeleton shapes**; the rest is inferred and should follow 08.

### 4.1 Skeletons (from `hint-placeholder-count`)
- 5.1 day strip: 7 chips (42×60, radius 14, `neutral/surface-2` shimmer).
- 5.1 timeline: 6 rows (time column 44 wide + card 68 high, radius 14).
- 5.1 hero card: show shell with kicker + 2 text lines + 2 button pills.
- 5.2 chart: 7 columns × 2 bars (use fixture-ish heights at 30% opacity, not zero); insight cards: 2 skeleton rows (icon 20 + 2 lines).
- 5.4/5.5: person row (56 circle + 2 lines), "3 şey" card with 3 numbered rows (keep the card dark so the fold looks right), then 6 section groups × 1 row.
- 5.6: 1 byline + title + 3 paragraph blocks of 4 lines.
- 5.3 and 5.7 have no list placeholders (their data is small); show a spinner-free instant layout.

### 4.2 Empty
- 5.1 timeline, day with no events: replace the timeline with a single `gap`-styled row spanning the working day (`Bugün takvimin boş` — inferred string) and let the hero suggest a use for it.
- 5.1 hero: if no suggestion, hide the hero card entirely (do not show a placeholder).
- 5.2 insights: if none, hide the `TAKVİM ZEKÂSI` kicker and show a single quiet line under the chart (`Bu hafta için bir önerim yok.` — inferred).
- 5.4 evidence: omit empty sections; if the model cannot produce 3 topics, adapt the kicker count.
- 5.7 commitments: hide the card until the first detection.

### 4.3 Error / offline
- Calendar fetch failure: keep last cached day/week (all Plan data is cacheable); show a non-blocking banner at the top of content (`Takvim güncellenemedi · Tekrar dene` — inferred; use `critical/soft` bg + `critical/text`).
- Insight generation failure: silently omit insights (never show an error card for AI content).
- Offline on 5.4: prep is precomputed and cached at T-30 min; if not cached, show the person row + a `warning/soft` note (`Hazırlık çevrimdışı hazırlanamadı.` — inferred) and disable `2 Dakikalık Özeti Oku`.
- Offline on 5.7: voice transcription may need network; fall back to keyboard mode with a note.
- Resolution write failure (5.3): toast `Değişiklik uygulanamadı` (inferred) and keep the sheet open.

### 4.4 Permission-denied
- No calendar connected / permission denied: Plan tab root replaces the day strip + timeline with a connect prompt reusing the 02 Onboarding calendar permission explainer (2.7c) and the `Takvimi Bağla` CTA (string from 02). Segmented control stays visible but inert.
- Microphone/speech denied (5.7): see 5.7 Permissions.
- Notifications denied: the T-20 and T+1 entries are unavailable; 5.4 and 5.7 remain reachable from the timeline/Bugün. Surface a one-time nudge in Hesap (07).

### 4.5 Dark-mode summary
Drawn: 5.1D, 5.5. Not drawn (inferred mappings given inline): 5.2, 5.3, 5.6, 5.7. The two governing rules from the author: (a) "today"/selected states **invert** (`dark/text` bg with `dark/bg` text); (b) a dark ink card becomes an indigo gradient in dark mode; primary buttons become `dark/primary` with `dark/on-primary` text and drop their shadow.

---

## 5. Motion and haptics

The prototype contains no animation code. Explicit motion cues from the author's notes: the "3 şey" card ends the first fold (no parallax needed); the conflict sheet is the default open state of 5.3; commitments "turn into" items as you speak (live detection). Recommended (inferred, align with 08):
- Segmented switch Gün↔Hafta: 200 ms fade + thumb slide; `selection` haptic.
- Day chip select: 150 ms bg colour transition; `selection` haptic.
- Hero `Planla`: card collapses 250 ms; new `ai` row inserts in timeline with a 300 ms fade-in; `notificationSuccess` haptic + toast.
- Insight actions: card slides out to the right 250 ms on dismiss/complete.
- 5.3 sheet: slides up 300 ms with scrim fade; drag-to-dismiss; option tap `impactLight`.
- 5.4 countdown pill: updates every minute; at 5 min switches to critical colours with a single `impactMedium`.
- 5.6 headphones: toggle to `pause`, subtle progress underline in the header (inferred).
- 5.7 waveform: 60 fps amplitude bars; commitment rows spring in (`scale .96 → 1`, 250 ms) with `impactLight`; `Kaydet` → `notificationSuccess`.
- Respect Reduce Motion: replace slides with fades.

---

## 6. Complete i18n string list (verbatim, grouped by screen)

**Shared**
- `Plan` · `Gün` · `Hafta` · `Bugün` · `Akış` · `Asistan`
- `TAKVİM ZEKÂSI`
- Weekday abbreviations: `Pzt` `Sal` `Çar` `Per` `Cum` `Cmt` `Paz`

**5.1 / 5.1D**
- `Yarın 14:00–16:30 arasında 2,5 saat boşluğun var.`
- `Teklif hazırlama görevini buraya yerleştirebilirim.`
- `Planla` · `Başka zaman`
- Timeline: `Haftalık ekip` / `60 dk · Ofis`; `Ürün gözden geçirme` / `30 dk · Online`; `2 saat boşluk` / `Öğle yemeği ve odaklanma için uygun`; `Mehmet ile müşteri toplantısı` / `60 dk · Ofis · Hazırlık hazır`; `Teklif hazırlama` / `Önerilen · 45 dk · AI görev bloğu`; `Başvuru son saati` / `Girişim programı · Mailden tespit edildi`; `Akşam yemeği · Karaköy` / `Rezervasyon · 4 kişi`
- Reusable fragments: `Önerilen`, `Hazırlık hazır`, `AI görev bloğu`, `Mailden tespit edildi`, `Rezervasyon`, `{n} kişi`, `{n} dk`, `Ofis`, `Online`, `{n} saat boşluk`

**5.2**
- `7–13 EYLÜL · YOĞUNLUK` · `18 etkinlik` · `Toplantı` · `Odak` · `Yoğun`
- `Yarın oldukça yoğun.` · `09:00 ve 10:00 toplantıların arka arkaya. Arada mola yok; 10:00'ı 10:15'e kaydırabilirim.` · `10:15'e Kaydır` · `Böyle Kalsın`
- `13:30 doktor randevusu için 12:50'de çıkman gerekebilir.` · `Kadıköy → Nişantaşı · 38 dk trafik tahmini · Randevu maili, 28 Ağu` · `12:40'a Hatırlat`
- `16:00 toplantısı öncesi 45 dakika boşluğun var.` · `Yatırımcı görüşmesi için hazırlık notunu okumaya yeter.` · `Hazırlığı Buraya Koy`
- `Çarşamba 14:00 müşteri toplantısı ile 14:30 doktor çakışıyor.` · `Seçenekleri Gör`

**5.3**
- `ÇARŞAMBA · 10 EYLÜL` · `TAKVİM ÇAKIŞMASI` · `Bu iki etkinlik çakışıyor.`
- `14:00` `Müşteri toplantısı` `60 dk · Mehmet Yılmaz · Ofis`
- `14:30` `Doktor randevusu` `30 dk · Nişantaşı · Randevu maili`
- `Toplantı 15:00'te biter; doktora 38 dakika yol var. Doktor randevusunu kaydırmak en az kişiyi etkiler.`
- `Nasıl çözelim?` · `Seçtiğin çözüm onayına sunulur, otomatik uygulanmaz.`
- `Doktoru 15:45'e al` / `Önerilen · Klinikte 15:45 boş görünüyor`
- `Toplantıyı 13:00'a öner` / `Mehmet'e öneri maili taslağı hazırlanır`
- `Toplantıyı 30 dk kısalt` / `14:00–14:30 · Doktora zamanında yetişirsin`
- `Böyle kalsın` / `Bu çakışmayı bir daha gösterme`

**5.4 / 5.5**
- `TOPLANTIYA HAZIRLAN` · `18 dk`
- `MY` · `Mehmet Yılmaz` · `Müşteri toplantısı · 14:30 · 60 dk · Ofis`
- `KONUŞMAN GEREKEN 3 ŞEY`
- `Fiyat` / `Revize teklif 17:00'ye kadar bekleniyor; %8 indirim sınırını netleştir.`
- `Teslim tarihi` / `Ekim başı için onay istiyor; üretim takvimi 6 Ekim'i gösteriyor.`
- `Sözleşme` / `Taslak 2 haftadır açık; hukuk yorumu bekliyor.`
- `TOPLANTININ AMACI` · `Eylül teklifinin son hâlini netleştirmek ve Ekim teslimatı için onay almak.` · `Takvim davetinden çıkarıldı`
- `SON GÖRÜŞMENİZ` · `1 Eylül · Fiyat aralığı ve teslim süresi konuşuldu. Mehmet revize teklif istedi; sen Cuma göndereceğini söyledin.` · `4 gün önce · Görüşme notları`
- `SON MAİLLER` · `Re: Teklif — “Fiyatı Ekim teslimatına göre güncelleyebilir misiniz?”` · `Mehmet · Dün 18:20` · `Teklif v2 gönderildi (PDF)` · `Sen · 2 Eyl 10:05`
- `AÇIK KONULAR` · `Sözleşme taslağı hukuk yorumu bekliyor` · `14 gün` · `Nakliye maliyeti kimde?` · `1 Eylül görüşmesi`
- `SENDEN BEKLENENLER` · `Revize teklif · PDF` · `Bugün 17:00`
- `SENİN BEKLEDİKLERİN` · `Teklif v2 için geri bildirim` · `3 gündür bekliyor`
- `2 Dakikalık Özeti Oku` · `Not Al`

**5.6**
- `2 DAKİKALIK ÖZET` · `Mehmet Yılmaz · 14:30` · `Nerede kalmıştınız?`
- P1, P2, P3 as transcribed in 5.6 §3 (with emphasised spans `1 Eylül'de`, `2 Eylül'de`, `6 Ekim`)
- `KAYNAKLAR` · `3 mail` · `1 görüşme notu` · `Teklif v2.pdf`

**5.7**
- `TOPLANTI SONRASI` · `Mehmet Yılmaz · 14:30–15:30` · `Toplantın bitti.` · `Takip etmen gereken bir şey var mı?`
- `“Mehmet'e yarın teklif göndereceğim. Sözleşme için hukuktan Perşembe'ye kadar yorum isteyeceğim.”`
- `0:07 · dinleniyor` (fragment `dinleniyor`)
- `2 YENİ TAAHHÜT` (pattern `{n} YENİ TAAHHÜT`)
- `Mehmet'e teklif gönder` / `Yarın · Mehmet Yılmaz`
- `Hukuktan sözleşme yorumu iste` / `Perşembe · Hukuk ekibi`
- `Kaydet`

**Inferred strings (NOT in prototype — confirm with design before shipping):** `Toplantı 10:15'e taşındı`, `Hatırlatıcı kuruldu`, `Çözüm Seç`, `Başladı`, `Not ve {n} taahhüt kaydedildi`, `Kaydı silmek istiyor musun?`, `Mikrofon izni kapalı. Ayarlar'dan açabilirsin.`, `Ayarlar`, `Bugün takvimin boş`, `Bu hafta için bir önerim yok.`, `Takvim güncellenemedi · Tekrar dene`, `Hazırlık çevrimdışı hazırlanamadı.`, `Değişiklik uygulanamadı`, `{personName} ile toplantı 20 dk sonra`, `Toplantın bitti · Takip etmen gereken bir şey var mı?`.

---

## 7. Colours used that have no token yet (proposed additions)

| raw value | where | proposed token |
|---|---|---|
| `#E4E4FA` | hero AI card gradient start (light) | `brand/glow-tint` |
| `#F7F7FE` | timeline `ai` surface (light) | `brand/tint` |
| `#D9D6F7` | week chart meeting bar, waveform pending bars | `brand/soft-strong` |
| `#FDF6EC` | timeline `life` surface, conflict Card B | `life/surface` (or `warning/tint`) |
| `#F3B7AE` | week chart hot top bar, legend `Yoğun` | `critical/soft-strong` |
| `#E0DED7` | past-day dot, sheet grabber | `neutral/hairline-strong` |
| `#C9C5BC` | sheet row chevron | `ink/chevron` |
| `#DCE4F5` / `#2B3F73` | avatar "blue" pair (swap in dark) | `avatar/blue-bg` / `avatar/blue-text` |
| `#3A3936` | dark past-day dot | `dark/hairline-strong` |
| `#5E5B54` | dark gap icon, dark chevron | `dark/disabled` |
| `rgba(217,139,11,.18)` | dark countdown pill bg | `dark/warning-soft` |
| `linear-gradient(160deg,#2C2C7A,#4A4BC8)` | dark "3 şey" card | `gradient/night-indigo` (check against `gradient/night`) |
| `#D6D6FB` | kicker on the indigo gradient card | `brand/on-gradient-kicker` |
| `rgba(27,25,23,.07)` | timeline hour hairline (light) | `neutral/hairline-alpha` |

---

## 8. Dead-in-prototype checklist (everything below must be wired)

- 5.1 / 5.1D: `Gün`/`Hafta` segments; 7 day chips; hero `Planla`, `Başka zaman`; 7 timeline rows; tab bar `Bugün`, `Akış`, `Plan`, `Asistan`.
- 5.2: segments; 7 chart columns; `10:15'e Kaydır`, `Böyle Kalsın`, `12:40'a Hatırlat`, `Hazırlığı Buraya Koy`, `Seçenekleri Gör`; 4 card bodies; tab bar.
- 5.3: back arrow; both event cards; scrim; grabber (drag); `Doktoru 15:45'e al`, `Toplantıyı 13:00'a öner`, `Toplantıyı 30 dk kısalt`, `Böyle kalsın`.
- 5.4 / 5.5: back arrow; `18 dk` countdown (static); person row chevron; 3 "şey" items; 8 evidence rows; `2 Dakikalık Özeti Oku`; `Not Al`.
- 5.6: `close`; `headphones` (TTS); source chips `3 mail`, `1 görüşme notu`, `Teklif v2.pdf`.
- 5.7: `close`; transcript card / waveform (static fixture); 2 commitment rows (check icons are status, not toggles); `Kaydet`; `keyboard` mode switch.
- Cross-screen: T-20 min prep notification and T+1 min silent post-meeting notification are described in captions only; no notification UI is drawn on this canvas (see 08 for notification styling).
