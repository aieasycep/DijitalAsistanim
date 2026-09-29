# Claude Design 09 · Mağaza Ekranları ve Reklamlar — Implementation Spec

Source of truth: `design/claude/09 Pazarlama.dc.html` (Claude Design canvas, `design_doc_mode=canvas`).
Companion pages referenced by the canvas header nav: `Dijital Asistan.dc.html` (Prototip ve IA), `01 Tasarim Sistemi`, `02 Onboarding`, `03 Bugun ve Brifingler`, `04 Akis ve Mail`, `05 Plan ve Toplantilar`, `06 Asistan Hafiza Kisiler`, `07 Hesap Gizlilik Pro`, `08 Durumlar Widgetlar Etkilesimler`.

> Note on data: this page has **no trailing `<script type="text/x-dc">` data array**. Every string and every example row is inlined in the markup and is transcribed verbatim below. There is nothing else to extract from the source.

---

## 0. What this page is (and is not)

This page is **not an in-app screen**. It is the marketing asset set:

| Group | Count | Canvas size | Preview scale on canvas | Purpose |
|---|---|---|---|---|
| `store/01`–`store/06` | 6 | **1290 × 2796** (App Store 6.7") | 30 % → 387 × 839 | App Store / Google Play screenshots |
| `ad/01`–`ad/03` | 3 | **1080 × 1920** (9:16) | 35 % → 378 × 672 | Paid social / video-ad stills (Reels, TikTok, Stories) |

Verbatim page header copy (Turkish, keep for the internal press-kit/marketing page if one is built):

- H1: **"09 · Mağaza Ekranları ve Reklamlar"**
- Lead: **"6 mağaza görseli 1290×2796 (App Store 6.7", Google Play için aynı kompozisyon 1080×1920'ye yeniden çerçevelenir). 3 reklam 9:16, 1080×1920. Tüm görseller ürünün gerçek ekranlarını kullanır; metinler brief'ten birebir. Aşağıda %30 / %35 ölçekte gösterilir."**
- Section kicker 1: **"MAĞAZA · 6 EKRAN · 1290×2796"**
- Section kicker 2: **"REKLAM · 3 KONSEPT · 9:16 · 1080×1920"**
- Rules footnote (verbatim): **"Reklam kuralları: ürün ekranı her zaman gerçek bileşen; kişisel isimler kurgusal. Sesli/videolu sürümde AD 1 sayılar yukarıdan akarak 4'e "çöker", AD 3 alıntı daktilo efektiyle yazılır. Alt logo bloğu üçünde sabit."**
- Canvas nav labels (canvas-only, not product UI): "← Prototip ve IA", "01 Sistem", "02 Onboarding", "03 Bugün", "04 Akış", "05 Plan", "06 Asistan", "07 Hesap", "08 Durumlar", "09 Pazarlama".

### 0.1 Where this sits for engineering

1. **Store listing pipeline** — the 6 screenshots + 3 ad stills must be rendered from **real product components** ("ürün ekranı her zaman gerçek bileşen"). Recommended: a Next.js route (e.g. `/internal/marketing/store/[id]`) that renders each composition at true pixel size using the shared web component library, captured with Playwright to PNG/WebP. Alternatively an Expo dev-only screen that renders the embedded phone screens at 390 pt and screenshots at 3×.
2. **Marketing site (Next.js)** — the same compositions are the natural hero/feature sections for the landing page (one section per `store/0x`), so the copy below doubles as landing-page copy.
3. **Seed / demo data** — the phone screens inside the frames are simplified versions of real app screens (Bugün, Akış/Mail, Toplantı hazırlığı, Senden Beklenenler, Plan, Asistan). Their example data must exist in the demo/seed dataset so that "real component" renders match this design 1:1. The field lists in §6 inform the domain model.

### 0.2 Fonts and icon font

- `Geist` 300–700 (UI/sans) — all non-editorial text.
- `Lora` 400–600, italic 400–600 (editorial serif) — used in `ad/03` only (quote + brief paragraph).
- `Material Symbols Rounded` with axes `opsz 20..48, wght 300..600, FILL 0..1, GRAD 0`. Filled icons are called out as `FILL 1` below; everything else is outlined.
- Canvas page bg `#ECEAE4` (canvas chrome only, not a product token).

### 0.3 Colors used that are **not** in the token list (flag for the design-system owner)

| Value | Where | Suggested token |
|---|---|---|
| `#E4E4FA → #FFFFFF` radial | hero brief card (`store/01`, `ad/01`), `card/ai-insight` (`store/05`), | `brand/glow-radial` (already the canonical hero/ai-insight fill in 03/05 pages) |
| `#C9C7F3` | mail segment bar, middle segment (`store/02`) | `brand/tint-mid` |
| `#F5E1D6` / `#7A3E1F` | avatar "AY" (Ahmet Yılmaz) | `avatar/warm-bg` / `avatar/warm-fg` |
| `#E3EFE6` / `#1E5A36` | avatar "SK" (Selin Kaya) | `avatar/green-bg` / `avatar/green-fg` |
| `#DCE4F5` / `#2B3F73` | avatar "MY" (Mehmet Yılmaz) | `avatar/blue-bg` / `avatar/blue-fg` |
| `#3A3936` | device bezel on dark background (`store/03`) | `bezel/on-dark` (bezel on light = `ink`) |
| `rgba(27,25,23,.06)` | source-row divider (`store/06`) | `hairline/alpha` (≈ `neutral/hairline`) |
| `rgba(255,255,255,.12)` | numbered circle on dark AI card (`store/03`) | `dark/surface-2` (token list has `rgba(255,255,255,.08)`; design uses .12 here) |
| `rgba(255,255,255,.7)` / `.75` / `.65` | secondary text on gradient/ink backgrounds | `on-dark/secondary` |
| `#1A1917` white "Y" avatar | user avatar in `store/01` header | `ink` bg + `neutral/surface` text |

### 0.4 Shadows (reuse the same three everywhere)

- `shadow/card` = `0 1px 2px rgba(27,25,23,.04), 0 6px 20px rgba(27,25,23,.05)` — every white card.
- `shadow/hero` = `0 1px 2px rgba(27,25,23,.04), 0 12px 32px rgba(91,92,226,.10)` — hero brief card (brand-tinted).
- `shadow/dark-card` = `0 12px 32px rgba(27,25,23,.18)` — dark AI card (`store/03`).
- Marketing-only: `shadow/device` = `0 0 0 18px <bezel>, 0 80px 160px rgba(0,0,0,.35|.4|.5)` or `rgba(27,25,23,.3)` on light bgs; `shadow/ad-card` = `0 30px 90px rgba(91,92,226,.16)` (`ad/01`), `0 40px 100px rgba(0,0,0,.4)` (`ad/02`), `0 40px 100px rgba(0,0,0,.35)` (`ad/03`); canvas thumbnail `0 20px 50px rgba(27,25,23,.14)`.

---

## 1. Shared composition system — store screenshots (1290 × 2796)

All six store screens share one layout. Build one `<StoreShot>` component with props `{ background, kicker, kickerColor, headline, subline?, deviceTop, bezelColor, deviceShadow, children }`.

```
┌──────────────────────────────── 1290 ───────────────────────────────┐
│ top 180                                                             │
│ ┌ left 110 ───────────────────────────────────── right 110 ┐        │
│ │ KICKER            40px / 600 / letter-spacing .12em       │        │
│ │ (gap 36)                                                  │        │
│ │ Headline          112–124px / 120–130 / 600 / -.03…-.035em│        │
│ │ (gap 30, optional)                                        │        │
│ │ Subline           44px / 58 / 400                         │        │
│ └───────────────────────────────────────────────────────────┘        │
│                                                                     │
│ top 980 / 1000 / 1060                                               │
│      ┌ left 155 ─────────── 980 wide ───────────┐                   │
│      │  device frame, radius 130, bezel 18px    │                   │
│      │  bg neutral/bg                            │                   │
│      │  ┌ inner app screen: 390 pt × scale 2.513 │  height 2000     │
│      │  │ padding 0 20, status bar 54 px         │  (bleeds off the │
│      │  │ …real product components…              │   bottom edge)   │
└──────┴──┴────────────────────────────────────────┴───────────────────┘ 2796
```

- Headline block: `position:absolute; left:110; right:110; top:180` → 1070 px content width. `text-wrap: pretty` on headlines.
- Device frame: `position:absolute; left:155; width:980; height:2000; border-radius:130; background: neutral/bg; overflow:hidden`. `top` is 1000 (`store/01`), 980 (`store/05`) or 1060 (all others). Because `top + 2000 > 2796`, the frame is intentionally **cropped at the bottom** — never show a bottom bezel.
- Inner screen: a `390 pt`-wide app viewport scaled `2.513×` (390 × 2.513 ≈ 980). Render real components at 390 pt logical width; do not hand-scale type. Inner horizontal padding `0 20`.
- Status bar (marketing-only chrome): height 54, `align-items:flex-end`, padding `0 10 8`, `15/600`. Left: time (`9:41`, `store/03` uses `14:12`). Right: icons `signal_cellular_alt`, `wifi`, `battery_full` at 17 px, gap 4.
- Type inside the frame follows the product scale exactly: h1 28/34 600 -.02em, h2 22/28 600 -.02em, h3 17/23 600 -.01em, body 15/21–22, secondary 14/20 `ink/secondary`, kicker 12/16 600 +.08em `ink/tertiary` (brand kickers use `.06em` + `brand/primary`), badge 11/14 700 +.05em.
- Google Play reframe (1080 × 1920): scale the whole composition by `1080/1290 = 0.837` (headline block becomes ~top 151, 33/94–104 px type) and **crop the bottom** (2796 × 0.837 = 2341 → cut 421 px off the bottom of the device). Keep the headline block untouched; the device frame is already designed to be cropped.

---

## 2. Store screens

### 2.1 `store/01 · Today` — "Bugün bilmen gerekenleri, sen sormadan söyler."

**Purpose.** First screenshot; brand promise + the Bugün (Today) tab hero. Product screen depicted: **Bugün · Light** (tab 1 of bottom nav *Bugün / Akış / Plan / Asistan*).

**Backdrop.** `gradient/dawn` (`linear-gradient(160deg,#1E1E4C 0%,#3B3CA8 58%,#7071EA 100%)`), text `#FFFFFF`.

**Headline block.**
- Kicker: **"DİJİTAL ASİSTAN"** — 40/600, `.12em`, white at `opacity .75`.
- Headline: **"Bugün bilmen gerekenleri, sen sormadan söyler."** — 112/120, 600, `-.03em`, white.
- No subline.

**Device.** `top:1000`, bezel `ink`, shadow `0 80px 160px rgba(0,0,0,.35)`.

**Inner screen (Bugün · Light), top-to-bottom, all at 390 pt:**
1. Status bar — `9:41`.
2. **Header row** (`margin-top:14`, flex, `align-items:flex-end`, space-between):
   - Kicker **"5 EYLÜL CUMARTESİ"** — 12/600 `.08em` `ink/tertiary`.
   - Title **"Günaydın, Yunus"** — h1 28/34 600 `-.02em` `ink`, `margin-top:4`.
   - Right: avatar 40 × 40 circle, bg `ink`, text `neutral/surface`, **"Y"** 15/600.
3. **Hero brief card** (`margin-top:18`): bg `radial-gradient(140% 100% at 100% 0%, #E4E4FA 0%, #FFFFFF 58%)`, radius **28**, padding `22 22 20`, `shadow/hero`.
   - Kicker row: icon `auto_awesome` 16 px `FILL 1` + **"BRİFİNG HAZIR · 07:58"** — 12/600 `.06em` `brand/primary`, gap 6.
   - Title: **"Bugün bilmen gereken 5 şey var."** — 26/32 600 `-.02em`; the number **"5"** colored `brand/primary`. `margin-top:10`.
   - Meta: **"3 önemli mail · 4 etkinlik · 2 takip"** — 14 `ink/secondary`, `margin-top:8`.
   - Button row (`margin-top:18`, gap 10):
     - Primary **"Brifingimi Gör"** — `flex:1`, height 48, radius 14, bg `brand/primary`, text white 15/600.
     - Secondary **"Dinle · 2 dk"** — height 48, padding `0 16 0 12`, radius 14, bg `brand/soft`, text `brand/text-on-soft` 14/600, leading icon `play_arrow` 20 px `FILL 1`, gap 4.
4. Section kicker **"ÖNCELİKLERİN"** — `margin-top:18`, 12/600 `.08em` `ink/tertiary`, padding `0 4`.
5. **`card/priority`** (`margin-top:10`): bg `neutral/surface`, radius **20**, padding `14 16`, `shadow/card`.
   - Row: badge **"ACİL"** — 11/700 `.05em`, padding `3 8`, pill (999), bg `critical/soft`, text `critical/text`; then time **"08:42"** 12 `ink/tertiary`, gap 8.
   - Title: **"Ahmet senden bugün 17:00'ye kadar revize teklif bekliyor."** — h3 17/23 600 `-.01em`, `margin-top:6`.
   - Source row (`margin-top:10`, gap 6): icon `mail` 16 px + **"Gmail · Ahmet Yılmaz · 08:42"** — 12 `ink/tertiary`.
6. (Cropped by frame bottom — nothing else rendered.)

**Interactive elements depicted → real behaviour** (all dead in the still; see §5):
- "Brifingimi Gör" → opens the daily brief (spec 03, Brifing detail).
- "Dinle · 2 dk" → starts audio brief playback (spec 03, voice brief player).
- `card/priority` → opens the priority detail / source mail (spec 03/04).
- Avatar "Y" → Hesap (spec 07).

---

### 2.2 `store/02 · Mail Intelligence` — "83 mail. Önemli olan 4."

**Purpose.** Feature screenshot for mail triage. Product screen depicted: **Akış → Mail zekâsı summary** (tab 2, Akış).

**Backdrop.** `neutral/bg` (#F5F4F0), text `ink`.

**Headline block.**
- Kicker: **"MAİL ZEKÂSI"** — `ink/tertiary`.
- Headline: **"83 mail.\nÖnemli olan 4."** (explicit line break after "83 mail.") — 124/130, 600, `-.035em`; the **"4"** colored `brand/primary`.
- Subline: **"Gerisini senin için okur."** — 44/58 `ink/secondary`, `margin-top:30`.

**Device.** `top:1060`, bezel `ink`, shadow `0 80px 160px rgba(27,25,23,.3)`.

**Inner screen, top-to-bottom:**
1. Status bar — `9:41`.
2. **Stat row** (`margin-top:20`, baseline-aligned, gap 10): **"83"** display 44/48 600 `-.03em` `ink` + **"mail geldi"** 17 `ink/secondary`.
3. Line: **"4 tanesi dikkat gerektiriyor."** — h2 22/28 600 `-.02em`, **"4"** in `brand/primary`, `margin-top:6`.
4. **Mail segment bar** (`margin-top:14`): height 8, radius 4, `overflow:hidden`, flex, gap 2. Segments: `5 %` `brand/primary` (needs attention), `37 %` `#C9C7F3` (`brand/tint-mid`, worth a look), `58 %` `neutral/hairline` (noise / auto-archived).
5. **`card/mail` #1** (`margin-top:18`): bg `neutral/surface`, radius 20, padding `14 16`, `shadow/card`.
   - Row (gap 8): avatar 28 circle bg `#F5E1D6` text `#7A3E1F` **"AY"** 11/600; name **"Ahmet Yılmaz"** 13/600 `flex:1`; badge **"ACİL"** 11/700 pill `critical/soft`/`critical/text`, padding `3 8`.
   - Body: **"Revize fiyat teklifini bugün 17:00'ye kadar PDF olarak istiyor."** — 15/21 `ink`, `margin-top:8`.
6. **`card/mail` #2** (`margin-top:10`), same card style:
   - Row: avatar 28 bg `#E3EFE6` text `#1E5A36` **"SK"**; name **"Selin Kaya"**; right meta **"Dün"** 12 `ink/tertiary` (no badge).
   - Body: **"Sözleşme taslağının 4. maddesi için yorumunu bekliyor."**
7. Cropped.

**Interactive → real behaviour:** each `card/mail` opens the mail summary / thread (spec 04). Segment bar is informational (tap could filter Akış by tier — not in prototype).

---

### 2.3 `store/03 · Meeting Prep` — "Toplantıya hazırlıksız girme."

**Purpose.** Feature screenshot for the pre-meeting brief. Product screen depicted: **Toplantıya hazırlan** sheet/card (spec 05, Plan → meeting prep; surfaced 20 min before a meeting as a notification/sheet).

**Backdrop.** `ink` (#1A1917), text white — the only dark-backdrop store shot.

**Headline block.**
- Kicker: **"TOPLANTI HAZIRLIĞI"** — `brand/dark-glow` (#A9AAF5).
- Headline: **"Toplantıya hazırlıksız girme."** — 116/124, 600, `-.03em`, white.
- Subline: **"20 dakika önce: konuşman gereken 3 şey."** — 44/58 `rgba(255,255,255,.7)`.

**Device.** `top:1060`, bezel **`#3A3936`** (lighter bezel so it separates from the ink backdrop), shadow `0 80px 160px rgba(0,0,0,.5)`.

**Inner screen, top-to-bottom:**
1. Status bar — **`14:12`** (deliberately 18 min before the 14:30 meeting).
2. **Kicker row** (`margin-top:12`, space-between): kicker **"TOPLANTIYA HAZIRLAN"** 12/600 `.08em` `ink/tertiary`; right chip **"18 dk"** — height 30, padding `0 10`, pill, bg `warning/soft`, text `warning/text` 12/600, leading icon `schedule` 15 px, gap 4. (Countdown to meeting start.)
3. **Person row** (`margin-top:14`, gap 14): avatar 56 circle bg `#DCE4F5` text `#2B3F73` **"MY"** 20/600; name **"Mehmet Yılmaz"** 24/30 600 `-.02em`; meta **"Müşteri toplantısı · 14:30 · 60 dk"** 14 `ink/secondary`, `margin-top:2`.
4. **Dark AI card** (`margin-top:16`): bg `ink`, text white, radius **24**, padding 20, `shadow/dark-card`.
   - Kicker row: `auto_awesome` 16 `FILL 1` + **"KONUŞMAN GEREKEN 3 ŞEY"** — 12/600 `.06em` `brand/dark-glow`, gap 6.
   - Numbered list (`margin-top:14`, column gap 14; each row flex gap 14): number circle 26 × 26, bg `rgba(255,255,255,.12)`, 13/600, `flex:none`; title 17/600 white; description 14/20 `rgba(255,255,255,.7)`, `margin-top:2`.
     1. **"Fiyat"** — **"Revize teklif 17:00'ye kadar bekleniyor."**
     2. **"Teslim tarihi"** — **"Ekim başı için onay istiyor."**
     3. **"Sözleşme"** — **"Taslak 2 haftadır açık."**
5. Cropped.

**Interactive → real behaviour:** "18 dk" chip → opens the calendar event; person row → `card/person` detail (spec 06, Kişiler); each talking point → its source (mail thread / note). The whole card is what the "Toplantıya hazırlan" push notification deep-links to.

---

### 2.4 `store/04 · Follow-ups` — "Kim senden cevap bekliyor?"

**Purpose.** Feature screenshot for "Senden Beklenenler" (things people are waiting on from you). Product screen depicted: **Senden Beklenenler** list (spec 04, Akış → Senden Beklenenler; reachable from Bugün hero meta "2 takip").

**Backdrop.** `brand/soft` (#EDEDFC), text `ink`.

**Headline block.**
- Kicker: **"SENDEN BEKLENENLER"** — `brand/text-on-soft` (#4547C9).
- Headline: **"Kim senden cevap bekliyor?"** — 124/130, 600, `-.035em`.
- Subline: **"Unutulan mail kalmaz."** — 44/58 `ink/secondary`.

**Device.** `top:1060`, bezel `ink`, shadow `0 80px 160px rgba(27,25,23,.3)`.

**Inner screen, top-to-bottom:**
1. Status bar — `9:41`.
2. Title **"Senden Beklenenler"** — h1 28/34 600 `-.02em`, `margin-top:16`. Subtitle **"4 kişi cevabını bekliyor."** — 14 `ink/secondary`, `margin-top:4`. (Only 2 of the 4 rows are visible before the crop — that is intended.)
3. **Group header "ACİL"** (`margin-top:16`, padding `0 4 8`, gap 6): 6 × 6 dot radius 3 bg `critical` + label **"ACİL"** 12/600 `.08em` `critical/text`.
4. **`card/person` (follow-up variant) #1**: bg `neutral/surface`, radius **18**, padding `14 16`, `shadow/card`, flex gap 12.
   - Avatar 40 circle bg `#F5E1D6` text `#7A3E1F` **"AY"** 13/600, `flex:none`.
   - Content (`flex:1`):
     - Row space-between: name **"Ahmet Yılmaz"** 15/600; age **"2 saat"** 12 `ink/tertiary`.
     - Subject **"Re: Eylül teklifi – revize"** 13 `ink/secondary` (en dash).
     - Ask **"Revize fiyat teklifi, PDF olarak."** 14/20, `margin-top:6`.
     - Footer row space-between (`margin-top:8`): due **"Bugün 17:00"** 12/600 `critical/text`; action link **"Yanıtla"** 13/600 `brand/text-on-soft`.
5. **Group header "BUGÜN"** (`margin-top:14`): dot bg `warning` + label **"BUGÜN"** `warning/text`.
6. **`card/person` (follow-up) #2**: avatar bg `#E3EFE6` text `#1E5A36` **"SK"**; name **"Selin Kaya"**; age **"18 saat"**; subject **"Sözleşme taslağı · 4. madde"**; ask **"Cezai şart maddesi için yorumun."**; no footer row visible (cropped / none).
7. Cropped.

**Interactive → real behaviour:** "Yanıtla" → open reply composer with AI draft (spec 04); row tap → thread; group headers are static. Swipe actions (done / snooze) exist in spec 04 but are not depicted here.

---

### 2.5 `store/05 · Planning` — "Takvimini sadece göstermez. Anlar."

**Purpose.** Feature screenshot for calendar intelligence. Product screen depicted: **Plan tab** (tab 3) with `card/ai-insight` + two `card/calendar` insight rows.

**Backdrop.** `neutral/bg`, text `ink`.

**Headline block.**
- Kicker: **"TAKVİM ZEKÂSI"** — `ink/tertiary`.
- Headline: **"Takvimini sadece göstermez. Anlar."** — 116/124, 600, `-.03em`.
- No subline.

**Device.** `top:980` (highest of the set), bezel `ink`, shadow `0 80px 160px rgba(27,25,23,.3)`.

**Inner screen, top-to-bottom:**
1. Status bar — `9:41`.
2. Title **"Plan"** — h1 28/34 600 `-.02em`, `margin-top:14`.
3. **`card/ai-insight`** (`margin-top:14`): bg `radial-gradient(140% 100% at 0% 0%, #E4E4FA 0%, #FFFFFF 60%)` (glow from top-left — mirror of the hero card), radius **20**, padding 16, `shadow/card`.
   - Kicker row: `auto_awesome` 16 `FILL 1` + **"TAKVİM ZEKÂSI"** 12/600 `.06em` `brand/primary`.
   - Title **"Yarın 14:00–16:30 arasında 2,5 saat boşluğun var."** — 16/23 600 `-.01em`, `margin-top:8` (en dash in the time range, Turkish decimal comma).
   - Description **"Teklif hazırlama görevini buraya yerleştirebilirim."** — 14/20 `ink/secondary`, `margin-top:4`.
   - Button row (`margin-top:12`, gap 8): **"Planla"** — height 40, padding `0 16`, radius 12, bg `brand/primary`, white 14/600. (Only one button in this still; the product card also has a dismiss action per spec 05.)
4. **`card/calendar` insight #1** (`margin-top:12`): bg `neutral/surface`, radius **16**, padding `14 16`, `shadow/card`, flex gap 12. Leading icon `bolt` 20 px `warning/text`. Title **"Yarın oldukça yoğun."** 15/600; description **"09:00 ve 10:00 toplantıların arka arkaya."** 13/19 `ink/secondary`, `margin-top:2`.
5. **`card/calendar` insight #2** (`margin-top:10`): same style. Leading icon `directions_car` 20 px `info/text`. Title **"13:30 doktor için 12:50'de çıkman gerekebilir."** 15/600; description **"38 dk trafik tahmini"** 13/19 `ink/secondary`.
6. Cropped.

**Interactive → real behaviour:** "Planla" → creates a focus block "Teklif hazırlama" in the free slot (spec 05); insight rows → open the day view at the relevant event; the travel-time row could offer "Hatırlat" (not depicted).

---

### 2.6 `store/06 · Assistant` — "Dijital hayatına sor."

**Purpose.** Feature screenshot for the chat assistant with memory + sources. Product screen depicted: **Asistan tab** (tab 4).

**Backdrop.** `gradient/night` (`linear-gradient(180deg,#15153A 0%,#25266A 60%,#3B3CA8 100%)`), text white.

**Headline block.**
- Kicker: **"ASİSTAN"** — white at `opacity .75`.
- Headline: **"Dijital hayatına sor."** — 124/130, 600, `-.035em`.
- Subline: **"Mailin, takvimin ve notların tek hafızada."** — 44/58 `rgba(255,255,255,.75)`.

**Device.** `top:1060`, bezel `ink`, shadow `0 80px 160px rgba(0,0,0,.4)`.

**Inner screen, top-to-bottom:**
1. Status bar — `9:41`.
2. Title **"Asistan"** — h1 28/34 600 `-.02em`, `margin-top:14`.
3. **User bubble** (`margin-top:14`, right-aligned, `max-width:86%`): padding `10 14`, radius 18, bg `brand/primary`, white 15/21: **"Mehmet ile en son ne konuştuk?"**
4. **Assistant bubble** (`margin-top:10`, left, `max-width:90%`): padding `10 14`, radius 18, bg `neutral/surface`, `ink` 15/21, `shadow/card`: **"1 Eylül'de fiyat ve teslim tarihini konuştunuz. Mehmet Ekim başı teslim için revize teklif istedi; sen Cuma göndereceğini söyledin."**
5. **Sources card** (`margin-top:10`): bg `neutral/surface`, radius 16, padding `12 14`, `shadow/card`.
   - Kicker **"KAYNAKLAR"** 12/600 `.06em` `ink/tertiary`.
   - Source rows (`margin-top:6`; each: flex gap 10, padding `8 0`, `border-top:1px solid rgba(27,25,23,.06)`, 14 px):
     1. icon `mail` 18 px `brand/primary` · **"Re: Teklif · Gmail"** (`flex:1`) · **"1 Eyl"** 12 `ink/tertiary`.
     2. icon `call` 18 px `brand/primary` · **"Görüşme notları"** · **"1 Eyl"**.
6. Cropped (composer not visible).

**Interactive → real behaviour:** source rows → open the cited mail thread / call note (spec 06); long-press on assistant bubble → copy / feedback (spec 06); composer + mic below the crop.

---

## 3. Shared composition system — ads (1080 × 1920, 9:16)

Build one `<AdStill>` component: full-bleed background, `padding: 120px 96px`, `display:flex; flex-direction:column`, content stacks from top, and a **logo block pinned to the bottom** with `margin-top:auto`. The footnote says the logo block is identical across the three ("Alt logo bloğu üçünde sabit"):

**Logo block** (flex row, gap 20, align center):
- App tile 88 × 88, radius **28**, icon `auto_awesome` 50 px `FILL 1`. On light bg: tile `brand/primary` + white icon (`ad/01`). On dark/gradient bg: tile white + `brand/primary` icon (`ad/02`, `ad/03`).
- Name **"Dijital Asistan"** — 40/600 `-.01em`.
- Tagline line — 30 px, secondary color (varies per ad, see below).

Ad copy tone: direct second-person Turkish; personal names are fictional ("kişisel isimler kurgusal"); product UI must be real components.

---

## 4. Ads

### 4.1 `ad/01 · Gürültü → 4 şey` — noise collapses into the brief

**Backdrop.** `neutral/bg`, text `ink`.

**Layout top-to-bottom:**
1. **Noise stack** (column, gap 18): three lines, 88/96 600 `-.03em`, color `ink/disabled` (#B8B4AA) with increasing opacity `.55 → .7 → .85`:
   - **"284 okunmamış mail"**
   - **"6 takvim etkinliği"**
   - **"14 görev"**
2. **Arrow** (`margin:60px 0`): 96 × 96 circle, bg `brand/primary`, icon `arrow_downward` 56 px white.
3. **Brief card**: bg `radial-gradient(140% 100% at 100% 0%, #E4E4FA 0%, #FFFFFF 58%)`, radius **64**, padding 64, shadow `0 30px 90px rgba(91,92,226,.16)`.
   - Kicker row (gap 14): `auto_awesome` 40 px `FILL 1` + **"BRİFİNG HAZIR"** 30/600 `.06em` `brand/primary`.
   - Headline **"Bugün gerçekten bilmen gereken 4 şey var."** — 82/92 600 `-.03em`, `margin-top:28`; **"4"** in `brand/primary`.
4. **Logo block** (bottom): tile `brand/primary` + white icon; **"Dijital Asistan"**; tagline **"Gürültüyü değil, önemli olanı gör."** 30 `ink/secondary`.

**Motion (video version).** Per footnote: the three noise numbers "flow in from the top and collapse into 4" ("sayılar yukarıdan akarak 4'e 'çöker'"). Suggested implementation for a web/Lottie version: lines drop in staggered (~120 ms), then scale/blur out into the "4" of the headline while the card fades up; 1.2–1.6 s total; honor `prefers-reduced-motion` by showing the final frame.

---

### 4.2 `ad/02 · Akıllı takip` — smart follow-up on unanswered sent mail

**Backdrop.** `ink` (#1A1917), text white.

**Layout top-to-bottom:**
1. Headline **"Bir maili cevaplamayı unuttuğun oldu mu?"** — 104/112 600 `-.035em`, white.
2. **Follow-up card** (`margin-top:80`): bg white, text `ink`, radius **56**, padding 48, shadow `0 40px 100px rgba(0,0,0,.4)`, **`transform: rotate(-1.5deg)`** (deliberate tilt — keep it).
   - Row (gap 28): avatar 112 circle bg `#DCE4F5` text `#2B3F73` **"MY"** 38/600; name **"Mehmet Yılmaz"** 44/600 `-.01em`; meta **"Teklif · 3 gün önce gönderildi"** 34 `ink/secondary`; right chip **"3 gün"** — height 64, padding `0 24`, pill, bg `warning/soft`, text `warning/text` 30/600.
   - Status line **"Henüz yanıt gelmedi."** — 40/52, `margin-top:32`.
   - Button row (`margin-top:36`, gap 20, 32/600): **"Takip Mesajı Hazırla"** — height 96, padding `0 36`, radius 28, bg `brand/primary`, white; **"Yarın Hatırlat"** — same size, bg `neutral/surface-2` (#F0EFEB), text `ink/secondary`.
3. Body copy (`margin-top:72`): **"Gönderdiğin ve cevap gelmeyen her maili takip eder. Sen unutsan da o unutmaz."** — 40/54 `rgba(255,255,255,.7)`.
4. **Logo block**: tile white + `brand/primary` icon; **"Dijital Asistan"**; tagline **"Akıllı Takip · 7 gün ücretsiz"** 30 `rgba(255,255,255,.65)`.

**Product mapping.** This card is the **sent-mail follow-up** `card/mail` variant (spec 04 "Akıllı takip"): primary action drafts a follow-up with AI, secondary snoozes to tomorrow. The "7 gün ücretsiz" trial claim ties to Pro onboarding (spec 07) — keep the string in sync with the paywall.

---

### 4.3 `ad/03 · Sabah brifingi` — testimonial + morning brief

**Backdrop.** `gradient/dawn`, text white.

**Layout top-to-bottom:**
1. **Quote** — `Lora` (editorial-display) 112/124 `-.02em`, white, curly quotes included verbatim: **"“Ben artık sabah Gmail açmıyorum.”"**
2. Attribution (`margin-top:28`): **"Yunus E. · Kurucu, İstanbul"** — 36 `rgba(255,255,255,.7)`.
3. **Brief card** (`margin-top:80`): outer radius **64**, `overflow:hidden`, shadow `0 40px 100px rgba(0,0,0,.35)`; inner bg `neutral/bg` (#F5F4F0), text `ink`, padding `56 56 48`.
   - Kicker row (gap 14): `auto_awesome` 40 px `FILL 1` + **"SABAH BRİFİNGİ · 08:00"** 30/600 `.06em` `brand/primary`.
   - Greeting **"Günaydın Yunus"** — 68/78 600 `-.025em`, `margin-top:24` (note: no comma here, unlike `store/01`'s "Günaydın, Yunus" — keep each verbatim, flag for copy review).
   - Editorial paragraph — `Lora` 40/60 `ink`, `margin-top:28`: **"Öğlene kadar toplantın bulunmuyor. Saat 14:30'da Mehmet ile müşteri toplantın var. Gelen 46 mail arasında 3 konu dikkat gerektiriyor."**
   - Button (`margin-top:40`): full-width, height 112, radius 32, bg `ink`, white 34/600, centered, gap 16, leading icon `headphones` 44 px: **"Brifingi Dinle · 2 dk"**.
4. **Logo block**: tile white + `brand/primary` icon; **"Dijital Asistan"**; tagline **"Bugün bilmen gerekenleri, sen sormadan söyler."** 30 `rgba(255,255,255,.7)`.

**Product mapping.** The card is the **editorial brief** surface from spec 03 (Lora body, `editorial/paper`-style card; here on `neutral/bg`) with the audio CTA. The quote is a fictional testimonial ("kişisel isimler kurgusal") — do not present as a real customer on the website without a real, consented source.

**Motion (video version).** Per footnote: the quote is typed in with a typewriter effect ("alıntı daktilo efektiyle yazılır"); suggested ~35 ms/char, caret blink, then card slides up. Reduced-motion: static final frame.

---

## 5. Interactive elements and "Dead in prototype"

The page is a set of stills: **every** depicted control is non-functional in the design file. Engineers wiring the marketing site or the render pipeline should treat the compositions as static, but the *product* screens they embed must use real, functional components. Mapping of every depicted control:

| Asset | Depicted control | Dead in prototype | Real behaviour (owning spec) |
|---|---|---|---|
| store/01 | "Brifingimi Gör" (primary) | yes | Open today's brief (03) |
| store/01 | "Dinle · 2 dk" (secondary, play_arrow) | yes | Start audio brief (03) |
| store/01 | `card/priority` row | yes | Open priority → source mail (03/04) |
| store/01 | Avatar "Y" | yes | Open Hesap (07) |
| store/02 | `card/mail` rows ×2 | yes | Open mail summary / thread (04) |
| store/02 | Segment bar | yes (informational) | Optional: filter Akış by tier (04) |
| store/03 | "18 dk" chip | yes | Open calendar event (05) |
| store/03 | Person row "Mehmet Yılmaz" | yes | Open `card/person` detail (06) |
| store/03 | Talking-point rows ×3 | yes | Open source (mail thread / note) (05/06) |
| store/04 | "Yanıtla" link | yes | Reply composer with AI draft (04) |
| store/04 | Follow-up rows ×2 | yes | Open thread (04) |
| store/05 | "Planla" | yes | Create focus block in free slot (05) |
| store/05 | Insight rows ×2 | yes | Open day view at event (05) |
| store/06 | Source rows ×2 | yes | Open cited mail / note (06) |
| store/06 | Message bubbles | yes | Long-press: copy / feedback (06) |
| ad/02 | "Takip Mesajı Hazırla" | yes | AI-draft follow-up on sent mail (04) |
| ad/02 | "Yarın Hatırlat" | yes | Snooze follow-up to tomorrow 09:00 (04) |
| ad/03 | "Brifingi Dinle · 2 dk" | yes | Start audio brief (03) |
| canvas header | Nav links "← Prototip ve IA" … "08 Durumlar" | canvas-only | Not product UI; ignore |

No swipes, toggles, or sheets are depicted on this page.

---

## 6. Data fields per depicted card (domain model input)

These example rows must exist in the demo/seed dataset so real components render the exact stills.

**Brief hero (`store/01`, `ad/01`, `ad/03`)**
- `brief.readyAt` ("07:58" / "08:00"), `brief.itemCount` (5 / 4), `brief.counts.importantMail` (3), `brief.counts.events` (4), `brief.counts.followUps` (2), `brief.audioDurationMin` (2), `brief.greetingName` ("Yunus"), `brief.dateLabel` ("5 EYLÜL CUMARTESİ"), `brief.editorialText` (ad/03 paragraph), `brief.mailTotal` (46) / `brief.mailAttention` (3).

**`card/priority` (`store/01`)**
- `priority.urgency` (ACİL | BUGÜN | …), `priority.time` ("08:42"), `priority.title`, `priority.source.provider` ("Gmail"), `priority.source.person` ("Ahmet Yılmaz"), `priority.source.time`, `priority.source.icon` (mail).

**Mail intelligence summary + `card/mail` (`store/02`)**
- `mailDigest.total` (83), `mailDigest.attention` (4), `mailDigest.segments[]` ({tier, pct}: 5/37/58), `mail.sender.name`, `mail.sender.initials`, `mail.sender.avatarTint` (warm/green/blue), `mail.urgency` (ACİL|null), `mail.relativeTime` ("Dün"), `mail.aiSummary` (one sentence).

**Meeting prep (`store/03`)**
- `meeting.title` ("Müşteri toplantısı"), `meeting.startTime` ("14:30"), `meeting.durationMin` (60), `meeting.minutesUntil` (18), `meeting.counterpart` ({name, initials, avatarTint}), `meeting.talkingPoints[]` ({index, title, detail}) ×3.

**Follow-ups / Senden Beklenenler (`store/04`)**
- `followUp.group` (ACİL | BUGÜN), `followUp.person` ({name, initials, avatarTint}), `followUp.waitingFor` ("2 saat" / "18 saat"), `followUp.subject`, `followUp.ask`, `followUp.dueLabel` ("Bugün 17:00", optional), `followUp.primaryAction` ("Yanıtla"), `screen.waitingCount` (4).

**Plan insights (`store/05`)**
- `insight.kind` (ai-slot | busy-warning | travel), `insight.title`, `insight.detail`, `insight.icon` (auto_awesome | bolt | directions_car), `insight.iconTone` (brand | warning | info), `insight.cta` ("Planla"), `slot.start`/`slot.end` ("14:00"–"16:30"), `slot.durationHours` (2,5), `slot.suggestedTask` ("Teklif hazırlama"), `travel.leaveAt` ("12:50"), `travel.eventAt` ("13:30"), `travel.eventTitle` ("doktor"), `travel.etaMin` (38).

**Assistant (`store/06`)**
- `message.role` (user | assistant), `message.text`, `answer.sources[]` ({type: mail|call, icon, label ("Re: Teklif · Gmail" / "Görüşme notları"), dateLabel ("1 Eyl")}).

**Sent-mail follow-up (`ad/02`)**
- `sent.recipient` ({name, initials, avatarTint}), `sent.subjectShort` ("Teklif"), `sent.sentAgoLabel` ("3 gün önce gönderildi"), `sent.daysWaiting` (3), `sent.status` ("Henüz yanıt gelmedi."), actions `draftFollowUp`, `remindTomorrow`.

**People appearing (fictional; reuse everywhere):** Yunus (user, avatar "Y" on ink), Ahmet Yılmaz "AY" (warm tint), Selin Kaya "SK" (green tint), Mehmet Yılmaz "MY" (blue tint), "Yunus E. · Kurucu, İstanbul" (testimonial).

---

## 7. States

The design shows no loading / empty / error / offline / permission states for marketing assets, and none are needed for exported PNGs. For the **Next.js marketing/press page** that embeds these compositions:

- **Loading:** ship the stills as pre-rendered, statically imported images (`next/image`, WebP + PNG fallback, `priority` on the first). Use a `neutral/surface-2` placeholder box with the same aspect ratio (1290:2796 / 1080:1920) — no spinners.
- **Empty / error / offline:** not applicable; images are static. If an image fails, render the headline copy as text on the asset's background color so the message survives.
- **Permission-denied:** n/a.
- **Dark mode:** the six store shots and three ads are **fixed-theme artwork** and must render identically in dark mode (they are not themed). The page chrome around them (headings, kickers, captions) must follow the theme tokens: light `neutral/bg`/`ink`/`ink/secondary`; dark `bg #141311`/`text #F2F0EB`/`secondary #A39F96`. Do not invert or filter the images.
- **Reduced motion:** any animated (video/Lottie) variant of `ad/01` and `ad/03` must fall back to the final still under `prefers-reduced-motion`.
- **Accessibility:** `alt` = the asset headline (e.g. "Bugün bilmen gerekenleri, sen sormadan söyler.") plus a short description of the phone content; the embedded text is not selectable, so also render the headline as real text next to the image on the web.

---

## 8. Motion / haptics

- Store stills: none.
- `ad/01` video: numbers flow in from the top and "collapse" into the 4 (see §4.1).
- `ad/03` video: quote typed with a typewriter effect (see §4.3).
- Logo block: static in all three.
- Haptics: n/a (marketing).

---

## 9. i18n key proposal (verbatim strings)

Keys are suggestions; values are exact. Keep Turkish typography (İ/ı, curly quotes, en dashes, decimal comma).

```
marketing.page.title                 = "09 · Mağaza Ekranları ve Reklamlar"
marketing.page.lead                  = "6 mağaza görseli 1290×2796 (App Store 6.7\", Google Play için aynı kompozisyon 1080×1920'ye yeniden çerçevelenir). 3 reklam 9:16, 1080×1920. Tüm görseller ürünün gerçek ekranlarını kullanır; metinler brief'ten birebir. Aşağıda %30 / %35 ölçekte gösterilir."
marketing.section.store              = "MAĞAZA · 6 EKRAN · 1290×2796"
marketing.section.ads                = "REKLAM · 3 KONSEPT · 9:16 · 1080×1920"
marketing.rules                      = "Reklam kuralları: ürün ekranı her zaman gerçek bileşen; kişisel isimler kurgusal. Sesli/videolu sürümde AD 1 sayılar yukarıdan akarak 4'e \"çöker\", AD 3 alıntı daktilo efektiyle yazılır. Alt logo bloğu üçünde sabit."

store.01.kicker                      = "DİJİTAL ASİSTAN"
store.01.headline                    = "Bugün bilmen gerekenleri, sen sormadan söyler."
store.01.screen.dateKicker           = "5 EYLÜL CUMARTESİ"
store.01.screen.greeting             = "Günaydın, Yunus"
store.01.screen.avatarInitial        = "Y"
store.01.screen.briefKicker          = "BRİFİNG HAZIR · 07:58"
store.01.screen.briefTitle           = "Bugün bilmen gereken 5 şey var."
store.01.screen.briefMeta            = "3 önemli mail · 4 etkinlik · 2 takip"
store.01.screen.cta.primary          = "Brifingimi Gör"
store.01.screen.cta.listen           = "Dinle · 2 dk"
store.01.screen.sectionPriorities    = "ÖNCELİKLERİN"
store.01.screen.priority.badge       = "ACİL"
store.01.screen.priority.time        = "08:42"
store.01.screen.priority.title       = "Ahmet senden bugün 17:00'ye kadar revize teklif bekliyor."
store.01.screen.priority.source      = "Gmail · Ahmet Yılmaz · 08:42"

store.02.kicker                      = "MAİL ZEKÂSI"
store.02.headline                    = "83 mail.\nÖnemli olan 4."
store.02.subline                     = "Gerisini senin için okur."
store.02.screen.count                = "83"
store.02.screen.countLabel           = "mail geldi"
store.02.screen.attention            = "4 tanesi dikkat gerektiriyor."
store.02.screen.mail1.initials       = "AY"
store.02.screen.mail1.name           = "Ahmet Yılmaz"
store.02.screen.mail1.badge          = "ACİL"
store.02.screen.mail1.summary        = "Revize fiyat teklifini bugün 17:00'ye kadar PDF olarak istiyor."
store.02.screen.mail2.initials       = "SK"
store.02.screen.mail2.name           = "Selin Kaya"
store.02.screen.mail2.time           = "Dün"
store.02.screen.mail2.summary        = "Sözleşme taslağının 4. maddesi için yorumunu bekliyor."

store.03.kicker                      = "TOPLANTI HAZIRLIĞI"
store.03.headline                    = "Toplantıya hazırlıksız girme."
store.03.subline                     = "20 dakika önce: konuşman gereken 3 şey."
store.03.screen.statusTime           = "14:12"
store.03.screen.kicker               = "TOPLANTIYA HAZIRLAN"
store.03.screen.countdown            = "18 dk"
store.03.screen.person.initials      = "MY"
store.03.screen.person.name          = "Mehmet Yılmaz"
store.03.screen.person.meta          = "Müşteri toplantısı · 14:30 · 60 dk"
store.03.screen.aiKicker             = "KONUŞMAN GEREKEN 3 ŞEY"
store.03.screen.point1.title         = "Fiyat"
store.03.screen.point1.detail        = "Revize teklif 17:00'ye kadar bekleniyor."
store.03.screen.point2.title         = "Teslim tarihi"
store.03.screen.point2.detail        = "Ekim başı için onay istiyor."
store.03.screen.point3.title         = "Sözleşme"
store.03.screen.point3.detail        = "Taslak 2 haftadır açık."

store.04.kicker                      = "SENDEN BEKLENENLER"
store.04.headline                    = "Kim senden cevap bekliyor?"
store.04.subline                     = "Unutulan mail kalmaz."
store.04.screen.title                = "Senden Beklenenler"
store.04.screen.subtitle             = "4 kişi cevabını bekliyor."
store.04.screen.group.urgent         = "ACİL"
store.04.screen.group.today          = "BUGÜN"
store.04.screen.row1.initials        = "AY"
store.04.screen.row1.name            = "Ahmet Yılmaz"
store.04.screen.row1.age             = "2 saat"
store.04.screen.row1.subject         = "Re: Eylül teklifi – revize"
store.04.screen.row1.ask             = "Revize fiyat teklifi, PDF olarak."
store.04.screen.row1.due             = "Bugün 17:00"
store.04.screen.row1.action          = "Yanıtla"
store.04.screen.row2.initials        = "SK"
store.04.screen.row2.name            = "Selin Kaya"
store.04.screen.row2.age             = "18 saat"
store.04.screen.row2.subject         = "Sözleşme taslağı · 4. madde"
store.04.screen.row2.ask             = "Cezai şart maddesi için yorumun."

store.05.kicker                      = "TAKVİM ZEKÂSI"
store.05.headline                    = "Takvimini sadece göstermez. Anlar."
store.05.screen.title                = "Plan"
store.05.screen.ai.kicker            = "TAKVİM ZEKÂSI"
store.05.screen.ai.title             = "Yarın 14:00–16:30 arasında 2,5 saat boşluğun var."
store.05.screen.ai.detail            = "Teklif hazırlama görevini buraya yerleştirebilirim."
store.05.screen.ai.cta               = "Planla"
store.05.screen.busy.title           = "Yarın oldukça yoğun."
store.05.screen.busy.detail          = "09:00 ve 10:00 toplantıların arka arkaya."
store.05.screen.travel.title         = "13:30 doktor için 12:50'de çıkman gerekebilir."
store.05.screen.travel.detail        = "38 dk trafik tahmini"

store.06.kicker                      = "ASİSTAN"
store.06.headline                    = "Dijital hayatına sor."
store.06.subline                     = "Mailin, takvimin ve notların tek hafızada."
store.06.screen.title                = "Asistan"
store.06.screen.user                 = "Mehmet ile en son ne konuştuk?"
store.06.screen.assistant            = "1 Eylül'de fiyat ve teslim tarihini konuştunuz. Mehmet Ekim başı teslim için revize teklif istedi; sen Cuma göndereceğini söyledin."
store.06.screen.sourcesKicker        = "KAYNAKLAR"
store.06.screen.source1.label        = "Re: Teklif · Gmail"
store.06.screen.source1.date         = "1 Eyl"
store.06.screen.source2.label        = "Görüşme notları"
store.06.screen.source2.date         = "1 Eyl"

ad.01.noise1                         = "284 okunmamış mail"
ad.01.noise2                         = "6 takvim etkinliği"
ad.01.noise3                         = "14 görev"
ad.01.card.kicker                    = "BRİFİNG HAZIR"
ad.01.card.headline                  = "Bugün gerçekten bilmen gereken 4 şey var."
ad.01.logo.name                      = "Dijital Asistan"
ad.01.logo.tagline                   = "Gürültüyü değil, önemli olanı gör."

ad.02.headline                       = "Bir maili cevaplamayı unuttuğun oldu mu?"
ad.02.card.initials                  = "MY"
ad.02.card.name                      = "Mehmet Yılmaz"
ad.02.card.meta                      = "Teklif · 3 gün önce gönderildi"
ad.02.card.chip                      = "3 gün"
ad.02.card.status                    = "Henüz yanıt gelmedi."
ad.02.card.cta.primary               = "Takip Mesajı Hazırla"
ad.02.card.cta.secondary             = "Yarın Hatırlat"
ad.02.body                           = "Gönderdiğin ve cevap gelmeyen her maili takip eder. Sen unutsan da o unutmaz."
ad.02.logo.name                      = "Dijital Asistan"
ad.02.logo.tagline                   = "Akıllı Takip · 7 gün ücretsiz"

ad.03.quote                          = "“Ben artık sabah Gmail açmıyorum.”"
ad.03.attribution                    = "Yunus E. · Kurucu, İstanbul"
ad.03.card.kicker                    = "SABAH BRİFİNGİ · 08:00"
ad.03.card.greeting                  = "Günaydın Yunus"
ad.03.card.body                      = "Öğlene kadar toplantın bulunmuyor. Saat 14:30'da Mehmet ile müşteri toplantın var. Gelen 46 mail arasında 3 konu dikkat gerektiriyor."
ad.03.card.cta                       = "Brifingi Dinle · 2 dk"
ad.03.logo.name                      = "Dijital Asistan"
ad.03.logo.tagline                   = "Bugün bilmen gerekenleri, sen sormadan söyler."
```

---

## 10. Copy consistency notes (flag, do not "fix" silently)

- Brief item counts differ by asset on purpose (different example moments): `store/01` "5 şey", `ad/01` "4 şey", `store/02` "83 mail / 4", `ad/03` "46 mail / 3 konu". Keep each verbatim.
- "Günaydın, Yunus" (`store/01`, with comma) vs "Günaydın Yunus" (`ad/03`, no comma). Product UI elsewhere uses the comma form; confirm with design before exporting `ad/03`.
- `store/04` subtitle says 4 people but only 2 rows are visible — intentional crop, do not add rows above the fold.
- Status-bar times: `9:41` everywhere except `store/03` (`14:12`, to make "18 dk" before 14:30 believable).
- All person names are fictional; the `ad/03` testimonial must not be presented as a real customer quote on public channels unless replaced by a consented one.

---

## 11. Export checklist

1. Render at true size: store 1290 × 2796 PNG (sRGB, no alpha), ads 1080 × 1920 PNG + a 9:16 MP4/Lottie for `ad/01` and `ad/03` if the video versions are produced.
2. Google Play: re-frame the six store compositions to 1080 × 1920 per §1 (scale 0.837, bottom crop).
3. Fonts must be embedded/self-hosted at render time (Geist, Lora, Material Symbols Rounded with `FILL` axis) — the App Store pipeline cannot rely on Google Fonts at capture time.
4. Verify the device inner screen is rendered from real components at 390 pt and scaled 2.513× (no re-typed text).
5. File names: `store-01-today`, `store-02-mail-intelligence`, `store-03-meeting-prep`, `store-04-follow-ups`, `store-05-planning`, `store-06-assistant`, `ad-01-noise-to-4`, `ad-02-smart-follow-up`, `ad-03-morning-brief`.
