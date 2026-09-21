# Design Spec — 07 · Hesap, Gizlilik, Pro, Davet

**Source of truth:** Claude Design canvas `07 Hesap Gizlilik Pro.dc.html` (12 artboards, 390×844 iOS frames, light mode only).
**Product:** Dijital Asistan — "Bugün bilmen gerekenleri, sen sormadan söyler."
**Targets:** React Native (Expo) mobile app; Next.js web where noted.
**Token names** used below refer to the shared design-token sheet (brand/primary, ink, neutral/bg, critical/text, …). Raw hex is only given where the design uses a colour that is **not** in the token sheet — those are flagged `⚠ non-token`.

Canvas intro (design intent, verbatim):

> "Ayarlar iOS gruplu liste kalıbında ama ürünün kendi yüzeyleriyle. Gizlilik Merkezi bir ayar sayfası değil, ürünün güven vaadinin görünür hâli: ne okunuyor, ne okunmuyor, ne kadar saklanıyor, nasıl silinir. Paywall'da geri sayım, sahte indirim veya gizli "kapat" yok."

Translation of intent: Settings use the iOS grouped-list pattern but with the product's own surfaces. The Privacy Centre is not a settings page, it is the visible form of the product's trust promise: what is read, what is not read, how long it is kept, how it is deleted. The paywall has no countdown, no fake discount, no hidden close button.

---

## 0. Screen index

| ID | Name (design label) | Presentation |
|----|---------------------|--------------|
| 7.1 | Profil ve Ayarlar | Modal (full-screen sheet, close "×"), opened from the avatar on Bugün |
| 7.2 | Gizlilik Merkezi | Stack push from 7.1 → "Gizlilik ve Güvenlik" |
| 7.3 | AI'ın Eriştiği Veriler | Stack push from 7.2 → "AI'ın eriştiği veriler" |
| 7.4 | Veri Saklama ve Silme · Onay sayfası | Stack push from 7.2 → "Veri saklama" + bottom sheet confirm |
| 7.5 | Paywall · Dijital Asistan PRO | Modal (full-screen sheet, close "×") |
| 7.6 | Bağlamsal Pro kapısı · Free kullanıcı | Inline card on the **Bugün** tab (not a separate screen) |
| 7.7 | Arkadaşını Davet Et | Stack push from 7.1 → "Arkadaşını Davet Et" |
| 7.8 | Görünüm ve Dil | Stack push from 7.1 → "Görünüm" (and "Dil" scrolls to the second section) |
| 7.9 | Öncelik Kuralları · Liste | Stack push from 7.1 → "Öncelik Kuralları" |
| 7.10 | Yeni Kural · Koşul + Sonuç + Önizleme | Modal (close "×") from 7.9 → "Kural Ekle" |
| 7.11 | Kuralı Düzenle · Anahtar kelime | Stack push from a 7.9 row |
| 7.12 | Kuralı Sil · Onay + geri al | Centered modal dialog over 7.11 + toast |

---

## 1. Shared frame & components (used by every artboard)

### 1.1 Device frame
- Frame 390×844, background `neutral/bg`, corner radius 44 (device only — not app UI).
- Status bar: height 54, content aligned to bottom, padding `0 30px 8px`, 15/600; time "9:41" (7.6 shows "13:00"); right cluster icons `signal_cellular_alt`, `wifi`, `battery_full` at 17px.
- Home indicator: 134×5, radius 3, `rgba(27,25,23,.25)`, 8px from bottom, centered. (Use safe-area insets in RN; don't draw it.)

### 1.2 Screen scaffold (`screen/settings-stack`)
- Content column padding `6px 20px 40px` (list screens), `6px 20px 44px` (7.7, 7.8), `6px 20px 120px` when a sticky CTA is present (7.9–7.11), `14px 20px 0` on the tab screen (7.6).
- Vertical gap between blocks: 16 (18 on 7.6, 7.7, 7.8).
- Column is `flex:1`; blocks with `margin-top:auto` pin to the bottom (7.5 CTA block, 7.7 footer).

### 1.3 Top bar (`nav/top-bar`)
- Row `space-between`, height 36.
- Left: circular icon button 36×36, `neutral/surface`, shadow `0 1px 2px rgba(27,25,23,.08)`, icon 20px `ink`. Icon is `close` for modals (7.1, 7.5, 7.10) and `arrow_back` for pushed screens (7.2, 7.3, 7.4, 7.7, 7.8, 7.9, 7.11, 7.12).
- Center (optional): kicker label 12/600, +8% tracking, `ink/tertiary`, uppercase ("YENİ KURAL", "KURALI DÜZENLE").
- Right: 36px spacer, or a text action 13/600 `ink/secondary` ("Satın alımı geri yükle" on 7.5).
- Hit target min 44×44 even though visual is 36.

### 1.4 Page title block (`text/page-title`)
- Title: **h1** 28/34 600, tracking −0.02em, `ink`.
- Subtitle (optional): 14/20 `ink/secondary`, margin-top 4, `text-wrap: pretty`.

### 1.5 Grouped list (`list/group`) — the core iOS-style pattern
- Section kicker: 12/600, +8% tracking, `ink/tertiary`, uppercase, padding `0 4px 8px`. Colour overrides: `success/text` for "OKUR", `critical/text` for "HİÇBİR ZAMAN OKUMAZ".
- Card: `neutral/surface`, radius **18**, padding `0 16px`, shadow `0 1px 2px rgba(27,25,23,.04), 0 6px 20px rgba(27,25,23,.05)`.
- Rows: flex row, gap 12, `align-items:center`. Row min-heights: 50 (settings), 52 (privacy/data/appearance/outcome), 56 (rows with a subtitle or toggle), 60 with padding `8px 0` (rules).
- Divider: `border-top: 1px solid rgba(27,25,23,.06)` on every row except the first (data script `wb()` sets `border:'0'` for index 0). ⚠ non-token — closest is `neutral/hairline`; recommend a `neutral/divider` alias = rgba(ink, .06).
- Leading icon: Material Symbols Rounded 20px, `ink/secondary`, fixed width 24. Variant: icon tile 32×32 radius 10 (`neutral/surface-2` bg + `ink/secondary` icon, or tinted soft/text pairs).
- Title: 15/500 `ink`. Optional subtitle 12 `ink/tertiary` (margin-top 2 in rule rows).
- Trailing value: 13 `ink/tertiary`.
- Trailing chevron: `chevron_right` 18px, colour `#C9C5BC` ⚠ non-token (between ink/tertiary and ink/disabled; use `ink/disabled` or add `neutral/chevron`).
- Destructive row: title and icon in `critical/text`, same row height, same list — never hidden in a separate section.
- Row press: whole row is tappable; RN `Pressable` with `neutral/surface-2` pressed background.

### 1.6 Toggle (`control/switch`)
- Track 50×30, radius 15. Knob 26×26 radius 13, `neutral/surface`, shadow `0 1px 3px rgba(0,0,0,.2)`, top 2.
- **On:** track `brand/primary`, knob `left: 22px`. **Off:** track `#D9D6D0` ⚠ non-token (recommend `neutral/track-off`), knob `left: 2px`.
- Off rows in rule lists get `opacity: .55` on the whole row.
- Motion: knob slides 200ms ease-out; disabled when "Hareketi azalt" is on. Haptic: light impact on change when "Haptik geri bildirim" is on.

### 1.7 Buttons
| Name | Size | Style |
|------|------|-------|
| `button/primary` | h52, radius 16 | `brand/primary` bg, white 15/600, shadow `0 8px 24px rgba(91,92,226,.28)`; pressed → `brand/primary-pressed` |
| `button/primary-ink` | h52, radius 16 | `ink` bg, white 15/600 (used for "Değişiklikleri Kaydet" — edits use ink, creation uses brand) |
| `button/primary-destructive` | h52, radius 16 (sheet) / h48, radius 14 (dialog) | `critical/text` (#C7432F) bg, white 15/600 (14/600 in dialog). Only ever appears inside a confirmation sheet/dialog. |
| `button/text` | h44, radius 14 (12 in dialog) | transparent, `ink/secondary` 14/600 |
| `button/text-destructive` | h48 | transparent, `critical/text` 15/600, optional leading icon 20 |
| `button/small` (gate card) | h44, radius 14 | primary: `brand/primary` white 14/600; secondary: `neutral/surface-2` `ink/secondary` 14/600, padding `0 14px` |
| `button/inline-soft` | h40, radius 12, padding `0 14px` | `brand/soft` bg, `brand/text-on-soft` 13/600, leading icon 16 ("Kopyala") |

### 1.8 Sticky bottom CTA (`layout/sticky-cta`)
- `position: sticky; bottom: 0`, padding `16px 20px 44px`, background `linear-gradient(180deg, rgba(245,244,240,0) 0%, neutral/bg 45%)` so content fades under it. Content above gets 120px bottom padding.

### 1.9 Badges / pills (`badge`)
- 11/700 (+5% tracking), padding `3px 8px`, radius 999. Colour pairs: `critical/soft`+`critical/text` (ACİL), `success/soft`+`success/text` (+14 GÜN, EN AVANTAJLI), `warning/soft`+`warning/text` (BEKLİYOR), `neutral/surface-2`+`ink/secondary` (GÖNDERİLDİ), `brand/soft`+`brand/text-on-soft` at 11/600 padding `2px 8px` (PRO).

### 1.10 Chips
- `chip/filter`: h34, radius 999, padding `0 12px`, 13/600, leading icon 16, gap 4. Unselected: `neutral/surface` + `ink/secondary` + shadow `0 1px 2px rgba(27,25,23,.06)`. Selected: `ink` bg, white text.
- `chip/suggestion`: h30, radius 999, padding `0 10px`, 12/600, `neutral/surface-2` bg, `ink/secondary`.
- `chip/token` (keyword): h34, radius 999, padding `0 6px 0 12px`, 13/600, `brand/soft` bg, `brand/text-on-soft`, trailing `close` icon 16 (removes the token).
- `chip/add`: h34, radius 999, padding `0 12px 0 8px`, 1px **dashed** `#C9C5BC` ⚠ non-token border, `ink/secondary`, leading `add` 16, label "Ekle".

### 1.11 Segmented control (`control/segmented`)
- Container `neutral/hairline` bg, radius 999, padding 3. Segments `flex:1`, h34, radius 999, 13/600. Selected: `neutral/surface` bg, `ink`, shadow `0 1px 3px rgba(27,25,23,.12)`. Unselected: `ink/secondary`.

### 1.12 Text input (`control/text-input`)
- h52, radius 16, `neutral/surface`, padding `0 16px`, 15 body. Focus ring: `box-shadow: 0 0 0 2px brand/primary`. Prefix affordance ("@") in `ink/tertiary`. Caret 2×18 `brand/primary`.

### 1.13 Bottom sheet (`overlay/sheet`)
- Scrim `rgba(27,25,23,.35)` over the whole screen.
- Sheet: `neutral/surface`, radius `28 28 0 0`, padding `10px 24px 44px`, shadow `0 -10px 40px rgba(27,25,23,.12)`. Grabber 36×5 radius 3 `#E0DED7` ⚠ non-token, centered, margin-bottom 18.
- Icon tile 52×52 radius 16 (`critical/soft` + `critical/text` icon 26).
- Title h2 22/28 600 (margin-top 14). Body 15/22 `ink/secondary` (margin-top 8). Info box `neutral/bg` radius 14 padding `12px 14px`, 13/19 `ink/secondary` (margin-top 14). Buttons column gap 8 (margin-top 18).

### 1.14 Centered dialog (`overlay/dialog`)
- Scrim `rgba(27,25,23,.35)`, dialog inset 28px each side, `neutral/surface`, radius 24, padding 22, shadow `0 20px 50px rgba(27,25,23,.25)`, text-align center.
- Icon tile 48×48 radius 16. Title 20/26 600 −0.02em (margin-top 12). Body 14/20 `ink/secondary` (margin-top 8). Buttons column gap 6 (margin-top 14): destructive h48 r14, cancel h44 r12.

### 1.15 Toast (`feedback/toast`)
- Pill: `ink` bg, white 14/500, radius 999, padding `12px 18px 12px 14px`, shadow `0 10px 30px rgba(27,25,23,.25)`; leading icon 18 `brand/dark-glow`; trailing action 14/600 `brand/dark-glow` with margin-left 6.
- Position: absolute, `left:16 right:16`, bottom 52 (above home indicator), centered. Auto-dismiss after **5 s**.

### 1.16 Dark card (`card/dark`)
- `ink` bg, white text, radius 18 (row style) or 24 (promise card). Accent icons use `brand/dark-glow` (or `#A9F0C1` ⚠ non-token for the green shield — recommend adding `success/on-dark`). Secondary text `rgba(255,255,255,.65)`.

### 1.17 Skeleton counts (from `hint-placeholder-count`)
- 7.1 settings: 3 groups × 4 rows. 7.2 privacy list: 6 rows. 7.3 reads: 5 rows. 7.5 plan table: 8 rows. 7.9 rules: 4 groups × 2 rows. Skeleton rows keep the same min-heights; use `neutral/surface-2` bars, no shimmer when "Hareketi azalt" is on.

### 1.18 Dark mode (global — the canvas has no dark artboards for section 07; apply these mappings)
- `neutral/bg` → dark bg #141311; list cards `neutral/surface` → dark surface #1F1E1B; dividers → `rgba(255,255,255,.08)`; `ink` → #F2F0EB; `ink/secondary` → #A39F96; `ink/tertiary` → #7A776F; `brand/primary` → #8586F2 (toggle-on track, CTA, selected radio); `brand/text-on-soft` links → #A9AAF5; critical text → #F08B78; warning text → #F0B85A; success text → #6FCF97; text on primary buttons → #0F0F2A.
- Dark cards (`card/dark`, Onay Merkezi, promise card, toast): keep them distinguishable — use dark surface-2 `rgba(255,255,255,.08)` over #1F1E1B with a 1px `rgba(255,255,255,.10)` border, keep glow accents.
- Circular top-bar button: dark surface with shadow removed, 1px `rgba(255,255,255,.08)` border.
- 7.8 theme preview tiles already render the real dark surfaces (#141311 / #1F1E1B / #F2F0EB) and must not be inverted.

---

## 2. Screens

---

### 7.1 · Profil ve Ayarlar

**Purpose.** Account hub: identity, subscription state, pending approvals, and the three settings groups. Also the exit point (Çıkış Yap).
**Navigation.** Full-screen modal, opened from the avatar in the Bugün header. Top-left `close`. Each row pushes a child screen inside a settings stack.

**Design note (verbatim):** "Üç grup: Asistan (davranış), Hesap (bağlantı ve gizlilik), Uygulama. Sağdaki değer sütunu mevcut durumu özetler; kullanıcı açmadan bilir." → three groups; the right-hand value column summarises current state so the user knows without opening.

#### Layout (top → bottom), gap 16
1. **Top bar** — `close` circle, no title, spacer.
2. **Profile header** (`profile/header`), row gap 14:
   - Avatar 60×60 circle, `ink` bg, white initial "Y" 22/600.
   - Name **"Yunus Emre"** 22/600 −0.02em (h2).
   - Sub-row (margin-top 2, gap 6, 13 `ink/secondary`): badge **"PRO"** (`brand/soft` / `brand/text-on-soft`, 11/600, padding 2 8, pill) + **"Deneme · 5 gün kaldı"**.
   - Trailing `edit` icon 22px `ink/disabled` (pencil).
3. **Onay Merkezi row** (`card/dark`, radius 18, padding `14px 16px`, gap 12): icon `task_alt` 22 `brand/dark-glow`; title **"Onay Merkezi"** 15/600 white; subtitle **"2 işlem onayını bekliyor"** 12 `rgba(255,255,255,.65)`; trailing `chevron_right` 20 at 60% opacity.
4. **Three list groups** (`list/group`, rows min-h 50, icon 20 `ink/secondary`, title 15/500, value 13 `ink/tertiary`, chevron):

| Group kicker | Icon | Title | Value |
|---|---|---|---|
| **ASİSTAN** | `wb_twilight` | Brifing | 08:00 · 13:00 · 19:00 |
| | `notifications` | Bildirimler | Sadece önemli |
| | `tune` | Öncelik Kuralları | 6 kural |
| | `star` | Önemli Kişiler | 6 kişi |
| | `psychology` | AI Kişiselleştirme | 7 öğrenme |
| **HESAP** | `workspace_premium` | Abonelik | Pro deneme |
| | `link` | Bağlantılar | Gmail · Takvim |
| | `shield` | Gizlilik ve Güvenlik | *(empty)* |
| | `person_add` | Arkadaşını Davet Et | +14 gün |
| **UYGULAMA** | `contrast` | Görünüm | Açık |
| | `language` | Dil | Türkçe |
| | `help` | Yardım | *(empty)* |
| | `rate_review` | Geri Bildirim | *(empty)* |

5. **"Çıkış Yap"** — `button/text-destructive`, h48, centered, 15/600 `critical/text`.
6. **Version line** — centered 12 `ink/tertiary`: **"Dijital Asistan 1.0 (240) · Sürüm notları"**.

#### Interactions
| Element | Behaviour |
|---|---|
| Close (×) | Dismiss modal → back to Bugün. |
| Avatar / `edit` icon | Open profile edit (name, avatar). |
| PRO badge / "Deneme · 5 gün kaldı" | Tap → Abonelik (7.5-style management, or paywall when trial). |
| Onay Merkezi | Push Approval Centre (section 06 spec). Badge count = pending approvals. |
| Brifing | Push briefing schedule (times 08:00/13:00/19:00, section 03). |
| Bildirimler | Push notification prefs ("Sadece önemli" is current mode). |
| Öncelik Kuralları | Push **7.9**. |
| Önemli Kişiler | Push VIP people list (section 06). |
| AI Kişiselleştirme | Push AI personalisation / learnings (section 06). |
| Abonelik | Push subscription; Free user → **7.5** paywall. |
| Bağlantılar | Push connections (same data as 7.2 "BAĞLI HESAPLAR"). |
| Gizlilik ve Güvenlik | Push **7.2**. |
| Arkadaşını Davet Et | Push **7.7**. |
| Görünüm | Push **7.8** (top). |
| Dil | Push **7.8** scrolled to "Dil". |
| Yardım | Push help / FAQ (web view or Next.js page). |
| Geri Bildirim | Open feedback composer. |
| Çıkış Yap | Confirm dialog (`overlay/dialog`, non-destructive-colour: use `ink` primary) then sign out and clear local caches. |
| Sürüm notları | Open release notes (web). |

**Dead in prototype:** all of the above (no handlers in the canvas). Edit pencil, version line link, Yardım, Geri Bildirim have no target screen designed anywhere in section 07 — engineers must define destinations.

#### States
- Loading: profile header renders immediately from cache; groups show 3×4 skeleton rows.
- Free user: badge hidden or "FREE" (`neutral/surface-2`/`ink/secondary`); sub-row "Ücretsiz plan"; Abonelik value "Free".
- Trial: badge PRO + "Deneme · N gün kaldı". Paid: "Yıllık · yenileme 12 Eyl 2027" (copy to be confirmed; not in design).
- No pending approvals: Onay Merkezi subtitle "Bekleyen işlem yok" (not in design — proposal) or hide the row.
- Offline: values may be stale; keep rows tappable.

#### Data
`user{ id, displayName, initial, avatarUrl }`, `subscription{ tier: free|trial|pro, trialDaysLeft, renewsAt }`, `approvals.pendingCount`, `settingsSummary{ briefingTimes[], notificationMode, ruleCount, vipCount, learningCount, connections[], appearance, language, referralEarnedDays }`, `app{ version, build }`.

---

### 7.2 · Gizlilik Merkezi

**Purpose.** The trust promise made visible: what is read, kept, deleted; connected accounts and their scopes.
**Navigation.** Push from 7.1 "Gizlilik ve Güvenlik". Back arrow.

**Design note (verbatim):** "Üç vaat en üstte, koyu kartta. Bağlı hesaplar kapsamı düz Türkçe yazar ("Gönderme (onaylı)"). Tehlikeli işlemler coral metin ama aynı listede; gizlenmez."

#### Layout, gap 16
1. Top bar (`arrow_back`).
2. Title block: **"Gizlilik ve Güvenlik"** (h1) / **"Neyi okuduğumu, ne kadar sakladığımı ve nasıl sileceğini burada görürsün."** (14/20 `ink/secondary`).
3. **Promise card** (`card/dark`, radius 24, padding 20, gap 12). Three rows, each `verified_user` 20 in `#A9F0C1` ⚠ non-token + 15/21 white text:
   - **"Verilerin reklamverenlere satılmaz."** (bold)
   - **"Önemli işlemler sen onaylamadan gerçekleştirilmez."**
   - **"Mail içerikleri model eğitiminde kullanılmaz."**
4. **Group "BAĞLI HESAPLAR · 2"** (`list/group`, rows min-h 56, icon tile 32 r10):
   - Gmail row: tile `critical/soft` + `mail` icon 18 `critical/text`; title **"Gmail · yunus@…com"** 15/500; sub **"Okuma · Taslak oluşturma · Gönderme (onaylı)"** 12 `ink/tertiary`; trailing **"Yönet"** 13/600 `brand/text-on-soft`.
   - Google Takvim row: tile `success/soft` + `calendar_month` 18 `success/text`; title **"Google Takvim"**; sub **"Okuma · Etkinlik oluşturma/taşıma (onaylı)"**; trailing **"Yönet"**.
5. **Group "VERİ"** (`list/group`, rows min-h 52) — from data `PRIV`:

| Icon | Title | Value | Colour |
|---|---|---|---|
| `visibility` | AI'ın eriştiği veriler | 5 alan | ink |
| `history` | Veri saklama | 90 gün | ink |
| `psychology` | AI kişiselleştirme | Açık | ink |
| `download` | Verilerimi dışa aktar | *(empty)* | ink |
| `delete_sweep` | Analiz geçmişini sil | *(empty)* | `critical/text` (icon + title) |
| `person_remove` | Hesabımı sil | *(empty)* | `critical/text` (icon + title) |

   Every row has the chevron.
6. **Compliance footer**: row gap 8, padding `0 4px`, `lock` 16 + 12/18 `ink/tertiary`: **"Uçtan uca TLS · Veriler AB'de (Frankfurt) saklanır · KVKK ve GDPR uyumlu"**.

#### Interactions
| Element | Behaviour |
|---|---|
| Yönet (Gmail) | Push account management: scope list, re-auth, disconnect (not designed — define; disconnect must use `overlay/sheet` destructive pattern from 7.4). |
| Yönet (Takvim) | Same for calendar. |
| AI'ın eriştiği veriler | Push **7.3**. Value = count of enabled read scopes. |
| Veri saklama | Push **7.4**. Value = current retention. |
| AI kişiselleştirme | Push AI personalisation (section 06); value "Açık"/"Kapalı". |
| Verilerimi dışa aktar | Start export (see 7.4 row) — show progress + share sheet when ready. |
| Analiz geçmişini sil | Open the **7.4 bottom sheet** directly. |
| Hesabımı sil | Open account-deletion sheet (same pattern as 7.4 sheet; copy not designed — must list what is deleted/preserved and require re-auth). |

**Dead in prototype:** all rows and both "Yönet" labels.

#### States
- Loading: promise card is static (render instantly); groups skeleton (6 rows for VERİ).
- No connected accounts: kicker "BAĞLI HESAPLAR · 0", card with a single CTA row "Hesap bağla" → onboarding connect flow (copy proposal).
- Account needs re-auth: row subtitle in `warning/text` "Yeniden bağlan gerekiyor" (proposal), "Yönet" becomes "Bağlan".
- Export in progress: value column "Hazırlanıyor…".

#### Data
`connections[]{ provider: gmail|google_calendar, label, maskedIdentity, scopes[]{ key, label }, approvalRequiredScopes[], status }`, `privacy{ readScopesEnabledCount, retentionDays, personalisationEnabled, lastExport{ format, sizeBytes } }`, static `promises[]`, `compliance{ region: "AB (Frankfurt)", standards: ["KVKK","GDPR"] }`.

---

### 7.3 · AI'ın Eriştiği Veriler

**Purpose.** Per-source read consent with plain-language purpose; fixed red list of what is never read.
**Navigation.** Push from 7.2. Back arrow.

**Design note (verbatim):** "'Okur / Hiçbir zaman okumaz' ikiliği yeşil-coral başlıklarla; satırlar nötr. Hassas alan tespiti cihazda yapılır, kırmızı liste sabit ve kapatılamaz." → sensitive-field detection runs on device; the red list is fixed and cannot be toggled.

#### Layout, gap 16
1. Top bar (`arrow_back`).
2. Title block: **"AI neye erişiyor?"** / **"Bugün itibarıyla. Her satırı kapatabilirsin; kapattığın alanlar analize girmez."**
3. **Group "OKUR"** — kicker colour `success/text`. Rows min-h 56: icon 20 `ink/secondary`; title 15/500; sub 12 `ink/tertiary`; trailing `control/switch`. Data `READS`:

| Icon | Title | Subtitle | Default |
|---|---|---|---|
| `mail` | Mail konu ve gövdeleri | Özetlemek için · Kopya tutulmaz | on |
| `attach_file` | Ekler (PDF, görüntü) | Fatura ve teklif tespiti | on |
| `calendar_month` | Takvim etkinlikleri | Katılımcılar ve konumlar dahil | on |
| `contacts` | Kişiler | Yalnızca isim eşleştirme | on |
| `location_on` | Konum (yaklaşık) | Yol süresi tahmini için | **off** |

4. **Group "HİÇBİR ZAMAN OKUMAZ"** — kicker colour `critical/text`. Card padding `4px 16px`, rows min-h 48, 15 regular (not 500), icon `block` 20 `critical/text`, no trailing control:
   - **"Şifreler ve doğrulama kodları"**
   - **"Banka hesap numaraları ve kart bilgileri"**
   - **"Sağlık verisi (randevu saati hariç)"**
   - **"Mesajlaşma içerikleri"**

#### Interactions
| Element | Behaviour |
|---|---|
| Each OKUR toggle | Persist immediately (optimistic), haptic light. Turning **Mail konu ve gövdeleri** off should show a confirmation dialog (`overlay/dialog`) because it disables most of the product — copy proposal: "Mail okuma kapatılsın mı?" / "Brifing ve öncelikler çalışmaz." Not in design; flag for copywriter. |
| Konum toggle on | Triggers OS location permission prompt (approximate/"reduced accuracy" is sufficient). If denied → toggle snaps back off and show inline hint "Ayarlar'dan konum iznini aç" (proposal). |
| Red-list rows | Not interactive (no chevron, no toggle). |

**Dead in prototype:** all five toggles (static `on` values).

#### States
- Loading: 5 skeleton rows with toggle placeholders.
- Permission-denied (location): row stays off; optional trailing hint.
- Offline: toggles queue and sync; show a small "Çevrimdışı · değişiklikler kaydedilecek" note (proposal).

#### Data
`readScopes[]{ key: mail_body|attachments|calendar|contacts|location, title, purpose, enabled, requiresOsPermission }`, `neverRead[] (static strings, localised)`.

---

### 7.4 · Veri Saklama ve Silme · Onay sayfası

**Purpose.** Retention window for analysis artefacts; export; destructive actions with a confirmation sheet that lists what is deleted vs preserved.
**Navigation.** Push from 7.2 "Veri saklama". Back arrow. The artboard shows the screen **with the "Analiz geçmişini sil" bottom sheet open**.

**Design note (verbatim):** "Yıkıcı işlemler: coral birincil buton yalnızca burada; 'Vazgeç' aynı boyutta ve hemen altında. Ne silinir / ne korunur açıkça listelenir."

#### Base screen layout, gap 16
1. Top bar (`arrow_back`).
2. Title block: **"Veri saklama"** / **"Analiz sonuçları ve özetler ne kadar saklansın?"**
3. **Segmented control** (`control/segmented`), 3 segments: **"30 gün"**, **"90 gün"** (selected), **"1 yıl"**.
4. Helper text 13/19 `ink/secondary`, padding `0 4px`: **"Hafıza araması bu süreyle sınırlıdır. Orijinal mailler zaten kendi hesabında; biz kopya tutmayız."**
5. **Action list** (`list/group`, rows min-h 52, 15/500):
   - `download` `ink/secondary` — **"Verilerimi dışa aktar"** — value **"JSON · 2,4 MB"**
   - `delete_sweep` `critical/text` — **"Analiz geçmişini sil"** (critical/text)
   - `person_remove` `critical/text` — **"Hesabımı sil"** (critical/text)
   (No chevrons on this list.)

#### Bottom sheet — "Analiz geçmişi silinsin mi?" (`overlay/sheet`)
- Icon tile 52 r16 `critical/soft`, `delete_sweep` 26 `critical/text`.
- Title (h2 22/28): **"Analiz geçmişi silinsin mi?"**
- Body 15/22 `ink/secondary`: **"90 günlük özetler, öncelik kararları ve hafıza dizini silinir. Maillerin ve takvimin etkilenmez. Bu işlem geri alınamaz."** — the "90 günlük" figure must reflect the currently selected retention.
- Info box (`neutral/bg`, r14, 13/19): two lines
  **"Silinen: 1.204 özet · 318 öncelik kararı · 42 kural"**
  **"Korunan: bağlantılar, ayarlar, VIP listesi"**
- Buttons: **"Geçmişi Sil"** (`button/primary-destructive`, h52 r16, `critical/text` bg) then **"Vazgeç"** (`button/text`, h44 r14). Cancel is directly below, same width, never smaller than the destructive button in hit area.

#### Interactions
| Element | Behaviour |
|---|---|
| Segment 30 gün / 90 gün / 1 yıl | Persist retention; animate selection pill (150ms). Reducing retention should warn if it will purge data (proposal: inline note, not a dialog). |
| Verilerimi dışa aktar | Kick off export job; value shows last export size; when ready present OS share sheet with the JSON. Web: download link. |
| Analiz geçmişini sil | Open the sheet above. |
| Hesabımı sil | Open account-deletion sheet (same pattern; requires re-auth; copy TBD). |
| Geçmişi Sil | Call delete; close sheet; show toast (`feedback/toast`) "Analiz geçmişi silindi" (proposal — no undo since irreversible). |
| Vazgeç / scrim tap / swipe down | Close sheet. |

**Dead in prototype:** segmented control, all three rows, both sheet buttons.

#### States
- Loading counts for the sheet: show the sheet with skeleton lines in the info box; disable "Geçmişi Sil" until counts load.
- Delete in progress: primary button shows spinner, label unchanged; disable dismiss.
- Error: keep sheet open, inline error under info box in `critical/text` "Silinemedi, tekrar dene." (proposal).
- Export not yet run: value column empty.

#### Data
`retention{ days: 30|90|365 }`, `export{ format:"JSON", sizeBytes, lastExportedAt }`, `deletionPreview{ summaries:1204, priorityDecisions:318, rules:42, preserved:["bağlantılar","ayarlar","VIP listesi"] }`.

---

### 7.5 · Paywall · Dijital Asistan PRO

**Purpose.** Honest paywall: value statement with real personal stats, transparent Free vs Pro table, two plans, free trial CTA with terms in plain text, explicit free-continue path.
**Navigation.** Full-screen modal. Entry points: 7.1 Abonelik (Free), 7.6 "7 gün ücretsiz dene", any Pro-gated feature. Close (×) visible from the first frame.

**Design note (verbatim):** "Free şeffaf: 1 mail, 1 takvim, sabah brifingi, sınırlı AI. Kapat butonu ilk saniyeden görünür; 'Free ile devam et' aynı yüzeyde. Fiyat ve yenileme koşulu CTA'nın altında düz yazı."

#### Layout, gap 16
- Screen background: `linear-gradient(180deg, brand/soft 0%, neutral/bg 32%)`.
1. Top bar: `close` circle left; right text action **"Satın alımı geri yükle"** 13/600 `ink/secondary`.
2. Hero text block:
   - Kicker row: `auto_awesome` 16 (FILL 1) + **"DİJİTAL ASİSTAN PRO"** 12/600 +8% tracking, both `brand/primary`.
   - Headline 30/36 600, tracking −0.025em (custom "paywall headline" between h1 and display): **"Tüm dijital hayatın, tek brifingde."**
   - Sub 14/20 `ink/secondary` (margin-top 6), personalised: **"Bu hafta 684 mailden 32'sini öne çıkardık; 2 sa 48 dk kazandın."**
3. **Comparison table** (`table/plan-compare`): card `neutral/surface`, r20, overflow hidden, list shadow.
   - Header grid `1fr 56px 56px`, padding `10px 16px`, 11/700 +6% `ink/tertiary`, bottom divider; cells: *(empty)*, **"FREE"**, **"PRO"** (PRO in `brand/primary`).
   - Rows grid same columns, min-h 44, padding `0 16px`, 14 `ink`; FREE cell 13 `ink/tertiary` centered; PRO cell always `check_circle` 20 FILL 1 `brand/primary`. Data `PLAN`:

| Feature | FREE | PRO |
|---|---|---|
| Bağlı mail hesabı | 1 | ✓ |
| Bağlı takvim | 1 | ✓ |
| Sabah brifingi | `check` icon (Material Symbols, `ink/tertiary`) | ✓ |
| Öğle ve akşam brifingi | — | ✓ |
| Toplantı hazırlığı | — | ✓ |
| Akıllı takip ve taahhütler | — | ✓ |
| Sesli brifing | — | ✓ |
| AI hafıza ve VIP kişiler | — | ✓ |
| Gelişmiş planlama | — | ✓ |
| AI analiz limiti | 50/gün | ✓ |

   (The "—" is an em dash string; "check" renders as the `check` glyph.)
4. **Plan picker** (`control/plan-option`), column gap 8:
   - Selected (Yıllık): border 2 `brand/primary`, r16, padding `14px 16px`, `neutral/surface`. Radio 20 circle: border 2 `brand/primary`, fill `brand/primary`, inner ring `inset 0 0 0 3px white`. Title row 15/600 **"Yıllık"** + badge **"EN AVANTAJLI"** (`success/soft`/`success/text`, 11/700). Sub 13 `ink/secondary`: **"1.490 TL / yıl · ayda 124 TL · %38 tasarruf"**.
   - Unselected (Aylık): border 2 `rgba(27,25,23,.1)`, radio border 2 `rgba(27,25,23,.2)` white fill. Title **"Aylık"**, sub **"199 TL / ay"**.
5. **CTA block** (margin-top auto, column gap 8):
   - `button/primary` **"Ücretsiz Dene · 7 gün"**
   - `button/text` **"Free ile devam et"**
   - Legal 12/18 `ink/tertiary` centered: **"7 gün sonra 1.490 TL/yıl. Bitmeden 24 saat önce hatırlatırız. İstediğin zaman iptal."** — must update to the selected plan's price ("7 gün sonra 199 TL/ay." for monthly).

#### Interactions
| Element | Behaviour |
|---|---|
| Close (×) | Dismiss; equivalent to "Free ile devam et". Never delayed or hidden. |
| Satın alımı geri yükle | StoreKit / Play restore; toast on result. |
| Plan option rows | Select plan; radio + border animate 150ms; legal text swaps. |
| Ücretsiz Dene · 7 gün | Start native IAP purchase flow for selected plan with 7-day intro trial. On success: dismiss, show toast "Pro denemen başladı" (proposal), update 7.1 badge. |
| Free ile devam et | Dismiss. If invoked from 7.6, also set the 7-day gate snooze. |
| Table rows | Not interactive. |

**Dead in prototype:** everything listed.

#### States
- Loading prices: show plan rows with skeleton price lines; CTA disabled until StoreKit products load. Never show a fake/placeholder price.
- Stats unavailable (new user with <1 week data): replace sub with generic **"Öğle ve akşam brifingleri, toplantı hazırlığı ve daha fazlası."** (proposal).
- Already trialled: CTA becomes "Pro'ya Geç" and legal loses "7 gün sonra" (proposal).
- Purchase error: inline `critical/text` message under CTA; keep sheet open.
- Web (Next.js): same layout in a centered 480px column; Stripe checkout instead of IAP.

#### Data
`paywallStats{ weekMailsScanned:684, weekHighlighted:32, timeSavedMinutes:168 }`, `plans[]{ id: yearly|monthly, title, priceFormatted, perMonthFormatted, savingsPercent, badge?, trialDays:7, isDefault }`, `features[]{ label, free: string|"check"|"—", pro:true }`.

---

### 7.6 · Bağlamsal Pro kapısı · Free kullanıcı

**Purpose.** Contextual Pro gate on the Bugün tab for Free users at midday: shows the real value ("2 gelişme") but blurs the content. Free features are never locked.
**Navigation.** Not a screen — a card variant (`card/pro-gate`) rendered in the **Bugün** tab, replacing the Öğle Nabzı card. Bottom tab bar visible.

**Design note (verbatim):** "Kapı, özelliğin gerçek değerini gösterir ('2 gelişme oldu') ama içeriği bulanıklaştırır. 'Şimdi değil' 7 gün boyunca aynı kartı tekrar göstermez. Ücretsiz özellikler kilitlenmez."

#### Layout (Bugün tab, padding `14px 20px 0`, gap 18)
- Status bar time "13:00".
1. **Bugün header**: kicker **"5 EYLÜL CUMARTESİ"** 12/600 +8% `ink/tertiary`; h1 **"İyi günler, Yunus"** (margin-top 4); right avatar 40 circle `ink` bg white "Y" 15/600 (opens 7.1).
2. **Pro gate card** (`card/pro-gate`): `neutral/surface`, r28, padding 22, list shadow.
   - Kicker row: `lock` 16 + **"ÖĞLE NABZI · PRO"** 12/600 +6% `ink/tertiary`.
   - Title h2 22/28 600 (margin-top 10): **"Sabahından beri 2 gelişme oldu."**
   - Sub 14/20 `ink/secondary` (margin-top 6): **"Öğle nabzı Pro'da. Sabah brifingin her zaman ücretsiz."**
   - Blurred content (margin-top 14): two placeholder rows h44 r12 `neutral/bg`, container `filter: blur(4px); opacity:.6; pointer-events:none`. In RN use a real blur (expo-blur) or pre-blurred skeleton; never render actual content underneath in an extractable way.
   - Action row (margin-top 16, gap 10): `button/small` primary **"7 gün ücretsiz dene"** (flex 1) + `button/small` secondary **"Şimdi değil"**.
3. Section header row (padding `4px 4px 0`): kicker **"ÖNCELİKLERİN"** + right **"3 konu"** 12 `ink/tertiary`.
4. **card/priority** (`neutral/surface`, r20, padding `14px 16px 10px`):
   - Badge **"ACİL"** (`critical/soft`/`critical/text`) + time **"08:42"** 12 `ink/tertiary`.
   - Title h3 17/23 600 −0.01em: **"Ahmet senden bugün 17:00'ye kadar revize teklif bekliyor."**
   - Meta row (margin-top 10): `mail` 16 + **"Gmail · Ahmet Yılmaz · 08:42"** 12 `ink/tertiary`.
   - Action row (margin-top 6, gap 14, padding `8px 0`, 14/600): **"Yanıtla"** `brand/text-on-soft`, **"Hatırlat"** `ink/secondary`.
5. **Bottom tab bar** (`nav/tab-bar`): h90, padding `8px 8px 28px`, `rgba(255,255,255,.92)` (blur), top hairline `rgba(27,25,23,.06)`; 4 items flex 1, icon 26 + label 11/500, gap 3. Active `brand/primary` with FILL 1. Items: `sunny` **"Bugün"** (active), `dynamic_feed` **"Akış"**, `calendar_today` **"Plan"**, `auto_awesome` **"Asistan"**.

#### Interactions
| Element | Behaviour |
|---|---|
| 7 gün ücretsiz dene | Open **7.5** paywall modal (with source = "ogle_nabzi"). |
| Şimdi değil | Dismiss card with collapse animation; set snooze `proGate.snoozedUntil = now + 7 days` for this feature key; do not show the same gate again during that period. |
| Blurred rows | Not tappable. |
| Yanıtla / Hatırlat | Standard card/priority actions (section 03/04). |
| Avatar | Open 7.1. |
| Tab bar | Standard tab navigation. |

**Dead in prototype:** both gate buttons, priority card actions, tab items.

#### States
- Pro/trial user: card replaced by the real Öğle Nabzı card.
- Snoozed: card hidden; layout collapses (no empty gap).
- No developments since morning: gate not shown (nothing to sell; keep it honest).
- Dark mode: card dark surface; blurred rows `rgba(255,255,255,.06)`.

#### Data
`proGate{ featureKey:"midday_pulse", developmentsCount:2, snoozedUntil?, trialDays:7 }`, plus the standard Bugün header/priority data.

---

### 7.7 · Arkadaşını Davet Et

**Purpose.** Referral: shareable link, send invite, invite status list, earned/limit summary.
**Navigation.** Push from 7.1 "Arkadaşını Davet Et". Back arrow.

**Design note (verbatim):** "Ödül koşulu açık: 'ilk brifingini aldığında'. Durum rozetleri sistemdeki aynı üç ton (yeşil, amber, nötr). Davet linki monospace."

#### Layout, gap 18, padding `6px 20px 44px`
1. Top bar (`arrow_back`).
2. **Referral hero** (`card/referral-hero`): gradient `160deg, #1E1E4C 0% → #3B3CA8 58% → #7071EA 100%` (map to **gradient/night**; confirm in token sheet), white text, r28, padding `26px 22px`, gap 12.
   - Avatar stack: 44 circle white with initial "Y" in `#25266A` ⚠ non-token 15/600, border 3 `#3B3CA8`; second 44 circle `rgba(255,255,255,.25)` with `person_add` 22, border 3 `#3B3CA8`, margin-left −12.
   - h1 28/34 white: **"Arkadaşını davet et, ikiniz de 14 gün Pro kazanın."**
   - Sub 14/20 `rgba(255,255,255,.78)`: **"Arkadaşın ilk brifingini aldığında Pro süreniz otomatik uzar."**
3. **Link row** (`control/copy-field`): h52, r16, `neutral/surface`, padding `0 6px 0 16px`, shadow `0 1px 2px rgba(27,25,23,.06)`; link text mono 14/500 `ink`: **"dijitalasistan.app/d/yunus-7k2"**; trailing `button/inline-soft` `content_copy` + **"Kopyala"**.
4. `button/primary` with `ios_share` 20, gap 8: **"Davet Gönder"**.
5. **Group "DAVETLERİN · 3"** (`list/group`, rows min-h 56, avatar 36 circle initials 12/600):

| Avatar | Name | Subtitle | Badge |
|---|---|---|---|
| "BT" bg `#E3EFE6` text `#1E5A36` ⚠ non-token (person avatar tint) | Burak Tan | İlk brifingini aldı · 2 Eyl | **"+14 GÜN"** success/soft + success/text |
| "DE" bg `#F5E1D6` text `#7A3E1F` ⚠ non-token | Deniz Erol | Kaydoldu, hesap bağlamadı | **"BEKLİYOR"** warning/soft + warning/text |
| `mail` icon 18 on `neutral/surface-2` / `ink/secondary` | elif.a@… | Davet gönderildi · 4 Eyl | **"GÖNDERİLDİ"** neutral/surface-2 + ink/secondary |

6. Footer (margin-top auto), centered 12 `ink/tertiary`: **"Toplam kazanılan: 14 gün Pro · Sınır: yılda 6 davet"**.

#### Interactions
| Element | Behaviour |
|---|---|
| Kopyala | Copy link to clipboard; haptic success; button label swaps to "Kopyalandı" for 2 s (proposal) or toast. |
| Davet Gönder | Open OS share sheet with link + pre-filled Turkish message (copy TBD). Web: mailto/share API. |
| Invite rows | Optional: tap to resend for GÖNDERİLDİ / BEKLİYOR (proposal). |

**Dead in prototype:** Kopyala, Davet Gönder, rows.

#### States
- No invites: group hidden or empty-state card "Henüz davet yok" (proposal); footer "Toplam kazanılan: 0 gün Pro · Sınır: yılda 6 davet".
- Limit reached (6/yr): primary button disabled (`ink/disabled` bg), footer explains.
- Offline: link still copyable (cached); list stale indicator.

#### Data
`referral{ link, code, rewardDays:14, annualLimit:6, usedThisYear, totalEarnedDays:14 }`, `invites[]{ id, displayName|maskedEmail, initials?, avatarTint?, status: sent|signed_up|rewarded, statusDate, rewardDays? }`. Status → copy: rewarded "İlk brifingini aldı · {date}" + "+14 GÜN"; signed_up "Kaydoldu, hesap bağlamadı" + "BEKLİYOR"; sent "Davet gönderildi · {date}" + "GÖNDERİLDİ".

---

### 7.8 · Görünüm ve Dil

**Purpose.** Theme, text size, accessibility toggles, app language.
**Navigation.** Push from 7.1 "Görünüm" (or "Dil", scrolled). Back arrow.

**Design note (verbatim):** "Görünüm önizlemeleri gerçek yüzey renkleriyle. Erişilebilirlik anahtarları (hareket, haptik) burada; 'Hareketi azalt' tüm mikro-etkileşimleri geçişsiz duruma alır."

#### Layout, gap 18, padding `6px 20px 44px`
1. Top bar (`arrow_back`).
2. h1 **"Görünüm"**.
3. **Theme picker** (`control/theme-tiles`): 3-column grid, gap 10. Each tile: h120, r16, border 2 (selected `brand/primary`, others transparent), padding 10, column gap 6 with mini-skeleton bars (title bar h8 w50% r4; card h36 r8; card h22 r8). Label below 13: selected 600 `ink`, others 500 `ink/secondary`.
   - **"Açık"** (selected): tile `neutral/bg`, bars `ink` / `neutral/surface`.
   - **"Koyu"**: tile dark bg #141311, bars dark text #F2F0EB / dark surface #1F1E1B.
   - **"Sistem"**: tile split `linear-gradient(100deg, neutral/bg 50%, #141311 50%)`, bars `ink` / `rgba(255,255,255,.6)`.
4. **List** (`list/group`, rows min-h 52, 15/500):
   - `format_size` — **"Metin boyutu"** — value **"Sistem"** + chevron.
   - `animation` — **"Hareketi azalt"** — toggle **off**.
   - `vibration` — **"Haptik geri bildirim"** — toggle **on**.
5. h1 **"Dil"** (margin-top 6).
6. **Language list** (`list/group`, rows min-h 52, 15/500):
   - **"Türkçe"** — trailing `check_circle` 22 FILL 1 `brand/primary` (selected, `ink` text).
   - **"English"** — `ink/secondary`, no trailing.
   - **"Deutsch"** — `ink/secondary`, no trailing.
7. Helper 13/19 `ink/secondary`, padding `0 4px`: **"Brifing ve özetler seçtiğin dilde yazılır; maillerin orijinal dili korunur."**

#### Interactions
| Element | Behaviour |
|---|---|
| Theme tiles | Set `appearance = light|dark|system`; apply immediately app-wide (RN `Appearance`/theme context; Next.js `data-theme`). Border animates 150ms. |
| Metin boyutu | Push text-size screen (not designed): options "Sistem" (follow Dynamic Type) + manual steps. |
| Hareketi azalt | When on: all animations/transitions duration 0, no shimmer, no blur transitions; also respect OS reduce-motion as default. |
| Haptik geri bildirim | Global haptics enable flag (default on). |
| Language rows | Set app + AI output language; move check; briefing language changes on next generation. Confirm with a subtle toast (proposal). |

**Dead in prototype:** tiles, all rows and toggles.

#### States
- Dark mode: tiles unchanged (they show real surfaces); rest per §1.18.
- OS reduce-motion on: "Hareketi azalt" shows on and is greyed (`ink/disabled`) with hint "Sistem ayarından" (proposal).

#### Data
`appearance{ theme: light|dark|system, textSize: system|s|m|l, reduceMotion, haptics }`, `language{ code: tr|en|de }`.

---

### 7.9 · Öncelik Kuralları · Liste

**Purpose.** User-authored explicit rules that always override AI learnings, grouped by outcome, each with an on/off switch and impact count.
**Navigation.** Push from 7.1 "Öncelik Kuralları". Back arrow. Sticky CTA opens 7.10; row tap opens 7.11.

**Design note (verbatim):** "Kurallar sonuca göre gruplanır (önemli / bildir / düşük / sessiz). Her satır: koşul tipi ikonu, kural metni, etki sayısı, aç/kapat anahtarı. Satıra dokunuş düzenlemeye gider."

#### Layout, gap 16, padding `6px 20px 120px`
1. Top bar (`arrow_back`).
2. Title block: **"Öncelik Kuralları"** / **"Senin yazdığın açık kurallar. Her zaman AI'ın kendi öğrendiklerinin önüne geçer."**
3. **Rule groups** (`list/group`, rows min-h 60, padding `8px 0`; icon tile 32 r10 `neutral/surface-2` + icon 18 `ink/secondary`; title 15/20 500 −0.01em; meta 12 `ink/tertiary` margin-top 2; trailing `control/switch`; off rows opacity .55). Data `RULES`:

| Group kicker | Icon | Rule text | Meta | On |
|---|---|---|---|---|
| **HER ZAMAN ÖNEMLİ SAY** | `person` | Mehmet Yılmaz'dan gelenler | Kişi · 9 mail etkilendi · bu ay | on |
| | `alternate_email` | @yilmazendustri.com adresinden gelenler | Domain · 14 mail · bu ay | on |
| | `match_word` | "teklif", "sözleşme", "fatura" içerenler | Anahtar kelime · 22 mail · bu ay | on |
| **HER ZAMAN BİLDİR** | `star` | VIP kişilerden gelenler | 6 kişi · Sessiz saatlerde bile | on |
| **DÜŞÜK ÖNCELİKLİ SAY** | `sell` | Promosyon ve bülten mailleri | Kategori · 131 mail · bu ay | on |
| **SESSİZE AL** | `notifications_off` | noreply@… göndericileri | Gönderici · 48 mail · bu ay | on |
| | `notifications_off` | LinkedIn bildirimleri | Gönderici · 17 mail · bu ay | **off** |

   (The keyword rule text uses Turkish typographic quotes “ ” in the design.)
4. Footer note: row gap 8, padding 4, `psychology` 18 `brand/primary` + 13/19 `ink/secondary`: **"AI'ın kendi öğrendiklerini AI Kişiselleştirme'de görürsün; burası yalnızca senin kuralların."** — "AI Kişiselleştirme" is bold `brand/text-on-soft` and is a link.
5. **Sticky CTA** (`layout/sticky-cta`): `button/primary` with `add` 20 + **"Kural Ekle"**.

#### Interactions
| Element | Behaviour |
|---|---|
| Row tap (not on switch) | Push **7.11** for that rule. |
| Switch | Toggle rule enabled; optimistic; row fades to .55; haptic. |
| "AI Kişiselleştirme" link | Push AI personalisation (section 06). |
| Kural Ekle | Present **7.10** modally. |
| Row swipe (proposal) | Leading none; trailing "Sil" → 7.12 dialog. Not in design. |

**Dead in prototype:** all rows, switches, link, CTA.

#### States
- Loading: 4 groups × 2 skeleton rows.
- Empty (no rules): title block + empty card "Henüz kural yok. İlk kuralını ekle; AI'ın kararlarının önüne geçer." (proposal) + CTA.
- Free tier: rules are available (no gate shown in design); if limited, gate with `card/pro-gate` pattern.
- Dark mode: per §1.18; icon tiles `rgba(255,255,255,.08)`.

#### Data
`rules[]{ id, conditionType: person|domain|keyword|category|sender|vip, conditionLabel, values[], outcome: always_important|high|low|always_notify|mute, affectedCount, affectedPeriod:"bu ay", enabled, createdAt, exceptions[], searchScope: subject_body|subject }`. Group order: always_important → always_notify → low → mute (high not shown in the example but exists as an outcome).

---

### 7.10 · Yeni Kural · Koşul + Sonuç + Önizleme

**Purpose.** Create a rule in one screen: condition type chips + value field, single-choice outcome, live preview against the last 30 days of real mail.
**Navigation.** Modal from 7.9 "Kural Ekle". Close (×). Sticky "Kuralı Kaydet".

**Design note (verbatim):** "İki adım tek ekranda: koşul tipi çipleri + alan, sonuç tek seçim. Önizleme kaydetmeden önce kuralın etkisini gerçek maillerle gösterir; kural yazma işlemi değil, onay istemez." → creating a rule is not an "action" and does not go through the Approval Centre.

#### Layout, gap 16, padding `6px 20px 120px`
1. Top bar: `close` left, center kicker **"YENİ KURAL"**, spacer.
2. **Section "1 · KOŞUL"**:
   - Chip row (`chip/filter`, wrap, gap 6): `person` **"Kişi"**, `alternate_email` **"Domain"** (selected, `ink` bg), `match_word` **"Anahtar kelime"**, `sell` **"Kategori"**, `outgoing_mail` **"Gönderici"**.
   - Input (`control/text-input`, margin-top 10, focused ring): prefix **"@"** `ink/tertiary`, value **"yilmazendustri.com"**, caret.
   - Suggestion chips (margin-top 8, `chip/suggestion`): **"Önerilen: @kuzeylojistik.com"**, **"@itu.edu.tr"** (suggested from frequent senders).
3. **Section "2 · SONUÇ"** — single-select list (`list/group`, rows min-h 52, 15/500). Selected row: `ink` text, icon `ink/secondary`, trailing `check_circle` 22 FILL 1 `brand/primary`. Unselected rows: `ink/secondary` text, trailing `radio_button_unchecked` 22 `#C9C5BC`.
   - `priority_high` **"Her zaman önemli say"** (selected)
   - `trending_up` **"Yüksek öncelikli say"**
   - `trending_down` **"Düşük öncelikli say"**
   - `notifications_active` **"Her zaman bildir"**
   - `notifications_off` **"Sessize al"**
4. **Section "ÖNİZLEME · SON 30 GÜN"** — `card/ai-insight`: bg `radial-gradient(140% 100% at 0% 0%, #E4E4FA 0%, neutral/surface 60%)` (brand-tinted; #E4E4FA ≈ brand/soft), r18, padding `14px 16px`, list shadow.
   - Kicker: `auto_awesome` 16 FILL 1 + **"14 MAİL BU KURALA UYARDI"** 12/600 +6% `brand/primary`.
   - Match list (margin-top 8, gap 6, 13): left `ink`, right `ink/secondary`:
     - **"Mehmet Yılmaz · Re: Teklif"** — **"Dün"**
     - **"Ayşe Kara · Sevkiyat planı"** — **"2 Eyl"**
     - **"muhasebe@yilmazendustri.com · Fatura"** — **"28 Ağu"**
   - Footnote 12 `ink/tertiary` (margin-top 8): **"3'ü bugün zaten önemli sayılıyordu; 11 mail yukarı taşınacak."**
5. **Sticky CTA**: `button/primary` **"Kuralı Kaydet"**.

#### Interactions
| Element | Behaviour |
|---|---|
| Close (×) | Dismiss; if the form is dirty ask "Kural kaydedilmedi. Çıkılsın mı?" (proposal, `overlay/dialog`, non-destructive). |
| Condition chips | Switch condition type; input changes: Kişi → contact picker/search; Domain → "@" prefixed text; Anahtar kelime → token chips input (as 7.11); Kategori → category picker (Promosyon, Bülten, Sosyal, …); Gönderici → email/pattern input ("noreply@…"). |
| Input | Debounced (400ms) → recompute preview. |
| Suggestion chips | Fill the input with that value. |
| Outcome rows | Single select; moves the check; preview footnote recalculates ("… yukarı taşınacak" wording depends on outcome). |
| Preview rows | Optional: tap opens the mail (section 04). |
| Kuralı Kaydet | Validate (condition non-empty, outcome chosen); save; dismiss; 7.9 list updates with the new row (light highlight 600ms); haptic success. |

**Dead in prototype:** all chips, input, outcome rows, CTA.

#### States
- Preview loading: kicker "HESAPLANIYOR…" with skeleton rows (proposal).
- Preview empty: **"Son 30 günde bu kurala uyan mail yok"** (proposal); still saveable.
- Invalid: CTA disabled (`ink/disabled` bg, no shadow).
- Offline: preview unavailable message; saving queues.
- Duplicate rule: inline warning "Bu koşul için zaten bir kural var" (proposal).

#### Data
Input: `draftRule{ conditionType, value|values[], outcome }`. Preview response: `preview{ matchedCount:14, samples[]{ sender, subject, dateLabel }, alreadyImportant:3, willMoveUp:11 }`.

---

### 7.11 · Kuralı Düzenle · Anahtar kelime

**Purpose.** Edit an existing keyword rule: enable/disable, edit keyword tokens, scope, outcome, exceptions; delete.
**Navigation.** Push from a 7.9 row. Back arrow. Sticky "Değişiklikleri Kaydet" (ink button).

**Design note (verbatim):** "Düzenleme aynı formun dolu hâli: kelime çipleri kaldırılıp eklenebilir, kural geçici olarak kapatılabilir. Sil yalnızca metin buton, kaydetten uzakta."

#### Layout, gap 16, padding `6px 20px 120px`
1. Top bar: `arrow_back`, center kicker **"KURALI DÜZENLE"**, spacer.
2. **Status card** (`card/rule-status`): `neutral/surface`, r18, padding `14px 16px`, list shadow, row gap 12: icon tile 32 r10 `neutral/surface-2` + `match_word` 18; **"Kural aktif"** 15/600; meta **"Oluşturuldu 12 Ağu · 22 mail etkilendi"** 12 `ink/tertiary`; trailing `control/switch` on.
3. **Section "KOŞUL · ANAHTAR KELİME"** — card r18 padding `14px 16px`:
   - Token chips (`chip/token`, wrap, gap 6): **"teklif"** ×, **"sözleşme"** ×, **"fatura"** ×, then `chip/add` **"Ekle"**.
   - Row (margin-top 10, space-between, 13): **"Konu ve gövdede ara"** `ink/secondary` + `control/switch` on.
4. **Section "SONUÇ"** (`list/group`, rows min-h 52, 15/500):
   - `priority_high` **"Her zaman önemli say"** — selected (`check_circle` FILL `brand/primary`)
   - `notifications_active` **"Her zaman bildir"** — `radio_button_unchecked`
   - `expand_more` **"Diğer sonuçlar"** — `ink/secondary`, no trailing (collapsed disclosure; expands to show Yüksek/Düşük/Sessize al).
5. **Section "İSTİSNALAR"** (`list/group`, one row min-h 52): `sell` + **"Promosyon kategorisi hariç"** + chevron.
6. `button/text-destructive` h48 with `delete` 20: **"Kuralı Sil"**.
7. **Sticky CTA**: `button/primary-ink` **"Değişiklikleri Kaydet"**.

#### Interactions
| Element | Behaviour |
|---|---|
| Status switch | Toggle enabled; title becomes "Kural kapalı" (proposal) and tile greys. |
| Token × | Remove keyword (min 1 keyword required to save). |
| Ekle | Inline text input appears in the chip row; Enter/comma commits a token. |
| Konu ve gövdede ara | Off = subject only. |
| Outcome rows | Single select. "Diğer sonuçlar" expands the remaining options with a 200ms height animation (none when reduce-motion). |
| Promosyon kategorisi hariç | Push exceptions editor (not designed): list of exception categories/senders with add/remove. |
| Kuralı Sil | Open **7.12** dialog. |
| Değişiklikleri Kaydet | Save; pop to 7.9; toast "Kural güncellendi" (proposal). Disabled until dirty. |
| Back with unsaved changes | Discard confirm (proposal). |

**Dead in prototype:** all controls.

#### States
- Loading: status card + skeleton sections.
- Rule disabled: status title "Kural kapalı" and 7.9 row at .55 opacity.
- Save error: inline `critical/text` above CTA.

#### Data
`rule{ id, conditionType:"keyword", values:["teklif","sözleşme","fatura"], searchScope:"subject_body", outcome:"always_important", exceptions:[{ type:"category", value:"promotions", label:"Promosyon kategorisi hariç" }], enabled:true, createdAt:"2026-08-12", affectedCount:22 }`.

---

### 7.12 · Kuralı Sil · Onay + geri al

**Purpose.** Confirm rule deletion via a centered dialog; after deletion show a 5-second undo toast.
**Navigation.** Dialog over 7.11 (background dimmed); toast rendered on 7.9 (or wherever the user lands) after confirm.

**Design note (verbatim):** "Silme modal ile onaylanır (geri alınamaz işlem kalıbı); ardından 5 sn 'Geri al' toast'ı. Aynı kalıp 7.4'teki veri silme ile tutarlı."

#### Background (dimmed 7.11)
- Same top bar (**"KURALI DÜZENLE"**), status card without its switch, and the keyword chip card showing **"teklif"**, **"sözleşme"**, **"fatura"** as plain `brand/soft` chips (no ×). Reduced shadows (`0 1px 2px rgba(27,25,23,.04)` only).

#### Dialog (`overlay/dialog`)
- Icon tile 48 r16 `critical/soft` + `delete` 24 `critical/text`.
- Title 20/26 600: **"Kural silinsin mi?"**
- Body 14/20 `ink/secondary`: **"“teklif, sözleşme, fatura” kuralı silinir. Bu kelimeleri içeren mailler yeniden AI'ın kendi önceliğine göre sıralanır."** (rule label interpolated).
- Buttons (column, gap 6): **"Kuralı Sil"** (`button/primary-destructive`, h48 r14, `critical/text` bg, 14/600) then **"Vazgeç"** (`button/text`, h44 r12, 14/600).

#### Toast (`feedback/toast`)
- `delete` 18 `brand/dark-glow` + **"Kural silindi"** + action **"Geri al"** (`brand/dark-glow`, 600).
- Shown for **5 s** at bottom 52, inset 16.

#### Interactions
| Element | Behaviour |
|---|---|
| Kuralı Sil | Soft-delete rule → pop to 7.9 (row removed with collapse animation) → show toast. Hard-delete after toast expires. |
| Vazgeç / scrim tap | Close dialog, stay on 7.11. |
| Geri al | Restore rule (row re-inserts in 7.9 with highlight); dismiss toast; haptic. |
| Toast timeout | Commit deletion; toast slides down. |

**Dead in prototype:** dialog buttons, toast action.

#### States
- Delete API failure: rule re-appears; toast becomes "Silinemedi" in `critical/text` accent (proposal).
- Reduce-motion: no slide; instant show/hide.
- Dark mode: dialog dark surface; toast keeps `ink`-style pill but on dark bg use surface-2 with border for contrast.

#### Data
`rule.id`, `rule.displayLabel` ("teklif, sözleşme, fatura"), `undoWindowMs: 5000`.

---

## 3. Consolidated i18n string table (verbatim, grouped by suggested namespace)

```
settings.title.approvals            = "Onay Merkezi"
settings.approvals.pending          = "{count} işlem onayını bekliyor"          // design: "2 işlem onayını bekliyor"
settings.badge.pro                  = "PRO"
settings.trial.daysLeft             = "Deneme · {days} gün kaldı"               // "Deneme · 5 gün kaldı"
settings.group.assistant            = "ASİSTAN"
settings.group.account              = "HESAP"
settings.group.app                  = "UYGULAMA"
settings.row.briefing               = "Brifing"                 value "08:00 · 13:00 · 19:00"
settings.row.notifications          = "Bildirimler"             value "Sadece önemli"
settings.row.priorityRules          = "Öncelik Kuralları"       value "{n} kural"   // "6 kural"
settings.row.vip                    = "Önemli Kişiler"          value "{n} kişi"    // "6 kişi"
settings.row.personalisation        = "AI Kişiselleştirme"      value "{n} öğrenme" // "7 öğrenme"
settings.row.subscription           = "Abonelik"                value "Pro deneme"
settings.row.connections            = "Bağlantılar"             value "Gmail · Takvim"
settings.row.privacy                = "Gizlilik ve Güvenlik"
settings.row.invite                 = "Arkadaşını Davet Et"     value "+{days} gün" // "+14 gün"
settings.row.appearance             = "Görünüm"                 value "Açık"
settings.row.language               = "Dil"                     value "Türkçe"
settings.row.help                   = "Yardım"
settings.row.feedback               = "Geri Bildirim"
settings.signOut                    = "Çıkış Yap"
settings.version                    = "Dijital Asistan {version} ({build}) · Sürüm notları"

privacy.title                       = "Gizlilik ve Güvenlik"
privacy.subtitle                    = "Neyi okuduğumu, ne kadar sakladığımı ve nasıl sileceğini burada görürsün."
privacy.promise.noAds               = "Verilerin reklamverenlere satılmaz."
privacy.promise.approval            = "Önemli işlemler sen onaylamadan gerçekleştirilmez."
privacy.promise.noTraining          = "Mail içerikleri model eğitiminde kullanılmaz."
privacy.group.connected             = "BAĞLI HESAPLAR · {n}"
privacy.connected.gmail             = "Gmail · {maskedEmail}"                     // "Gmail · yunus@…com"
privacy.connected.gmail.scopes      = "Okuma · Taslak oluşturma · Gönderme (onaylı)"
privacy.connected.calendar          = "Google Takvim"
privacy.connected.calendar.scopes   = "Okuma · Etkinlik oluşturma/taşıma (onaylı)"
privacy.action.manage               = "Yönet"
privacy.group.data                  = "VERİ"
privacy.row.aiAccess                = "AI'ın eriştiği veriler"   value "{n} alan"  // "5 alan"
privacy.row.retention               = "Veri saklama"             value "{n} gün"   // "90 gün"
privacy.row.personalisation         = "AI kişiselleştirme"       value "Açık"
privacy.row.export                  = "Verilerimi dışa aktar"
privacy.row.deleteHistory           = "Analiz geçmişini sil"
privacy.row.deleteAccount           = "Hesabımı sil"
privacy.footer.compliance           = "Uçtan uca TLS · Veriler AB'de (Frankfurt) saklanır · KVKK ve GDPR uyumlu"

dataAccess.title                    = "AI neye erişiyor?"
dataAccess.subtitle                 = "Bugün itibarıyla. Her satırı kapatabilirsin; kapattığın alanlar analize girmez."
dataAccess.group.reads              = "OKUR"
dataAccess.reads.mail               = "Mail konu ve gövdeleri"     / "Özetlemek için · Kopya tutulmaz"
dataAccess.reads.attachments        = "Ekler (PDF, görüntü)"       / "Fatura ve teklif tespiti"
dataAccess.reads.calendar           = "Takvim etkinlikleri"        / "Katılımcılar ve konumlar dahil"
dataAccess.reads.contacts           = "Kişiler"                    / "Yalnızca isim eşleştirme"
dataAccess.reads.location           = "Konum (yaklaşık)"           / "Yol süresi tahmini için"
dataAccess.group.never              = "HİÇBİR ZAMAN OKUMAZ"
dataAccess.never.passwords          = "Şifreler ve doğrulama kodları"
dataAccess.never.banking            = "Banka hesap numaraları ve kart bilgileri"
dataAccess.never.health             = "Sağlık verisi (randevu saati hariç)"
dataAccess.never.messaging          = "Mesajlaşma içerikleri"

retention.title                     = "Veri saklama"
retention.subtitle                  = "Analiz sonuçları ve özetler ne kadar saklansın?"
retention.option.30                 = "30 gün"
retention.option.90                 = "90 gün"
retention.option.365                = "1 yıl"
retention.helper                    = "Hafıza araması bu süreyle sınırlıdır. Orijinal mailler zaten kendi hesabında; biz kopya tutmayız."
retention.row.export                = "Verilerimi dışa aktar"      value "JSON · {size}"  // "JSON · 2,4 MB"
retention.row.deleteHistory         = "Analiz geçmişini sil"
retention.row.deleteAccount         = "Hesabımı sil"
retention.sheet.title               = "Analiz geçmişi silinsin mi?"
retention.sheet.body                = "{days} günlük özetler, öncelik kararları ve hafıza dizini silinir. Maillerin ve takvimin etkilenmez. Bu işlem geri alınamaz."
retention.sheet.deleted             = "Silinen: {summaries} özet · {decisions} öncelik kararı · {rules} kural"   // "1.204 özet · 318 öncelik kararı · 42 kural"
retention.sheet.preserved           = "Korunan: bağlantılar, ayarlar, VIP listesi"
retention.sheet.confirm             = "Geçmişi Sil"
retention.sheet.cancel              = "Vazgeç"

paywall.restore                     = "Satın alımı geri yükle"
paywall.kicker                      = "DİJİTAL ASİSTAN PRO"
paywall.headline                    = "Tüm dijital hayatın, tek brifingde."
paywall.stats                       = "Bu hafta {scanned} mailden {highlighted}'sini öne çıkardık; {h} sa {m} dk kazandın."  // "684 … 32 … 2 sa 48 dk"
paywall.col.free                    = "FREE"
paywall.col.pro                     = "PRO"
paywall.feature.mailAccounts        = "Bağlı mail hesabı"          free "1"
paywall.feature.calendars           = "Bağlı takvim"               free "1"
paywall.feature.morningBriefing     = "Sabah brifingi"             free ✓
paywall.feature.middayEvening       = "Öğle ve akşam brifingi"     free "—"
paywall.feature.meetingPrep         = "Toplantı hazırlığı"         free "—"
paywall.feature.followups           = "Akıllı takip ve taahhütler" free "—"
paywall.feature.voice               = "Sesli brifing"              free "—"
paywall.feature.memoryVip           = "AI hafıza ve VIP kişiler"   free "—"
paywall.feature.planning            = "Gelişmiş planlama"          free "—"
paywall.feature.aiLimit             = "AI analiz limiti"           free "50/gün"
paywall.plan.yearly                 = "Yıllık"
paywall.plan.yearly.badge           = "EN AVANTAJLI"
paywall.plan.yearly.sub             = "1.490 TL / yıl · ayda 124 TL · %38 tasarruf"
paywall.plan.monthly                = "Aylık"
paywall.plan.monthly.sub            = "199 TL / ay"
paywall.cta.trial                   = "Ücretsiz Dene · 7 gün"
paywall.cta.continueFree            = "Free ile devam et"
paywall.legal                       = "7 gün sonra 1.490 TL/yıl. Bitmeden 24 saat önce hatırlatırız. İstediğin zaman iptal."

today.dateKicker                    = "5 EYLÜL CUMARTESİ"
today.greeting.afternoon            = "İyi günler, {name}"        // "İyi günler, Yunus"
proGate.kicker                      = "ÖĞLE NABZI · PRO"
proGate.title                       = "Sabahından beri {n} gelişme oldu."
proGate.subtitle                    = "Öğle nabzı Pro'da. Sabah brifingin her zaman ücretsiz."
proGate.cta.trial                   = "7 gün ücretsiz dene"
proGate.cta.notNow                  = "Şimdi değil"
today.section.priorities            = "ÖNCELİKLERİN"
today.section.count                 = "{n} konu"                   // "3 konu"
priority.badge.urgent               = "ACİL"
priority.example.title              = "Ahmet senden bugün 17:00'ye kadar revize teklif bekliyor."
priority.example.meta               = "Gmail · Ahmet Yılmaz · 08:42"
priority.action.reply               = "Yanıtla"
priority.action.remind              = "Hatırlat"
tab.today / tab.feed / tab.plan / tab.assistant = "Bugün" / "Akış" / "Plan" / "Asistan"

referral.hero.title                 = "Arkadaşını davet et, ikiniz de 14 gün Pro kazanın."
referral.hero.sub                   = "Arkadaşın ilk brifingini aldığında Pro süreniz otomatik uzar."
referral.link                       = "dijitalasistan.app/d/{code}"   // "yunus-7k2"
referral.copy                       = "Kopyala"
referral.send                       = "Davet Gönder"
referral.group.invites              = "DAVETLERİN · {n}"
referral.status.rewarded.sub        = "İlk brifingini aldı · {date}"   // "2 Eyl"
referral.status.rewarded.badge      = "+{days} GÜN"                     // "+14 GÜN"
referral.status.signedUp.sub        = "Kaydoldu, hesap bağlamadı"
referral.status.signedUp.badge      = "BEKLİYOR"
referral.status.sent.sub            = "Davet gönderildi · {date}"       // "4 Eyl"
referral.status.sent.badge          = "GÖNDERİLDİ"
referral.footer                     = "Toplam kazanılan: {days} gün Pro · Sınır: yılda {limit} davet"

appearance.title                    = "Görünüm"
appearance.theme.light              = "Açık"
appearance.theme.dark               = "Koyu"
appearance.theme.system             = "Sistem"
appearance.row.textSize             = "Metin boyutu"     value "Sistem"
appearance.row.reduceMotion         = "Hareketi azalt"
appearance.row.haptics              = "Haptik geri bildirim"
language.title                      = "Dil"
language.tr / language.en / language.de = "Türkçe" / "English" / "Deutsch"
language.helper                     = "Brifing ve özetler seçtiğin dilde yazılır; maillerin orijinal dili korunur."

rules.title                         = "Öncelik Kuralları"
rules.subtitle                      = "Senin yazdığın açık kurallar. Her zaman AI'ın kendi öğrendiklerinin önüne geçer."
rules.group.alwaysImportant         = "HER ZAMAN ÖNEMLİ SAY"
rules.group.alwaysNotify            = "HER ZAMAN BİLDİR"
rules.group.low                     = "DÜŞÜK ÖNCELİKLİ SAY"
rules.group.mute                    = "SESSİZE AL"
rules.meta.person                   = "Kişi · {n} mail etkilendi · bu ay"
rules.meta.domain                   = "Domain · {n} mail · bu ay"
rules.meta.keyword                  = "Anahtar kelime · {n} mail · bu ay"
rules.meta.vip                      = "{n} kişi · Sessiz saatlerde bile"
rules.meta.category                 = "Kategori · {n} mail · bu ay"
rules.meta.sender                   = "Gönderici · {n} mail · bu ay"
rules.example.*                     = "Mehmet Yılmaz'dan gelenler" | "@yilmazendustri.com adresinden gelenler" | "“teklif”, “sözleşme”, “fatura” içerenler" | "VIP kişilerden gelenler" | "Promosyon ve bülten mailleri" | "noreply@… göndericileri" | "LinkedIn bildirimleri"
rules.footer                        = "AI'ın kendi öğrendiklerini AI Kişiselleştirme'de görürsün; burası yalnızca senin kuralların."
rules.cta.add                       = "Kural Ekle"

ruleNew.kicker                      = "YENİ KURAL"
ruleNew.step.condition              = "1 · KOŞUL"
ruleNew.condition.person            = "Kişi"
ruleNew.condition.domain            = "Domain"
ruleNew.condition.keyword           = "Anahtar kelime"
ruleNew.condition.category          = "Kategori"
ruleNew.condition.sender            = "Gönderici"
ruleNew.suggested                   = "Önerilen: {value}"        // "Önerilen: @kuzeylojistik.com", "@itu.edu.tr"
ruleNew.step.outcome                = "2 · SONUÇ"
rule.outcome.alwaysImportant        = "Her zaman önemli say"
rule.outcome.high                   = "Yüksek öncelikli say"
rule.outcome.low                    = "Düşük öncelikli say"
rule.outcome.alwaysNotify           = "Her zaman bildir"
rule.outcome.mute                   = "Sessize al"
ruleNew.preview.kicker              = "ÖNİZLEME · SON 30 GÜN"
ruleNew.preview.matched             = "{n} MAİL BU KURALA UYARDI"
ruleNew.preview.example.*           = "Mehmet Yılmaz · Re: Teklif" / "Dün"; "Ayşe Kara · Sevkiyat planı" / "2 Eyl"; "muhasebe@yilmazendustri.com · Fatura" / "28 Ağu"
ruleNew.preview.footnote            = "{already}'ü bugün zaten önemli sayılıyordu; {moveUp} mail yukarı taşınacak."
ruleNew.cta.save                    = "Kuralı Kaydet"

ruleEdit.kicker                     = "KURALI DÜZENLE"
ruleEdit.status.active              = "Kural aktif"
ruleEdit.status.meta                = "Oluşturuldu {date} · {n} mail etkilendi"   // "12 Ağu · 22"
ruleEdit.section.keyword            = "KOŞUL · ANAHTAR KELİME"
ruleEdit.chip.add                   = "Ekle"
ruleEdit.searchScope                = "Konu ve gövdede ara"
ruleEdit.section.outcome            = "SONUÇ"
ruleEdit.outcome.more               = "Diğer sonuçlar"
ruleEdit.section.exceptions         = "İSTİSNALAR"
ruleEdit.exception.promotions       = "Promosyon kategorisi hariç"
ruleEdit.delete                     = "Kuralı Sil"
ruleEdit.cta.save                   = "Değişiklikleri Kaydet"

ruleDelete.title                    = "Kural silinsin mi?"
ruleDelete.body                     = "“{label}” kuralı silinir. Bu kelimeleri içeren mailler yeniden AI'ın kendi önceliğine göre sıralanır."
ruleDelete.confirm                  = "Kuralı Sil"
ruleDelete.cancel                   = "Vazgeç"
ruleDelete.toast                    = "Kural silindi"
ruleDelete.toast.undo               = "Geri al"
```

---

## 4. Dead-in-prototype summary

The canvas is a static Claude Design document: **no element has a handler**; only data binding (`sc-for`) populates lists. Everything below must be wired by engineering (intended behaviour in each screen's table):

- 7.1: close, avatar/edit, PRO badge, Onay Merkezi, all 13 settings rows, Çıkış Yap, "Sürüm notları". No designed destination for edit profile, Yardım, Geri Bildirim, Bildirimler, Brifing.
- 7.2: both "Yönet", all 6 VERİ rows. No designed "manage connection" or "delete account" screens.
- 7.3: all 5 toggles.
- 7.4: segmented control, 3 rows, sheet "Geçmişi Sil"/"Vazgeç".
- 7.5: close, "Satın alımı geri yükle", plan options, "Ücretsiz Dene · 7 gün", "Free ile devam et".
- 7.6: "7 gün ücretsiz dene", "Şimdi değil", "Yanıtla", "Hatırlat", tab bar.
- 7.7: "Kopyala", "Davet Gönder", invite rows.
- 7.8: theme tiles, "Metin boyutu" (no destination designed), both toggles, language rows.
- 7.9: rows, 7 switches, "AI Kişiselleştirme" link, "Kural Ekle".
- 7.10: condition chips, input, suggestion chips, outcome rows, "Kuralı Kaydet".
- 7.11: status switch, token ×, "Ekle", scope switch, outcome rows, "Diğer sonuçlar", exception row (no destination designed), "Kuralı Sil", "Değişiklikleri Kaydet".
- 7.12: "Kuralı Sil", "Vazgeç", "Geri al".

## 5. Non-token colours to reconcile with the token sheet

| Used in | Value | Suggested token |
|---|---|---|
| Row dividers | rgba(27,25,23,.06) | `neutral/divider` (or use `neutral/hairline`) |
| Chevrons, unselected radio, dashed add-chip border | #C9C5BC | `neutral/chevron` (or `ink/disabled`) |
| Toggle off track | #D9D6D0 | `neutral/track-off` |
| Sheet grabber | #E0DED7 | `neutral/grabber` |
| Green shield icon on dark card | #A9F0C1 | `success/on-dark` |
| Referral hero gradient | 160deg #1E1E4C → #3B3CA8 (58%) → #7071EA | `gradient/night` (verify) |
| Referral avatar text / borders | #25266A / #3B3CA8 | derive from gradient/night stops |
| AI-insight preview gradient start | #E4E4FA | ≈ `brand/soft` |
| Person avatar tints (BT / DE) | #E3EFE6/#1E5A36, #F5E1D6/#7A3E1F | `card/person` avatar palette (section 06) |
| Tab bar background | rgba(255,255,255,.92) + blur | `neutral/surface` @ 92% |
