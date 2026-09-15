/**
 * POST /android-notifications-ingest { items[] } — Android-only, opt-in. Sensitive notifications (OTP,
 * authenticators, password managers) are rejected server-side as a second line of defense; accepted rows are
 * stored and picked up by the ingestion pipeline (insights are created by the followups/sync cron pass).
 */
import { androidNotificationIngestSchema } from '@da/validation';
import { AppError } from '@da/server-core/errors';
import { isSensitiveNotification } from '@da/server-core/triage';
import {
  adminClient,
  assertMethod,
  audit,
  handler,
  json,
  parseInput,
  requireUser,
} from '../_shared/mod.ts';

Deno.serve(
  handler(async (req) => {
    assertMethod(req, 'POST');
    const { user } = await requireUser(req);
    const { items } = await parseInput(req, androidNotificationIngestSchema);
    const admin = adminClient();

    const { data: prefs } = await admin
      .from('user_preferences')
      .select(
        'android_notification_upload_consent, android_notification_scope, android_allowed_packages',
      )
      .eq('user_id', user.id)
      .maybeSingle();
    const p = prefs as {
      android_notification_upload_consent: boolean;
      android_notification_scope: 'all_allowed' | 'selected';
      android_allowed_packages: string[];
    } | null;
    if (!p?.android_notification_upload_consent) {
      throw new AppError('forbidden', 'Bildirim içeriği için sunucuya gönderme izni kapalı.');
    }
    const allowed = new Set(p.android_allowed_packages ?? []);
    const accepted = items.filter((it) => {
      if (isSensitiveNotification({ packageName: it.packageName, title: it.title, text: it.text }))
        return false;
      if (p.android_notification_scope === 'selected' && !allowed.has(it.packageName)) return false;
      return true;
    });
    if (accepted.length === 0) return json({ accepted: 0 });

    const rows = accepted.map((it) => ({
      user_id: user.id,
      package_name: it.packageName,
      app_name: it.appName,
      title: it.title,
      text: it.text,
      posted_at: it.postedAt,
      fingerprint: it.fingerprint,
    }));
    const { error, data } = await admin
      .from('android_notifications')
      .upsert(rows, { onConflict: 'user_id,fingerprint', ignoreDuplicates: true })
      .select('id');
    if (error) throw new AppError('internal', `Bildirimler kaydedilemedi: ${error.message}`);
    await audit(admin, {
      userId: user.id,
      action: 'notification.access_change',
      actor: 'user',
      targetType: 'android_notifications',
      metadata: { accepted: accepted.length, rejected: items.length - accepted.length },
    });
    return json({ accepted: Array.isArray(data) ? data.length : accepted.length });
  }),
);
