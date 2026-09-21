# 04 · Akış ve Mail Zekâsı — Implementation Spec

Source of truth: `design/claude/04 Akis ve Mail.dc.html` (Claude Design canvas, 23 artboards, 390×844 iPhone frames).
Audience: RN (Expo) + Next.js engineers. Engineers will not read the raw HTML; everything needed is transcribed here.

Page title (design canvas): **"04 · Akış ve Mail Zekâsı"**

Design intro paragraph (verbatim, keep as product principle):

> Akış bir gelen kutusu değil, dikkat akışıdır: tüm kaynaklardan gelen sinyaller tek kart kalıbında (kaynak · rozet · başlık · AI özeti · aksiyon). Ham mail metni hiçbir listede görünmez; yalnızca mail detayında "Orijinal Mail" altında açılır. Her AI çıkarımının altında kaynak satırı vardır.

Three hard rules derived from it:
1. Every signal source (mail, calendar, follow-up, commitment, life signal) renders through the **same feed card pattern**: source · badge · title · AI summary · action.
2. **Raw mail body never appears in a list.** Only the mail detail (4.4) shows it, collapsed under "Orijinal Mail".
3. **Every AI inference carries a source line** ("Kaynak: …").

---

## 0. Shared foundations for this file

### 0.1 Artboard list

| ID | Name (design's own) | Surface type |
|----|---------------------|--------------|
| 4.1 | Akış · Tümü | Tab (Akış), light |
| 4.2 | Akış · Kişisel filtresi · Dark | Tab (Akış), dark |
| 4.3 | Mail Zekâsı · Gelen kutusu yerine anlama | Stack push |
| 4.4 | Mail Detayı · AI özeti önce | Stack push |
| 4.5 | AI Yanıt Taslağı · Onay gerektirir | Stack push |
| 4.6 | Akıllı Takip · Senin cevap beklediklerin | Stack push |
| 4.7 | Senden Beklenenler · Acil / Bugün / Yakında | Stack push |
| 4.8 | Taahhütler · Verdiğin sözler | Stack push |
| 4.9 | Yaşam Zekâsı · 6 kart kalıbı | Stack push |
| 4.10 | Evrensel Yakalama · Ekran görüntüsü | Modal (full-screen "Ekle") |
| 4.11 | Yakalama · Fatura fotoğrafı + Akıllı hatırlatıcı | Modal + bottom sheet |
| 4.12a | Yakalama · PDF · Seçim | Modal + bottom sheet |
| 4.12b | Yakalama · PDF · Analiz ediliyor | Modal (state) |
| 4.12c | Yakalama · PDF · Tespit + öneriler | Modal (state) |
| 4.12d | Yakalama · PDF · Onay | Modal + bottom sheet |
| 4.13a | Yakalama · Link · Giriş | Modal |
| 4.13b | Yakalama · Link · Analiz ediliyor | Modal (state) |
| 4.13c | Yakalama · Link · Tespit + öneriler | Modal (state) |
| 4.13d | Yakalama · Link · Onay | Modal + bottom sheet |
| 4.14a | Yakalama · Metin · Giriş | Modal |
| 4.14b | Yakalama · Metin · Analiz ediliyor | Modal (state) |
| 4.14c | Yakalama · Metin · Tespit + öneriler | Modal (state) |
| 4.14d | Yakalama · Metin · Onay + başarı | Modal (terminal state + toast) |

### 0.2 Interactivity in the prototype

**This artboard file contains no click handlers at all.** The only script is a `renderVals()` that maps static data arrays into the templates (feed, mailCats, follow, waiting, commits, life) and creates two spinner elements. Everything listed under "Interactive elements" below is therefore **dead in the prototype** and must be wired by engineering. The per-screen "Dead in prototype" sections list what the design intends each control to do.

(The 4.5 design note says "Ton seçimi taslağı anında değiştirir (prototipte çalışır)" — that claim refers to the main interactive prototype (`Dijital Asistan.dc.html`), not this file. Here the segmented control is static.)

### 0.3 Device frame & chrome (do not ship the frame; ship the contents)

- Frame 390×844, bg `neutral/bg`, corner 44 (device only).
- Status bar 54 high, time bottom-aligned, `15/600`. Times used: `9:41` (light), `21:14` (dark).
- Home indicator 134×5, radius 3, `rgba(27,25,23,.25)` light / `rgba(255,255,255,.4)` dark. Use native safe-area instead.
- Horizontal content padding: **20**.

### 0.4 Component patterns reused across this file

**nav/top-bar (stack screens)** — row, space-between, padding-top 6.
- Left: **circle button** 36×36, radius 50 %, bg `neutral/surface`, shadow `0 1px 2px rgba(27,25,23,.08)`, icon 20 (`arrow_back` on pushed screens, `close` on modals, `search`, `more_horiz`).
- Center: **kicker** `12/16 600 +8% caps ink/tertiary` (e.g. `MAİL ZEKÂSI · BUGÜN`, `EKLE · PDF`).
- Right: another circle button or a 36-wide spacer to keep the title centered.

**tab/header (Akış tab)** — `h1 28/34 600 -2%` title left; right "Ekle" pill (see 4.1).

**card/feed** (the "tek kart kalıbı") — bg `neutral/surface`, radius **20**, padding `14 16 10`, shadow `0 1px 2px rgba(27,25,23,.04), 0 6px 20px rgba(27,25,23,.05)`.
- Row 1 (gap 8, center): icon tile 28×28 radius 9 bg `neutral/surface-2` color `ink/secondary` icon 17 → source text `12 ink/tertiary` (flex 1, single-line ellipsis) → **badge** → time `12 ink/tertiary`.
- Title: mt 10, `16/22 600 -1%` (card/title; sits between body and h3 — add as token `card/title`), `text-wrap: pretty`.
- Summary: mt 4, `14/20 ink/secondary`.
- Action link: mt 6, padding-top 8, `14/600 brand/text-on-soft`, text only (no chevron).

**badge** — `11/14 700 +5%`, padding `3 8`, radius 999. Tone map (light):

| tone | bg | fg | used for |
|------|----|----|----------|
| critical | `critical/soft` | `critical/text` | ACİL, GÜVENLİK, GECİKMİŞ |
| warning | `warning/soft` | `warning/text` | SON TARİH, BUGÜN (commitments) |
| neutral | `neutral/surface-2` | `ink/secondary` | BUGÜN (feed), TAKİP, TAAHHÜT, KARGO, UÇUŞ, ÖDEME, ABONELİK, REZERVASYON, AÇIK |
| success | `success/soft` | `success/text` | TAMAMLANDI |
| info | `info/soft` | `info/text` | (reserved; used on item tiles) |

Dark tone map: critical `rgba(224,85,63,.18)` / `dark/critical-text`; warning `rgba(217,139,11,.18)` / `dark/warning-text`; neutral `dark/surface-2` / `dark/secondary`.

Rule (design note 4.1): **colored badges only for ACİL, SON TARİH and GÜVENLİK; every other badge is neutral.** (Commitment badges GECİKMİŞ/BUGÜN/TAMAMLANDI are the exception in 4.8.)

**card/ai-insight** — bg `radial-gradient(140% 100% at 0% 0%, #E4E4FA 0%, #FFFFFF 60%)` (top-left brand tint fading into surface), radius 20, padding 16, same shadow as card/feed.
- Header: `auto_awesome` (FILL 1) 16 + kicker `12/600 +6% brand/primary` (e.g. `AI ÖZETİ`, `ETKİNLİK TESPİT EDİLDİ`).
- Title: mt 8, `20/26 600 -2%` (capture screens) or `17/24 500 -1%` (mail summary).
- Optional chips row (mt 8), body `13/19 ink/secondary` or `14/20 ink/secondary`, and source line.
- Dark: use `dark/surface` with a subtle `dark/primary-glow` 10 % radial tint at top-left.

**list/group** — bg surface, radius 18, padding `4 16`; rows padding `12 0`, divider `1px rgba(27,25,23,.06)` (= `neutral/hairline` at 6 % alpha) on every row except the first.

**item/row (detected item)** — inside list/group; align-start; tile 30×30 radius 10 (tone-tinted) icon 17; kicker `11/700 +6%` (tone text); title `15/21 500`; meta `12 ink/tertiary`; trailing `check_circle` (FILL 1) 22 `brand/primary` when selected, `radio_button_unchecked` 22 `#C9C5BC` when not.

Item tile tones: SON TARİH / HATIRLATICI → `warning/soft`+`warning/text` (icon `flag` / `notifications`); ETKİNLİK / TAKVİM OLAYI → `info/soft`+`info/text` (`event`); GÖREV → `neutral/surface-2`+`ink/secondary`, kicker `ink/tertiary` (`add_task`); generic reminder/bookmark → neutral (`notifications`, `bookmark`).

**chip/action (38)** — h 38, padding `0 12`, radius 12, `13/600`, optional leading icon 16, gap 4.
- primary-soft: bg `brand/soft`, fg `brand/text-on-soft`
- neutral: bg `neutral/surface-2`, fg `ink/secondary`
- ghost: no bg, fg `ink/secondary` (usually `margin-left:auto`)

**chip/pill (30)** — h 30, padding `0 10`, radius 999, `12/600`, icon 15, gap 4. Variants: neutral (`neutral/surface-2`/`ink/secondary`), brand-soft (`brand/soft`/`brand/text-on-soft`), surface (`neutral/surface` + shadow `.06`), selected-dark (`ink` bg, white fg, `check` 14 icon).

**button/primary (52)** — h 52, radius 16, bg `brand/primary`, white `15/600`, optional icon 20 gap 8; hero variant adds shadow `0 8px 24px rgba(91,92,226,.28)`. Pressed → `brand/primary-pressed`.
**button/secondary (52)** — h 52, padding `0 18`, radius 16, bg `neutral/surface`, `ink 15/600`, shadow `0 1px 2px rgba(27,25,23,.06)`.
**button/sheet-row (48)** — h 48, radius 14, `14/600`: primary (`brand/primary`/white, flex 1), soft (`brand/soft`/`brand/text-on-soft`, padding `0 14`), neutral (`neutral/surface-2`/`ink/secondary`, padding `0 14`).
**button/ghost (48)** — h 48, radius 14, no bg, `ink/secondary 14/600`, centered (`İptal`).
**button/dark (48)** — h 48, padding `0 22`, radius 14, bg `ink`, white `15/600` (`Bugün'e Dön`).

**sticky/cta-bar** — `position: sticky; bottom: 0`, padding `16 20 44`, bg `linear-gradient(180deg, rgba(245,244,240,0) 0%, neutral/bg 45%)`, row gap 10: primary (flex 1, hero shadow) + secondary. Scroll content gets bottom padding **130** to clear it.

**sheet/bottom** — bg `neutral/surface`, radius `28 28 0 0`, padding `10 20 44`, shadow `0 -10px 40px rgba(27,25,23,.12)`; grabber 36×5 radius 3 `#E0DED7` centered, mb 14; title `19/600 -1%`; subtitle mt 2 `13 ink/secondary`; body mt 12. Scrim over content: `rgba(27,25,23,.35)`.
- Sheet rows: min-h 52 (options) / 60 (rich rows), divider top `1px rgba(27,25,23,.06)`, `15/500`; a highlighted/selected row gets bg `#F7F7FE` (brand at ~4 %), radius 12, `margin: 0 -8; padding: 0 8`.

**source-tiles (capture entry)** — 4 tiles, flex 1 each, h 64, radius 16, column, gap 4, `12/600`; default bg surface + shadow `.06`, label `ink/secondary`, icon 22 `brand/primary`; **selected**: bg `brand/soft`, label and icon `brand/text-on-soft`. Order and labels: `photo_camera` **Fotoğraf** · `screenshot` **Ekran görüntüsü** · `picture_as_pdf` **PDF** · `link` **Link**.

**preview/placeholder** — radius 20, bg `repeating-linear-gradient(135deg, neutral/hairline 0 10px, neutral/surface-2 10px 20px)` (diagonal stripes = image placeholder), centered mono label (`500 12px ui-monospace`, bg surface, padding `6 10`, radius 8). Detection overlay: 2 px `brand/primary` rectangle (radius 6–8) + tag `10/700 +6% brand/primary` on `brand/soft`, padding `2 6`, radius 4, placed just above the box.

**progress/findings card ("bulgu listesi")** — bg surface, radius 20, padding 16, shadow. Header: **spinner 16** + `12/600 +6% brand/primary` (`… ANALİZ EDİLİYOR…`). Rows mt 14, gap 12, `15`:
- done: `check_circle` FILL 1, 22, `success` (#2FA062) + label (+ optional right detail `12 ink/tertiary`)
- active: **spinner 22** + label ending with "…"
- pending: opacity .4, hollow circle 22 (border 2 `#C9C5BC`) + label
No progress bar (design note: "ilerleme çubuğu yok, bulgu listesi").
Spinner: circle, border 2 `#D9D6F7` (track), border-top `brand/primary`, `rotate 360° .8s linear infinite`.

**privacy line** — `lock` 16 + `12 ink/tertiary`, padding `0 4`.
**assurance line** — `verified_user` 18/16 `success/text` + `13 ink/secondary` / `12 ink/tertiary`.
**source line** — `verified` 16 + `12 ink/tertiary` (`Kaynak: …`).

**toast** — bg `ink`, white `14/500`, radius 999, padding `12 18 12 14`, gap 8, `check` 18 `brand/dark-glow`, trailing action `brand/dark-glow 600` ("Geri al"); shadow `0 10px 30px rgba(27,25,23,.25)`; floats 104 from bottom, 16 side insets, auto-dismiss 5 s.

**avatar/initials** — circle, `600`, initials; sizes 22 (chip), 28 (mail card), 40 (person card), 44 (detail header). Palette used in this file (not in the token list; add as `avatar/*`):

| name | bg | fg |
|------|----|----|
| avatar/blue | `#DCE4F5` | `#2B3F73` |
| avatar/green | `#E3EFE6` | `#1E5A36` |
| avatar/terracotta | `#F5E1D6` | `#7A3E1F` |
| avatar/neutral | `neutral/surface-2` | `ink/secondary` |

Other raw values with no token: `#C9C5BC` (chevrons / unchecked radios — between ink/tertiary and ink/disabled; map to `ink/disabled` if you must pick one), `#C9C7F3` (band chart middle slice ≈ brand at 35 %), `#E0DED7` (sheet grabber), `#D9D6F7` (spinner track), `#F7F7FE` (selected sheet row), `#E4E4FA` (AI card gradient start).

### 0.5 Bottom navigation (tab bar)

h 90, padding `8 8 28`, bg `rgba(255,255,255,.92)` + `backdrop-filter: blur(20px)`, border-top `1px rgba(27,25,23,.06)`; 4 equal columns; icon 26 + label `11/500`, gap 3.

| order | icon | label |
|-------|------|-------|
| 1 | `sunny` | Bugün |
| 2 | `dynamic_feed` | Akış |
| 3 | `calendar_today` | Plan |
| 4 | `auto_awesome` | Asistan |

Active: `brand/primary`, icon FILL 1. Inactive: `ink/tertiary`.
Dark: bg `rgba(20,19,17,.92)`, border `rgba(255,255,255,.08)`, active **`dark/primary-glow` (#A9AAF5)** (note: the artboard uses the glow, not `dark/primary` #8586F2), inactive `dark/tertiary`.

### 0.6 Skeleton hints (from `hint-placeholder-count`)

| list | skeleton rows |
|------|---------------|
| feed (4.1 / 4.2) | 5 |
| mailCats (4.3) | 6 |
| follow (4.6) | 3 |
| waiting groups (4.7) | 3 groups × 1 card |
| commits (4.8) | 4 |
| life (4.9) | 6 |

Skeleton = same card footprint, `neutral/surface-2` blocks with shimmer.

### 0.7 Dark-mode token mapping (only 4.2 is drawn dark; apply to all screens)

| light | dark |
|-------|------|
| neutral/bg | dark/bg |
| neutral/surface (cards, sheets, circle buttons) | dark/surface + ring `0 0 0 1px rgba(255,255,255,.06)` instead of shadow |
| neutral/surface-2 (tiles, neutral chips) | dark/surface-2 |
| ink | dark/text |
| ink/secondary | dark/secondary |
| ink/tertiary | dark/tertiary |
| brand/text-on-soft (action links) | dark/primary-glow |
| brand/primary (filled buttons) | dark/primary, text `dark/on-primary` |
| selected filter chip (`ink` bg / white) | `dark/text` bg / `dark/bg` fg |
| critical/warning/success/info text | dark/critical-text, dark/warning-text, dark/success-text, info: lighten |

---

## 4.1 Akış · Tümü (Light)

**Purpose.** The attention stream — the second tab. All sources merged into one list, sorted urgency → time.
**Navigation.** Tab **Akış** (bottom nav, active). Cards push to their detail (mail → 4.4, follow → 4.6, commitment → 4.8, life → 4.9 card or its own action, calendar → Plan detail).

### Layout (top → bottom)
1. Status bar (54).
2. **tab/header** (padding `14 20 0`): title **"Akış"** `h1 28/34 600 -2%`; right **"Ekle" pill**: h 36, padding `0 12 0 8`, radius 999, bg `neutral/surface`, fg `brand/text-on-soft 12/600`, icon `add_a_photo` 18, gap 4, shadow `0 1px 2px rgba(27,25,23,.06)`.
3. **Filter chip row** (gap 8, horizontal scroll, padding `0 20`, `13/600`): h 34, padding `0 14`, radius 999. Selected = bg `ink`, fg white; unselected = bg `neutral/surface`, fg `ink/secondary`.
   Chips in order: **Tümü** (selected) · **Önemli** · **Mail** · **Takvim** · **Takip** · **Kişisel**.
4. **Meta line** `13 ink/secondary`, padding `0 20`: **"10 konu · 5 önemli · Son analiz 09:40"** — template `{count} konu · {importantCount} önemli · Son analiz {HH:mm}`.
5. **Feed list**: column, gap 12, padding `0 20 16`, `card/feed` × N (see data below).
6. Bottom nav (Akış active).

Section gap between 2/3/4/5: 14.

### Copy (verbatim)
- Title: `Akış`
- Ekle button: `Ekle`
- Filters: `Tümü`, `Önemli`, `Mail`, `Takvim`, `Takip`, `Kişisel`
- Meta: `10 konu · 5 önemli · Son analiz 09:40`

### Example data — `FEED` (transcribed from script, in display order)

| # | icon | src | time | badge (tone) | title | sum (AI summary) | action |
|---|------|-----|------|--------------|-------|------------------|--------|
| 1 | `mail` | Gmail · Ahmet Yılmaz | 08:42 | ACİL (critical) | Revize teklif bugün 17:00'ye kadar bekleniyor | Ahmet, fiyat ve teslim tarihini güncellenmiş PDF olarak istiyor. | Yanıtla |
| 2 | `event` | Google Takvim | 14:30 | BUGÜN (neutral) | Mehmet ile müşteri toplantısı | Son görüşmeniz 4 gün önceydi. Açık 2 konu var. | Hazırlan |
| 3 | `schedule_send` | Gmail · Mehmet Yılmaz | 3 gün | TAKİP (neutral) | Teklif mailine cevap gelmedi | 2 Eylül'de gönderildi. Henüz yanıt yok. | Takip Mesajı Hazırla |
| 4 | `mail` | Gmail · Girişim Programı | Dün | SON TARİH (warning) | Başvuru bugün 17:00'de kapanıyor | Son gün. Form yaklaşık 10 dakika sürüyor. | Takvime Ekle |
| 5 | `shield` | Google | 07:12 | GÜVENLİK (critical) | Google hesabında yeni giriş | Chrome · Windows · İstanbul. Sen değilsen şifreni değiştir. | Kontrol Et |
| 6 | `handshake` | Taahhüt · Toplantı notu | Yarın | TAAHHÜT (neutral) | Mehmet'e teklif gönder | "Yarın göndereceğim" dedin. Plan'da 14:00 bloğu önerildi. | Planla |
| 7 | `package_2` | Kargo · Trendyol | Bugün | KARGO (neutral) | Siparişin bugün geliyor | Teslimat aralığı 14:00–18:00. | Takip Et |
| 8 | `flight` | THY | Yarın 09:15 | UÇUŞ (neutral) | TK2412 · İstanbul → Antalya | Online check-in açıldı. 06:45'te evden çıkman gerekebilir. | Check-in |
| 9 | `receipt_long` | CK Enerji | 10 Eyl | ÖDEME (neutral) | Elektrik faturası · 1.842 TL | Son ödeme günü 10 Eylül. | Hatırlat |
| 10 | `autorenew` | Netflix | 9 Eyl | ABONELİK (neutral) | Netflix 9 Eylül'de yenilenecek | Aylık 229,99 TL. Son 30 günde 2 kez izlendi. | İncele |

Note: the summary of #6 uses curly quotes: `“Yarın göndereceğim” dedin.`

### Interactive elements
| element | intended behaviour |
|---------|--------------------|
| "Ekle" pill | opens Universal Capture modal (4.12a entry state: text field + 4 source tiles) |
| Filter chips | client-side filter of the feed; `Kişisel` = life signals only (4.2); `Mail` → mail items (and entry to 4.3 Mail Zekâsı via a header link — not drawn); `Takip` → follow-ups (4.6-type items); `Takvim` → calendar items; `Önemli` → critical + warning + flagged |
| Card body tap | push detail by kind: mail → 4.4; follow-up → 4.6; commitment → 4.8; calendar → Plan event detail (file 05); life → 4.9 / native action |
| Card action link | direct action: `Yanıtla` → 4.5 draft; `Hazırlan` → meeting prep (file 05); `Takip Mesajı Hazırla` → 4.5 in follow-up tone; `Takvime Ekle` → confirmation sheet (4.12d pattern, 1 item); `Kontrol Et` → open Google security page / in-app security card; `Planla` → Plan block suggestion (file 05); `Takip Et` → carrier tracking; `Check-in` → airline check-in URL; `Hatırlat` → smart reminder sheet (4.11); `İncele` → subscription review |
| Swipe right | **Tamamlandı** (mark done, remove from stream, undo toast) |
| Swipe left | **Ertele / Önemli değil** (two-option reveal: snooze via 4.11 sheet, or downgrade) |
| Pull-to-refresh | re-run analysis; updates "Son analiz HH:mm" |
| Bottom nav | switch tabs |

**Dead in prototype:** all of the above (no handlers). Design note verbatim: *"Sıralama: aciliyet → zaman. Renkli rozet yalnızca ACİL, SON TARİH ve GÜVENLİK için; diğer rozetler nötr. Sağa kaydırma: Tamamlandı, sola kaydırma: Ertele / Önemli değil."*

### States
- Loading: 5 skeleton cards (0.6). Meta line shows `Son analiz …` skeleton.
- Empty (not drawn): keep header + chips; show a quiet empty card. Proposed copy (engineering to confirm with design): `Şimdilik dikkatini gerektiren bir şey yok.`
- Error / offline (not drawn): show last cached feed + a neutral banner; see file 08 (Durumlar) for the canonical banner.
- Permission-denied (mail/calendar not connected): feed shows only capture-derived items; see file 02/07 for the connect CTA.
- Dark: 4.2.

### Motion / haptics
- Swipe reveal uses the same physics as iOS Mail; medium haptic on threshold; card collapses (height → 0, 200 ms) on Tamamlandı.
- New items after refresh slide in from top with 12 px offset fade.

### Data fields per feed item
`id`, `kind` (mail | calendar | followup | deadline | security | commitment | shipment | flight | payment | subscription | reservation), `sourceIcon`, `sourceLabel` (`"Gmail · Ahmet Yılmaz"`), `timeLabel` (relative/absolute string), `badge` (label), `tone` (critical | warning | neutral | success | info), `title`, `summary` (AI), `primaryAction` `{label, type, payload}`, `urgencyScore`, `occursAt`, `sourceRef` (provider, messageId/eventId), `state` (open | done | snoozed | dismissed).

---

## 4.2 Akış · Kişisel filtresi · Dark

**Purpose.** Same tab with the **Kişisel** filter active, rendered in dark mode. Shows the "yaşam zekâsı" subset (kargo, uçuş, ödeme, abonelik, rezervasyon, güvenlik).
**Navigation.** Tab Akış, filter = Kişisel.

### Layout differences vs 4.1
- Frame bg `dark/bg`, text `dark/text`. Status time `21:14`.
- "Ekle" pill: bg `dark/surface`, fg `dark/primary-glow`, ring `0 0 0 1px rgba(255,255,255,.08)` (no drop shadow).
- Filter chips: bg `dark/surface`, fg `dark/secondary`; selected **Kişisel**: bg `dark/text` (#F2F0EB), fg `dark/bg` (#141311).
- Meta line: **"6 konu · 1 önemli"** `13 dark/secondary` (no "Son analiz" segment in this variant).
- Cards: bg `dark/surface`, ring `0 0 0 1px rgba(255,255,255,.06)`; icon tile bg `dark/surface-2` fg `dark/secondary`; source `dark/tertiary`; badge dark tone map; title `dark/text`; summary `dark/secondary`; action `dark/primary-glow`.
- Bottom nav dark (0.5).

### Example data — `feedDark` (FEED filtered to badges GÜVENLİK, KARGO, UÇUŞ, ÖDEME, ABONELİK, plus one extra)

| # | icon | src | time | badge | title | sum | action |
|---|------|-----|------|-------|-------|-----|--------|
| 1 | `shield` | Google | 07:12 | GÜVENLİK (critical) | Google hesabında yeni giriş | Chrome · Windows · İstanbul. Sen değilsen şifreni değiştir. | Kontrol Et |
| 2 | `package_2` | Kargo · Trendyol | Bugün | KARGO | Siparişin bugün geliyor | Teslimat aralığı 14:00–18:00. | Takip Et |
| 3 | `flight` | THY | Yarın 09:15 | UÇUŞ | TK2412 · İstanbul → Antalya | Online check-in açıldı. 06:45'te evden çıkman gerekebilir. | Check-in |
| 4 | `receipt_long` | CK Enerji | 10 Eyl | ÖDEME | Elektrik faturası · 1.842 TL | Son ödeme günü 10 Eylül. | Hatırlat |
| 5 | `autorenew` | Netflix | 9 Eyl | ABONELİK | Netflix 9 Eylül'de yenilenecek | Aylık 229,99 TL. Son 30 günde 2 kez izlendi. | İncele |
| 6 | `restaurant` | Rezervasyon · Karaköy Lokantası | Cmt 20:30 | REZERVASYON | Akşam yemeği rezervasyonu | 4 kişi. Teyit için 18:00 son saat. | Teyit Et |

Design note verbatim: *"Kişisel filtre = yaşam zekâsı: kargo, uçuş, ödeme, abonelik, rezervasyon, güvenlik. Aynı kart kalıbı; yalnızca ikon değişir."*

**Dead in prototype:** same as 4.1. `Teyit Et` → reservation confirm (open provider link or in-app confirm + note).

---

## 4.3 Mail Zekâsı · Gelen kutusu yerine anlama

**Purpose.** The "understanding instead of inbox" summary for today's mail: one big number story (83 → 6), a three-slice band, fixed category list, then the important mails as `card/mail`.
**Navigation.** Stack push (from Bugün brief "mail" card, or from Akış `Mail` filter header). Back arrow returns.

### Layout (padding `6 20 24`, column gap 16)
1. **nav/top-bar**: back circle · kicker **"MAİL ZEKÂSI · BUGÜN"** · search circle (`search`).
2. **Hero stat block** (padding `6 0`):
   - Row baseline gap 10: **"83"** `44/48 600 -3%` + **"mail geldi"** `17 ink/secondary`.
   - mt 6: **"6 tanesi dikkat gerektiriyor."** `h2 22/28 600 -2%`, the number **6** in `brand/primary`.
   - mt 6: **"77'sini senin için okudum; 44'ü düşük öncelikli, 31'i bilgilendirme."** `14/20 ink/secondary`.
3. **Band chart**: h 8, radius 4, gap 2 between slices: 7 % `brand/primary` (dikkat), 37 % `#C9C7F3` (bilgi), 53 % `neutral/hairline` (düşük). Widths = counts / total (6, 31, 44 of 83 → 7/37/53 %). No labels; the sentence above is the legend.
4. **Category list/group** (radius 18, padding `4 16`): 6 rows, each: tile 30×30 radius 10 + label `15/500` (flex 1) + count `15/600` + `chevron_right` 18 `#C9C5BC`. "Hot" rows: tile `brand/soft`/`brand/text-on-soft`, count `brand/primary`; others tile `neutral/surface-2`/`ink/secondary`, count `ink/secondary`.
5. **Kicker** "ÖNEMLİ · 3" `12/600 +8% ink/tertiary`, padding `4 4 0`.
6. Three **card/mail** cards (gap 16).

### Example data — `CATS` (fixed order; never hide a category, show 0)

| icon | label | count | hot |
|------|-------|-------|-----|
| `priority_high` | Önemli | 3 | yes |
| `person` | Senden cevap bekleyen | 2 | yes |
| `schedule_send` | Senin cevap beklediğin | 1 | no |
| `flag` | Son tarih içeren | 2 | no |
| `info` | Bilgilendirme | 31 | no |
| `low_priority` | Düşük öncelik | 44 | no |

### card/mail pattern
Same shell as card/feed. Row 1: **avatar 28** (initials `11/600`) · name `13/600` (flex 1) · optional badge · time `12 ink/tertiary`. Body mt 8 `15/21` (AI one-liner, no subject line). Action mt 6 pt 8 `14/600 brand/text-on-soft`.

| avatar | name | badge | time | body | action |
|--------|------|-------|------|------|--------|
| AY (avatar/terracotta) | Ahmet Yılmaz | ACİL (critical) | 08:42 | Revize fiyat teklifini bugün 17:00'ye kadar PDF olarak istiyor. | Yanıt Hazırla |
| SK (avatar/green) | Selin Kaya | — | Dün 15:40 | Sözleşme taslağının 4. maddesi için yorumunu bekliyor; yarın öğlen hukuka gidecek. | Yanıt Hazırla |
| GP (avatar/neutral) | Girişim Programı | SON TARİH (warning) | Dün | Başvuru bugün 17:00'de kapanıyor; form yaklaşık 10 dakika. | Takvime Ekle |

### Copy (verbatim)
`MAİL ZEKÂSI · BUGÜN` · `83` · `mail geldi` · `6 tanesi dikkat gerektiriyor.` · `77'sini senin için okudum; 44'ü düşük öncelikli, 31'i bilgilendirme.` · `ÖNEMLİ · 3` · category labels above · `Yanıt Hazırla` · `Takvime Ekle`.
Templates: `{total} mail geldi`, `{attention} tanesi dikkat gerektiriyor.`, `{read}'sini senin için okudum; {low}'ü düşük öncelikli, {info}'i bilgilendirme.` — Turkish suffix agreement varies with the number (ünlü uyumu); implement with an ICU/suffix helper, do not concatenate.

### Interactive elements / Dead in prototype
| element | intended |
|---------|----------|
| back | pop |
| search | mail search (semantic; not drawn) |
| Önemli row | scroll to / open list of important mails |
| Senden cevap bekleyen | push **4.7** |
| Senin cevap beklediğin | push **4.6** |
| Son tarih içeren / Bilgilendirme / Düşük öncelik | push filtered list (card/mail list, not drawn) |
| card/mail tap | push **4.4** |
| Yanıt Hazırla | push **4.5** |
| Takvime Ekle | confirmation sheet (4.12d pattern, 1 item) |

Design note verbatim: *"Büyük sayı yalnızca burada: 83 → 6 hikâyesi. Bant grafiği üç dilim (dikkat / bilgi / düşük). Kategoriler sabit; boş kategori sayısı 0 olur, gizlenmez."*

### States
- Loading: hero numbers as skeleton blocks; 6 category skeleton rows; 3 card skeletons.
- Zero mail: `0` / `mail geldi`, second line e.g. `Bugün dikkat gerektiren mail yok.` (proposed), band all `neutral/hairline`, categories all 0 (still listed).
- Mail not connected: replace hero with connect card (file 07 pattern).
- Dark: per 0.7; band middle slice → `dark/primary-glow` at 45 %.

### Data fields
Summary: `date`, `total`, `attentionCount`, `readByAiCount`, `lowPriorityCount`, `infoCount`, `lastAnalyzedAt`, `categories[] {key, label, count, hot}`. Mail card: `threadId`, `senderName`, `senderInitials`, `avatarTone`, `badge/tone`, `receivedAt`, `aiOneLiner`, `primaryAction`.

---

## 4.4 Mail Detayı · AI özeti önce

**Purpose.** Single mail thread: who · subject · AI summary · suggested actions · original mail (collapsed) · source line.
**Navigation.** Stack push from any mail card. Back pops.

### Layout (padding `6 20 40`, gap 16)
1. **nav/top-bar**: back circle · (no center kicker) · right group gap 8: badge **ACİL** (padding `4 9`) + `more_horiz` circle.
2. **Sender row** (gap 12): avatar 44 `15/600` (**MY**, avatar/blue) · name **"Mehmet Yılmaz"** `16/600 -1%` + `star` FILL 1 16 `brand/primary` (VIP marker) · meta **"Bugün 08:42 · Gmail · Sana"** `13 ink/secondary`.
3. **Subject** **"Re: Eylül teklifi – revize fiyat"** `h2 22/28 600 -2%` (en dash).
4. **card/ai-insight**:
   - kicker **"AI ÖZETİ"**
   - summary mt 8 **"Mehmet revize fiyat teklifinin bugün 17:00'ye kadar gönderilmesini istiyor."** `17/24 500 -1%`
   - kicker mt 12 **"ÖNEMLİ NOKTALAR"** `12/600 +6% ink/tertiary`
   - bullets mt 6, gap 6, `14/20`, each with 6 px `brand/primary` dot: **"Revize fiyat"**, **"Deadline 17:00"**, **"PDF gönderilecek"**.
5. Kicker **"ÖNERİLEN AKSİYONLAR"** `12/600 +8% ink/tertiary`, padding `0 4`.
6. **Action grid** 2×2, gap 10, each h 56, padding `0 14`, radius 16, `14/600`, icon 20, gap 8:
   - **Yanıt Hazırla** (`edit_note`) — filled `brand/primary`, white
   - **Görev Oluştur** (`add_task`) — surface, icon `brand/primary`, shadow `.06`
   - **Takvime Ekle** (`event`) — surface
   - **Hatırlat** (`notifications`) — surface
7. **Orijinal Mail accordion** (card radius 18, overflow hidden): header h 52, padding `0 16`, `15/600`, left `mail` 20 `ink/secondary` + **"Orijinal Mail"**, right `expand_less` 22 `ink/tertiary` (expanded in artboard; **default collapsed** per note → show `expand_more`). Body: padding `12 16 16`, `14/21`, `white-space: pre-wrap`, border-top `1px rgba(27,25,23,.06)`:
   ```
   Merhaba Yunus,

   Geçen hafta konuştuğumuz teklifi revize edebilir misin? Yönetim bugün saat 17:00'ye kadar güncellenmiş fiyatı PDF olarak görmek istiyor. Teslim tarihini de netleştirsek iyi olur.

   Teşekkürler,
   Mehmet
   ```
8. **Source line**: `verified` 16 + **"Kaynak: Gmail · mehmet.yilmaz@… · Gelen Kutusu · Konu dizisi 4 mail"** `12 ink/tertiary`, padding `0 4`. Always last, pinned at bottom of content.

Design note verbatim: *"Sıra: kim · konu · AI özeti · aksiyonlar · orijinal. Orijinal mail varsayılan kapalı ama her zaman bir dokunuş uzakta; kaynak satırı en altta sabittir."*

Data inconsistency to be aware of: 4.3/feed name the ACİL sender **Ahmet Yılmaz**, 4.4/4.5 use **Mehmet Yılmaz** for the same thread. Treat as one example contact; do not hard-code.

### Interactive elements / Dead in prototype
| element | intended |
|---------|----------|
| back | pop |
| `more_horiz` | overflow menu (not drawn): Önemli değil, Göndereni sessize al, Gmail'de aç, Paylaş |
| star | toggle VIP contact |
| Yanıt Hazırla | push **4.5** |
| Görev Oluştur | confirmation sheet (4.12d pattern) with a GÖREV row prefilled from summary |
| Takvime Ekle | confirmation sheet with TAKVİME EKLE row (deadline 17:00) |
| Hatırlat | smart reminder sheet **4.11** |
| Orijinal Mail header | toggle accordion (animate height, chevron rotate) |
| Source line | tap → open in Gmail (deep link) |

### States
- Loading: sender row + subject skeleton; AI card shows a 3-line shimmer with the kicker `AI ÖZETİ` visible.
- AI summary unavailable: card shows `Özet hazırlanamadı` + retry (proposed); actions grid still works; Orijinal Mail auto-expanded.
- Offline: cached summary; actions that need network disabled (`ink/disabled`).
- Dark: per 0.7.

### Data fields
`threadId`, `messageId`, `sender {name, email, initials, avatarTone, isVip}`, `receivedAt`, `provider` (Gmail/Outlook), `recipientLabel` ("Sana"), `subject`, `badge/tone`, `ai {summary, keyPoints[], generatedAt}`, `suggestedActions[] {type, label}`, `originalBody` (plain text), `folder`, `threadCount`, `senderEmailMasked`.

---

## 4.5 AI Yanıt Taslağı · Onay gerektirir

**Purpose.** AI-drafted reply with tone selector; nothing sends without explicit approval.
**Navigation.** Stack push from `Yanıt Hazırla` (4.3/4.4/4.7) or `Takip Mesajı Hazırla` (4.1/4.6, follow-up tone). Back pops (confirm discard if edited).

### Layout (padding `6 20 44`, gap 16, fixed height — draft card flexes)
1. **nav/top-bar**: back · kicker **"YANIT TASLAĞI"** · spacer.
2. **Recipient row** `14 ink/secondary`, gap 8: **"Kime"** + person chip (h 30, padding `0 10 0 4`, radius 999, bg surface, `ink 600`, avatar 22 **MY** avatar/blue, shadow `.06`) **"Mehmet Yılmaz"**; right-aligned **"Re: Eylül teklifi"** `12`.
3. **Tone segmented control**: container bg `neutral/hairline`, radius 999, padding 3, `13/600`; 4 equal segments h 32 radius 999: **Kısa** · **Profesyonel** (selected: bg surface, `ink`, shadow `0 1px 3px rgba(27,25,23,.12)`) · **Samimi** · **Detaylı** (unselected `ink/secondary`).
4. **Draft card** (bg surface, radius 20, padding 18, flex 1):
   - header row: kicker **"AI TASLAĞI · PROFESYONEL"** (`auto_awesome` FILL, `12/600 +6% brand/primary`) · right **"Düzenlenebilir"** `12 ink/tertiary`.
   - body mt 12 `15/23`, pre-wrap, editable; blinking caret 2×18 `brand/primary` at end:
     ```
     Merhaba Mehmet,

     Talebiniz için teşekkürler. Revize fiyat teklifini, güncellenmiş teslim tarihiyle birlikte bugün 17:00'den önce PDF formatında iletiyor olacağım.

     Sorularınız olursa memnuniyetle yardımcı olurum.

     İyi çalışmalar,
     Yunus
     ```
   - chips mt 14, gap 6, wrap (chip/pill neutral): `attach_file` **"Teklif_v3.pdf ekle"**, `short_text` **"Kısalt"**.
5. **Assurance line**: `verified_user` 18 `success/text` + **"Sen onaylamadan hiçbir mail gönderilmez."** `13 ink/secondary`, padding `0 4`.
6. **CTA row** gap 10: **"Göndermeyi Onayla"** button/primary hero (flex 1) + **"Düzenle"** button/secondary.

Kicker template: `AI TASLAĞI · {TONE}` (KISA / PROFESYONEL / SAMİMİ / DETAYLI).

Design note verbatim: *"Ton seçimi taslağı anında değiştirir (prototipte çalışır). Buton adı "Gönder" değil "Göndermeyi Onayla": yazma işlemi dili her yerde onay dilidir."*

### Interactive elements / Dead in prototype (all static here)
| element | intended |
|---------|----------|
| back | pop; if draft edited → discard confirm |
| person chip | open contact (file 06 person sheet) |
| tone segments | regenerate draft in that tone immediately (streaming text replaces body; keep user edits? → ask "Düzenlemelerin kaybolacak" if edited) |
| draft body | tap → inline edit (same as "Düzenle") |
| "Teklif_v3.pdf ekle" chip | attach suggested file; chip becomes selected (brand-soft) with `check` |
| "Kısalt" chip | regenerate shorter variant |
| Göndermeyi Onayla | send via provider; success toast `Gönderildi` (proposed) + pop to previous; writes to Onay Merkezi history |
| Düzenle | focus editor / keyboard |

### States
- Generating: body shows streaming text with caret; CTA disabled until complete; kicker `AI TASLAĞI · …` unchanged.
- Generation failed: body replaced with `Taslak oluşturulamadı. Tekrar dene.` (proposed) + retry chip.
- Sending: primary button shows spinner; disable all.
- Offline: primary disabled; hint `Bağlantı yok — taslak kaydedildi` (proposed).
- Follow-up tone variant (from 4.6): kicker `AI TASLAĞI · TAKİP`, subject `Re: {original subject}`.
- Dark: per 0.7; segmented container `dark/surface-2`, selected segment `dark/surface` ring.

### Data fields
`draftId`, `threadId`, `to {name, initials, email}`, `subject`, `tone` (short | professional | friendly | detailed | followup), `body`, `isEdited`, `suggestedAttachments[] {name, fileId}`, `status` (generating | ready | sending | sent | failed).

---

## 4.6 Akıllı Takip · Senin cevap beklediklerin

**Purpose.** Mails you sent that have no reply ("Takip Etmen Gerekenler").
**Navigation.** Stack push from 4.3 row "Senin cevap beklediğin", from Akış `Takip` filter, or from a TAKİP feed card.

### Layout (padding `6 20 24`, gap 14)
1. nav/top-bar: back · spacer (no kicker).
2. Title block: **"Takip Etmen Gerekenler"** `h1 28/34 600 -2%`; mt 4 **"3 gönderdiğin mail yanıtsız. En eskisi 6 gün."** `14 ink/secondary`. Template: `{n} gönderdiğin mail yanıtsız. En eskisi {d} gün.`
3. **card/person (follow-up)** × 3 (bg surface, radius 20, padding 16, shadow):
   - header gap 12: avatar 40 `13/600` · name `16/600 -1%` + topic `13 ink/secondary` · **wait badge** h 26, padding `0 9`, radius 999, `12/600` (tone bg/fg).
   - status mt 12 `15/21` (AI sentence).
   - source row mt 6: `schedule_send` 16 + src `12 ink/tertiary`.
   - actions mt 12 gap 8 `13/600`: **"Takip Mesajı Hazırla"** chip/action primary-soft · **"Yarın Hatırlat"** chip/action neutral · **"Kapat"** ghost (ml auto).
4. Footer hint (padding `8 4`): `psychology` 18 `brand/primary` + **"Bir kişiyi "Takip etme" dersen, o kişiden bekleyen mailleri bir daha göstermem."** `13/19 ink/secondary` (curly quotes around Takip etme in source).

### Example data — `FOLLOW`

| av | avatar tone | name | topic | days badge (tone) | status | src |
|----|-------------|------|-------|-------------------|--------|-----|
| MY | avatar/blue | Mehmet Yılmaz | Teklif v2 · PDF | 3 gün (warning) | Henüz yanıt gelmedi. Bugün 14:30 toplantıda konuşabilirsin. | 2 Eylül 10:05'te gönderildi · Gmail |
| HK | avatar/green | Hukuk · Kerem Aksoy | Sözleşme taslağı yorumu | 6 gün (critical) | Yanıt yok. İki kez ertelendi; artık telefon etmek daha hızlı olabilir. | 30 Ağustos'ta gönderildi · Gmail |
| DE | avatar/terracotta | Deniz Erol | Etkinlik konuşmacı daveti | 2 gün (neutral) | Okundu, yanıt yok. Genelde 3–4 günde döner. | 3 Eylül'de gönderildi · Outlook |

Wait-badge thresholds — design note says *"Bekleme süresi rozeti 3 günden sonra amber, 7 günden sonra coral"* but the example paints **6 gün** coral. Implement: 0–2 days neutral, 3–5 amber (warning), **≥ 6 coral (critical)** to match the data; confirm with design if 7 was intended.

Design note verbatim: *"“Takip Mesajı Hazırla” → 4.5 ile aynı taslak ekranı, takip tonunda."*

### Interactive elements / Dead in prototype
| element | intended |
|---------|----------|
| Takip Mesajı Hazırla | push 4.5 with `tone = followup`, `to` = this person, subject `Re: {topic}` |
| Yarın Hatırlat | schedule reminder for tomorrow 08:00 (or open 4.11 sheet with "Yarın sabah" preselected); card gets a `Hatırlatıcı: Yarın 08:00` chip |
| Kapat | dismiss card; toast with `Geri al`; long-press/secondary option **"Takip etme"** per person → mute that contact's follow-ups (the footer hint describes this) |
| card tap | open the sent thread (4.4 variant for sent mail) |
| avatar/name | person sheet (file 06) |

### States
- Empty: title stays; subtitle `Bekleyen yanıt yok.` (proposed) and an empty card `Gönderdiğin tüm maillere yanıt gelmiş.` (proposed).
- Loading: 3 skeleton cards.
- Dark: per 0.7.

### Data fields
`followupId`, `contact {name, initials, avatarTone, org}`, `topic`, `sentAt`, `provider`, `daysWaiting`, `tone` (derived), `readStatus` (unread | read), `aiStatus` (sentence), `typicalReplyDays`, `snoozedUntil`, `mutedContact`.

---

## 4.7 Senden Beklenenler · Acil / Bugün / Yakında

**Purpose.** People waiting on **your** reply, grouped by urgency.
**Navigation.** Stack push from 4.3 row "Senden cevap bekleyen" or Bugün brief.

### Layout (padding `6 20 40`, gap 14)
1. nav/top-bar: back · spacer.
2. Title **"Senden Beklenenler"** `h1`; subtitle **"4 kişi cevabını bekliyor."** `14 ink/secondary`. Template `{n} kişi cevabını bekliyor.`
3. **Groups** (`WAIT`): group header `12/600 +8%` in group color with 6 px dot, padding `4 4 8`; cards column gap 10.
4. **card/person (waiting)**: bg surface, radius 18, padding `14 16`, shadow, row gap 12: avatar 40 · content: name `15/600 -1%` + wait `12 ink/tertiary` (right) · topic `13 ink/secondary` · expect mt 6 `14/20` · bottom row mt 8: deadline `12/600` (tone color) + **"Yanıtla"** `13/600 brand/text-on-soft`.

### Example data — `WAIT`

Group **ACİL** (header `critical/text`, dot `critical`):

| av | tone | name | wait | topic | expect | deadline (color) |
|----|------|------|------|-------|--------|------------------|
| AY | avatar/terracotta | Ahmet Yılmaz | 2 saat | Re: Eylül teklifi – revize | Revize fiyat teklifi, PDF olarak. | Bugün 17:00 (critical/text) |

Group **BUGÜN** (header `warning/text`, dot `warning`):

| av | tone | name | wait | topic | expect | deadline |
|----|------|------|------|-------|--------|----------|
| SK | avatar/green | Selin Kaya | 18 saat | Sözleşme taslağı · 4. madde | Cezai şart maddesi için yorumun. | Bugün 18:00 (warning/text) |
| BT | avatar/blue | Burak Tan | 5 saat | Ekip yemeği | Cuma akşamı uygun musun? | Bugün (warning/text) |

Group **YAKINDA** (header `ink/secondary`, dot `ink/disabled`):

| av | tone | name | wait | topic | expect | deadline |
|----|------|------|------|-------|--------|----------|
| EA | avatar/neutral | Elif Arslan | 1 gün | Konferans bileti | Katılım teyidi ve fatura bilgisi. | 9 Eylül (ink/secondary) |

Design note verbatim: *"Kart: kişi · konu · ne bekleniyor · son tarih · bekleme süresi. Bölüm başlıkları renkli nokta taşır, kartlar nötr kalır."*

### Interactive elements / Dead in prototype
| element | intended |
|---------|----------|
| Yanıtla | push 4.5 (draft reply to this thread) |
| card tap | push 4.4 for the thread |
| avatar | person sheet (file 06) |
| swipe left (proposed, mirrors 4.1) | Ertele / Önemli değil |

### States
- Empty group: hide the group (unlike 4.3 categories). All empty → `Kimse cevabını beklemiyor.` (proposed).
- Loading: 3 groups × 1 skeleton card.

### Data fields
`waitId`, `threadId`, `contact`, `waitingSince`, `waitLabel`, `topic`, `expectation` (AI), `deadlineAt`, `deadlineLabel`, `urgencyGroup` (urgent | today | soon).

---

## 4.8 Taahhütler · Verdiğin sözler

**Purpose.** Promises the user made (in mail/notes/messages), extracted by AI, with status.
**Navigation.** Stack push from a TAAHHÜT feed card or Bugün brief.

### Layout (padding `6 20 40`, gap 14)
1. nav/top-bar: back · spacer.
2. Title **"Taahhütlerin"** `h1`; subtitle **"Mail ve notlarında verdiğin sözleri yakaladım. 3 açık, 1 gecikmiş."** `14/20 ink/secondary`. Template `… {open} açık, {late} gecikmiş.`
3. **card/commitment** × 4 (bg surface, radius 20, padding 16):
   - header: status badge (tone) left, date `12 ink/tertiary` right.
   - quote mt 10: **Lora italic `16/24` `ink`**, wrapped in curly quotes `“…”` (editorial — "kullanıcının kendi sesi").
   - meta mt 10, column gap 4, `13`: label column 52 px `ink/tertiary` — **"Taahhüt"** → value `ink 500`; **"Kime"** → `ink`; **"Kaynak"** → `ink/secondary`.
   - actions mt 12 gap 8 `13/600`: `check` 16 + **"Tamamlandı"** chip/action primary-soft · **"Ertele"** neutral · **"Kaynağı Gör"** ghost (ml auto).

### Example data — `COMMITS`

| status (tone) | date | quote | Taahhüt | Kime | Kaynak |
|---------------|------|-------|---------|------|--------|
| GECİKMİŞ (critical) | Cuma · 3 Eyl | Cuma teklif göndereceğim. | Teklif v3 gönder | Mehmet Yılmaz | Gmail · 1 Eyl 18:40 |
| BUGÜN (warning) | Bugün | Dosyayı yarın yollarım. | Marka kılavuzu PDF | Deniz Erol | Gmail · Dün 16:02 |
| AÇIK (neutral) | Pazartesi · 8 Eyl | Pazartesi seni arayacağım. | Telefon görüşmesi | Annem | Mesaj · 4 Eyl |
| TAMAMLANDI (success) | 2 Eyl | Teklifi bu hafta iletiyorum. | Teklif v2 gönderildi | Mehmet Yılmaz | Gmail · 28 Ağu |

Design note verbatim: *"Söz alıntısı Lora italik: kullanıcının kendi sesi. Durum rozeti: AÇIK (nötr), BUGÜN (amber), GECİKMİŞ (coral), TAMAMLANDI (yeşil)."*

Implementation note: the template renders the same action row on the TAMAMLANDI card; engineering should **hide "Tamamlandı"/"Ertele" on completed items** (show only "Kaynağı Gör", optionally "Geri Al").

### Interactive elements / Dead in prototype
| element | intended |
|---------|----------|
| Tamamlandı | mark done → badge becomes TAMAMLANDI, card moves to bottom, undo toast |
| Ertele | open smart reminder sheet (4.11) to pick a new date; badge/date update |
| Kaynağı Gör | open source (4.4 for Gmail, Messages deep link for Mesaj) scrolled to the quoted sentence |
| Kime value | person sheet |
| card tap | expand? (not drawn) — keep as no-op or same as Kaynağı Gör |

### States
- Empty: `Açık taahhüt yok.` (proposed).
- Loading: 4 skeleton cards with a Lora-height quote block.
- Dark: quote `dark/text`; badges dark tone map (success: `rgba(47,160,98,.18)` / `dark/success-text`).

### Data fields
`commitmentId`, `status` (open | today | late | done), `dueAt`, `dueLabel`, `quote` (verbatim user sentence), `what`, `toContact`, `source {provider, ref, at, label}`, `completedAt`.

---

## 4.9 Yaşam Zekâsı · 6 kart kalıbı ("Kişisel")

**Purpose.** Life signals derived from mail & notifications, one uniform `card/life` pattern across six categories.
**Navigation.** Stack push (title "Kişisel" with back). Also reachable as the Akış `Kişisel` filter (4.2 uses the feed card instead; this screen uses the richer card/life).

### Layout (padding `6 20 40`, gap 12)
1. nav/top-bar: back · spacer.
2. Title **"Kişisel"** `h1`; subtitle **"Mail ve bildirimlerinden türetilen yaşam sinyalleri."** `14 ink/secondary`; block mb 4.
3. **card/life** × 6: bg surface, radius 20, padding 16, row gap 14:
   - icon tile 44×44 radius 14 (tbg/tfg) icon 22.
   - content: row: category kicker `11/700 +8% ink/tertiary` + time `12 ink/tertiary` (right) · title mt 4 `17/23 600 -1%` (h3) · sub mt 2 `14/20 ink/secondary` · actions mt 8 gap 14 `13/600`: **a1** `brand/text-on-soft`, **a2** `ink/secondary` (plain text links, no chips).

### Example data — `LIFE`

| cat | icon | tile | time | title | sub | a1 | a2 |
|-----|------|------|------|-------|-----|----|----|
| KARGO | `package_2` | neutral | Bugün | Trendyol siparişin bugün geliyor. | Yurtiçi Kargo · 14:00–18:00 · 2 parça | Takip Et | Kapıya Not Bırak |
| UÇUŞ | `flight` | neutral | Yarın | TK2412 · İstanbul → Antalya | Yarın 09:15 · Kapı B12 · Check-in açık | Check-in | Cüzdana Ekle |
| REZERVASYON | `restaurant` | neutral | Cumartesi | Karaköy Lokantası · 20:30 | 4 kişi · Teyit için son saat 18:00 | Teyit Et | Yol Tarifi |
| ÖDEME | `receipt_long` | neutral | 10 Eyl | Elektrik faturası · 1.842 TL | CK Enerji · Son gün 10 Eylül · Geçen ay 1.610 TL | Hatırlat | Ödendi |
| ABONELİK | `autorenew` | neutral | 9 Eyl | Netflix 9 Eylül'de yenilenecek. | 229,99 TL / ay · Son 30 günde 2 kez izlendi | İncele | Bir Daha Gösterme |
| GÜVENLİK | `shield` | `critical/soft` / `critical/text` | 07:12 | Google hesabında yeni giriş. | Chrome · Windows · İstanbul | Bendim | Şifreyi Değiştir |

Tile "neutral" = bg `neutral/surface-2`, fg `ink/secondary`. Design note says tiles may be *lightly* tinted per category, but the data ships neutral for all except GÜVENLİK — implement neutral by default, critical for security.

Design note verbatim: *"Tek kalıp, altı kategori: ikon karosu kategoriye göre hafif tonlanır (nötr, güvenlik hariç). Uçuşta rota tipografik ok ile; ödemede tutar başlıkta, son gün alt satırda."* → flight title uses `→` (U+2192) between cities; payment puts the amount in the title and the due date in the sub line.

### Interactive elements / Dead in prototype
| a1 / a2 | intended |
|---------|----------|
| Takip Et | open carrier tracking URL (in-app browser) |
| Kapıya Not Bırak | provider delivery-note flow (or copy note to clipboard + open app) |
| Check-in | airline check-in URL |
| Cüzdana Ekle | Apple Wallet / Google Wallet pass |
| Teyit Et | confirm reservation (provider link / call) |
| Yol Tarifi | open Maps with venue |
| Hatırlat | smart reminder sheet 4.11 (prefilled with due date) |
| Ödendi | mark paid → card dims/moves; undo toast |
| İncele | subscription detail (usage + cancel link) |
| Bir Daha Gösterme | mute this subscription signal (feedback into ranking) |
| Bendim | mark login as recognised; dismiss |
| Şifreyi Değiştir | open Google security URL |
| card tap | source mail (4.4) or notification |

### States
- Empty: `Henüz yaşam sinyali yok. Mail bağlandıkça burası dolar.` (proposed).
- Loading: 6 skeleton cards.
- Dark: per 0.7; security tile `rgba(224,85,63,.18)` / `dark/critical-text`.

### Data fields
`lifeId`, `category` (shipment | flight | reservation | payment | subscription | security), `occursAt`, `timeLabel`, `title`, `subtitle`, `primaryAction`, `secondaryAction`, `provider`, `amount`/`currency` (payment/subscription), `previousAmount`, `route {from,to}`, `flightNo`, `gate`, `partySize`, `confirmDeadline`, `sourceRef`.

---

## 4.10 Evrensel Yakalama · Ekran görüntüsü

**Purpose.** Universal capture ("Ekle") — a screenshot analysed into an event.
**Navigation.** Modal (full-screen) opened from the "Ekle" pill (4.1), from the iOS Share Sheet / Android Intent (design note), or from Asistan. Close (X) dismisses.

### Layout (padding `6 20 44`, gap 16)
1. nav/top-bar: `close` circle · kicker **"EKLE"** · spacer.
2. **source-tiles**: Fotoğraf · **Ekran görüntüsü (selected)** · PDF · Link.
3. **preview/placeholder** h 200 with mono label **"ekran görüntüsü · konser afişi"**; detection rectangle at `left 24 / right 24 / top 52 / h 40`, radius 8; tag **"TARİH · YER"** at `left 24 / top 36`.
4. **card/ai-insight**: kicker **"ETKİNLİK TESPİT EDİLDİ"**; title **"Konser · Zorlu PSM"** `20/26 600 -2%`; chips row (chip/pill neutral, wrap): `event` **"12 Eylül"** · `schedule` **"20:00"** · `location_on` **"Zorlu PSM"**; note mt 10 **"O akşam takvimin boş. 19:10'da çıkman gerekebilir."** `13/19 ink/secondary`.
5. CTA row (mt auto, gap 10): `event` + **"Takvime Ekle"** button/primary (no hero shadow) · **"Hatırlat"** button/secondary.

Design note verbatim: *"Paylaşım menüsünden de gelir (iOS Share Sheet / Android Intent). Tespit kutusu görüntü üzerinde işaretlenir; çıkarılan alanlar çip olarak düzenlenebilir."*

### Interactive elements / Dead in prototype
| element | intended |
|---------|----------|
| close | dismiss modal (confirm if analysis produced items) |
| source tiles | switch capture source (Fotoğraf → camera/gallery picker; Ekran görüntüsü → latest screenshot picker; PDF → 4.12a sheet; Link → 4.13a) |
| preview | tap → full-screen image with detection boxes |
| chips (12 Eylül / 20:00 / Zorlu PSM) | tap → inline edit (date picker / time picker / text) |
| Takvime Ekle | confirmation sheet (4.13d pattern) → success toast, return to Bugün |
| Hatırlat | smart reminder sheet 4.11 |

### States
- Analysing: replace AI card with progress card (`GÖRÜNTÜ ANALİZ EDİLİYOR…`, rows like 4.12b — proposed copy: `Metin okundu`, `Tarih ve yer bulundu`, `Takvim uygunluğu kontrol ediliyor…`).
- Nothing detected: AI card kicker `BİR ŞEY BULAMADIM` (proposed), body suggests typing a note; CTA becomes `Not Olarak Kaydet` (proposed).
- Photo-library permission denied: tile tap shows permission card (file 02/08 pattern) with Settings deep link.
- Dark: per 0.7.

---

## 4.11 Yakalama · Fatura fotoğrafı + Akıllı hatırlatıcı

**Purpose.** A photographed bill is detected; the **smart reminder sheet** — the product's single reminder component — asks when to remind.
**Navigation.** Modal (EKLE · FOTOĞRAF) with a bottom sheet on top. The sheet itself is reused everywhere "Hatırlat" appears.

### Layout — modal behind (padding `6 20 44`, gap 16)
1. nav/top-bar: close · kicker **"EKLE · FOTOĞRAF"** · spacer.
2. preview/placeholder h 160, label **"fotoğraf · elektrik faturası"**.
3. card/ai-insight: kicker **"FATURA TESPİT EDİLDİ"**; row space-between baseline: **"Elektrik · CK Enerji"** `20/26 600 -2%` + **"1.842 TL"** `20/600 -2%`; sub mt 6 `14 ink/secondary`: **"Son ödeme 15 Eylül · Abone no ···· 4821"** with **15 Eylül** bold `warning/text`.

(Example-data inconsistency: the feed/life cards say the CK Enerji bill is due **10 Eylül**; this screen says **15 Eylül**. Treat as different bills.)

### Layout — sheet/bottom (scrim over the modal)
- Title **"Ne zaman hatırlatayım?"** `19/600`; subtitle **"Elektrik faturası · Son ödeme 15 Eylül"** `13 ink/secondary`. Subtitle template: `{itemTitle} · {dueLabel}`.
- Option rows (mt 12, `15/500`, min-h 52, divider top, icon 20 `ink/secondary` fixed width 24, trailing `12 ink/tertiary`):

| icon | label | trailing |
|------|-------|----------|
| `schedule` | 30 dakika önce | — |
| `schedule` | 1 saat önce | — |
| `wb_twilight` | Bu akşam | 19:00 |
| `wb_sunny` | Yarın sabah | 08:00 |
| `edit_calendar` | Özel zaman | `chevron_right` 18 `#C9C5BC` |
| `auto_awesome` FILL 1, `brand/primary` | **Uygun zamanda** + sub **"Takvimine göre: 13 Eylül Cumartesi 10:00"** `12/600 brand/text-on-soft` | `check_circle` 22 `brand/primary` |

- The last row is the **highlighted/recommended** row: min-h 60, bg `#F7F7FE`, radius 12, `margin 0 -8 / padding 0 8`.
- The "—" trailing on the two relative options means *not applicable* (a bill has a due day but no time-of-day). Render them disabled (`ink/disabled`) when the item has no time; for timed items show the computed time (e.g. `16:30`).

Design note verbatim: *"Akıllı hatırlatıcı sayfası ürünün tek hatırlatıcı bileşenidir; her yerden aynı 6 seçenek. "Uygun zamanda" takvim boşluğuna ve mesai saatine göre seçilir, gerekçesi altında yazar."*

### Interactive elements / Dead in prototype
| element | intended |
|---------|----------|
| any option row | select → create reminder immediately (single tap commits; sheet closes; toast `Hatırlatıcı kuruldu · {when}` proposed, with `Geri al`) |
| Özel zaman | push native date-time picker inside the sheet |
| Uygun zamanda | uses the AI-proposed slot; the reason line (`Takvimine göre: …`) must always be shown |
| grabber / scrim | dismiss sheet |
| close (behind) | dismiss modal |

### States
- Computing "Uygun zamanda": row shows spinner 16 and sub `Takvimine bakıyorum…` (proposed); other rows remain tappable.
- Calendar not connected: last row sub `Takvim bağlı değil · Yarın sabah öneriyorum` (proposed) — still selectable.
- Notification permission denied: after selection show permission card (file 08).
- Dark: sheet `dark/surface`, highlighted row `rgba(133,134,242,.10)`.

### Data fields
Reminder request: `targetType` (bill | event | task | mail | commitment | followup), `targetId`, `title`, `dueAt`, `hasTimeOfDay`, `options[] {key, label, at, enabled}`, `smartSuggestion {at, reason}`.

---

## 4.12 Yakalama · PDF (4 states)

### 4.12a · Seçim

**Purpose.** The generic **Ekle entry** (text field + 4 source tiles) with the PDF picker sheet open.
**Navigation.** Modal "EKLE" + sheet.

Layout behind (padding `6 20 0`, gap 16):
1. nav/top-bar: close · **"EKLE"** · spacer.
2. **Note field** (min-h 52, padding `14 16`, radius 16, bg surface, shadow `.06`, `15`), placeholder **"Bir not yaz veya yapıştır…"** `ink/tertiary`.
3. source-tiles with **PDF selected**.

Sheet:
- Title **"PDF seç"**; subtitle **"Son dosyalar · Mail eklerinden ve Dosyalar'dan"**.
- Rows (min-h 60): file tile 36×36 radius 11 (`picture_as_pdf` 20) · name `15/500` + meta `12 ink/tertiary` · trailing radio.

| tile | name | meta | trailing |
|------|------|------|----------|
| `critical/soft`/`critical/text` (selected) | Hizmet_Sozlesmesi_v3.pdf | 14 sayfa · 1,2 MB · Mehmet Yılmaz · Dün | `check_circle` FILL brand (row highlighted `#F7F7FE`) |
| neutral | Teklif_v2.pdf | 3 sayfa · Sen · 2 Eyl | `radio_button_unchecked` `#C9C5BC` |
| neutral | Fatura_Eylul.pdf | 1 sayfa · CK Enerji · 1 Eyl | `radio_button_unchecked` |
| — | `folder_open` **"Dosyalar'dan seç…"** (min-h 52, `brand/text-on-soft 600`) | | |

- CTA mt 12: **"Analiz Et"** button/primary (h 52, radius 16, no shadow).

Design note verbatim: *"Ekle girişi: üstte metin alanı, altta 4 kaynak karosu. PDF karosu seçilince son dosyalar alt sayfası; mail ekleri otomatik listelenir. Analiz yalnızca "Analiz Et" ile başlar."*

Interactive / dead: note field (focus → 4.14a), tiles (switch source), file rows (single-select), "Dosyalar'dan seç…" (system document picker), **Analiz Et** (→ 4.12b; disabled until a file is selected), scrim/grabber (close sheet, PDF tile deselects).

Meta template: `{pages} sayfa · {size} · {senderOrSen} · {date}` — sender `Sen` for user's own attachments.

### 4.12b · Analiz ediliyor

Layout (padding `6 20 44`, gap 16):
1. nav/top-bar: close · **"EKLE · PDF"** · spacer.
2. preview/placeholder h 220, label **"pdf önizleme · Hizmet_Sozlesmesi_v3 · s.3"**; detection rectangle `left 24 / right 120 / top 150 / h 22`, radius 6; tag **"TARİH"** at `left 24 / top 132`.
3. progress/findings card, header **"PDF ANALİZ EDİLİYOR…"**:
   - ✓ **"14 sayfa okundu"**
   - ✓ **"3 tarih bulundu"** — right detail **"s.3, s.9, s.14"**
   - ⟳ **"Yükümlülükler ve görevler çıkarılıyor…"**
   - ○ (pending, 40 %) **"Takvim uygunluğu kontrol ediliyor"**
4. privacy line: **"Belge cihazında özetlenir; içerik saklanmaz, yalnızca çıkarılan öğeler."**
5. **"İptal"** button/ghost (mt auto).

Design note verbatim: *"İlk Analiz ekranıyla aynı kalıp: ilerleme çubuğu yok, bulgu listesi. Önizlemede tespit edilen alan işaretlenir. İptal her an mümkün."*

Interactive / dead: **İptal** (abort analysis, back to 4.12a), close (same), preview (page through). Steps are streamed; each completed step animates check-in (scale .8→1, 160 ms) and the preview jumps to the page of the latest finding.

Templates: `{n} sayfa okundu`, `{n} tarih bulundu`, page list `s.{p}`.

### 4.12c · Tespit + öneriler

Layout (padding `6 20 130`, gap 14; sticky CTA bar at bottom):
1. nav/top-bar: close · **"EKLE · PDF"** · spacer.
2. **File row** (padding `12 14`, radius 16, bg surface, shadow `.06`): tile 36 `critical/soft` `picture_as_pdf` · **"Hizmet_Sozlesmesi_v3.pdf"** `14/600` + **"14 sayfa · Mehmet Yılmaz · Dün"** `12 ink/tertiary` · **"Aç"** `13/600 brand/text-on-soft`.
3. card/ai-insight: kicker **"SÖZLEŞME TESPİT EDİLDİ · 3 ÖĞE"**; title **"Hizmet Sözleşmesi · Yılmaz Endüstri"** `20/26`; sub mt 4 **"Taraflar, 12 aylık hizmet, 3 tarih ve 1 yükümlülük bulundu."** `14/20 ink/secondary`.
4. **Detected items list/group** (item/row, align-start, all selected):

| tile | kicker | title | source | selected |
|------|--------|-------|--------|----------|
| `flag` warning | SON TARİH (`warning/text`) | İmza için son gün · 19 Eylül | Kaynak: s.14, madde 9.2 | ✓ |
| `add_task` neutral | GÖREV (`ink/tertiary`) | Hukuktan 4. madde yorumu iste · 12 Eylül'e kadar | Kaynak: s.3, cezai şart maddesi | ✓ |
| `event` info | ETKİNLİK (`info/text`) | Sözleşme görüşmesi · 17 Eylül 11:00 | Kaynak: s.9 · O saat takvimin boş | ✓ |

5. Kicker **"ÖNERİLEN AKSİYONLAR"**.
6. Action chips (chip/action 38, wrap, gap 8): `event` **"Takvime Ekle · 1"** · `add_task` **"Görev Oluştur · 1"** · `notifications` **"Hatırlat · 1"** (primary-soft) · `person` **"Mehmet'e bağla"** (neutral).
7. **sticky/cta-bar**: **"3 Öğeyi Onaya Gönder"** (primary hero, flex 1) + **"Düzenle"** (secondary).

Design note verbatim: *"Her öğe tipine göre karo rengi (son tarih amber, etkinlik mavi, görev nötr), altında sayfa kaynağı. Öğeler tek tek seçilebilir; CTA sayıyı söyler."*

Interactive / dead: **Aç** (open PDF viewer at page 1), item rows (toggle selection; CTA count updates: `{n} Öğeyi Onaya Gönder`; 0 → disabled `Öğe seç` proposed), source line tap (open PDF at that page), action chips (each is a summary/toggle of that action type — tapping filters/toggles the group; counts follow selection), **Mehmet'e bağla** (link the document to contact Mehmet Yılmaz — toggles to selected state with `check`), **N Öğeyi Onaya Gönder** (→ 4.12d), **Düzenle** (enter edit mode: item titles/dates editable inline).

### 4.12d · Onay

Layout behind (padding `6 20 0`): nav/top-bar (close · **"EKLE · PDF"**) + condensed AI card (kicker **"SÖZLEŞME TESPİT EDİLDİ · 3 ÖĞE"**, title **"Hizmet Sözleşmesi · Yılmaz Endüstri"**; shadow only `.04`).

Sheet:
- Title **"Onay · 3 işlem"** (template `Onay · {n} işlem`); subtitle **"Sen onaylamadan hiçbiri yapılmaz. İstemediğini kaldır."**
- Rows (padding `12 0`, divider top, align-start): tile 28×28 radius 9 `brand/soft`/`brand/text-on-soft` icon 17 · kicker `11/700 +6% ink/secondary` · title `15/600 -1%` · meta `12 ink/tertiary` (mt 2) · `check_circle` 22 brand.

| icon | kicker | title | meta |
|------|--------|-------|------|
| `event` | TAKVİME EKLE | Sözleşme görüşmesi · 17 Eyl 11:00 | Google Takvim · 60 dk · 30 dk önce hatırlatma |
| `add_task` | GÖREV OLUŞTUR | Hukuktan 4. madde yorumu iste | Plan · 12 Eyl · Önerilen blok: 10 Eyl 14:00 |
| `notifications` | HATIRLATICI | İmza son günü · 19 Eyl | **Uygun zamanda: 18 Eyl 09:10** (`12/600 brand/text-on-soft`) |

- Buttons mt 12 gap 8: **"Onayla · 3"** (button/sheet-row primary, flex 1) · **"Düzenle"** (soft) · **"Vazgeç"** (neutral).
- Footer mt 10: `verified_user` 16 `success/text` + **"Onaylananlar Onay Merkezi geçmişine yazılır."** `12 ink/tertiary`.

Design note verbatim: *"Kullanıcının kendi başlattığı yakalamada tek onay sayfası; her satır Onay Merkezi kart sözleşmesini taşır (ne · nereye · ne değişecek). AI'ın kendi önerileri ise Onay Merkezi'nde tek tek kalır."*

Interactive / dead: row check toggles (uncheck removes from batch; title count updates `Onayla · {n}`), **Onayla · n** (execute all selected writes atomically-ish; on success → 4.14d-style success screen + toast `Onaylandı · {n} işlem` with `Geri al`; write to Onay Merkezi history), **Düzenle** (back to 4.12c in edit mode), **Vazgeç** (close sheet, stay on 4.12c), scrim (same as Vazgeç).

Row contract (every confirmation row, also in Onay Merkezi): **ne** (title) · **nereye / ne değişecek** (meta) · optional **neden** (4.13d shows the explicit two-line grid).

---

## 4.13 Yakalama · Link (4 states)

### 4.13a · Giriş

Layout (padding `6 20 44`, gap 16):
1. nav/top-bar: close · **"EKLE · LİNK"** · spacer.
2. source-tiles with **Link selected**.
3. **URL field**: h 52, padding `0 16`, radius 16, bg surface, focus ring `0 0 0 2px brand/primary`, `link` 18 `ink/tertiary`, value `15` single-line ellipsis **"biletix.com/etkinlik/konser-zorlu-psm-12-eylul"**, caret 2×18 brand.
   Below (mt 8, gap 6): chip/pill brand-soft `content_paste` **"Panodan yapıştırıldı"** · chip/pill neutral **"Temizle"**.
4. **Link preview card** (radius 20, padding `14 16`, row gap 12, center): thumb 56×56 radius 14 (striped placeholder) · domain **"biletix.com"** `12 ink/tertiary` · title **"Konser · Zorlu PSM · 12 Eylül"** `15/600 -1%` ellipsis · **"Bağlantı önizlemesi"** `12 ink/tertiary`.
5. Kicker **"SON EKLENEN LİNKLER"**.
6. Recent list (radius 18, padding `0 16`, shadow `.04`): rows min-h 48 `14`, icon 18 `ink/secondary`, url `ink/secondary` ellipsis, date `12 ink/tertiary`:
   - `restaurant` **karakoylokantasi.com/rezervasyon** · **2 Eyl**
   - `article` **medium.com/…/ai-briefing-patterns** · **28 Ağu**
7. **"Analiz Et"** button/primary (mt auto).

Design note verbatim: *"Panodaki link otomatik önerilir ama kullanıcı onayı olmadan okunmaz ("Panodan yapıştırıldı" çipi). Önizleme kartı yalnızca başlık + alan adı."*

Privacy rule: the clipboard URL may be **suggested** (chip visible) but the page is **not fetched** until the user taps Analiz Et. The preview card in this state uses only OpenGraph title/domain fetched after the user confirmed the paste (or show placeholder until then). Use iOS `UIPasteboard.detectPatterns` / Android clipboard listener so no paste toast fires before consent.

Interactive / dead: URL field (edit), "Panodan yapıştırıldı" chip (informational; tap → replace with clipboard again), **Temizle** (clear field + preview), recent link rows (tap → fill field), tiles (switch source), **Analiz Et** (→ 4.13b; disabled while field empty / invalid URL).

### 4.13b · Analiz ediliyor

Layout (padding `6 20 44`, gap 16):
1. nav/top-bar: close · **"EKLE · LİNK"** · spacer.
2. **Preview card** (radius 20, overflow hidden, bg surface): image h 160 placeholder label **"og:image · konser afişi"**; body padding `12 16`: **"biletix.com"** `12 ink/tertiary`, **"Konser · Zorlu PSM · 12 Eylül 20:00"** `15/600 -1%`.
3. progress/findings card, header **"BAĞLANTI ANALİZ EDİLİYOR…"**:
   - ✓ **"Sayfa okundu"**
   - ✓ **"Tür: etkinlik"** — right detail **"ürün · içerik · rezervasyon değil"**
   - ✓ **"Tarih, saat, yer ve fiyat bulundu"**
   - ⟳ **"Takvim uygunluğu ve yol süresi kontrol ediliyor…"**
4. privacy line: **"Sayfa yalnızca bir kez okunur; çerez veya oturum paylaşılmaz."**
5. **"İptal"** button/ghost.

Design note verbatim: *"Tür sınıflandırması bulgu satırı olarak görünür (etkinlik / ürün / içerik / rezervasyon); yanlışsa sonraki ekranda değiştirilebilir."*

Interactive / dead: İptal, close.

### 4.13c · Tespit + öneriler

Layout (padding `6 20 130`, gap 14; sticky CTA):
1. nav/top-bar: close · **"EKLE · LİNK"** · spacer.
2. **Type chips** (chip/pill 30, gap 6): **Etkinlik** (selected-dark with `check` 14) · **Ürün** · **İçerik** · **Rezervasyon** (surface variant with shadow `.06`).
3. card/ai-insight: kicker **"ETKİNLİK TESPİT EDİLDİ"**; title **"Konser · Zorlu PSM"**; chips: `event` **12 Eylül** · `schedule` **20:00** · `location_on` **Zorlu PSM** · `confirmation_number` **2 bilet · 1.450 TL**; note mt 10 **"O akşam takvimin boş. 19:10'da çıkman gerekebilir. Bilet satışı 8 Eylül 10:00'da açılıyor."** `13/19 ink/secondary`; source line mt 8 `verified` **"Kaynak: biletix.com · okunma 09:41"**.
4. Kicker **"ÖNERİLEN AKSİYONLAR"**.
5. Suggested actions list/group (item/row, align-center, **no kicker**, title `15/21 500`, sub `12 ink/tertiary`):

| tile | title | sub | selected |
|------|-------|-----|----------|
| `event` info | Takvime ekle · 12 Eyl 20:00 | 19:10 çıkış hatırlatması dahil | ✓ |
| `notifications` neutral | Bilet satışı için hatırlat · 8 Eyl 09:55 | Satış açılmadan 5 dk önce | ✓ |
| `bookmark` neutral | Hafızaya kaydet | “Zorlu konser” diye sorabilirsin | ○ (unselected) |

6. sticky/cta-bar: **"2 Öğeyi Onaya Gönder"** + **"Düzenle"**.

Design note verbatim: *"Tür çipleri (etkinlik · ürün · içerik · rezervasyon) kullanıcıya sınıflandırmayı düzeltme imkânı verir; ürün seçilirse öneriler fiyat takibi ve alışveriş hatırlatıcısına döner."*

Interactive / dead: type chips (re-classify → AI card + suggestions regenerate; Ürün → suggestions become *fiyat takibi* and *alışveriş hatırlatıcısı*; İçerik → *Okuma listesine ekle*, *Özetle*; Rezervasyon → *Takvime ekle*, *Teyit hatırlat* — copy for those variants is not drawn, engineering to draft), AI-card chips (inline edit), source line (open URL), rows (toggle → CTA count), **N Öğeyi Onaya Gönder** (→ 4.13d), **Düzenle**.

### 4.13d · Onay

Behind: nav/top-bar (close · **"EKLE · LİNK"**) + condensed AI card (**"ETKİNLİK TESPİT EDİLDİ"** / **"Konser · Zorlu PSM"**).

Sheet:
- Title **"Onay · 2 işlem"**; subtitle **"Takviminde değişiklik yapmadan önce onayın gerekir."**
- Rows with the explicit **neden / değişim** grid (mt 6, `grid-template-columns: 56px 1fr`, gap `3 10`, `12/17`; label column `ink/tertiary`):

| icon | kicker | title | grid |
|------|--------|-------|------|
| `event` | TAKVİME EKLE | Konser · Zorlu PSM · 12 Eyl 20:00 | **Neden** → Paylaştığın bağlantıda etkinlik bulundu. / **Değişim** → Google Takvim'e 1 etkinlik · 19:10 çıkış hatırlatması |
| `notifications` | HATIRLATICI | Bilet satışı · 8 Eyl 09:55 | **Değişim** → 1 hatırlatıcı · Takvimine yazılmaz |

- Buttons: **"Onayla · 2"** · **"Düzenle"** · **"Vazgeç"** (same as 4.12d; no footer line in this variant).

Design note verbatim: *"Onay satırları Onay Merkezi kartlarıyla aynı üç alanı taşır (ne · neden · ne değişecek). Onay sonrası başarı toast'ı ve Bugün'e dönüş."*

Interactive / dead: as 4.12d. After **Onayla**: success toast `Onaylandı · 2 işlem` + `Geri al`, modal closes, **navigate to Bugün tab**.

---

## 4.14 Yakalama · Metin (4 states)

### 4.14a · Giriş

Layout (padding `6 20 44`, gap 16):
1. nav/top-bar: close · **"EKLE · METİN"** · spacer.
2. **Text area** (focused): min-h 140, padding 16, radius 20, bg surface, ring `0 0 0 2px brand/primary`, **`17/25 -1%` body font (Geist, not Lora)**; content **"Perşembe 15:00 Ayşe ile kahve, öncesinde raporu bitir. Çarşamba akşamı bana hatırlat."** + caret 2×20.
3. Chips row (chip/pill neutral, `ink/secondary`): `mic` **"Sesle yaz"** · `content_paste` **"Yapıştır"** · **"96 karakter"** (live counter, template `{n} karakter`).
4. source-tiles (none selected).
5. Hint: `psychology` 18 `brand/primary` + **"Serbest yaz; tarih, kişi ve görevleri ben ayırırım."** `13/19 ink/secondary`.
6. **"Analiz Et"** button/primary (mt auto).

Design note verbatim: *"Metin girişi Ekle sayfasının en üstündeki alan; odaklanınca büyür (17px, Lora değil, gövde fontu). Mikrofon sesle dikte için, ses modu değil."* → the 4.12a 52-px note field **grows to this 140-px editor on focus** (animate min-height 52→140, font 15→17, ring appears).

Interactive / dead: text area (edit), **Sesle yaz** (speech-to-text dictation into the field — *not* the voice assistant mode), **Yapıştır** (paste clipboard text), counter (static), tiles (switch source; keeps typed text), **Analiz Et** (→ 4.14b; disabled when empty).

### 4.14b · Analiz ediliyor

Layout (padding `6 20 44`, gap 16):
1. nav/top-bar: close · **"EKLE · METİN"** · spacer.
2. **Highlighted text card** (padding 16, radius 20, bg surface, shadow, `17/27 -1%`), entity spans radius 5, padding `1 4`:
   - **"Perşembe 15:00"** → `info/soft` / `info/text` (zaman)
   - **"Ayşe"** → `brand/soft` / `brand/text-on-soft` (kişi)
   - **"raporu bitir"** → `neutral/surface-2` / `ink/secondary` (görev)
   - **"Çarşamba akşamı"** → `warning/soft` / `warning/text` (hatırlatıcı)
   Rendered sentence: `[Perşembe 15:00] [Ayşe] ile kahve, öncesinde [raporu bitir]. [Çarşamba akşamı] bana hatırlat.`
3. **Legend** (`11 ink/tertiary`, gap 10, 10×10 swatches radius 3): **zaman** (info/soft) · **kişi** (brand/soft) · **görev** (surface-2) · **hatırlatıcı** (warning/soft).
4. progress/findings card, header **"METİN ANALİZ EDİLİYOR…"**:
   - ✓ **"2 zaman ifadesi çözüldü"** — detail **"Per 11 Eyl · Çar 10 Eyl"**
   - ✓ **"Kişi eşleştirildi"** — detail **"Ayşe Kara · Kişiler"**
   - ⟳ **"Görev ve hatırlatıcı ayrılıyor…"**
5. **"İptal"** button/ghost.

Design note verbatim: *"Metin yerinde işaretlenir: anlam renkleri sistemdeki soft tonlar (zaman mavi, kişi indigo, görev nötr, hatırlatıcı amber). Belirsiz tarih ("Perşembe") çözümü bulgu satırında açıkça yazar."*

Entity color map (reuse anywhere text is annotated): time → info, person → brand, task → neutral, reminder → warning.

### 4.14c · Tespit + öneriler

Layout (padding `6 20 130`, gap 14; sticky CTA):
1. nav/top-bar: close · **"EKLE · METİN"** · spacer.
2. **Source quote card** (padding `12 16`, radius 16, bg surface, shadow `.06`, `14/21 ink/secondary` italic): **"“Perşembe 15:00 Ayşe ile kahve, öncesinde raporu bitir. Çarşamba akşamı bana hatırlat.”"**
3. card/ai-insight: kicker **"3 ÖĞE TESPİT EDİLDİ"**; body mt 8 `15/21 ink` **"Bir takvim olayı, bir görev ve bir hatırlatıcı. Rapor görevini kahveden 1 saat önceye koydum."**
4. Items list/group (item/row, align-start):

| tile | kicker | title | sub |
|------|--------|-------|-----|
| `event` info | TAKVİM OLAYI (`info/text`) | Ayşe ile kahve · Per 11 Eyl 15:00 | 60 dk · Ayşe Kara davet edilsin mi? **Evet** (`brand/text-on-soft` bold — inline toggle) |
| `add_task` neutral | GÖREV (`ink/tertiary`) | Raporu bitir · Per 11 Eyl 14:00'a kadar | Plan'da önerilen blok: Per 10:00–12:00 |
| `notifications` warning | HATIRLATICI (`warning/text`) | Rapor için hatırlat · Çar 10 Eyl 19:00 | “Akşam” = 19:00 (brifing saatin) |

   All three selected (`check_circle` brand).
5. Kicker **"ÖNERİLEN AKSİYONLAR"**; chips: `event` **"Takvime Ekle · 1"** · `add_task` **"Görev Oluştur · 1"** · `notifications` **"Hatırlat · 1"** (all primary-soft).
6. sticky/cta-bar: **"3 Öğeyi Onaya Gönder"** + **"Düzenle"**.

Design note verbatim: *"AI'ın yorumları görünür: "akşam = 19:00 (brifing saatin)", "kahveden 1 saat önce". Her yorum satır içinde düzeltilebilir; kaynak alıntı üstte italik."*

Interactive / dead: **Evet** inline toggle (Evet/Hayır — invite Ayşe Kara or not), AI-interpretation subs are tappable → inline edit (change block time, change 19:00), rows toggle selection, chips, **3 Öğeyi Onaya Gönder** (→ confirmation sheet, 4.12d pattern, then 4.14d), **Düzenle**.

### 4.14d · Onay + başarı

**Purpose.** Terminal success state after approving the batch (the confirmation sheet itself is the 4.12d pattern and is not re-drawn).

Layout (padding `6 20 0`):
1. nav/top-bar: close · **"EKLE · METİN"** · spacer.
2. Centered block (flex 1, gap 14, padding `0 20 120`, text center):
   - success ring 96×96 circle `success/soft` with `check_circle` FILL 48 `success/text`
   - **"3 öğe eklendi"** `26/600 -2%` (template `{n} öğe eklendi`)
   - **"Kahve takviminde, rapor Plan'da, hatırlatıcı Çarşamba 19:00'da. Ayşe'ye davet gönderildi."** `15/22 ink/secondary`
   - destination chips (chip/pill surface variant, `ink/secondary`, icon colored): `event` (`info/text`) **"Per 15:00"** · `add_task` **"Per 14:00"** · `notifications` (`warning/text`) **"Çar 19:00"**
   - **"Bugün'e Dön"** button/dark (mt 12)
3. **Toast** (bottom 104): `check` + **"Onaylandı · 3 işlem"** + action **"Geri al"**. Auto-dismiss 5 s.

Design note verbatim: *"Onay sayfası PDF/Link ile aynıdır (4.12d kalıbı); burada onay sonrası başarı ekranı: yeşil halka, tek cümle özet, nereye yazıldığını gösteren çipler, 5 sn "Geri al" toast'ı."*

Interactive / dead: **Bugün'e Dön** (close modal → Bugün tab), **Geri al** (revert all 3 writes within 5 s; screen returns to 4.14c with items still selected), destination chips (tap → open the created event / task / reminder), close (same as Bugün'e Dön).

Motion: ring scales in (spring, 0.6→1), check draws; chips stagger 60 ms; medium success haptic (`notificationSuccess`).

---

## 5. Cross-screen flows

```
Akış (4.1/4.2) ─ card ─▶ Mail Detayı 4.4 ─ Yanıt Hazırla ─▶ Yanıt Taslağı 4.5 ─ Göndermeyi Onayla ─▶ sent (toast) ─▶ back
   │                      └ Hatırlat ─▶ Smart reminder sheet 4.11
   ├ Mail filter/header ─▶ Mail Zekâsı 4.3 ─ rows ─▶ 4.7 Senden Beklenenler / 4.6 Takip Etmen Gerekenler
   ├ TAAHHÜT card ─▶ Taahhütler 4.8
   ├ Kişisel ─▶ 4.2 (in-tab) / Kişisel screen 4.9
   └ Ekle ─▶ Capture modal (4.12a entry) ─ tiles ─▶ Fotoğraf 4.11 / Ekran görüntüsü 4.10 / PDF 4.12a-d / Link 4.13a-d / Metin 4.14a-d
                                      analysis ─▶ detections ─▶ "N Öğeyi Onaya Gönder" ─▶ Onay sheet (4.12d/4.13d) ─▶ Onayla ─▶ success 4.14d ─▶ Bugün
```

Universal capture state machine (same for every source): `entry → analyzing (findings list, cancellable) → detected (selectable items + type chips) → confirm sheet (Onay · n işlem) → success (+ 5 s undo toast) → Bugün`.

Approval language rule (from 4.5 note): write actions never say "Gönder"/"Kaydet" alone — always **"Göndermeyi Onayla"**, **"Onayla · n"**, **"N Öğeyi Onaya Gönder"**. Every approved write is logged to **Onay Merkezi** history (file 07).

## 6. Complete i18n string inventory (this file)

Suggested key → verbatim value. Keep Turkish characters, curly quotes and `·` separators exactly.

```
flow.title = Akış
flow.add = Ekle
flow.filter.all = Tümü
flow.filter.important = Önemli
flow.filter.mail = Mail
flow.filter.calendar = Takvim
flow.filter.followup = Takip
flow.filter.personal = Kişisel
flow.meta = {count} konu · {important} önemli · Son analiz {time}
flow.meta.short = {count} konu · {important} önemli
badge.urgent = ACİL
badge.today = BUGÜN
badge.followup = TAKİP
badge.deadline = SON TARİH
badge.security = GÜVENLİK
badge.commitment = TAAHHÜT
badge.shipment = KARGO
badge.flight = UÇUŞ
badge.payment = ÖDEME
badge.subscription = ABONELİK
badge.reservation = REZERVASYON
badge.open = AÇIK
badge.late = GECİKMİŞ
badge.done = TAMAMLANDI
action.reply = Yanıtla
action.prepare = Hazırlan
action.draftFollowup = Takip Mesajı Hazırla
action.addToCalendar = Takvime Ekle
action.check = Kontrol Et
action.plan = Planla
action.track = Takip Et
action.checkin = Check-in
action.remind = Hatırlat
action.review = İncele
action.confirm = Teyit Et
action.draftReply = Yanıt Hazırla
action.createTask = Görev Oluştur
action.remindTomorrow = Yarın Hatırlat
action.close = Kapat
action.done = Tamamlandı
action.snooze = Ertele
action.viewSource = Kaynağı Gör
action.leaveDoorNote = Kapıya Not Bırak
action.addToWallet = Cüzdana Ekle
action.directions = Yol Tarifi
action.paid = Ödendi
action.dontShowAgain = Bir Daha Gösterme
action.itWasMe = Bendim
action.changePassword = Şifreyi Değiştir
action.open = Aç
action.edit = Düzenle
action.cancel = İptal
action.dismiss = Vazgeç
action.clear = Temizle
action.undo = Geri al
action.analyze = Analiz Et
action.approveSend = Göndermeyi Onayla
action.approveN = Onayla · {n}
action.sendToApproval = {n} Öğeyi Onaya Gönder
action.backToToday = Bugün'e Dön
action.linkToPerson = {name}'e bağla
mail.kicker = MAİL ZEKÂSI · BUGÜN
mail.hero.count = {total}
mail.hero.suffix = mail geldi
mail.hero.attention = {n} tanesi dikkat gerektiriyor.
mail.hero.detail = {read}'sini senin için okudum; {low}'ü düşük öncelikli, {info}'i bilgilendirme.
mail.cat.important = Önemli
mail.cat.waitingOnYou = Senden cevap bekleyen
mail.cat.waitingOnThem = Senin cevap beklediğin
mail.cat.deadline = Son tarih içeren
mail.cat.info = Bilgilendirme
mail.cat.low = Düşük öncelik
mail.section.important = ÖNEMLİ · {n}
mailDetail.aiSummary = AI ÖZETİ
mailDetail.keyPoints = ÖNEMLİ NOKTALAR
mailDetail.suggestedActions = ÖNERİLEN AKSİYONLAR
mailDetail.original = Orijinal Mail
mailDetail.source = Kaynak: {provider} · {email} · {folder} · Konu dizisi {n} mail
mailDetail.meta = {when} · {provider} · Sana
draft.kicker = YANIT TASLAĞI
draft.to = Kime
draft.tone.short = Kısa
draft.tone.professional = Profesyonel
draft.tone.friendly = Samimi
draft.tone.detailed = Detaylı
draft.aiKicker = AI TASLAĞI · {TONE}
draft.editable = Düzenlenebilir
draft.attach = {file} ekle
draft.shorten = Kısalt
draft.assurance = Sen onaylamadan hiçbir mail gönderilmez.
followup.title = Takip Etmen Gerekenler
followup.subtitle = {n} gönderdiğin mail yanıtsız. En eskisi {d} gün.
followup.days = {d} gün
followup.hint = Bir kişiyi “Takip etme” dersen, o kişiden bekleyen mailleri bir daha göstermem.
waiting.title = Senden Beklenenler
waiting.subtitle = {n} kişi cevabını bekliyor.
waiting.group.urgent = ACİL
waiting.group.today = BUGÜN
waiting.group.soon = YAKINDA
commit.title = Taahhütlerin
commit.subtitle = Mail ve notlarında verdiğin sözleri yakaladım. {open} açık, {late} gecikmiş.
commit.label.what = Taahhüt
commit.label.who = Kime
commit.label.source = Kaynak
life.title = Kişisel
life.subtitle = Mail ve bildirimlerinden türetilen yaşam sinyalleri.
capture.kicker = EKLE
capture.kicker.photo = EKLE · FOTOĞRAF
capture.kicker.pdf = EKLE · PDF
capture.kicker.link = EKLE · LİNK
capture.kicker.text = EKLE · METİN
capture.tile.photo = Fotoğraf
capture.tile.screenshot = Ekran görüntüsü
capture.tile.pdf = PDF
capture.tile.link = Link
capture.note.placeholder = Bir not yaz veya yapıştır…
capture.text.hint = Serbest yaz; tarih, kişi ve görevleri ben ayırırım.
capture.text.dictate = Sesle yaz
capture.text.paste = Yapıştır
capture.text.count = {n} karakter
capture.detected.event = ETKİNLİK TESPİT EDİLDİ
capture.detected.bill = FATURA TESPİT EDİLDİ
capture.detected.contract = SÖZLEŞME TESPİT EDİLDİ · {n} ÖĞE
capture.detected.items = {n} ÖĞE TESPİT EDİLDİ
capture.suggested = ÖNERİLEN AKSİYONLAR
capture.suggested.calendar = Takvime Ekle · {n}
capture.suggested.task = Görev Oluştur · {n}
capture.suggested.remind = Hatırlat · {n}
capture.item.deadline = SON TARİH
capture.item.task = GÖREV
capture.item.event = ETKİNLİK
capture.item.calendarEvent = TAKVİM OLAYI
capture.item.reminder = HATIRLATICI
capture.item.source = Kaynak: {ref}
capture.type.event = Etkinlik
capture.type.product = Ürün
capture.type.content = İçerik
capture.type.reservation = Rezervasyon
capture.pdf.sheetTitle = PDF seç
capture.pdf.sheetSub = Son dosyalar · Mail eklerinden ve Dosyalar'dan
capture.pdf.pickFiles = Dosyalar'dan seç…
capture.pdf.analyzing = PDF ANALİZ EDİLİYOR…
capture.pdf.pagesRead = {n} sayfa okundu
capture.pdf.datesFound = {n} tarih bulundu
capture.pdf.extracting = Yükümlülükler ve görevler çıkarılıyor…
capture.pdf.checkingCalendar = Takvim uygunluğu kontrol ediliyor
capture.pdf.privacy = Belge cihazında özetlenir; içerik saklanmaz, yalnızca çıkarılan öğeler.
capture.link.pasted = Panodan yapıştırıldı
capture.link.preview = Bağlantı önizlemesi
capture.link.recent = SON EKLENEN LİNKLER
capture.link.analyzing = BAĞLANTI ANALİZ EDİLİYOR…
capture.link.pageRead = Sayfa okundu
capture.link.type = Tür: {type}
capture.link.typeDetail = ürün · içerik · rezervasyon değil
capture.link.fieldsFound = Tarih, saat, yer ve fiyat bulundu
capture.link.checking = Takvim uygunluğu ve yol süresi kontrol ediliyor…
capture.link.privacy = Sayfa yalnızca bir kez okunur; çerez veya oturum paylaşılmaz.
capture.link.source = Kaynak: {domain} · okunma {time}
capture.text.analyzing = METİN ANALİZ EDİLİYOR…
capture.text.timesResolved = {n} zaman ifadesi çözüldü
capture.text.personMatched = Kişi eşleştirildi
capture.text.splitting = Görev ve hatırlatıcı ayrılıyor…
capture.legend.time = zaman
capture.legend.person = kişi
capture.legend.task = görev
capture.legend.reminder = hatırlatıcı
confirm.title = Onay · {n} işlem
confirm.sub.generic = Sen onaylamadan hiçbiri yapılmaz. İstemediğini kaldır.
confirm.sub.calendar = Takviminde değişiklik yapmadan önce onayın gerekir.
confirm.row.calendar = TAKVİME EKLE
confirm.row.task = GÖREV OLUŞTUR
confirm.row.reminder = HATIRLATICI
confirm.why = Neden
confirm.change = Değişim
confirm.footer = Onaylananlar Onay Merkezi geçmişine yazılır.
confirm.smartTime = Uygun zamanda: {when}
success.title = {n} öğe eklendi
toast.approved = Onaylandı · {n} işlem
reminder.title = Ne zaman hatırlatayım?
reminder.opt.30m = 30 dakika önce
reminder.opt.1h = 1 saat önce
reminder.opt.evening = Bu akşam
reminder.opt.tomorrowMorning = Yarın sabah
reminder.opt.custom = Özel zaman
reminder.opt.smart = Uygun zamanda
reminder.opt.smartReason = Takvimine göre: {when}
```

## 7. Open questions for design (found while extracting)

1. Feed meta says "5 önemli" while only 3 badges are colored — confirm the "önemli" definition (likely ACİL + SON TARİH + GÜVENLİK + BUGÜN + TAKİP).
2. Follow-up wait badge threshold: note says coral after 7 days, example shows 6 days coral.
3. Same thread appears as Ahmet Yılmaz (4.3, feed) and Mehmet Yılmaz (4.4, 4.5, 4.7 lists Ahmet); pick one for seed data.
4. CK Enerji bill due 10 Eylül (feed/life) vs 15 Eylül (4.11).
5. Dark active tab uses `dark/primary-glow` (#A9AAF5) rather than `dark/primary` (#8586F2) — confirm which is canonical.
6. TAMAMLANDI commitment card still shows Tamamlandı/Ertele actions (template artifact).
7. Empty/error/offline states for 4.1, 4.3, 4.6–4.9 are not drawn in this file; proposals above are marked "(proposed)".
