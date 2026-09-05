# Claude Design · 00 — Kapak & Çalışan Prototip (IA + Screen Spec)

**Source of truth (Claude Design export):**
- `design/claude/Dijital Asistan.dc.html` (cover page + working iOS prototype + `text/x-dc` data/logic script)
- `design/claude/ios-frame.jsx` (iOS 26 "Liquid Glass" device frame used to host the prototype)

**Who this is for:** engineers building the Expo (React Native) app and the Next.js web app. You will *not* read the raw source; everything visible in the prototype — layout, copy, interactions, data — is transcribed here. Where the prototype stubs a behaviour with a toast, it is listed under **Dead in prototype** so real behaviour can be wired.

**Related catalogue pages** (separate specs): 01 Tasarım Sistemi · 02 Onboarding · 03 Bugün ve Brifingler · 04 Akış ve Mail · 05 Plan ve Toplantılar · 06 Asistan, Hafıza, Kişiler · 07 Hesap, Gizlilik, Pro · 08 Durumlar, Widget'lar, Etkileşimler · 09 Pazarlama. When the prototype says "Bkz. 04 Akış" etc. in a toast, the full design of that feature lives on that page.

---

## 0. Reading guide & conventions

### 0.1 Token names used in this spec

Colors are referred to by design-token name (raw values only where the prototype uses a colour that is *not* in the token list):

| Token | Value (light) | Where the prototype uses it |
|---|---|---|
| brand/primary | #5B5CE2 | primary buttons, AI kicker text, active tab, mic button, links on hover |
| brand/primary-pressed | #4B4CCB | pressed state of primary buttons (prototype uses scale instead; use this on native) |
| brand/soft | #EDEDFC | secondary "Dinle" button bg, approval icon tile, VIP pill bg, hover of text buttons, planned AI block bg, paywall wash top |
| brand/text-on-soft | #4547C9 | text on brand/soft, text-button colour, pill text, link colour |
| brand/dark-glow | #A9AAF5 | AI kicker on dark cards, toast icon colour, today dot, dashed AI block border |
| critical / critical/soft / critical/text | #E0553F / #FCEDE9 / #C7432F | ACİL & GÜVENLİK badges, conflict icon, "Çıkış Yap", week "hot" bar |
| warning / warning/soft / warning/text | #E09A1C / #FDF2DC / #9A6300 | SON TARİH badge, BEKLİYOR status, "18 dk" countdown pill, "bolt" insight |
| success / success/soft / success/text | #2FA062 / #E4F5EA / #1E7A47 | done hover, Gönderildi check, ONAYLANDI status, "Planlandı" state, EN AVANTAJLI badge, trust icons |
| info / info/soft / info/text | #3B82E6 / #E7F0FD / #2262BE | (tone map `info`, unused by seed data) · directions_car insight icon |
| neutral/bg | #F5F4F0 | screen background of every light screen; sticky-CTA fade target |
| neutral/surface | #FFFFFF | cards, pills, list groups, sheet, input bar |
| neutral/surface-2 | #F0EFEB | icon tiles, neutral badge bg, "Reddet" button bg, chips on Post screen, hover of neutral text buttons |
| neutral/hairline | #E9E7E1 | segmented-control track |
| ink | #1A1917 | primary text, avatar bg, dark CTA, active filter chip, toast bg, today day-cell bg |
| ink/secondary | #6B6860 | secondary text, inactive chips, icon tiles' icon colour |
| ink/tertiary | #9B978E | kickers, meta, timestamps, inactive tab, "Düzenlenebilir" |
| ink/disabled | #B8B4AA | idle check/more icons, chevrons on prep person row, arrow_outward on suggestions |
| editorial/paper | #FBFAF7 | (not used on this page; briefing body uses neutral/bg) |

Raw colours in the prototype that are **not** in the token list (propose adding them to 01 Tasarım Sistemi or map as noted):

| Raw | Proposed name | Use |
|---|---|---|
| rgba(27,25,23,.06) | hairline/row | row dividers inside list groups, accordion divider, bottom-nav top border, chat card rows |
| rgba(27,25,23,.07) | hairline/timeline | timeline row top border in Plan (Gün) |
| rgba(27,25,23,.10) | hairline/radio | unselected plan card border on paywall |
| rgba(27,25,23,.15) | hairline/gap-dashed | dashed border of "gap" block in Plan |
| #E0DED7 | neutral/grabber | sheet grabber, past-day dots in Plan strip |
| #C9C5BC | ink/chevron | chevrons in settings list |
| #F7F7FE | brand/ghost | unplanned AI block background in Plan |
| #FDF6EC | life/cream | "life" event block background in Plan (restaurant) |
| #D9D6F7 / #F3B7AE | chart/indigo-2 / chart/coral-2 | week bar chart top segments |
| #E4E4FA | gradient stop | start colour of the indigo radial washes |
| #F5E1D6 on #7A3E1F | avatar/terracotta | Ahmet Yılmaz avatar |
| #DCE4F5 on #2B3F73 | avatar/slate | Mehmet Yılmaz avatar |
| #25266A | night/ink | play-icon colour on the white play button; mic icon on the white voice disc |
| #ECEAE4 | canvas | cover-page (web) body background only |

### 0.2 Gradients (raw values; map to the named gradient tokens)

| Token (proposed mapping) | Raw value | Used on |
|---|---|---|
| gradient/dawn (top-right anchor) | `radial-gradient(140% 100% at 100% 0%, #E4E4FA 0%, #FFFFFF 58%)` | Bugün briefing hero card |
| gradient/dawn (top-left anchor, "ai-insight" variant) | `radial-gradient(140% 100% at 0% 0%, #E4E4FA 0%, #FFFFFF 60%)` | Takvim Zekâsı card, AI Özeti card, Yeni Taahhüt card |
| gradient/dusk | `linear-gradient(160deg, #1E1E4C 0%, #3B3CA8 58%, #7071EA 100%)` | Sabah Brifingi header |
| gradient/night | `linear-gradient(180deg, #15153A 0%, #25266A 60%, #3B3CA8 100%)` | Sesli Brifing full screen |
| gradient/night (voice variant) | `linear-gradient(180deg, #15153A 0%, #25266A 70%, #3B3CA8 100%)` | Ses Modu overlay |
| paywall wash | `linear-gradient(180deg, brand/soft 0%, neutral/bg 30%)` | Pro paywall screen background |
| sticky-CTA fade | `linear-gradient(180deg, rgba(245,244,240,0) 0%, neutral/bg 45%)` (Person/Asistan bars use 30–40%) | bottom CTA containers |

### 0.3 Shadows (proposed tokens)

| Token | Value |
|---|---|
| shadow/card | `0 1px 2px rgba(27,25,23,.04), 0 6px 20px rgba(27,25,23,.05)` |
| shadow/card-flat | `0 1px 2px rgba(27,25,23,.04)` (stat tiles, suggestion rows) |
| shadow/pill | `0 1px 2px rgba(27,25,23,.06)` (header pills, secondary CTA buttons) |
| shadow/back | `0 1px 2px rgba(27,25,23,.08)` (36px back/close buttons) |
| shadow/hero | `0 1px 2px rgba(27,25,23,.04), 0 12px 32px rgba(91,92,226,.10)` |
| shadow/primary-cta | `0 8px 24px rgba(91,92,226,.28)` |
| shadow/dark-cta | `0 8px 24px rgba(27,25,23,.18)` |
| shadow/dark-card | `0 12px 32px rgba(27,25,23,.18)` |
| shadow/input | `0 1px 2px rgba(27,25,23,.06), 0 8px 24px rgba(27,25,23,.08)` |
| shadow/sheet | `0 -10px 40px rgba(27,25,23,.12)` |
| shadow/toast | `0 10px 30px rgba(27,25,23,.25)` |
| shadow/segment-active | `0 1px 3px rgba(27,25,23,.12)` |
| shadow/play | `0 10px 30px rgba(0,0,0,.25)` |

### 0.4 Typography as used (Geist on web; SF Pro fallback on iOS; Lora for editorial)

Scale tokens: display 34/40 600 · h1 28/34 600 (-0.02em) · h2 22/28 600 (-0.02em) · h3 17/23 600 (-0.01em) · body 15/22 · secondary 14/20 ink/secondary · kicker 12/16 600 +8% caps ink/tertiary · badge 11/14 700 +5% caps · editorial Lora 18/29 · editorial-display Lora 34–38.

Sizes in the prototype that fall outside the scale (map or add):

| Prototype | Suggested token |
|---|---|
| 26/32 600 -0.02em (hero headline, audio title, "Gönderildi", person name) | display-sm |
| 32/38 600 -0.02em (briefing greeting, on dark) | display-md |
| 30/36 600 -0.02em (paywall title) | display-sm+ |
| 24/30 600 -0.02em (prep person name) | h1-sm |
| 19 600 -0.01em (sheet title) | h3-lg |
| 18 600 -0.01em ("Her şey kontrol altında.", commit title) | h3-lg |
| 16/22-23 600 -0.01em (feed title, insight title, stat value, sender name) | h4 |
| 15 600 (event title, buttons) / 15 500 (list row title) | body-strong / body-medium |
| 13 / 13/19 (chips, meta, why/change grid) | caption |
| 12 500/600 (meta, kicker-on-brand +6%) | meta |
| 11 500 (tab label, day label) / 10 600 (seek "15", chip avatar) | micro |
| AI kicker on cards: 12 600 +6% (brand/primary; brand/dark-glow on dark) | kicker/ai |

Icons: Material Symbols Rounded, `opsz 20–48, wght 300–600, FILL 0/1`. FILL 1 is used for: `auto_awesome` in AI kickers/brand mark, `play_arrow` in "Dinle", `star` in VIP pill, `check_circle` success, active tab icon (`'FILL' 1,'wght' 500`).

### 0.5 Layout constants (402×874 iOS frame)

- Tab screens: scroll container padding `70 20 112` (Akış: `70 0 112` with inner 20px gutters). 70 = status-bar clearance, 112 = bottom nav (90) + 22.
- Stacked screens: padding-top `60`; bottom `40` (no sticky bar), `130` (with sticky CTA), `110` (with ask bar).
- Immersive screens (briefing, audio, voice): status bar switches to white glyphs (`dark` prop on the frame).
- Minimum tap target 44px (rule stated on the cover). Body text min 15px.
- Section gap between cards: 18 (Bugün), 14 (Akış, Asistan, Onay), 16 (Plan, Prep, Mail, Profil, Kişi, Pro), 22 (Brifing).

### 0.6 Component vocabulary used below

`hero/briefing` · `card/priority` · `card/feed` · `card/ai-insight` (light radial; dark variant) · `card/life-insight` (icon + title + sub row card) · `list-group` (white rounded group with `list-row`s: 30px icon tile + title + meta) · `stat-tile` · `badge` · `status-badge` · `pill-button` · `text-button` · `segmented-control` · `filter-chip` · `sticky-cta` · `ask-bar` · `bottom-sheet` · `toast` · `back-button` · `avatar` · `trust-line` · `bottom-nav`.

---

## 1. Cover page content (web-only; verbatim copy)

The left column of the page is documentation, not a product screen, but its copy is the product's positioning and rules. It sits at `max-width:1320px; padding:40px 32px 80px; flex-wrap:wrap-reverse; gap:48px` with the phone sticky on the right (`top:24px`).

### 1.1 Masthead
- Brand mark: 36×36, radius 11, bg brand/primary, icon `auto_awesome` 20 FILL 1, white.
- Kicker (13 600 +8% ink/secondary): **"DİJİTAL ASİSTAN · ÜRÜN TASARIMI V1"**
- Headline (40/46 600 -0.025em): **"Bugün bilmen gerekenleri, sen sormadan söyler."**
- Lede (17/26 ink/secondary): **"iOS + Android için proaktif kişisel komuta merkezi. Sağdaki telefon çalışan bir prototip: sekmeler, kartlar, brifing, ses, toplantı hazırlığı, yanıt taslağı ve onay akışı gerçek durumlarla çalışır. Tüm ekran kataloğu aşağıdaki 9 sayfada."**

### 1.2 "VARSAYIMLAR VE KARARLAR" (product rules — treat as requirements)
1. "Ana ekran **Bugün**: “Şimdi neyi bilmeliyim?” sorusunun cevabı. Sohbet ikinci katman (Asistan sekmesi)."
2. "Örnek kullanıcı Yunus; iş ve kişisel hayat tek akışta. Kargo, uçuş, ödeme, abonelik ve güvenlik sinyalleri mail içeriğinden türetilir; ek entegrasyon gerekmez."
3. "AI hiçbir yazma işlemini onaysız yapmaz. Mail gönderme, etkinlik oluşturma/taşıma, hatırlatıcı ve görev ekleme **Onay Merkezi**'nden geçer."
4. "Her AI çıkarımının altında kaynak satırı vardır (Gmail · kişi · saat). Orijinal içerik her zaman bir dokunuş uzakta."
5. "Renk yalnızca anlam taşır: coral = acil, amber = son tarih, yeşil = tamamlandı, mavi = bilgi. Marka indigosu sadece AI işaretleri ve birincil aksiyon için."
6. "Kullanıcı düzeltebilir: her kartın “···” menüsünde *Önemli değil · Daha sık göster · VIP yap · Takip etme*. Her düzeltme “Öğrendim” geri bildirimi verir."
7. "Tipografi: Geist (SF Pro karakterinde; iOS'ta gövde SF Pro'ya düşer) + Lora yalnızca brifing anlatısı ve haftalık özet için. Gövde min. 15px, dokunma alanı min. 44px."
8. "Light mode ana mod. Dark mode temsilî ekranlar 03 ve 05 sayfalarında."

### 1.3 "BİLGİ MİMARİSİ" (4 tiles, bg neutral/bg radius 14 padding 14)
| Tab (icon) | Contents line |
|---|---|
| **Bugün** (`sunny`) | "Brifing hero · Öncelikler · Sabah / öğle / akşam brifingi · Sesli brifing · Toplantı hazırlığı · Mail detayı · AI yanıt" |
| **Akış** (`dynamic_feed`) | "Tüm kaynaklar tek dikkat akışı · Filtreler · Mail zekâsı · Takip · Senden beklenenler · Taahhütler · Yaşam kartları · Evrensel yakalama" |
| **Plan** (`calendar_today`) | "Gün / hafta · Takvim zekâsı · Çakışma çözümü · AI görev blokları · Toplantı sonrası yakalama" |
| **Asistan** (`auto_awesome`) | "Önerilen sorular · Zengin kartlı sohbet · Ses modu · Hafıza araması · Kişi zekâsı" |

Footnote: "Sağ üst avatar → Profil: Onay Merkezi, Ayarlar, Bağlantılar, Gizlilik, Abonelik. Sekme sayısı 4'te sabit; yeni yetenekler yeni sekme değil, ilgili sekmenin içinde bir kart olarak açılır."

### 1.4 "PROTOTİPTE DENE" (the golden paths the prototype supports)
- "**Brifingimi Gör** → tam ekran brifing → **Brifingi Dinle** → sesli oynatıcı (oynat, 15 sn, hız)."
- "Ahmet kartında **Yanıtla** → ton seçimi taslağı değiştirir → **Göndermeyi Onayla** → başarı → kart Bugün'den düşer."
- "Mehmet kartında **Hazırlan** → Toplantı hazırlığı; isme dokun → Kişi zekâsı."
- "**Hatırlat** → akıllı hatırlatıcı sayfası. Kartın onayı → tamamlandı animasyonu. “···” → düzeltme menüsü."
- "Başlıkta **onay** rozeti → Onay Merkezi (onayla / düzenle / reddet). “Takvime Ekle” yeni bir onay üretir."
- "Akış filtreleri, Plan'da Gün/Hafta ve **Planla**, Asistan'da önerilen sorular ve mikrofon → ses modu."

### 1.5 "EKRAN KATALOĞU · 9 SAYFA" (links; row 11px 0 padding, 14px, hairline dividers, `arrow_forward` 18 ink/tertiary)
| Page | Subtitle |
|---|---|
| 01 Tasarım Sistemi | "renk, tipografi, spacing, bileşenler ve tüm durumlar" |
| 02 Onboarding | "giriş, hesap, bağlantılar, izin açıklayıcı, kişiselleştirme, ilk analiz, bildirimler, Android" |
| 03 Bugün ve Brifingler | "Bugün (light/dark), sabah, sesli, öğle, akşam, haftalık özet, paylaşım kartı" |
| 04 Akış ve Mail | "akış, mail zekâsı, mail detayı, AI yanıt, takip, senden beklenenler, taahhütler, yaşam kartları, yakalama, hatırlatıcı" |
| 05 Plan ve Toplantılar | "gün/hafta, takvim zekâsı, çakışma, toplantı hazırlığı (light/dark), toplantı sonrası" |
| 06 Asistan, Hafıza, Kişiler | "asistan, sohbet, ses modu, hafıza araması, VIP kişiler, kişi zekâsı, onay merkezi, AI kişiselleştirme" |
| 07 Hesap, Gizlilik, Pro | "profil, ayarlar, brifing ayarları, gizlilik merkezi, paywall, davet" |
| 08 Durumlar, Widget'lar, Etkileşimler | "boş / hata / yükleme, iOS + Android widget'ları, kilit ekranı, mikro-etkileşim notları" |
| 09 Pazarlama | "6 mağaza ekranı, 3 adet 9:16 reklam" |

### 1.6 Prototype caption (under the phone, 12 ink/secondary)
"Çalışan prototip · iOS 26 çerçevesi · 402×874. Ekran: **{{screenLabel}}**" — `screenLabel` comes from the label map in §2.2.

Prototype props (editable in Claude Design): `userName` (text, default `"Yunus"`), `startScreen` (enum: `today | akis | plan | asistan | briefing | audio | prep | mail | reply | approvals | profile | person | paywall`, default `today`).

---

## 2. Navigation model

### 2.1 State machine
The prototype keeps `{ tab, stack[] }`. The visible screen is `stack[last]` if the stack is non-empty, otherwise `tab`.
- Tapping a bottom-nav tab: `tab = id; stack = []`.
- `push(key)` appends a stacked screen; `back()` pops one (and resets `showOriginal` on the mail screen).
- Bottom nav is rendered **only when the stack is empty** (`showNav = stack.length === 0`). Stacked screens are full-bleed and provide their own back/close button.
- Overlays (sheet, voice, toast) are layered on top of whatever screen is current and do not touch the stack.
- `finishSend` (after a mail is sent) clears the stack entirely → returns to the **Bugün** tab regardless of where reply was opened from.
- Deep link (`startScreen`): `today|akis|plan|asistan` set the tab; every other key sets `tab='today'` and `stack=[key]` (i.e. all detail screens sit on the Bugün tab).

Recommended RN mapping: a bottom-tab navigator (4 tabs) with a **root stack** above it for all detail screens (they hide the tab bar), plus modal presentation for `paywall` (it has a close-X, not a back arrow) and native bottom sheets for `remind` / `correct`. `voice` is a full-screen modal overlay. `briefing`/`audio` are stack screens with `statusBarStyle: light`.

### 2.2 Screen inventory & labels

| key | screenLabel (caption) | Type | Entry points in prototype | Exit |
|---|---|---|---|---|
| `today` | Bugün | tab | default; nav tab; `finishSend`; "Bugün'e Dön" | — |
| `akis` | Akış | tab | nav tab | — |
| `plan` | Plan | tab | nav tab | — |
| `asistan` | Asistan | tab | nav tab | — |
| `briefing` | Sabah Brifingi | stack (immersive header) | Bugün hero "Brifingimi Gör" | back arrow |
| `audio` | Sesli Brifing | stack (immersive, full-bleed) | Bugün hero "Dinle · 2 dk"; Brifing "Brifingi Dinle · 2 dk" | `expand_more` collapse (= back) |
| `prep` | Toplantı Hazırlığı | stack | Bugün p2 title / "Hazırlan"; Akış "Hazırlan" | back |
| `post` | Toplantı Sonrası | stack | Prep "Not Al" | back / "Vazgeç" / "Kaydet" |
| `mail` | Mail Detayı | stack | Bugün p1 title, p3 title; Akış row 1 "Yanıtla" | back |
| `reply` | AI Yanıt Taslağı | stack (2 sub-states) | Bugün p1 "Yanıtla" (ahmet), p4 "Takip Mesajı Hazırla" (mehmet); Mail "Yanıt Hazırla"; Akış "Takip Mesajı Hazırla"; Onay a1 "Düzenle" | back; "Bugün'e Dön" |
| `approvals` | Onay Merkezi | stack | Bugün "{{n}} onay" pill; Profil "Onay Merkezi" row | back |
| `profile` | Profil & Ayarlar | stack | Bugün avatar | back |
| `person` | Kişi Zekâsı | stack | Prep person row; Profil "Önemli Kişiler" | back |
| `paywall` | Pro | stack (modal-style, close X) | Profil "Abonelik" | close / "Free ile devam et" / "Ücretsiz Dene" |
| sheet `remind` | (overlay) | bottom sheet | p1 "Hatırlat"; Mail "Hatırlat"; Akış "Hatırlat" (fatura) | scrim tap / option |
| sheet `correct` | (overlay) | bottom sheet | any card/priority "···" | scrim tap / option |
| `voice` | (overlay) | full-screen modal | Asistan mic; Kişi mic | close X |
| toast | (overlay) | transient | many | auto 2.6 s |

### 2.3 Device frame & system chrome (`ios-frame.jsx`)
This is scaffolding, not product UI, but it fixes the canvas the screens were designed on:
- `IOSDevice`: 402×874, radius 48, bg #F2F2F7 (light) / #000 (dark), shadow `0 40px 80px rgba(0,0,0,.18), 0 0 0 1px rgba(0,0,0,.12)`.
- Dynamic Island: 126×37, radius 24, top 11, centred.
- Status bar: absolute top; padding `21 24 19`; time "9:41" 17/22 wght 590; signal/wifi/battery glyphs; glyph colour #000 or #fff when `dark`.
- Home indicator: 139×5, radius 100, bottom padding 8, `rgba(0,0,0,.25)` / `rgba(255,255,255,.7)`; always on top (z 60), pointer-events none. Reserve **34px** bottom safe area.
- Other exports (`IOSNavBar`, `IOSGlassPill` 44px blur pill, `IOSList`/`IOSListRow` 52px rows radius 26, `IOSKeyboard`) are **not** used by the prototype — the product draws its own headers and lists.

### 2.4 Bottom nav (`bottom-nav`)
- Absolute bottom, height 90, padding `8 8 28`, bg `rgba(255,255,255,.9)` + `backdrop-filter: blur(20px)`, top border 1px hairline/row, z 5.
- 4 equal-width buttons: column, gap 3, icon 26px, label 11/500.
- Active: colour brand/primary, icon `'FILL' 1,'wght' 500`. Inactive: ink/tertiary, `'FILL' 0,'wght' 400`. Colour transition .15s.
- Tabs (id · label · icon): `today` · **Bugün** · `sunny` — `akis` · **Akış** · `dynamic_feed` — `plan` · **Plan** · `calendar_today` — `asistan` · **Asistan** · `auto_awesome`.
- Dark mode (from token set): bg surface #1F1E1B at .9, active primary #8586F2, inactive tertiary #7A776F.

---

## 3. Shared components (measured from the prototype)

### 3.1 Tab-screen header
Row `align-items:flex-end / center; justify-content:space-between`. Title h1 28/34 600 -0.02em. Right side holds 34–40px pills/avatar (gap 8).

### 3.2 `back-button` / stack header
36×36 circle, bg neutral/surface, colour ink, icon `arrow_back` 20 (or `close` 20 on paywall; `expand_more` on audio), shadow/back. Header row is `space-between` with a 36px spacer on the right when there is no trailing element, and often a centred kicker (12 600 +8% ink/tertiary) between them. On dark/immersive screens the button is `rgba(255,255,255,.14–.16)` bg, white icon.

### 3.3 `badge` (tone badge) and `status-badge`
11/700 +5% caps, padding `3 8` (Mail header badge `4 9`), radius 999. Tone map (`bg / fg`):

| tone | bg | fg | Labels seen |
|---|---|---|---|
| critical | critical/soft | critical/text | ACİL, GÜVENLİK |
| warning | warning/soft | warning/text | SON TARİH, BEKLİYOR |
| neutral | neutral/surface-2 | ink/secondary | TOPLANTI, TAKİP, KİŞİSEL, BUGÜN, KARGO, UÇUŞ, ÖDEME, ABONELİK, REZERVASYON, REDDEDİLDİ |
| info | info/soft | info/text | (reserved) |
| success | success/soft | success/text | ONAYLANDI, EN AVANTAJLI |
| primary | brand/soft | brand/text-on-soft | PRO, VIP |

### 3.4 `kicker` section header
12 600 +8% caps ink/tertiary, padding `0 4 8` above a list-group (or `4 4 0` with a right-aligned count in 12 ink/tertiary on Bugün).

### 3.5 `list-group` + `list-row`
Group: bg neutral/surface, radius 18, padding `4 16`, shadow/card. Row: flex, gap 12, padding `11 0`, `border-top: 1px hairline/row` on every row except the first. Icon tile 30×30 radius 10 bg neutral/surface-2, icon 17 ink/secondary. Title 15/20 500 -0.01em (briefing) or 15/21 400 (prep/person, `align-items:flex-start`), meta 12 ink/tertiary margin-top 1–2. Rows in the prototype are **not tappable** anywhere (see §9).

### 3.6 `card/priority` (Bugün)
- Container: bg surface, radius 20, padding `14 16 10`, shadow/card. Removal: opacity→0 and `scale(.96) translateY(-6px)` over .3s, node removed after 330 ms.
- Row 1: left = `badge` + time (12 ink/tertiary), gap 8. Right (margin-right −8): **done** 36×36 circle transparent, icon `check_circle` 22 ink/disabled, hover/press → colour success, bg success/soft, tooltip "Tamamlandı"; **more** 36×36, icon `more_horiz` 22 ink/disabled, hover → bg surface-2, colour ink/secondary.
- Title: margin-top 6, h3 17/23 600 -0.01em, `text-wrap:pretty`, tappable when the item has a `go` target.
- Sub (optional): margin-top 4, 14/20 ink/secondary.
- Source line: margin-top 10, gap 6, 12 ink/tertiary, leading icon 16 (`mail`, `event`, `schedule_send`, `package_2`).
- Actions: margin-top 6, gap 2, margin-left −10. `a1` text-button h36 padding `0 10` radius 10, 600 14 brand/text-on-soft, hover bg brand/soft. `a2` (optional) same but ink/secondary, hover bg surface-2.

### 3.7 `card/feed` (Akış)
bg surface, radius 20, padding `14 16 10`, shadow/card. Row 1 gap 8: icon tile 28×28 radius 9 bg surface-2 icon 17 ink/secondary · source text (flex, 12 ink/tertiary, single-line ellipsis) · `badge` · time (12 ink/tertiary). Title margin-top 10 16/22 600 -0.01em. Summary margin-top 4 14/20 ink/secondary. One text-button action (margin-top 6, margin-left −10, h36, brand/text-on-soft).

### 3.8 `card/ai-insight`
Light: bg gradient/dawn (top-left variant), radius 20, padding 16, shadow/card. Kicker row: brand/primary 12 600 +6% with `auto_awesome` 16 FILL 1. Title 16/23 600 (Plan) or 17/24 500 (Mail) or 18 600 (Post). Sub 14/20 ink/secondary.
Dark (Prep "KONUŞMAN GEREKEN 3 ŞEY"): bg ink, white text, radius 24, padding 20, shadow/dark-card, kicker brand/dark-glow.

### 3.9 `sticky-cta`
Absolute bottom, padding `16 20 44` (Person ask-bar: `12 16 44`), bg sticky-CTA fade. Buttons h52 radius 16 600 15: primary (brand/primary + shadow/primary-cta) or dark (ink + shadow/dark-cta); secondary h52 padding `0 18` bg surface ink shadow/pill.

### 3.10 `segmented-control`
Track bg neutral/hairline, radius 999, padding 3. Items h30 (Plan) / h32 (tones), padding `0 14` or `flex:1`, radius 999, 600 13. Active: bg surface, ink, shadow/segment-active. Inactive: transparent, ink/secondary. bg transition .15s.

### 3.11 `filter-chip`
h34, padding `0 14`, radius 999, 600 13. Active: bg ink, white. Inactive: bg surface, ink/secondary. Horizontal scroll row, gap 8, hidden scrollbar.

### 3.12 `avatar`
Circle, initials 600. Sizes: 22 (recipient chip, 10px text), 40 (header, ink/white), 44 (mail sender, 15px), 56 (prep, 20px), 60 (profile, 22px), 76 (person, 26px). Palettes: user = ink/white; Ahmet = avatar/terracotta; Mehmet = avatar/slate.

### 3.13 `ask-bar`
h52, radius 999, bg surface, padding `0 6 0 16`, shadow/input. Text input 15/400 ink with placeholder; trailing 40×40 circle brand/primary white `mic` 20 → opens voice overlay. Placed in a gradient-faded bottom container (`padding 8 16 112` on Asistan; `12 16 44` on Person).

### 3.14 `toast`
Absolute left/right 16, bottom 104, z 40, centred, pointer-events none. Pill bg ink white radius 999 padding `12 18 12 14`, 14/500, gap 8, icon 18 brand/dark-glow, shadow/toast. Enter: translateY 16→0 + opacity 0→1 over .3s `cubic-bezier(.2,.8,.2,1)`; visible 2600 ms; exit 320 ms. A new toast replaces the current one immediately.

### 3.15 `bottom-sheet`
Scrim: absolute inset, bg `rgba(27,25,23,.35)` (animated from 0 over .25s), tap → close. Panel: absolute bottom, bg surface, radius `28 28 0 0`, padding `10 20 44`, shadow/sheet, translateY 100%→0 over .3s `cubic-bezier(.2,.8,.2,1)`; close reverses then unmounts after 300 ms. Grabber 36×5 radius 3 neutral/grabber, margin `0 auto 14`. Title 19 600 -0.01em; sub margin-top 2, 13 ink/secondary. Option rows (margin-top 12): min-height 52, gap 12, `border-top` hairline/row, icon 20 (width 24), title 15/500 ink (flex), meta 12 (ink/tertiary 400; AI option brand/text-on-soft 600).

### 3.16 `trust-line`
Row gap 8, padding `0 4` / `8 4`, 13 (or 13/19) ink/secondary, leading `verified_user` 18 success/text. Copy variants: "Sen onaylamadan hiçbir mail gönderilmez." (reply) · "Önemli işlemler sen onaylamadan gerçekleştirilmez." (approvals).

---

## 4. Screens

Each screen section follows the same order: **Purpose & placement → Layout (top→bottom) → Copy (verbatim, with proposed i18n key) → Interactions → States → Motion → Data fields → Dead in prototype.**

---

### 4.1 `today` — Bugün (tab 1, default)

**Purpose.** The answer to "Şimdi neyi bilmeliyim?" — the daily briefing hero plus a ranked list of priorities (`card/priority`). Chat is intentionally a second layer (Asistan tab).

**Layout (padding 70 20 112, column gap 18):**
1. **Header row** (`align-items:flex-end`):
   - Left: kicker date "5 EYLÜL CUMARTESİ"; h1 margin-top 4 "Günaydın, {{name}}".
   - Right (gap 8): *(only if pending approvals > 0)* `pill-button` h34 padding `0 12 0 9`, radius 999, bg surface, brand/text-on-soft 600 12, icon `task_alt` 18, label "{{pendingCount}} onay", shadow/pill → push `approvals`. Then `avatar` 40 (ink bg, white 600 15 initial) → push `profile`.
2. **`hero/briefing`**: bg gradient/dawn (top-right), radius 28, padding `22 22 20`, shadow/hero.
   - Kicker/ai row: `auto_awesome` 16 FILL 1 + "BRİFİNG HAZIR · 07:58" (brand/primary 12 600 +6%).
   - Headline margin-top 10, 26/32 600 -0.02em: "Bugün bilmen gereken **{{count}}** şey var." — the number is coloured brand/primary. `count = prios.length` (live; starts at 5 and decreases as cards are completed).
   - Sub margin-top 8, 14/20 ink/secondary: "3 önemli mail · 4 etkinlik · 2 takip" (static in prototype; should be computed).
   - Button row margin-top 18 gap 10: primary `flex:1` h48 radius 14 bg brand/primary white 600 15 "Brifingimi Gör" (press: scale .97, .12s) → push `briefing`; secondary h48 padding `0 16 0 12` radius 14 bg brand/soft brand/text-on-soft 600 14, icon `play_arrow` 20 FILL 1, "Dinle · 2 dk" → push `audio`.
3. **Section header** (padding `4 4 0`, baseline): kicker "ÖNCELİKLERİN" · right "{{count}} konu" (12 ink/tertiary).
4. **`card/priority` × N** (see §3.6 for anatomy). Seed = `PRIOS` (§5.1), 5 cards.
5. **All-done state** (rendered when the list is empty): centred, padding `36 20`, gap 10 — 56px circle bg success/soft, icon `done_all` 30 success/text; title 18 600 "Her şey kontrol altında."; body 14/20 ink/secondary "Yeni bir şey olursa haber veririm. Öğle brifingi 13:00'te."

**Copy (proposed keys):**
| Key | String |
|---|---|
| today.date_kicker | "5 EYLÜL CUMARTESİ" (format: `D MMMM dddd` upper-case, Turkish locale) |
| today.greeting | "Günaydın, {{name}}" (morning variant; see 03 for öğle/akşam variants) |
| today.approvals_pill | "{{pendingCount}} onay" |
| today.hero.kicker | "BRİFİNG HAZIR · {{time}}" (prototype: "07:58") |
| today.hero.headline | "Bugün bilmen gereken {{count}} şey var." |
| today.hero.sub | "{{mails}} önemli mail · {{events}} etkinlik · {{followups}} takip" (prototype: "3 önemli mail · 4 etkinlik · 2 takip") |
| today.hero.cta_primary | "Brifingimi Gör" |
| today.hero.cta_listen | "Dinle · {{minutes}} dk" (prototype: "Dinle · 2 dk") |
| today.section.priorities | "ÖNCELİKLERİN" |
| today.section.count | "{{count}} konu" |
| today.card.done_tooltip | "Tamamlandı" |
| today.empty.title | "Her şey kontrol altında." |
| today.empty.body | "Yeni bir şey olursa haber veririm. Öğle brifingi 13:00'te." |
| toast.done | "Tamamlandı · Bir sonraki konu yukarı taşındı" |
| toast.remind_tomorrow | "Yarın 09:00'da hatırlatırım" |
| toast.cargo_tracking | "Kargo takibi açıldı · Teslimatta haber veririm" |
| toast.added_to_approvals | "Onay Merkezi'ne eklendi" |

Badge labels on this screen: "ACİL", "TOPLANTI", "SON TARİH", "TAKİP", "KİŞİSEL". Action labels: "Yanıtla", "Hatırlat", "Hazırlan", "Takvime Ekle", "Takip Mesajı Hazırla", "Yarın Hatırlat", "Takip Et".

**Interactions (per seed card; `act(p, i)` in the prototype):**
| Card | Title tap | a1 | a2 | ✓ done | ··· |
|---|---|---|---|---|---|
| p1 Ahmet (ACİL) | push `mail` | "Yanıtla" → `reply` (mode ahmet, tone reset not applied — keeps last tone) | "Hatırlat" → sheet `remind` (sub = card title) | remove + toast.done | sheet `correct` |
| p2 Mehmet (TOPLANTI) | push `prep` | "Hazırlan" → push `prep` | — | same | same |
| p3 Başvuru (SON TARİH) | push `mail` (prototype shows Ahmet's mail — wire to the real Girişim Programı mail) | "Takvime Ekle" → creates approval {type "ETKİNLİK OLUŞTUR", what "“Başvuru son saati” · Bugün 17:00", why "Mailde son tarih tespit edildi.", change "Takvime 1 etkinlik · 30 dk önce hatırlatma"} prepended to Onay Merkezi + toast "Onay Merkezi'ne eklendi" (`task_alt`) | — | same | same |
| p4 Takip (TAKİP) | (none — no `go`) | "Takip Mesajı Hazırla" → `reply` (mode mehmet) | "Yarın Hatırlat" → toast "Yarın 09:00'da hatırlatırım" (`notifications`) | same | same |
| p5 Kargo (KİŞİSEL) | (none) | "Takip Et" → toast "Kargo takibi açıldı · Teslimatta haber veririm" (`package_2`) | — | same | same |

- Sending a reply and tapping "Bugün'e Dön" removes p1 (ahmet) or p4 (mehmet) from the list and toasts "Mail gönderildi · Ahmet Yılmaz" / "Mail gönderildi · Mehmet Yılmaz" (`send`).
- The "{{n}} onay" pill is hidden when the pending count is 0.

**States.** Default (5 cards) · partially completed (count updates in hero and section) · all-done empty state · pending pill hidden/shown. No loading/skeleton, error, offline or permission state on this page (see 08). Dark mode: not shown here (03 has "Bugün · Dark"); use dark tokens — bg #141311, cards #1F1E1B, text #F2F0EB, hero gradient replaced by a #1F1E1B card with primary-glow #A9AAF5 kicker.

**Motion.** Card completion: opacity/transform .3s ease, then collapse. Primary button press scale .97 (.12s). Toast per §3.14. Recommend `Haptics.notificationAsync(Success)` on done and `selectionAsync` on "···" (not specified in this file; 08 carries micro-interaction notes).

**Data fields (`PriorityItem`):** `id`, `badge` (label), `tone` (critical|warning|neutral|info|success|primary), `time` (short string: "08:42", "3 gün", "Bugün"), `title`, `sub?`, `srcIcon` (mail|event|schedule_send|package_2…), `source` ("Provider · Person/Topic · When"), `a1` (primary action label + intent), `a2?`, `go?` (detail route), `removing` (UI).

**Dead in prototype.** "Takip Et" (kargo) and "Yarın Hatırlat" only toast; p3 title opens the generic Ahmet mail screen; hero sub-line counts are hard-coded; the "···" corrections do not re-rank the list.

---

### 4.2 `akis` — Akış (tab 2)

**Purpose.** All sources in one attention feed (mail, calendar, follow-ups, life signals derived from mail) with filters and a universal capture entry point.

**Layout (padding 70 0 112, gap 14):**
1. Header (padding `0 20`): h1 "Akış" · right `pill-button` h36 padding `0 12 0 8` radius 999 bg surface brand/text-on-soft 600 12 icon `add_a_photo` 18 "Ekle" shadow/pill.
2. Filter row: horizontal scroll, gap 8, padding `0 20 4`, `filter-chip`s from `FILTERS`: "Tümü" (default), "Önemli", "Mail", "Takvim", "Takip", "Kişisel".
3. Summary line (padding `0 20`, 13 ink/secondary): "{{n}} konu · {{m}} önemli" (initial: "10 konu · 5 önemli").
4. `card/feed` list (padding `0 20`, gap 12). Seed = `FEED` (§5.2), 10 items.

**Filter logic.** `Tümü` → all; `Önemli` → `imp === 1`; otherwise `cat === label` (cat ∈ Mail | Takvim | Takip | Kişisel). Summary recomputes.

**Copy:**
| Key | String |
|---|---|
| akis.title | "Akış" |
| akis.add | "Ekle" |
| akis.filter.all / important / mail / calendar / followup / personal | "Tümü" / "Önemli" / "Mail" / "Takvim" / "Takip" / "Kişisel" |
| akis.summary | "{{count}} konu · {{important}} önemli" |
| toast.capture | "Ekran görüntüsü, PDF veya link ekle · Bkz. 04 Akış" |
| toast.source_opened | "{{action}} · Kaynak açıldı" |

Badge labels: ACİL, BUGÜN, TAKİP, SON TARİH, GÜVENLİK, KARGO, UÇUŞ, ÖDEME, ABONELİK, REZERVASYON. Actions: "Yanıtla", "Hazırlan", "Takip Mesajı Hazırla", "Takvime Ekle", "Kontrol Et", "Takip Et", "Check-in", "Hatırlat", "İncele", "Teyit Et".

**Interactions (`feedAct`):** `go:'mail'` → push mail · `go:'prep'` → push prep · `go:'followup'` → reply (mehmet) · `go:'cal'` → create approval "ETKİNLİK OLUŞTUR / “Başvuru son saati” · Bugün 17:00" + toast · `go:'remind'` → sheet remind (sub = feed title) · otherwise toast "{{action}} · Kaynak açıldı" (`open_in_new`). Card body/title is **not** tappable. "Ekle" → toast.capture.

**States.** Filtered lists (a filter with zero results shows summary "0 konu · 0 önemli" and no cards — design an empty state; not in prototype). No loading/error here (08).

**Data fields (`FeedItem`):** `cat` (Mail|Takvim|Takip|Kişisel), `imp` (0|1), `icon`, `src` ("Provider · Sender"), `time`, `title`, `sum`, `action` (label + intent), `tone`, `badge`, `go?`, plus the derived life-card fields (amount, delivery window, flight no., renewal date, reservation party size) that appear inside `sum`.

**Dead in prototype.** "Ekle" (universal capture: screenshot/PDF/link — see 04); actions "Kontrol Et", "Takip Et", "Check-in", "İncele", "Teyit Et" (should deep-link to source/provider); feed card body tap; pull-to-refresh.

---

### 4.3 `plan` — Plan (tab 3)

**Purpose.** Day/week calendar with calendar intelligence (gap detection, AI task blocks, conflicts, travel-time warnings).

**Layout (padding 70 20 112, gap 16):**
1. Header: h1 "Plan" · `segmented-control` "Gün" | "Hafta" (default Gün).
2. **Day strip**: 7 cells `space-between`, each 42×60 radius 14, column gap 2: day label 11/500 opacity .8, number 17/600, dot 4×4 radius 2. Data: Pzt 1 · Sal 2 · Çar 3 · Per 4 · **Cum 5 (today: bg ink, white, dot brand/dark-glow)** · Cmt 6 (dot brand/primary) · Paz 7 (dot transparent); days before today: bg surface, ink, dot neutral/grabber. Cells are not interactive in the prototype.
3. **`card/ai-insight` "TAKVİM ZEKÂSI"**: title "Yarın 14:00–16:30 arasında 2,5 saat boşluğun var." · sub "Teklif hazırlama görevini buraya yerleştirebilirim." · buttons margin-top 12 gap 8: **Planla** h40 padding `0 16` radius 12 bg brand/primary white 600 14 icon `event_available` 18; **Başka zaman** h40 padding `0 14` transparent ink/secondary 600 14.
4. **Gün view — timeline** (column): each row `min-height 68`, gap 12. Time gutter 44px, 12/500 ink/tertiary, padding-top 8, right-aligned. Content column padding `4 0`, `border-top 1px hairline/timeline`. Event block radius 14 padding `10 14`, column gap 2; title row 15 600 -0.01em with leading icon 16; meta 12.

   Block styles by `type`:
   | type | bg | border | title colour | icon colour | meta colour |
   |---|---|---|---|---|---|
   | event | surface | 1px solid hairline/row | ink | ink/secondary | ink/tertiary |
   | gap | transparent | 1px dashed hairline/gap-dashed | ink/tertiary | ink/disabled | ink/tertiary |
   | ai (unplanned) | brand/ghost #F7F7FE | 1px dashed brand/dark-glow | ink | brand/primary | brand/text-on-soft |
   | ai (planned) | brand/soft | 1px solid brand/primary | ink | brand/primary | brand/text-on-soft |
   | life | life/cream #FDF6EC | 1px solid hairline/row | ink | ink/secondary | ink/tertiary |

   Rows = `DAY` (§5.9).
5. **Hafta view**:
   - Density card: bg surface radius 20 padding 16 shadow/card. Kicker "7–13 EYLÜL · YOĞUNLUK". Bar area margin-top 14, height 120, 7 columns gap 8 aligned bottom; each column stacks 2 bars (gap 3, radius 5) with heights from `WEEK`. Colours: default column top #D9D6F7 / bottom brand/soft; **today** (Cmt) top brand/primary / bottom brand/dark-glow; **hot** (Çar) top #F3B7AE / bottom critical. Day labels margin-top 8, 11/600: today brand/primary, hot critical/text, else ink/secondary.
   - Three `card/life-insight` rows (bg surface radius 16 padding `14 16` shadow/card, gap 12, icon 20 top-aligned, title 15 600, sub 13/19 ink/secondary):
     1. `bolt` warning/text — "Yarın oldukça yoğun." / "09:00 ve 10:00 toplantıların arka arkaya. Arada mola yok."
     2. `directions_car` info/text — "13:30 doktor randevusu için 12:50'de çıkman gerekebilir." / "Kadıköy → Nişantaşı · 38 dk trafik tahmini"
     3. `error` critical/text — "Çarşamba 14:00 müşteri toplantısı ile 14:30 doktor çakışıyor." + text-button h34 "Seçenekleri Gör".

**Copy:**
| Key | String |
|---|---|
| plan.title | "Plan" |
| plan.segment.day / week | "Gün" / "Hafta" |
| plan.days | "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz" |
| plan.ai.kicker | "TAKVİM ZEKÂSI" |
| plan.ai.gap_title | "Yarın 14:00–16:30 arasında 2,5 saat boşluğun var." |
| plan.ai.gap_sub | "Teklif hazırlama görevini buraya yerleştirebilirim." |
| plan.ai.cta_plan / planned | "Planla" / "Planlandı" |
| plan.ai.cta_later | "Başka zaman" |
| plan.week.kicker | "7–13 EYLÜL · YOĞUNLUK" |
| plan.week.busy_title / sub | "Yarın oldukça yoğun." / "09:00 ve 10:00 toplantıların arka arkaya. Arada mola yok." |
| plan.week.travel_title / sub | "13:30 doktor randevusu için 12:50'de çıkman gerekebilir." / "Kadıköy → Nişantaşı · 38 dk trafik tahmini" |
| plan.week.conflict_title | "Çarşamba 14:00 müşteri toplantısı ile 14:30 doktor çakışıyor." |
| plan.week.conflict_cta | "Seçenekleri Gör" |
| toast.planned | "Planlandı · Yarın 14:00–16:30 Teklif hazırlama" |
| toast.plan_later | "Tamam, başka bir boşluk önereceğim" |
| toast.conflict_options | "Çözüm seçenekleri · Bkz. 05 Plan" |

Timeline copy (from `DAY`): "Haftalık ekip" / "60 dk · Ofis"; "Ürün gözden geçirme" / "30 dk · Online"; "2 saat boşluk" / "Öğle yemeği ve odaklanma için uygun"; "Mehmet ile müşteri toplantısı" / "60 dk · Ofis · Hazırlık hazır"; "Ürün gözden geçirme" / "30 dk · Online"; "Başvuru son saati" / "Girişim programı · AI tespit etti"; "Akşam yemeği · Karaköy" / "Rezervasyon · 4 kişi".

**Interactions.** Segmented control toggles Gün/Hafta. **Planla** (one-shot): `planned=true` → button becomes bg success/soft, success/text, icon `check`, label "Planlandı" (bg transition .2s) + toast.planned (`event_available`); also flips every `type:'ai'` block to the planned style (prototype quirk — the 17:00 block is unrelated to tomorrow's slot; in production only the created block should change). **Başka zaman** → toast.plan_later (`schedule`). **Seçenekleri Gör** → toast.conflict_options (`event_repeat`).

**States.** Gün / Hafta; AI block unplanned/planned; today highlighted; hot day highlighted. Dark mode of Plan is not in this file (05 has Toplantı Hazırlığı dark).

**Data fields.** `DayEvent {time, title, meta, icon, type: event|gap|ai|life, durationMin, location, isOnline, prepReady, aiDetected}` · `WeekDay {label, bars:[meetingsHeight, tasksHeight], hot, today}` · `CalendarInsight {kind: gap|busy|travel|conflict, title, sub, cta?, proposedSlot{start,end}, task}`.

**Dead in prototype.** Day-strip cells; timeline blocks (no event detail); "Seçenekleri Gör" (conflict resolution — see 05); "Başka zaman" (should re-propose a slot); Planla cannot be undone; week bars not tappable.

---

### 4.4 `asistan` — Asistan (tab 4)

**Purpose.** Chat layer over the user's digital life with suggested questions, rich-card answers, voice mode and memory search.

**Layout.** Two regions: scroll area (padding `70 20 24`, gap 14) and a bottom `ask-bar` container (padding `8 16 112`, bg fade `rgba(245,244,240,0) → neutral/bg 30%`).
1. Header: h1 "Asistan" · right `pill-button` h36 padding `0 12 0 8` radius 999 bg surface **ink/secondary** 600 12 icon `search` 18 "Hafıza" shadow/pill.
2. **Empty state (chat empty)**:
   - Intro card: row gap 10, bg surface radius 16 padding `12 14` shadow/card; 34px circle bg brand/soft icon `auto_awesome` 18 FILL 1 brand/primary; text 14/20 ink: "Bugün **46 mail**, **4 etkinlik** ve **2 takip** analiz edildi. Ne öğrenmek istersin?" (numbers bold).
   - Kicker "ÖNERİLEN" (padding `6 4 0`).
   - Suggestion buttons (gap 8): h52 padding `0 16` radius 16 bg surface ink 500 15, `space-between`, trailing `arrow_outward` 18 ink/disabled, shadow/card-flat, hover bg brand/soft. Five questions = keys of `QA` (§5.8).
3. **Chat messages** (once any message exists the intro + suggestions disappear): each message is a column aligned `flex-end` (user) / `flex-start` (ai), gap 8. Bubble max-width 86%, padding `10 14`, radius 18, 15/21. User: bg brand/primary, white, no shadow. AI: bg surface, ink, shadow/card. AI messages may carry a **rich card** (width 100%, bg surface, radius 16, padding `12 14`, shadow/card): kicker 12 600 +6% ink/tertiary (`cardTitle`) + rows (margin-top 8; each row gap 10, padding `8 0`, border-top hairline/row, 14px; icon 18 brand/primary; text flex; meta 12 ink/tertiary).
4. **Typing indicator**: three 7×7 dots ink/tertiary, gap 4, padding `8 14`, aligned start; each animates `dabar` (scaleY .25→1) .8s alternate with 0/.15/.3s delays.
5. **`ask-bar`**: placeholder "Dijital hayatına sor…"; mic → voice overlay.

**Copy:**
| Key | String |
|---|---|
| asistan.title | "Asistan" |
| asistan.memory | "Hafıza" |
| asistan.intro | "Bugün {{mails}} mail, {{events}} etkinlik ve {{followups}} takip analiz edildi. Ne öğrenmek istersin?" (prototype: 46 / 4 / 2) |
| asistan.section.suggested | "ÖNERİLEN" |
| asistan.input.placeholder | "Dijital hayatına sor…" |
| toast.memory | "Hafıza araması · Bkz. 06 Asistan" |

Suggested questions (order): "Bugün neye odaklanmalıyım?" · "Kimlere cevap vermem gerekiyor?" · "Yarın yoğun muyum?" · "Bu hafta hangi deadline'lar var?" · "Mehmet ile en son ne konuştuk?" — answers and cards in §5.8.

**Interactions.** Suggestion tap → append user bubble, show typing for 1000 ms, append AI bubble + card. "Hafıza" → toast.memory. Mic → `voice` overlay (text "Dinliyorum…"). Text input has **no submit handler** in the prototype.

**States.** Empty (intro + suggestions) · conversation · typing. Error/offline: not shown (08).

**Data fields.** `ChatMessage {role: user|ai, text, card?: {title, rows:[{icon, text, meta}]}, sources?}`; `Suggestion {text, intent}`.

**Dead in prototype.** Free-text questions; "Hafıza" search; message long-press/copy; rich-card rows not tappable; no scroll-to-bottom on new message.

---

### 4.5 `briefing` — Sabah Brifingi (stack, immersive header)

**Purpose.** Full-screen narrative briefing (Lora editorial paragraph) followed by grouped lists; entry to the audio player.

**Layout.** Scroll container bg neutral/bg.
1. **Header** bg gradient/dusk, padding `96 20 60`, white. Back button absolute top 60 left 16 (36 circle, `rgba(255,255,255,.16)`, `arrow_back` 20). Kicker "SABAH BRİFİNGİ · 5 EYLÜL" (12 600 +8%, opacity .72). Greeting margin-top 8, 32/38 600 -0.02em "Günaydın {{name}}" (no comma here). Sub margin-top 6, 16/22 `rgba(255,255,255,.8)` "Bugün oldukça sakin bir günün var."
2. **Body sheet** margin-top −28, bg neutral/bg, radius `28 28 0 0`, padding `26 20 130`, gap 22.
   - Editorial paragraph (Lora 18/29 ink): "Öğlene kadar toplantın bulunmuyor. Saat 14:30'da Mehmet ile müşteri toplantın var. Toplantı öncesinde dün gelen fiyat teklifine bakman faydalı olabilir. Gelen 46 mail arasında 3 konu dikkat gerektiriyor."
   - Six `kicker + list-group` sections from `BRIEF` (§5.5): "BUGÜNÜN ÖNCELİKLERİ", "PROGRAMIN", "SENDEN CEVAP BEKLEYENLER", "SENİN CEVAP BEKLEDİKLERİN", "SON TARİHLER", "KİŞİSEL GELİŞMELER". Row title 15/20 500.
3. **`sticky-cta`**: dark button (ink, white, h52 radius 16, icon `headphones` 20, shadow/dark-cta) "Brifingi Dinle · 2 dk" → push `audio`.

**Copy:**
| Key | String |
|---|---|
| briefing.kicker | "SABAH BRİFİNGİ · {{date}}" ("5 EYLÜL") |
| briefing.greeting | "Günaydın {{name}}" |
| briefing.mood | "Bugün oldukça sakin bir günün var." |
| briefing.narrative | (paragraph above; AI-generated) |
| briefing.section.* | see section titles above |
| briefing.cta_listen | "Brifingi Dinle · {{minutes}} dk" |

**States.** Immersive status bar (white). Dark mode: the header is already dark; body would use dark bg #141311 with surface #1F1E1B groups. Loading/streaming of the narrative: not shown (08).

**Data fields.** `Briefing {kind: morning|noon|evening, date, greeting, mood, narrative, sections:[{title, rows:[{icon, title, meta}]}], audio:{durationSec, chapters}}`.

**Dead in prototype.** Every list row (should open mail/event/person); no share card (03 has "paylaşım kartı"); no swipe-down to dismiss.

---

### 4.6 `audio` — Sesli Brifing (stack, full-bleed dark)

**Purpose.** Audio player for the briefing with chapters, ±15 s seek, and playback speed.

**Layout.** Full screen bg gradient/night, white, padding `60 20 48`, column.
1. Top row: collapse button 36 circle `rgba(255,255,255,.14)` icon `expand_more` 20 → back · kicker "SESLİ BRİFİNG" (opacity .7) · speed pill h32 padding `0 12` radius 999 bg `rgba(255,255,255,.14)` 600 13 showing "1.0x" | "1.25x" | "1.5x".
2. Title block margin-top 44, centred: "Sabah Brifingi" 26/32 600 -0.02em; sub margin-top 6, 14 `rgba(255,255,255,.7)`: "5 Eylül · 2 dk 14 sn · {{chapterName}}".
3. **Waveform** margin-top 40: 34 bars, width 4, radius 2, gap 5, container height 72. Bar i height = `14 + ((i*13)%7)*8` px; colour white when `i/34 < pos/134`, else `rgba(255,255,255,.35)`. Each bar animates `dabar` (scaleY .25→1) with duration `0.7 + ((i*7)%5)*0.12`s, delay `i*0.06`s, ease-in-out infinite alternate; paused when not playing.
4. Progress margin-top 28: track 4px radius 2 `rgba(255,255,255,.18)`; fill white width `pos/134`, transition width .5s linear. Labels margin-top 8, 12 `rgba(255,255,255,.7)`: elapsed `m:ss` (left) · "2:14" (right).
5. Controls margin-top 24, centred, gap 28: seek-back 52 circle transparent (`replay` 30 + "15" 10/600 margin-top −6) · play/pause 76 circle bg white, icon 40 FILL 1 colour night/ink #25266A (`play_arrow` / `pause`), shadow/play, press scale .95 · seek-forward (same as back but icon mirrored `scaleX(-1)`).
6. Chapters margin-top 36: buttons gap 12, padding `11 4`, `border-top 1px rgba(255,255,255,.1)`, 500 14 white, left-aligned: index (22px wide, 12 `rgba(255,255,255,.6)`, "01"…"06") · title (flex) · duration (12 `rgba(255,255,255,.6)`). Active chapter opacity 1, others .55.

**Copy:**
| Key | String |
|---|---|
| audio.kicker | "SESLİ BRİFİNG" |
| audio.title | "Sabah Brifingi" |
| audio.meta | "{{date}} · {{m}} dk {{s}} sn · {{chapter}}" ("5 Eylül · 2 dk 14 sn · …") |
| audio.total | "2:14" |
| audio.speed | "1.0x", "1.25x", "1.5x" |
| audio.seek_label | "15" |
| audio.chapters | see §5.6 |

**Interactions.** Play toggles a 1 s tick; at `pos ≥ 134` playback stops and resets to 0. Seek ±15 s clamped [0,134]. Speed pill cycles 1.0x → 1.25x → 1.5x → 1.0x (label only in prototype). Chapter tap sets `pos` to chapter start; chapter starts (s): `[0, 18, 50, 74, 95, 112]`. Initial `pos = 42` (inside chapter 2). Collapse → back.

**States.** Playing / paused; chapter highlighting; end-of-track reset. Buffering/error states not shown.

**Data fields.** `AudioBriefing {title, date, durationSec (134), chapters:[{index, title, durationLabel, startSec}], speed, positionSec, isPlaying}`.

**Dead in prototype.** No real audio; speed does not affect timing; no background/lock-screen controls (see 08); no scrubbing on the progress bar.

---

### 4.7 `prep` — Toplantı Hazırlığı (stack)

**Purpose.** One-screen pre-meeting brief: the three things to raise, purpose, last meeting, latest mails, open items, what each side owes.

**Layout (padding 60 20 130, gap 16):**
1. Top row: `back-button` · kicker "TOPLANTIYA HAZIRLAN" · countdown pill h30 padding `0 10` radius 999 bg warning/soft warning/text 12/600 icon `schedule` 15 "18 dk".
2. **Person row** (button, gap 14, padding `4 0`): avatar 56 avatar/slate "MY" · name 24/30 600 -0.02em "Mehmet Yılmaz" · sub 14 ink/secondary "Müşteri toplantısı · 14:30 · 60 dk" · `chevron_right` 22 ink/disabled → push `person`.
3. **Dark `card/ai-insight`**: kicker (brand/dark-glow) "KONUŞMAN GEREKEN 3 ŞEY"; numbered items margin-top 14 gap 14 — number bubble 26 circle `rgba(255,255,255,.12)` 13/600; title 17 600 -0.01em; desc margin-top 2, 14/20 `rgba(255,255,255,.7)`:
   1. "Fiyat" — "Revize teklif 17:00'ye kadar bekleniyor; %8 indirim sınırını netleştir."
   2. "Teslim tarihi" — "Ekim başı için onay istiyor; üretim takvimi 6 Ekim'i gösteriyor."
   3. "Sözleşme" — "Taslak 2 haftadır açık; hukuk yorumu bekliyor."
4. Six `kicker + list-group` sections from `PREP` (§5.7): "TOPLANTININ AMACI", "SON GÖRÜŞMENİZ", "SON MAİLLER", "AÇIK KONULAR", "SENDEN BEKLENENLER", "SENİN BEKLEDİKLERİN". Rows `align-items:flex-start`, title 15/21 400, meta 12 ink/tertiary margin-top 2.
5. **`sticky-cta`** row gap 10: primary `flex:1` "2 Dakikalık Özeti Oku" (brand/primary, shadow/primary-cta) · secondary "Not Al" (surface, ink, padding `0 18`).

**Copy:**
| Key | String |
|---|---|
| prep.kicker | "TOPLANTIYA HAZIRLAN" |
| prep.countdown | "{{minutes}} dk" ("18 dk") |
| prep.person.sub | "{{meetingType}} · {{time}} · {{duration}} dk" ("Müşteri toplantısı · 14:30 · 60 dk") |
| prep.ai.kicker | "KONUŞMAN GEREKEN 3 ŞEY" |
| prep.cta_summary | "2 Dakikalık Özeti Oku" |
| prep.cta_note | "Not Al" |
| toast.summary | "Özet okunuyor · 2 dk" |

**Interactions.** Person row → `person`. "Not Al" → push `post`. "2 Dakikalık Özeti Oku" → toast.summary (`headphones`).

**States.** Countdown should tick live. Dark mode version exists on page 05 (Toplantı Hazırlığı dark).

**Data fields.** `MeetingPrep {meeting:{title, start, durationMin, type, location}, person, minutesUntil, talkingPoints:[{title, detail}], purpose:{text, source}, lastMeeting:{date, summary, source}, recentMails:[{subject/quote, from, when}], openItems:[{text, age}], theyExpect:[{text, due}], youExpect:[{text, waitingFor}]}`.

**Dead in prototype.** "2 Dakikalık Özeti Oku" (should open audio summary); list rows; countdown static.

---

### 4.8 `post` — Toplantı Sonrası (stack)

**Purpose.** Post-meeting capture: a spoken note becomes a structured commitment (taahhüt) awaiting save.

**Layout (padding 60 20 40, gap 18):**
1. `back-button` (alone, left).
2. Header: kicker "TOPLANTI SONRASI · MEHMET YILMAZ"; title margin-top 6, h1 "Toplantın bitti."; sub margin-top 6, 16/23 ink/secondary "Takip etmen gereken bir şey var mı?".
3. **Quote card**: bg surface radius 20 padding 16 shadow/card; italic 15/22 ink "“Mehmet'e yarın teklif göndereceğim.”"; source row margin-top 10, 12 ink/tertiary, icon `mic` 16, "Sesle eklendi · 15:31".
4. **`card/ai-insight`** kicker "YENİ TAAHHÜT"; title margin-top 8, 18 600 -0.01em "Mehmet'e teklif gönder"; chips margin-top 8 gap 8 wrap — h30 padding `0 10` radius 999 bg surface-2 ink/secondary 12/600 with 15px icon: `event` "Yarın" · `person` "Mehmet Yılmaz".
5. Buttons pinned to bottom (`margin-top:auto`, gap 10): "Kaydet" `flex:1` h52 radius 16 brand/primary white 600 15 · "Vazgeç" h52 padding `0 18` bg surface ink.

**Copy:**
| Key | String |
|---|---|
| post.kicker | "TOPLANTI SONRASI · {{PERSON}}" |
| post.title | "Toplantın bitti." |
| post.sub | "Takip etmen gereken bir şey var mı?" |
| post.quote.source | "Sesle eklendi · {{time}}" |
| post.ai.kicker | "YENİ TAAHHÜT" |
| post.save / cancel | "Kaydet" / "Vazgeç" |
| toast.commitment_saved | "Taahhüt kaydedildi · Yarın hatırlatırım" |

**Interactions.** "Kaydet" → back + toast.commitment_saved (`handshake`). "Vazgeç"/back → back.

**Data fields.** `Commitment {text, rawTranscript, capturedVia: voice|text, capturedAt, dueDate, person, sourceMeeting}`.

**Dead in prototype.** No actual voice capture / transcription (quote is pre-filled); chips not editable; no "add another".

---

### 4.9 `mail` — Mail Detayı (stack)

**Purpose.** AI-first mail detail: summary + key points, four actions, original body behind an accordion, source line.

**Layout (padding 60 20 40, gap 16):**
1. Top row: `back-button` · `badge` "ACİL" (critical, padding `4 9`).
2. Sender row gap 12: avatar 44 avatar/terracotta "AY" · name 16 600 -0.01em "Ahmet Yılmaz" · meta 13 ink/secondary "Bugün 08:42 · Gmail".
3. Subject h2 22/28 600 -0.02em "Re: Eylül teklifi – revize".
4. **`card/ai-insight` "AI ÖZETİ"**: summary margin-top 8, 17/24 500 -0.01em "Ahmet revize fiyat teklifinin bugün 17:00'ye kadar gönderilmesini istiyor."; sub-kicker margin-top 12 (12 600 +6% ink/tertiary) "ÖNEMLİ NOKTALAR"; bullets margin-top 6 gap 6, 14/20, 6px dot brand/primary: "Revize fiyat" · "Deadline 17:00" · "PDF gönderilecek".
5. **Action grid** 2×2 gap 10; buttons h56 padding `0 14` radius 16 600 14 icon 20 gap 8 left-aligned:
   - "Yanıt Hazırla" (`edit_note`, bg brand/primary, white)
   - "Görev Oluştur" (`add_task` brand/primary, bg surface ink, shadow/pill)
   - "Takvime Ekle" (`event`, same secondary style)
   - "Hatırlat" (`notifications`, same)
6. **Original mail accordion**: bg surface radius 18 shadow/card, overflow hidden. Header button h52 padding `0 16` 600 15 ink: `mail` 20 ink/secondary + "Orijinal Mail"; trailing `expand_more` / `expand_less` 22 ink/tertiary. Body (when open): padding `12 16 16`, 14/21 ink, `white-space:pre-wrap`, top border hairline/row:
   ```
   Merhaba Yunus,

   Geçen hafta konuştuğumuz teklifi revize edebilir misin? Yönetim bugün saat 17:00'ye kadar güncellenmiş fiyatı PDF olarak görmek istiyor. Teslim tarihini de netleştirsek iyi olur.

   Teşekkürler,
   Ahmet
   ```
7. Source line (12 ink/tertiary, `verified` 16, padding `0 4`): "Kaynak: Gmail · ahmet.yilmaz@… · Gelen Kutusu".

**Copy:**
| Key | String |
|---|---|
| mail.badge.urgent | "ACİL" |
| mail.meta | "{{when}} · {{provider}}" ("Bugün 08:42 · Gmail") |
| mail.ai.kicker | "AI ÖZETİ" |
| mail.ai.keypoints | "ÖNEMLİ NOKTALAR" |
| mail.action.reply / task / calendar / remind | "Yanıt Hazırla" / "Görev Oluştur" / "Takvime Ekle" / "Hatırlat" |
| mail.original | "Orijinal Mail" |
| mail.source | "Kaynak: {{provider}} · {{address}} · {{folder}}" ("Kaynak: Gmail · ahmet.yilmaz@… · Gelen Kutusu") |

**Interactions.**
- "Yanıt Hazırla" → `reply` (mode ahmet).
- "Görev Oluştur" → create approval {icon `add_task`, type "GÖREV EKLE", what "Revize teklifi hazırla · Bugün 16:00'ya kadar", why "Ahmet'in maili 17:00 son tarihini içeriyor.", change "Plan'a 1 görev bloğu · 45 dk"} + toast "Onay Merkezi'ne eklendi" (`task_alt`).
- "Takvime Ekle" → create approval {icon `event`, type "ETKİNLİK OLUŞTUR", what "“Revize teklif teslimi” · Bugün 17:00", why "Mailde son tarih tespit edildi.", change "Takvime 1 etkinlik · 30 dk önce hatırlatma"} + same toast.
- "Hatırlat" → sheet `remind` with sub "Ahmet · Revize teklif".
- Accordion toggles `showOriginal`; reset to closed on back.

**States.** Accordion closed/open. Screen is static for one mail; loading/error not shown.

**Data fields.** `MailDetail {id, from:{name, email, avatarPalette}, receivedAt, provider, folder, subject, urgency badge, aiSummary, keyPoints[], body (plain text), threadId, attachments?}`.

**Dead in prototype.** Content is hard-coded for Ahmet's mail (opened from three different cards); no attachment list; no "open in Gmail"; no archive/snooze.

---

### 4.10 `reply` — AI Yanıt Taslağı / Takip Mesajı (stack; two sub-states)

**Purpose.** Tone-selectable AI draft that is sent only after explicit approval; success state returns to Bugün and drops the related card.

`replyMode` is `ahmet` (reply to the urgent mail) or `mehmet` (follow-up on the unanswered proposal). Both share one screen.

**Layout — sub-state `notSent` (padding 60 20 40, gap 16):**
1. Top row: `back-button` · kicker `replyKicker` = "YANIT TASLAĞI" (ahmet) / "TAKİP MESAJI" (mehmet) · 36px spacer.
2. Recipient row (14 ink/secondary): "Kime" + recipient chip h30 padding `0 10 0 4` radius 999 bg surface ink 600 shadow/pill with 22px avatar (10px initials; AY terracotta / MY slate) + name "Ahmet Yılmaz" / "Mehmet Yılmaz".
3. **Tone `segmented-control`** (items `flex:1` h32): "Kısa" | "Profesyonel" (default) | "Samimi" | "Detaylı".
4. **Draft card**: bg surface radius 20 padding 18 shadow/card. Header: kicker/ai "AI TASLAĞI · {{TONE}}" (tone upper-cased: KISA / PROFESYONEL / SAMİMİ / DETAYLI) · right "Düzenlenebilir" 12 ink/tertiary. Body margin-top 12, 15/23 ink, `pre-wrap` = draft text for (mode, tone) from §5.4.
5. `trust-line`: "Sen onaylamadan hiçbir mail gönderilmez."
6. Buttons pinned bottom (gap 10): primary `flex:1` h52 radius 16 brand/primary shadow/primary-cta — label "Göndermeyi Onayla"; while sending shows a 16px spinner (2px border `rgba(255,255,255,.4)`, top white, `daspin` .8s linear) + "Gönderiliyor…". Secondary "Düzenle" h52 padding `0 18` bg surface ink shadow/pill.

**Layout — sub-state `sent`:** centred column, padding 40, gap 14, text-align center. 96×96 stage: circle bg success/soft scaling .4→1 (.5s `cubic-bezier(.2,.8,.2,1)`) behind `check_circle` 48 FILL 1 success/text scaling .4→1 (.45s, delay .1s). Title 26 600 -0.02em "Gönderildi". Body 15/22 ink/secondary "{{replyTo}} yanıtını aldı. Cevap gelince Akış'ta göreceksin." Button margin-top 12, h48 padding `0 22` radius 14 bg ink white 600 15 "Bugün'e Dön". No bottom nav (stack non-empty).

**Copy:**
| Key | String |
|---|---|
| reply.kicker.reply / followup | "YANIT TASLAĞI" / "TAKİP MESAJI" |
| reply.to_label | "Kime" |
| reply.tone.short / professional / friendly / detailed | "Kısa" / "Profesyonel" / "Samimi" / "Detaylı" |
| reply.draft.kicker | "AI TASLAĞI · {{TONE}}" |
| reply.draft.editable | "Düzenlenebilir" |
| reply.trust | "Sen onaylamadan hiçbir mail gönderilmez." |
| reply.cta_send | "Göndermeyi Onayla" |
| reply.cta_sending | "Gönderiliyor…" |
| reply.cta_edit | "Düzenle" |
| reply.sent.title | "Gönderildi" |
| reply.sent.body | "{{name}} yanıtını aldı. Cevap gelince Akış'ta göreceksin." |
| reply.sent.cta | "Bugün'e Dön" |
| toast.edit_mode | "Taslak düzenleme modunda" |
| toast.mail_sent | "Mail gönderildi · {{name}}" |

**Interactions.** Tone tap swaps the draft instantly (no regeneration delay in prototype; production should show a regenerate shimmer). "Göndermeyi Onayla" → `sending` 900 ms → `sent`. "Bugün'e Dön" (`finishSend`): stack cleared, related priority card removed (p1 for ahmet / p4 for mehmet), approval `a1` marked ONAYLANDI when mode is mehmet, toast.mail_sent (`send`). "Düzenle" → toast.edit_mode. Back → pops (draft state retained; `sent/sending` reset when re-entered).

**States.** notSent (idle / sending) · sent. Error on send: not shown (design one: keep draft, inline error, retry).

**Data fields.** `Draft {mode: reply|followup, recipient:{name, email, avatar}, inReplyTo (mail id) | followUpOn (sent mail id), tone, body, generatedAt, editable:true}`.

**Dead in prototype.** "Düzenle" (in-place editing); no subject line; no CC; no attachment; no undo-send; tone regeneration is instant.

---

### 4.11 `approvals` — Onay Merkezi / "Onay Bekleyenler" (stack)

**Purpose.** Every write action the AI proposes (send mail, create/move event, add task/reminder) is queued here for explicit approve / edit / reject.

**Layout (padding 60 20 40, gap 14):**
1. Top row: `back-button` · 36 spacer.
2. Title block: h1 "Onay Bekleyenler" · sub margin-top 4, 14 ink/secondary: "{{n}} işlem onayını bekliyor · Hiçbiri sen onaylamadan yapılmaz" or, when none pending, "Bekleyen işlem yok".
3. **Approval cards** (bg surface radius 20 padding 16 shadow/card; opacity .45 when rejected, transition .3s):
   - Row 1 gap 8: icon tile 28 radius 9 bg brand/soft brand/text-on-soft icon 17 (`send`, `event_repeat`, `event`, `add_task`) · type kicker 12 600 +6% ink/secondary (flex) · `status-badge`: "BEKLİYOR" (warning) / "ONAYLANDI" (success) / "REDDEDİLDİ" (neutral).
   - What: margin-top 10, h3 17/23 600.
   - Detail grid margin-top 10, columns `64px 1fr`, gap `6 10`, 13/19: label "Neden" (ink/tertiary) → `why`; label "Değişim" → `change`.
   - If pending: button row margin-top 14 gap 8 — "Onayla" `flex:1` h42 radius 12 brand/primary white 600 14 · "Düzenle" h42 padding `0 14` bg brand/soft brand/text-on-soft · "Reddet" h42 padding `0 14` bg surface-2 ink/secondary.
4. `trust-line` (padding `8 4`, 13/19): "Önemli işlemler sen onaylamadan gerçekleştirilmez."

**Copy:**
| Key | String |
|---|---|
| approvals.title | "Onay Bekleyenler" |
| approvals.summary | "{{count}} işlem onayını bekliyor · Hiçbiri sen onaylamadan yapılmaz" |
| approvals.empty | "Bekleyen işlem yok" |
| approvals.type.send_mail / move_event / create_event / add_task | "MAİL GÖNDER" / "ETKİNLİK TAŞI" / "ETKİNLİK OLUŞTUR" / "GÖREV EKLE" |
| approvals.status.pending / approved / rejected | "BEKLİYOR" / "ONAYLANDI" / "REDDEDİLDİ" |
| approvals.label.why / change | "Neden" / "Değişim" |
| approvals.approve / edit / reject | "Onayla" / "Düzenle" / "Reddet" |
| approvals.trust | "Önemli işlemler sen onaylamadan gerçekleştirilmez." |
| toast.approved | "Onaylandı · {{what}}" |
| toast.rejected | "Reddedildi · Öğrendim" |
| toast.edit_in_plan | "Düzenleme Plan sekmesinde açılır" |

**Interactions.** "Onayla" → status approved + toast.approved (`check`). "Reddet" → status rejected (card dims) + toast.rejected (`psychology`). "Düzenle": for `send` type → `reply` (mode mehmet); for all other types → toast.edit_in_plan (`edit`). New approvals from other screens are **prepended**. Approved/rejected cards remain in the list (no archive/history in prototype). Pending count feeds the Bugün pill and the Profile row.

**States.** Pending / approved / rejected per card; empty list text. Designs for a fully empty Onay Merkezi illustration are on page 06/08.

**Data fields.** `Approval {id, kind: send_mail|move_event|create_event|add_task|add_reminder, icon, typeLabel, what, why, change, status: pending|approved|rejected, createdAt, payload (mail draft / event diff / task), sourceCardId}`.

**Dead in prototype.** "Düzenle" for non-mail approvals; no history/archive; no undo after approve; no batch approve.

---

### 4.12 `profile` — Profil & Ayarlar (stack)

**Purpose.** Account hub: subscription state, Onay Merkezi shortcut, settings list, sign-out.

**Layout (padding 60 20 40, gap 16):**
1. Top row: `back-button` · spacer.
2. Identity row gap 14: avatar 60 (ink, white 22 600 initial) · name 22 600 -0.02em "{{name}} Emre" (→ "Yunus Emre") · sub row margin-top 2, 13 ink/secondary: `badge` "PRO" (primary tone, padding `2 8`, 11 600) + "Deneme · 5 gün kaldı".
3. **Onay Merkezi row** (dark button: bg ink white radius 18 padding `14 16` gap 12): `task_alt` 22 brand/dark-glow · "Onay Merkezi" 15 600 · sub 12 `rgba(255,255,255,.65)` "{{pendingCount}} işlem onayını bekliyor" · `chevron_right` 20 opacity .6 → push `approvals`.
4. **Settings `list-group`** (bg surface radius 18 padding `0 16` shadow/card; rows min-height 50, gap 12, border-top hairline/row; icon 20 ink/secondary width 24; title 15 500 flex; value 13 ink/tertiary; `chevron_right` 18 ink/chevron):

   | icon | title | value | go |
   |---|---|---|---|
   | workspace_premium | "Abonelik" | "Pro deneme" | `paywall` |
   | wb_twilight | "Brifing" | "08:00 · 13:00 · 19:00" | toast |
   | notifications | "Bildirimler" | "Sadece önemli" | toast |
   | tune | "Öncelik Kuralları" | "6 kural" | toast |
   | star | "Önemli Kişiler" | "4 kişi" | `person` |
   | link | "Bağlantılar" | "Gmail · Takvim" | toast |
   | psychology | "AI Kişiselleştirme" | "" | toast |
   | shield | "Gizlilik ve Güvenlik" | "" | toast |
   | contrast | "Görünüm" | "Açık" | toast |
   | language | "Dil" | "Türkçe" | toast |
   | help | "Yardım" | "" | toast |
   | rate_review | "Geri Bildirim" | "" | toast |
5. "Çıkış Yap" h48 radius 14 transparent critical/text 600 15.

**Copy:**
| Key | String |
|---|---|
| profile.name | "{{firstName}} Emre" (prototype composes first name + surname) |
| profile.badge.pro | "PRO" |
| profile.trial | "Deneme · {{days}} gün kaldı" ("5 gün kaldı") |
| profile.approvals.title | "Onay Merkezi" |
| profile.approvals.sub | "{{count}} işlem onayını bekliyor" |
| profile.settings.* | titles/values in the table above |
| profile.signout | "Çıkış Yap" |
| toast.settings_stub | "{{title}} · Bkz. 07 Hesap" |
| toast.signout_disabled | "Prototipte çıkış devre dışı" |

**Interactions.** Onay Merkezi → approvals. "Abonelik" → paywall. "Önemli Kişiler" → person (Mehmet). Other rows → toast.settings_stub (`settings`). "Çıkış Yap" → toast.signout_disabled (`logout`).

**Dead in prototype.** 10 of 12 settings rows (all designed on page 07: brifing ayarları, gizlilik merkezi, davet…); sign-out; avatar edit.

---

### 4.13 `person` — Kişi Zekâsı (stack)

**Purpose.** Relationship intelligence for one contact: what you last discussed, what each side owes, last contact, and an ask-bar scoped to that person.

**Layout (padding 60 20 110, gap 16):**
1. Top row: `back-button` · VIP pill h30 padding `0 10` radius 999 bg brand/soft brand/text-on-soft 12 600 icon `star` 15 FILL 1 "VIP".
2. Identity (centred, gap 8): avatar 76 avatar/slate "MY" · name 26 600 -0.02em "Mehmet Yılmaz" · sub 14 ink/secondary "Müşteri · Yılmaz Endüstri · Son iletişim dün 18:20".
3. **Stat tiles** grid 2 gap 10 (bg surface radius 16 padding 14 shadow/card-flat; label 12 ink/tertiary; value margin-top 4, 16 600 -0.01em): "Yaklaşan toplantı" → "Bugün 14:30" · "Açık konular" → "2 konu".
4. Four `kicker + list-group` sections from `PERSON` (§5.10): "SON KONUŞULAN KONULAR", "SENDEN BEKLEDİKLERİ", "SENİN BEKLEDİKLERİN", "SON İLETİŞİM".
5. **`ask-bar`** in bottom fade container (padding `12 16 44`): placeholder "Mehmet hakkında sor…" → mic opens voice.

**Copy:**
| Key | String |
|---|---|
| person.vip | "VIP" |
| person.sub | "{{role}} · {{company}} · Son iletişim {{when}}" ("Müşteri · Yılmaz Endüstri · Son iletişim dün 18:20") |
| person.stat.next_meeting / open_items | "Yaklaşan toplantı" / "Açık konular" |
| person.stat.open_items_value | "{{count}} konu" |
| person.input.placeholder | "{{firstName}} hakkında sor…" |

**Data fields (`card/person`).** `Person {id, name, initials, avatarPalette, role, company, lastContactAt, isVip, nextMeeting, openItemCount, topics:[{icon, text, date}], theyExpect[], youExpect[], lastContacts:[{channel: mail|call, text, when}]}`.

**Dead in prototype.** VIP toggle; list rows; text question submit; no call/mail quick actions.

---

### 4.14 `paywall` — Dijital Asistan Pro (modal-style stack)

**Purpose.** Pro upsell with feature list, yearly/monthly plan picker and 7-day trial CTA.

**Layout (padding 60 20 40, gap 16, bg paywall wash):**
1. Top row: close button (36 circle surface, `close` 20) · spacer.
2. Header: kicker/ai (brand/primary) "DİJİTAL ASİSTAN PRO" · title margin-top 8, 30/36 600 -0.02em "Tüm dijital hayatın, tek brifingde."
3. **Feature `list-group`** (radius 20, padding `6 16`; rows gap 10 padding `10 0` border-top, 15px, icon 20 brand/primary) from `PRO` (§5.11): "Sınırsız analiz, birden fazla hesap" · "Öğle ve akşam brifingi" · "Toplantı hazırlığı" · "Akıllı takip ve taahhütler" · "Sesli brifing" · "AI hafıza ve VIP kişiler" · "Gelişmiş planlama".
4. **Plan picker** (gap 8): radio cards padding `14 16`, `border 2px`, radius 16, bg surface; selected border brand/primary, unselected hairline/radio. Radio 20px circle: border 2px (same colour), fill brand/primary when selected else white, `inset 0 0 0 3px #fff` ring.
   - "Yıllık" + badge "EN AVANTAJLI" (success tone, 11 700) · sub 13 ink/secondary "1.490 TL / yıl · ayda 124 TL" (default selected)
   - "Aylık" · "199 TL / ay"
5. Bottom (margin-top auto, gap 8): primary h52 radius 16 brand/primary shadow/primary-cta "Ücretsiz Dene · 7 gün" · ghost h44 radius 14 transparent ink/secondary 600 14 "Free ile devam et" · legal 12 ink/tertiary centred "Deneme bitmeden 24 saat önce hatırlatırız. İstediğin zaman iptal."

**Copy:**
| Key | String |
|---|---|
| paywall.kicker | "DİJİTAL ASİSTAN PRO" |
| paywall.title | "Tüm dijital hayatın, tek brifingde." |
| paywall.features.* | list above |
| paywall.plan.yearly / monthly | "Yıllık" / "Aylık" |
| paywall.plan.best | "EN AVANTAJLI" |
| paywall.plan.yearly_price | "1.490 TL / yıl · ayda 124 TL" |
| paywall.plan.monthly_price | "199 TL / ay" |
| paywall.cta_trial | "Ücretsiz Dene · 7 gün" |
| paywall.cta_free | "Free ile devam et" |
| paywall.legal | "Deneme bitmeden 24 saat önce hatırlatırız. İstediğin zaman iptal." |
| toast.trial_started | "7 günlük deneme başladı · 12 Eylül'de hatırlatırım" |

**Interactions.** Plan cards toggle `billing` (yearly|monthly). "Ücretsiz Dene · 7 gün" → back + toast.trial_started (`workspace_premium`). "Free ile devam et" / close → back.

**Dead in prototype.** No StoreKit/Play Billing purchase flow; no restore purchases; no price localisation.

---

### 4.15 Overlay — bottom sheet `remind` ("Ne zaman hatırlatayım?")

Opened from: Bugün p1 "Hatırlat" (sub = "Ahmet senden bugün 17:00'ye kadar revize teklif bekliyor."), Mail "Hatırlat" (sub = "Ahmet · Revize teklif"), Akış fatura "Hatırlat" (sub = "Elektrik faturası · 1.842 TL").

| icon | title | meta | style |
|---|---|---|---|
| schedule | "30 dakika önce" | "16:30" | default |
| schedule | "1 saat önce" | "16:00" | default |
| wb_twilight | "Bu akşam" | "19:00" | default |
| wb_sunny | "Yarın sabah" | "08:00" | default |
| edit_calendar | "Özel zaman" | "" | default |
| auto_awesome | "Uygun zamanda" | "Takvimine göre: 12:10" | AI option: icon brand/primary, meta brand/text-on-soft 600 |

Selecting any option closes the sheet and toasts "Hatırlatıcı kuruldu · {{meta}}" (`notifications`); for "Özel zaman" the toast reads "Hatırlatıcı kuruldu · Özel zaman" (a date-time picker is not implemented). Meta times are relative to the 17:00 deadline and should be computed. Copy keys: `sheet.remind.title` "Ne zaman hatırlatayım?", `sheet.remind.option.*`, `sheet.remind.ai_meta` "Takvimine göre: {{time}}", `toast.reminder_set` "Hatırlatıcı kuruldu · {{when}}".

### 4.16 Overlay — bottom sheet `correct` ("Bunu nasıl değerlendireyim?")

Opened from every `card/priority` "···". Sub: "Seçimin gelecekteki öncelikleri etkiler".

| icon | title | learned response (`r`) |
|---|---|---|
| remove_circle | "Önemli değil" | "Bu tür konuları daha aşağıda göstereceğim." |
| trending_up | "Bunu daha sık göster" | "Bu konuyu daha yüksek öncelikle izleyeceğim." |
| star | "Bu kişiyi VIP yap" | "{{person}} artık VIP." — person = 2nd segment of the card's source line (e.g. "Ahmet Yılmaz artık VIP.") |
| visibility_off | "Bunu takip etme" | "Bu konuyu artık takip etmeyeceğim." |

Selecting closes the sheet and toasts "Öğrendim · {{r}}" (`psychology`). Keys: `sheet.correct.title`, `sheet.correct.sub`, `sheet.correct.option.*`, `sheet.correct.learned.*`, `toast.learned` "Öğrendim · {{message}}". **Dead:** no effect on ranking or the VIP list in the prototype; "Bu kişiyi VIP yap" would produce "undefined artık VIP." for cards whose source has no person segment (p5 kargo → "Yurtiçi artık VIP.") — guard for non-person sources.

### 4.17 Overlay — `voice` (Ses Modu)

Full-screen overlay (z 30) bg gradient/night (voice variant), white, padding `60 20 44`. Status bar light.
1. Top row: kicker "SES MODU" (opacity .7) · close 36 circle `rgba(255,255,255,.14)` `close` 20.
2. Centre (flex 1, gap 28): 120×120 stage — pulse ring (absolute inset circle `rgba(255,255,255,.35)`, `dapulse` 1.6s ease-out infinite: scale .9/op .6 → scale 1.35/op 0) behind an 80px white disc with `mic` 36 night/ink. Waveform: 22 bars, width 4, gap 4, height 44, bar height `10 + ((i*11)%6)*6`, `rgba(255,255,255,.85)`, `dabar` animation while open. Transcript text 22/30 600 -0.01em max-width 300: "Dinliyorum…" → after a prompt "“{{prompt}}”". Answer bubble (appears 900 ms later): bg `rgba(255,255,255,.1)` radius 18 padding `14 16` 15/22 left-aligned max-width 320.
3. Bottom prompt chips (wrap, gap 8, centred): h36 padding `0 14` radius 999 `rgba(255,255,255,.12)` white 500 13 — from `VOICE` (§5.12): "Bugün ne var?" · "Brifingimi oku." · "Yarın yoğun muyum?" · "Mehmet'ten cevap geldi mi?".

Keys: `voice.kicker` "SES MODU", `voice.listening` "Dinliyorum…", `voice.prompt.*`, `voice.answer.*`. **Dead:** no speech recognition/TTS; chips simulate recognition.

### 4.18 Overlay — toast catalogue (icon · text)

| Trigger | Icon | Text |
|---|---|---|
| card done | check | "Tamamlandı · Bir sonraki konu yukarı taşındı" |
| approval created | task_alt | "Onay Merkezi'ne eklendi" |
| p4 "Yarın Hatırlat" | notifications | "Yarın 09:00'da hatırlatırım" |
| p5 "Takip Et" | package_2 | "Kargo takibi açıldı · Teslimatta haber veririm" |
| Akış "Ekle" | add_a_photo | "Ekran görüntüsü, PDF veya link ekle · Bkz. 04 Akış" |
| Akış generic action | open_in_new | "{{action}} · Kaynak açıldı" |
| Asistan "Hafıza" | search | "Hafıza araması · Bkz. 06 Asistan" |
| Plan "Başka zaman" | schedule | "Tamam, başka bir boşluk önereceğim" |
| Plan "Planla" | event_available | "Planlandı · Yarın 14:00–16:30 Teklif hazırlama" |
| Plan "Seçenekleri Gör" | event_repeat | "Çözüm seçenekleri · Bkz. 05 Plan" |
| Prep "2 Dakikalık Özeti Oku" | headphones | "Özet okunuyor · 2 dk" |
| Reply "Düzenle" | edit | "Taslak düzenleme modunda" |
| Reply finished | send | "Mail gönderildi · {{name}}" |
| Approve | check | "Onaylandı · {{what}}" |
| Reject | psychology | "Reddedildi · Öğrendim" |
| Approval "Düzenle" (non-mail) | edit | "Düzenleme Plan sekmesinde açılır" |
| Settings stub | settings | "{{title}} · Bkz. 07 Hesap" |
| Sign out | logout | "Prototipte çıkış devre dışı" |
| Post "Kaydet" | handshake | "Taahhüt kaydedildi · Yarın hatırlatırım" |
| Paywall trial | workspace_premium | "7 günlük deneme başladı · 12 Eylül'de hatırlatırım" |
| Sheet remind option | notifications | "Hatırlatıcı kuruldu · {{when}}" |
| Sheet correct option | psychology | "Öğrendim · {{learned}}" |

---

## 5. Example data fixtures (transcribed from the `text/x-dc` script — use as seed/mocks)

### 5.1 `PRIOS` (Bugün priorities)
| id | badge | tone | time | title | sub | srcIcon | source | a1 | a2 | go |
|---|---|---|---|---|---|---|---|---|---|---|
| p1 | ACİL | critical | 08:42 | "Ahmet senden bugün 17:00'ye kadar revize teklif bekliyor." | — | mail | "Gmail · Ahmet Yılmaz · 08:42" | Yanıtla | Hatırlat | mail |
| p2 | TOPLANTI | neutral | 14:30 | "14:30 Mehmet ile toplantı" | "Son görüşmeniz 4 gün önceydi." | event | "Google Takvim · Müşteri toplantısı · 60 dk" | Hazırlan | — | prep |
| p3 | SON TARİH | warning | 17:00 | "Başvuru bugün 17:00'de kapanıyor." | — | mail | "Gmail · Girişim Programı · Dün 16:10" | Takvime Ekle | — | mail |
| p4 | TAKİP | neutral | 3 gün | "Gönderdiğin teklif mailine 3 gündür cevap gelmedi." | — | schedule_send | "Gmail · Mehmet Yılmaz · 2 Eyl" | Takip Mesajı Hazırla | Yarın Hatırlat | — |
| p5 | KİŞİSEL | neutral | Bugün | "Trendyol siparişin bugün geliyor." | — | package_2 | "Kargo · Yurtiçi · 14:00–18:00" | Takip Et | — | — |

### 5.2 `FEED` (Akış)
| # | cat | imp | icon | src | time | title | sum | action | tone | badge | go |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Mail | 1 | mail | "Gmail · Ahmet Yılmaz" | 08:42 | "Revize teklif bugün 17:00'ye kadar bekleniyor" | "Ahmet, fiyat ve teslim tarihini güncellenmiş PDF olarak istiyor." | Yanıtla | critical | ACİL | mail |
| 2 | Takvim | 1 | event | "Google Takvim" | 14:30 | "Mehmet ile müşteri toplantısı" | "Son görüşmeniz 4 gün önceydi. Açık 2 konu var." | Hazırlan | neutral | BUGÜN | prep |
| 3 | Takip | 1 | schedule_send | "Gmail · Mehmet Yılmaz" | 3 gün | "Teklif mailine cevap gelmedi" | "2 Eylül'de gönderildi. Henüz yanıt yok." | Takip Mesajı Hazırla | neutral | TAKİP | followup |
| 4 | Mail | 1 | mail | "Gmail · Girişim Programı" | Dün | "Başvuru bugün 17:00'de kapanıyor" | "Son gün. Form yaklaşık 10 dakika sürüyor." | Takvime Ekle | warning | SON TARİH | cal |
| 5 | Kişisel | 1 | shield | "Google" | 07:12 | "Google hesabında yeni giriş" | "Chrome · Windows · İstanbul. Sen değilsen şifreni değiştir." | Kontrol Et | critical | GÜVENLİK | — |
| 6 | Kişisel | 0 | package_2 | "Kargo · Trendyol" | Bugün | "Siparişin bugün geliyor" | "Teslimat aralığı 14:00–18:00." | Takip Et | neutral | KARGO | — |
| 7 | Kişisel | 0 | flight | "THY" | Yarın 09:15 | "TK2412 · İstanbul → Antalya" | "Online check-in açıldı. 06:45'te evden çıkman gerekebilir." | Check-in | neutral | UÇUŞ | — |
| 8 | Kişisel | 0 | receipt_long | "CK Enerji" | 10 Eyl | "Elektrik faturası · 1.842 TL" | "Son ödeme günü 10 Eylül." | Hatırlat | neutral | ÖDEME | remind |
| 9 | Kişisel | 0 | autorenew | "Netflix" | 9 Eyl | "Netflix 9 Eylül'de yenilenecek" | "Aylık 229,99 TL. Son 30 günde 2 kez izlendi." | İncele | neutral | ABONELİK | — |
| 10 | Kişisel | 0 | restaurant | "Rezervasyon · Karaköy Lokantası" | Cmt 20:30 | "Akşam yemeği rezervasyonu" | "4 kişi. Teyit için 18:00 son saat." | Teyit Et | neutral | REZERVASYON | — |

`FILTERS = ["Tümü","Önemli","Mail","Takvim","Takip","Kişisel"]` · `TABS` = §2.4 · `TONE_LIST = ["Kısa","Profesyonel","Samimi","Detaylı"]`.

### 5.3 Seed approvals
| id | icon | type | what | why | change |
|---|---|---|---|---|---|
| a1 | send | "MAİL GÖNDER" | "Mehmet Yılmaz'a takip mesajı gönder" | "Teklif mailine 3 gündür yanıt gelmedi." | "1 mail gönderilecek · Kısa, profesyonel ton" |
| a2 | event_repeat | "ETKİNLİK TAŞI" | "Mehmet toplantısını 16:00'ya al" | "Mehmet 16:00'yı önerdi; takvimin uygun." | "14:30 → 16:00 · Katılımcılara bildirim gider" |

Approvals created at runtime: see §4.1 (p3), §4.2 (cal), §4.9 (Görev Oluştur, Takvime Ekle).

### 5.4 Reply drafts (`\n` = line break)

**REPLY_AHMET**
- Kısa: "Merhaba Ahmet,\n\nRevize teklifi bugün 17:00'den önce PDF olarak göndereceğim.\n\nİyi çalışmalar,\nYunus"
- Profesyonel: "Merhaba Ahmet,\n\nTalebiniz için teşekkürler. Revize fiyat teklifini, güncellenmiş teslim tarihiyle birlikte bugün 17:00'den önce PDF formatında iletiyor olacağım.\n\nSorularınız olursa memnuniyetle yardımcı olurum.\n\nİyi çalışmalar,\nYunus"
- Samimi: "Selam Ahmet,\n\nMesajın için teşekkürler! Revize teklifi bugün 17:00'den önce PDF olarak yolluyorum, merak etme.\n\nGörüşmek üzere,\nYunus"
- Detaylı: "Merhaba Ahmet,\n\nRevize teklife ilişkin talebinizi aldım. Fiyat kalemlerini güncelledim, teslim tarihini Ekim başı olarak netleştirdim ve sözleşme taslağına atıf ekledim. Belgeyi bugün 17:00'den önce PDF olarak göndereceğim.\n\nEk bir kalem veya değişiklik isterseniz lütfen belirtin.\n\nİyi çalışmalar,\nYunus"

**REPLY_MEHMET**
- Kısa: "Merhaba Mehmet,\n\n2 Eylül'de ilettiğim teklif hakkında görüşünüzü alabilir miyim?\n\nİyi çalışmalar,\nYunus"
- Profesyonel: "Merhaba Mehmet,\n\n2 Eylül'de ilettiğim teklifle ilgili değerlendirmenizi öğrenmek isterim. Sorularınız varsa bugünkü görüşmemizde ele alabiliriz.\n\nİyi çalışmalar,\nYunus"
- Samimi: "Selam Mehmet,\n\nGeçen hafta yolladığım teklife bakma fırsatın oldu mu? Bugün görüştüğümüzde üzerinden geçebiliriz.\n\nGörüşmek üzere,\nYunus"
- Detaylı: "Merhaba Mehmet,\n\n2 Eylül'de ilettiğim teklifte fiyat, teslim tarihi ve sözleşme koşullarını özetlemiştim. Değerlendirmenizi ve varsa revize taleplerinizi bugünkü 14:30 görüşmemiz öncesinde alabilirsem toplantıyı daha verimli kullanabiliriz.\n\nİyi çalışmalar,\nYunus"

### 5.5 `BRIEF` (Sabah Brifingi sections)
| Section | Rows (icon · title · meta) |
|---|---|
| BUGÜNÜN ÖNCELİKLERİ | mail · "Ahmet'e revize teklif" · "Acil · 17:00" — event · "Mehmet ile müşteri toplantısı" · "14:30 · Hazırlık öneriliyor" — flag · "Başvuru 17:00'de kapanıyor" · "Son tarih" |
| PROGRAMIN | event · "Mehmet ile müşteri toplantısı" · "14:30 · 60 dk · Ofis" — videocam · "Ürün gözden geçirme" · "16:00 · 30 dk · Online" — flag · "Başvuru son saati" · "17:00" — restaurant · "Akşam yemeği rezervasyonu" · "20:30 · Karaköy" |
| SENDEN CEVAP BEKLEYENLER | person · "Ahmet Yılmaz · Revize teklif" · "Bugün 17:00" — person · "Selin Kaya · Sözleşme taslağı" · "3 saattir bekliyor" |
| SENİN CEVAP BEKLEDİKLERİN | schedule_send · "Mehmet Yılmaz · Teklif" · "3 gündür yanıt yok" |
| SON TARİHLER | flag · "Girişim programı başvurusu" · "Bugün 17:00" — receipt_long · "Elektrik faturası · 1.842 TL" · "10 Eylül" |
| KİŞİSEL GELİŞMELER | package_2 · "Trendyol siparişin bugün geliyor" · "14:00–18:00" — flight · "TK2412 İstanbul → Antalya" · "Yarın 09:15" — autorenew · "Netflix yenilenecek" · "9 Eylül" |

### 5.6 `CHAPTERS` (audio; start seconds from the logic)
| # | title | duration | start (s) |
|---|---|---|---|
| 01 | "Genel bakış" | 0:18 | 0 |
| 02 | "Bugünün öncelikleri" | 0:32 | 18 |
| 03 | "Programın" | 0:24 | 50 |
| 04 | "Cevap bekleyenler" | 0:21 | 74 |
| 05 | "Son tarihler" | 0:17 | 95 |
| 06 | "Kişisel gelişmeler" | 0:22 | 112 |
Total 134 s ("2 dk 14 sn" / "2:14").

### 5.7 `PREP` (Toplantı Hazırlığı sections)
| Section | Rows (icon · text · meta) |
|---|---|
| TOPLANTININ AMACI | target · "Eylül teklifinin son hâlini netleştirmek ve Ekim teslimatı için onay almak." · "Takvim davetinden çıkarıldı" |
| SON GÖRÜŞMENİZ | history · "1 Eylül · Fiyat aralığı ve teslim süresi konuşuldu. Mehmet revize teklif istedi; sen Cuma göndereceğini söyledin." · "4 gün önce · Görüşme notları" |
| SON MAİLLER | mail · "Re: Teklif — “Fiyatı Ekim teslimatına göre güncelleyebilir misiniz?”" · "Mehmet · Dün 18:20" — mail · "Teklif v2 gönderildi (PDF)" · "Sen · 2 Eyl 10:05" |
| AÇIK KONULAR | radio_button_unchecked · "Sözleşme taslağı hukuk yorumu bekliyor" · "14 gün" — radio_button_unchecked · "Nakliye maliyeti kimde?" · "1 Eylül görüşmesi" |
| SENDEN BEKLENENLER | person · "Revize teklif · PDF" · "Bugün 17:00" |
| SENİN BEKLEDİKLERİN | schedule_send · "Teklif v2 için geri bildirim" · "3 gündür bekliyor" |

### 5.8 `QA` (Asistan suggested questions → answer + card)
| Question | Answer text | Card title | Card rows (icon · text · meta) |
|---|---|---|---|
| "Bugün neye odaklanmalıyım?" | "En kritik konu Ahmet'in 17:00'ye kadar beklediği revize teklif. Sonrasında 14:30 Mehmet toplantısı için 3 konuya hazırlanman yeterli." | "BUGÜNÜN 2 ÖNCELİĞİ" | mail · "Revize teklif · Ahmet" · "17:00" — event · "Mehmet ile toplantı" · "14:30" |
| "Kimlere cevap vermem gerekiyor?" | "2 kişi senden cevap bekliyor." | "SENDEN BEKLEYENLER" | person · "Ahmet Yılmaz · Revize teklif" · "Bugün 17:00" — person · "Selin Kaya · Sözleşme taslağı" · "3 saat" |
| "Yarın yoğun muyum?" | "Yarın oldukça yoğun: 09:00 ve 10:00 toplantıların arka arkaya. 14:00–16:30 arası boş; teklif hazırlamak için uygun." | "YARIN · 4 ETKİNLİK" | event · "Haftalık ekip" · "09:00" — event · "Ürün gözden geçirme" · "10:00" — medical_services · "Doktor randevusu" · "13:30" — event · "Yatırımcı görüşmesi" · "17:00" |
| "Bu hafta hangi deadline'lar var?" | "Bu hafta 3 son tarih var. İkisi ödeme, biri başvuru." | "SON TARİHLER" | flag · "Girişim programı başvurusu" · "Bugün 17:00" — autorenew · "Netflix yenileme" · "9 Eyl" — receipt_long · "Elektrik faturası · 1.842 TL" · "10 Eyl" |
| "Mehmet ile en son ne konuştuk?" | "1 Eylül'de fiyat ve teslim tarihini konuştunuz. Mehmet, Ekim başı teslim için revize teklif istedi; sen Cuma göndereceğini söyledin." | "KAYNAKLAR" | mail · "Re: Teklif · Gmail" · "1 Eyl 18:20" — call · "Görüşme notları" · "1 Eyl 15:00" |

### 5.9 `DAY` (Plan · Gün timeline)
| time | title | meta | icon | type |
|---|---|---|---|---|
| 09:00 | "Haftalık ekip" | "60 dk · Ofis" | event | event |
| 11:00 | "Ürün gözden geçirme" | "30 dk · Online" | videocam | event |
| 12:00 | "2 saat boşluk" | "Öğle yemeği ve odaklanma için uygun" | self_improvement | gap |
| 14:30 | "Mehmet ile müşteri toplantısı" | "60 dk · Ofis · Hazırlık hazır" | groups | event |
| 16:00 | "Ürün gözden geçirme" | "30 dk · Online" | videocam | event |
| 17:00 | "Başvuru son saati" | "Girişim programı · AI tespit etti" | flag | ai |
| 20:30 | "Akşam yemeği · Karaköy" | "Rezervasyon · 4 kişi" | restaurant | life |

`WEEK` (Hafta bars, px heights [top, bottom]): Pzt [38,20] · Sal [26,14] · **Çar [54,30] hot** · Per [30,10] · Cum [22,26] · **Cmt [16,8] today** · Paz [8,0].

### 5.10 `PERSON` (Kişi Zekâsı sections)
| Section | Rows (icon · text · meta) |
|---|---|
| SON KONUŞULAN KONULAR | sell · "Fiyat · %8 indirim sınırı" · "1 Eyl" — local_shipping · "Ekim başı teslim" · "1 Eyl" — description · "Sözleşme taslağı" · "22 Ağu" |
| SENDEN BEKLEDİKLERİ | person · "Revize teklif · PDF" · "Bugün 17:00" |
| SENİN BEKLEDİKLERİN | schedule_send · "Teklif v2 geri bildirimi" · "3 gün" — schedule_send · "Sözleşme hukuk yorumu" · "14 gün" |
| SON İLETİŞİM | mail · "“Fiyatı Ekim teslimatına göre güncelleyebilir misiniz?”" · "Dün 18:20 · Gmail" — call · "Telefon görüşmesi · 12 dk" · "1 Eyl 15:00" |

### 5.11 `PRO` (paywall features)
all_inclusive · "Sınırsız analiz, birden fazla hesap" — wb_twilight · "Öğle ve akşam brifingi" — groups · "Toplantı hazırlığı" — schedule_send · "Akıllı takip ve taahhütler" — headphones · "Sesli brifing" — memory · "AI hafıza ve VIP kişiler" — calendar_month · "Gelişmiş planlama"

### 5.12 `VOICE` (Ses Modu prompts → answers)
| Prompt | Answer |
|---|---|
| "Bugün ne var?" | "Bugün 4 etkinliğin ve 3 önemli mailin var. En acili Ahmet'in 17:00'ye kadar beklediği revize teklif." |
| "Brifingimi oku." | "Sabah brifingin başlıyor: Öğlene kadar toplantın bulunmuyor. Saat 14:30'da Mehmet ile müşteri toplantın var…" |
| "Yarın yoğun muyum?" | "Evet, yarın yoğun. 09:00 ve 10:00 toplantıların arka arkaya; 14:00–16:30 arası boş." |
| "Mehmet'ten cevap geldi mi?" | "Henüz gelmedi. Teklifi 3 gün önce gönderdin. İstersen bir takip mesajı hazırlayıp onayına sunabilirim." |

### 5.13 `SETTINGS` — see §4.12 table. Sample user: `userName` "Yunus", surname "Emre", initial "Y", Pro trial with 5 days left; brifing times 08:00 · 13:00 · 19:00; 6 priority rules; 4 VIP people; connections Gmail · Takvim.

---

## 6. Domain model implied by the cards

| Entity | Fields (from the prototype) | Feeds |
|---|---|---|
| **PriorityItem** (`card/priority`) | id, badgeLabel, tone, timeLabel, title, subtitle?, sourceIcon, sourceLine{provider, actor, when}, primaryAction{label,intent}, secondaryAction?, detailRoute?, status(open/done), rankSignals | Bugün, briefing "BUGÜNÜN ÖNCELİKLERİ", widgets |
| **FeedItem** | category (Mail/Takvim/Takip/Kişisel), isImportant, icon, source, timeLabel, title, summary, action{label,intent}, tone, badgeLabel, detailRoute?, lifeKind? (cargo/flight/payment/subscription/reservation/security) | Akış, briefing "KİŞİSEL GELİŞMELER", "SON TARİHLER" |
| **Mail** (`card/mail`) | id, provider, folder, from{name,email}, receivedAt, subject, body, aiSummary, keyPoints[], urgency, deadlineDetected?, attachments? | Mail detail, priorities, feed |
| **Draft** | recipient, tone, body, inReplyTo/followUpOn, status(idle/sending/sent) | Reply |
| **Approval** | kind, typeLabel, what, why, change, status, payload, createdAt, sourceRef | Onay Merkezi, Bugün pill, Profile row |
| **CalendarEvent** (`card/calendar`) | start, durationMin, title, location/isOnline, type(event/gap/ai/life), meta, prepReady, participants | Plan Gün, briefing "PROGRAMIN" |
| **CalendarInsight** (`card/ai-insight`) | kind(gap/busy/travel/conflict), title, sub, proposedSlot, task, cta | Plan |
| **Briefing** | kind, date, greeting, mood, narrative, sections[], audio{durationSec, chapters[]} | Briefing, Audio, hero |
| **MeetingPrep** | meeting, person, minutesUntil, talkingPoints[3], purpose, lastMeeting, recentMails[], openItems[], theyExpect[], youExpect[] | Prep |
| **Commitment** | text, transcript, capturedVia, capturedAt, due, person | Post, Akış "Taahhütler" |
| **Person** (`card/person`) | name, initials, palette, role, company, isVip, lastContactAt, nextMeeting, openItemCount, topics[], theyExpect[], youExpect[], lastContacts[] | Person, Prep header, correct-sheet VIP |
| **ChatMessage** | role, text, card{title, rows[]} | Asistan |
| **Reminder** | target, when(preset/custom/ai-suggested), label | remind sheet |
| **Correction** | cardId, kind(not_important/show_more/make_vip/mute), learnedMessage | correct sheet |
| **Subscription** | plan(free/pro), trialEndsAt, billing(yearly/monthly) | Profile, Paywall |

---

## 7. States matrix

| Screen | Loading / skeleton | Empty | Error | Offline | Permission denied | Dark mode |
|---|---|---|---|---|---|---|
| Bugün | not in prototype (08) | **yes** — "Her şey kontrol altında." | 08 | 08 | 02 (Gmail/Takvim izin açıklayıcı) | 03 "Bugün · Dark" |
| Akış | 08 | not designed (filter with 0 results) — needed | 08 | 08 | — | — |
| Plan | 08 | — | — | — | takvim izni: 02 | 05 (prep dark only) |
| Asistan | typing dots (1 s) | **yes** — intro + ÖNERİLEN | 08 | 08 | mic izni: 02/08 | — |
| Brifing | narrative streaming: 08 | — | — | — | — | header already dark |
| Sesli Brifing | — | — | — | — | — | always dark |
| Toplantı Hazırlığı | — | — | — | — | — | 05 dark |
| Mail | — | — | — | — | — | — |
| Yanıt | sending spinner (900 ms) | — | send error: needed | — | — | — |
| Onay Merkezi | — | **yes** — "Bekleyen işlem yok" (text only) | — | — | — | — |
| Profil / Kişi / Pro | — | — | — | — | — | — |

Dark-mode token mapping for anything not explicitly designed: bg #141311, surface #1F1E1B, surface-2 rgba(255,255,255,.08), text #F2F0EB, secondary #A39F96, tertiary #7A776F, primary #8586F2, primary-glow #A9AAF5 (AI kickers), critical-text #F08B78, warning-text #F0B85A, success-text #6FCF97, on-primary #0F0F2A (text on primary buttons). Immersive screens (briefing header, audio, voice) are identical in both modes.

---

## 8. Motion & haptics

| Element | Motion (from prototype) |
|---|---|
| Primary buttons | press `scale(.97)` .12s (hero); play button `scale(.95)` |
| card/priority removal | opacity 1→0, `scale(.96) translateY(-6px)`, .3s ease; unmount at 330 ms; list reflows |
| Toast | in: translateY 16→0 + fade .3s `cubic-bezier(.2,.8,.2,1)`; hold 2.6 s; out .32 s |
| Bottom sheet | panel translateY 100%→0 .3s `cubic-bezier(.2,.8,.2,1)`; scrim 0→.35 .25s |
| Segmented / chips / tabs | background or colour transition .15s; Planla bg .2s |
| Approval rejected | opacity → .45 over .3s |
| Success (Gönderildi) | circle scale .4→1 .5s + check .45s delayed .1s (spring-like bezier) |
| Audio waveform | per-bar `scaleY .25→1` alternate, 0.7–1.2 s, staggered 60 ms; paused when not playing; progress width .5s linear |
| Voice | pulse ring 1.6 s ease-out infinite (scale .9→1.35, opacity .6→0); 22-bar wave |
| Typing indicator | 3 dots .8 s alternate, 150 ms stagger |
| Send spinner | 16px ring, .8 s linear rotate |
| Sticky CTA | static gradient fade; content padding-bottom 130 avoids overlap |

Haptics are **not specified in this file** (08 "mikro-etkileşim notları" is the source). Suggested defaults: `impactLight` on tab change and chip select, `notificationSuccess` on card done / approve / sent, `selection` on tone change and sheet options, `impactMedium` on play/pause.

---

## 9. Dead in prototype (consolidated — wire real behaviour)

| Screen | Element | Prototype behaviour | Expected real behaviour |
|---|---|---|---|
| Bugün | p5 "Takip Et" | toast | open carrier tracking / life card detail (04) |
| Bugün | p4 "Yarın Hatırlat" | toast | create reminder (via Onay Merkezi or direct) |
| Bugün | p3 title | opens Ahmet's mail | open the Girişim Programı mail |
| Bugün | hero sub-line counts | static text | computed from today's data |
| Bugün | "···" corrections | toast only | persist preference, re-rank, update VIP list |
| Akış | "Ekle" | toast | universal capture: screenshot / PDF / link (04) |
| Akış | "Kontrol Et", "Takip Et", "Check-in", "İncele", "Teyit Et" | toast "{{action}} · Kaynak açıldı" | deep-link to provider / life-card detail |
| Akış | card body tap | none | open detail |
| Plan | day-strip cells | none | change selected day |
| Plan | timeline blocks | none | event detail |
| Plan | "Başka zaman" | toast | propose alternative slot |
| Plan | "Seçenekleri Gör" | toast | conflict resolution sheet (05) |
| Plan | "Planla" | one-way state | create task block (should go through Onay Merkezi per rule 3) with undo |
| Asistan | free-text input | no submit | send question to assistant |
| Asistan | "Hafıza" | toast | memory search (06) |
| Brifing | list rows | none | open mail / event / person |
| Sesli Brifing | speed pill | label only | change playback rate |
| Sesli Brifing | progress bar | not scrubbable | seek |
| Prep | "2 Dakikalık Özeti Oku" | toast | audio/TTS summary |
| Prep | list rows | none | open source |
| Post | quote / chips | pre-filled, static | voice capture, editable date & person |
| Mail | content | hard-coded | real mail by id |
| Yanıt | "Düzenle" | toast | inline editing of the draft |
| Onay | "Düzenle" (non-mail) | toast | open event/task editor |
| Profil | 10 settings rows | toast "… · Bkz. 07 Hesap" | settings screens (07) |
| Profil | "Çıkış Yap" | toast | sign-out with confirmation |
| Kişi | VIP pill | static | toggle VIP |
| Kişi | ask-bar text | no submit | person-scoped question |
| Pro | "Ücretsiz Dene · 7 gün" | toast | StoreKit / Play Billing trial |
| Sheet remind | "Özel zaman" | toast | date-time picker |
| Sheet correct | all options | toast | persisted preference + "Öğrendim" |
| Ses Modu | prompt chips | canned | STT + TTS |

---

## 10. Inconsistencies / open questions for design

1. **Which day is today?** Bugün kicker says "5 EYLÜL CUMARTESİ", the Plan day strip highlights **Cum 5**, and the week chart marks **Cmt** as today with the range "7–13 EYLÜL". Use the real date; treat the fixtures as illustrative.
2. "Planla" recolours the unrelated 17:00 AI block; only the newly created block should change.
3. Rule 3 says every write goes through Onay Merkezi, but "Planla", reminder presets and "Kaydet" (taahhüt) act immediately in the prototype. Decide per action (suggest: reminders/tasks for self = direct with undo; calendar & mail = Onay Merkezi).
4. Sending a follow-up from Bugün marks approval `a1` as ONAYLANDI — approvals and drafts must share an id so the state stays in sync.
5. `correct` sheet's "Bu kişiyi VIP yap" derives the person from the source string; cards without a person (kargo, Netflix) need the option hidden.
6. `text-wrap:pretty` is used on titles — RN has no equivalent; accept natural wrapping.
7. Hover styles exist for web only; on native use pressed-state colours (brand/primary-pressed, surface-2).

*End of spec.*
