# 02 · Onboarding, Bağlantılar, İlk Analiz — Implementation Spec

Source of truth: Claude Design canvas `02 Onboarding.dc.html` (15 artboards, 390×844 iOS frames + 1 Android frame). This document transcribes every artboard, every visible Turkish string, every interactive element and the trailing `x-dc` data arrays. Engineers should not need the raw HTML.

Conventions used below:
- Token names follow the project palette (`brand/primary`, `ink/secondary`, …). Where the prototype uses a colour that has **no token**, it is written as `raw #HEX` with a proposed token name so it can be added to the theme.
- Sizes are in dp/pt exactly as drawn on the 390-wide frame.
- Strings in `code` are verbatim copy and become i18n keys. Dynamic parts are marked `{n}`.
- "Design note" = the author's caption under the artboard (transcribed verbatim, in Turkish).
- "Dead in prototype" = drawn as a static element with no behaviour; engineers must wire real behaviour.

---

## 0. Flow overview and navigation map

Page title on the canvas: `02 · Onboarding, Bağlantılar, İlk Analiz`

Author's flow statement (verbatim):

> Akış: 4 tanıtım → hesap → bağlantılar (her OAuth öncesi izin açıklayıcı) → kişiselleştirme → brifing saatleri → ilk analiz (dramatik an) → bildirim izni → (Android) telefon bildirimleri → Bugün. Tanıtım görselleri çizim değil, ürünün kendi UI parçalarıdır.

Resulting navigation graph (all screens live in a single **Onboarding stack**, presented full-screen before the tab bar exists; the tab bar `Bugün / Akış / Plan / Asistan` is never visible during onboarding):

```
OnboardingStack (no tab bar, gesture-back disabled on 2.1, 2.10, 2.11)
 ├─ 2.1  Intro/Brand            (pager page 1 of 4)
 ├─ 2.2  Intro/ReduceNoise      (pager page 2 of 4)
 ├─ 2.3  Intro/Briefing         (pager page 3 of 4)
 ├─ 2.4  Intro/InControl        (pager page 4 of 4)
 ├─ 2.5  Auth/CreateAccount     (push)
 │        └─ Email sign-in flow (not designed in this file)
 ├─ 2.6  Connect/Integrations   "ADIM 1 / 4" (push)
 │        ├─ 2.7  Sheet: PermissionExplainer(gmail)      → native Google OAuth
 │        ├─ 2.7b Sheet: PermissionExplainer(outlook)    → native Microsoft OAuth
 │        └─ 2.7c Sheet: PermissionExplainer(calendar)   → Google/Microsoft OAuth or Apple EventKit prompt
 ├─ 2.8  Personalize/Interests  "ADIM 2 / 4" (push)
 ├─ 2.9  Personalize/BriefingSchedule "ADIM 3 / 4" (push)
 ├─ 2.10 FirstAnalysis/Processing   (push, non-dismissable; implied step 4)
 ├─ 2.11 FirstAnalysis/Ready        (replace 2.10)
 ├─ 2.12 Permission/Notifications   (push)
 ├─ 2.13 Permission/AndroidNotificationListener (push, Android only)
 └─ → Main tabs, landing on "Bugün" (first briefing)
```

Open question for product: `ADIM 4 / 4` is never labelled in the prototype. Steps 1–3 are Connections, Interests, Briefing schedule. The flow statement implies the first analysis (2.10 → 2.11) is the fourth step; the notification screens (2.12, 2.13) carry no step kicker. Engineers should treat the step counter as `1..3` labelled + analysis as the unlabelled finale, unless design confirms otherwise.

Entry conditions:
- 2.1 is shown on first launch (no session). `Giriş yap` on 2.1 jumps straight to 2.5 in sign-in mode (see 2.5).
- Returning users with an existing session skip the whole stack.
- Users who abort after 2.5 (account exists but no connections) should resume at 2.6 on next launch (inferred; not in prototype).

---

## 1. Shared chrome and components (used by every artboard)

### 1.1 Device frame (design only — not app UI)
- iOS artboards: 390×844, corner radius 44. Status bar area height 54, content aligned to bottom with 8 bottom padding: left `9:41` (15/600), right icons `signal_cellular_alt`, `wifi`, `battery_full` (Material Symbols Rounded, 17). Home indicator 134×5, radius 3, 8 from bottom; colour `rgba(255,255,255,.4)` on dark screens, `rgba(27,25,23,.25)` on light screens.
- Android artboard (2.13 only): radius 32; status bar height 46, vertically centred, 14/600, icon order `wifi`, `signal_cellular_alt`, `battery_full`; gesture bar 108×4 radius 2 `rgba(27,25,23,.3)`; bottom padding 28 instead of 44.
- In the app: use the real safe-area insets. The 44 bottom padding in light screens = safe-area bottom + ~10.

### 1.2 Screen padding
- Intro pages, auth, analysis, notification explainer (2.1–2.5, 2.10–2.12): horizontal padding **28**.
- Step screens with lists/grids (2.6, 2.8, 2.9, 2.13): horizontal padding **20**.
- Bottom padding 44 (iOS) / 28 (Android) below the last CTA.

### 1.3 Buttons

| Name | Height | Radius | Type | Colours |
|---|---|---|---|---|
| `button/primary-brand` | 52 | 16 | 15/600 | bg `brand/primary`, text `#FFFFFF`. Pressed: `brand/primary-pressed` |
| `button/primary-ink` | 52 | 16 | 15/600 | bg `ink`, text `#FFFFFF` |
| `button/primary-on-gradient` | 52 | 16 | 15/600 | bg `neutral/surface` (#FFF), text `raw #25266A` (proposed token `brand/deep`) |
| `button/provider` (auth) | 52 | 16 | 15/600 | bg `neutral/surface`, shadow `0 1px 2px rgba(27,25,23,.08)`, leading logo 20–22, gap 10 |
| `button/text-secondary` | 44 | 14 | 14/600 | transparent, text `ink/secondary` (`Şimdi değil`, `Daha sonra`) |
| `button/skip` (top-right) | inline | — | 14/600 | text `ink/secondary`, label `Atla`, margin-top 10 |
| `button/back` | 36×36 circle | 18 | icon `arrow_back` 20 | bg `neutral/surface`, shadow `0 1px 2px rgba(27,25,23,.08)`, icon `ink` |
| `pill/connect` (2.6) | 34 | 999 | 13/600 + icon 16, padding 0 12 | off: `brand/soft` / `brand/text-on-soft` icon `add`; on: `success/soft` / `success/text` icon `check` |
| `chip/provider` (2.7c) | 30 | 999 | 12/600, padding 0 10 | selected: bg `ink`, text `#FFF`, leading `check` 14; unselected: bg `neutral/bg`, text `ink/secondary` |
| `chip/time` (2.9) | 36 | 12 | 17/600 (h3), −1% tracking, padding 0 12 | bg `neutral/bg`, text `ink` |
| `toggle` | 50×30 track, 26 knob | 15 | — | on: track `brand/primary`, knob right (left 22); off: track `raw #D9D6D0` (proposed `neutral/toggle-off`), knob left 2; knob `#FFF` shadow `0 1px 3px rgba(0,0,0,.2)` |

### 1.4 Step header (2.6, 2.8, 2.9, 2.13)
Row, margin-top 10, `space-between`: `button/back` · kicker (12/600, +8% tracking, `ink/tertiary`, e.g. `ADIM 1 / 4`) · 36-wide spacer (or `Atla` on 2.13). Title block margin-top 22: title 30/36 600 −2.5% tracking `ink` (see §1.6 on size), subtitle 15/22 `ink/secondary` margin-top 6.

### 1.5 Page dots (intro pager)
4 dots, gap 6, centred, margin-bottom 22 above CTA. Inactive 6×6 radius 3; active 20×6 radius 3. Light pages: active `ink`, inactive `raw #C9C5BC` (proposed `neutral/dot-inactive`). Dark page (2.1): active `#FFF`, inactive `rgba(255,255,255,.4)`.

### 1.6 Typography as used on this canvas (map to type scale)

| Prototype | Token to use | Note |
|---|---|---|
| 34/40 600 −2.5% | `display` | 2.1 headline |
| 32/38 600 −2.5% | `display` (compact) | 2.2–2.4, 2.11 headlines. Prototype tightens display by 2pt; use `display` unless design adds `display-compact 32/38` |
| 30/36 600 −2.5% | `h1` | 2.5, 2.6, 2.8, 2.9, 2.12, 2.13 titles. Token h1 is 28/34; prototype draws 30/36. Recommend adding `h1-onboarding 30/36` or accept h1 |
| 26/32 600 −2% | `h1` | 2.10 title |
| 24/30 600 −2% | `h2` (scaled) | greeting inside briefing card thumbnail (2.3) |
| 20 600 −2% | `h2` | sheet titles (2.7*) |
| 17 600 | `h3` | time chips (2.9) |
| 16/24 | `body` (large) | intro subtitles; prototype uses 16/24 — one step above `body` 15/22 |
| 15/22 | `body` | subtitles, list titles (15/600 for row titles) |
| 14/20 | `secondary` | assurance rows, notification body (14/19) |
| 13/19 | `secondary` (small) | assurance line, mini list text |
| 12/16 600 +8% caps | `kicker` | `ADIM 1 / 4`, `GMAIL`, `TAKVİM`, `UYGULAMALAR`, `SADECE ANDROID`, `SABAH BRİFİNGİ · 08:00` (11px in thumbnail) |
| 12 / 12/18 | `caption` (ink/tertiary) | meta lines, footnotes |
| 11/14 700 +5% | `badge` | `BEKLİYOR` |
| 10 700 pill | `badge` (mini) | `ACİL`, `SON TARİH`, `TAKİP`, `TOPLANTI` — padding 2 6, radius 999 |
| Lora 15/24 | `editorial` (scaled) | briefing body inside 2.3 thumbnail; real briefing uses `editorial` 18/29 |
| 64/64 600 −4% | (numeric display) | `127` counter on 2.2 — no token; proposed `display-numeric` |
| 15 600 +10% caps, 75% opacity | wordmark | `DİJİTAL ASİSTAN`, `HAZIR.` |

### 1.7 Gradients used
- `gradient/dawn` = `linear-gradient(160deg, #1E1E4C 0%, #3B3CA8 58%, #7071EA 100%)`. Used on 2.1 background, 2.3 briefing card header, 2.11 background. Design note on 2.1: *"Şafak gradyanı = brifingin rengi; onboarding boyunca tek marka anı."*
- `gradient/night` (inferred name) = `linear-gradient(180deg, #15153A 0%, #25266A 60%, #3B3CA8 100%)`. Used only on 2.10 (processing).

### 1.8 Shadows
- `shadow/card` = `0 1px 2px rgba(27,25,23,.04), 0 6px 20px rgba(27,25,23,.05)` (list rows, integration cards, interest tiles unselected, app list group).
- `shadow/card-strong` = `0 1px 2px rgba(27,25,23,.04), 0 6px 20px rgba(27,25,23,.06)` (2.2 priority rows).
- `shadow/float` = `0 20px 50px rgba(27,25,23,.14)` (tilted hero cards on 2.3, 2.4).
- `shadow/float-dark` = `0 20px 50px rgba(0,0,0,.25)` (white icon tile on gradient, 2.1, 2.11).
- `shadow/sheet` = `0 -10px 40px rgba(27,25,23,.12)`.
- `shadow/notification` = `0 8px 24px rgba(27,25,23,.08)`.
- `shadow/hairline` = `0 1px 2px rgba(27,25,23,.08)` (back button, provider buttons).

### 1.9 Bottom sheet pattern (`sheet/permission-explainer`, 2.7 / 2.7b / 2.7c)
- Scrim over the underlying screen: `rgba(27,25,23,.35)`.
- Sheet: bg `neutral/surface`, top radius 28, padding `10 24 44` (44 = safe-area bottom), `shadow/sheet`.
- Grabber 36×5 radius 3 `raw #E0DED7` (proposed `neutral/grabber`), centred, 18 below it.
- Header row gap 12: provider tile 44×44 radius 14 (tinted soft bg + text colour, icon 22) · text column: kicker (12/600 +8% `ink/tertiary`) over title (20/600 −2% `ink`).
- Reason rows: padding `12 14` (2.7c: `11 14`), radius 14, bg `neutral/bg`, gap 12, icon 20 `brand/primary`, text 15 `ink`.
- Assurance box: padding 16, radius 18, bg `success/soft`, rows gap 10, icon 20 `success/text`, text 14/20 `raw #1E5A36` (proposed `success/text-strong`; darker than `success/text`). First row is **bold**.
- Actions: `button/primary-brand` then `button/text-secondary` (`Şimdi değil`), gap 8, margin-top 18 (2.7c: 14).
- Footnote: margin-top 8, centred, 12 `ink/tertiary`.
- Dismiss: swipe-down / scrim tap / `Şimdi değil` all return to 2.6 without changing state.

---

## 2. Screens

### 2.1 Tanıtım 1 · Marka

**Purpose.** Brand moment and first-launch entry. Page 1 of the 4-page intro pager. Only dark/gradient page of the intro.

**Navigation.** OnboardingStack root; horizontal pager (swipe or `Başlayalım`). No back.

**Layout (top → bottom).**
1. Background `gradient/dawn`. All text `#FFFFFF`. Padding `0 28 44`.
2. Status bar (light content).
3. Flex-1 centred column, gap 28, text centred:
   - App icon tile 96×96, radius 30, bg `#FFFFFF`, `shadow/float-dark`; icon `auto_awesome` 52, `brand/primary`, FILL 1.
   - Wordmark `DİJİTAL ASİSTAN` — 15/600, +10% tracking, opacity .75.
   - Headline (margin-top 14) `Bugün bilmen gerekenleri, sen sormadan söyler.` — `display` 34/40 600 −2.5%, `text-wrap: pretty`.
   - Subtitle `Mailini, takvimini ve yapman gerekenleri tek yerde anlar.` — 16/24, `rgba(255,255,255,.75)`, max-width 300.
4. Page dots: page 1 active (white), 3 inactive `rgba(255,255,255,.4)`; margin-bottom 22.
5. CTA `button/primary-on-gradient`: `Başlayalım`.
6. Link line (margin-top 14, centred, 13, `rgba(255,255,255,.7)`): `Zaten hesabın var mı?` + bold white `Giriş yap`.
7. Home indicator (white 40%).

**Copy (verbatim).**
- `DİJİTAL ASİSTAN`
- `Bugün bilmen gerekenleri, sen sormadan söyler.`
- `Mailini, takvimini ve yapman gerekenleri tek yerde anlar.`
- `Başlayalım`
- `Zaten hesabın var mı?`
- `Giriş yap`

**Interactions.**
- `Başlayalım` → pager next (2.2).
- Swipe left → 2.2.
- `Giriş yap` → 2.5 in **sign-in** mode (same provider buttons; title should read as sign-in — copy not provided in prototype, reuse `Hesabını oluştur` layout with a sign-in title to be supplied by design).
- Dead in prototype: `Başlayalım`, `Giriş yap`.

**States.** None beyond static. Status bar style: light. Dark mode: identical (already dark).

**Motion.** None specified. Suggested: icon tile fades/scales in on first mount.

**Design note.** `Şafak gradyanı = brifingin rengi; onboarding boyunca tek marka anı. Sonraki ekranlar açık zemine döner.`

---

### 2.2 Tanıtım 2 · Gürültüyü azalt

**Purpose.** Value prop #1: 127 mails collapse into 3 priorities. Built from real product components (skeleton rows + `card/priority` mini rows), not illustration.

**Navigation.** Pager page 2 of 4. `Atla` skips the pager.

**Layout.**
1. Background `neutral/bg`. Padding `0 28 44`.
2. Status bar (dark content).
3. `Atla` right-aligned (14/600 `ink/secondary`, margin-top 10).
4. Flex-1 centred column, gap 34:
   - **Illustration block** (relative, height 300):
     - Skeleton stack: absolute `left:24 right:24 top:0`, column gap 6, opacity .55. Four rows each height 34, radius 10, bg `neutral/surface`, shadow `0 1px 2px rgba(27,25,23,.06)`, padding `0 12`, gap 8: 16×16 circle `neutral/hairline` + bar height 8 radius 4 `neutral/hairline` widths 120, 160, 90, 140.
     - Counter: absolute `top:20`, centred: `127` (64/64 600 −4% `ink`) with `mail` (14 `ink/secondary`, margin-top 2) below.
     - Arrow bubble: 28×28 circle `brand/primary`, absolute `top:116` centred; icon `arrow_downward` 18 `#FFF`.
     - Priority rows: absolute `top:160`, column gap 8. Each row height 40, radius 12, bg `neutral/surface`, `shadow/card-strong`, padding `0 14`, gap 10: mini badge (10/700, padding 2 6, radius 999) + label 13/600 `ink`.
       1. Badge `ACİL` (`critical/soft` / `critical/text`) — `Ahmet revize teklif bekliyor`
       2. Badge `SON TARİH` (`warning/soft` / `warning/text`) — `Başvuru bugün 17:00`
       3. Badge `TAKİP` (`neutral/surface-2` / `ink/secondary`) — `Teklife 3 gündür cevap yok`
   - **Text block** (centred): eyebrow `127 mail → 3 önemli konu` (15/600 `brand/primary`); headline `Gürültüyü azalt.` (32/38 600 −2.5%, margin-top 8); subtitle `Gelen her şeyi okur, yalnızca önemli olanı gösterir.` (16/24 `ink/secondary`, margin-top 8).
5. Page dots: page 2 active (`ink`), others `raw #C9C5BC`.
6. CTA `button/primary-ink`: `Devam`.
7. Home indicator.

**Copy (verbatim).** `Atla` · `127` · `mail` · `ACİL` · `Ahmet revize teklif bekliyor` · `SON TARİH` · `Başvuru bugün 17:00` · `TAKİP` · `Teklife 3 gündür cevap yok` · `127 mail → 3 önemli konu` · `Gürültüyü azalt.` · `Gelen her şeyi okur, yalnızca önemli olanı gösterir.` · `Devam`

**Interactions.**
- `Devam` → 2.3. Swipe → 2.3 / back to 2.1.
- `Atla` → 2.5 (Hesap Oluştur).
- Dead in prototype: `Atla`, `Devam`.

**Motion (from design note).** `Gerçek kart bileşenleriyle anlatım: soluk iskelet yığın → sayı → üç gerçek öncelik kartı. Animasyon: yığın aşağı akıp 3 karta "çöker".` — On page enter: skeleton rows appear, counter counts up to 127, arrow appears, then the stack "flows down" and collapses into the three priority cards (staggered spring, ~600–900 ms total). Respect reduce-motion: show final state.

**States.** Static content; example data is hard-coded (not user data). Dark mode: bg `dark/bg`, skeleton rows `dark/surface`, bars `dark/surface-2`, priority rows `dark/surface`, badge soft colours keep light tints per token guidance, text `dark/text`.

---

### 2.3 Tanıtım 3 · Brifing

**Purpose.** Value prop #2: the morning briefing, shown as a tilted real `card/briefing` (hero card) with an audio CTA.

**Navigation.** Pager page 3 of 4.

**Layout.**
1. `neutral/bg`, padding `0 28 44`, status bar, `Atla`.
2. Flex-1 centred, gap 34:
   - **Briefing hero card** — container radius 28, overflow hidden, `shadow/float`, `transform: rotate(-2deg)`.
     - Header: bg `gradient/dawn`, colour `#FFF`, padding `22 20 34`.
       - Kicker `SABAH BRİFİNGİ · 08:00` — 11/600 +8%, opacity .72.
       - Greeting `Günaydın Yunus` — 24/30 600 −2%, margin-top 6.
       - Summary `Bugün oldukça sakin bir günün var.` — 14, `rgba(255,255,255,.8)`, margin-top 4.
     - Body: margin-top −18 (overlaps header), bg `neutral/bg`, radius `22 22 0 0`, padding `18 20 20`.
       - Editorial paragraph (Lora 15/24 `ink`): `Öğlene kadar toplantın bulunmuyor. Saat 14:30'da Mehmet ile müşteri toplantın var…`
       - Listen button: margin-top 12, height 40, radius 12, bg `ink`, text `#FFF` 13/600, centred, icon `headphones` 18, gap 8: `Brifingi Dinle · 2 dk`.
   - **Text block**: eyebrow `Her sabah 08:00` (15/600 `brand/primary`); headline `Gününü sen sormadan hazırlarız.` (32/38, `text-wrap: pretty`); subtitle `Okumak istemezsen 2 dakikada dinle.` (16/24 `ink/secondary`).
3. Dots page 3 active. CTA `button/primary-ink` `Devam`. Home indicator.

**Copy (verbatim).** `Atla` · `SABAH BRİFİNGİ · 08:00` · `Günaydın Yunus` · `Bugün oldukça sakin bir günün var.` · `Öğlene kadar toplantın bulunmuyor. Saat 14:30'da Mehmet ile müşteri toplantın var…` · `Brifingi Dinle · 2 dk` · `Her sabah 08:00` · `Gününü sen sormadan hazırlarız.` · `Okumak istemezsen 2 dakikada dinle.` · `Devam`

**Interactions.**
- `Devam` / swipe → 2.4. `Atla` → 2.5.
- The briefing card and its `Brifingi Dinle` button are **non-interactive decoration** here (do not wire audio in onboarding).
- Dead in prototype: `Atla`, `Devam`, `Brifingi Dinle · 2 dk` (decorative).

**Motion.** Card enters with its −2° tilt (suggested: slide-up + settle). Design note: `Brifing kartı hafif eğik durur; ürünün gerçek bileşeni, çizim değil.`

**Data fields the real `card/briefing` needs (informs domain model).** `briefingType` (morning/noon/evening), `scheduledTime`, `greeting` (uses `user.firstName`), `summaryLine`, `editorialBody`, `audioDurationSec`, `hasAudio`.

---

### 2.4 Tanıtım 4 · Kontrol sende

**Purpose.** Trust message: nothing is sent or changed without approval. Shows a real Onay Merkezi approval card (`card/approval`, a sibling of `card/ai-insight`).

**Navigation.** Pager page 4 of 4. CTA switches to brand colour and leads to account creation.

**Layout.**
1. `neutral/bg`, padding `0 28 44`, status bar, `Atla`.
2. Flex-1 centred, gap 34:
   - **Approval card** — bg `neutral/surface`, radius 20, padding 16, `shadow/float`, `transform: rotate(1.5deg)`.
     - Header row gap 8: action tile 28×28 radius 9 bg `brand/soft`, icon `send` 17 `brand/text-on-soft` · action label `MAİL GÖNDER` (12/600 +6% `ink/secondary`, flex 1) · badge `BEKLİYOR` (11/700, padding 3 8, radius 999, `warning/soft` / `warning/text`).
     - Title (margin-top 10, 16/22 600 −1%): `Mehmet Yılmaz'a takip mesajı gönder`
     - Detail grid (margin-top 8, columns `56px 1fr`, gap `4 10`, 12/18): label `Neden` (`ink/tertiary`) → `Teklife 3 gündür yanıt gelmedi.`; label `Değişim` → `1 mail · Kısa, profesyonel ton`
     - Action row (margin-top 12, gap 8, 13/600): `Onayla` (flex 1, h38, r12, `brand/primary` / `#FFF`) · `Düzenle` (h38, padding 0 12, r12, `brand/soft` / `brand/text-on-soft`) · `Reddet` (h38, padding 0 12, r12, `neutral/surface-2` / `ink/secondary`).
   - **Text block**: eyebrow `Onay Merkezi` (`brand/primary`); headline `Kontrol her zaman sende.`; subtitle `Sen onaylamadan mail göndermez, takvimine dokunmaz.` (`text-wrap: pretty`).
3. Dots page 4 active. CTA `button/primary-brand`: `Hesap Oluştur`. Home indicator.

**Copy (verbatim).** `Atla` · `MAİL GÖNDER` · `BEKLİYOR` · `Mehmet Yılmaz'a takip mesajı gönder` · `Neden` · `Teklife 3 gündür yanıt gelmedi.` · `Değişim` · `1 mail · Kısa, profesyonel ton` · `Onayla` · `Düzenle` · `Reddet` · `Onay Merkezi` · `Kontrol her zaman sende.` · `Sen onaylamadan mail göndermez, takvimine dokunmaz.` · `Hesap Oluştur`

**Interactions.**
- `Hesap Oluştur` → push 2.5. `Atla` → 2.5 (same destination on the last page; keep for consistency or hide).
- Approval card buttons are decorative in onboarding.
- Dead in prototype: `Atla`, `Hesap Oluştur`, `Onayla`, `Düzenle`, `Reddet` (decorative).

**Design note.** `Son tanıtım güven mesajıyla biter; CTA marka rengine döner ve hesap oluşturmaya geçer.`

**Data fields for the real `card/approval`.** `actionType` (send_mail / calendar_change / …), `status` (pending/approved/rejected), `title`, `reason`, `changeSummary`, `targetPerson`, `draftId`.

---

### 2.5 Hesap Oluştur

**Purpose.** Create the app account (identity). Explicitly decoupled from the accounts that will be connected later.

**Navigation.** Push from 2.4 (or from 2.1 `Giriş yap` in sign-in mode). Back returns to the pager.

**Layout.**
1. `neutral/bg`, padding `0 28 44`, status bar.
2. `button/back` (margin-top 10, left).
3. Flex-1 centred column, gap 28:
   - Brand tile 56×56, radius 18, bg `brand/primary`, icon `auto_awesome` 30 `#FFF` FILL 1.
   - Title (margin-top 22, 30/36 600 −2.5%): `Hesabını oluştur`
   - Subtitle (margin-top 6, 15/22 `ink/secondary`): `Giriş yöntemin, bağlayacağın hesaplardan bağımsızdır.`
   - Provider buttons column, gap 10, all h52 r16, 15/600, content centred with gap 10:
     1. `Google ile devam et` — `button/primary-ink` style (bg `ink`, text `#FFF`); leading 22×22 white circle with `G` (13/700 `ink`) — placeholder for the real Google logo.
     2. `Apple ile devam et` — `button/provider` (white, hairline shadow), leading icon `ios` 20 — placeholder for the Apple logo.
     3. `Microsoft ile devam et` — `button/provider`, leading 16×16 four-square logo (`#F25022`, `#7FBA00`, `#00A4EF`, `#FFB900`) — placeholder.
     4. Divider row: 1px lines `rgba(27,25,23,.1)` either side of `veya` (12 `ink/tertiary`), margin `6 0`.
     5. `E-posta ile devam et` — `button/provider`, text colour `brand/text-on-soft`, leading icon `mail` 20.
4. Legal footer (bottom, centred, 12/18 `ink/tertiary`, `text-wrap: pretty`): `Devam ederek ` **`Kullanım Koşulları`** ` ve ` **`Gizlilik Politikası`**`'nı kabul edersin. Verilerin reklam amacıyla kullanılmaz.` — bold spans are `ink/secondary` and tappable.
5. Home indicator.

**Copy (verbatim).** `Hesabını oluştur` · `Giriş yöntemin, bağlayacağın hesaplardan bağımsızdır.` · `Google ile devam et` · `Apple ile devam et` · `Microsoft ile devam et` · `veya` · `E-posta ile devam et` · `Devam ederek Kullanım Koşulları ve Gizlilik Politikası'nı kabul edersin. Verilerin reklam amacıyla kullanılmaz.` · `Kullanım Koşulları` · `Gizlilik Politikası`

**Interactions.**
- Back → 2.4.
- Google / Apple / Microsoft → native sign-in SDK (Sign in with Apple, Google Sign-In, MSAL). On success → 2.6. On cancel → stay. On error → inline error (not designed; see States).
- `E-posta ile devam et` → e-mail flow (magic link / OTP). **Not designed in this file**; must be specified separately.
- `Kullanım Koşulları`, `Gizlilik Politikası` → in-app browser / legal screens (see 07 Hesap canvas).
- Dead in prototype: all five buttons, both legal links, back button.

**Platform rule (design note).** `Platform sırası cihaza göre: iOS'ta Apple ilk, Android'de Google ilk. Sağlayıcı logoları için gerçek marka varlıkları kullanılacak (burada yer tutucu).` → On iOS order is Apple, Google, Microsoft; on Android Google, Apple, Microsoft. The **first** button takes the `ink` filled style; the rest are white `button/provider`. Use official brand assets.

**States (not drawn — engineers implement).**
- Loading: disable buttons and show a spinner in the pressed button while SDK is open.
- Error: inline `secondary` text in `critical/text` above the legal footer (copy TBD).
- Offline: disable providers, show offline banner (see 08 Durumlar canvas).
- Sign-in mode (from 2.1 `Giriş yap`): identical layout; title copy to be supplied.
- Dark: bg `dark/bg`; white provider buttons become `dark/surface`; `ink` button becomes `dark/text` bg with `dark/bg` text; legal text `dark/tertiary`.

---

### 2.6 Dijital hayatını bağla · ADIM 1 / 4

**Purpose.** Connect mail and calendar providers. Requirement: at least one mail + one calendar.

**Navigation.** Push after auth. Step header `ADIM 1 / 4`. Tapping `Bağla` opens the matching permission-explainer sheet (2.7 / 2.7b / 2.7c) **before** any OAuth.

**Layout.**
1. `neutral/bg`, padding `0 20 44`, status bar (status bar padding `0 10 8` because of the narrower screen padding).
2. Step header: back · `ADIM 1 / 4` · spacer.
3. Title `Dijital hayatını bağla.` (30/36). Subtitle `En az bir mail ve bir takvim yeterli. İstediğin zaman kaldırabilirsin.`
4. Integration list (margin-top 22, gap 10) — component `card/integration`:
   - Row: padding `12 14`, radius 18, bg `neutral/surface`, `shadow/card`, gap 12.
   - Provider tile 44×44 radius 14, bg `tbg`, icon colour `tfg`, icon 22 (to be replaced with real provider logos).
   - Text: name 15/600 −1% `ink`; meta 12 `ink/tertiary`; `min-width: 0` (truncate).
   - Trailing `pill/connect`: off = `add` + `Bağla` (`brand/soft` / `brand/text-on-soft`); on = `check` + `Bağlandı` (`success/soft` / `success/text`).
5. Bottom block (margin-top auto, gap 10):
   - Assurance line (13 `ink/secondary`, icon `verified_user` 18 `success/text`, padding 0 4): `Sen onaylamadan mail göndermeyiz.`
   - CTA `button/primary-brand`: `Devam · 2 hesap bağlı` → dynamic `Devam · {n} hesap bağlı`.
6. Home indicator.

**Data rows (from `INTEGRATIONS`, verbatim).**

| # | icon | name | meta | tile bg (`tbg`) | tile fg (`tfg`) | on |
|---|---|---|---|---|---|---|
| 1 | `mail` | `Gmail` | `yunus@…com · 3 gün analiz edildi` | `critical/soft` (#FCEDE9) | `critical/text` (#C7432F) | true |
| 2 | `mail` | `Outlook` | `İş maili · Microsoft 365` | `info/soft` (#E7F0FD) | `info/text` (#2262BE) | false |
| 3 | `calendar_month` | `Google Takvim` | `2 takvim · Kişisel, İş` | `success/soft` (#E4F5EA) | `success/text` (#1E7A47) | true |
| 4 | `calendar_month` | `Microsoft Takvim` | `Outlook takvimi` | `info/soft` | `info/text` | false |
| 5 | `calendar_month` | `Apple Takvim` | `iCloud · cihazdan okunur` | `neutral/surface-2` (#F0EFEB) | `ink/secondary` (#6B6860) | false |

Derived button state (from `renderVals`): `on ? {bbg:'#E4F5EA', bfg:'#1E7A47', bicon:'check', btn:'Bağlandı'} : {bbg:'#EDEDFC', bfg:'#4547C9', bicon:'add', btn:'Bağla'}`.

Meta line is **state-dependent**: before connection it describes the provider (`İş maili · Microsoft 365`), after connection it shows the account + analysis window (`yunus@…com · 3 gün analiz edildi`, `2 takvim · Kişisel, İş`). Model: `meta = connected ? accountSummary : providerDescription`.

**Copy (verbatim).** `ADIM 1 / 4` · `Dijital hayatını bağla.` · `En az bir mail ve bir takvim yeterli. İstediğin zaman kaldırabilirsin.` · `Bağla` · `Bağlandı` · `Sen onaylamadan mail göndermeyiz.` · `Devam · 2 hesap bağlı` (+ the five rows above)

**Interactions.**
- Back → 2.5 (should sign out? No — keep session; back simply returns).
- `Bağla` on Gmail → sheet 2.7 → Google OAuth → on success row flips to `Bağlandı`, meta updates, CTA count increments, light haptic.
- `Bağla` on Outlook → sheet 2.7b → Microsoft OAuth.
- `Bağla` on Google Takvim / Microsoft Takvim / Apple Takvim → sheet 2.7c with the corresponding provider chip pre-selected. Apple Takvim uses EventKit permission instead of OAuth.
- `Bağlandı` pill tap → (inferred) opens a disconnect confirmation; the prototype does not define it. Minimum: no-op with tooltip; recommended: action sheet `Bağlantıyı kaldır`.
- `Devam · {n} hesap bağlı` → 2.8. Enabled only when ≥1 mail and ≥1 calendar are connected (per subtitle). If the requirement is unmet, keep the button visible but disabled (`ink/disabled` text on `neutral/surface-2`) — inferred.
- Dead in prototype: back, all 5 pills, `Devam · 2 hesap bağlı`.

**States.**
- Connecting (during OAuth round-trip): pill shows spinner in place of icon, label `Bağlanıyor…` (copy inferred).
- Error (OAuth denied/failed): pill returns to `Bağla`; show toast (copy TBD, use `critical`).
- Offline: pills disabled.
- Empty: n/a (list is static catalogue).
- Dark: rows `dark/surface`, tiles keep soft tints, `Bağla` pill `brand/soft` may switch to `dark/surface-2` with `dark/primary` text.

**Design note.** `Durumlar: Bağla (indigo tonal) / Bağlandı (yeşil, ✓). Devam butonu bağlı hesap sayısını söyler. Kart ikonları gerçek sağlayıcı logolarıyla değiştirilecek.`

---

### 2.7 İzin Açıklayıcı · Gmail (OAuth öncesi)

**Purpose.** Pre-permission explainer shown as a bottom sheet over 2.6 immediately before the native Google OAuth consent screen. "3 reasons + 3 assurances".

**Navigation.** Modal bottom sheet (`sheet/permission-explainer`, variant `gmail`) over 2.6.

**Layout (see §1.9 for shared geometry).**
1. Scrim, sheet, grabber.
2. Header: tile `critical/soft` bg, icon `mail` 22 `critical/text` · kicker `GMAIL` · title `Mail erişimine neden ihtiyacımız var?`
3. Reasons (margin-top 18, gap 10):
   - `priority_high` — `Önemli mailleri bulmak`
   - `person` — `Cevap bekleyenleri anlamak`
   - `flag` — `Son tarihleri tespit etmek`
4. Assurance box (margin-top 18):
   - `verified_user` — **`Sen onaylamadan mail göndermeyiz.`**
   - `link_off` — `Bağlantını istediğin zaman kaldırabilirsin.`
   - `block` — `Verilerin reklam amacıyla kullanılmaz, satılmaz.`
5. Actions (margin-top 18, gap 8): `button/primary-brand` `Google ile Bağlan` · `button/text-secondary` `Şimdi değil`.
6. Footnote: `Sonraki adımda Google'ın kendi izin ekranı açılır.`
7. Home indicator (inside sheet).

**Copy (verbatim).** `GMAIL` · `Mail erişimine neden ihtiyacımız var?` · `Önemli mailleri bulmak` · `Cevap bekleyenleri anlamak` · `Son tarihleri tespit etmek` · `Sen onaylamadan mail göndermeyiz.` · `Bağlantını istediğin zaman kaldırabilirsin.` · `Verilerin reklam amacıyla kullanılmaz, satılmaz.` · `Google ile Bağlan` · `Şimdi değil` · `Sonraki adımda Google'ın kendi izin ekranı açılır.`

**Interactions.**
- `Google ile Bağlan` → dismiss sheet → launch Google OAuth (Gmail read scope; send scope only if product requires approve-to-send). Result flows back to 2.6.
- `Şimdi değil` / swipe-down / scrim tap → dismiss, no change.
- Dead in prototype: both buttons, grabber.

**States.** Loading: `Google ile Bağlan` shows spinner while the OAuth browser opens. Permission-denied (user cancels OAuth): return to 2.6 with row still `Bağla`; optional toast `Bağlantı kurulamadı` (copy TBD). Dark: sheet `dark/surface`, reason rows `dark/surface-2`, assurance box keeps `success/soft` tint or uses `success/text` on `dark/surface-2` (design decision pending).

**Design note.** `Yerel OAuth'tan hemen önce açılan sayfa: 3 neden + 3 güvence. Aynı kalıp Outlook ve takvimler için; yalnızca ikon ve nedenler değişir.`

---

### 2.7b İzin Açıklayıcı · Outlook / Microsoft 365

**Purpose.** Same pattern as 2.7 for Outlook; reasons are work-context; extra assurance row for corporate tenants.

**Navigation.** Bottom sheet over 2.6 (variant `outlook`).

**Layout differences from 2.7.**
- Header tile `info/soft` bg, icon `mail` 22 `info/text`. Kicker `OUTLOOK · MICROSOFT 365`. Title `Outlook erişimine neden ihtiyacımız var?`
- Reasons (3):
  - `work` — `İş maillerinde önemli konuları bulmak`
  - `forum` — `Cevap bekleyen konuşmaları anlamak`
  - `description` — `Teklif, sözleşme ve son tarihleri tespit etmek`
- Assurances (**4** rows):
  - `verified_user` — **`Sen onaylamadan mail göndermeyiz.`**
  - `admin_panel_settings` — `Kurumsal hesapta yalnızca sana verilen izinler kullanılır; şirket politikaların geçerli kalır.`
  - `link_off` — `Bağlantını istediğin zaman kaldırabilirsin.`
  - `block` — `Verilerin reklam amacıyla kullanılmaz, satılmaz.`
- Primary CTA has a leading 16×16 Microsoft four-square logo (gap 10): `Microsoft ile Bağlan`. Secondary `Şimdi değil`.
- Footnote: `Sonraki adımda Microsoft'un kendi izin ekranı açılır.`

**Copy (verbatim).** `OUTLOOK · MICROSOFT 365` · `Outlook erişimine neden ihtiyacımız var?` · `İş maillerinde önemli konuları bulmak` · `Cevap bekleyen konuşmaları anlamak` · `Teklif, sözleşme ve son tarihleri tespit etmek` · `Sen onaylamadan mail göndermeyiz.` · `Kurumsal hesapta yalnızca sana verilen izinler kullanılır; şirket politikaların geçerli kalır.` · `Bağlantını istediğin zaman kaldırabilirsin.` · `Verilerin reklam amacıyla kullanılmaz, satılmaz.` · `Microsoft ile Bağlan` · `Şimdi değil` · `Sonraki adımda Microsoft'un kendi izin ekranı açılır.`

**Interactions.** `Microsoft ile Bağlan` → MSAL OAuth (Mail.Read, Calendars.Read as needed) → back to 2.6. `Şimdi değil` → dismiss. Dead in prototype: both buttons.

**Design note.** `Gmail kalıbının aynısı; ikon karosu bilgi mavisi, nedenler iş bağlamına göre. Kurumsal hesaplar için ek güvence satırı (yönetici politikaları).`

---

### 2.7c İzin Açıklayıcı · Takvim

**Purpose.** One explainer for all three calendar providers; a provider chip row switches the CTA label and the OAuth target. Four reasons map 1:1 to the product's four calendar capabilities.

**Navigation.** Bottom sheet over 2.6 (variant `calendar`, param `provider: google | apple | microsoft`).

**Layout.**
1. Scrim, sheet, grabber.
2. Header: tile `success/soft` bg, icon `calendar_month` 22 `success/text` · kicker `TAKVİM` · title `Takvim erişimine neden ihtiyacımız var?`
3. Provider chip row (margin-top 12, gap 6, `chip/provider`): `Google Takvim` (selected, leading `check`) · `Apple Takvim` · `Microsoft Takvim`. Single-select.
4. Reasons (margin-top 14, gap 8, padding `11 14`):
   - `today` — `Günün programını anlamak`
   - `event_busy` — `Toplantı çakışmalarını tespit etmek`
   - `wb_twilight` — `Yaklaşan etkinlikleri brifinge eklemek`
   - `event_available` — `Uygun zaman önermek`
5. Assurance box (margin-top 14):
   - `verified_user` — **`Takviminde değişiklik yapmadan önce senden onay isteriz.`**
   - `link_off` — `Bağlantını istediğin zaman kaldırabilirsin.`
   - `block` — `Etkinlik içerikleri reklam amacıyla kullanılmaz.`
6. Actions (margin-top 14): `button/primary-brand` `Google Takvim'i Bağla` · `Şimdi değil`.
7. Footnote: `Apple Takvim cihazdan okunur; ayrı giriş gerekmez.`

**Copy (verbatim).** `TAKVİM` · `Takvim erişimine neden ihtiyacımız var?` · `Google Takvim` · `Apple Takvim` · `Microsoft Takvim` · `Günün programını anlamak` · `Toplantı çakışmalarını tespit etmek` · `Yaklaşan etkinlikleri brifinge eklemek` · `Uygun zaman önermek` · `Takviminde değişiklik yapmadan önce senden onay isteriz.` · `Bağlantını istediğin zaman kaldırabilirsin.` · `Etkinlik içerikleri reklam amacıyla kullanılmaz.` · `Google Takvim'i Bağla` · `Şimdi değil` · `Apple Takvim cihazdan okunur; ayrı giriş gerekmez.`

**Interactions.**
- Chip tap → selects provider; CTA label changes: `Google Takvim'i Bağla` / `Apple Takvim'i Bağla` / `Microsoft Takvim'i Bağla` (Apple/Microsoft labels inferred from the pattern; design note confirms "seçili sağlayıcı çipi CTA metnini değiştirir"). Footnote for Apple stays as drawn; for Google/Microsoft engineers may reuse the "Sonraki adımda …'ın kendi izin ekranı açılır." pattern.
- CTA → Google OAuth (Calendar scope) / MSAL / iOS `EKEventStore.requestFullAccessToEvents` (Android Apple Takvim: hide chip — Apple Calendar is device-only on iOS).
- `Şimdi değil` → dismiss.
- Dead in prototype: 3 chips, CTA, `Şimdi değil`.

**States.** Permission-denied (EventKit denied): show inline hint to open Settings (copy TBD). Otherwise as 2.7.

**Design note.** `Üç sağlayıcı için tek açıklayıcı; seçili sağlayıcı çipi CTA metnini değiştirir. Dört neden ürünün dört takvim yeteneğine birebir karşılık gelir.`

---

### 2.8 Kişiselleştirme · Çoklu seçim · ADIM 2 / 4

**Purpose.** Interest multi-select; selections control which `card/life` categories surface on Bugün.

**Navigation.** Push from 2.6. Step header `ADIM 2 / 4`.

**Layout.**
1. `neutral/bg`, padding `0 20 44`, status bar, step header (back · `ADIM 2 / 4` · spacer).
2. Title `Senin için neler önemli?` · Subtitle `Birden fazla seçebilirsin. Zamanla kendim de öğrenirim.`
3. Grid (margin-top 22, 2 columns, gap 10) — component `tile/interest`:
   - Tile height 88, radius 18, padding 14, column `space-between`, relative.
   - Icon 24 top-left; label 15/600 −1% bottom-left; `check_circle` 20 FILL absolute `top:12 right:12`.
   - Unselected: bg `neutral/surface`, text `ink`, icon `brand/primary`, `shadow/card`, check `transparent`.
   - Selected: bg `ink`, text `#FFF`, icon `brand/dark-glow` (#A9AAF5), no shadow, check `#FFF`.
4. CTA (margin-top auto) `button/primary-brand`: `Devam · 4 seçili` → dynamic `Devam · {n} seçili`.
5. Home indicator.

**Data rows (from `INTERESTS`, verbatim, grid order left→right, top→bottom).**

| # | icon | label (`t`) | on |
|---|---|---|---|
| 1 | `work` | `İş` | true |
| 2 | `family_restroom` | `Aile` | true |
| 3 | `account_balance_wallet` | `Finans` | false |
| 4 | `flight` | `Seyahat` | true |
| 5 | `shopping_bag` | `Alışveriş` | false |
| 6 | `event_available` | `Randevular` | true |
| 7 | `flag` | `Son Tarihler` | false |
| 8 | `select_all` | `Hepsi` | false |

Derived styles (from `renderVals`): `on ? {bg:'#1A1917', fg:'#fff', ic:'#A9AAF5', sh:'none', chk:'#fff'} : {bg:'#fff', fg:'#1A1917', ic:'#5B5CE2', sh:'0 1px 2px rgba(27,25,23,.04),0 6px 20px rgba(27,25,23,.05)', chk:'transparent'}`.

**Copy (verbatim).** `ADIM 2 / 4` · `Senin için neler önemli?` · `Birden fazla seçebilirsin. Zamanla kendim de öğrenirim.` · `İş` · `Aile` · `Finans` · `Seyahat` · `Alışveriş` · `Randevular` · `Son Tarihler` · `Hepsi` · `Devam · 4 seçili`

**Interactions.**
- Tile tap → toggle selected; selection haptic; CTA count updates.
- `Hepsi` → selects all seven others (design note); deselecting any other tile un-selects `Hepsi`; tapping `Hepsi` again clears all (inferred).
- `Devam · {n} seçili` → 2.9. With 0 selected: button still enabled? Not specified; recommend enabled with label `Devam` (interests are optional, "Zamanla kendim de öğrenirim").
- Back → 2.6.
- Dead in prototype: 8 tiles, CTA, back.

**States.** No loading/empty. Dark: unselected tile `dark/surface` + `dark/text`, icon `dark/primary`; selected tile inverts to `dark/text` bg with `dark/bg` text (or keep `ink`? — `ink` on `dark/bg` would vanish; use `dark/surface-2` with `dark/primary-glow` border — decision pending).

**Design note.** `Seçili kart: koyu zemin + dolu onay işareti. "Hepsi" diğerlerini otomatik işaretler. Seçimler yaşam kartlarının Bugün'de görünürlüğünü belirler.`

**Domain.** `UserPreferences.interests: Set<'work'|'family'|'finance'|'travel'|'shopping'|'appointments'|'deadlines'>` (`Hepsi` is a UI macro, not stored).

---

### 2.9 Brifing Ayarları · ADIM 3 / 4

**Purpose.** Set the briefing schedule (morning / noon / evening / weekend). Noon and evening are Pro features.

**Navigation.** Push from 2.8. Step header `ADIM 3 / 4`. Tapping a time chip opens the native time picker.

**Layout.**
1. `neutral/bg`, padding `0 20 44`, status bar, step header (back · `ADIM 3 / 4` · spacer).
2. Title `Günün ritmi` · Subtitle `Brifingleri ne zaman hazırlayayım? Sonradan değiştirebilirsin.`
3. Schedule rows (margin-top 22, gap 10) — component `row/briefing-schedule`: padding `14 16`, radius 18, bg `neutral/surface`, `shadow/card`, gap 14; tile 44×44 radius 14, icon 22; title 15/600; meta 12 `ink/tertiary`; trailing `chip/time` or `toggle`.

| # | icon | tile colours | title | meta | trailing |
|---|---|---|---|---|---|
| 1 | `wb_twilight` | bg `brand/soft`, icon `brand/primary` | `Sabah brifingi` | `Günün tamamı · sesli sürüm` | `chip/time` `08:00` |
| 2 | `wb_sunny` | bg `neutral/surface-2`, icon `ink/secondary` | `Öğle nabzı` | `Yalnızca değişenler` | `chip/time` `13:00` |
| 3 | `bedtime` | bg `neutral/surface-2`, icon `ink/secondary` | `Akşam kapanışı` | `Yarına kalanlar` | `chip/time` `19:00` |
| 4 | `weekend` | bg `neutral/surface-2`, icon `ink/secondary` | `Hafta sonu` | `Sadece sabah, 10:00 · Kişisel öncelikli` | `toggle` on |

4. AI hint line (margin-top 14, 13/19 `ink/secondary`, icon `psychology` 18 `brand/primary`, padding 0 4): `Takvimine göre: genelde 08:15'te telefonu açıyorsun. 08:00 iyi bir seçim.`
5. CTA (margin-top auto) `button/primary-brand`: `Devam`.
6. Home indicator.

**Copy (verbatim).** `ADIM 3 / 4` · `Günün ritmi` · `Brifingleri ne zaman hazırlayayım? Sonradan değiştirebilirsin.` · `Sabah brifingi` · `Günün tamamı · sesli sürüm` · `08:00` · `Öğle nabzı` · `Yalnızca değişenler` · `13:00` · `Akşam kapanışı` · `Yarına kalanlar` · `19:00` · `Hafta sonu` · `Sadece sabah, 10:00 · Kişisel öncelikli` · `Takvimine göre: genelde 08:15'te telefonu açıyorsun. 08:00 iyi bir seçim.` · `Devam`

**Interactions.**
- `chip/time` tap → native time picker (iOS wheel / Android dial), 15-min steps recommended; chip text updates.
- Weekend `toggle` → enables/disables weekend briefing (fixed 10:00 in prototype; meta line is static copy).
- `Devam` → 2.10 (starts first analysis).
- Back → 2.8.
- Pro gating (design note): `Öğle ve akşam Pro özelliği; ücretsizde kilit ikonu ile görünür, gizlenmez.` → for free users rows 2 and 3 remain visible with a `lock` icon (Material Symbols) on the time chip; tapping opens the Pro paywall (07 canvas). The prototype does not draw the lock state.
- Dead in prototype: 3 time chips, weekend toggle, `Devam`, back.

**States.** The hint line depends on calendar/device data; if unavailable, hide the line (no empty copy given). Dark: rows `dark/surface`, chips `dark/surface-2`, hint `dark/secondary`.

**Domain.** `BriefingSchedule { morning: {enabled:true, time:'08:00', audio:true}, noon: {enabled, time:'13:00', pro:true}, evening: {enabled, time:'19:00', pro:true}, weekend: {enabled:true, time:'10:00', personalPriority:true} }` plus `suggestedMorningTime` derived from device-unlock/calendar signals.

**Design note.** `Saat çipine dokunuş yerel saat seçiciyi açar. Öğle ve akşam Pro özelliği; ücretsizde kilit ikonu ile görünür, gizlenmez.`

---

### 2.10 İlk Analiz · İşleniyor (dramatik an)

**Purpose.** The "dramatic moment": first 72-hour analysis of connected accounts. A findings list replaces a progress bar.

**Navigation.** Push from 2.9; **non-dismissable** (no back, no swipe-back). Auto-advances to 2.11 when analysis completes. Implied `ADIM 4 / 4` (no kicker drawn).

**Layout.**
1. Background `gradient/night` (180deg #15153A → #25266A 60% → #3B3CA8). Text `#FFF`. Padding `0 28 44`. Status bar light.
2. Flex-1 centred column, gap 36:
   - **Ring** 132×132 (from `renderVals.ring`):
     - Outer track: full circle, border 3 `rgba(255,255,255,.15)`.
     - Spinning arc: border 3 transparent with `border-top` `#FFF`, rotate 360° every **1.4 s** linear infinite.
     - Inner arc: inset 14, border 2 transparent with `border-bottom` `rgba(255,255,255,.6)`, rotate every **2.2 s** linear infinite **reverse**.
     - Centre icon `auto_awesome` 44 `#FFF` FILL 1.
   - Title `Dijital hayatın analiz ediliyor…` (26/32 600 −2%) · Subtitle (margin-top 8, 14, `rgba(255,255,255,.7)`) `Son 72 saat · Gmail ve Google Takvim` → dynamic `Son 72 saat · {connectedProviders joined with " ve "}`.
   - **Findings checklist** (full width, gap 12, 15): row gap 12, leading 22×22 indicator:
     1. done — `check_circle` 22 FILL `raw #A9F0C1` (proposed `success/on-dark`; close to `dark/success-text` #6FCF97) — `127 mail bulundu`
     2. done — `8 potansiyel önemli konu`
     3. done — `4 etkinlik`
     4. active — spinner 22 (border 2 `rgba(255,255,255,.3)`, top `#FFF`, 0.9 s linear infinite) — `2 takip tespit ediliyor…`
     5. pending — opacity .4, empty circle 22 with border 2 `rgba(255,255,255,.4)` — `Öncelikler sıralanıyor`
3. Footer (centred, 12, `rgba(255,255,255,.6)`): `Genelde 20–40 saniye sürer. Mail içerikleri cihazında özetlenir, hiçbir şey gönderilmez.`
4. Home indicator (white 40%).

**Copy (verbatim).** `Dijital hayatın analiz ediliyor…` · `Son 72 saat · Gmail ve Google Takvim` · `127 mail bulundu` · `8 potansiyel önemli konu` · `4 etkinlik` · `2 takip tespit ediliyor…` · `Öncelikler sıralanıyor` · `Genelde 20–40 saniye sürer. Mail içerikleri cihazında özetlenir, hiçbir şey gönderilmez.`

Dynamic templates: `{n} mail bulundu` · `{n} potansiyel önemli konu` · `{n} etkinlik` · `{n} takip tespit ediliyor…` · `Öncelikler sıralanıyor`.

**Interactions.** None (no buttons). Dead in prototype: n/a.

**Motion / haptics (design note).** `Sayılar canlı artar (127 → sayaç), her satır tamamlandığında yeşil ✓ + hafif haptic. Halka nabız atar; ilerleme çubuğu yok, belirsiz bekleme hissi yerine bulgu listesi.`
- Numbers count up live as the backend streams progress (`127` counter animation).
- Each row transitions pending → active (spinner) → done (`check_circle` pop-in) with a **light impact haptic** per completion.
- Ring pulses (scale 1 → 1.04 → 1, ~2 s ease-in-out) in addition to the rotating arcs.
- No determinate progress bar.
- Reduce-motion: static ring, no pulse, rows still update.

**States.**
- This screen *is* the loading state. Stage list order is fixed: mails found → important topics → events → follow-ups → prioritising.
- Long-running (>60 s): keep waiting; optionally add a subtle "Biraz daha sürüyor…" line (copy TBD).
- Error / offline: not designed. Recommend an inline retry block on this screen (copy TBD, `critical-text` on dark = `dark/critical-text` #F08B78) with a `Tekrar dene` button; never bounce the user back to 2.9.
- Dark mode: already dark.
- Analytics: emit `first_analysis_started/completed` with durations.

**Domain (progress payload).** `AnalysisProgress { windowHours: 72, providers: string[], stages: [{key:'mails', count}, {key:'topics', count}, {key:'events', count}, {key:'followups', count}, {key:'prioritise'}], stageStatus: pending|active|done }`.

---

### 2.11 İlk Analiz · Hazır

**Purpose.** First value moment: show real findings immediately; the briefing is one tap away. Notification permission is requested only after this.

**Navigation.** Replaces 2.10. CTA → main app (Bugün) via 2.12 first. Non-dismissable (no back).

**Layout.**
1. Background `gradient/dawn`. Text `#FFF`. Padding `0 28 44`.
2. Flex-1 centred column, gap 28, text centred:
   - Success badge 88×88 circle bg `#FFF`, `shadow/float-dark`, icon `check` 44 `success` (#2FA062) FILL 1.
   - Kicker `HAZIR.` (15/600 +10%, opacity .75).
   - Headline (margin-top 14, 32/38 600 −2.5%, `text-wrap: pretty`): `Son 72 saatte bilmen gereken 5 şey bulduk.` — the number `5` is coloured `raw #C9C9FF` (proposed `brand/on-gradient-accent`). Dynamic `Son 72 saatte bilmen gereken {n} şey bulduk.`
   - **Findings panel** (width 100%, bg `rgba(255,255,255,.1)`, radius 20, padding `6 16`, text-left, 14): rows padding `10 0`, gap 10, separated by `1px solid rgba(255,255,255,.1)`:
     1. badge `ACİL` (`critical/soft` / `critical/text`) — `Ahmet revize teklif bekliyor · 17:00`
     2. badge `TOPLANTI` (bg `rgba(255,255,255,.15)`, text `#FFF`) — `Mehmet ile 14:30 · hazırlık hazır`
     3. badge `SON TARİH` (`warning/soft` / `warning/text`) — `Başvuru bugün 17:00`
     4. (opacity .7, no badge) — `+ 2 konu daha` → dynamic `+ {n} konu daha`
3. CTA `button/primary-on-gradient`: `Brifingimi Gör`.
4. Home indicator (white 40%).

**Copy (verbatim).** `HAZIR.` · `Son 72 saatte bilmen gereken 5 şey bulduk.` · `ACİL` · `Ahmet revize teklif bekliyor · 17:00` · `TOPLANTI` · `Mehmet ile 14:30 · hazırlık hazır` · `SON TARİH` · `Başvuru bugün 17:00` · `+ 2 konu daha` · `Brifingimi Gör`

**Interactions.**
- `Brifingimi Gör` → 2.12 (notification explainer) → then Bugün with the first briefing open. Design note is explicit that permission is asked **after** this value moment.
- Findings rows: non-interactive here (they are a preview).
- Dead in prototype: `Brifingimi Gör`.

**Motion.** Suggested: check badge scales in with a success haptic (`notificationSuccess`), then rows stagger in. Not specified.

**States.**
- Empty findings (0 items — e.g. a brand-new mailbox): not designed. Recommend headline `Şu an için sakin görünüyor.` (copy TBD) and go straight to 2.12.
- Show at most 3 rows + `+ {n} konu daha`.
- Dark: already dark.

**Domain (finding preview).** `FindingPreview { kind: 'urgent'|'meeting'|'deadline'|'followup'|'other', badgeLabel, title, timeHint }` — badge kinds map to `card/priority` badge variants (ACİL = critical, SON TARİH = warning, TAKİP = neutral, TOPLANTI = neutral-on-dark).

**Design note.** `İlk değer anı: gerçek bulgular hemen görünür, brifing bir dokunuş uzakta. Bildirim izni bundan SONRA istenir; değer görülmeden izin istenmez.`

---

### 2.12 Bildirim İzni Açıklayıcı

**Purpose.** Pre-permission explainer for push notifications with three real example notifications. System prompt fires only after `Bildirimleri Aç`.

**Navigation.** Push from 2.11. Then → 2.13 on Android, or → Bugün on iOS.

**Layout.**
1. `neutral/bg`, padding `0 28 44`, status bar.
2. Flex-1 centred column, gap 28:
   - **Notification preview stack** (gap 10) — component `preview/notification`: padding 14, radius 20, bg `rgba(255,255,255,.7)` with `backdrop-filter: blur(20px)`, `shadow/notification`; horizontal offsets `translateX(-8)`, `translateX(+8)`, `translateX(-4)`. App icon 38×38 radius 11 bg `brand/primary`, `auto_awesome` 22 `#FFF` FILL. Header row 13: bold `Dijital Asistan` + time `ink/tertiary`; body 14/19 margin-top 2.
     1. `14:10` — `Toplantına 20 dakika kaldı. Mehmet için 3 konu hazır.`
     2. `08:00` — `Bugün cevaplaman gereken önemli bir mail var.`
     3. `11:30` — `Kargon bugün geliyor. 14:00–18:00 arası.`
   - Text block (centred): headline `Sadece önemli olduğunda haber verelim.` (30/36 600 −2.5%, pretty) · subtitle (margin-top 8, 15/22 `ink/secondary`) `Günde ortalama 3 bildirim. Pazarlama bildirimi yok, "bak bana" bildirimi yok.`
3. Actions (gap 8): `button/primary-brand` `Bildirimleri Aç` · `button/text-secondary` `Daha sonra`.
4. Home indicator.

**Copy (verbatim).** `Dijital Asistan` · `14:10` · `Toplantına 20 dakika kaldı. Mehmet için 3 konu hazır.` · `08:00` · `Bugün cevaplaman gereken önemli bir mail var.` · `11:30` · `Kargon bugün geliyor. 14:00–18:00 arası.` · `Sadece önemli olduğunda haber verelim.` · `Günde ortalama 3 bildirim. Pazarlama bildirimi yok, "bak bana" bildirimi yok.` · `Bildirimleri Aç` · `Daha sonra`

(Subtitle uses Turkish curly quotes `“bak bana”` in the source.)

**Interactions.**
- `Bildirimleri Aç` → request system notification permission (`expo-notifications`). On grant/deny → continue (Android → 2.13; iOS → Bugün).
- `Daha sonra` → skip; design note: `"Daha sonra" ilk brifing ekranında tekrar, sonra bir daha sormaz.` → set `notifPromptDeferredCount = 1`; re-ask once on the first briefing screen; after a second `Daha sonra`, never ask again (only via Settings).
- Dead in prototype: both buttons.

**States.** Permission previously denied at OS level: primary button should deep-link to system Settings (copy TBD, e.g. `Ayarlarda Aç`). Dark: previews `dark/surface` at 70% + blur, text `dark/text`.

**Design note.** `Üç gerçek bildirim örneği; sistem izni ancak "Bildirimleri Aç"tan sonra istenir. "Daha sonra" ilk brifing ekranında tekrar, sonra bir daha sormaz.`

---

### 2.13 Android · Telefon Bildirimleri (isteğe bağlı)

**Purpose.** Android-only: opt-in to the Notification Listener so the assistant can extract signals from delivery/bank/airline notifications. Processed on-device; chat apps off by default.

**Navigation.** Push from 2.12 on Android only. iOS never sees it. Skippable. → Bugün.

**Layout (Android frame).**
1. `neutral/bg`, padding `0 20 28`, Android status bar (46).
2. Header row (margin-top 10): `button/back` · kicker `SADECE ANDROID` · `Atla` (14/600 `ink/secondary`).
3. Title `Telefon bildirimlerini de anlayayım mı?` (30/36) · Subtitle (pretty) `Kargo, banka ve uygulama bildirimlerinden kişisel sinyaller çıkarırım. Mesaj içerikleri asla saklanmaz.`
4. Section kicker (margin-top 22, padding 0 4): `UYGULAMALAR`
5. **List group** (margin-top 8, bg `neutral/surface`, radius 18, padding `4 16`, `shadow/card`) — rows padding `10 0`, `border-top: 1px solid rgba(27,25,23,.06)` on all but the first; tile 36×36 radius 11 bg `neutral/surface-2`, icon 20 `ink/secondary`; title 15/600; meta 12 `ink/tertiary`; trailing `toggle`.

| # | icon | name | meta | on |
|---|---|---|---|---|
| 1 | `local_shipping` | `Kargo uygulamaları` | `Trendyol, Hepsiburada, Yurtiçi` | true |
| 2 | `account_balance` | `Banka` | `Ödeme ve son tarih bildirimleri` | true |
| 3 | `flight` | `Havayolu` | `THY, Pegasus · kapı ve rötar` | true |
| 4 | `restaurant` | `Rezervasyon` | `Yemek, otel, etkinlik` | false |
| 5 | `chat` | `Mesajlaşma` | `WhatsApp, Telegram · önerilmez` | false |

Derived (from `renderVals.apps`): `border: i ? '1px solid rgba(27,25,23,.06)' : '0'`, `tbg: on ? '#5B5CE2' : '#D9D6D0'`, `knob: on ? '22px' : '2px'`.

6. Assurance box (margin-top 14, padding `14 16`, radius 16, bg `success/soft`, 13/19 `raw #1E5A36`, icon `verified_user` 20 `success/text`): `Bildirim erişimi cihazda işlenir. Sohbet uygulamaları varsayılan olarak kapalıdır ve önerilmez.`
7. Bottom (margin-top auto, gap 8): `button/primary-brand` `Bildirim Erişimini Aç` · footnote (12 `ink/tertiary`, centred) `Android Ayarlar → Bildirim erişimi ekranı açılır.`
8. Android gesture bar.

**Copy (verbatim).** `SADECE ANDROID` · `Atla` · `Telefon bildirimlerini de anlayayım mı?` · `Kargo, banka ve uygulama bildirimlerinden kişisel sinyaller çıkarırım. Mesaj içerikleri asla saklanmaz.` · `UYGULAMALAR` · `Kargo uygulamaları` · `Trendyol, Hepsiburada, Yurtiçi` · `Banka` · `Ödeme ve son tarih bildirimleri` · `Havayolu` · `THY, Pegasus · kapı ve rötar` · `Rezervasyon` · `Yemek, otel, etkinlik` · `Mesajlaşma` · `WhatsApp, Telegram · önerilmez` · `Bildirim erişimi cihazda işlenir. Sohbet uygulamaları varsayılan olarak kapalıdır ve önerilmez.` · `Bildirim Erişimini Aç` · `Android Ayarlar → Bildirim erişimi ekranı açılır.`

**Interactions.**
- Toggles → set per-category listener filters (stored locally; applied by the NotificationListenerService).
- `Bildirim Erişimini Aç` → `Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS` intent; on return, check `isNotificationListenerEnabled`; if enabled → Bugün; else stay with the button still active.
- `Atla` → Bugün, listener disabled, categories remembered for later enabling in Settings.
- Back → 2.12.
- Dead in prototype: 5 toggles, `Bildirim Erişimini Aç`, `Atla`, back.

**States.**
- Listener already granted (re-entry): CTA label should change to `Devam` (inferred).
- Permission-denied / user returns without enabling: no error; show the footnote as-is; allow `Atla`.
- Dark: list group `dark/surface`, tiles `dark/surface-2`, assurance keeps tint.
- Note: `SADECE ANDROID` kicker is a design-canvas annotation as much as UI; product may drop it in the shipped screen — confirm with design.

**Design note.** `Android çerçevesi: daha küçük köşe yarıçapı, hareket çubuğu, durum çubuğu düzeni farklı. iOS akışı bu adımı hiç görmez; ürün deneyimi bundan bağımsızdır.`

**Domain.** `NotificationListenerPrefs { enabled: boolean, categories: { shipping:true, bank:true, airline:true, reservation:false, messaging:false } }` — package allow-lists per category maintained server-side (Trendyol, Hepsiburada, Yurtiçi, THY, Pegasus, WhatsApp, Telegram named in copy).

---

## 3. Data arrays transcribed from `<script type="text/x-dc">`

```js
const INTEGRATIONS=[
 {icon:'mail',name:'Gmail',meta:'yunus@…com · 3 gün analiz edildi',tbg:'#FCEDE9',tfg:'#C7432F',on:true},
 {icon:'mail',name:'Outlook',meta:'İş maili · Microsoft 365',tbg:'#E7F0FD',tfg:'#2262BE',on:false},
 {icon:'calendar_month',name:'Google Takvim',meta:'2 takvim · Kişisel, İş',tbg:'#E4F5EA',tfg:'#1E7A47',on:true},
 {icon:'calendar_month',name:'Microsoft Takvim',meta:'Outlook takvimi',tbg:'#E7F0FD',tfg:'#2262BE',on:false},
 {icon:'calendar_month',name:'Apple Takvim',meta:'iCloud · cihazdan okunur',tbg:'#F0EFEB',tfg:'#6B6860',on:false}
];
const INTERESTS=[{icon:'work',t:'İş',on:true},{icon:'family_restroom',t:'Aile',on:true},{icon:'account_balance_wallet',t:'Finans',on:false},{icon:'flight',t:'Seyahat',on:true},{icon:'shopping_bag',t:'Alışveriş',on:false},{icon:'event_available',t:'Randevular',on:true},{icon:'flag',t:'Son Tarihler',on:false},{icon:'select_all',t:'Hepsi',on:false}];
const APPS=[{icon:'local_shipping',name:'Kargo uygulamaları',meta:'Trendyol, Hepsiburada, Yurtiçi',on:true},{icon:'account_balance',name:'Banka',meta:'Ödeme ve son tarih bildirimleri',on:true},{icon:'flight',name:'Havayolu',meta:'THY, Pegasus · kapı ve rötar',on:true},{icon:'restaurant',name:'Rezervasyon',meta:'Yemek, otel, etkinlik',on:false},{icon:'chat',name:'Mesajlaşma',meta:'WhatsApp, Telegram · önerilmez',on:false}];
```

Render-time derivations (`Component.renderVals`):
- `integrations`: `bbg = on ? '#E4F5EA' : '#EDEDFC'`; `bfg = on ? '#1E7A47' : '#4547C9'`; `bicon = on ? 'check' : 'add'`; `btn = on ? 'Bağlandı' : 'Bağla'`.
- `interests`: `bg = on ? '#1A1917' : '#fff'`; `fg = on ? '#fff' : '#1A1917'`; `ic = on ? '#A9AAF5' : '#5B5CE2'`; `sh = on ? 'none' : '0 1px 2px rgba(27,25,23,.04),0 6px 20px rgba(27,25,23,.05)'`; `chk = on ? '#fff' : 'transparent'`.
- `apps`: `border = i ? '1px solid rgba(27,25,23,.06)' : '0'`; `tbg = on ? '#5B5CE2' : '#D9D6D0'`; `knob = on ? '22px' : '2px'`.
- `ring` and `spinner`: see 2.10. Keyframes: `daspin` = rotate 0→360deg; `dabar` (scaleY .25→1) is defined but unused on this canvas.

---

## 4. Consolidated i18n string table

Suggested key → verbatim value. Keys are proposals; values are authoritative.

| Key | Value |
|---|---|
| onboarding.common.skip | `Atla` |
| onboarding.common.continue | `Devam` |
| onboarding.common.notNow | `Şimdi değil` |
| onboarding.common.later | `Daha sonra` |
| onboarding.common.stepOf | `ADIM {n} / {total}` |
| onboarding.intro1.wordmark | `DİJİTAL ASİSTAN` |
| onboarding.intro1.headline | `Bugün bilmen gerekenleri, sen sormadan söyler.` |
| onboarding.intro1.subtitle | `Mailini, takvimini ve yapman gerekenleri tek yerde anlar.` |
| onboarding.intro1.cta | `Başlayalım` |
| onboarding.intro1.haveAccount | `Zaten hesabın var mı?` |
| onboarding.intro1.signIn | `Giriş yap` |
| onboarding.intro2.count | `127` |
| onboarding.intro2.countUnit | `mail` |
| onboarding.intro2.badge.urgent | `ACİL` |
| onboarding.intro2.badge.deadline | `SON TARİH` |
| onboarding.intro2.badge.followup | `TAKİP` |
| onboarding.intro2.row1 | `Ahmet revize teklif bekliyor` |
| onboarding.intro2.row2 | `Başvuru bugün 17:00` |
| onboarding.intro2.row3 | `Teklife 3 gündür cevap yok` |
| onboarding.intro2.eyebrow | `127 mail → 3 önemli konu` |
| onboarding.intro2.headline | `Gürültüyü azalt.` |
| onboarding.intro2.subtitle | `Gelen her şeyi okur, yalnızca önemli olanı gösterir.` |
| onboarding.intro3.card.kicker | `SABAH BRİFİNGİ · 08:00` |
| onboarding.intro3.card.greeting | `Günaydın Yunus` |
| onboarding.intro3.card.summary | `Bugün oldukça sakin bir günün var.` |
| onboarding.intro3.card.body | `Öğlene kadar toplantın bulunmuyor. Saat 14:30'da Mehmet ile müşteri toplantın var…` |
| onboarding.intro3.card.listen | `Brifingi Dinle · 2 dk` |
| onboarding.intro3.eyebrow | `Her sabah 08:00` |
| onboarding.intro3.headline | `Gününü sen sormadan hazırlarız.` |
| onboarding.intro3.subtitle | `Okumak istemezsen 2 dakikada dinle.` |
| onboarding.intro4.card.action | `MAİL GÖNDER` |
| onboarding.intro4.card.status | `BEKLİYOR` |
| onboarding.intro4.card.title | `Mehmet Yılmaz'a takip mesajı gönder` |
| onboarding.intro4.card.whyLabel | `Neden` |
| onboarding.intro4.card.why | `Teklife 3 gündür yanıt gelmedi.` |
| onboarding.intro4.card.changeLabel | `Değişim` |
| onboarding.intro4.card.change | `1 mail · Kısa, profesyonel ton` |
| onboarding.intro4.card.approve | `Onayla` |
| onboarding.intro4.card.edit | `Düzenle` |
| onboarding.intro4.card.reject | `Reddet` |
| onboarding.intro4.eyebrow | `Onay Merkezi` |
| onboarding.intro4.headline | `Kontrol her zaman sende.` |
| onboarding.intro4.subtitle | `Sen onaylamadan mail göndermez, takvimine dokunmaz.` |
| onboarding.intro4.cta | `Hesap Oluştur` |
| auth.title | `Hesabını oluştur` |
| auth.subtitle | `Giriş yöntemin, bağlayacağın hesaplardan bağımsızdır.` |
| auth.google | `Google ile devam et` |
| auth.apple | `Apple ile devam et` |
| auth.microsoft | `Microsoft ile devam et` |
| auth.or | `veya` |
| auth.email | `E-posta ile devam et` |
| auth.legal | `Devam ederek Kullanım Koşulları ve Gizlilik Politikası'nı kabul edersin. Verilerin reklam amacıyla kullanılmaz.` |
| auth.legal.terms | `Kullanım Koşulları` |
| auth.legal.privacy | `Gizlilik Politikası` |
| connect.title | `Dijital hayatını bağla.` |
| connect.subtitle | `En az bir mail ve bir takvim yeterli. İstediğin zaman kaldırabilirsin.` |
| connect.pill.connect | `Bağla` |
| connect.pill.connected | `Bağlandı` |
| connect.assurance | `Sen onaylamadan mail göndermeyiz.` |
| connect.cta | `Devam · {n} hesap bağlı` |
| connect.provider.gmail | `Gmail` |
| connect.provider.gmail.meta | `yunus@…com · 3 gün analiz edildi` |
| connect.provider.outlook | `Outlook` |
| connect.provider.outlook.meta | `İş maili · Microsoft 365` |
| connect.provider.gcal | `Google Takvim` |
| connect.provider.gcal.meta | `2 takvim · Kişisel, İş` |
| connect.provider.mscal | `Microsoft Takvim` |
| connect.provider.mscal.meta | `Outlook takvimi` |
| connect.provider.icloud | `Apple Takvim` |
| connect.provider.icloud.meta | `iCloud · cihazdan okunur` |
| explainer.gmail.kicker | `GMAIL` |
| explainer.gmail.title | `Mail erişimine neden ihtiyacımız var?` |
| explainer.gmail.reason1 | `Önemli mailleri bulmak` |
| explainer.gmail.reason2 | `Cevap bekleyenleri anlamak` |
| explainer.gmail.reason3 | `Son tarihleri tespit etmek` |
| explainer.common.assurance.noSend | `Sen onaylamadan mail göndermeyiz.` |
| explainer.common.assurance.revoke | `Bağlantını istediğin zaman kaldırabilirsin.` |
| explainer.common.assurance.noAds | `Verilerin reklam amacıyla kullanılmaz, satılmaz.` |
| explainer.gmail.cta | `Google ile Bağlan` |
| explainer.gmail.footnote | `Sonraki adımda Google'ın kendi izin ekranı açılır.` |
| explainer.outlook.kicker | `OUTLOOK · MICROSOFT 365` |
| explainer.outlook.title | `Outlook erişimine neden ihtiyacımız var?` |
| explainer.outlook.reason1 | `İş maillerinde önemli konuları bulmak` |
| explainer.outlook.reason2 | `Cevap bekleyen konuşmaları anlamak` |
| explainer.outlook.reason3 | `Teklif, sözleşme ve son tarihleri tespit etmek` |
| explainer.outlook.assurance.corporate | `Kurumsal hesapta yalnızca sana verilen izinler kullanılır; şirket politikaların geçerli kalır.` |
| explainer.outlook.cta | `Microsoft ile Bağlan` |
| explainer.outlook.footnote | `Sonraki adımda Microsoft'un kendi izin ekranı açılır.` |
| explainer.calendar.kicker | `TAKVİM` |
| explainer.calendar.title | `Takvim erişimine neden ihtiyacımız var?` |
| explainer.calendar.chip.google | `Google Takvim` |
| explainer.calendar.chip.apple | `Apple Takvim` |
| explainer.calendar.chip.microsoft | `Microsoft Takvim` |
| explainer.calendar.reason1 | `Günün programını anlamak` |
| explainer.calendar.reason2 | `Toplantı çakışmalarını tespit etmek` |
| explainer.calendar.reason3 | `Yaklaşan etkinlikleri brifinge eklemek` |
| explainer.calendar.reason4 | `Uygun zaman önermek` |
| explainer.calendar.assurance.approve | `Takviminde değişiklik yapmadan önce senden onay isteriz.` |
| explainer.calendar.assurance.noAds | `Etkinlik içerikleri reklam amacıyla kullanılmaz.` |
| explainer.calendar.cta.google | `Google Takvim'i Bağla` |
| explainer.calendar.footnote.apple | `Apple Takvim cihazdan okunur; ayrı giriş gerekmez.` |
| interests.title | `Senin için neler önemli?` |
| interests.subtitle | `Birden fazla seçebilirsin. Zamanla kendim de öğrenirim.` |
| interests.work | `İş` |
| interests.family | `Aile` |
| interests.finance | `Finans` |
| interests.travel | `Seyahat` |
| interests.shopping | `Alışveriş` |
| interests.appointments | `Randevular` |
| interests.deadlines | `Son Tarihler` |
| interests.all | `Hepsi` |
| interests.cta | `Devam · {n} seçili` |
| schedule.title | `Günün ritmi` |
| schedule.subtitle | `Brifingleri ne zaman hazırlayayım? Sonradan değiştirebilirsin.` |
| schedule.morning | `Sabah brifingi` |
| schedule.morning.meta | `Günün tamamı · sesli sürüm` |
| schedule.noon | `Öğle nabzı` |
| schedule.noon.meta | `Yalnızca değişenler` |
| schedule.evening | `Akşam kapanışı` |
| schedule.evening.meta | `Yarına kalanlar` |
| schedule.weekend | `Hafta sonu` |
| schedule.weekend.meta | `Sadece sabah, 10:00 · Kişisel öncelikli` |
| schedule.hint | `Takvimine göre: genelde 08:15'te telefonu açıyorsun. 08:00 iyi bir seçim.` |
| analysis.title | `Dijital hayatın analiz ediliyor…` |
| analysis.subtitle | `Son 72 saat · {providers}` (example `Son 72 saat · Gmail ve Google Takvim`) |
| analysis.stage.mails | `{n} mail bulundu` |
| analysis.stage.topics | `{n} potansiyel önemli konu` |
| analysis.stage.events | `{n} etkinlik` |
| analysis.stage.followups | `{n} takip tespit ediliyor…` |
| analysis.stage.prioritise | `Öncelikler sıralanıyor` |
| analysis.footer | `Genelde 20–40 saniye sürer. Mail içerikleri cihazında özetlenir, hiçbir şey gönderilmez.` |
| ready.kicker | `HAZIR.` |
| ready.headline | `Son 72 saatte bilmen gereken {n} şey bulduk.` |
| ready.badge.urgent | `ACİL` |
| ready.badge.meeting | `TOPLANTI` |
| ready.badge.deadline | `SON TARİH` |
| ready.row1 | `Ahmet revize teklif bekliyor · 17:00` |
| ready.row2 | `Mehmet ile 14:30 · hazırlık hazır` |
| ready.row3 | `Başvuru bugün 17:00` |
| ready.more | `+ {n} konu daha` |
| ready.cta | `Brifingimi Gör` |
| notif.appName | `Dijital Asistan` |
| notif.example1 | `Toplantına 20 dakika kaldı. Mehmet için 3 konu hazır.` |
| notif.example2 | `Bugün cevaplaman gereken önemli bir mail var.` |
| notif.example3 | `Kargon bugün geliyor. 14:00–18:00 arası.` |
| notif.headline | `Sadece önemli olduğunda haber verelim.` |
| notif.subtitle | `Günde ortalama 3 bildirim. Pazarlama bildirimi yok, “bak bana” bildirimi yok.` |
| notif.cta | `Bildirimleri Aç` |
| android.kicker | `SADECE ANDROID` |
| android.title | `Telefon bildirimlerini de anlayayım mı?` |
| android.subtitle | `Kargo, banka ve uygulama bildirimlerinden kişisel sinyaller çıkarırım. Mesaj içerikleri asla saklanmaz.` |
| android.section | `UYGULAMALAR` |
| android.app.shipping | `Kargo uygulamaları` / `Trendyol, Hepsiburada, Yurtiçi` |
| android.app.bank | `Banka` / `Ödeme ve son tarih bildirimleri` |
| android.app.airline | `Havayolu` / `THY, Pegasus · kapı ve rötar` |
| android.app.reservation | `Rezervasyon` / `Yemek, otel, etkinlik` |
| android.app.messaging | `Mesajlaşma` / `WhatsApp, Telegram · önerilmez` |
| android.assurance | `Bildirim erişimi cihazda işlenir. Sohbet uygulamaları varsayılan olarak kapalıdır ve önerilmez.` |
| android.cta | `Bildirim Erişimini Aç` |
| android.footnote | `Android Ayarlar → Bildirim erişimi ekranı açılır.` |

---

## 5. Dead in prototype (complete list)

Every interactive element on this canvas is a static `<span>`/`<div>` with no handler. Engineers must wire all of the following:

| Screen | Element | Required behaviour |
|---|---|---|
| 2.1 | `Başlayalım` | pager → 2.2 |
| 2.1 | `Giriş yap` | → 2.5 (sign-in mode) |
| 2.2 / 2.3 / 2.4 | `Atla` | → 2.5 |
| 2.2 / 2.3 | `Devam` | pager next |
| 2.3 | `Brifingi Dinle · 2 dk` | decorative, no-op |
| 2.4 | `Onayla` / `Düzenle` / `Reddet` | decorative, no-op |
| 2.4 | `Hesap Oluştur` | → 2.5 |
| 2.5 | back | → pager |
| 2.5 | `Google ile devam et` / `Apple ile devam et` / `Microsoft ile devam et` | native sign-in → 2.6 |
| 2.5 | `E-posta ile devam et` | e-mail flow (undesigned) |
| 2.5 | `Kullanım Koşulları` / `Gizlilik Politikası` | legal screens |
| 2.6 | back | → 2.5 |
| 2.6 | `Bağla` ×3 (Outlook, Microsoft Takvim, Apple Takvim) | open 2.7b / 2.7c |
| 2.6 | `Bağlandı` ×2 (Gmail, Google Takvim) | disconnect confirmation (undesigned) |
| 2.6 | `Devam · 2 hesap bağlı` | → 2.8 (gate on ≥1 mail + ≥1 calendar) |
| 2.7 / 2.7b / 2.7c | grabber / scrim | dismiss |
| 2.7 | `Google ile Bağlan` / `Şimdi değil` | OAuth / dismiss |
| 2.7b | `Microsoft ile Bağlan` / `Şimdi değil` | OAuth / dismiss |
| 2.7c | chips `Google Takvim` / `Apple Takvim` / `Microsoft Takvim` | select provider, relabel CTA |
| 2.7c | `Google Takvim'i Bağla` / `Şimdi değil` | OAuth or EventKit / dismiss |
| 2.8 | back; 8 interest tiles; `Devam · 4 seçili` | toggle; `Hepsi` selects all; → 2.9 |
| 2.9 | back; time chips `08:00` / `13:00` / `19:00`; weekend toggle; `Devam` | time picker; toggle; → 2.10 |
| 2.9 | (Pro lock on Öğle/Akşam — not drawn) | paywall |
| 2.10 | — | no controls; auto-advance |
| 2.11 | `Brifingimi Gör` | → 2.12 |
| 2.12 | `Bildirimleri Aç` / `Daha sonra` | system permission / defer |
| 2.13 | back; `Atla`; 5 toggles; `Bildirim Erişimini Aç` | → 2.12; → Bugün; prefs; listener settings intent |

---

## 6. Colours used that have no token (add to theme or map)

| Raw | Where | Proposed token |
|---|---|---|
| `#25266A` | text on white CTA over gradient (2.1, 2.11) | `brand/deep` |
| `#C9C9FF` | highlighted number in 2.11 headline | `brand/on-gradient-accent` |
| `#A9F0C1` | done check on dark (2.10) | `success/on-dark` (or use `dark/success-text` #6FCF97) |
| `#1E5A36` | assurance text on `success/soft` | `success/text-strong` |
| `#C9C5BC` | inactive page dot (light) | `neutral/dot-inactive` |
| `#E0DED7` | sheet grabber | `neutral/grabber` |
| `#D9D6D0` | toggle off track | `neutral/toggle-off` |
| `rgba(27,25,23,.35)` | sheet scrim | `overlay/scrim` |
| `rgba(255,255,255,.1)` / `.15` | findings panel / TOPLANTI badge on gradient | `on-gradient/surface`, `on-gradient/badge` |
| `#15153A → #25266A → #3B3CA8` (180°) | 2.10 background | `gradient/night` |
| `#F25022 #7FBA00 #00A4EF #FFB900` | Microsoft logo placeholder | replace with brand asset |

---

## 7. Dark-mode summary

The canvas draws no dark variants. Three screens are inherently dark (2.1, 2.10, 2.11 on gradients) and are unchanged. For the light screens apply the standard mapping: `neutral/bg → dark/bg`, `neutral/surface → dark/surface`, `neutral/surface-2 → dark/surface-2`, `ink → dark/text`, `ink/secondary → dark/secondary`, `ink/tertiary → dark/tertiary`, `brand/primary → dark/primary` (text/icons) with `dark/on-primary` on filled brand buttons, `brand/dark-glow → dark/primary-glow`, `critical/text → dark/critical-text`, `warning/text → dark/warning-text`, `success/text → dark/success-text`. Open decisions flagged inline: selected interest tile on dark (2.8), soft-tint assurance boxes on dark (2.7*, 2.13), `ink`-filled buttons on dark (2.2, 2.3, 2.5).

---

## 8. Open questions for design/product

1. `ADIM 4 / 4` never appears — confirm the analysis screens are step 4 and whether the kicker should be shown.
2. Sign-in mode title for 2.5 (reached via `Giriş yap`).
3. E-mail auth flow (2.5 `E-posta ile devam et`) is undesigned.
4. Disconnect affordance for `Bağlandı` pills on 2.6.
5. CTA labels for Apple/Microsoft on 2.7c (inferred `Apple Takvim'i Bağla`, `Microsoft Takvim'i Bağla`) and their footnotes.
6. Pro-locked visual for Öğle/Akşam rows on 2.9 (lock icon placement).
7. Error/offline treatment for 2.10 and OAuth failures.
8. Empty-findings variant of 2.11.
9. Whether `SADECE ANDROID` kicker ships in-product.
