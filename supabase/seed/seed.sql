-- Dijital Asistan · demo seed (local development & tests only — never run against production)
-- Deterministic ids; timestamps are relative to "today" in Europe/Istanbul so the demo always looks current.
-- Mirrors packages/server-core/src/providers/demo (Claude Design example content: Ahmet Yılmaz, Mehmet Yılmaz, Selin Kaya…).

create or replace function pg_temp.lt(day_offset int, hhmm text)
returns timestamptz language sql stable as $$
  select (((now() at time zone 'Europe/Istanbul')::date + day_offset)::text || ' ' || hhmm)::timestamp at time zone 'Europe/Istanbul'
$$;

-- ---------------------------------------------------------------------------
-- users
-- ---------------------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data)
values
  ('00000000-0000-4000-8000-000000000001', 'yunus@example.com', '{"full_name":"Yunus Emre"}'),
  ('00000000-0000-4000-8000-000000000002', 'baska@example.com', '{"full_name":"Başka Kullanıcı"}')
on conflict (id) do nothing;

-- profiles/preferences are created by trigger; enrich the demo user
update public.profiles set
  display_name = 'Yunus Emre', first_name = 'Yunus', timezone = 'Europe/Istanbul', locale = 'tr',
  onboarding_completed_at = now() - interval '3 days', first_analysis_completed_at = now() - interval '3 days',
  referral_code = 'YUNUS7K2', plan = 'pro'
where id = '00000000-0000-4000-8000-000000000001';

update public.user_preferences set interests = array['work', 'finance', 'travel', 'deadlines']
where user_id = '00000000-0000-4000-8000-000000000001';

-- demo Pro entitlement (source = demo)
insert into public.subscriptions (id, user_id, source, status, plan, product_id, entitlement_id, starts_at, expires_at, is_trial, will_renew, store)
values ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000001', 'demo', 'active', 'pro', 'da_pro_annual', 'pro', now() - interval '10 days', now() + interval '355 days', false, true, 'demo')
on conflict (user_id, source) do nothing;

-- ---------------------------------------------------------------------------
-- connected accounts
-- ---------------------------------------------------------------------------
insert into public.connected_accounts (id, user_id, provider, kinds, external_account_id, display_name, email, status, granted_scopes, last_sync_at, backfill_completed, is_primary)
values
  ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-000000000001', 'google', array['email','calendar','tasks']::public.account_kind_t[], 'yunus@example.com', 'Gmail · yunus@example.com', 'yunus@example.com', 'active',
   array['openid','email','profile','https://www.googleapis.com/auth/gmail.readonly','https://www.googleapis.com/auth/calendar.readonly'], now() - interval '12 minutes', true, true),
  ('00000000-0000-4000-8000-0000000000c2', '00000000-0000-4000-8000-000000000001', 'device', array['calendar']::public.account_kind_t[], 'device', 'Apple Takvim', null, 'active', '{}', now() - interval '12 minutes', true, false),
  ('00000000-0000-4000-8000-0000000000c9', '00000000-0000-4000-8000-000000000002', 'google', array['email']::public.account_kind_t[], 'baska@example.com', 'Gmail · baska@example.com', 'baska@example.com', 'active', '{}', now(), true, true)
on conflict do nothing;

insert into public.oauth_credentials (account_id, user_id, provider, access_token_enc, refresh_token_enc, access_token_expires_at, scope)
values
  ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-000000000001', 'google', 'v1:demo:encrypted-access', 'v1:demo:encrypted-refresh', now() + interval '50 minutes', array['gmail.readonly']),
  ('00000000-0000-4000-8000-0000000000c9', '00000000-0000-4000-8000-000000000002', 'google', 'v1:demo:encrypted-access-2', 'v1:demo:encrypted-refresh-2', now() + interval '50 minutes', array['gmail.readonly'])
on conflict do nothing;

insert into public.sync_states (user_id, account_id, resource, cursor, mode, last_run_at, last_success_at)
values
  ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000c1', 'mail', '1234567', 'polling', now() - interval '12 minutes', now() - interval '12 minutes'),
  ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000c1', 'calendar', 'sync-token-1', 'polling', now() - interval '12 minutes', now() - interval '12 minutes')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- people
-- ---------------------------------------------------------------------------
insert into public.contacts (id, user_id, display_name, emails, company, title, last_contact_at, interaction_count, is_vip, source)
values
  ('00000000-0000-4000-8000-000000002201', '00000000-0000-4000-8000-000000000001', 'Ahmet Yılmaz', array['ahmet@firma.com'], 'Firma A.Ş.', 'Satın Alma Müdürü', pg_temp.lt(0, '08:42'), 18, false, 'communication'),
  ('00000000-0000-4000-8000-000000002202', '00000000-0000-4000-8000-000000000001', 'Mehmet Yılmaz', array['mehmet@musteri.com'], 'Müşteri Ltd.', 'Genel Müdür', pg_temp.lt(-4, '15:31'), 42, true, 'communication'),
  ('00000000-0000-4000-8000-000000002203', '00000000-0000-4000-8000-000000000001', 'Selin Kaya', array['selin@hukuk.com'], 'Kaya Hukuk', 'Avukat', pg_temp.lt(-1, '15:40'), 9, false, 'communication'),
  ('00000000-0000-4000-8000-000000002204', '00000000-0000-4000-8000-000000000001', 'Girişim Programı', array['basvuru@girisimprogrami.org'], 'Girişim Programı', null, pg_temp.lt(-1, '16:10'), 3, false, 'communication'),
  ('00000000-0000-4000-8000-000000002209', '00000000-0000-4000-8000-000000000002', 'Ayşe Demir', array['ayse@ornek.com'], null, null, now(), 1, false, 'communication')
on conflict do nothing;

insert into public.vip_people (id, user_id, contact_id, display_name, email, relation, notify_always)
values ('00000000-0000-4000-8000-000000002301', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000002202', 'Mehmet Yılmaz', 'mehmet@musteri.com', 'Müşteri', true)
on conflict do nothing;

insert into public.priority_rules (id, user_id, type, value, label, enabled, position)
values
  ('00000000-0000-4000-8000-000000002401', '00000000-0000-4000-8000-000000000001', 'promotions_low', '*', 'Promosyonlar düşük öncelik', true, 0),
  ('00000000-0000-4000-8000-000000002402', '00000000-0000-4000-8000-000000000001', 'domain_important', 'musteri.com', 'musteri.com her zaman önemli', true, 1)
on conflict do nothing;

insert into public.learned_preferences (id, user_id, kind, statement, subject_key, weight, evidence_count, enabled)
values
  ('00000000-0000-4000-8000-000000002501', '00000000-0000-4000-8000-000000000001', 'person_priority', 'Mehmet Yılmaz yüksek öncelikli.', 'contact:00000000-0000-4000-8000-000000002202', 0.8, 6, true),
  ('00000000-0000-4000-8000-000000002502', '00000000-0000-4000-8000-000000000001', 'category_priority', 'Promosyon maillerini genelde açmıyorsun.', 'category:promotion', -0.7, 14, true),
  ('00000000-0000-4000-8000-000000002503', '00000000-0000-4000-8000-000000000001', 'reminder_lead_time', 'Toplantıları 30 dakika önce hatırlatmayı tercih ediyorsun.', 'reminder_lead', 0.6, 4, true)
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- email threads & messages
-- ---------------------------------------------------------------------------
insert into public.email_threads (id, user_id, account_id, external_thread_id, subject, snippet, participants, last_message_at, message_count, last_from_user, is_read, labels, importance, category, analysis, priority_score, priority_reasons, triage, fingerprint, analyzed_at)
values
  ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000c1', 't-ahmet-revize', 'Revize teklif',
   'Merhaba Yunus, revize fiyat teklifini bugün 17:00''ye kadar PDF olarak iletebilir misin?',
   '[{"name":"Ahmet Yılmaz","email":"ahmet@firma.com"},{"name":"Yunus Emre","email":"yunus@example.com"}]', pg_temp.lt(0, '08:42'), 1, false, false, array['INBOX','IMPORTANT'], 'critical', 'action_required',
   jsonb_build_object('summary', 'Ahmet senden bugün 17:00''ye kadar revize teklif bekliyor.', 'importance', 'critical', 'category', 'action_required', 'reasonImportant', 'Bu mailde bugün saat 17:00''ye kadar cevap istendiği için önemli olarak işaretlendi.', 'requiresUserAction', true, 'deadline', pg_temp.lt(0, '17:00'), 'deadlineText', 'bugün 17:00', 'keyPoints', jsonb_build_array('Revize fiyat', 'Bugün 17:00', 'PDF formatı'), 'people', jsonb_build_array(jsonb_build_object('name', 'Ahmet Yılmaz', 'email', 'ahmet@firma.com', 'role', 'sender')), 'commitments', '[]'::jsonb, 'suggestedActions', jsonb_build_array(jsonb_build_object('kind', 'reply', 'label', 'Yanıtla'), jsonb_build_object('kind', 'remind', 'label', 'Hatırlat')), 'confidence', 0.94, 'producedBy', 'ai_large'),
   920, array['Bugün 17:00''ye kadar cevap istendi', 'Senden cevap bekliyor'], 'ai', 'fp-e1', now() - interval '1 hour'),
  ('00000000-0000-4000-8000-0000000000e2', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000c1', 't-selin-sozlesme', 'Sözleşme taslağı · 4. madde',
   'Sözleşme taslağının 4. maddesi için yorumunu bekliyorum; yarın öğlen hukuka gidecek.',
   '[{"name":"Selin Kaya","email":"selin@hukuk.com"},{"name":"Yunus Emre","email":"yunus@example.com"}]', pg_temp.lt(-1, '15:40'), 2, false, true, array['INBOX'], 'high', 'waiting_for_user',
   jsonb_build_object('summary', 'Selin sözleşme taslağının 4. maddesi için yorumunu bekliyor; yarın öğlen hukuka gidecek.', 'importance', 'high', 'category', 'waiting_for_user', 'requiresUserAction', true, 'deadline', pg_temp.lt(1, '12:00'), 'deadlineText', 'yarın öğlen', 'keyPoints', jsonb_build_array('4. madde yorumu', 'Yarın öğlen hukuk'), 'people', jsonb_build_array(jsonb_build_object('name', 'Selin Kaya', 'email', 'selin@hukuk.com')), 'commitments', '[]'::jsonb, 'suggestedActions', jsonb_build_array(jsonb_build_object('kind', 'reply', 'label', 'Yanıt Hazırla')), 'confidence', 0.88, 'producedBy', 'ai_large'),
   780, array['Senden cevap bekliyor', 'Yarın öğlen son'], 'ai', 'fp-e2', now() - interval '20 hours'),
  ('00000000-0000-4000-8000-0000000000e3', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000c1', 't-girisim-basvuru', 'Girişim Programı başvurusu son gün',
   'Başvurular bugün saat 17:00''de kapanıyor. Eksik belgeleri portal üzerinden yükleyebilirsiniz.',
   '[{"name":"Girişim Programı","email":"basvuru@girisimprogrami.org"}]', pg_temp.lt(-1, '16:10'), 1, false, true, array['INBOX'], 'high', 'deadline',
   jsonb_build_object('summary', 'Başvuru bugün 17:00''de kapanıyor.', 'importance', 'high', 'category', 'deadline', 'requiresUserAction', true, 'deadline', pg_temp.lt(0, '17:00'), 'deadlineText', 'bugün 17:00', 'keyPoints', jsonb_build_array('Son başvuru bugün 17:00', 'Eksik belgeler portalda'), 'people', '[]'::jsonb, 'commitments', '[]'::jsonb, 'suggestedActions', jsonb_build_array(jsonb_build_object('kind', 'add_to_calendar', 'label', 'Takvime Ekle')), 'confidence', 0.9, 'producedBy', 'ai_small'),
   700, array['Son tarih bugün 17:00'], 'rules', 'fp-e3', now() - interval '20 hours'),
  ('00000000-0000-4000-8000-0000000000e4', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000c1', 't-mehmet-teklif-v2', 'Teklif v2',
   'Merhaba Mehmet Bey, güncellenmiş teklifimizi (v2) ekte iletiyorum. Geri bildiriminizi bekliyorum.',
   '[{"name":"Yunus Emre","email":"yunus@example.com"},{"name":"Mehmet Yılmaz","email":"mehmet@musteri.com"}]', pg_temp.lt(-3, '10:15'), 1, true, true, array['SENT'], 'normal', 'waiting_for_other',
   jsonb_build_object('summary', 'Mehmet''e Teklif v2 gönderildi; geri bildirim bekleniyor.', 'importance', 'normal', 'category', 'waiting_for_other', 'requiresUserAction', false, 'deadline', null, 'keyPoints', jsonb_build_array('Teklif v2 PDF gönderildi'), 'people', jsonb_build_array(jsonb_build_object('name', 'Mehmet Yılmaz', 'email', 'mehmet@musteri.com')), 'commitments', '[]'::jsonb, 'followUp', jsonb_build_object('expected', true, 'nudgeAfterDays', 3), 'suggestedActions', jsonb_build_array(jsonb_build_object('kind', 'follow_up', 'label', 'Takip Mesajı Hazırla')), 'confidence', 0.86, 'producedBy', 'ai_small'),
   520, array['3 gündür yanıt yok', 'VIP: Mehmet Yılmaz'], 'rules', 'fp-e4', now() - interval '3 days'),
  ('00000000-0000-4000-8000-0000000000e5', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000c1', 't-trendyol-kargo', 'Siparişin yola çıktı!',
   'Siparişin Yurtiçi Kargo ile yola çıktı. Tahmini teslimat bugün 14:00–18:00. Takip no: 1234567890123',
   '[{"name":"Trendyol","email":"info@trendyol.com"}]', pg_temp.lt(-1, '19:02'), 1, false, true, array['INBOX','CATEGORY_UPDATES'], 'normal', 'shipment',
   jsonb_build_object('summary', 'Trendyol siparişin bugün 14:00–18:00 arasında teslim edilecek.', 'importance', 'normal', 'category', 'shipment', 'requiresUserAction', false, 'keyPoints', jsonb_build_array('Yurtiçi Kargo', 'Bugün 14:00–18:00'), 'people', '[]'::jsonb, 'commitments', '[]'::jsonb, 'suggestedActions', jsonb_build_array(jsonb_build_object('kind', 'track', 'label', 'Takip Et')), 'confidence', 0.93, 'producedBy', 'heuristic'),
   300, array['Kargo bugün'], 'rules', 'fp-e5', now() - interval '18 hours'),
  ('00000000-0000-4000-8000-0000000000e6', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000c1', 't-thy-bilet', 'E-biletiniz: TK2412 İstanbul – Antalya',
   'Sayın Yunus Emre, TK2412 seferi yarın 09:15 İstanbul (IST) – 10:30 Antalya (AYT). PNR: ABC123. Online check-in açıldı.',
   '[{"name":"Türk Hava Yolları","email":"noreply@thy.com"}]', pg_temp.lt(-8, '11:20'), 1, false, true, array['INBOX'], 'normal', 'travel',
   jsonb_build_object('summary', 'TK2412 · İstanbul → Antalya, yarın 09:15. Check-in açık.', 'importance', 'normal', 'category', 'travel', 'requiresUserAction', false, 'keyPoints', jsonb_build_array('Yarın 09:15 IST → AYT', 'PNR ABC123'), 'people', '[]'::jsonb, 'commitments', '[]'::jsonb, 'suggestedActions', jsonb_build_array(jsonb_build_object('kind', 'check_in', 'label', 'Check-in')), 'confidence', 0.95, 'producedBy', 'heuristic'),
   350, array['Yarın uçuş'], 'rules', 'fp-e6', now() - interval '8 days'),
  ('00000000-0000-4000-8000-0000000000e7', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000c1', 't-ck-fatura', 'Elektrik faturanız hazır',
   'Eylül dönemi elektrik faturanız 1.842,00 TL. Son ödeme tarihi 10 Eylül.',
   '[{"name":"CK Enerji","email":"fatura@ckenerji.com.tr"}]', pg_temp.lt(-2, '09:05'), 1, false, true, array['INBOX'], 'normal', 'payment',
   jsonb_build_object('summary', 'Elektrik faturası 1.842 TL, son ödeme 10 Eylül.', 'importance', 'normal', 'category', 'payment', 'requiresUserAction', true, 'deadline', pg_temp.lt(5, '23:59'), 'deadlineText', '10 Eylül', 'keyPoints', jsonb_build_array('1.842 TL', 'Son ödeme 10 Eylül'), 'people', '[]'::jsonb, 'commitments', '[]'::jsonb, 'suggestedActions', jsonb_build_array(jsonb_build_object('kind', 'open_link', 'label', 'Faturayı Aç'), jsonb_build_object('kind', 'remind', 'label', 'Hatırlat')), 'confidence', 0.9, 'producedBy', 'heuristic'),
   400, array['Ödeme son tarihi'], 'rules', 'fp-e7', now() - interval '2 days'),
  ('00000000-0000-4000-8000-0000000000e8', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000c1', 't-netflix', 'Üyeliğiniz yenileniyor',
   'Netflix üyeliğiniz 9 Eylül''de yenilenecek. Aylık ücret 229,99 TL.',
   '[{"name":"Netflix","email":"info@mailer.netflix.com"}]', pg_temp.lt(-3, '07:30'), 1, false, true, array['INBOX','CATEGORY_UPDATES'], 'low', 'subscription',
   jsonb_build_object('summary', 'Netflix 9 Eylül''de yenileniyor.', 'importance', 'low', 'category', 'subscription', 'requiresUserAction', false, 'keyPoints', jsonb_build_array('9 Eylül yenileme', '229,99 TL'), 'people', '[]'::jsonb, 'commitments', '[]'::jsonb, 'suggestedActions', '[]'::jsonb, 'confidence', 0.9, 'producedBy', 'heuristic'),
   150, array['Abonelik yenileme'], 'rules', 'fp-e8', now() - interval '3 days'),
  ('00000000-0000-4000-8000-0000000000e9', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000c1', 't-google-security', 'Yeni cihazdan giriş yapıldı',
   'Google hesabınıza yeni bir cihazdan (Windows, Ankara) giriş yapıldı. Siz değilseniz hesabınızı güvenceye alın.',
   '[{"name":"Google","email":"no-reply@accounts.google.com"}]', pg_temp.lt(0, '06:12'), 1, false, false, array['INBOX'], 'high', 'security',
   jsonb_build_object('summary', 'Google hesabında yeni giriş: Windows, Ankara.', 'importance', 'high', 'category', 'security', 'requiresUserAction', true, 'keyPoints', jsonb_build_array('Yeni cihaz: Windows', 'Konum: Ankara'), 'people', '[]'::jsonb, 'commitments', '[]'::jsonb, 'suggestedActions', jsonb_build_array(jsonb_build_object('kind', 'open_original', 'label', 'Kaynağı Aç')), 'confidence', 0.97, 'producedBy', 'heuristic'),
   850, array['Güvenlik uyarısı'], 'rules', 'fp-e9', now() - interval '2 hours'),
  ('00000000-0000-4000-8000-0000000000ea', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000c1', 't-promo-1', '%40 indirim sadece bugün!',
   'Sonbahar koleksiyonunda %40 indirim. Kaçırma!', '[{"name":"Moda Mağazası","email":"kampanya@moda.com"}]', pg_temp.lt(0, '07:00'), 1, false, false, array['INBOX','CATEGORY_PROMOTIONS'], 'low', 'promotion', null, 10, array['Promosyon'], 'skip', 'fp-ea', null),
  ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-0000000000c9', 't-other-user', 'Başka kullanıcının maili',
   'Bu satır yalnızca RLS testleri içindir.', '[{"name":"Ayşe Demir","email":"ayse@ornek.com"}]', now() - interval '1 hour', 1, false, false, array['INBOX'], 'high', 'action_required', null, 600, '{}', 'ai', 'fp-f1', null)
on conflict do nothing;

insert into public.email_messages (id, user_id, account_id, thread_id, external_message_id, from_participant, to_participants, subject, snippet, body_text, sent_at, is_from_user, has_attachments, attachments, labels, web_url, fingerprint)
values
  ('00000000-0000-4000-8000-000000002101', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000e1', 'm-ahmet-1',
   '{"name":"Ahmet Yılmaz","email":"ahmet@firma.com"}', '[{"name":"Yunus Emre","email":"yunus@example.com"}]', 'Revize teklif',
   'Merhaba Yunus, revize fiyat teklifini bugün 17:00''ye kadar PDF olarak iletebilir misin?',
   E'Merhaba Yunus,\n\nDünkü görüşmemize istinaden revize fiyat teklifini bugün saat 17:00''ye kadar PDF formatında iletebilir misin? Yönetim toplantısında sunacağım.\n\nTeşekkürler,\nAhmet Yılmaz\nSatın Alma Müdürü · Firma A.Ş.',
   pg_temp.lt(0, '08:42'), false, false, '[]', array['INBOX','IMPORTANT'], 'https://mail.google.com/mail/u/0/#inbox/m-ahmet-1', 'fp-m1'),
  ('00000000-0000-4000-8000-000000002102', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000e2', 'm-selin-1',
   '{"name":"Selin Kaya","email":"selin@hukuk.com"}', '[{"name":"Yunus Emre","email":"yunus@example.com"}]', 'Sözleşme taslağı · 4. madde',
   'Sözleşme taslağının 4. maddesi için yorumunu bekliyorum; yarın öğlen hukuka gidecek.',
   E'Yunus merhaba,\n\nSözleşme taslağının 4. maddesi (fesih koşulları) için yorumunu bekliyorum. Taslak yarın öğlen hukuk departmanına gidecek.\n\nSelin',
   pg_temp.lt(-1, '15:40'), false, true, '[{"id":"att-1","filename":"Sozlesme_Taslak_v3.pdf","mimeType":"application/pdf","size":184320}]', array['INBOX'], 'https://mail.google.com/mail/u/0/#inbox/m-selin-1', 'fp-m2'),
  ('00000000-0000-4000-8000-000000002103', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000e3', 'm-girisim-1',
   '{"name":"Girişim Programı","email":"basvuru@girisimprogrami.org"}', '[{"name":"Yunus Emre","email":"yunus@example.com"}]', 'Girişim Programı başvurusu son gün',
   'Başvurular bugün saat 17:00''de kapanıyor.', E'Sayın Yunus Emre,\n\nGirişim Programı 2026 başvuruları bugün saat 17:00''de kapanacaktır. Eksik belgelerinizi portal üzerinden yükleyebilirsiniz.\n\nGirişim Programı Ekibi',
   pg_temp.lt(-1, '16:10'), false, false, '[]', array['INBOX'], 'https://mail.google.com/mail/u/0/#inbox/m-girisim-1', 'fp-m3'),
  ('00000000-0000-4000-8000-000000002104', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000e4', 'm-mehmet-sent-1',
   '{"name":"Yunus Emre","email":"yunus@example.com"}', '[{"name":"Mehmet Yılmaz","email":"mehmet@musteri.com"}]', 'Teklif v2',
   'Güncellenmiş teklifimizi (v2) ekte iletiyorum.', E'Merhaba Mehmet Bey,\n\nGüncellenmiş teklifimizi (v2) ekte iletiyorum. Geri bildiriminizi bekliyorum.\n\nSaygılarımla,\nYunus',
   pg_temp.lt(-3, '10:15'), true, true, '[{"id":"att-2","filename":"Teklif_v2.pdf","mimeType":"application/pdf","size":402100}]', array['SENT'], 'https://mail.google.com/mail/u/0/#sent/m-mehmet-sent-1', 'fp-m4'),
  ('00000000-0000-4000-8000-000000002109', '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-0000000000c9', '00000000-0000-4000-8000-0000000000f1', 'm-other-1',
   '{"name":"Ayşe Demir","email":"ayse@ornek.com"}', '[]', 'Başka kullanıcının maili', 'RLS', 'RLS test satırı', now() - interval '1 hour', false, false, '[]', '{}', null, 'fp-m9')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- calendar
-- ---------------------------------------------------------------------------
insert into public.calendar_events (id, user_id, account_id, external_event_id, title, description, location, meeting_url, meeting_provider, start_at, end_at, attendees, organizer_is_user, status, provider_updated_at, source)
values
  ('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000c1', 'ev-mehmet-musteri', 'Mehmet ile müşteri toplantısı', 'Teklif v2 ve teslim takvimi', 'Ofis', 'https://meet.google.com/abc-defg-hij', 'google_meet',
   pg_temp.lt(0, '14:30'), pg_temp.lt(0, '15:30'), '[{"name":"Mehmet Yılmaz","email":"mehmet@musteri.com","isOrganizer":false,"responseStatus":"accepted"},{"name":"Yunus Emre","email":"yunus@example.com","isOrganizer":true,"responseStatus":"accepted"}]', true, 'confirmed', now() - interval '2 days', 'google_calendar'),
  ('00000000-0000-4000-8000-0000000000d2', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000c1', 'ev-urun-gozden', 'Ürün gözden geçirme', null, null, 'https://teams.microsoft.com/l/meetup-join/xyz', 'teams',
   pg_temp.lt(0, '16:00'), pg_temp.lt(0, '16:30'), '[{"name":"Ekip","email":"ekip@example.com","isOrganizer":true}]', false, 'confirmed', now() - interval '1 day', 'google_calendar'),
  ('00000000-0000-4000-8000-0000000000d3', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000c2', 'ev-aksam-yemegi', 'Akşam yemeği · Karaköy', '4 kişi', 'Karaköy, İstanbul', null, null,
   pg_temp.lt(0, '20:30'), pg_temp.lt(0, '22:30'), '[]', true, 'confirmed', now() - interval '5 days', 'apple_calendar'),
  ('00000000-0000-4000-8000-0000000000d4', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000c1', 'ev-haftalik-ekip', 'Haftalık ekip', null, 'Ofis', null, null,
   pg_temp.lt(1, '09:00'), pg_temp.lt(1, '10:00'), '[]', true, 'confirmed', now() - interval '7 days', 'google_calendar'),
  ('00000000-0000-4000-8000-0000000000d5', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000c1', 'ev-doktor', 'Doktor randevusu', null, 'Nişantaşı', null, null,
   pg_temp.lt(2, '14:30'), pg_temp.lt(2, '15:15'), '[]', true, 'confirmed', now() - interval '3 days', 'google_calendar'),
  ('00000000-0000-4000-8000-0000000000d6', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000c1', 'ev-musteri-2', 'Müşteri toplantısı · Demir A.Ş.', null, 'Online', 'https://meet.google.com/klm-nopq-rst', 'google_meet',
   pg_temp.lt(2, '14:00'), pg_temp.lt(2, '15:00'), '[]', false, 'confirmed', now() - interval '3 days', 'google_calendar')
on conflict do nothing;

insert into public.calendar_conflicts (id, user_id, event_a_id, event_b_id, overlap_minutes, suggestions, status)
values ('00000000-0000-4000-8000-000000003201', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000d6', '00000000-0000-4000-8000-0000000000d5', 30,
  jsonb_build_array(jsonb_build_object('id', 'sg-1', 'kind', 'move_event', 'title', 'Müşteri toplantısını 13:00''e almayı önerebilirim.', 'detail', '13:00–14:00 boş.', 'proposedStartAt', pg_temp.lt(2, '13:00'), 'proposedEndAt', pg_temp.lt(2, '14:00'), 'targetEventId', '00000000-0000-4000-8000-0000000000d6', 'reason', 'Doktor randevusu ile çakışıyor')), 'open')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- tasks, commitments, follow-ups, reminders
-- ---------------------------------------------------------------------------
insert into public.tasks (id, user_id, title, notes, due_at, status, source, provider, priority)
values ('00000000-0000-4000-8000-000000002601', '00000000-0000-4000-8000-000000000001', 'Teklif hazırlama', 'Mehmet için v3 teklif', pg_temp.lt(1, '18:00'), 'open', jsonb_build_object('type', 'user', 'id', 'manual', 'label', 'Sen', 'timestamp', now()), 'internal', 'high')
on conflict do nothing;

insert into public.commitments (id, user_id, text, quote, direction, counterpart_name, counterpart_contact_id, due_at, due_text, status, source, confidence, related_event_id, dedupe_key)
values
  ('00000000-0000-4000-8000-000000002701', '00000000-0000-4000-8000-000000000001', 'Mehmet''e teklif gönder', 'yarın göndereceğim', 'user_owes', 'Mehmet Yılmaz', '00000000-0000-4000-8000-000000002202', pg_temp.lt(1, '18:00'), 'yarın', 'open',
   jsonb_build_object('type', 'meeting_note', 'id', '00000000-0000-4000-8000-000000003901', 'label', 'Toplantı notu', 'person', 'Mehmet Yılmaz', 'timestamp', pg_temp.lt(-4, '15:31')), 0.9, '00000000-0000-4000-8000-0000000000d1', 'commit:meeting_note:n1:1'),
  ('00000000-0000-4000-8000-000000002702', '00000000-0000-4000-8000-000000000001', 'Selin''e sözleşme yorumu', null, 'user_owes', 'Selin Kaya', '00000000-0000-4000-8000-000000002203', pg_temp.lt(1, '12:00'), 'yarın 12:00', 'open',
   jsonb_build_object('type', 'gmail', 'id', '00000000-0000-4000-8000-0000000000e2', 'label', 'Gmail', 'person', 'Selin Kaya', 'timestamp', pg_temp.lt(-1, '15:40')), 0.85, null, 'commit:gmail:e2:1'),
  ('00000000-0000-4000-8000-000000002703', '00000000-0000-4000-8000-000000000001', 'Mehmet Teklif v2 geri bildirimi gönderecek', 'hafta içinde dönüş yapacağım', 'other_owes', 'Mehmet Yılmaz', '00000000-0000-4000-8000-000000002202', pg_temp.lt(0, '18:00'), 'bu hafta', 'open',
   jsonb_build_object('type', 'gmail', 'id', '00000000-0000-4000-8000-0000000000e4', 'label', 'Gmail', 'person', 'Mehmet Yılmaz', 'timestamp', pg_temp.lt(-3, '10:15')), 0.7, null, 'commit:gmail:e4:1')
on conflict do nothing;

insert into public.follow_ups (id, user_id, thread_id, contact_id, counterpart_name, topic, sent_at, nudge_after_days, status, source)
values ('00000000-0000-4000-8000-000000002801', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000e4', '00000000-0000-4000-8000-000000002202', 'Mehmet Yılmaz', 'Teklif v2', pg_temp.lt(-3, '10:15'), 3, 'nudge_due',
  jsonb_build_object('type', 'gmail', 'id', '00000000-0000-4000-8000-0000000000e4', 'label', 'Gmail', 'person', 'Mehmet Yılmaz', 'timestamp', pg_temp.lt(-3, '10:15')))
on conflict do nothing;

insert into public.reminders (id, user_id, title, body, remind_at, option, status, target_type, target_id, smart_reason)
values ('00000000-0000-4000-8000-000000002901', '00000000-0000-4000-8000-000000000001', 'Ahmet''e revize teklif', 'Bugün 17:00''ye kadar', pg_temp.lt(0, '12:10'), 'smart', 'scheduled', 'email_thread', '00000000-0000-4000-8000-0000000000e1', 'Takviminde 12:10 boş; toplantından önce.')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- life events
-- ---------------------------------------------------------------------------
insert into public.life_events (id, user_id, type, title, details, event_at, status, source, confidence, dedupe_key)
values
  ('00000000-0000-4000-8000-000000003001', '00000000-0000-4000-8000-000000000001', 'shipment', 'Trendyol siparişin bugün geliyor.', jsonb_build_object('carrier', 'Yurtiçi Kargo', 'merchant', 'Trendyol', 'trackingNumber', '1234567890123', 'trackingUrl', 'https://www.yurticikargo.com/tr/online-servisler/gonderi-sorgula?code=1234567890123', 'deliveryWindow', jsonb_build_object('start', pg_temp.lt(0, '14:00'), 'end', pg_temp.lt(0, '18:00'))), pg_temp.lt(0, '14:00'), 'today',
   jsonb_build_object('type', 'gmail', 'id', '00000000-0000-4000-8000-0000000000e5', 'label', 'Kargo', 'person', 'Yurtiçi', 'timestamp', pg_temp.lt(-1, '19:02')), 0.93, 'life:shipment:1234567890123'),
  ('00000000-0000-4000-8000-000000003002', '00000000-0000-4000-8000-000000000001', 'flight', 'TK2412 · İstanbul → Antalya', jsonb_build_object('flightNumber', 'TK2412', 'airline', 'THY', 'from', 'İstanbul (IST)', 'to', 'Antalya (AYT)', 'departureAt', pg_temp.lt(1, '09:15'), 'arrivalAt', pg_temp.lt(1, '10:30'), 'pnr', 'ABC123', 'checkInUrl', 'https://www.turkishairlines.com/tr-tr/ucak-bileti/online-check-in/'), pg_temp.lt(1, '09:15'), 'upcoming',
   jsonb_build_object('type', 'gmail', 'id', '00000000-0000-4000-8000-0000000000e6', 'label', 'THY', 'person', 'Rezervasyon maili', 'timestamp', pg_temp.lt(-8, '11:20')), 0.95, 'life:flight:TK2412'),
  ('00000000-0000-4000-8000-000000003003', '00000000-0000-4000-8000-000000000001', 'payment', 'Elektrik faturası · 1.842 TL', jsonb_build_object('payee', 'CK Enerji', 'amount', 1842, 'currency', 'TRY', 'dueAt', pg_temp.lt(5, '23:59'), 'paymentUrl', 'https://www.ckbogazicielektrik.com.tr/online-islemler'), pg_temp.lt(5, '23:59'), 'upcoming',
   jsonb_build_object('type', 'gmail', 'id', '00000000-0000-4000-8000-0000000000e7', 'label', 'Gmail', 'person', 'CK Enerji', 'timestamp', pg_temp.lt(-2, '09:05')), 0.9, 'life:payment:ck-eylul'),
  ('00000000-0000-4000-8000-000000003004', '00000000-0000-4000-8000-000000000001', 'subscription', 'Netflix yenilenecek', jsonb_build_object('serviceName', 'Netflix', 'renewsAt', pg_temp.lt(4, '00:00'), 'amount', 229.99, 'currency', 'TRY'), pg_temp.lt(4, '00:00'), 'upcoming',
   jsonb_build_object('type', 'gmail', 'id', '00000000-0000-4000-8000-0000000000e8', 'label', 'Gmail', 'person', 'Netflix', 'timestamp', pg_temp.lt(-3, '07:30')), 0.9, 'life:subscription:netflix'),
  ('00000000-0000-4000-8000-000000003005', '00000000-0000-4000-8000-000000000001', 'security', 'Google hesabında yeni giriş.', jsonb_build_object('securityEvent', 'Yeni cihazdan giriş', 'device', 'Windows', 'location', 'Ankara'), pg_temp.lt(0, '06:12'), 'today',
   jsonb_build_object('type', 'gmail', 'id', '00000000-0000-4000-8000-0000000000e9', 'label', 'Gmail', 'person', 'Google', 'timestamp', pg_temp.lt(0, '06:12'), 'url', 'https://myaccount.google.com/notifications'), 0.97, 'life:security:google-1')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- insights (Today / Flow)
-- ---------------------------------------------------------------------------
insert into public.insights (id, user_id, kind, badge, title, subtitle, reason, importance, priority_score, priority_reasons, time_label, due_at, status, source, actions, entity_type, entity_id, tags, for_date, confidence, dedupe_key)
values
  ('00000000-0000-4000-8000-000000003101', '00000000-0000-4000-8000-000000000001', 'priority', 'urgent', 'Ahmet senden bugün 17:00''ye kadar revize teklif bekliyor.', null, 'Bu mailde bugün saat 17:00''ye kadar cevap istendiği için önemli olarak işaretlendi.', 'critical', 920, array['Bugün 17:00''ye kadar cevap istendi'], '08:42', pg_temp.lt(0, '17:00'), 'active',
   jsonb_build_object('type', 'gmail', 'id', '00000000-0000-4000-8000-0000000000e1', 'label', 'Gmail', 'person', 'Ahmet Yılmaz', 'timestamp', pg_temp.lt(0, '08:42')),
   jsonb_build_array(jsonb_build_object('id', 'reply', 'label', 'Yanıtla', 'kind', 'reply', 'primary', true), jsonb_build_object('id', 'remind', 'label', 'Hatırlat', 'kind', 'remind', 'primary', false)),
   'email_thread', '00000000-0000-4000-8000-0000000000e1', array['important', 'mail'], (now() at time zone 'Europe/Istanbul')::date, 0.94, 'priority:email_thread:e1'),
  ('00000000-0000-4000-8000-000000003102', '00000000-0000-4000-8000-000000000001', 'meeting', 'meeting', '14:30 Mehmet ile toplantı', 'Son görüşmeniz 4 gün önceydi.', null, 'high', 800, array['VIP: Mehmet Yılmaz', 'Bugün 14:30'], '14:30', pg_temp.lt(0, '14:30'), 'active',
   jsonb_build_object('type', 'google_calendar', 'id', '00000000-0000-4000-8000-0000000000d1', 'label', 'Google Takvim', 'person', 'Müşteri toplantısı · 60 dk', 'timestamp', pg_temp.lt(0, '14:30')),
   jsonb_build_array(jsonb_build_object('id', 'prepare', 'label', 'Hazırlan', 'kind', 'prepare', 'primary', true)),
   'calendar_event', '00000000-0000-4000-8000-0000000000d1', array['important', 'calendar'], (now() at time zone 'Europe/Istanbul')::date, 0.99, 'meeting:calendar_event:d1'),
  ('00000000-0000-4000-8000-000000003103', '00000000-0000-4000-8000-000000000001', 'deadline', 'deadline', 'Başvuru bugün 17:00''de kapanıyor.', null, 'Mailde son başvuru saati açıkça belirtilmiş.', 'high', 700, array['Son tarih bugün 17:00'], '17:00', pg_temp.lt(0, '17:00'), 'active',
   jsonb_build_object('type', 'gmail', 'id', '00000000-0000-4000-8000-0000000000e3', 'label', 'Gmail', 'person', 'Girişim Programı', 'timestamp', pg_temp.lt(-1, '16:10')),
   jsonb_build_array(jsonb_build_object('id', 'add_to_calendar', 'label', 'Takvime Ekle', 'kind', 'add_to_calendar', 'primary', true)),
   'email_thread', '00000000-0000-4000-8000-0000000000e3', array['important', 'mail'], (now() at time zone 'Europe/Istanbul')::date, 0.9, 'deadline:email_thread:e3'),
  ('00000000-0000-4000-8000-000000003104', '00000000-0000-4000-8000-000000000001', 'follow_up', 'follow_up', 'Gönderdiğin teklif mailine 3 gündür cevap gelmedi.', null, 'Son mesajı sen gönderdin ve 3 gündür yanıt yok.', 'normal', 520, array['3 gündür yanıt yok'], '3 gün', null, 'active',
   jsonb_build_object('type', 'gmail', 'id', '00000000-0000-4000-8000-0000000000e4', 'label', 'Gmail', 'person', 'Mehmet Yılmaz', 'timestamp', pg_temp.lt(-3, '10:15')),
   jsonb_build_array(jsonb_build_object('id', 'follow_up', 'label', 'Takip Mesajı Hazırla', 'kind', 'follow_up', 'primary', true), jsonb_build_object('id', 'remind', 'label', 'Yarın Hatırlat', 'kind', 'remind', 'primary', false)),
   'follow_up', '00000000-0000-4000-8000-000000002801', array['follow_up', 'mail'], (now() at time zone 'Europe/Istanbul')::date, 0.86, 'follow_up:follow_up:h1'),
  ('00000000-0000-4000-8000-000000003105', '00000000-0000-4000-8000-000000000001', 'life_event', 'personal', 'Trendyol siparişin bugün geliyor.', null, null, 'normal', 300, array['Kargo bugün'], 'Bugün', pg_temp.lt(0, '14:00'), 'active',
   jsonb_build_object('type', 'gmail', 'id', '00000000-0000-4000-8000-000000003001', 'label', 'Kargo', 'person', 'Yurtiçi', 'timestamp', pg_temp.lt(-1, '19:02'), 'url', 'https://www.yurticikargo.com/tr/online-servisler/gonderi-sorgula?code=1234567890123'),
   jsonb_build_array(jsonb_build_object('id', 'track', 'label', 'Takip Et', 'kind', 'track', 'primary', true)),
   'life_event', '00000000-0000-4000-8000-000000003001', array['personal'], (now() at time zone 'Europe/Istanbul')::date, 0.93, 'life_event:life_event:s1'),
  ('00000000-0000-4000-8000-000000003106', '00000000-0000-4000-8000-000000000001', 'waiting_for_user', 'urgent', 'Selin sözleşme taslağı için yorumunu bekliyor.', null, 'Yarın öğlen hukuk departmanına gidecek.', 'high', 780, array['Senden cevap bekliyor'], 'Yarın 12:00', pg_temp.lt(1, '12:00'), 'active',
   jsonb_build_object('type', 'gmail', 'id', '00000000-0000-4000-8000-0000000000e2', 'label', 'Gmail', 'person', 'Selin Kaya', 'timestamp', pg_temp.lt(-1, '15:40')),
   jsonb_build_array(jsonb_build_object('id', 'reply', 'label', 'Yanıtla', 'kind', 'reply', 'primary', true), jsonb_build_object('id', 'remind', 'label', 'Sabah Hatırlat', 'kind', 'remind', 'primary', false)),
   'email_thread', '00000000-0000-4000-8000-0000000000e2', array['important', 'mail'], (now() at time zone 'Europe/Istanbul')::date, 0.88, 'waiting_for_user:email_thread:e2'),
  ('00000000-0000-4000-8000-000000003107', '00000000-0000-4000-8000-000000000001', 'commitment', 'commitment', 'Mehmet''e teklif gönder', 'Toplantı sonrası “yarın göndereceğim” dedin.', null, 'normal', 600, array['Senin taahhüdün'], 'Yarın', pg_temp.lt(1, '18:00'), 'active',
   jsonb_build_object('type', 'meeting_note', 'id', '00000000-0000-4000-8000-000000003901', 'label', 'Toplantı notu', 'timestamp', pg_temp.lt(-4, '15:31')),
   jsonb_build_array(jsonb_build_object('id', 'plan', 'label', 'Planla', 'kind', 'plan', 'primary', true), jsonb_build_object('id', 'postpone', 'label', 'Ertele', 'kind', 'postpone', 'primary', false)),
   'commitment', '00000000-0000-4000-8000-000000002701', array['follow_up'], (now() at time zone 'Europe/Istanbul')::date, 0.9, 'commitment:commitment:g1'),
  ('00000000-0000-4000-8000-000000003108', '00000000-0000-4000-8000-000000000001', 'life_event', 'personal', 'TK2412 · İstanbul → Antalya', '06:45''te evden çıkman gerekebilir. Check-in açık.', null, 'normal', 350, array['Yarın uçuş'], 'Yarın 09:15', pg_temp.lt(1, '09:15'), 'active',
   jsonb_build_object('type', 'gmail', 'id', '00000000-0000-4000-8000-000000003002', 'label', 'THY', 'person', 'Rezervasyon maili', 'timestamp', pg_temp.lt(-8, '11:20'), 'url', 'https://www.turkishairlines.com/tr-tr/ucak-bileti/online-check-in/'),
   jsonb_build_array(jsonb_build_object('id', 'check_in', 'label', 'Check-in', 'kind', 'check_in', 'primary', true), jsonb_build_object('id', 'alarm', 'label', 'Alarm Kur', 'kind', 'alarm', 'primary', false)),
   'life_event', '00000000-0000-4000-8000-000000003002', array['personal'], (now() at time zone 'Europe/Istanbul')::date, 0.95, 'life_event:life_event:s2'),
  ('00000000-0000-4000-8000-000000003109', '00000000-0000-4000-8000-000000000001', 'security', 'security', 'Google hesabında yeni giriş.', 'Windows · Ankara · 06:12', 'Güvenlik uyarıları her zaman öne çıkarılır.', 'high', 850, array['Güvenlik uyarısı'], '06:12', null, 'active',
   jsonb_build_object('type', 'gmail', 'id', '00000000-0000-4000-8000-0000000000e9', 'label', 'Gmail', 'person', 'Google', 'timestamp', pg_temp.lt(0, '06:12'), 'url', 'https://myaccount.google.com/notifications'),
   jsonb_build_array(jsonb_build_object('id', 'open_original', 'label', 'Kaynağı Aç', 'kind', 'open_original', 'primary', true)),
   'email_thread', '00000000-0000-4000-8000-0000000000e9', array['important', 'mail', 'personal'], (now() at time zone 'Europe/Istanbul')::date, 0.97, 'security:email_thread:e9'),
  ('00000000-0000-4000-8000-00000000310a', '00000000-0000-4000-8000-000000000001', 'life_event', 'personal', 'Elektrik faturası · 1.842 TL', 'Son ödeme 10 Eylül', null, 'normal', 400, array['Ödeme son tarihi'], '10 Eyl', pg_temp.lt(5, '23:59'), 'active',
   jsonb_build_object('type', 'gmail', 'id', '00000000-0000-4000-8000-000000003003', 'label', 'Gmail', 'person', 'CK Enerji', 'timestamp', pg_temp.lt(-2, '09:05'), 'url', 'https://www.ckbogazicielektrik.com.tr/online-islemler'),
   jsonb_build_array(jsonb_build_object('id', 'open_link', 'label', 'Faturayı Aç', 'kind', 'open_link', 'primary', true), jsonb_build_object('id', 'remind', 'label', 'Hatırlat', 'kind', 'remind', 'primary', false)),
   'life_event', '00000000-0000-4000-8000-000000003003', array['personal'], (now() at time zone 'Europe/Istanbul')::date, 0.9, 'life_event:life_event:s3'),
  ('00000000-0000-4000-8000-00000000310b', '00000000-0000-4000-8000-000000000001', 'suggestion', 'calendar', 'Yarın 14:00–16:30 arasında 2,5 saat boşluğun var.', 'Teklif hazırlama görevini buraya yerleştirebilirim.', null, 'normal', 450, array['Takvim zekâsı'], 'Yarın', pg_temp.lt(1, '14:00'), 'active',
   jsonb_build_object('type', 'google_calendar', 'id', '00000000-0000-4000-8000-0000000000c1', 'label', 'Google Takvim', 'timestamp', now()),
   jsonb_build_array(jsonb_build_object('id', 'plan', 'label', 'Planla', 'kind', 'plan', 'primary', true, 'payload', jsonb_build_object('taskId', '00000000-0000-4000-8000-000000002601', 'startAt', pg_temp.lt(1, '14:00'), 'endAt', pg_temp.lt(1, '16:30'))), jsonb_build_object('id', 'later', 'label', 'Başka zaman', 'kind', 'snooze', 'primary', false)),
   'suggestion', '00000000-0000-4000-8000-000000002601', array['calendar'], (now() at time zone 'Europe/Istanbul')::date, 0.8, 'suggestion:suggestion:t1'),
  ('00000000-0000-4000-8000-00000000310c', '00000000-0000-4000-8000-000000000001', 'conflict', 'calendar', 'Takvim çakışması: Müşteri toplantısı · Demir A.Ş. ile Doktor randevusu', '14:00–15:00 ve 14:30 çakışıyor.', null, 'high', 650, array['Çakışma'], '2 gün', pg_temp.lt(2, '14:00'), 'active',
   jsonb_build_object('type', 'google_calendar', 'id', '00000000-0000-4000-8000-000000003201', 'label', 'Google Takvim', 'timestamp', now()),
   jsonb_build_array(jsonb_build_object('id', 'see_options', 'label', 'Seçenekleri Gör', 'kind', 'see_options', 'primary', true), jsonb_build_object('id', 'ignore', 'label', 'Yoksay', 'kind', 'snooze', 'primary', false)),
   'conflict', '00000000-0000-4000-8000-000000003201', array['calendar'], (now() at time zone 'Europe/Istanbul')::date, 0.99, 'conflict:conflict:k1'),
  ('00000000-0000-4000-8000-00000000310f', '00000000-0000-4000-8000-000000000002', 'priority', 'urgent', 'Başka kullanıcının kartı', null, null, 'high', 600, '{}', '10:00', null, 'active',
   jsonb_build_object('type', 'gmail', 'id', '00000000-0000-4000-8000-0000000000f1', 'label', 'Gmail', 'timestamp', now()), '[]', 'email_thread', '00000000-0000-4000-8000-0000000000f1', array['important'], (now() at time zone 'Europe/Istanbul')::date, 0.8, 'priority:email_thread:f1')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- briefing (morning, today)
-- ---------------------------------------------------------------------------
insert into public.briefings (id, user_id, kind, for_date, generated_at, headline, highlight_number, subline, mood, narrative, counts, estimated_read_sec, has_changes, produced_by, audio)
values ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-000000000001', 'morning', (now() at time zone 'Europe/Istanbul')::date, pg_temp.lt(0, '07:58'),
  'Bugün bilmen gereken 5 şey var.', 5, '3 önemli mail · 4 etkinlik · 2 takip', 'Bugün oldukça sakin bir günün var.',
  'Öğlene kadar toplantın bulunmuyor. Saat 14:30''da Mehmet ile müşteri toplantın var. Toplantı öncesinde dün gelen fiyat teklifine bakman faydalı olabilir. Gelen 46 mail arasında 3 konu dikkat gerektiriyor.',
  jsonb_build_object('importantEmails', 3, 'events', 4, 'followUps', 2, 'deadlines', 2, 'total', 5, 'analyzedEmails', 46, 'analyzedCalendars', 1, 'analyzedDays', 3), 134, true, 'fallback',
  jsonb_build_object('provider', 'device_tts', 'url', null, 'durationSec', 134, 'script', 'Günaydın Yunus. Bugün bilmen gereken beş şey var. Öğlene kadar toplantın bulunmuyor…',
    'chapters', jsonb_build_array(
      jsonb_build_object('index', 0, 'title', 'Genel bakış', 'startSec', 0, 'durationSec', 18, 'text', 'Günaydın Yunus. Bugün oldukça sakin bir günün var. Öğlene kadar toplantın bulunmuyor.'),
      jsonb_build_object('index', 1, 'title', 'Bugünün öncelikleri', 'startSec', 18, 'durationSec', 32, 'text', 'Ahmet senden bugün saat 17:00''ye kadar revize teklif bekliyor. Girişim programı başvurusu da 17:00''de kapanıyor.'),
      jsonb_build_object('index', 2, 'title', 'Programın', 'startSec', 50, 'durationSec', 24, 'text', 'Saat 14:30''da Mehmet ile müşteri toplantın var. 16:00''da ürün gözden geçirme, akşam 20:30''da Karaköy''de yemek.'),
      jsonb_build_object('index', 3, 'title', 'Cevap bekleyenler', 'startSec', 74, 'durationSec', 21, 'text', 'Ahmet ve Selin senden cevap bekliyor. Mehmet''e gönderdiğin teklife üç gündür yanıt gelmedi.'),
      jsonb_build_object('index', 4, 'title', 'Son tarihler', 'startSec', 95, 'durationSec', 17, 'text', 'Girişim programı başvurusu bugün 17:00. Elektrik faturası 10 Eylül.'),
      jsonb_build_object('index', 5, 'title', 'Kişisel gelişmeler', 'startSec', 112, 'durationSec', 22, 'text', 'Trendyol siparişin bugün geliyor. Yarın 09:15 TK2412 ile Antalya''ya uçuyorsun; check-in açık.')
    )))
on conflict do nothing;

insert into public.briefing_items (briefing_id, user_id, section, position, icon, title, meta, source, insight_id, entity_type, entity_id, chapter_index)
values
  ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-000000000001', 'priorities', 0, 'mail', 'Ahmet''e revize teklif', 'Acil · 17:00', jsonb_build_object('type', 'gmail', 'id', '00000000-0000-4000-8000-0000000000e1', 'label', 'Gmail', 'person', 'Ahmet Yılmaz', 'timestamp', pg_temp.lt(0, '08:42')), '00000000-0000-4000-8000-000000003101', 'email_thread', '00000000-0000-4000-8000-0000000000e1', 1),
  ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-000000000001', 'priorities', 1, 'event', 'Mehmet ile müşteri toplantısı', '14:30 · Hazırlık öneriliyor', jsonb_build_object('type', 'google_calendar', 'id', '00000000-0000-4000-8000-0000000000d1', 'label', 'Google Takvim', 'timestamp', pg_temp.lt(0, '14:30')), '00000000-0000-4000-8000-000000003102', 'calendar_event', '00000000-0000-4000-8000-0000000000d1', 1),
  ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-000000000001', 'priorities', 2, 'flag', 'Başvuru 17:00''de kapanıyor', 'Son tarih', jsonb_build_object('type', 'gmail', 'id', '00000000-0000-4000-8000-0000000000e3', 'label', 'Gmail', 'timestamp', pg_temp.lt(-1, '16:10')), '00000000-0000-4000-8000-000000003103', 'email_thread', '00000000-0000-4000-8000-0000000000e3', 1),
  ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-000000000001', 'schedule', 0, 'event', 'Mehmet ile müşteri toplantısı', '14:30 · 60 dk · Ofis', null, null, 'calendar_event', '00000000-0000-4000-8000-0000000000d1', 2),
  ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-000000000001', 'schedule', 1, 'videocam', 'Ürün gözden geçirme', '16:00 · 30 dk · Online', null, null, 'calendar_event', '00000000-0000-4000-8000-0000000000d2', 2),
  ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-000000000001', 'schedule', 2, 'flag', 'Başvuru son saati', '17:00', null, null, 'email_thread', '00000000-0000-4000-8000-0000000000e3', 2),
  ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-000000000001', 'schedule', 3, 'restaurant', 'Akşam yemeği rezervasyonu', '20:30 · Karaköy', null, null, 'calendar_event', '00000000-0000-4000-8000-0000000000d3', 2),
  ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-000000000001', 'waiting_for_you', 0, 'person', 'Ahmet Yılmaz · Revize teklif', 'Bugün 17:00', null, '00000000-0000-4000-8000-000000003101', 'email_thread', '00000000-0000-4000-8000-0000000000e1', 3),
  ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-000000000001', 'waiting_for_you', 1, 'person', 'Selin Kaya · Sözleşme taslağı', '3 saattir bekliyor', null, '00000000-0000-4000-8000-000000003106', 'email_thread', '00000000-0000-4000-8000-0000000000e2', 3),
  ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-000000000001', 'waiting_for_others', 0, 'schedule_send', 'Mehmet Yılmaz · Teklif', '3 gündür yanıt yok', null, '00000000-0000-4000-8000-000000003104', 'follow_up', '00000000-0000-4000-8000-000000002801', 3),
  ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-000000000001', 'deadlines', 0, 'flag', 'Girişim programı başvurusu', 'Bugün 17:00', null, '00000000-0000-4000-8000-000000003103', 'email_thread', '00000000-0000-4000-8000-0000000000e3', 4),
  ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-000000000001', 'deadlines', 1, 'receipt_long', 'Elektrik faturası · 1.842 TL', '10 Eylül', null, '00000000-0000-4000-8000-00000000310a', 'life_event', '00000000-0000-4000-8000-000000003003', 4),
  ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-000000000001', 'personal', 0, 'package_2', 'Trendyol siparişin bugün geliyor', '14:00–18:00', null, '00000000-0000-4000-8000-000000003105', 'life_event', '00000000-0000-4000-8000-000000003001', 5),
  ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-000000000001', 'personal', 1, 'flight', 'TK2412 İstanbul → Antalya', 'Yarın 09:15', null, '00000000-0000-4000-8000-000000003108', 'life_event', '00000000-0000-4000-8000-000000003002', 5),
  ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-000000000001', 'personal', 2, 'autorenew', 'Netflix yenilenecek', '9 Eylül', null, null, 'life_event', '00000000-0000-4000-8000-000000003004', 5);

-- ---------------------------------------------------------------------------
-- approvals (pending)
-- ---------------------------------------------------------------------------
insert into public.approval_actions (id, user_id, type, status, what, why, change_summary, source, payload, original_payload, idempotency_key, requested_by, insight_id)
values
  ('00000000-0000-4000-8000-000000003301', '00000000-0000-4000-8000-000000000001', 'email_send', 'pending', 'Ahmet Yılmaz''a yanıt gönder', 'Revize teklifi bugün 17:00''ye kadar bekliyor.', array['Kime: Ahmet Yılmaz', 'Konu: Re: Revize teklif', 'Gönderim: sen onaylayınca'],
   jsonb_build_object('type', 'gmail', 'id', '00000000-0000-4000-8000-0000000000e1', 'label', 'Gmail', 'person', 'Ahmet Yılmaz', 'timestamp', pg_temp.lt(0, '08:42')),
   jsonb_build_object('accountId', '00000000-0000-4000-8000-0000000000c1', 'threadId', '00000000-0000-4000-8000-0000000000e1', 'inReplyToExternalId', 'm-ahmet-1', 'to', jsonb_build_array(jsonb_build_object('name', 'Ahmet Yılmaz', 'email', 'ahmet@firma.com')), 'subject', 'Re: Revize teklif', 'bodyText', E'Merhaba Ahmet,\n\nRevize teklifi bugün 17:00''den önce PDF olarak iletiyorum.\n\nİyi çalışmalar,\nYunus', 'tone', 'professional'),
   jsonb_build_object('accountId', '00000000-0000-4000-8000-0000000000c1', 'threadId', '00000000-0000-4000-8000-0000000000e1', 'inReplyToExternalId', 'm-ahmet-1', 'to', jsonb_build_array(jsonb_build_object('name', 'Ahmet Yılmaz', 'email', 'ahmet@firma.com')), 'subject', 'Re: Revize teklif', 'bodyText', E'Merhaba Ahmet,\n\nRevize teklifi bugün 17:00''den önce PDF olarak iletiyorum.\n\nİyi çalışmalar,\nYunus', 'tone', 'professional'),
   'email_send:e1:draft-1', 'email_detail', '00000000-0000-4000-8000-000000003101'),
  ('00000000-0000-4000-8000-000000003302', '00000000-0000-4000-8000-000000000001', 'calendar_create', 'pending', 'Takvime "Başvuru son saati" ekle', 'Başvuru bugün 17:00''de kapanıyor.', array['Başlık: Girişim Programı başvurusu', 'Ne zaman: Bugün 16:30–17:00', 'Takvim: Google'],
   jsonb_build_object('type', 'gmail', 'id', '00000000-0000-4000-8000-0000000000e3', 'label', 'Gmail', 'person', 'Girişim Programı', 'timestamp', pg_temp.lt(-1, '16:10')),
   jsonb_build_object('accountId', '00000000-0000-4000-8000-0000000000c1', 'title', 'Girişim Programı başvurusu', 'startAt', pg_temp.lt(0, '16:30'), 'endAt', pg_temp.lt(0, '17:00'), 'description', 'Son başvuru 17:00'),
   jsonb_build_object('accountId', '00000000-0000-4000-8000-0000000000c1', 'title', 'Girişim Programı başvurusu', 'startAt', pg_temp.lt(0, '16:30'), 'endAt', pg_temp.lt(0, '17:00'), 'description', 'Son başvuru 17:00'),
   'calendar_create:e3:1', 'email_detail', '00000000-0000-4000-8000-000000003103'),
  ('00000000-0000-4000-8000-000000003309', '00000000-0000-4000-8000-000000000002', 'reminder_create', 'pending', 'Başka kullanıcı hatırlatıcısı', 'RLS', '{}', null,
   jsonb_build_object('title', 'x', 'remindAt', now() + interval '1 day', 'option', 'custom'), jsonb_build_object('title', 'x', 'remindAt', now() + interval '1 day', 'option', 'custom'), 'reminder:other:1', 'assistant', null)
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- assistant, memory, post meeting note
-- ---------------------------------------------------------------------------
insert into public.assistant_threads (id, user_id, title, last_message_at)
values ('00000000-0000-4000-8000-000000003401', '00000000-0000-4000-8000-000000000001', 'Bugün neye odaklanmalıyım?', pg_temp.lt(0, '08:50'))
on conflict do nothing;

insert into public.assistant_messages (id, user_id, thread_id, role, content, input_mode, sources, cards)
values
  ('00000000-0000-4000-8000-000000003501', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000003401', 'user', 'Bugün neye odaklanmalıyım?', 'text', '[]', '[]'),
  ('00000000-0000-4000-8000-000000003502', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000003401', 'assistant', 'İki şey öne çıkıyor: Ahmet''in 17:00''ye kadar beklediği revize teklif ve 14:30''daki Mehmet toplantısı. Başvuru da 17:00''de kapanıyor.', 'text',
   jsonb_build_array(jsonb_build_object('type', 'gmail', 'id', '00000000-0000-4000-8000-0000000000e1', 'label', 'Gmail', 'person', 'Ahmet Yılmaz', 'timestamp', pg_temp.lt(0, '08:42')), jsonb_build_object('type', 'google_calendar', 'id', '00000000-0000-4000-8000-0000000000d1', 'label', 'Google Takvim', 'timestamp', pg_temp.lt(0, '14:30'))),
   jsonb_build_array(jsonb_build_object('kind', 'email', 'entityId', '00000000-0000-4000-8000-0000000000e1', 'title', 'Revize teklif', 'subtitle', 'Ahmet Yılmaz · 08:42'), jsonb_build_object('kind', 'event', 'entityId', '00000000-0000-4000-8000-0000000000d1', 'title', 'Mehmet ile müşteri toplantısı', 'subtitle', '14:30 · Ofis')))
on conflict do nothing;

insert into public.post_meeting_notes (id, user_id, event_id, text, input_mode, extracted_commitment_ids)
values ('00000000-0000-4000-8000-000000003901', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000d1', 'Mehmet''e yarın teklif göndereceğim.', 'voice', array['00000000-0000-4000-8000-000000002701']::uuid[])
on conflict do nothing;

insert into public.memory_chunks (id, user_id, source_type, source_id, source, content, topic, person_name, contact_id, occurred_at, token_count)
values
  ('00000000-0000-4000-8000-000000003601', '00000000-0000-4000-8000-000000000001', 'gmail', '00000000-0000-4000-8000-0000000000e1', jsonb_build_object('type', 'gmail', 'id', '00000000-0000-4000-8000-0000000000e1', 'label', 'Gmail', 'person', 'Ahmet Yılmaz', 'timestamp', pg_temp.lt(0, '08:42')),
   'Ahmet Yılmaz revize fiyat teklifini bugün 17:00''ye kadar PDF olarak istiyor; yönetim toplantısında sunacak.', 'Revize teklif', 'Ahmet Yılmaz', '00000000-0000-4000-8000-000000002201', pg_temp.lt(0, '08:42'), 40),
  ('00000000-0000-4000-8000-000000003602', '00000000-0000-4000-8000-000000000001', 'gmail', '00000000-0000-4000-8000-0000000000e4', jsonb_build_object('type', 'gmail', 'id', '00000000-0000-4000-8000-0000000000e4', 'label', 'Gmail', 'person', 'Mehmet Yılmaz', 'timestamp', pg_temp.lt(-3, '10:15')),
   'Mehmet Yılmaz''a Teklif v2 PDF gönderildi; geri bildirim bekleniyor. Fiyat ve teslim takvimi güncellendi.', 'Teklif v2', 'Mehmet Yılmaz', '00000000-0000-4000-8000-000000002202', pg_temp.lt(-3, '10:15'), 36),
  ('00000000-0000-4000-8000-000000003603', '00000000-0000-4000-8000-000000000001', 'gmail', '00000000-0000-4000-8000-0000000000e6', jsonb_build_object('type', 'gmail', 'id', '00000000-0000-4000-8000-0000000000e6', 'label', 'THY', 'timestamp', pg_temp.lt(-8, '11:20')),
   'THY TK2412 uçuşu: İstanbul (IST) → Antalya (AYT), yarın 09:15–10:30. PNR ABC123. Online check-in açık.', 'Uçak bileti', 'THY', null, pg_temp.lt(-8, '11:20'), 38),
  ('00000000-0000-4000-8000-000000003604', '00000000-0000-4000-8000-000000000001', 'gmail', '00000000-0000-4000-8000-0000000000e7', jsonb_build_object('type', 'gmail', 'id', '00000000-0000-4000-8000-0000000000e7', 'label', 'Gmail', 'person', 'CK Enerji', 'timestamp', pg_temp.lt(-2, '09:05')),
   'CK Enerji elektrik faturası: 1.842 TL, son ödeme tarihi 10 Eylül.', 'Elektrik faturası', 'CK Enerji', null, pg_temp.lt(-2, '09:05'), 22),
  ('00000000-0000-4000-8000-000000003605', '00000000-0000-4000-8000-000000000001', 'meeting_note', '00000000-0000-4000-8000-000000003901', jsonb_build_object('type', 'meeting_note', 'id', '00000000-0000-4000-8000-000000003901', 'label', 'Toplantı notu', 'person', 'Mehmet Yılmaz', 'timestamp', pg_temp.lt(-4, '15:31')),
   'Mehmet ile müşteri toplantısı sonrası not: yarın teklif gönderilecek. Konuşulanlar: revize fiyat, teslim tarihi, sözleşme maddesi.', 'Müşteri toplantısı', 'Mehmet Yılmaz', '00000000-0000-4000-8000-000000002202', pg_temp.lt(-4, '15:31'), 34),
  ('00000000-0000-4000-8000-000000003609', '00000000-0000-4000-8000-000000000002', 'gmail', '00000000-0000-4000-8000-0000000000f1', jsonb_build_object('type', 'gmail', 'id', '00000000-0000-4000-8000-0000000000f1', 'label', 'Gmail', 'timestamp', now()), 'Başka kullanıcının hafıza parçası; teklif kelimesi içerir.', 'Teklif', 'Ayşe Demir', null, now(), 12)
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- referral status, push token, audit
-- ---------------------------------------------------------------------------
insert into public.referrals (id, referrer_user_id, referred_user_id, code, status, redeemed_at)
values ('00000000-0000-4000-8000-000000003701', '00000000-0000-4000-8000-000000000001', null, 'YUNUS7K2', 'pending', null)
on conflict do nothing;

insert into public.push_tokens (id, user_id, token, platform, device_id, device_name, app_version)
values ('00000000-0000-4000-8000-000000003801', '00000000-0000-4000-8000-000000000001', 'ExponentPushToken[demo-device-1]', 'ios', 'demo-device-1', 'iPhone 16 Pro', '1.0.0')
on conflict do nothing;

insert into public.audit_logs (user_id, action, actor, target_type, target_id, metadata)
values ('00000000-0000-4000-8000-000000000001', 'oauth.connect', 'user', 'connected_account', '00000000-0000-4000-8000-0000000000c1', jsonb_build_object('provider', 'google', 'kinds', 'email,calendar'));
