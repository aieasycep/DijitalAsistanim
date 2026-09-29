# 06 · Asistan, Ses, Hafıza, Kişiler, Onay — Implementation Spec

Source of truth: `design/claude/06 Asistan Hafiza Kisiler.dc.html` (Claude Design canvas, 10 artboards, 390×844 iPhone frames, plus the trailing `<script type="text/x-dc">` data arrays `RESULTS`, `VIP`, `PERSON`, `APPR`, `RULES`).
Audience: RN (Expo) + Next.js engineers. Engineers will **not** read the raw HTML; everything visible — layout, sizes, tokens, verbatim Turkish copy, interactions and seed data — is transcribed here.

Page title (design canvas): **"06 · Asistan, Ses, Hafıza, Kişiler, Onay"**

Design intro paragraph (verbatim, treat as product principle):

> Sohbet ikinci katmandır ve hiçbir zaman boş açılmaz: bugünün analiz özeti + 5 önerilen soru. Yanıtlar düz metin değil, kaynaklı zengin kartlardır. Her yazma isteği (mail, etkinlik, hatırlatıcı) ses modunda bile onay kartına düşer.

Four hard rules derived from it:
1. **Chat is a second layer.** The Asistan tab never opens empty: it always shows today's analysis summary + 5 suggested questions (6.1).
2. **Answers are rich, sourced cards, not plain text.** Short sentence → sourced card → follow-up chips (6.2, 6.5).
3. **Every write action (send mail, move event, create reminder) lands in an approval card** — including in voice mode (6.4, 6.8). Nothing is executed without explicit approval; there is no bulk approve.
4. **The model is transparent and editable**: every learned rule shows its source and can be edited/deleted (6.9); VIP people are a user-controlled list with AI suggestions (6.6).

Conventions used below:
- Token names follow the project palette (`brand/primary`, `ink/secondary`, …). Where the prototype uses a colour with **no token**, it is written as `raw #HEX` with a proposed mapping (see §0.4).
- Sizes are in dp/pt exactly as drawn on the 390-wide frame. Radii are from the 10/12/14/16/20/28 scale unless a circle (`999`) or the device frame (`44`, ignore) is meant.
- Strings in `code` are verbatim copy and become i18n keys. Dynamic parts are marked `{n}`. Curly quotes `“ ”` and straight apostrophes `'` are reproduced exactly as in the design.
- "Design note" = the author's caption under the artboard (transcribed verbatim, in Turkish).
- "Dead in prototype" = drawn as a static element with no behaviour. **This whole canvas is a static catalogue page** (no click handlers anywhere, unlike the working prototype in `Dijital Asistan.dc.html`), so *every* interactive element listed below is dead in the prototype and must be wired by engineers. Per-screen lists call out what each control must do.
- Icons are Material Symbols Rounded; `FILL 1` means the filled variant.

---

## 0. Shared foundations for this file

### 0.1 Artboard list

| ID | Name (design's own) | Surface type |
|----|---------------------|--------------|
| 6.1 | Asistan · Giriş (boş sohbet yok) | Tab (Asistan), light |
| 6.1D | Asistan · Giriş · Dark | Tab (Asistan), dark |
| 6.2 | Asistan · Zengin kartlı yanıt | Tab (Asistan) in conversation mode — tab bar hidden |
| 6.3 | Ses Modu · Dinliyor | Full-screen modal (voice), gradient/night |
| 6.4 | Ses Modu · Yanıt + yazma onayı | Full-screen modal (voice), gradient/night |
| 6.5 | AI Hafıza · Anlamsal arama | Stack push (from Asistan "Hafıza" pill; also reachable from any person page) |
| 6.6 | Önemli Kişiler · VIP | Stack push (from Hesap/Ayarlar 07 and from person header) |
| 6.7 | Kişi Zekâsı · Mehmet Yılmaz | Stack push (person detail; from 6.6 rows, person chips in cards, mail sender headers) |
| 6.8 | Onay Merkezi · Kontrol her zaman kullanıcıda | Stack push (from Bugün approval card, Asistan, Hesap) |
| 6.9 | AI Kişiselleştirme · “Seni nasıl tanıyor?” | Stack push (from Hesap/Gizlilik 07) |

### 0.2 Navigation map

```
Tab bar: Bugün · Akış · Plan · Asistan            (tab bar height 90, see §0.3.6)
AsistanTab
 ├─ 6.1 AssistantHome            (tab root; tab bar visible)
 │    ├─ tap suggested question / send text  → 6.2 AssistantThread (same stack, tab bar HIDDEN)
 │    ├─ tap "Hafıza" pill                    → 6.5 MemorySearch (push)
 │    ├─ tap mic (or long-press mic on Bugün) → 6.3 VoiceMode (full-screen modal, fade+scale)
 │    └─ tap recent chat row                  → 6.2 AssistantThread (loads that thread)
 ├─ 6.2 AssistantThread
 │    ├─ "Yeni sohbet"                        → 6.1 (new thread)
 │    ├─ "Yanıtla" on person row              → 04/4.5 AI Yanıt Taslağı (mail draft) for that thread
 │    ├─ "Göndermeyi Onayla"                  → creates approval → executes → success toast (see 6.8 contract)
 │    ├─ "Düzenle"                            → 04/4.5 draft editor
 │    └─ mic                                  → 6.3 VoiceMode
 ├─ 6.3 VoiceMode/Listening ── (1.2 s silence) ──▶ 6.4 VoiceMode/Answer (+ inline approval card)
 │    └─ close (X)                            → back to 6.1/6.2 (thread keeps the voice turns as text)
 ├─ 6.5 MemorySearch
 │    ├─ "Orijinali Aç"                       → source detail (04/4.4 mail detail, 05 event detail, note/doc viewer)
 │    └─ suggestion rows                       → re-run search with that query
 ├─ 6.6 VIPPeople
 │    ├─ "Kişi Ekle"                          → contact picker (native Contacts + known senders) → add to group
 │    ├─ row                                   → 6.7 PersonDetail
 │    └─ "Evet" on suggestion                  → adds Selin Kaya to VIP (undoable toast)
 ├─ 6.7 PersonDetail
 │    ├─ "VIP · Müşteri" pill                  → 6.6 (or group picker sheet)
 │    ├─ stat tiles / rows                     → source item (mail, call note, event)
 │    └─ bottom ask bar                         → 6.5 MemorySearch scoped to this person (`personId` filter)
 ├─ 6.8 ApprovalCenter
 │    ├─ "Geçmiş"                              → ApprovalHistory (30-day list; not drawn)
 │    ├─ "Onayla" / "Düzenle" / "Reddet"       → per-card actions (see 6.8)
 │    └─ done rows                              → the resulting item (sent mail / created event)
 └─ 6.9 PersonalizationRules
      ├─ edit / delete per row                 → inline editor / delete with 5 s undo toast
      └─ "Kural Ekle"                          → new-rule sheet (not drawn)
```

Deep-link targets to define (used by 03 Bugün / 04 Akış / 07 Hesap): `assistant`, `assistant/thread/{id}`, `assistant/voice`, `memory?q=…&scope=…&personId=…`, `people/vip`, `people/{id}`, `approvals`, `approvals/history`, `settings/personalization`.

### 0.3 Shared components on this page

#### 0.3.1 Status bar (all frames)
Height 54, content bottom-aligned, padding `0 30 8` (voice screens `0 10 8` because the frame itself has 20 px side padding). Clock `9:41` (dark frame shows `21:14`), then `signal_cellular_alt`, `wifi`, `battery_full` at 17. This is the OS status bar — do not draw it; use `SafeAreaView` / `useSafeAreaInsets`.

#### 0.3.2 Home indicator
134×5, radius 3, centered, bottom 8. Light: `rgba(27,25,23,.25)`; dark & voice: `rgba(255,255,255,.4)`. OS-provided; do not draw.

#### 0.3.3 Ask bar (`ask-bar`) — used on 6.1, 6.1D, 6.2, 6.7
- Container padding: `8 16 8` when above the tab bar (6.1), `8 16 44` when it is the bottom-most element (6.2), sticky wrapper `12 16 44` with a fade on 6.7.
- Pill: height 52, padding `0 6 0 16`, radius 999, background neutral/surface, shadow `0 1px 2px rgba(27,25,23,.06), 0 8px 24px rgba(27,25,23,.08)`.
- Placeholder: 15 px, ink/tertiary. Strings: `Dijital hayatına sor…` (6.1/6.2), `Mehmet hakkında sor…` → pattern `{firstName} hakkında sor…` (6.7).
- Trailing mic button: 40×40 circle, background brand/primary, icon `mic` 20 white.
- Dark: pill background dark/surface `#1F1E1B`, ring `0 0 0 1px rgba(255,255,255,.08)` + shadow `0 8px 24px rgba(0,0,0,.35)`, placeholder dark/tertiary, mic background dark/primary `#8586F2` with icon colour dark/on-primary `#0F0F2A`.
- Behaviour: tapping the text area focuses a `TextInput` (the pill grows to multi-line, max 4 lines); when text is non-empty the mic button becomes a **send** button (`arrow_upward`, same colours). Tap mic with empty text → 6.3 Voice Mode. Long-press mic → 6.3 in push-to-talk (release to send).

#### 0.3.4 Header pill (`header-pill`) — 6.1 "Hafıza", 6.2 "Yeni sohbet", 6.6 "Kişi Ekle", 6.7 "VIP · Müşteri"
- Height 36 (6.7 uses 30), radius 999, 12/600, gap 4, optional leading icon 18 (15 on 6.7).
- Neutral variant: background neutral/surface, colour ink/secondary, padding `0 12 0 8` with icon or `0 12` without, shadow `0 1px 2px rgba(27,25,23,.06)`. Dark: background dark/surface, colour dark/secondary, ring `0 0 0 1px rgba(255,255,255,.08)`.
- Primary variant (6.6 "Kişi Ekle"): background brand/primary, colour white.
- Soft variant (6.7 "VIP · Müşteri"): background brand/soft, colour brand/text-on-soft.

#### 0.3.5 Back button (`nav-back`) — 6.5, 6.6, 6.7, 6.8, 6.9
36×36 circle, background neutral/surface, shadow `0 1px 2px rgba(27,25,23,.08)`, icon `arrow_back` 20 ink. Pops the stack. iOS swipe-back gesture must also work.

#### 0.3.6 Bottom tab bar (6.1, 6.1D only)
- Height 90, padding `8 8 28`, background `rgba(255,255,255,.92)` (blur behind), border-top `1px rgba(27,25,23,.06)`.
- Four equal items, column, gap 3, label 11/500, icon 26: `sunny` `Bugün`, `dynamic_feed` `Akış`, `calendar_today` `Plan`, `auto_awesome` `Asistan`.
- Active (Asistan): brand/primary, icon `FILL 1`. Inactive: ink/tertiary.
- Dark: background `rgba(20,19,17,.92)`, border-top `rgba(255,255,255,.08)`, inactive dark/tertiary `#7A776F`, active dark/primary-glow `#A9AAF5`.
- **Hidden in conversation mode (6.2)** and on every pushed screen in this file. Animate out (translateY +90, 200 ms) when a thread starts.

#### 0.3.7 Kicker (`kicker`)
12/600, letter-spacing `.08em` (in-card kickers use `.06em`), uppercase copy, ink/tertiary (dark: dark/tertiary). Section kickers have padding `6 4 0` (6.1), `4 4 0` (6.5, 6.8), `4 4 8` (6.6, 6.9), `0 4 8` (6.7). AI kickers (inside AI cards) are brand/primary with a leading `auto_awesome` 16 `FILL 1`.

#### 0.3.8 List group (`list-group`) — 6.6, 6.7, 6.8 (done list), 6.9
Background neutral/surface, radius 18, padding `4 16`, shadow `0 1px 2px rgba(27,25,23,.04), 0 6px 20px rgba(27,25,23,.05)` ("card shadow" below). Rows are separated by `border-top: 1px solid rgba(27,25,23,.06)` on every row **except the first** (the data script sets `border: i ? '1px solid rgba(27,25,23,.06)' : '0'`). Use neutral/hairline for the divider.

#### 0.3.9 Icon tile (`icon-tile`)
- 30×30, radius 10, background neutral/surface-2, icon 17 ink/secondary (6.7, 6.9 rows).
- 28×28, radius 9 variant: neutral (6.5 source cards: surface-2 / ink/secondary) and brand (6.8 approval cards: brand/soft / brand/text-on-soft).

#### 0.3.10 Avatar (`avatar`) — initials on a tinted circle
Sizes: 32 (6.2 rows, initials 11/600), 38 (6.6 rows, 12/600), 76 (6.7 hero, 26/600). Palette used by the design (no tokens exist — see §0.4): peach `#F5E1D6/#7A3E1F`, mint `#E3EFE6/#1E5A36`, blue `#DCE4F5/#2B3F73`, neutral `neutral/surface-2 / ink/secondary`. Assign deterministically by hashing the person id; the neutral pair is used for entries without a surname (e.g. `Annem`).

#### 0.3.11 Chip (`chip`)
- Follow-up chips (6.2): height 30, padding `0 10`, radius 999, background neutral/surface, 12/600 ink/secondary, shadow `0 1px 2px rgba(27,25,23,.06)`.
- Filter chips (6.5): height 30, padding `0 10`, radius 999, 12/600; inactive background neutral/surface colour ink/secondary; **active** background ink, colour white. Horizontal scroll (`overflow` clipped in design → `ScrollView horizontal`, no scrollbar).
- Voice chips (6.3): height 36, padding `0 14`, radius 999, background `rgba(255,255,255,.12)`, 13/500 white.

#### 0.3.12 Approval card contract (`card/approval`) — 6.2 (draft variant), 6.4 (voice variant), 6.8 (full variant)
Every write action renders the same contract: **Ne yapılacak · Neden · Ne değişecek**, then a button row `Onayla` (primary, flex 1, height 42, radius 12) · `Düzenle` (brand/soft, height 42, padding `0 14`, radius 12) · `Reddet`/`İptal` (neutral/surface-2, ink/secondary, height 42, padding `0 14`, radius 12). See 6.8 for the full field list and semantics (`Reddet` is a learning signal, `İptal` is not).

#### 0.3.13 Shadows (name → value)
- `shadow/card`: `0 1px 2px rgba(27,25,23,.04), 0 6px 20px rgba(27,25,23,.05)`
- `shadow/flat`: `0 1px 2px rgba(27,25,23,.04)` (suggestion rows, stat tiles)
- `shadow/pill`: `0 1px 2px rgba(27,25,23,.06)` (chips, header pills, "Kural Ekle")
- `shadow/nav`: `0 1px 2px rgba(27,25,23,.08)` (back button)
- `shadow/askbar`: `0 1px 2px rgba(27,25,23,.06), 0 8px 24px rgba(27,25,23,.08)`
- `shadow/float-dark`: `0 12px 32px rgba(0,0,0,.25)` (approval card floating over the voice gradient)
- Dark mode replaces every drop shadow with a 1 px ring: `0 0 0 1px rgba(255,255,255,.06)` for cards/rows, `.08` for pills/ask bar (+ `0 8px 24px rgba(0,0,0,.35)` under the ask bar).

### 0.4 Raw colours used on this page that are not in the token list

| Raw value | Where | Proposed mapping |
|---|---|---|
| `linear-gradient(180deg,#15153A 0%,#25266A 70%,#3B3CA8 100%)` | 6.3/6.4 full-screen voice background | **gradient/night** (this is the canonical night gradient; confirm against 01 Tasarım Sistemi) |
| `#25266A` | mic glyph colour on the white orb (6.3, 6.4) | `voice/ink` = gradient/night mid-stop; use the gradient's 70 % stop |
| `radial-gradient(140% 100% at 0% 0%,#E4E4FA 0%,#FFFFFF 60%)` | 6.5 answer card ("CEVAP") background | **gradient/dawn** (brand-tinted paper wash from top-left) — use the same wash as 03 Bugün's hero AI card |
| `rgba(133,134,242,.16)` | 6.1D AI icon bubble background | dark/primary at 16 % → `brand/soft` (dark) |
| `#5E5B54` | 6.1D `arrow_outward` on suggestion rows | dark/disabled (add to dark scale; between dark/tertiary `#7A776F` and surface) |
| `#F5E1D6 / #7A3E1F`, `#E3EFE6 / #1E5A36`, `#DCE4F5 / #2B3F73` | avatar tints (peach / mint / blue) | `avatar/peach`, `avatar/mint`, `avatar/blue` (bg / fg pairs); neutral pair = neutral/surface-2 / ink/secondary |
| `rgba(255,255,255,.14)` / `.18` / `.12` / `.6` / `.7` / `.85` | voice screen rings, chips, quoted text, status, waveform | `voice/ring-outer`, `voice/ring-inner`, `voice/chip`, `voice/quote`, `voice/status`, `voice/wave` — white at the given alpha |
| `rgba(27,25,23,.06)` | row dividers | neutral/hairline |
| `rgba(255,255,255,.92)` / `rgba(20,19,17,.92)` | tab-bar background light / dark | neutral/surface @92 % / dark/bg @92 % over blur |

### 0.5 Dark-mode mapping (from 6.1D and the author's note)

> Bugün/Akış dark ile aynı tokenlar: yüzey #1F1E1B, hairline %6–8 beyaz, ikincil #A39F96, üçüncül #7A776F. Mikrofon dark primary (#8586F2) üzerinde #0F0F2A.

| Light | Dark |
|---|---|
| neutral/bg `#F5F4F0` | dark/bg `#141311` |
| neutral/surface `#FFFFFF` | dark/surface `#1F1E1B` |
| neutral/surface-2 | dark/surface-2 `rgba(255,255,255,.08)` |
| ink | dark/text `#F2F0EB` |
| ink/secondary | dark/secondary `#A39F96` |
| ink/tertiary | dark/tertiary `#7A776F` |
| ink/disabled | raw `#5E5B54` (dark/disabled) |
| brand/primary (fills) | dark/primary `#8586F2`; text on it dark/on-primary `#0F0F2A` |
| brand/primary (icon / active tab / kicker) | dark/primary-glow `#A9AAF5` |
| brand/soft (icon bubble) | `rgba(133,134,242,.16)` |
| drop shadows | 1 px white rings at 6–8 % |
Only 6.1 has an explicit dark artboard; apply the same mapping to 6.2, 6.5–6.9. Voice mode (6.3/6.4) is the same in both themes (already dark).

---

## 1. 6.1 · Asistan · Giriş (boş sohbet yok) — Light

### 1.1 Purpose & placement
Root of the **Asistan** tab. Never empty: shows what was analysed today, 5 data-driven suggested questions, recent threads, and the ask bar with a primary mic. This is the entry to chat (6.2), voice (6.3) and memory search (6.5).

### 1.2 Layout (top → bottom)
Frame background neutral/bg. Content column: padding `14 20 0`, gap 14, `flex: 1` (pushes the ask bar and tab bar to the bottom; on small devices the content scrolls, the ask bar and tab bar stay fixed).

1. **Header row** — `flex-row, space-between, center`.
   - Title `Asistan` — h1 28/34 600, letter-spacing −0.02em, ink.
   - Right: header-pill (neutral) icon `search` 18 + label `Hafıza`.
2. **Analysis summary card** (`card/ai-insight`, compact variant) — row, gap 10, background neutral/surface, radius 16, padding `12 14`, shadow/card.
   - Leading: 34×34 circle, background brand/soft, icon `auto_awesome` 18 `FILL 1` brand/primary.
   - Text 14/20 ink: `Bugün **46 mail**, **4 etkinlik** ve **2 takip** analiz edildi. Ne öğrenmek istersin?` → i18n `Bugün {mailCount} mail, {eventCount} etkinlik ve {followUpCount} takip analiz edildi. Ne öğrenmek istersin?` with the three counts in 600 weight.
3. **Kicker** `ÖNERİLEN` (padding `6 4 0`).
4. **Suggested questions** (`suggestion-row` ×5) — column, gap 8, 15/500 ink. Each: height 52, padding `0 16`, radius 16, background neutral/surface, row space-between, shadow/flat, trailing icon `arrow_outward` 18 ink/disabled.
   1. `Bugün neye odaklanmalıyım?`
   2. `Kimlere cevap vermem gerekiyor?`
   3. `Yarın yoğun muyum?`
   4. `Bu hafta hangi deadline'lar var?`
   5. `Mehmet ile en son ne konuştuk?` → template `{firstName} ile en son ne konuştuk?` (appears only when there is a meeting with that person today — see design note).
5. **Kicker** `SON SOHBETLER`.
6. **Recent threads** (`recent-thread-row` ×2) — column, 14 ink/secondary; each row space-between, padding `8 4`; right-side date 12 ink/tertiary.
   - `Geçen ayki uçak bileti ne kadardı?` · `Dün`
   - `Bu ay hangi ödemelerim var?` · `2 Eyl`
   Relative-date rules: `Dün`, otherwise `{d} {MMM}` (Turkish short month, e.g. `2 Eyl`); same-day threads show `HH:mm`.
7. **Ask bar** (§0.3.3) — placeholder `Dijital hayatına sor…`, mic primary. Container padding `8 16 8`.
8. **Tab bar** (§0.3.6) — Asistan active.

### 1.3 Interactions
| Element | Behaviour |
|---|---|
| `Hafıza` pill | Push 6.5 MemorySearch with empty query, keyboard focused, scope `Tümü`. |
| Analysis summary card | Tap → push 6.2 with an implicit first message "Bugün neler analiz edildi?" (assistant lists the 46/4/2 breakdown). Optional; at minimum not dead. |
| Suggested question row | Tap → open 6.2 AssistantThread, send the row text as the user's first message immediately (no need to press send). Haptic `selection`. |
| Recent thread row | Tap → 6.2 with that thread loaded, scrolled to bottom. Long-press → context menu: `Yeniden adlandır`, `Sil` (proposed; not drawn). |
| Ask bar text | Focus → keyboard; typing hides the "ÖNERİLEN/SON SOHBETLER" lists behind the keyboard (content scrolls). Send → 6.2. |
| Mic button | Tap → 6.3 Voice Mode (modal). Long-press → 6.3 push-to-talk. |
| Tab items | Standard tab switch. Re-tapping `Asistan` while in 6.2 returns to 6.1 (scroll-to-top semantics). |

### 1.4 Dead in prototype
All of the above (catalogue page). Specifically: `Hafıza` pill, 5 suggestion rows, 2 recent-thread rows, ask bar, mic button, 4 tab items.

### 1.5 States
- **Loading**: the analysis card shows a skeleton line (14 px, 2 lines) and the suggestion rows render 5 skeleton pills (height 52, radius 16, surface-2 shimmer). Kickers render immediately.
- **No analysis yet** (first day / no connected accounts): summary text `Henüz hiçbir hesap bağlı değil. Bağlantı ekleyince dijital hayatını analiz etmeye başlarım.` with a `Bağlantı Ekle` text button (brand/text-on-soft) — proposed, not drawn; links to 02/2.6.
- **No recent threads**: hide the `SON SOHBETLER` kicker and list entirely (do not render an empty state).
- **Offline**: summary card shows the last cached counts + a secondary line `Çevrimdışı · son analiz {HH:mm}`; suggestion rows still work (they open 6.2 which queues the message and shows an offline banner). Mic disabled (ink/disabled fill) with toast `Ses modu için bağlantı gerekli.`
- **Dark**: see 6.1D.

### 1.6 Data
`AssistantHomeModel { analysedAt: Date; mailCount: number; eventCount: number; followUpCount: number; suggestions: { id, text, intent, personId? }[5]; recentThreads: { id, title, lastMessageAt }[] }`. Suggestions are generated server-side from today's data (design note): meeting today → `{firstName} ile en son ne konuştuk?`; open follow-ups → `Kimlere cevap vermem gerekiyor?`; tomorrow ≥ 4 events → `Yarın yoğun muyum?`; deadlines this week → `Bu hafta hangi deadline'lar var?`; always `Bugün neye odaklanmalıyım?` first.

### 1.7 Design note (verbatim)
> Önerilen sorular günün verisine göre değişir (toplantı varsa “X ile en son ne konuştuk?” çıkar). Giriş çubuğu hap biçiminde; mikrofon birincil.

---

## 2. 6.1D · Asistan · Giriş · Dark

Same structure, copy and interactions as 6.1. Differences only (status clock `21:14`):

| Element | Light | Dark |
|---|---|---|
| Frame background / text | neutral/bg / ink | dark/bg `#141311` / dark/text `#F2F0EB` |
| `Hafıza` pill | surface, ink/secondary, shadow/pill | dark/surface, dark/secondary, ring `0 0 0 1px rgba(255,255,255,.08)` |
| Summary card | surface + shadow/card | dark/surface + ring `rgba(255,255,255,.06)` |
| AI icon bubble | brand/soft bg, brand/primary icon | `rgba(133,134,242,.16)` bg, dark/primary-glow `#A9AAF5` icon |
| Kickers | ink/tertiary | dark/tertiary `#7A776F` |
| Suggestion rows | surface + shadow/flat, arrow ink/disabled | dark/surface + ring `.06`, arrow raw `#5E5B54` |
| Recent threads text / date | ink/secondary / ink/tertiary | dark/secondary `#A39F96` / dark/tertiary |
| Ask bar pill | surface + shadow/askbar, placeholder ink/tertiary | dark/surface, ring `.08` + `0 8px 24px rgba(0,0,0,.35)`, placeholder dark/tertiary |
| Mic button | brand/primary bg, white icon | dark/primary `#8586F2` bg, dark/on-primary `#0F0F2A` icon |
| Tab bar | `rgba(255,255,255,.92)`, border `rgba(27,25,23,.06)`, inactive ink/tertiary, active brand/primary | `rgba(20,19,17,.92)`, border `rgba(255,255,255,.08)`, inactive `#7A776F`, active `#A9AAF5` |
| Home indicator | `rgba(27,25,23,.25)` | `rgba(255,255,255,.4)` |

Design note (verbatim):
> Bugün/Akış dark ile aynı tokenlar: yüzey #1F1E1B, hairline %6–8 beyaz, ikincil #A39F96, üçüncül #7A776F. Mikrofon dark primary (#8586F2) üzerinde #0F0F2A.

---

## 3. 6.2 · Asistan · Zengin kartlı yanıt

### 3.1 Purpose & placement
The conversation view of the Asistan tab (same stack as 6.1, **tab bar hidden**). Demonstrates the answer anatomy: short sentence → sourced card → follow-up chips, and the rule that mail is never sent from inside chat — a draft card ends with an approval button.

### 3.2 Layout (top → bottom)
Content column: padding `14 20 0`, gap 12, `flex: 1`, scrollable (inverted `FlatList` recommended; newest at bottom).

1. **Header row** — title `Asistan` (h1 28/34 600 −0.02em) · right header-pill (neutral, no icon, padding `0 12`) `Yeni sohbet`.
   Header is pinned; the message list scrolls beneath it.
2. **User bubble** (`bubble/user`) — align end, max-width 86 %, padding `10 14`, radius 18, background brand/primary, white 15/21: `Kimlere cevap vermem gerekiyor?`
3. **Assistant bubble** (`bubble/assistant`) — align start, max-width 86 %, padding `10 14`, radius 18, background neutral/surface, ink 15/21, shadow/card: `2 kişi senden cevap bekliyor. Ahmet'inki bugün 17:00'ye kadar; Selin'inki yarın öğlene kadar bekleyebilir.`
4. **Sourced card — people waiting** (`card/person` list embedded in chat, full width) — background neutral/surface, radius 16, padding `12 14`, shadow/card.
   - Kicker `SENDEN BEKLEYENLER` (12/600, `.06em`, ink/tertiary).
   - Rows (margin-top 8; **both** rows have a top hairline in this card): row gap 10, padding `10 0`, border-top neutral/hairline.
     - Avatar 32 (initials 11/600) · name 14/600 ink · meta 12 ink/tertiary · deadline badge 11/700 padding `3 8` radius 999 · text button `Yanıtla` 13/600 brand/text-on-soft.
     - Row 1: `AY` (peach) · `Ahmet Yılmaz` · `Revize teklif · Gmail 08:42` · badge `17:00` (critical/soft bg, critical/text) · `Yanıtla`
     - Row 2: `SK` (mint) · `Selin Kaya` · `Sözleşme 4. madde · Gmail dün` · badge `Yarın` (warning/soft bg, warning/text) · `Yanıtla`
   - Badge tone rule: due today → critical; due tomorrow/this week → warning; later → neutral (surface-2 / ink/secondary).
5. **Follow-up chips** — row, wrap, gap 6 (§0.3.11 follow-up variant): `İkisi için de taslak hazırla` · `Selin'i yarına ertele`.
6. **User bubble**: `Ahmet'e yanıt taslağı hazırla`
7. **Assistant bubble**: `Hazırladım. Profesyonel tonda, 17:00 teslimi teyit ediyor.`
8. **Draft card** (`card/approval`, draft variant) — background neutral/surface, radius 16, padding `12 14`, shadow/card.
   - AI kicker row: `auto_awesome` 16 `FILL 1` + `TASLAK · AHMET YILMAZ` (12/600 `.06em` brand/primary; pattern `TASLAK · {FULL NAME uppercased}`).
   - Body preview 14/20 ink/secondary, **2-line clamp** with ellipsis: `Merhaba Ahmet, talebiniz için teşekkürler. Revize fiyat teklifini güncellenmiş teslim tarihiyle birlikte bugün 17:00'den önce…`
   - Button row (margin-top 10, gap 8, 13/600): `Göndermeyi Onayla` (height 36, padding `0 12`, radius 12, brand/primary bg, white) · `Düzenle` (height 36, padding `0 12`, radius 12, brand/soft bg, brand/text-on-soft).
9. **Ask bar** (§0.3.3) — container padding `8 16 44` (sits directly above the home indicator; no tab bar). Placeholder `Dijital hayatına sor…`.

### 3.3 Interactions
| Element | Behaviour |
|---|---|
| `Yeni sohbet` | Archive current thread to "SON SOHBETLER", return to 6.1 state (summary + suggestions) in place. |
| Person row (avatar/name area) | Push 6.7 PersonDetail for that person. |
| `Yanıtla` | Push 04/4.5 AI Yanıt Taslağı for the referenced mail thread (`mailThreadId`). |
| Deadline badge | Non-interactive. |
| Follow-up chip | Sends the chip text as the next user message (rendered as a user bubble); chips disappear once one is chosen or the user types. |
| `Göndermeyi Onayla` | Creates an `Approval{type:'MAIL_SEND'}` and executes it immediately (this button *is* the approval — no second confirmation). Haptic `success`; card collapses to a done state `Gönderildi · {HH:mm}` with `check_circle` success (same visual as the 6.8 done rows) and the item appears in 6.8 "BUGÜN ONAYLANANLAR". On failure: card stays, toast `Gönderilemedi. Tekrar dene.` |
| `Düzenle` | Push 04/4.5 draft editor with the draft prefilled; on return the card body updates. |
| Draft card body | Tap → expands to full text in place (removes the 2-line clamp). |
| Ask bar / mic | As §0.3.3; mic opens 6.3 and the voice turns are appended to this thread as text. |
| Assistant bubble long-press | Context menu `Kopyala`, `Kaynakları Göster`, `Yanıtı Beğenmedim` (proposed, not drawn). |

### 3.4 Dead in prototype
`Yeni sohbet` pill, both `Yanıtla` text buttons, both person rows, 2 follow-up chips, `Göndermeyi Onayla`, `Düzenle`, ask bar, mic.

### 3.5 States
- **Streaming**: assistant bubble appears with a 3-dot typing indicator (ink/tertiary), then streams text; cards render after the sentence completes. Auto-scroll to bottom while streaming unless the user scrolled up (then show a `↓` pill).
- **No sourced data** for a question: assistant bubble only, e.g. `Bugün senden cevap bekleyen kimse yok.`, plus chips. No empty card.
- **Error**: assistant bubble replaced by an inline error row `Yanıt alınamadı.` + text button `Tekrar dene` (critical/text for the icon `error`, ink/secondary text).
- **Offline**: user bubbles queue with a clock icon and 60 % opacity; banner under the header `Çevrimdışı — mesajlar bağlanınca gönderilecek.` (neutral/surface-2, 13, ink/secondary).
- **Dark**: bubbles — user stays brand/primary (dark/primary with dark/on-primary text), assistant dark/surface with ring; cards dark/surface; chips dark/surface with ring.

### 3.6 Data
`ThreadMessage = { id, role:'user'|'assistant', text, createdAt, cards?: Card[], chips?: string[] }`
`Card = PeopleWaitingCard { kicker; rows: { personId, initials, avatarTone, name, subject, source:'Gmail'|'Outlook'|…, receivedAt, dueAt, dueLabel, mailThreadId }[] } | DraftCard { approvalId, recipientId, recipientName, bodyPreview, bodyFull, tone:'professional'|…, confirmsDeadlineAt? } | … (04 spec card types)`

### 3.7 Design note (verbatim)
> Yanıt anatomisi: kısa cümle → kaynaklı kart → devam çipleri. Sohbet içinden mail gönderilmez; taslak kartı onay butonuyla biter. Sohbette alt sekme çubuğu gizlenir.

---

## 4. 6.3 · Ses Modu · Dinliyor

### 4.1 Purpose & placement
Full-screen **modal** voice mode (presented over the tab bar from the mic button on 6.1/6.2/6.7, or by long-pressing the mic on the Bugün tab). Listening state.

### 4.2 Layout (top → bottom)
Frame: background gradient/night (`linear-gradient(180deg,#15153A 0%,#25266A 70%,#3B3CA8 100%)`), text white, frame padding `0 20 44`, column.

1. **Status bar** (padding `0 10 8`).
2. **Top row** (margin-top 8, space-between, center): kicker `SES MODU` (12/600 `.08em`, white @70 %) · close button 36×36 circle background `rgba(255,255,255,.14)`, icon `close` 20 white.
3. **Centre stage** (`flex: 1`, column, centered, gap 28, text-align center):
   - **Mic orb** 120×120: outer ring full-size circle `rgba(255,255,255,.14)`; inner ring inset 14 (92×92) `rgba(255,255,255,.18)`; core 80×80 white circle with `mic` 36 in raw `#25266A`.
   - **Waveform** (`{{ wave }}` from the script): container height 44, row, gap 4, 22 bars of width 4, radius 2, colour `rgba(255,255,255,.85)`. Static heights in the design follow `10 + ((i*11) % 6) * 6` → the repeating sequence **10, 40, 34, 28, 22, 16** px (i = 0…21). In the app, drive bar heights from live mic amplitude (10 px floor, 40 px cap).
   - **Live transcript** 22/30 600 −0.01em, max-width 300: `“Mehmet'ten cevap geldi mi?”` (rendered in curly quotes as the user speaks; partial results update in place).
   - **Status line** 14, white @70 %: `Dinliyorum…`
4. **Quick prompts** (row, wrap, center, gap 8; voice chips §0.3.11): `Bugün ne var?` · `Brifingimi oku.` · `Yarın yoğun muyum?`
5. Home indicator (white @40 %).

### 4.3 Interactions
| Element | Behaviour |
|---|---|
| Close (X) | Stop recording, dismiss modal (fade + scale-down 200 ms). If a partial transcript exists, discard it (no message sent). |
| Mic orb | Tap → toggle pause/resume listening (status becomes `Duraklatıldı`). In push-to-talk (long-press entry) the orb is "held": release sends. |
| Quick prompt chip | Sends that text as if spoken; goes straight to 6.4 with the answer. `Brifingimi oku.` triggers TTS playback of today's briefing (03). |
| Silence | After **1.2 s** of silence with a non-empty transcript, auto-submit → 6.4. |
| Swipe down | Same as Close. |

### 4.4 Dead in prototype
Close button, mic orb, 3 quick-prompt chips.

### 4.5 States
- **Permission denied (microphone)**: replace orb with `mic_off` in the core, transcript area text `Mikrofon izni gerekli.` and a white pill button `Ayarları Aç` (opens OS settings). Status line hidden.
- **Speech recognition unavailable / offline**: status `Bağlantı yok — ses modu kullanılamıyor.`; quick prompts hidden; close remains.
- **No speech detected** for 8 s: status `Seni duyamadım. Tekrar dene.`; orb stops breathing; tap orb to restart.
- **Processing** (between silence and answer): waveform freezes, status `Düşünüyorum…`, orb pulses slower.
- **Dark**: identical (already dark).

### 4.6 Motion / haptics
- Orb "breathes": outer ring scale 1.0 → 1.08 → 1.0 over 2.4 s ease-in-out, looping; inner ring same at 1.0 → 1.05 with 300 ms phase offset. Amplitude of the breath increases with mic level.
- Waveform bars animate height with spring (stiffness 180, damping 14) toward live amplitude, 60 fps.
- Entry: modal fades in from the mic button (scale 0.92 → 1, 220 ms) with haptic `impactMedium` on open; `selection` tick when the transcript is auto-submitted.
- Transcript text uses a subtle fade-in per word (60 ms).

### 4.7 Design note (verbatim)
> Nefes alan halka + dalga formu. Bugün'den uzun basılı mikrofonla da açılır. Konuşma metni canlı yazılır; sessizlikte 1,2 sn sonra yanıt.

---

## 5. 6.4 · Ses Modu · Yanıt + yazma onayı

### 5.1 Purpose & placement
Second state of the same voice modal: the spoken answer is shown as text (and read aloud), and because the user asked for a write action, an **approval card** appears *inside* voice mode. Voice can confirm, but the card is always visible.

### 5.2 Layout (top → bottom)
Same frame and top row as 6.3.

1. **Top row**: `SES MODU` · close.
2. **Conversation column** (`flex: 1`, justify center, gap 16, left-aligned):
   - Quoted user turn — 14, white @60 %: `“Mehmet'ten cevap geldi mi?”`
   - Assistant answer — 22/30 600 −0.01em white, `text-wrap: pretty`: `Henüz gelmedi. Teklifi 3 gün önce gönderdin. İstersen kısa bir takip mesajı hazırlayıp onayına sunabilirim.`
   - Quoted user turn — 14, white @60 %: `“Evet, hazırla.”`
   - **Approval card** (`card/approval`, voice variant) — background white, text ink, radius 20, padding 16, shadow/float-dark:
     - AI kicker: `auto_awesome` 16 `FILL 1` + `ONAY GEREKİYOR · MAİL GÖNDER` (12/600 `.06em` brand/primary; pattern `ONAY GEREKİYOR · {ACTION TYPE}`).
     - Title (margin-top 8) 16/600 −0.01em: `Mehmet Yılmaz'a takip mesajı`
     - Preview (margin-top 6) 14/20 ink/secondary: `“Merhaba Mehmet, 2 Eylül'de ilettiğim teklif hakkında görüşünüzü alabilir miyim? …”`
     - Button row (margin-top 12, gap 8, 13/600): `Onayla` (flex 1, height 42, radius 12, brand/primary, white) · `Düzenle` (height 42, padding `0 14`, radius 12, brand/soft, brand/text-on-soft) · `İptal` (height 42, padding `0 14`, radius 12, neutral/surface-2, ink/secondary).
     - Voice hint (margin-top 10) 12 ink/tertiary with `mic` 14: `“Onayla” diyerek de gönderebilirsin.`
3. **Mic button** — centered, 64×64 white circle, `mic` 30 raw `#25266A`.
4. Home indicator.

### 5.3 Interactions
| Element | Behaviour |
|---|---|
| Close (X) | Dismiss modal. A pending approval card is **not** lost: it is queued in 6.8 (Onay Bekleyenler) and a toast on the underlying screen says `Onay bekleyen 1 işlem var.` |
| `Onayla` (tap **or** the spoken word "Onayla" / "Evet, gönder") | Execute the write action. Card morphs to done: kicker `GÖNDERİLDİ`, `check_circle` success; TTS says `Gönderildi.`; haptic `success`. Added to 6.8 done list. |
| `Düzenle` | Leaves voice mode → opens the text editor for the draft (04/4.5) with the draft prefilled. Design note: "“Düzenle” metin moduna geçer." |
| `İptal` (or spoken "İptal"/"Vazgeç") | Discards the proposed action. **Not** a learning signal (does not down-weight future suggestions). Card slides out; assistant says `Tamam, göndermedim.` |
| Mic button | Tap → return to listening (6.3 layout) for the next turn; the previous turns stay in the thread. |
| Assistant answer text | Tap → pause/resume TTS. |

Speech-command grammar for the card (Turkish, case-insensitive, allow fillers): approve = {`onayla`, `gönder`, `evet gönder`, `tamam gönder`}; edit = {`düzenle`, `değiştir`}; cancel = {`iptal`, `vazgeç`, `gönderme`}. Anything else is treated as a new query.

### 5.4 Dead in prototype
Close, `Onayla`, `Düzenle`, `İptal`, mic button.

### 5.5 States
- **Answer streaming**: the 22 px answer types in as it is generated; TTS starts at the first sentence boundary.
- **No write action requested**: no approval card; only the answer + mic button, and the 6.3 quick-prompt chips reappear under the answer.
- **Action fails**: card stays, red inline line under buttons `Gönderilemedi. Tekrar dene.` (critical/text 12), `Onayla` label becomes `Tekrar Dene`.
- **Low confidence answer** (< 70 % memory match, see 6.5): the answer text is prefixed by `Emin değilim, ama ` and the source count is spoken.
- **Offline**: 6.3 offline state applies; 6.4 is unreachable.

### 5.6 Motion / haptics
- Approval card slides up from the bottom (translateY 24 → 0, opacity 0 → 1, 260 ms ease-out) with haptic `impactLight` when it appears — the user must notice a write is pending.
- On approve: buttons crossfade to the done row; success haptic.
- The mic button pulses (scale 1 → 1.04) only while TTS is *not* playing (signals "your turn").

### 5.7 Design note (verbatim)
> Sesle onay mümkündür ama kart her zaman görünür: kullanıcı ne gönderileceğini okur. “İptal” öğrenme sinyali üretmez; “Düzenle” metin moduna geçer.

---

## 6. 6.5 · AI Hafıza · Anlamsal arama

### 6.1 Purpose & placement
Semantic memory search across everything the assistant has ingested (mail, calendar, notes, documents, call notes). Pushed from the `Hafıza` pill (6.1) or from a person page's ask bar (6.7, pre-scoped to that person). Answer card first, sources below.

### 6.2 Layout (top → bottom)
Frame background neutral/bg, `min-height: 844` (content scrolls). Content column: padding `6 20 40`, gap 14.

1. **Search row** — row, gap 10: nav-back (§0.3.5) · **search field** `flex: 1`, height 44, padding `0 14`, radius 999, background neutral/surface, shadow/pill: leading `search` 18 ink/tertiary · query text 15 ink `Mehmet fiyat konusunda en son ne demişti?` · trailing `close` 18 ink/tertiary (clear).
2. **Scope chips** (horizontal scroll, gap 6, filter variant §0.3.11): `Tümü` (active: ink bg, white) · `Mail` · `Takvim` · `Notlar` · `Belgeler` · `Son 30 gün`.
   Semantics: the first five are mutually exclusive source scopes; `Son 30 gün` is an independent time toggle (can be combined). Person scope (from 6.7) appears as an extra leading chip `{firstName}` with a `close` glyph (proposed, not drawn).
3. **Answer card** (`card/ai-insight`, hero variant) — background gradient/dawn (`radial-gradient(140% 100% at 0% 0%, #E4E4FA 0%, #FFFFFF 60%)`), radius 20, padding 16, shadow/card.
   - AI kicker `auto_awesome` 16 `FILL 1` + `CEVAP` (12/600 `.06em` brand/primary).
   - Answer (margin-top 8) 16/23 ink, `text-wrap: pretty`, key facts in 600: `Mehmet en son **dün 18:20**'de fiyatın **Ekim teslimatına göre güncellenmesini** istedi. 1 Eylül görüşmesinde ise %8'in üzerinde indirimin yönetim onayı gerektirdiğini söylemişti.`
   - Meta (margin-top 10) 12 ink/tertiary: `3 kaynaktan · %92 eşleşme` → pattern `{n} kaynaktan · %{match} eşleşme`.
4. **Kicker** `KAYNAKLAR · 3` → `KAYNAKLAR · {n}` (padding `4 4 0`).
5. **Source cards** (`card/source` ×3, from `RESULTS`) — each background neutral/surface, radius 18, padding `14 16`, shadow/card:
   - Header row (gap 8): icon-tile 28/radius 9 neutral with `{icon}` 17 · source label `{src}` 12 ink/tertiary `flex: 1` · date `{date}` 12 ink/tertiary.
   - Title (margin-top 8) 15/21 500 ink: `{title}`.
   - AI summary (margin-top 4) 14/20 ink/secondary, `text-wrap: pretty`: `{sum}`.
   - Link (margin-top 8) 13/600 brand/text-on-soft + `open_in_new` 16: `Orijinali Aç`.

   | # | icon | src | date | title | sum |
   |---|---|---|---|---|---|
   | 1 | `mail` | `Gmail · Mehmet Yılmaz` | `Dün 18:20` | `Re: Teklif` | `“Fiyatı Ekim teslimatına göre güncelleyebilir misiniz? Yönetim toplam tutarı görmek istiyor.”` |
   | 2 | `call` | `Görüşme notu · Sen` | `1 Eyl 15:00` | `Telefon görüşmesi · 12 dk` | `%8 üzeri indirim için yönetim onayı gerektiğini söyledi. Teslim tarihi Ekim başı olarak konuşuldu.` |
   | 3 | `description` | `Ek · Teklif_v2.pdf` | `2 Eyl 10:05` | `Teklif v2 · Sayfa 3, Fiyatlandırma` | `Birim fiyat 1.240 TL, 500 adet üzeri %6 indirim. Teslim: siparişten 4 hafta sonra.` |

   Source-label pattern: `{Provider} · {Sender}` for mail, `Görüşme notu · {Author}` for call notes, `Ek · {filename}` for attachments, `Takvim · {calendarName}` for events, `Not · {title}` for notes. Icon map: mail→`mail`, call note→`call`, attachment/doc→`description`, event→`event`, note→`sticky_note_2`.
6. **Kicker** `BUNLARI DA SORABİLİRSİN`.
7. **Related questions** (column, gap 6, 14 ink; each padding `10 14`, radius 14, background neutral/surface, shadow/flat):
   - `Geçen ay aldığım uçak bileti ne kadardı?`
   - `Bu ay hangi ödemelerim var?`
   - `Kimlere dönüş yapmam gerekiyor?`
8. Home indicator.

### 6.3 Interactions
| Element | Behaviour |
|---|---|
| Back | Pop to 6.1 / 6.7. |
| Search field | Editable `TextInput`; submit runs the search (debounce not needed — semantic search runs on submit only). Recent queries appear as a dropdown list when focused and empty (proposed). |
| Clear (×) | Empties the query, shows the empty state (§6.5). |
| Scope chips | Toggle scope and re-run the search; active chip is ink/white; haptic `selection`. |
| Answer card | Long-press → `Kopyala`. Tapping a bold fact scrolls to the source card it came from (proposed, ties to `sourceRefs`). |
| `Orijinali Aç` | Opens the original item: mail → 04/4.4 Mail Detayı; call note → note viewer; attachment → PDF viewer (04/4.12 style) at the referenced page; event → 05 event detail. |
| Source card body | Same as `Orijinali Aç`. |
| Related question row | Replaces the query and re-runs the search. |

### 6.4 Dead in prototype
Back, search field, clear icon, 6 scope chips, 3 `Orijinali Aç` links, 3 related-question rows.

### 6.5 States
- **Empty (no query)**: hide answer/sources; show kicker `SON ARAMALAR` with the last 5 queries as rows (same style as related questions) and, below, `BUNLARI SORABİLİRSİN` with 3 generated suggestions. If no history: single card `Mailler, takvim, notlar ve belgeler arasında doğal dille ara.` (14 ink/secondary).
- **Searching**: answer card skeleton (kicker stays, 3 shimmer lines 16 px), source cards 3 skeletons (`hint-placeholder-count="3"` in the design), chips disabled.
- **Low confidence (< 70 % match)**: kicker becomes `EMİN DEĞİLİM` (warning/text instead of brand/primary), answer prefixed `Emin değilim, ama ` and meta shows the match, e.g. `2 kaynaktan · %54 eşleşme`. Design note: "%70 altında “emin değilim” dili kullanılır."
- **No results**: answer card replaced by a neutral card `Bununla ilgili bir şey bulamadım.` + `Farklı bir kapsam dene:` with the chips repeated; sources section hidden.
- **Error**: `Arama yapılamadı.` + `Tekrar dene` text button.
- **Offline**: banner `Çevrimdışı — hafıza araması için bağlantı gerekli.`; last successful result stays visible (read-only).
- **Dark**: answer card wash becomes dark/surface with a `rgba(133,134,242,.16)` → transparent radial at top-left; source cards dark/surface with rings; active chip becomes dark/text bg with dark/bg text.

### 6.6 Data
`MemoryQuery { text, scope:'all'|'mail'|'calendar'|'notes'|'docs', last30Days:boolean, personId? }`
`MemoryAnswer { text, richSpans:{start,end,sourceIndex}[], sourceCount, matchPercent (0–100), confidence:'high'|'low' }`
`MemorySource { id, kind:'mail'|'call_note'|'attachment'|'event'|'note', icon, srcLabel, dateLabel, occurredAt, title, aiSummary, deepLink:{type,id,page?} }`
`relatedQuestions: string[3]`

### 6.7 Design note (verbatim)
> Cevap kartı önce, kaynaklar altında: kaynak · tarih · AI özeti · orijinali aç. Eşleşme yüzdesi güveni gösterir; %70 altında “emin değilim” dili kullanılır.

---

## 7. 6.6 · Önemli Kişiler · VIP

### 7.1 Purpose & placement
The user-controlled VIP list, grouped by relationship. Items from these people are always prioritised and their waiting times are watched more strictly. Pushed from 07 Hesap/Ayarlar and from the `VIP · …` pill on a person page.

### 7.2 Layout (top → bottom)
Background neutral/bg. Content column: padding `6 20 40`, gap 14.

1. **Top row** (space-between): nav-back · header-pill **primary** with `add` 18 + `Kişi Ekle` (height 36, padding `0 12 0 8`, brand/primary bg, white 12/600).
2. **Title block**: `Önemli Kişiler` (h1 28/34 600 −0.02em) · subtitle (margin-top 4) 14/20 ink/secondary: `Bu kişilerden gelenleri her zaman öne alırım ve bekleme sürelerini daha sıkı izlerim.`
3. **Groups** (from `VIP`, 4 groups; `hint-placeholder-count="4"`): for each group —
   - Kicker `{g.title}` (padding `4 4 8`).
   - list-group (§0.3.8) with `card/person` rows: row gap 12, padding `10 0`, border-top hairline except first · avatar 38 (`{p.av}` initials 12/600 on `{p.abg}`/`{p.afg}`) · name 15/600 −0.01em ink · meta 12 ink/tertiary · trailing `star` 20 `FILL 1` brand/primary.

   | Group kicker | Initials (tone) | Name | Meta |
   |---|---|---|---|
   | `EŞ · AİLE` | `ZE` (peach) | `Zeynep Emre` | `Eş · Mesaj ve takvim öncelikli` |
   | `EŞ · AİLE` | `AN` (neutral) | `Annem` | `Aile · Aramaları hatırlat` |
   | `YÖNETİCİ` | `CT` (blue) | `Can Tekin` | `CEO · Aynı gün yanıt beklenir` |
   | `MÜŞTERİ` | `MY` (blue) | `Mehmet Yılmaz` | `Yılmaz Endüstri · 2 açık konu` |
   | `MÜŞTERİ` | `AY` (peach) | `Ahmet Yılmaz` | `Kuzey Lojistik · Revize teklif bekliyor` |
   | `ARKADAŞ` | `BT` (mint) | `Burak Tan` | `Planlar için hafta sonu hatırlat` |

   Meta pattern: `{relationLabel} · {ruleOrStatus}` — relation labels: `Eş`, `Aile`, `CEO`/title, company, or none for friends. The right half is either the per-person rule (`Mesaj ve takvim öncelikli`, `Aramaları hatırlat`, `Aynı gün yanıt beklenir`, `Planlar için hafta sonu hatırlat`) or a live status (`2 açık konu`, `Revize teklif bekliyor`).
4. **AI suggestion row** (row, gap 8, padding `8 4`, 13/19 ink/secondary): `psychology` 18 brand/primary · `Öneri: **Selin Kaya** ile son 30 günde 14 kez yazıştın. VIP yapayım mı?` · text button `Evet` (brand/text-on-soft 600). Pattern: `Öneri: {name} ile son 30 günde {n} kez yazıştın. VIP yapayım mı?`
5. Home indicator.

### 7.3 Interactions
| Element | Behaviour |
|---|---|
| Back | Pop. |
| `Kişi Ekle` | Opens a picker sheet: search across known senders/attendees + device Contacts (requires Contacts permission; explain first, per 02/2.7 pattern), then a group chooser (`Eş`, `Aile`, `Yönetici`, `Müşteri`, `Arkadaş`) and optional rule text. Adds the row with a spring-in. |
| Person row | Push 6.7 PersonDetail. |
| `star` icon | Tap → remove from VIP with undo toast `{name} VIP listesinden çıkarıldı · Geri Al` (5 s). Row fades out. |
| Row long-press / swipe left | `Grubu Değiştir`, `Kuralı Düzenle`, `VIP'den Çıkar` (proposed). |
| `Evet` | Adds Selin Kaya to VIP; the app asks for a group via a small sheet (default `Müşteri` if she is a work sender); suggestion row is replaced by `Selin Kaya VIP listesine eklendi.` with `check_circle` success for 3 s, then disappears. Dismissing the suggestion (swipe) records a "don't suggest again for 90 days" signal. |

### 7.4 Dead in prototype
Back, `Kişi Ekle`, 6 person rows, 6 star icons, `Evet`.

### 7.5 States
- **Empty (no VIPs)**: title block stays; one card `Henüz önemli kişi eklemedin.` (15 ink) + `Eş, aile, yönetici ve müşterilerini ekle; onlardan gelenleri her zaman öne alırım.` (14 ink/secondary) + primary button `Kişi Ekle`. Suggestion row still shows if there is a candidate.
- **Loading**: 4 group skeletons with one 58 px row each.
- **No suggestion**: hide the suggestion row.
- **Contacts permission denied** (only relevant inside the picker): picker shows known senders only, with a footer `Rehber erişimi kapalı · Ayarlardan aç`.
- **Dark**: list-groups dark/surface with ring; star stays brand (dark/primary-glow); `Kişi Ekle` pill dark/primary with on-primary text.

### 7.6 Data
`VipGroup { key:'spouse_family'|'manager'|'client'|'friend', title }`
`VipPerson { personId, initials, avatarTone:'peach'|'mint'|'blue'|'neutral', name, relationLabel, rule?: string, liveStatus?: string, isVip:true, addedBy:'user'|'suggestion' }`
`VipSuggestion { personId, name, interactionCount30d }`
Ordering effect (design note): VIP is a sort boost in Akış/Bugün, **not** a colour — no extra badge colour on cards; the star appears only here and on person headers.

### 7.7 Design note (verbatim)
> Gruplar: eş, aile, yönetici, müşteri, arkadaş. VIP yıldızı yalnızca bu listede ve kişi başlıklarında görünür; kartlarda ekstra renk üretmez, sıralamayı etkiler.

---

## 8. 6.7 · Kişi Zekâsı · Mehmet Yılmaz

### 8.1 Purpose & placement
Person detail = **relationship summary**, not a mail thread: last contact, upcoming meeting, open topics, and two-way expectations. Pushed from VIP rows, person chips on cards (Bugün/Akış/Plan), mail sender headers. Bottom ask bar is a person-scoped memory search.

### 8.2 Layout (top → bottom)
Background neutral/bg, `min-height: 844`, scrolls. Content column: padding `6 20 110` (bottom inset leaves room for the sticky ask bar), gap 16.

1. **Top row** (space-between): nav-back · header-pill **soft** (height 30, padding `0 10`, brand/soft, brand/text-on-soft 12/600, `star` 15 `FILL 1`) `VIP · Müşteri` → pattern `VIP · {groupLabel}`.
2. **Identity block** (column, centered, gap 8): avatar 76 (`MY`, blue tone, 26/600) · name 26/600 −0.02em `Mehmet Yılmaz` · role 14 ink/secondary `Yılmaz Endüstri · Satın alma müdürü` (pattern `{company} · {title}`).
3. **Stat grid** — 3 equal columns, gap 8; each tile background neutral/surface, radius 16, padding 12, shadow/flat; label 11 ink/tertiary, value (margin-top 4) 15/600 −0.01em:
   - `Son iletişim` → `Dün 18:20`
   - `Yaklaşan` → `Bugün 14:30`
   - `Açık konu` → `2` (value coloured warning/text when > 0; ink when 0)
4. **Sections** (from `PERSON`, 4 sections): kicker `{s.title}` (padding `0 4 8`) + list-group with rows: row align-start, gap 12, padding `11 0`, border-top hairline except first · icon-tile 30/radius 10 with `{r.icon}` 17 · title `{r.t}` 15/21 −0.01em ink `text-wrap: pretty` · meta `{r.m}` 12 ink/tertiary (margin-top 2).

   | Section kicker | icon | t | m |
   |---|---|---|---|
   | `SON KONUŞULAN KONULAR` | `sell` | `Fiyat · %8 indirim sınırı` | `1 Eyl · Telefon` |
   | `SON KONUŞULAN KONULAR` | `local_shipping` | `Ekim başı teslim` | `1 Eyl · Telefon` |
   | `SON KONUŞULAN KONULAR` | `description` | `Sözleşme taslağı` | `22 Ağu · Mail` |
   | `SENDEN BEKLEDİKLERİ` | `person` | `Revize teklif · PDF` | `Bugün 17:00` |
   | `SENİN BEKLEDİKLERİN` | `schedule_send` | `Teklif v2 geri bildirimi` | `3 gün` |
   | `SENİN BEKLEDİKLERİN` | `schedule_send` | `Sözleşme hukuk yorumu (Mehmet tarafı)` | `14 gün` |
   | `SON İLETİŞİM` | `mail` | `“Fiyatı Ekim teslimatına göre güncelleyebilir misiniz?”` | `Dün 18:20 · Gmail` |
   | `SON İLETİŞİM` | `call` | `Telefon görüşmesi · 12 dk` | `1 Eyl 15:00` |
   | `SON İLETİŞİM` | `event` | `Tanışma toplantısı` | `18 Ağu · Ofis` |

   Meta patterns: topics → `{d MMM} · {channel}` (channel ∈ `Telefon`, `Mail`, `Toplantı`); they-wait → due label (`Bugün 17:00`, `Yarın`, `{d MMM}`); you-wait → age `{n} gün` (colour warning/text when ≥ 7 days — proposed); last contact → `{relative} · {provider}` / `{d MMM HH:mm}` / `{d MMM} · {location}`.
5. **Sticky ask bar** — `position: sticky; bottom: 0`, wrapper padding `12 16 44`, background `linear-gradient(180deg, rgba(245,244,240,0), #F5F4F0 40%)` (neutral/bg fade so content scrolls under it). Pill as §0.3.3 with placeholder `Mehmet hakkında sor…` (`{firstName} hakkında sor…`) and primary mic.
6. Home indicator (inside the sticky wrapper).

### 8.3 Interactions
| Element | Behaviour |
|---|---|
| Back | Pop. |
| `VIP · Müşteri` pill | Opens a group/VIP sheet: change group, edit per-person rule, `VIP'den Çıkar`. For non-VIP people the pill reads `VIP Yap` (neutral variant, `star` outline). |
| Avatar / name | Long-press → `Rehberde Aç` / `Rehbere Ekle` (proposed). |
| `Son iletişim` tile | Scrolls to / opens the latest item in `SON İLETİŞİM` (the Gmail mail → 04/4.4). |
| `Yaklaşan` tile | Opens the upcoming event (05 event detail / prep sheet). |
| `Açık konu` tile | Scrolls to `SENDEN BEKLEDİKLERİ` + `SENİN BEKLEDİKLERİN` (the two lists are the open topics). |
| Topic row | Opens the source (call note / mail) that the topic was extracted from. |
| `SENDEN BEKLEDİKLERİ` row | Opens 04/4.7 Senden Beklenenler item; swipe-right `Tamamlandı` (proposed). |
| `SENİN BEKLEDİKLERİN` row | Opens 04/4.6 Akıllı Takip item; long-press `Takip Mesajı Hazırla` → creates an approval (6.8, type `MAİL GÖNDER`). |
| `SON İLETİŞİM` row | Opens the mail / call note / event. |
| Ask bar text | Submit → push 6.5 MemorySearch with `personId` scope and the query. |
| Mic | 6.3 Voice Mode with `personId` context (answers scoped to Mehmet). |

### 8.4 Dead in prototype
Back, VIP pill, 3 stat tiles, all 9 section rows, ask bar, mic.

### 8.5 States
- **Loading**: identity block from the cached contact immediately; stat tiles show `—`; sections skeleton (4 groups × 1 row, per `hint-placeholder-count`).
- **Sparse person** (no data in a section): hide that section entirely; if all four are empty, show one card `Mehmet ile henüz kayıtlı bir etkileşim yok.` (`{firstName} ile henüz kayıtlı bir etkileşim yok.`).
- **No upcoming**: `Yaklaşan` tile value `—` (ink/tertiary).
- **Non-VIP**: pill `VIP Yap`, no star.
- **Offline**: page renders from cache; ask bar disabled with placeholder `Bağlantı yok`.
- **Dark**: tiles/list-groups dark/surface + rings; avatar tones unchanged; sticky fade uses dark/bg.

### 8.6 Data
`PersonProfile { personId, initials, avatarTone, fullName, firstName, company?, title?, isVip, vipGroup?, lastContactAt, lastContactLabel, upcomingEventId?, upcomingLabel?, openTopicCount }`
`PersonSection { key:'recent_topics'|'they_wait'|'you_wait'|'last_contact', title, rows: { id, icon, text, metaLabel, occurredAt|dueAt|ageDays, sourceRef:{kind,id} }[] }`
Kickers by key: `SON KONUŞULAN KONULAR`, `SENDEN BEKLEDİKLERİ`, `SENİN BEKLEDİKLERİN`, `SON İLETİŞİM`.

### 8.7 Design note (verbatim)
> Kişi sayfası mail dizisi değil ilişki özeti: son iletişim, yaklaşan toplantı, açık konular, iki yönlü beklentiler. Alt giriş kişiye bağlı hafıza aramasıdır.

---

## 9. 6.8 · Onay Merkezi · Kontrol her zaman kullanıcıda

### 9.1 Purpose & placement
The single queue of every write action the assistant proposes (mail send, event move, reminder create, …). Pushed from the Bugün approval card, from the Asistan tab, from a push notification, or from 07 Hesap. Also the target of pending approvals abandoned in voice mode.

### 9.2 Layout (top → bottom)
Background neutral/bg, `min-height: 844`, scrolls. Content column: padding `6 20 40`, gap 14.

1. **Top row** (space-between): nav-back · text button `Geçmiş` (13/600 ink/secondary).
2. **Title block**: `Onay Bekleyenler` (h1) · subtitle 14/20 ink/secondary: `3 işlem onayını bekliyor. Hiçbiri sen onaylamadan yapılmaz.` → `{n} işlem onayını bekliyor. Hiçbiri sen onaylamadan yapılmaz.`
3. **Approval cards** (`card/approval`, full variant, from `APPR`, 3 cards): each background neutral/surface, radius 20, padding 16, shadow/card:
   - Header row (gap 8): icon-tile 28/radius 9 **brand** (brand/soft bg, brand/text-on-soft icon `{a.icon}` 17) · type `{a.type}` 12/600 `.06em` ink/secondary `flex: 1` · time `{a.time}` 12 ink/tertiary.
   - What (margin-top 10) 17/23 600 −0.01em ink, `text-wrap: pretty`: `{a.what}`.
   - Detail grid (margin-top 10): 2 columns `64px 1fr`, gap `6 10`, 13/19; labels ink/tertiary, values ink:
     - `Neden` → `{a.why}`
     - `Değişim` → `{a.change}`
   - Button row (margin-top 14, gap 8, 14/600): `Onayla` (flex 1, height 42, radius 12, brand/primary, white) · `Düzenle` (height 42, padding `0 14`, radius 12, brand/soft, brand/text-on-soft) · `Reddet` (height 42, padding `0 14`, radius 12, neutral/surface-2, ink/secondary).

   | # | icon | type | time | what | why | change |
   |---|---|---|---|---|---|---|
   | 1 | `send` | `MAİL GÖNDER` | `09:40` | `Mehmet Yılmaz'a takip mesajı gönder` | `Teklif mailine 3 gündür yanıt gelmedi.` | `1 mail gönderilecek · Kısa, profesyonel ton · Ek yok` |
   | 2 | `event_repeat` | `ETKİNLİK TAŞI` | `12:12` | `Mehmet toplantısını 16:30'a al` | `Mehmet 16:00'yı önerdi; 16:00 dolu, 16:30 boş.` | `14:30 → 16:30 · 2 katılımcıya bildirim gider` |
   | 3 | `notifications` | `HATIRLATICI OLUŞTUR` | `09:52` | `Elektrik faturası · 13 Eylül 10:00` | `Fatura fotoğrafında 15 Eylül son ödeme tarihi bulundu.` | `1 hatırlatıcı · Takvimine yazılmaz` |

   Note the cards are **not** sorted by time in the design (09:40, 12:12, 09:52) — sort by urgency/creation server-side; keep the order the API returns.
4. **Kicker** `BUGÜN ONAYLANANLAR · 2` → `BUGÜN ONAYLANANLAR · {n}` (padding `4 4 0`).
5. **Done list** (list-group; rows gap 12, padding `11 0`, second row border-top hairline): `check_circle` 22 `FILL 1` success · text 14 ink `flex: 1` · time 12 ink/tertiary:
   - `Ahmet'e yanıt gönderildi` · `15:48`
   - `“Başvuru son saati” takvime eklendi` · `09:52`
   Done-text patterns: mail → `{firstName}'e yanıt gönderildi` / `{firstName}'a takip mesajı gönderildi`; event → `“{title}” takvime eklendi` / `“{title}” {HH:mm}'a taşındı`; reminder → `“{title}” hatırlatıcısı oluşturuldu`.
6. **Trust footer** (row, gap 8, padding `8 4`, 13/19 ink/secondary): `verified_user` 18 success/text · `Önemli işlemler sen onaylamadan gerçekleştirilmez. Toplu onay yok; her kart tek tek.`
7. Home indicator.

### 9.3 Interactions
| Element | Behaviour |
|---|---|
| Back | Pop. |
| `Geçmiş` | Push ApprovalHistory: same done-row style grouped by day, last **30 days** (design note), with a `Reddedilenler` filter. Not drawn. |
| `Onayla` | Executes the action. Card collapses (height animation 240 ms) into the done list at the top with `check_circle`; haptic `success`; subtitle count decrements. If execution fails: card stays, inline `Yapılamadı. Tekrar dene.` (critical/text 12) under the buttons and `Onayla` → `Tekrar Dene`. **One card at a time; never a "select all".** |
| `Düzenle` | Opens the type-specific editor: `MAİL GÖNDER` → 04/4.5 draft editor; `ETKİNLİK TAŞI` → 05 time picker sheet; `HATIRLATICI OLUŞTUR` → 04/4.11 smart-reminder sheet. On save the card's `what`/`change` update in place; approval still required. |
| `Reddet` | Removes the card (slide-out left) **and records a learning signal** ("bu tür önerileri azalt"): the rule engine down-weights this suggestion type/person (visible later in 6.9). Undo toast `Reddedildi · Geri Al` (5 s). |
| Card body (what/why/change) | Tap → expands a preview: mail full body / event before-after / reminder details (proposed; drawn cards are already fully expanded). |
| Done row | Opens the resulting item (sent mail thread, created event, reminder). |
| Swipe on approval card | Right → `Onayla`, left → `Reddet` (proposed; keep buttons as the primary affordance). |

### 9.4 Dead in prototype
Back, `Geçmiş`, 3 × (`Onayla`, `Düzenle`, `Reddet`), 2 done rows.

### 9.5 States
- **Empty (no pending)**: title stays; subtitle `Onay bekleyen işlem yok.`; one card with `task_alt` success 28 + `Her şey yolunda. Yeni bir öneri olunca burada görürsün.` (14 ink/secondary); done list and trust footer still render.
- **Loading**: 3 card skeletons (radius 20, height ~190).
- **Expired** (e.g. event moved by someone else, deadline passed): card gets a warning/soft banner line `Bu öneri artık geçerli değil.` and only `Kaldır` (neutral) remains.
- **Executing**: `Onayla` shows a spinner and the other two buttons are disabled (ink/disabled).
- **Offline**: buttons disabled; banner `Çevrimdışı — onaylar bağlanınca uygulanır.`; user may still tap `Onayla`, which queues (label `Sıraya Alındı`).
- **Push notification** (proposed copy): title `Onay bekliyor`, body = `{what}`; actions `Onayla` / `Reddet` (both open the app to this screen; approval itself must happen in-app so the card is seen — do not execute from the notification action).
- **Dark**: cards dark/surface + ring; brand icon-tile `rgba(133,134,242,.16)` bg with dark/primary-glow icon; `Reddet` bg dark/surface-2.

### 9.6 Data
`Approval { id, type:'MAIL_SEND'|'EVENT_MOVE'|'REMINDER_CREATE'|'EVENT_CREATE'|'MAIL_REPLY'|…, typeLabel (i18n: 'MAİL GÖNDER'|'ETKİNLİK TAŞI'|'HATIRLATICI OLUŞTUR'|'ETKİNLİK EKLE'|…), icon, createdAt, timeLabel, what, why, change, payload (type-specific: mail draft / event before+after / reminder), status:'pending'|'approved'|'rejected'|'expired'|'failed', origin:'today_card'|'chat'|'voice'|'capture', personId? }`
`ApprovalDone { id, text, completedAt, resultRef:{kind,id} }`
Retention: approved/rejected records kept 30 days.

### 9.7 Design note (verbatim)
> Kart sözleşmesi: Ne yapılacak · Neden · Ne değişecek. Reddet bir öğrenme sinyalidir (“bu tür önerileri azalt”). Onaylananlar geçmişte 30 gün saklanır.

---

## 10. 6.9 · AI Kişiselleştirme · “Seni nasıl tanıyor?”

### 10.1 Purpose & placement
Transparent model page: every learned rule with its source, editable and deletable. Pushed from 07 Hesap / Gizlilik ("Seni nasıl tanıyor?" row).

### 10.2 Layout (top → bottom)
Background neutral/bg, `min-height: 844`, scrolls. Content column: padding `6 20 40`, gap 14.

1. **Top row** (space-between): nav-back · 36 px empty spacer (keeps the title centred with other screens; no right action).
2. **Title block**: `Dijital Asistan seni nasıl tanıyor?` (h1 28/34 600 −0.02em, `text-wrap: pretty`) · subtitle 14/20 ink/secondary: `Zamanla öğrendiklerim. Her satırı düzenleyebilir veya silebilirsin; sildiğin şeyi bir daha varsaymam.`
3. **Rule groups** (from `RULES`, 3 groups; `hint-placeholder-count="3"`, 2 rows each for skeletons): kicker `{g.title}` (padding `4 4 8`) + list-group with rows: row align center, gap 12, padding `11 0`, border-top hairline except first · icon-tile 30/radius 10 with `{r.icon}` 17 · rule text `{r.t}` 15/21 ink · source `{r.m}` 12 ink/tertiary (margin-top 2) · trailing icon pair `edit` + `delete` 20 ink/disabled, gap 4.

   | Group kicker | icon | Rule (t) | Source (m) |
   |---|---|---|---|
   | `KİŞİLER` | `star` | `Mehmet Yılmaz yüksek öncelikli.` | `Sen ekledin · VIP · Müşteri` |
   | `KİŞİLER` | `trending_down` | `Toplu bültenler düşük öncelikli.` | `3 kez “önemli değil” dedin` |
   | `KONULAR` | `sell` | `Promosyon mailleri düşük öncelikli.` | `12 kez arşivledin, hiç açmadın` |
   | `KONULAR` | `flight` | `Uçuş ve rezervasyonlar Bugün ekranında görünür.` | `Onboarding · Seyahat seçildi` |
   | `TERCİHLER` | `schedule` | `Toplantıları 30 dakika önce hatırlatmayı tercih ediyorsun.` | `Son 8 hatırlatıcıdan çıkarıldı` |
   | `TERCİHLER` | `wb_twilight` | `Brifing 08:00, 13:00 ve 19:00.` | `Ayarlar` |
   | `TERCİHLER` | `record_voice_over` | `Yanıt taslaklarında profesyonel ton.` | `Son 6 taslaktan 5'i` |

   Source-line patterns (the "why the model believes this"): `Sen ekledin · {context}`, `{n} kez “önemli değil” dedin`, `{n} kez arşivledin, hiç açmadın`, `Onboarding · {choice} seçildi`, `Son {n} hatırlatıcıdan çıkarıldı`, `Ayarlar`, `Son {n} taslaktan {k}'i`.
4. **Add rule button** — height 48, radius 14, background neutral/surface, shadow/pill, centered content gap 6, 14/600 brand/text-on-soft, `add` 20: `Kural Ekle`.
5. Home indicator.

### 10.3 Interactions
| Element | Behaviour |
|---|---|
| Back | Pop. |
| Rule row (text) | Tap → same as `edit`. |
| `edit` | Opens an inline editor sheet: rule text (free text, 15 px), group picker (`Kişiler` / `Konular` / `Tercihler`), and for structured rules the underlying control (priority high/low, reminder lead time, briefing times → deep-links to the 07 settings row, tone picker). Source line becomes `Sen düzenledin · {d MMM}` after saving. |
| `delete` | Removes the row immediately with a **5 s undo toast** `Kural silindi · Geri Al` (design note). After the toast expires the rule is hard-deleted and the model must **never re-infer it** (store a tombstone: `{ruleFingerprint, deletedAt}` checked by the rule engine). |
| Row long-press | `Bu kuralı neden öğrendin?` → shows the evidence list (e.g. the 3 mails marked "önemli değil") — proposed, not drawn. |
| `Kural Ekle` | Opens the same editor sheet empty; saved rules get source `Sen ekledin`. |
| Rows whose source is `Ayarlar` | `edit` deep-links to the corresponding settings screen (07) instead of the free-text editor; `delete` is disabled (ink/disabled at 40 % + toast `Bu tercih Ayarlar'dan yönetilir.`). |

### 10.4 Dead in prototype
Back, 7 × `edit`, 7 × `delete`, `Kural Ekle`.

### 10.5 States
- **Empty (fresh account)**: groups hidden; one card `Henüz seni tanımıyorum. Kullandıkça öğrendiklerimi burada göreceksin.` (15 ink) + `Kural Ekle` button.
- **Loading**: 3 group skeletons × 2 rows (as per `hint-placeholder-count`).
- **Undo window**: row is removed optimistically; toast bottom-anchored, ink bg, white text, `Geri Al` in brand/dark-glow; restoring re-inserts the row with a fade.
- **Error saving/deleting**: toast `Kaydedilemedi. Tekrar dene.`; row reverts.
- **Offline**: edits queue; rows show a small `cloud_off` glyph at 12 next to the source line until synced.
- **Dark**: list-groups dark/surface + rings; icon-tiles dark/surface-2; `edit`/`delete` raw `#5E5B54`; `Kural Ekle` dark/surface with dark/primary-glow text.

### 10.6 Data
`LearnedRule { id, group:'people'|'topics'|'preferences', icon, text, source:{ kind:'user_added'|'user_feedback'|'behaviour'|'onboarding'|'settings'|'draft_history', label, evidenceCount?, evidenceRefs?: string[] }, editable:boolean, deletable:boolean, effect:{ type:'priority'|'visibility'|'reminder_lead'|'briefing_times'|'tone', value }, createdAt, updatedAt }`
Group kickers: `KİŞİLER`, `KONULAR`, `TERCİHLER`.

### 10.7 Design note (verbatim)
> Şeffaf model: her kuralın kaynağı yazar (“3 kez ‘önemli değil’ dedin”). Kurallar üç grupta: kişiler, konular, tercihler. Silme geri alınabilir (5 sn toast).

---

## 11. Cross-screen states summary

| State | 6.1 | 6.2 | 6.3/6.4 | 6.5 | 6.6 | 6.7 | 6.8 | 6.9 |
|---|---|---|---|---|---|---|---|---|
| Loading / skeleton | summary + 5 rows | typing indicator, streamed text | processing status | answer + 3 sources | 4 groups × 1 row | tiles `—`, 4 groups × 1 row | 3 cards | 3 groups × 2 rows |
| Empty | no accounts → connect CTA; no threads → hide section | no data → sentence only | no speech 8 s | no query → recent/suggested; no result → neutral card | no VIPs card + CTA | sparse → hide sections / one card | `Onay bekleyen işlem yok.` | fresh account card |
| Error | summary fallback | inline `Yanıt alınamadı.` + retry | STT unavailable | `Arama yapılamadı.` | toast | cached | inline `Yapılamadı.` | toast, revert |
| Offline | cached counts, mic off | queued bubbles + banner | unreachable (6.3 banner) | banner, last result | cached | cached, ask bar disabled | buttons queue + banner | queued edits |
| Permission denied | — | — | mic → `Mikrofon izni gerekli.` + `Ayarları Aç` | — | contacts → known senders only | — | notifications → in-app only | — |
| Dark | 6.1D | mapped | same | mapped | mapped | mapped | mapped | mapped |

Design-level rules not drawn but stated in captions (implement as product behaviour): 1.2 s silence auto-submit (6.3); < 70 % match → "emin değilim" language (6.5); VIP affects sort only (6.6); `Reddet` learns, `İptal` doesn't (6.4/6.8); no bulk approval (6.8); 30-day approval history (6.8); 5 s undo on rule delete and deleted rules are never re-assumed (6.9); tab bar hidden in conversation (6.2).

## 12. Motion & haptics (consolidated)

| Moment | Motion | Haptic |
|---|---|---|
| Suggested question tap (6.1) | Row lifts (scale 0.98) then thread opens; tab bar slides down 90 px, 200 ms | `selection` |
| Assistant response (6.2) | Typing dots → streamed text; cards fade+rise 12 px, 220 ms; chips stagger 40 ms | — |
| Draft approved (6.2/6.4/6.8) | Buttons crossfade to done row; card height collapses 240 ms; done row inserts at top of "BUGÜN ONAYLANANLAR" | `success` |
| Reject (6.8) | Card slides left and collapses; undo toast 5 s | `impactLight` |
| Voice mode open | Fade + scale 0.92→1 from mic button, 220 ms; gradient/night background | `impactMedium` |
| Listening (6.3) | Orb breathes 2.4 s loop; 22-bar waveform spring-follows amplitude | — |
| Auto-submit after 1.2 s silence | Waveform freezes, orb pulses slower, status `Düşünüyorum…` | `selection` |
| Approval card in voice (6.4) | Slides up 24 px + fade, 260 ms | `impactLight` |
| Memory search result (6.5) | Answer card wash fades in, sources stagger 60 ms | — |
| VIP star remove / rule delete | Row fades + collapses; toast with `Geri Al` | `impactLight` |
| Pressed state (all buttons) | Primary bg → brand/primary-pressed; soft/neutral buttons darken 6 %; scale 0.98 | — |

## 13. Consolidated i18n strings (verbatim, grouped by screen)

**Shared**: `Asistan` · `Bugün` · `Akış` · `Plan` · `Dijital hayatına sor…` · `Onayla` · `Düzenle` · `İptal` · `Reddet` · `Yanıtla` · `Evet` · `Orijinali Aç` · `Geri Al`

**6.1 / 6.1D**: `Hafıza` · `Bugün {mailCount} mail, {eventCount} etkinlik ve {followUpCount} takip analiz edildi. Ne öğrenmek istersin?` · `ÖNERİLEN` · `Bugün neye odaklanmalıyım?` · `Kimlere cevap vermem gerekiyor?` · `Yarın yoğun muyum?` · `Bu hafta hangi deadline'lar var?` · `{firstName} ile en son ne konuştuk?` (example `Mehmet ile en son ne konuştuk?`) · `SON SOHBETLER` · `Geçen ayki uçak bileti ne kadardı?` · `Bu ay hangi ödemelerim var?` · `Dün` · `2 Eyl`

**6.2**: `Yeni sohbet` · `2 kişi senden cevap bekliyor. Ahmet'inki bugün 17:00'ye kadar; Selin'inki yarın öğlene kadar bekleyebilir.` · `SENDEN BEKLEYENLER` · `Ahmet Yılmaz` · `Revize teklif · Gmail 08:42` · `17:00` · `Selin Kaya` · `Sözleşme 4. madde · Gmail dün` · `Yarın` · `İkisi için de taslak hazırla` · `Selin'i yarına ertele` · `Ahmet'e yanıt taslağı hazırla` · `Hazırladım. Profesyonel tonda, 17:00 teslimi teyit ediyor.` · `TASLAK · AHMET YILMAZ` · `Merhaba Ahmet, talebiniz için teşekkürler. Revize fiyat teklifini güncellenmiş teslim tarihiyle birlikte bugün 17:00'den önce…` · `Göndermeyi Onayla`

**6.3**: `SES MODU` · `“Mehmet'ten cevap geldi mi?”` · `Dinliyorum…` · `Bugün ne var?` · `Brifingimi oku.` · `Yarın yoğun muyum?`

**6.4**: `Henüz gelmedi. Teklifi 3 gün önce gönderdin. İstersen kısa bir takip mesajı hazırlayıp onayına sunabilirim.` · `“Evet, hazırla.”` · `ONAY GEREKİYOR · MAİL GÖNDER` · `Mehmet Yılmaz'a takip mesajı` · `“Merhaba Mehmet, 2 Eylül'de ilettiğim teklif hakkında görüşünüzü alabilir miyim? …”` · `“Onayla” diyerek de gönderebilirsin.`

**6.5**: `Mehmet fiyat konusunda en son ne demişti?` · `Tümü` · `Mail` · `Takvim` · `Notlar` · `Belgeler` · `Son 30 gün` · `CEVAP` · `Mehmet en son dün 18:20'de fiyatın Ekim teslimatına göre güncellenmesini istedi. 1 Eylül görüşmesinde ise %8'in üzerinde indirimin yönetim onayı gerektiğini söylemişti.` · `{n} kaynaktan · %{match} eşleşme` (example `3 kaynaktan · %92 eşleşme`) · `KAYNAKLAR · {n}` · `Gmail · Mehmet Yılmaz` · `Dün 18:20` · `Re: Teklif` · `“Fiyatı Ekim teslimatına göre güncelleyebilir misiniz? Yönetim toplam tutarı görmek istiyor.”` · `Görüşme notu · Sen` · `1 Eyl 15:00` · `Telefon görüşmesi · 12 dk` · `%8 üzeri indirim için yönetim onayı gerektiğini söyledi. Teslim tarihi Ekim başı olarak konuşuldu.` · `Ek · Teklif_v2.pdf` · `2 Eyl 10:05` · `Teklif v2 · Sayfa 3, Fiyatlandırma` · `Birim fiyat 1.240 TL, 500 adet üzeri %6 indirim. Teslim: siparişten 4 hafta sonra.` · `BUNLARI DA SORABİLİRSİN` · `Geçen ay aldığım uçak bileti ne kadardı?` · `Bu ay hangi ödemelerim var?` · `Kimlere dönüş yapmam gerekiyor?`

**6.6**: `Kişi Ekle` · `Önemli Kişiler` · `Bu kişilerden gelenleri her zaman öne alırım ve bekleme sürelerini daha sıkı izlerim.` · `EŞ · AİLE` · `YÖNETİCİ` · `MÜŞTERİ` · `ARKADAŞ` · `Zeynep Emre` · `Eş · Mesaj ve takvim öncelikli` · `Annem` · `Aile · Aramaları hatırlat` · `Can Tekin` · `CEO · Aynı gün yanıt beklenir` · `Mehmet Yılmaz` · `Yılmaz Endüstri · 2 açık konu` · `Ahmet Yılmaz` · `Kuzey Lojistik · Revize teklif bekliyor` · `Burak Tan` · `Planlar için hafta sonu hatırlat` · `Öneri: {name} ile son 30 günde {n} kez yazıştın. VIP yapayım mı?`

**6.7**: `VIP · Müşteri` · `Mehmet Yılmaz` · `Yılmaz Endüstri · Satın alma müdürü` · `Son iletişim` · `Dün 18:20` · `Yaklaşan` · `Bugün 14:30` · `Açık konu` · `SON KONUŞULAN KONULAR` · `Fiyat · %8 indirim sınırı` · `1 Eyl · Telefon` · `Ekim başı teslim` · `Sözleşme taslağı` · `22 Ağu · Mail` · `SENDEN BEKLEDİKLERİ` · `Revize teklif · PDF` · `Bugün 17:00` · `SENİN BEKLEDİKLERİN` · `Teklif v2 geri bildirimi` · `3 gün` · `Sözleşme hukuk yorumu (Mehmet tarafı)` · `14 gün` · `SON İLETİŞİM` · `“Fiyatı Ekim teslimatına göre güncelleyebilir misiniz?”` · `Dün 18:20 · Gmail` · `Telefon görüşmesi · 12 dk` · `1 Eyl 15:00` · `Tanışma toplantısı` · `18 Ağu · Ofis` · `{firstName} hakkında sor…` (example `Mehmet hakkında sor…`)

**6.8**: `Geçmiş` · `Onay Bekleyenler` · `{n} işlem onayını bekliyor. Hiçbiri sen onaylamadan yapılmaz.` · `MAİL GÖNDER` · `ETKİNLİK TAŞI` · `HATIRLATICI OLUŞTUR` · `Neden` · `Değişim` · `Mehmet Yılmaz'a takip mesajı gönder` · `Teklif mailine 3 gündür yanıt gelmedi.` · `1 mail gönderilecek · Kısa, profesyonel ton · Ek yok` · `Mehmet toplantısını 16:30'a al` · `Mehmet 16:00'yı önerdi; 16:00 dolu, 16:30 boş.` · `14:30 → 16:30 · 2 katılımcıya bildirim gider` · `Elektrik faturası · 13 Eylül 10:00` · `Fatura fotoğrafında 15 Eylül son ödeme tarihi bulundu.` · `1 hatırlatıcı · Takvimine yazılmaz` · `BUGÜN ONAYLANANLAR · {n}` · `Ahmet'e yanıt gönderildi` · `“Başvuru son saati” takvime eklendi` · `Önemli işlemler sen onaylamadan gerçekleştirilmez. Toplu onay yok; her kart tek tek.`

**6.9**: `Dijital Asistan seni nasıl tanıyor?` · `Zamanla öğrendiklerim. Her satırı düzenleyebilir veya silebilirsin; sildiğin şeyi bir daha varsaymam.` · `KİŞİLER` · `Mehmet Yılmaz yüksek öncelikli.` · `Sen ekledin · VIP · Müşteri` · `Toplu bültenler düşük öncelikli.` · `3 kez “önemli değil” dedin` · `KONULAR` · `Promosyon mailleri düşük öncelikli.` · `12 kez arşivledin, hiç açmadın` · `Uçuş ve rezervasyonlar Bugün ekranında görünür.` · `Onboarding · Seyahat seçildi` · `TERCİHLER` · `Toplantıları 30 dakika önce hatırlatmayı tercih ediyorsun.` · `Son 8 hatırlatıcıdan çıkarıldı` · `Brifing 08:00, 13:00 ve 19:00.` · `Ayarlar` · `Yanıt taslaklarında profesyonel ton.` · `Son 6 taslaktan 5'i` · `Kural Ekle`

**Proposed (not in design — engineers/PM to confirm wording)**: `Henüz hiçbir hesap bağlı değil. Bağlantı ekleyince dijital hayatını analiz etmeye başlarım.` · `Bağlantı Ekle` · `Çevrimdışı · son analiz {HH:mm}` · `Ses modu için bağlantı gerekli.` · `Yanıt alınamadı.` · `Tekrar dene` · `Çevrimdışı — mesajlar bağlanınca gönderilecek.` · `Gönderilemedi. Tekrar dene.` · `Gönderildi · {HH:mm}` · `Duraklatıldı` · `Düşünüyorum…` · `Mikrofon izni gerekli.` · `Ayarları Aç` · `Bağlantı yok — ses modu kullanılamıyor.` · `Seni duyamadım. Tekrar dene.` · `Onay bekleyen 1 işlem var.` · `GÖNDERİLDİ` · `Gönderildi.` · `Tamam, göndermedim.` · `Tekrar Dene` · `Emin değilim, ama ` · `EMİN DEĞİLİM` · `SON ARAMALAR` · `BUNLARI SORABİLİRSİN` · `Mailler, takvim, notlar ve belgeler arasında doğal dille ara.` · `Bununla ilgili bir şey bulamadım.` · `Farklı bir kapsam dene:` · `Arama yapılamadı.` · `Çevrimdışı — hafıza araması için bağlantı gerekli.` · `Henüz önemli kişi eklemedin.` · `Eş, aile, yönetici ve müşterilerini ekle; onlardan gelenleri her zaman öne alırım.` · `{name} VIP listesinden çıkarıldı · Geri Al` · `Selin Kaya VIP listesine eklendi.` · `Rehber erişimi kapalı · Ayarlardan aç` · `VIP Yap` · `VIP'den Çıkar` · `Grubu Değiştir` · `Kuralı Düzenle` · `{firstName} ile henüz kayıtlı bir etkileşim yok.` · `Bağlantı yok` · `Onay bekleyen işlem yok.` · `Her şey yolunda. Yeni bir öneri olunca burada görürsün.` · `Bu öneri artık geçerli değil.` · `Kaldır` · `Yapılamadı. Tekrar dene.` · `Çevrimdışı — onaylar bağlanınca uygulanır.` · `Sıraya Alındı` · `Reddedildi · Geri Al` · `Reddedilenler` · `Onay bekliyor` · `Henüz seni tanımıyorum. Kullandıkça öğrendiklerimi burada göreceksin.` · `Kural silindi · Geri Al` · `Kaydedilemedi. Tekrar dene.` · `Bu tercih Ayarlar'dan yönetilir.` · `Sen düzenledin · {d MMM}` · `Bu kuralı neden öğrendin?`

## 14. Dead in prototype (consolidated)

The canvas is a static catalogue: **no element on any of the 10 artboards has a handler**. Everything below must be wired as specified in the per-screen tables.

- **6.1 / 6.1D**: `Hafıza` pill · analysis summary card · 5 suggested-question rows · 2 recent-thread rows · ask bar text field · mic button · 4 tab-bar items.
- **6.2**: `Yeni sohbet` · 2 person rows · 2 `Yanıtla` · 2 deadline badges (non-interactive by design) · 2 follow-up chips (`İkisi için de taslak hazırla`, `Selin'i yarına ertele`) · `Göndermeyi Onayla` · `Düzenle` · ask bar · mic.
- **6.3**: close (X) · mic orb · 3 quick prompts (`Bugün ne var?`, `Brifingimi oku.`, `Yarın yoğun muyum?`).
- **6.4**: close (X) · `Onayla` · `Düzenle` · `İptal` · bottom mic button · (voice command "Onayla" is described in the hint but obviously not functional).
- **6.5**: back · search field · clear (×) · 6 scope chips (`Tümü`, `Mail`, `Takvim`, `Notlar`, `Belgeler`, `Son 30 gün`) · 3 × `Orijinali Aç` · 3 related-question rows.
- **6.6**: back · `Kişi Ekle` · 6 person rows · 6 star icons · `Evet` on the VIP suggestion.
- **6.7**: back · `VIP · Müşteri` pill · 3 stat tiles · 9 section rows · ask bar (`Mehmet hakkında sor…`) · mic.
- **6.8**: back · `Geçmiş` · 3 × `Onayla` · 3 × `Düzenle` · 3 × `Reddet` · 2 done rows.
- **6.9**: back · 7 × `edit` · 7 × `delete` · `Kural Ekle`.

Also note: the 6.3 waveform is a static bar set (heights 10/40/34/28/22/16 repeating) — it must be driven by live audio; the 6.4 approval card is drawn already visible — it must be animated in after the answer.

## 15. Seed data transcription (from the `text/x-dc` script, verbatim)

Border logic in the script: `wb()` and the VIP map give every row **after the first** in a group `border-top: 1px solid rgba(27,25,23,.06)`; first rows get `0`. The waveform is `22` bars, `width 4, radius 2, gap 4, bg rgba(255,255,255,.85), height = 10 + ((i*11) % 6) * 6`, in a 44 px tall row.

```js
const RESULTS=[
 {icon:'mail',src:'Gmail · Mehmet Yılmaz',date:'Dün 18:20',title:'Re: Teklif',sum:'“Fiyatı Ekim teslimatına göre güncelleyebilir misiniz? Yönetim toplam tutarı görmek istiyor.”'},
 {icon:'call',src:'Görüşme notu · Sen',date:'1 Eyl 15:00',title:'Telefon görüşmesi · 12 dk',sum:'%8 üzeri indirim için yönetim onayı gerektiğini söyledi. Teslim tarihi Ekim başı olarak konuşuldu.'},
 {icon:'description',src:'Ek · Teklif_v2.pdf',date:'2 Eyl 10:05',title:'Teklif v2 · Sayfa 3, Fiyatlandırma',sum:'Birim fiyat 1.240 TL, 500 adet üzeri %6 indirim. Teslim: siparişten 4 hafta sonra.'}
];
const VIP=[
 {title:'EŞ · AİLE',people:[{av:'ZE',abg:'#F5E1D6',afg:'#7A3E1F',name:'Zeynep Emre',meta:'Eş · Mesaj ve takvim öncelikli'},{av:'AN',abg:'#F0EFEB',afg:'#6B6860',name:'Annem',meta:'Aile · Aramaları hatırlat'}]},
 {title:'YÖNETİCİ',people:[{av:'CT',abg:'#DCE4F5',afg:'#2B3F73',name:'Can Tekin',meta:'CEO · Aynı gün yanıt beklenir'}]},
 {title:'MÜŞTERİ',people:[{av:'MY',abg:'#DCE4F5',afg:'#2B3F73',name:'Mehmet Yılmaz',meta:'Yılmaz Endüstri · 2 açık konu'},{av:'AY',abg:'#F5E1D6',afg:'#7A3E1F',name:'Ahmet Yılmaz',meta:'Kuzey Lojistik · Revize teklif bekliyor'}]},
 {title:'ARKADAŞ',people:[{av:'BT',abg:'#E3EFE6',afg:'#1E5A36',name:'Burak Tan',meta:'Planlar için hafta sonu hatırlat'}]}
];
const PERSON=[
 {title:'SON KONUŞULAN KONULAR',rows:[{icon:'sell',t:'Fiyat · %8 indirim sınırı',m:'1 Eyl · Telefon'},{icon:'local_shipping',t:'Ekim başı teslim',m:'1 Eyl · Telefon'},{icon:'description',t:'Sözleşme taslağı',m:'22 Ağu · Mail'}]},
 {title:'SENDEN BEKLEDİKLERİ',rows:[{icon:'person',t:'Revize teklif · PDF',m:'Bugün 17:00'}]},
 {title:'SENİN BEKLEDİKLERİN',rows:[{icon:'schedule_send',t:'Teklif v2 geri bildirimi',m:'3 gün'},{icon:'schedule_send',t:'Sözleşme hukuk yorumu (Mehmet tarafı)',m:'14 gün'}]},
 {title:'SON İLETİŞİM',rows:[{icon:'mail',t:'“Fiyatı Ekim teslimatına göre güncelleyebilir misiniz?”',m:'Dün 18:20 · Gmail'},{icon:'call',t:'Telefon görüşmesi · 12 dk',m:'1 Eyl 15:00'},{icon:'event',t:'Tanışma toplantısı',m:'18 Ağu · Ofis'}]}
];
const APPR=[
 {icon:'send',type:'MAİL GÖNDER',time:'09:40',what:"Mehmet Yılmaz'a takip mesajı gönder",why:'Teklif mailine 3 gündür yanıt gelmedi.',change:'1 mail gönderilecek · Kısa, profesyonel ton · Ek yok'},
 {icon:'event_repeat',type:'ETKİNLİK TAŞI',time:'12:12',what:"Mehmet toplantısını 16:30'a al",why:"Mehmet 16:00'yı önerdi; 16:00 dolu, 16:30 boş.",change:'14:30 → 16:30 · 2 katılımcıya bildirim gider'},
 {icon:'notifications',type:'HATIRLATICI OLUŞTUR',time:'09:52',what:'Elektrik faturası · 13 Eylül 10:00',why:'Fatura fotoğrafında 15 Eylül son ödeme tarihi bulundu.',change:'1 hatırlatıcı · Takvimine yazılmaz'}
];
const RULES=[
 {title:'KİŞİLER',rows:[{icon:'star',t:'Mehmet Yılmaz yüksek öncelikli.',m:'Sen ekledin · VIP · Müşteri'},{icon:'trending_down',t:'Toplu bültenler düşük öncelikli.',m:'3 kez “önemli değil” dedin'}]},
 {title:'KONULAR',rows:[{icon:'sell',t:'Promosyon mailleri düşük öncelikli.',m:'12 kez arşivledin, hiç açmadın'},{icon:'flight',t:'Uçuş ve rezervasyonlar Bugün ekranında görünür.',m:'Onboarding · Seyahat seçildi'}]},
 {title:'TERCİHLER',rows:[{icon:'schedule',t:'Toplantıları 30 dakika önce hatırlatmayı tercih ediyorsun.',m:'Son 8 hatırlatıcıdan çıkarıldı'},{icon:'wb_twilight',t:'Brifing 08:00, 13:00 ve 19:00.',m:'Ayarlar'},{icon:'record_voice_over',t:'Yanıt taslaklarında profesyonel ton.',m:'Son 6 taslaktan 5\'i'}]}
];
```

Inline (non-scripted) example data that also belongs to the seed set: 6.1 summary counts `46 mail / 4 etkinlik / 2 takip`; 6.2 people-waiting rows (`Ahmet Yılmaz`, `Selin Kaya`) and the draft; 6.4 voice approval (`Mehmet Yılmaz'a takip mesajı`); 6.5 answer text and `3 kaynaktan · %92 eşleşme`; 6.6 suggestion (`Selin Kaya`, 14 interactions / 30 days); 6.7 stats (`Dün 18:20`, `Bugün 14:30`, `2`); 6.8 done rows (`Ahmet'e yanıt gönderildi 15:48`, `“Başvuru son saati” takvime eklendi 09:52`). The recurring cast across this page — Mehmet Yılmaz (Yılmaz Endüstri, client, VIP), Ahmet Yılmaz (Kuzey Lojistik), Selin Kaya, Zeynep Emre (spouse), Can Tekin (CEO), Burak Tan (friend), "Annem" — should be the same fixture persons used by the 03/04/05 specs so seed data stays coherent.

## 16. Domain model checklist (what the backend must provide for this page)

- **AssistantHome**: analysed counts + timestamp, 5 ranked suggestions (with intent + optional personId), recent threads.
- **Thread / Message / Card**: streaming assistant messages carrying typed cards (`people_waiting`, `draft`, and the 04 card types) and follow-up chips.
- **Voice session**: STT partials, 1.2 s end-pointing, TTS for answers, voice-command grammar for approve/edit/cancel.
- **Approval**: `type`, `what`, `why`, `change`, payload, status, origin, 30-day history, learning signal on reject, none on cancel.
- **MemorySearch**: semantic query with scope/time/person filters → answer with bold spans + match %, sources with deep links, related questions, "low confidence" flag at < 70 %.
- **People**: profile, VIP flag + group + rule, live status, relationship summary sections (recent topics, they-wait, you-wait, last contact), open-topic count, upcoming event, VIP suggestion (interaction count over 30 days).
- **LearnedRule**: grouped rules with source/evidence, editable/deletable flags, tombstones so deleted rules are never re-inferred, 5 s undo.
