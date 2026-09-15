/**
 * withAndroidNotificationChannels — creates the Android notification channels the push pipeline targets.
 *
 * Channel ids mirror `androidChannelId(category)` in packages/server-core/src/notifications/index.ts
 * (`da_<category>` for every NotificationCategory) plus the `general` fallback channel that
 * expo-notifications' `defaultChannel` and FCM's default meta-data point to. Importance follows the
 * server's HIGH_PRIORITY_CATEGORIES (critical_email, meeting, deadline, reminder, approval → HIGH).
 *
 * How: injects an idempotent `DaNotificationChannels.ensure(this)` call into MainApplication.onCreate
 * (runs before any push is rendered, including headless FCM deliveries), sets the FCM default channel
 * meta-data and guarantees POST_NOTIFICATIONS. Channels that already exist are left untouched so the
 * user's per-channel changes survive updates.
 *
 * Props (all optional): { defaultChannelId?: string; channels?: Array<{ id, name, description?, importance? }> }
 * where importance is 'low' | 'default' | 'high'.
 */
const {
  AndroidConfig,
  WarningAggregator,
  withAndroidManifest,
  withMainApplication,
} = require('expo/config-plugins');

const PLUGIN = 'withAndroidNotificationChannels';
const OBJECT_TAG = 'da-notification-channels';
const CALL_TAG = 'da-notification-channels-call';
const FCM_DEFAULT_CHANNEL_META = 'com.google.firebase.messaging.default_notification_channel_id';
const POST_NOTIFICATIONS = 'android.permission.POST_NOTIFICATIONS';

const IMPORTANCE = {
  low: 'android.app.NotificationManager.IMPORTANCE_LOW',
  default: 'android.app.NotificationManager.IMPORTANCE_DEFAULT',
  high: 'android.app.NotificationManager.IMPORTANCE_HIGH',
};

/** NotificationCategory → channel spec. Keep in sync with @da/domain NOTIFICATION_CATEGORIES. */
const CATEGORY_CHANNELS = [
  {
    category: 'morning',
    name: 'Sabah brifingi',
    description: 'Güne başlarken bilmen gerekenler',
    importance: 'default',
  },
  {
    category: 'midday',
    name: 'Öğle nabzı',
    description: 'Sabahtan beri olan önemli gelişmeler',
    importance: 'default',
  },
  {
    category: 'evening',
    name: 'Akşam kapanışı',
    description: 'Yarına kalan konular',
    importance: 'default',
  },
  {
    category: 'weekly',
    name: 'Haftalık özet',
    description: 'Haftanın özeti ve kazanılan zaman',
    importance: 'low',
  },
  {
    category: 'critical_email',
    name: 'Önemli mail',
    description: 'Dönüş bekleyen kritik mailler',
    importance: 'high',
  },
  {
    category: 'meeting',
    name: 'Toplantı',
    description: 'Yaklaşan toplantılar ve hazırlık notları',
    importance: 'high',
  },
  {
    category: 'deadline',
    name: 'Son tarih',
    description: 'Yaklaşan ve geçen son tarihler',
    importance: 'high',
  },
  {
    category: 'follow_up',
    name: 'Takip',
    description: 'Yanıt bekleyen mailler',
    importance: 'default',
  },
  {
    category: 'life_event',
    name: 'Kişisel gelişme',
    description: 'Kargo, uçuş, ödeme ve rezervasyonlar',
    importance: 'default',
  },
  {
    category: 'approval',
    name: 'Onay bekliyor',
    description: 'Onayını bekleyen işlemler',
    importance: 'high',
  },
  {
    category: 'reminder',
    name: 'Hatırlatıcı',
    description: 'Kurduğun hatırlatıcılar',
    importance: 'high',
  },
];

function androidChannelId(category) {
  return `da_${category}`;
}

function kotlinString(value) {
  return `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\$/g, '\\$')}"`;
}

function resolveChannels(props) {
  const defaultChannelId =
    typeof props.defaultChannelId === 'string' && props.defaultChannelId
      ? props.defaultChannelId
      : 'general';
  const specs = new Map();
  specs.set(defaultChannelId, {
    id: defaultChannelId,
    name: 'Genel',
    description: 'Genel bildirimler',
    importance: 'default',
  });
  for (const entry of CATEGORY_CHANNELS) {
    specs.set(androidChannelId(entry.category), { id: androidChannelId(entry.category), ...entry });
  }
  for (const custom of Array.isArray(props.channels) ? props.channels : []) {
    if (!custom || typeof custom.id !== 'string' || !custom.id) continue;
    const base = specs.get(custom.id) ?? {
      name: custom.id,
      description: '',
      importance: 'default',
    };
    specs.set(custom.id, {
      id: custom.id,
      name: typeof custom.name === 'string' && custom.name ? custom.name : base.name,
      description: typeof custom.description === 'string' ? custom.description : base.description,
      importance: custom.importance in IMPORTANCE ? custom.importance : base.importance,
    });
  }
  return { defaultChannelId, channels: [...specs.values()] };
}

function channelsObjectSource(channels) {
  const specLines = channels.map(
    (c) =>
      `    Spec(${kotlinString(c.id)}, ${kotlinString(c.name)}, ${kotlinString(c.description)}, ${IMPORTANCE[c.importance]}),`,
  );
  return [
    '/** Notification channels for Dijital Asistan pushes; ids mirror the server-side androidChannelId(). */',
    'private object DaNotificationChannels {',
    '  private class Spec(val id: String, val name: String, val description: String, val importance: Int)',
    '',
    '  private val specs: List<Spec> = listOf(',
    ...specLines,
    '  )',
    '',
    '  fun ensure(context: android.content.Context) {',
    '    val manager = context.getSystemService(android.content.Context.NOTIFICATION_SERVICE)',
    '      as? android.app.NotificationManager ?: return',
    '    for (spec in specs) {',
    '      if (manager.getNotificationChannel(spec.id) != null) continue',
    '      val channel = android.app.NotificationChannel(spec.id, spec.name, spec.importance)',
    '      channel.description = spec.description',
    '      manager.createNotificationChannel(channel)',
    '    }',
    '  }',
    '}',
  ];
}

/**
 * Inserts (or replaces) a tagged block. Existing blocks are replaced in place, otherwise the block is
 * inserted `offset` lines after the first line matching `anchor`.
 */
function upsertGeneratedBlock(source, { tag, anchor, offset, lines }) {
  const begin = `// @generated begin ${tag} - expo prebuild (DO NOT MODIFY)`;
  const end = `// @generated end ${tag}`;
  const block = [begin, ...lines, end];
  const src = source.split('\n');
  const beginIndex = src.findIndex((line) => line.trim() === begin);
  const endIndex = src.findIndex((line) => line.trim() === end);
  if (beginIndex >= 0 && endIndex > beginIndex) {
    src.splice(beginIndex, endIndex - beginIndex + 1, ...block);
    return src.join('\n');
  }
  const anchorIndex = src.findIndex((line) => anchor.test(line));
  if (anchorIndex < 0) {
    throw new Error(`[${PLUGIN}] could not find ${anchor} in MainApplication.kt`);
  }
  src.splice(anchorIndex + offset, 0, ...block);
  return src.join('\n');
}

function withChannelsInMainApplication(config, channels) {
  return withMainApplication(config, (mod) => {
    if (mod.modResults.language !== 'kt') {
      WarningAggregator.addWarningAndroid(
        PLUGIN,
        'MainApplication is not Kotlin; notification channels must be created at runtime instead.',
      );
      return mod;
    }
    let contents = mod.modResults.contents;
    contents = upsertGeneratedBlock(contents, {
      tag: OBJECT_TAG,
      anchor: /^\s*class MainApplication\b/,
      offset: 0,
      lines: [...channelsObjectSource(channels), ''],
    });
    contents = upsertGeneratedBlock(contents, {
      tag: CALL_TAG,
      anchor: /^\s*super\.onCreate\(\)\s*$/,
      offset: 1,
      lines: ['    DaNotificationChannels.ensure(this)'],
    });
    mod.modResults.contents = contents;
    return mod;
  });
}

function withChannelManifest(config, defaultChannelId) {
  return withAndroidManifest(config, (mod) => {
    const mainApplication = AndroidConfig.Manifest.getMainApplicationOrThrow(mod.modResults);
    AndroidConfig.Manifest.addMetaDataItemToMainApplication(
      mainApplication,
      FCM_DEFAULT_CHANNEL_META,
      defaultChannelId,
    );
    AndroidConfig.Permissions.ensurePermission(mod.modResults, POST_NOTIFICATIONS);
    return mod;
  });
}

module.exports = function withAndroidNotificationChannels(config, props) {
  const { defaultChannelId, channels } = resolveChannels(
    props && typeof props === 'object' ? props : {},
  );
  let result = withChannelManifest(config, defaultChannelId);
  result = withChannelsInMainApplication(result, channels);
  return result;
};

module.exports.androidChannelId = androidChannelId;
module.exports.CATEGORY_CHANNELS = CATEGORY_CHANNELS;
// Exposed for tests / scripts (pure string helpers).
module.exports.resolveChannels = resolveChannels;
module.exports.channelsObjectSource = channelsObjectSource;
module.exports.upsertGeneratedBlock = upsertGeneratedBlock;
