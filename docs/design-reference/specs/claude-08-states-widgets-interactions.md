# 08 · Boş / Hata / Yükleme Durumları, Widget'lar, Mikro-etkileşimler — Implementation Spec

Source of truth: Claude Design canvas `08 Durumlar Widgetlar Etkilesimler.dc.html`. This canvas is **not a set of app screens**; it is the cross-cutting reference sheet for (a) empty states, (b) error / offline / loading states, (c) iOS and Android home-screen and lock-screen widgets, and (d) the motion + haptics contract, swipe-action contract and the briefing-open choreography. Every visible Turkish string, every size, every token and the three trailing data arrays (`EMPTIES`, `ERRORS`, `MOTION`) plus the skeleton/spinner render helpers are transcribed here. Engineers should not need the raw HTML.

Conventions used below:
- Token names follow the project palette (`brand/primary`, `ink/secondary`, …). Where the prototype uses a colour that has **no token**, it is written as `raw #HEX` with a proposed token name so it can be added to the theme.
- Sizes are in dp/pt exactly as drawn. Phone frames on this canvas are **390×700 crops** (not the full 390×844) — the bottom of the screen is simply not drawn; nothing is hidden there.
- Strings in `code` are verbatim copy and become i18n keys. Dynamic parts are marked `{n}` only in the "i18n key" tables; the transcriptions keep the fixture values.
- "Design note" = the author's caption under a block (transcribed verbatim, in Turkish).
- "Dead in prototype" = drawn as a static element with no behaviour; engineers must wire real behaviour. **This canvas has no click handlers, no gesture handlers and no timers at all — every control is static and the two swipe demos are frozen mid-gesture — so every interactive element on this canvas is dead in the prototype.** The per-block lists say what each one must do.
- "Inferred" = not drawn in the prototype; a recommendation so the engineer does not have to guess. Confirm with design if in doubt.
- Section numbers `8.x` are this document's; the design's own IDs (`empty/today`, `error/oauth-expired`, `loading/today`, `small · 158×158`, …) are quoted next to them and should be used as component / fixture names in code.

---

## 8.0 Page overview and design principles

Canvas title (H1, 30/36 600, letter-spacing −0.02em): `08 · Boş / Hata / Yükleme Durumları, Widget'lar, Mikro-etkileşimler`

Breadcrumb row above the title (12px, `ink/secondary`, current page bold `ink`): `← Prototip ve IA` · `01 Sistem` · `02 Onboarding` · `03 Bugün` · `04 Akış` · `05 Plan` · `06 Asistan` · `07 Hesap` · **`08 Durumlar`** · `09 Pazarlama`. (Design navigation only — not app UI.)

Author's page statement (verbatim, 14/21 `ink/secondary`, max-width 760):

> Boş durum bir başarı mesajıdır: “Her şey kontrol altında.” Hatalar okunur ve tek aksiyonludur; AI erişilemezse ürün brifingi yine gösterir (son analiz). Widget'lar Bugün ekranının küçültülmüş versiyonu değil, tek bir cevabın yüzeyidir.

Rules that fall out of that statement (engineers must respect these):

1. **An empty state is a success message.** It is never a grey "nothing here" placeholder. It has a tinted icon disc (success / brand / neutral tone), a confident headline, one sentence of reassurance that quotes what the assistant *did* (e.g. `46 maili senin için okudum.`) and exactly **one** soft CTA.
2. **Errors are readable and single-action.** One primary text action (brand colour) and at most one secondary text action (grey). No stack traces, no codes in the UI, no red full-screen takeovers. The body copy always says what still works (`Diğer her şey çalışıyor.`).
3. **AI unavailable ≠ product unavailable.** If the model / backend is unreachable or the device is offline, the last successful analysis (briefing, priorities) stays on screen, dimmed to 75 % opacity, with a dark ink banner stating the timestamp of the data. Only *new* generation (questions, drafts) is blocked.
4. **Skeletons are real-size.** Header and date render instantly from local state; only AI-generated content shimmers, in the exact card geometry it will fill. No spinner-only screens. No progress bars for AI work (`İlerleme çubuğu yok.`).
5. **Widgets answer one question each** (next important topic / today's 3 priorities / the briefing entry). A tap opens the relevant screen; **no write action is ever performed from a widget** (`yazma işlemi widget'tan yapılmaz`). Android widgets use the product's own surfaces, not Material dynamic colour; corner radius comes from the system.
6. **Motion is a contract**: standard curve `cubic-bezier(.2,.8,.2,1)`, exits `ease-out`, nothing longer than 600 ms, `Reduce Motion` collapses every duration to 0 except a 120 ms opacity cross-fade. Haptics are semantic (success / light / warning) and never decorative.

### 8.0.1 Where these states sit in navigation

| Block | Host screen (see other canvases) | Presentation |
|---|---|---|
| `empty/today` | Bugün tab root (canvas 03) — replaces the `ÖNCELİKLERİN` list when there is nothing important | In-place empty panel inside the tab's scroll view |
| `empty/plan` | Plan tab root, Gün view (canvas 05) — replaces the timeline when the day has no events | In-place empty panel |
| `empty/follow-up` | Takip list (Akış → Takip filter, and the Takipler block on Bugün; canvas 04) | In-place empty panel |
| `empty/approvals` | Onaylar / Onay kuyruğu screen (canvas 06/07) | In-place empty panel |
| `error/oauth-expired` | Bugün + Akış roots (inline card at the top of the list); also Hesap → Bağlantılar | Inline `card/system-notice` |
| `error/permission-denied` | Plan root and Meeting/Prep (inline card); also Bugün if calendar-derived content is missing | Inline `card/system-notice` |
| `error/sync-delayed` | Any tab root, below the header, above content | Inline `card/system-notice` |
| `error/ai-unavailable` | Asistan tab (chat composer area) and anywhere a draft / summary button is pressed | Inline `card/system-notice` |
| `error/offline` | Bugün tab root (full screen shown), same banner on every tab root | Persistent top banner + dimmed content |
| `loading/today` | Bugün tab root, first paint after cold start / pull-to-refresh | In-place skeleton |
| Widgets | OS home screen / lock screen (iOS WidgetKit; Android AppWidget) | Deep links into MainTabs |
| Motion / swipe / briefing-open | Applies app-wide | — |

### 8.0.2 Fixture timeline (so engineers understand the example data)

All fixtures on this canvas describe one Saturday morning for the user **Yunus**:
- Briefing generated at `07:58` (`BRİFİNG · 07:58`, widget medium header `07:58`).
- An urgent mail from **Ahmet** at `08:42` asking for a revised offer by `17:00`.
- Last **successful sync / analysis** at `09:40`; the sync-delayed card says the data may be `12 dakika` old (so "now" ≈ 09:52); the sync-complete toast fixture says `Güncel · 09:41`.
- Next meeting `14:30 Mehmet ile müşteri toplantısı`, prep ready with `3 konu`.
- Follow-up: `Mehmet · Teklif v2`, `3 gündür yanıt yok`.
- A third priority `Başvuru kapanıyor` at `17:00` (warning tone).
- A life item `Trendyol siparişin bugün geliyor.` (`KİŞİSEL`, `Bugün`).

Note the two distinct timestamps: `briefing.generatedAt` (07:58) and `sync.lastSuccessAt` (09:40). Do not collapse them into one field.

---

## 8.1 BOŞ DURUMLAR · POZİTİF, SAKİN (empty states)

Section kicker (design canvas): `BOŞ DURUMLAR · POZİTİF, SAKİN` — kicker style 12/16 600 +8 % caps `ink/tertiary`.

### 8.1.0 Pattern: `empty/*` panel (shared geometry)

Drawn as a 300-wide sample; in the app it fills the host list's content width (390 − 2×20 = 350) and sits where the list would be. Label above each sample (design-only, mono 10.5/600 `ink/secondary`) = the design ID (`e.where`).

Top-to-bottom, centred, `text-align:center`:

| Element | Spec |
|---|---|
| Container | height 340 (sample; in app: min-height 340, or fill remaining viewport above tab bar), background `neutral/bg` #F5F4F0, radius 28, 1 px ring `rgba(27,25,23,.08)` (= `neutral/hairline` at 8 % ink; on `neutral/bg` host this ring may be omitted — inferred), padding 28, column, `align-items:center; justify-content:center`, gap 12 |
| Icon disc | 60×60, circle, background `e.bg`, foreground `e.fg`, Material Symbols Rounded `e.icon` at 30, not filled |
| Title | raw 19/600, letter-spacing −0.01em, `ink`. No exact type-scale entry (between h3 17/23 and h2 22/28). Proposed token `type/empty-title` = 19/24 600. Alternative: use h2 22/28 if a single scale is preferred. |
| Sub | secondary 14/20 `ink/secondary`, `text-wrap:pretty` (balance lines; in RN allow natural wrapping, keep ≤ 3 lines) |
| CTA | margin-top 6 (so 18 total from sub), height 38, padding 0 14, radius 12, background `neutral/surface` #FFF, 13/600 `brand/text-on-soft` #4547C9, shadow `0 1px 2px rgba(27,25,23,.06)`. Pattern name: `button/soft-on-bg` (a white pill button that lives on the warm background). Pressed: background `neutral/surface-2`, label `brand/primary-pressed` (inferred). |

Dark mode (inferred — the canvas draws no dark empty state): container `dark/surface` #1F1E1B or transparent on `dark/bg`; ring `dark/surface-2`; title `dark/text`; sub `dark/secondary`; CTA background `dark/surface-2` with label `dark/primary` #8586F2; icon discs keep their tinted soft backgrounds at 16 % alpha of the base colour (success → `rgba(47,160,98,.16)` with `dark/success-text`; brand → `rgba(133,134,242,.16)` with `dark/primary`; neutral → `dark/surface-2` with `dark/secondary`).

Motion: the panel fades in with the standard 240 ms `fade + 8 px` rise used by the briefing hero (see 8.5 row 1). No haptic.

### 8.1.1 `empty/today · önemli mail yok`

- Host: Bugün tab, replaces the priorities list when the day's analysis produced zero priority items.
- Icon: `done_all` on disc background `success/soft` #E4F5EA, foreground `success/text` #1E7A47.
- Title: `Her şey kontrol altında.`
- Sub: `Bugün dikkat gerektiren yeni bir konu yok. 46 maili senin için okudum.` — `46` is dynamic (`{readMailCount}`).
- CTA: `Akışa göz at` → switch to the **Akış** tab (tab 2), default filter.
- Data fields: `readMailCount:number` (mails scanned today).
- Dead in prototype: `Akışa göz at`.

### 8.1.2 `empty/plan · toplantı yok`

- Host: Plan tab, Gün view, when the selected day has no events (and no AI blocks). Hero/briefing on Bugün may also surface this copy when the calendar is empty.
- Icon: `self_improvement` on disc background `brand/soft` #EDEDFC, foreground `brand/text-on-soft` #4547C9.
- Title: `Bugün takvimin oldukça sakin.`
- Sub: `Yarın 09:00 Haftalık ekip ile başlıyorsun. Bugünü odak için kullanabilirsin.` — `Yarın 09:00` and `Haftalık ekip` are dynamic: next event's relative day, time and title (`{nextEventRelativeDay} {nextEventTime} {nextEventTitle}`). If there is no next event within 7 days, drop the first sentence (inferred).
- CTA: `Odak bloğu öner` → ask the assistant to propose a focus block; opens the Plan timeline with a dashed AI block proposal (`Önerilen`, see canvas 05) and the approval flow. It must **not** write to the calendar directly (approval rule).
- Data fields: `nextEvent: { startsAt, title }` (nullable).
- Dead in prototype: `Odak bloğu öner`.

### 8.1.3 `empty/follow-up · takip yok`

- Host: Takip list (Akış → Takip filter) and the Takipler block on Bugün.
- Icon: `mark_email_read` on `success/soft` / `success/text`.
- Title: `Bekleyen takip yok.`
- Sub: `Gönderdiğin her maile yanıt geldi. Yeni bir gecikme olursa buraya düşer.`
- CTA: `Tamam` → dismisses / collapses the panel (on Bugün the Takipler block collapses to its kicker; on the Takip filter it simply pops back to the previous filter — inferred: `Tamam` here is an acknowledgement, not navigation).
- Data fields: none beyond the count being 0.
- Dead in prototype: `Tamam`.

### 8.1.4 `empty/approvals · onay yok`

- Host: Onaylar (approval queue) screen.
- Icon: `task_alt` on disc background `neutral/surface-2` #F0EFEB, foreground `ink/secondary` #6B6860 (neutral tone — this is informational, not a success).
- Title: `Onay bekleyen işlem yok.`
- Sub: `Bir mail göndermek veya takvimi değiştirmek istediğimde önce burada görürsün.` — the assistant speaks in first person; keep the voice.
- CTA: `Geçmişi gör` → pushes the approval history list (past approved / rejected actions).
- Data fields: `pendingApprovalCount === 0`; history route needs `approvals[] {id, kind: 'mail'|'calendar'|…, status, decidedAt}` (see canvas 06/07 for the row design).
- Dead in prototype: `Geçmişi gör`.

### 8.1.5 Data array `EMPTIES` (verbatim transcription)

```
where                               icon              bg       fg       title                             sub                                                                                       cta
empty/today · önemli mail yok       done_all          #E4F5EA  #1E7A47  Her şey kontrol altında.          Bugün dikkat gerektiren yeni bir konu yok. 46 maili senin için okudum.                    Akışa göz at
empty/plan · toplantı yok           self_improvement  #EDEDFC  #4547C9  Bugün takvimin oldukça sakin.     Yarın 09:00 Haftalık ekip ile başlıyorsun. Bugünü odak için kullanabilirsin.             Odak bloğu öner
empty/follow-up · takip yok         mark_email_read   #E4F5EA  #1E7A47  Bekleyen takip yok.               Gönderdiğin her maile yanıt geldi. Yeni bir gecikme olursa buraya düşer.                  Tamam
empty/approvals · onay yok          task_alt          #F0EFEB  #6B6860  Onay bekleyen işlem yok.          Bir mail göndermek veya takvimi değiştirmek istediğimde önce burada görürsün.             Geçmişi gör
```

Token mapping: `#E4F5EA`=`success/soft`, `#1E7A47`=`success/text`, `#EDEDFC`=`brand/soft`, `#4547C9`=`brand/text-on-soft`, `#F0EFEB`=`neutral/surface-2`, `#6B6860`=`ink/secondary`.

Proposed model:

```ts
type EmptyStateTone = 'success' | 'brand' | 'neutral';
interface EmptyState {
  id: 'today' | 'plan' | 'follow-up' | 'approvals';
  icon: string;            // Material Symbols Rounded name
  tone: EmptyStateTone;    // resolves to soft bg + text fg tokens
  title: string;           // i18n
  subtitle: string;        // i18n with params
  cta: { label: string; action: 'goto-flow' | 'suggest-focus-block' | 'dismiss' | 'goto-approval-history' };
}
```

---

## 8.2 HATA DURUMLARI · OKUNUR, TEK AKSİYON (error, offline and loading states)

Section kicker: `HATA DURUMLARI · OKUNUR, TEK AKSİYON`.

The section has three columns: (1) four inline error cards, (2) the full-screen offline state of Bugün, (3) the Bugün loading skeleton.

### 8.2.0 Pattern: `card/system-notice` (inline error card, shared geometry)

Drawn at 390 wide (in app: list content width, 20 side margins → 350). Label above each sample (design-only, mono) = the design ID (`e.code`).

| Element | Spec |
|---|---|
| Container | background `neutral/surface` #FFF, radius 18, padding 14 16, shadow `0 1px 2px rgba(27,25,23,.04), 0 6px 20px rgba(27,25,23,.05)` (the standard elevated-card shadow), row, gap 12, `align-items:flex-start` |
| Icon tile | 36×36, radius 11, background `e.bg`, foreground `e.fg`, Material Symbols Rounded `e.icon` at 20, `flex:none` |
| Body | `flex:1; min-width:0` |
| Title | 15/600 letter-spacing −0.01em `ink` (body-strong) |
| Sub | margin-top 2, 13/19 `ink/secondary`, `text-wrap:pretty` |
| Actions row | margin-top 8, row, gap 14, 13/600. `a1` (primary text action) `brand/text-on-soft` #4547C9; `a2` (secondary text action) `ink/secondary` #6B6860. Text-only buttons, no background; hit-slop ≥ 8 vertically so the 13 px label reaches a 44 pt target (inferred). |

Placement: at the top of the host list, below the header, above the first content card; 12 gap below. It **does not replace content** — the rest of the screen keeps working. Dismissal via `a2` where `a2` is `Sonra` / `Tamam`; otherwise the card persists until the condition clears.

Dark mode (inferred): container `dark/surface`, title `dark/text`, sub `dark/secondary`, `a1` `dark/primary`, `a2` `dark/secondary`; icon tiles keep soft tints at 16–20 % alpha with `dark/critical-text` #F08B78 / `dark/warning-text` #F0B85A / `dark/secondary` foregrounds.

Haptic: **warning** on first appearance of `error/oauth-expired`, `error/permission-denied` (they block a feature); none for `sync-delayed` / `ai-unavailable` (the contract says warning is for "çakışma, hata" — apply once per condition, not per render; inferred).

### 8.2.1 `error/oauth-expired`

- Trigger: Gmail (Google) OAuth refresh fails / token revoked.
- Icon: `link_off`, tile `critical/soft` #FCEDE9, foreground `critical/text` #C7432F (critical tone — analysis is blocked).
- Title: `Gmail bağlantısı yenilenmeli.`
- Sub: `Google oturumu süresi doldu. Yeniden bağlanana kadar yeni mailler analiz edilmez.`
- `a1` `Yeniden Bağlan` → start the Google OAuth flow (same as onboarding connect step, canvas 02) and on success remove the card and trigger a sync.
- `a2` `Sonra` → dismiss for this session; card returns on next cold start while the condition persists (inferred). The Hesap → Bağlantılar row must also show the broken state (canvas 07).
- Data: `connection: { provider:'gmail', status:'expired', expiredAt }`.
- Dead in prototype: `Yeniden Bağlan`, `Sonra`.

### 8.2.2 `error/permission-denied`

- Trigger: calendar permission not granted (OS permission or Google Calendar scope missing).
- Icon: `event_busy`, tile `warning/soft` #FDF2DC, foreground `warning/text` #9A6300.
- Title: `Takvim izni verilmedi.`
- Sub: `Toplantı hazırlığı ve çakışma uyarıları takvim erişimi gerektirir. Diğer her şey çalışıyor.`
- `a1` `İzin Ver` → request the permission (OS prompt; if previously hard-denied, open app settings via `Linking.openSettings()` — inferred).
- `a2` `Neden gerekli?` → opens the privacy explainer sheet for calendar access (canvas 07, Gizlilik) as a bottom sheet.
- Data: `permissions.calendar: 'granted'|'denied'|'undetermined'`.
- Dead in prototype: `İzin Ver`, `Neden gerekli?`.

### 8.2.3 `error/sync-delayed`

- Trigger: background sync has failed ≥ 1 time and retry is in progress.
- Icon: `sync_problem`, tile `warning/soft`, foreground `warning/text`.
- Title: `Senkronizasyon gecikti.`
- Sub: `Son başarılı analiz 09:40. Yeniden deniyoruz; gösterilenler 12 dakika eski olabilir.` — `09:40` = `{lastSuccessAt}` (HH:mm), `12` = `{staleMinutes}`.
- `a1` `Şimdi Dene` → immediate manual sync; while running, the `a1` label is replaced by the 14 px spinner (see 8.2.6) and the pull-to-refresh indigo line shows; on success the card is removed and the `Güncel · HH:mm` toast (8.5 row 8) is shown.
- `a2` `Tamam` → dismiss the card (condition may still be true; the offline/sync chip in the header keeps the truth — inferred).
- Data: `sync: { lastSuccessAt, lastAttemptAt, retrying:boolean }`.
- Dead in prototype: `Şimdi Dene`, `Tamam`.

### 8.2.4 `error/ai-unavailable`

- Trigger: model / assistant backend returns 5xx or times out while the data layer is fine.
- Icon: `cloud_off`, tile `neutral/surface-2` #F0EFEB, foreground `ink/secondary` #6B6860 (neutral — nothing the user has is lost).
- Title: `Asistan şu an yanıt veremiyor.`
- Sub: `Brifingin ve önceliklerin hazır; yalnızca yeni soru ve taslaklar birkaç dakika bekleyebilir.`
- `a1` `Tekrar Dene` → retry the failed request (re-send the last chat message / regenerate the draft).
- `a2` `Brifinge Dön` → navigate to the Bugün tab (briefing hero). In the Asistan tab this card replaces the assistant's reply bubble; in draft sheets it replaces the generating state.
- Data: `assistant.status:'ok'|'unavailable'`, plus the retriable request handle.
- Dead in prototype: `Tekrar Dene`, `Brifinge Dön`.

### 8.2.5 `error/offline · tam ekran · son analiz görünür kalır` (full-screen offline state of Bugün)

Design label: `error/offline · tam ekran · son analiz görünür kalır`. A 390×700 crop of the Bugün tab root while offline.

Layout top-to-bottom:

1. **Status bar** (design only): height 54, `9:41`, icons `signal_cellular_alt`, `wifi_off`, `battery_full`.
2. **Offline banner** — pattern `banner/offline`: margin 8 20 0 (so it sits directly under the status bar, above the page header), padding 10 14, radius 14, background `ink` #1A1917, text `#FFFFFF` 13px, row, gap 10, `align-items:center`.
   - Leading icon `wifi_off` 18, colour `dark/critical-text` #F08B78.
   - Text (`flex:1`): `Çevrimdışısın. Son analiz 09:40'tan gösteriliyor.` — `09:40` = `{lastSuccessAt}`.
   - Trailing action `Yenile` 13/600 colour `brand/dark-glow` #A9AAF5 → attempt a reconnect + sync; while trying, show the spinner in place of the label; if still offline, shake nothing, just keep the banner (no error-on-error).
   - The banner is the same in dark mode (it is already ink-on-dark; on `dark/bg` use `dark/surface` #1F1E1B with a 1 px `dark/surface-2` ring so it still separates — inferred).
   - The banner persists on every tab root while `netInfo.isConnected === false`; it is not dismissible.
3. **Page content** wrapper: padding 16 20 0, column, gap 18, **`opacity: .75`** — everything below the banner is dimmed to 75 % to signal staleness. The dim applies to the whole scroll content, not to the banner.
   - **Header**: date kicker `5 EYLÜL CUMARTESİ` (12/600 +.08em `ink/tertiary`), greeting `Günaydın, Yunus` (h1 28/34 600 −.02em, margin-top 4). Both come from local clock + profile, never from the network.
   - **Hero card** (`card/briefing-hero`, offline variant): background `neutral/surface` #FFF, radius 28, padding 22, elevated shadow.
     - Kicker row: icon `history` 16 + `BRİFİNG · 07:58 · ÇEVRİMDIŞI` 12/600 +.06em `ink/tertiary`, gap 6. The `history` icon and the `· ÇEVRİMDIŞI` suffix are the offline markers; the online kicker (canvas 03) uses `auto_awesome` and no suffix. `07:58` = `{briefing.generatedAt}`.
     - Headline (margin-top 10): `Bugün bilmen gereken 5 şey var.` raw 26/32 600 −.02em (canvas 03 hero uses the same size; proposed token `type/hero-headline` 26/32 600). `5` = `{briefing.itemCount}`. Note: in the offline hero the number is **not** tinted brand (compare widget large 8.3.3 where it is) — keep plain ink here.
     - Sub (margin-top 8): `3 önemli mail · 4 etkinlik · 2 takip` 14 `ink/secondary` → `{mailCount} önemli mail · {eventCount} etkinlik · {followUpCount} takip`.
     - Button row (margin-top 18, gap 10):
       - `Brifingimi Gör` — primary dark button: `flex:1`, height 48, radius 14, background `ink` #1A1917, label `#FFF` 15/600 → opens the briefing reader (canvas 03) with the cached briefing. Works offline.
       - `İndirilmedi` — disabled secondary: height 48, padding 0 16, radius 14, background `neutral/surface-2` #F0EFEB, label `ink/disabled` #B8B4AA 14/600, leading icon `download_for_offline` 20, gap 4. This is the **audio** button in its "not downloaded" state (online it reads `Dinle · 2 dk`, see widgets). Disabled while offline and the audio file is not cached; when cached it becomes enabled and reads `Dinle · {min} dk` (inferred from widget copy).
   - **Priority card** (`card/priority`, offline variant): background #FFF, radius 20, padding 14 16, shadow `0 1px 2px rgba(27,25,23,.04)`.
     - Header row (gap 8): badge `ACİL` — badge type 11/14 700 +5 %, padding 3 8, pill, background `critical/soft` #FCEDE9, text `critical/text` #C7432F; time `08:42` 12 `ink/tertiary`.
     - Title (margin-top 6): `Ahmet senden bugün 17:00'ye kadar revize teklif bekliyor.` h3 17/23 600 −.01em.
     - Footnote (margin-top 8): `Yanıt taslağı bağlantı gelince hazırlanır.` 12 `ink/tertiary`. This line replaces the online card's action row (`Taslağı Gör` etc., canvas 03) — offline, AI drafting is deferred, so the card explains it instead of offering a dead button.
4. **Home indicator** (design only): 134×5, radius 3, `rgba(27,25,23,.25)`, 8 from bottom.

Behaviour:
- Enter: when connectivity drops, the banner slides in from the top (240 ms, standard curve) and the content animates `opacity 1 → .75` over 250 ms. Haptic **warning** once.
- Exit: on reconnect, auto-sync; banner slides out; opacity returns to 1; sync-complete toast `Güncel · HH:mm` for 1.5 s (8.5 row 8). Haptic light.
- All cached data remains tappable (priority card opens its detail with cached content; buttons that need the network — drafting, sending, asking — show `error/ai-unavailable`-style inline copy rather than spinners).
- If there is **no cached briefing at all** (first launch offline), show `empty/today`-shaped panel with icon `wifi_off` on `neutral/surface-2`, title `Çevrimdışısın.` and the banner's second sentence dropped (inferred — not drawn; confirm copy with design).

Data fields: `net.isConnected`, `sync.lastSuccessAt`, `briefing { generatedAt, itemCount, mailCount, eventCount, followUpCount, audio { durationMin, isDownloaded } }`, `priorities[] { urgency:'acil'|…, receivedAt, title, deferredNote }`, `profile.firstName`, local date.

Dead in prototype: `Yenile`, `Brifingimi Gör`, `İndirilmedi` (disabled, but must become enabled when cached), the priority card tap.

### 8.2.6 `loading/today · iskelet, gerçek kart ölçülerinde` (Bugün skeleton)

Design label: `loading/today · iskelet, gerçek kart ölçülerinde`. A 390×700 crop of Bugün during first load.

Design note (verbatim): `Başlık ve tarih anında; yalnızca AI içeriği iskelet. 1,6 sn parıltı, kartlar tek tek 60 ms arayla dolar.`

Layout top-to-bottom:

1. Status bar (design only) `9:41`, `signal_cellular_alt`, `wifi`, `battery_full`.
2. Content wrapper: padding 14 20 0, column, gap 18 (no banner, so 14 top instead of 16).
3. **Header — rendered for real, instantly**: `5 EYLÜL CUMARTESİ` kicker + `Günaydın, Yunus` h1 (same specs as 8.2.5). Greeting variant (`Günaydın` / `İyi günler` / `İyi akşamlar`) comes from local time (see canvas 03).
4. **Hero skeleton** (`card/briefing-hero` skeleton): background #FFF, radius 28, padding 22, elevated shadow, column, gap 12.
   - Status row (gap 8): **spinner** + `BRİFİNG HAZIRLANIYOR…` 12/600 +.06em colour `brand/primary` #5B5CE2 (note: brand, not tertiary — the only coloured text in the skeleton). The trailing character is a single ellipsis `…` (U+2026).
   - Spinner: 14×14 circle, border 2 px `raw #D9D6F7` (proposed token `spinner/track`; visually ≈ `brand/soft` slightly darker), `border-top-color` `brand/primary`, rotates 360° every **0.8 s linear infinite**.
   - `s1` bar: width 85 %, height 22, radius 8 (headline line 1).
   - `s2` bar: width 55 %, height 22, radius 8 (headline line 2).
   - `s3` bar: width 40 %, height 12, radius 6 (the `3 önemli mail · …` sub line).
   - Button row (margin-top 6, gap 10): `s4` = `flex:1`, height 48, radius 14, solid `raw #EFEDE7` (no shimmer — placeholder for the dark primary button); `s5` = 110×48, radius 14, solid `neutral/bg` #F5F4F0 (placeholder for the audio button).
5. Kicker `ÖNCELİKLERİN` 12/600 +.08em `ink/tertiary`, padding 0 4 — rendered for real.
6. **Priority card skeleton** ×2 (`card/priority` skeleton): background #FFF, radius 20, padding 14 16, shadow `0 1px 2px rgba(27,25,23,.04)`, column, gap 10.
   - `s6` bar: width 30 %, height 18, radius 9 (badge + time row).
   - `s7` bar: width 92 %, height 16, radius 8 (title line).
   - `s8` bar: width 50 %, height 12, radius 6 (meta line).
7. Home indicator.

**Shimmer spec** (`sk()` helper, verbatim): each bar is `display:block`, background `linear-gradient(90deg, #EFEDE7 25%, #F7F6F2 50%, #EFEDE7 75%)`, `background-size: 200% 100%`, animation `dashimmer 1.6s linear infinite` where `dashimmer` moves `background-position` from `200% 0` to `-200% 0`. Default radius = height / 2 when not given. Proposed tokens: `skeleton/base` = #EFEDE7, `skeleton/highlight` = #F7F6F2. In RN: a `LinearGradient` (expo-linear-gradient) translated with Reanimated across the bar width, 1.6 s linear loop, shared clock so all bars shimmer in phase (inferred).

Dark mode (inferred): `skeleton/base-dark` = `dark/surface-2` rgba(255,255,255,.08), highlight rgba(255,255,255,.14); spinner track rgba(255,255,255,.18) with `dark/primary` head; status text `dark/primary` #8586F2; card surfaces `dark/surface`.

Fill choreography (from the design note and 8.5 rows 1 & 7): when data arrives, the hero cross-fades from skeleton to content (240 ms fade + 8 px rise), the headline number counts 0 → N over 360 ms, then the priority cards fill **one by one at 60 ms stagger**, each with a 280 ms fade + rise. If data arrives before 300 ms, skip the skeleton entirely (avoid flash — inferred). Never show the skeleton for more than ~8 s: after that fall back to cached content + `error/sync-delayed` (inferred).

Reduced motion: no shimmer, static `skeleton/base` bars; fills are 120 ms opacity only.

Dead in prototype: nothing interactive; the skeleton must not be tappable.

### 8.2.7 Data array `ERRORS` (verbatim transcription)

```
code                      icon          bg       fg       title                                sub                                                                                                        a1              a2
error/oauth-expired       link_off      #FCEDE9  #C7432F  Gmail bağlantısı yenilenmeli.        Google oturumu süresi doldu. Yeniden bağlanana kadar yeni mailler analiz edilmez.                          Yeniden Bağlan  Sonra
error/permission-denied   event_busy    #FDF2DC  #9A6300  Takvim izni verilmedi.               Toplantı hazırlığı ve çakışma uyarıları takvim erişimi gerektirir. Diğer her şey çalışıyor.                İzin Ver        Neden gerekli?
error/sync-delayed        sync_problem  #FDF2DC  #9A6300  Senkronizasyon gecikti.              Son başarılı analiz 09:40. Yeniden deniyoruz; gösterilenler 12 dakika eski olabilir.                       Şimdi Dene      Tamam
error/ai-unavailable      cloud_off     #F0EFEB  #6B6860  Asistan şu an yanıt veremiyor.       Brifingin ve önceliklerin hazır; yalnızca yeni soru ve taslaklar birkaç dakika bekleyebilir.               Tekrar Dene     Brifinge Dön
```

Token mapping: `#FCEDE9`=`critical/soft`, `#C7432F`=`critical/text`, `#FDF2DC`=`warning/soft`, `#9A6300`=`warning/text`, `#F0EFEB`=`neutral/surface-2`, `#6B6860`=`ink/secondary`.

Proposed model:

```ts
type NoticeTone = 'critical' | 'warning' | 'neutral';
interface SystemNotice {
  code: 'oauth-expired' | 'permission-denied' | 'sync-delayed' | 'ai-unavailable';
  tone: NoticeTone;
  icon: string;
  title: string;
  body: string;                    // i18n, params: lastSuccessAt, staleMinutes
  primary: { label: string; action: string };
  secondary?: { label: string; action: 'dismiss' | 'explain' | 'goto-briefing' };
  dismissible: boolean;
}
```

---

## 8.3 WIDGET'LAR · iOS

Section kicker: `WIDGET'LAR · iOS`. Four samples, each with a design-only mono label. Shadows on the samples (`0 8px 24px rgba(27,25,23,.12)`) are canvas presentation; on device the OS draws the container. Corner radius 22 is illustrative — use `ContainerRelativeShape` so the radius matches the system. Font: the app's Geist is not available to WidgetKit unless bundled; bundle Geist (300–700) in the widget extension target or fall back to SF Pro with matching weights (inferred).

All widgets read from a shared app-group snapshot written by the app after every successful sync: `WidgetSnapshot { generatedAt, briefing, priorities[0..3], nextMeeting, followUp, importantCount, firstDeadlineAt }`. Widgets never call the network or the model themselves. Timeline reload: after each sync, at midnight, and 5 min before `nextMeeting.startsAt` (inferred).

Widget tap → deep link scheme, e.g. `dijitalasistan://today`, `dijitalasistan://priority/{id}`, `dijitalasistan://meeting/{id}/prep`, `dijitalasistan://followup/{id}`, `dijitalasistan://briefing?autoplay=1` (inferred names; keep them stable because widgets are versioned separately from the app).

### 8.3.1 `small · 158×158 · sıradaki önemli konu` (systemSmall)

Answers: "What is the next important thing?"

- Container: 158×158, radius 22, background `neutral/surface` #FFF, padding 14, column.
- Top row (`space-between`, centred): app glyph `auto_awesome` 16, `brand/primary`, **filled** (`FILL 1`); badge `ACİL` 10/700 +.05em, padding 2 6, pill, `critical/soft` / `critical/text`. Badge tone follows the item urgency (ACİL → critical; a warning item would use `warning/soft`+`warning/text`; a neutral one `neutral/surface-2`+`ink/secondary` — inferred from the medium widget's dot colours).
- Bottom block (`margin-top:auto`): title `Ahmet 17:00'ye kadar revize teklif bekliyor.` 14/18 600 −.01em `ink`, `text-wrap:pretty`, max 3 lines; meta (margin-top 6) `Gmail · 08:42` 11 `ink/tertiary` → `{source} · {receivedAt HH:mm}`.
- Tap (whole widget) → `priority/{id}` (the mail/priority detail, canvas 04).
- Empty snapshot: show glyph + `Her şey kontrol altında.` 14/18 600 and no badge (inferred; reuse the empty/today headline).
- Data: `priority { id, badge:{label,tone}, title, source:'Gmail'|'Takvim'|…, receivedAt }`.
- Dead in prototype: the widget tap.

### 8.3.2 `medium · 338×158 · bugünün 3 önceliği` (systemMedium)

Answers: "What are today's 3 priorities?"

- Container: 338×158, radius 22, #FFF, padding 14 16, column.
- Header row (`space-between`, centred): left = `auto_awesome` 15 filled + `BUGÜN · 3 ÖNCELİK` 11/600 +.06em `brand/primary`, gap 5 (`{count} ÖNCELİK`); right = `07:58` 11 `ink/tertiary` (= `briefing.generatedAt`).
- List (margin-top 8, `flex:1`, `justify-content:space-between` so 3 rows spread evenly): each row = dot 6×6 radius 3 + title 13/500 `ink` single line ellipsis (`flex:1`) + time 11 `ink/tertiary`, gap 8.
  1. dot `critical` #E0553F · `Ahmet'e revize teklif` · `17:00`
  2. dot `ink/tertiary` #9B978E · `Mehmet ile müşteri toplantısı` · `14:30`
  3. dot `warning` #E09A1C · `Başvuru kapanıyor` · `17:00`
- Dot tone = urgency: `critical` (acil), `warning` (deadline today), `ink/tertiary` (scheduled / neutral). A `success` dot is used for done items if they remain visible (inferred).
- Tap: each row is a separate `Link` → `priority/{id}`; header / empty area → `today`.
- Fewer than 3 items: rows collapse to the top, remaining space empty; zero items: `Her şey kontrol altında.` centred 13/500 (inferred).
- Data: `priorities[0..3] { id, tone, title, dueAt|startsAt }`, `briefing.generatedAt`.
- Dead in prototype: header, rows.

### 8.3.3 `large · 338×354 · brifing + sonraki toplantı + takip` (systemLarge)

Answers: "Briefing entry + next meeting + the one follow-up."

- Container: 338×354, radius 22, #FFF, padding 16, column, gap 12.
- **Briefing block**: background `gradient/dawn` (drawn as `radial-gradient(140% 100% at 100% 0%, #E4E4FA 0%, #FFFFFF 60%)` — the same hero wash as canvas 03; `#E4E4FA` is the dawn tint, slightly lighter than `brand/soft`), radius 16, padding 14.
  - Kicker: `auto_awesome` 15 filled + `SABAH BRİFİNGİ` 11/600 +.06em `brand/primary`, gap 5. Variant labels by time of day follow canvas 03 (`SABAH BRİFİNGİ` / `ÖĞLE BRİFİNGİ` / `AKŞAM BRİFİNGİ` — inferred).
  - Headline (margin-top 6): `Bugün bilmen gereken 5 şey var.` 19/24 600 −.02em, with the number `5` coloured `brand/primary`.
  - Action (margin-top 8): `play_arrow` 16 filled + `Dinle · 2 dk` 12/600 `brand/text-on-soft`, gap 6 → deep link `briefing?autoplay=1` (opens the app on the briefing reader and starts audio; playback is not a write, but WidgetKit cannot play audio itself). `2` = `{audioDurationMin}`.
  - Block tap (outside the action) → `today`.
- **Next meeting section**: kicker `SONRAKİ TOPLANTI` 11/600 +.06em `ink/tertiary`; row (margin-top 6, gap 10, centred):
  - Time tile `tile/time-stacked`: 40×40, radius 12, background `neutral/bg` #F5F4F0, column centred, 10/600 line-height 1.1 `ink/secondary`; hour `14` at 14 px `ink`, minute `30` at 10 px below.
  - Text: `Mehmet ile müşteri toplantısı` 14/600 −.01em; sub `Hazırlık hazır · 3 konu` 12 `ink/tertiary` → `Hazırlık hazır · {topicCount} konu`; when prep is not ready: `Hazırlık hazırlanıyor` (inferred, matches the prep-status vocabulary of canvas 05).
  - Row tap → `meeting/{id}/prep` (Meeting/Prep, canvas 05).
- **Follow-up section**: kicker `TAKİP`; row (margin-top 6, gap 10, centred):
  - Icon tile 40×40 radius 12 `neutral/bg`, icon `schedule_send` 20 `ink/secondary`.
  - Text: `Mehmet · Teklif v2` 14/600 −.01em (`{person} · {subject}`); sub `3 gündür yanıt yok` 12 `ink/tertiary` (`{days} gündür yanıt yok`).
  - Trailing action `Takip Et` 12/600 `brand/text-on-soft` → deep link `followup/{id}?compose=1`: opens the app on the follow-up draft **for approval**. It must **not** send the follow-up from the widget (rule 5).
- Empty sections: if there is no next meeting today, the section shows `Bugün başka toplantı yok.`; if no follow-up, hide the section and let the briefing block grow (inferred).
- Data: `briefing { itemCount, audioDurationMin, timeOfDay }`, `nextMeeting { id, startsAt, title, prepReady, topicCount }`, `followUp { id, person, subject, daysWaiting }`.
- Dead in prototype: briefing block, `Dinle · 2 dk`, meeting row, `Takip Et`.

### 8.3.4 `lock screen · circular · rectangular · inline` (accessory widgets)

The sample is a 300×354 lock-screen mock: background `gradient/night` (drawn as `linear-gradient(180deg, #1E1E4C 0%, #3B3CA8 70%, #7071EA 100%)`), radius 32, padding 28 22, white text. Only the three accessory widgets are product UI; date and clock are the OS.

- OS date `Cumartesi 5 Eylül` 14/500 opacity .85; OS clock `9:41` 72/76 600 −.04em.
- **accessoryInline** (below the clock, margin-top 8): pill background `rgba(255,255,255,.14)`, padding 4 10, radius 999; content `auto_awesome` 14 + `5 önemli konu · ilki 17:00` 12/500 opacity .9 → `{importantCount} önemli konu · ilki {firstDeadlineAt HH:mm}`. Tap → `today`. Note iOS renders inline widgets as system text — the pill is illustrative.
- **accessoryCircular** (row margin-top 18, gap 10): 60×60 circle, background `rgba(255,255,255,.18)`; stacked: `ÖNEMLİ` 9/600 +.06em opacity .8 above the count `5` 20/600 line-height 1. Tap → `today`. Use `AccessoryWidgetBackground()` for the tint.
- **accessoryRectangular**: 158×60, radius 18, background `rgba(255,255,255,.18)`, padding 8 12, column centred: `SONRAKİ · 14:30` 10/600 +.06em opacity .8 → `SONRAKİ · {HH:mm}`; `Mehmet ile toplantı` 13/16 600 (margin-top 2; note the **shortened** title — `{person} ile toplantı`, not the full event title, to fit 158 px); `Hazırlık hazır` 10 opacity .8 (margin-top 1). Tap → `meeting/{id}/prep`.
- Lock-screen widgets are monochrome/vibrant by system — colours here are just the mock; only opacity hierarchy (1 / .9 / .8) carries over.
- Data: `importantCount`, `firstDeadlineAt`, `nextMeeting { id, startsAt, person, prepReady }`.
- Dead in prototype: all three taps.

---

## 8.4 WIDGET'LAR · ANDROID

Section kicker: `WIDGET'LAR · ANDROID`.

Design note (verbatim): `Widget'lar tek cevap verir: sıradaki konu, 3 öncelik ya da brifing girişi. Dokunuş ilgili ekranı açar; yazma işlemi widget'tan yapılmaz. Android'de Material tema rengi yerine ürünün kendi yüzeyleri kullanılır; köşe yarıçapı sistemden gelir.`

Implementation notes: build with Glance (Jetpack) or RemoteViews; background radius = `@android:dimen/system_app_widget_background_radius` (the drawn 28 is illustrative); do **not** apply `Theme.DeviceDefault.DayNight` dynamic colour — use the product palette (`neutral/surface` light, `dark/surface` dark following the system dark mode). Same shared snapshot and deep links as iOS.

### 8.4.1 `4×2 · brifing + öncelikler`

- Container: 340×170 (4×2 cells), radius 28 (system), background `neutral/surface` #FFF, padding 16 18, column.
- Header row (`space-between`, centred):
  - Left (gap 6): app mark 22×22 radius 7 background `brand/primary` with `auto_awesome` 14 white filled, then `Dijital Asistan` 12/600 `brand/primary`.
  - Right: play button 32×32 circle background `brand/soft` #EDEDFC, icon `play_arrow` 18 filled `brand/text-on-soft` → deep link `briefing?autoplay=1` (opens the app and plays; no background playback from the widget in v1 — inferred).
- Headline (margin-top 8): `Bugün bilmen gereken 5 şey var.` 17/22 600 −.01em `ink` (h3-ish; number not tinted here).
- Chip row (`margin-top:auto`, gap 6), each chip height 30, padding 0 10, pill, 12/600:
  1. `Ahmet · 17:00` — `critical/soft` background, `critical/text` label (urgent) → `priority/{id}`
  2. `Mehmet · 14:30` — `neutral/surface-2` background, `ink/secondary` label (neutral / scheduled) → `priority/{id}` or `meeting/{id}/prep`
  3. `+3` — same neutral style → `today` (overflow count = `itemCount − shownChips`)
- Chip label format: `{person} · {HH:mm}`; tone follows urgency like the medium widget dots. Show at most 2 chips + overflow.
- Header tap (mark/name) → `today`.
- Dark mode: background `dark/surface`, headline `dark/text`, mark stays `brand/primary`, name `dark/primary`, neutral chips `dark/surface-2` + `dark/secondary`, urgent chip `rgba(224,85,63,.18)` + `dark/critical-text` (inferred).
- Data: `briefing.itemCount`, `priorities[0..2] { id, person, time, tone }`, overflow.
- Dead in prototype: play button, chips, header.

### 8.4.2 `2×2 · sıradaki`

- Container: 170×170, radius 28 (system), background `ink` #1A1917 (this widget is **always dark**, on both themes — it is the product's dark surface, use `dark/bg`-adjacent `ink`), text white, padding 16, column.
- Top: `auto_awesome` 18 filled, colour `brand/dark-glow` #A9AAF5.
- Bottom block (`margin-top:auto`): kicker `SONRAKİ · 14:30` 11/600 +.06em `rgba(255,255,255,.6)` (≈ `dark/secondary`; `SONRAKİ · {HH:mm}`); title (margin-top 4) `Mehmet ile müşteri toplantısı` 15/19 600 −.01em white, max 3 lines; sub (margin-top 4) `3 konu hazır` 11 `rgba(255,255,255,.6)` (`{topicCount} konu hazır`; when not ready: `Hazırlık hazırlanıyor` — inferred).
- Tap → `meeting/{id}/prep`.
- When there is no next meeting: kicker `SIRADAKİ` and title = the next important priority (`Ahmet 17:00'ye kadar revize teklif bekliyor.`), tap → `priority/{id}` (inferred; label "sıradaki" = "next up" is intentionally generic).
- Data: `nextMeeting { id, startsAt, title, topicCount, prepReady }` with priority fallback.
- Dead in prototype: the widget tap.

---

## 8.5 MİKRO-ETKİLEŞİMLER · HAREKET VE HAPTİK SÖZLEŞMESİ (motion & haptics contract)

Section kicker: `MİKRO-ETKİLEŞİMLER · HAREKET VE HAPTİK SÖZLEŞMESİ`.

The table card (design canvas): background #FFF, radius 24, padding 8 24; grid columns `150 / 1fr / 1fr / 110`, gap 12, rows padding 12 0, row dividers 1 px `rgba(27,25,23,.06)`; header cells 11/600 +.06em `ink/tertiary` with a 1 px `rgba(27,25,23,.08)` bottom border: `ETKİLEŞİM` · `TETİK · DAVRANIŞ` · `HAREKET` · `HAPTİK`. Row cells: name 13/600 `ink` with a leading Material icon 18 `brand/primary`; behaviour 13/18 `ink`; spec mono 11.5 `ink/secondary`; haptic 13 `ink/secondary`.

Global footer (verbatim): `Eğri: standart cubic-bezier(.2,.8,.2,1), çıkış ease-out. “Hareketi azalt” açıkken tüm süreler 0, yalnızca opaklık geçişi 120 ms kalır. Hiçbir animasyon 600 ms'yi geçmez; kullanıcı beklerken animasyon değil bulgu gösterilir.`

Global rules for engineers:
- Standard easing `cubic-bezier(.2,.8,.2,1)` (Reanimated: `Easing.bezier(0.2, 0.8, 0.2, 1)`); exits `ease-out`.
- Hard cap **600 ms** per animation.
- `Reduce Motion` (`AccessibilityInfo.isReduceMotionEnabled` / `prefers-reduced-motion` on web): all durations → 0, replaced by a single 120 ms opacity transition; no shimmer, no counters, no springs.
- While the user waits, show **findings** (partial content, cached content, skeleton in real geometry), not animation.

### 8.5.1 Data array `MOTION` (verbatim transcription, 12 rows)

| # | icon | ETKİLEŞİM (`name`) | TETİK · DAVRANIŞ (`what`) | HAREKET (`spec`) | HAPTİK (`haptic`) |
|---|---|---|---|---|---|
| 1 | `wb_twilight` | `Brifing açılışı` | `Bugün açılır → hero solgundan belirir, sayı 0→N sayar, kartlar sırayla girer.` | `hero 240ms fade+8px · sayı 360ms · kartlar 60ms kademe, 280ms` | `yok` |
| 2 | `auto_awesome` | `AI işliyor` | `Taslak/özet üretilirken buton spinner; kart üstünde kayan parıltı. İlerleme çubuğu yok.` | `shimmer 1.6s linear ∞ · spinner .8s` | `yok` |
| 3 | `check_circle` | `Öncelik tamamlandı` | `Onay ikonuna dokunuş → ikon yeşile dolar, kart küçülerek solar, alttakiler yukarı kayar, toast.` | `ikon 160ms · kart 300ms scale .96 + fade · liste 300ms` | `success` |
| 4 | `swipe` | `Kaydırma aksiyonları` | `Sağ: Tamamlandı; sol: Ertele / Önemli değil. Eşik %35, tam kaydırma otomatik uygular.` | `takip 1:1 · bırakma 260ms spring` | `eşikte light` |
| 5 | `task_alt` | `Onay` | `Onayla → buton “Onaylandı” olur, rozet yeşile döner, kart geçmişe kayar.` | `buton 200ms · rozet 160ms · kart 320ms` | `success` |
| 6 | `graphic_eq` | `Sesli oynatma` | `Play → dalga çubukları canlanır, oynat ikonu pause olur, bölüm satırı vurgulanır.` | `çubuklar .7–1.2s alternate · ikon 120ms` | `light` |
| 7 | `hourglass_top` | `Yükleme` | `İskelet gerçek kart ölçülerinde; başlıklar anında, AI içeriği sonra dolar.` | `shimmer 1.6s · doluş 60ms kademe` | `yok` |
| 8 | `sync` | `Senkron` | `Aşağı çekme → ince indigo çizgi üstte, tamamlanınca “Güncel · 09:41” 1,5 sn.` | `çizgi 400ms · mesaj 1.5s` | `light` |
| 9 | `vibration` | `Haptik` | `success: tamamla/onayla/gönder · light: seçim, eşik · warning: çakışma, hata · asla dekor için.` | `iOS UIFeedbackGenerator · Android HapticFeedbackConstants` | `—` |
| 10 | `unfold_more` | `Kart genişleme` | `“Orijinal Mail” ve uzun özetler yerinde açılır; başlık sabit, içerik alttan uzar.` | `height 280ms · chevron 200ms rotate` | `yok` |
| 11 | `vertical_align_top` | `Alt sayfa` | `Alttan kayar, arka plan %35 ink; sürükleyerek kapanır, hız eşiği ile snap.` | `açılış 300ms · kapanış 240ms · dim 250ms` | `açılışta light` |
| 12 | `celebration` | `Başarı` | `Gönderildi/Planlandı → yeşil halka + ikon büyüyerek gelir, tek satır açıklama, geri dönüş butonu.` | `halka 500ms · ikon 450ms 100ms gecikme` | `success` |

### 8.5.2 Engineering translation per row

1. **Briefing open** (Bugün mount / tab focus with fresh data): hero `opacity 0→1` + `translateY 8→0` over 240 ms; headline number counts `0 → N` over 360 ms (integer tween, `Math.round`, starts when hero reaches ~50 % opacity); priority cards enter with 60 ms stagger, each 280 ms `fade + 8 px`. Total ≈ 520 ms + 60·(n−1) — see 8.7. No haptic. Run once per briefing id (do not replay on every tab switch — inferred).
2. **AI working** (draft / summary generation): the triggering button swaps its label for the 14 px spinner (0.8 s/rev, 2 px track) keeping its width; the target card shows a **moving shimmer band** over its surface (1.6 s linear loop, same gradient as skeleton but at ~40 % alpha over the existing content). Never a determinate progress bar. No haptic.
3. **Priority completed** (tap the check icon on `card/priority`): icon fills `success` over 160 ms; card `scale 1→.96` + `opacity 1→0` over 300 ms; items below translate up over 300 ms (layout animation); toast appears (`Tamamlandı` with `Geri Al`, inferred copy from canvas 03/04). Haptic **success**.
4. **Swipe actions**: see 8.6. Tracks 1:1 with the finger; release animates with a 260 ms spring (damping ~ 0.8, no bounce past rest); threshold 35 % of card width; a full swipe (≥ ~80 % or fast fling) applies automatically. Haptic **light** exactly once when crossing the threshold (and once when uncrossing back — inferred).
5. **Approve** (approval card / sheet): button morphs to the label `Onaylandı` over 200 ms (background → `success`, label white, no width jump: reserve the wider label width); status badge turns `success/soft`+`success/text` over 160 ms; then the card slides out to history over 320 ms. Haptic **success**.
6. **Audio play**: waveform bars animate heights on alternating 0.7–1.2 s loops (each bar its own duration in that range); play icon cross-fades to pause in 120 ms; the currently spoken section row gets the highlight surface (`brand/soft`). Haptic **light** on play/pause.
7. **Loading**: 8.2.6 — shimmer 1.6 s; fill with 60 ms stagger. No haptic.
8. **Sync** (pull-to-refresh): a thin **indigo line** (`brand/primary`, 2 px, full width, under the header) grows/animates for 400 ms minimum while syncing; on completion a 1.5 s pill/toast `Güncel · 09:41` (`Güncel · {HH:mm}`) then fades. Haptic **light** when the pull crosses the refresh threshold.
9. **Haptics** mapping. `success` → complete / approve / send. `light` → selection, swipe threshold, sheet open, sync threshold. `warning` → conflict detected, error surfaced. Never for decoration. Expo mapping (inferred): `Haptics.notificationAsync(Success)`, `Haptics.impactAsync(Light)`, `Haptics.notificationAsync(Warning)`; iOS `UINotificationFeedbackGenerator` / `UIImpactFeedbackGenerator(.light)`; Android `HapticFeedbackConstants.CONFIRM` / `CLOCK_TICK` (or `KEYBOARD_TAP`) / `REJECT`. Respect the OS "system haptics" setting.
10. **Card expand** (`Orijinal Mail` in mail cards, long summaries): height animates over 280 ms with the header pinned (content grows from below); chevron rotates 180° over 200 ms. No haptic. In RN use a measured content height with Reanimated `withTiming` (avoid `LayoutAnimation` on Android for nested lists — inferred).
11. **Bottom sheet**: slides up 300 ms; closes 240 ms; scrim (dim) `ink` at **35 %** opacity animating over 250 ms; drag-to-close with velocity threshold snapping (e.g. `@gorhom/bottom-sheet` with `enablePanDownToClose`, snap on velocity > ~800 px/s — inferred). Haptic **light** on open.
12. **Success screen** (`Gönderildi` / `Planlandı`): a green ring (`success`) scales in over 500 ms; the check icon scales in over 450 ms starting at 100 ms delay; below it one line of explanation and a single return button (`Brifinge Dön` / `Akışa Dön` per context — see canvases 04/05). Haptic **success**.

---

## 8.6 KAYDIRMA AKSİYONLARI (swipe actions)

Card (design canvas): background #FFF, radius 24, padding 20 24, column, gap 12. Kicker `KAYDIRMA AKSİYONLARI`.

Design note (verbatim): `Sağa: Tamamlandı (yeşil, tam kaydırmada otomatik). Sola: Ertele · Önemli değil (nötr). Eşik %35; eşikte hafif haptic. Kaydırma yönleri Akış, Bugün ve Takip'te aynıdır.`

Applies to every swipeable row/card: `card/priority` (Bugün), Akış mail cards, Takip items — **same directions everywhere**.

### 8.6.1 Right swipe → `Tamamlandı` (complete)

Frozen demo: container height 96, radius 20, `overflow:hidden`, background `success` #2FA062; the card is translated right by 96.
- Revealed action (left, width 96): column centred, white 11/600, icon `check_circle` 26 **filled**, label `Tamamlandı`.
- The card on top: background #FFF, radius 20, padding 14 16, shadow `-8px 0 24px rgba(27,25,23,.1)` (shadow on the leading edge as it lifts). Content is a Takip card: badge `TAKİP` (11/700, pill, `neutral/surface-2`+`ink/secondary`), meta `3 gün` 12 `ink/tertiary`, title `Gönderdiğin teklif mailine 3 gündür cevap gelmedi.` 16/22 600 −.01em.
- Behaviour: reveal width 96 tracks the finger 1:1; at 35 % of card width the action icon pops (scale 1→1.15→1, 160 ms) and haptic **light** fires; releasing past 35 % snaps open to 96 and waits for a tap on the action **or** — on a full swipe (≥ 80 % width or a fast fling) — applies automatically; applying runs row 3 of 8.5 (icon fills, card shrinks/fades, list closes up, toast with undo). Haptic **success** on apply.
- Single action on the right side — do not add more.

### 8.6.2 Left swipe → `Ertele` · `Önemli değil` (snooze / not important)

Frozen demo: container background `neutral/surface-2` #F0EFEB; the card is translated left by 168, revealing two 84-wide actions on the right.
- Action 1 (`flex:1`, transparent on the `neutral/surface-2` track): icon `schedule` 24 + label `Ertele` — `ink/secondary` 11/600.
- Action 2 (`flex:1`, background `neutral/hairline` #E9E7E1): icon `remove_circle` 24 + label `Önemli değil` — `ink/secondary` 11/600. The darker track on the outermost action marks it as the "full swipe" default.
- The card: background #FFF, radius 20, padding 14 16, shadow `8px 0 24px rgba(27,25,23,.1)`. Content is a life card (`card/life`): meta `Bugün` 12 `ink/tertiary`, badge `KİŞİSEL` (11/700, pill, `neutral/surface-2`+`ink/secondary`), title `Trendyol siparişin bugün geliyor.` 16/22 600 −.01em. (The demo right-aligns this content so it stays visible in the crop; real cards keep their normal left alignment.)
- Behaviour: reveal width 168 (2 × 84) tracks the finger; threshold 35 % with haptic light; release past threshold snaps open to 168; `Ertele` → opens the snooze picker sheet (`Bu akşam` / `Yarın sabah` / `Haftaya` … see canvas 04 for the exact list) and the card returns to rest; `Önemli değil` → removes the item from priorities (feeds the ranking model as negative signal), card fades out 300 ms, toast with undo; a **full** left swipe applies `Önemli değil` automatically (the outermost action) — inferred from the design's "tam kaydırmada otomatik" rule stated for the right side; confirm with design whether full-left should instead do nothing.
- Both actions are neutral (no red) — "not important" is not destructive; the item can be found again in Akış.

### 8.6.3 Implementation notes

- `react-native-gesture-handler` `Swipeable` / `ReanimatedSwipeable` with `friction 1` (1:1 tracking), `leftThreshold = rightThreshold = 0.35 × width`, `overshootLeft/Right = false`, custom `renderLeftActions` (96 wide, success) and `renderRightActions` (168 wide, two 84 columns).
- Only one row may be open at a time; opening another closes the previous (260 ms spring).
- On web (Next.js) swipes are replaced by a hover/overflow action menu with the same three actions and labels.
- Data needed per swipeable item: `id`, `kind` (`priority` | `mail` | `follow-up` | `life`), `canComplete`, `canSnooze`, `canDismiss`, plus the undo token returned by the mutation.

Dead in prototype: both demos are static; `Tamamlandı`, `Ertele`, `Önemli değil` do nothing.

---

## 8.7 BRİFİNG AÇILIŞI · KARE KARE (briefing open, frame by frame)

Card (design canvas): background #FFF, radius 24, padding 20 24, gap 12. Kicker `BRİFİNG AÇILIŞI · KARE KARE`. Three 120-tall frames (radius 14, background `neutral/bg`) show the Bugün hero at three instants after the tab mounts:

| Frame | Time label (verbatim) | What is drawn | Engineering state |
|---|---|---|---|
| 1 | `0 ms · hero solgun` | Hero card placeholder (44 tall, radius 12, `gradient/dawn`) at **opacity .4** and **translateY 8 px** | Hero mounted at `opacity 0.4` (design shows .4, treat 0 → 1 with the first frame ≈ .4), `y = +8`; no headline yet |
| 2 | `240 ms · sayı sayar` | Hero fully opaque and at rest; headline `Bugün bilmen gereken 3` with `3` in `brand/primary` — the counter mid-flight | Hero fade/rise finished (240 ms); counter running 0→N over 360 ms (at 240 ms it reads ~3 of 5); no cards yet |
| 3 | `520 ms · kartlar 60 ms arayla` | Headline `Bugün bilmen gereken 5` (final); first card bar (20 tall, radius 8, white, opacity .9), second bar opacity .5 and translateY 4 px | Counter done; cards entering with 60 ms stagger, each 280 ms fade + rise — card 1 nearly settled, card 2 just started |

Timeline summary: `t=0` hero starts (240 ms fade + 8 px rise) → `t≈120` counter starts (360 ms, ends ≈ 480) → `t≈240` first card starts, then every 60 ms the next (each 280 ms) → with 3 cards everything is at rest by ≈ 640 ms; no single animation exceeds 600 ms. Reduce Motion: hero and cards appear together with one 120 ms opacity fade, number shows final value immediately.

The headline number is tinted `brand/primary` in the hero on this canvas frame and in the large widget; the offline hero (8.2.5) shows it untinted. Rule (inferred): tint the number while it is live/fresh; untinted when the briefing is stale/offline.

---

## 8.8 Data model summary (fields these surfaces need)

```ts
interface TodaySnapshot {
  date: string;                 // local, for "5 EYLÜL CUMARTESİ"
  firstName: string;            // "Yunus"
  net: { isConnected: boolean };
  sync: { lastSuccessAt: string; lastAttemptAt?: string; retrying: boolean; staleMinutes: number };
  assistant: { status: 'ok' | 'unavailable' };
  connections: { gmail: 'ok' | 'expired' | 'disconnected'; calendar: 'ok' | 'expired' | 'disconnected' };
  permissions: { calendar: 'granted' | 'denied' | 'undetermined'; notifications: 'granted' | 'denied' | 'undetermined' };
  briefing?: {
    id: string; generatedAt: string; timeOfDay: 'sabah' | 'öğle' | 'akşam';
    itemCount: number; mailCount: number; eventCount: number; followUpCount: number;
    audio?: { durationMin: number; isDownloaded: boolean };
    readMailCount: number;       // "46 maili senin için okudum."
  };
  priorities: Array<{
    id: string; kind: 'mail' | 'calendar' | 'follow-up' | 'life';
    urgency: 'acil' | 'warning' | 'normal';   // badge + dot tone
    badge?: string;              // "ACİL", "TAKİP", "KİŞİSEL"
    person?: string;             // "Ahmet", "Mehmet"
    title: string; shortTitle?: string;       // widget-friendly variant
    receivedAt?: string; dueAt?: string; startsAt?: string;
    source?: 'Gmail' | 'Takvim' | 'Trendyol' | string;
    deferredNote?: string;       // "Yanıt taslağı bağlantı gelince hazırlanır."
    canComplete: boolean; canSnooze: boolean; canDismiss: boolean;
  }>;
  nextMeeting?: { id: string; startsAt: string; title: string; person?: string; prepReady: boolean; topicCount: number };
  followUp?: { id: string; person: string; subject: string; daysWaiting: number };
  nextEvent?: { startsAt: string; title: string };   // for empty/plan copy
  pendingApprovalCount: number;
  importantCount: number; firstDeadlineAt?: string;   // lock-screen inline
}
```

Widget snapshot = a projection of the above written to the app group / SharedPreferences after every sync, versioned (`schemaVersion`).

---

## 8.9 i18n key inventory (verbatim strings)

Empty states
- `empty.today.title` = `Her şey kontrol altında.`
- `empty.today.sub` = `Bugün dikkat gerektiren yeni bir konu yok. {readMailCount} maili senin için okudum.` (fixture `46`)
- `empty.today.cta` = `Akışa göz at`
- `empty.plan.title` = `Bugün takvimin oldukça sakin.`
- `empty.plan.sub` = `{nextEventRelativeDay} {nextEventTime} {nextEventTitle} ile başlıyorsun. Bugünü odak için kullanabilirsin.` (fixture `Yarın 09:00 Haftalık ekip ile başlıyorsun. Bugünü odak için kullanabilirsin.`)
- `empty.plan.cta` = `Odak bloğu öner`
- `empty.followUp.title` = `Bekleyen takip yok.`
- `empty.followUp.sub` = `Gönderdiğin her maile yanıt geldi. Yeni bir gecikme olursa buraya düşer.`
- `empty.followUp.cta` = `Tamam`
- `empty.approvals.title` = `Onay bekleyen işlem yok.`
- `empty.approvals.sub` = `Bir mail göndermek veya takvimi değiştirmek istediğimde önce burada görürsün.`
- `empty.approvals.cta` = `Geçmişi gör`

Errors
- `error.oauthExpired.title` = `Gmail bağlantısı yenilenmeli.`
- `error.oauthExpired.sub` = `Google oturumu süresi doldu. Yeniden bağlanana kadar yeni mailler analiz edilmez.`
- `error.oauthExpired.primary` = `Yeniden Bağlan` · `error.oauthExpired.secondary` = `Sonra`
- `error.permissionDenied.title` = `Takvim izni verilmedi.`
- `error.permissionDenied.sub` = `Toplantı hazırlığı ve çakışma uyarıları takvim erişimi gerektirir. Diğer her şey çalışıyor.`
- `error.permissionDenied.primary` = `İzin Ver` · `error.permissionDenied.secondary` = `Neden gerekli?`
- `error.syncDelayed.title` = `Senkronizasyon gecikti.`
- `error.syncDelayed.sub` = `Son başarılı analiz {lastSuccessAt}. Yeniden deniyoruz; gösterilenler {staleMinutes} dakika eski olabilir.` (fixture `09:40`, `12`)
- `error.syncDelayed.primary` = `Şimdi Dene` · `error.syncDelayed.secondary` = `Tamam`
- `error.aiUnavailable.title` = `Asistan şu an yanıt veremiyor.`
- `error.aiUnavailable.sub` = `Brifingin ve önceliklerin hazır; yalnızca yeni soru ve taslaklar birkaç dakika bekleyebilir.`
- `error.aiUnavailable.primary` = `Tekrar Dene` · `error.aiUnavailable.secondary` = `Brifinge Dön`

Offline / loading
- `offline.banner` = `Çevrimdışısın. Son analiz {lastSuccessAt}'tan gösteriliyor.` (fixture `09:40`; note Turkish suffix agreement: `'tan`/`'ten`/`'dan`/`'den` depends on the last vowel/consonant of the time — implement a suffix helper or phrase as `Son analiz: {lastSuccessAt}` if the helper is out of scope)
- `offline.refresh` = `Yenile`
- `today.dateKicker` = `{d MMMM dddd}` upper-case (fixture `5 EYLÜL CUMARTESİ`)
- `today.greeting.morning` = `Günaydın, {firstName}` (fixture `Günaydın, Yunus`)
- `briefing.kicker.offline` = `BRİFİNG · {generatedAt} · ÇEVRİMDIŞI`
- `briefing.headline` = `Bugün bilmen gereken {n} şey var.`
- `briefing.counts` = `{mailCount} önemli mail · {eventCount} etkinlik · {followUpCount} takip`
- `briefing.open` = `Brifingimi Gör`
- `briefing.audio.notDownloaded` = `İndirilmedi`
- `briefing.audio.listen` = `Dinle · {min} dk`
- `briefing.kicker.morning` = `SABAH BRİFİNGİ`
- `briefing.preparing` = `BRİFİNG HAZIRLANIYOR…`
- `today.prioritiesKicker` = `ÖNCELİKLERİN`
- `priority.badge.urgent` = `ACİL` · `priority.badge.followUp` = `TAKİP` · `priority.badge.personal` = `KİŞİSEL`
- `priority.deferredDraft` = `Yanıt taslağı bağlantı gelince hazırlanır.`
- `sync.updatedToast` = `Güncel · {HH:mm}` (fixture `Güncel · 09:41`)

Widgets
- `widget.medium.kicker` = `BUGÜN · {n} ÖNCELİK`
- `widget.large.nextMeeting` = `SONRAKİ TOPLANTI` · `widget.large.followUp` = `TAKİP` · `widget.large.followUpCta` = `Takip Et`
- `widget.prepReadyTopics` = `Hazırlık hazır · {n} konu` · `widget.prepReady` = `Hazırlık hazır` · `widget.topicsReady` = `{n} konu hazır`
- `widget.daysNoReply` = `{n} gündür yanıt yok`
- `widget.next` = `SONRAKİ · {HH:mm}`
- `widget.lock.inline` = `{n} önemli konu · ilki {HH:mm}` · `widget.lock.circularLabel` = `ÖNEMLİ`
- `widget.android.appName` = `Dijital Asistan` · `widget.android.overflow` = `+{n}`
- Fixture rows: `Ahmet 17:00'ye kadar revize teklif bekliyor.` · `Gmail · 08:42` · `Ahmet'e revize teklif` · `Mehmet ile müşteri toplantısı` · `Başvuru kapanıyor` · `Mehmet · Teklif v2` · `Mehmet ile toplantı` · `Ahmet · 17:00` · `Mehmet · 14:30` · `Cumartesi 5 Eylül`

Swipe
- `swipe.complete` = `Tamamlandı` · `swipe.snooze` = `Ertele` · `swipe.notImportant` = `Önemli değil`
- Fixture cards: `Gönderdiğin teklif mailine 3 gündür cevap gelmedi.` (`3 gün`) · `Trendyol siparişin bugün geliyor.` (`Bugün`)

Approval / success (from the motion table)
- `approval.approved` = `Onaylandı`
- `mail.original` = `Orijinal Mail`
- success titles `Gönderildi` / `Planlandı`

---

## 8.10 Dead in prototype (complete list)

Everything on this canvas is static. The elements below are drawn as controls and must be wired:

Empty states: `Akışa göz at`, `Odak bloğu öner`, `Tamam`, `Geçmişi gör`.

Error cards: `Yeniden Bağlan`, `Sonra`, `İzin Ver`, `Neden gerekli?`, `Şimdi Dene`, `Tamam`, `Tekrar Dene`, `Brifinge Dön`.

Offline screen: `Yenile` (banner), `Brifingimi Gör`, `İndirilmedi` (drawn disabled; must enable when audio is cached), the `ACİL` priority card tap.

Loading screen: none (skeleton must be non-interactive; the header is real).

iOS widgets: small widget tap; medium header + 3 rows; large briefing block, `Dinle · 2 dk`, next-meeting row, follow-up row, `Takip Et`; lock-screen inline / circular / rectangular taps.

Android widgets: 4×2 header, play button, chips `Ahmet · 17:00`, `Mehmet · 14:30`, `+3`; 2×2 tap.

Swipe demos: both cards are frozen mid-gesture; `Tamamlandı`, `Ertele`, `Önemli değil` do nothing; no gesture handling exists.

Motion table / briefing frames: documentation only, no behaviour to wire — but every row is a requirement for the app.

---

## 8.11 Token additions proposed by this canvas

| Proposed token | Value | Used by |
|---|---|---|
| `skeleton/base` | #EFEDE7 | shimmer bars, `s4` button placeholder |
| `skeleton/highlight` | #F7F6F2 | shimmer band |
| `spinner/track` | #D9D6F7 | 14 px spinner ring (head = `brand/primary`) |
| `gradient/dawn` (confirm) | `radial-gradient(140% 100% at 100% 0%, #E4E4FA 0%, #FFFFFF 60%)` | briefing hero wash (large widget, briefing frames) |
| `gradient/night` (confirm) | `linear-gradient(180deg, #1E1E4C 0%, #3B3CA8 70%, #7071EA 100%)` | lock-screen mock only |
| `type/empty-title` | 19/24 600 −0.01em | empty-state headline |
| `type/hero-headline` | 26/32 600 −0.02em | briefing hero headline (offline + online) |
| `overlay/scrim` | `ink` @ 35 % | bottom-sheet dim |
| `shadow/card` | `0 1px 2px rgba(27,25,23,.04), 0 6px 20px rgba(27,25,23,.05)` | error cards, hero |
| `shadow/card-flat` | `0 1px 2px rgba(27,25,23,.04)` | priority cards |
| `shadow/swipe-edge` | `±8px 0 24px rgba(27,25,23,.1)` | lifted card during swipe |
