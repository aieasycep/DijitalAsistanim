/**
 * Turn "···" corrections (Önemli değil · Daha sık göster · VIP yap · Takip etme …) into
 * learned-preference upserts (when the user allows learning) or explicit rule suggestions.
 * VIP and follow-up changes are explicit actions and are always returned.
 */
import type { AiFeedbackKind, Locale } from '@da/domain';
import type {
  FeedbackContext,
  FeedbackPlan,
  LearnedPreferenceUpsert,
  RuleSuggestion,
} from './types';

const ACK: Record<Locale, Record<AiFeedbackKind, string>> = {
  tr: {
    not_important: 'Öğrendim · Bunu daha az öne çıkaracağım',
    important: 'Öğrendim · Bunu daha önemli sayacağım',
    show_more: 'Öğrendim · Bunun gibi olanları daha sık göstereceğim',
    show_less: 'Öğrendim · Bunun gibi olanları daha az göstereceğim',
    make_vip: '{name} artık VIP.',
    stop_following: 'Takip kapatıldı · Bunu bir daha hatırlatmam',
    correct: 'Teşekkürler · Böyle devam edeceğim',
    wrong: 'Öğrendim · Bir dahakine daha dikkatli olacağım',
  },
  en: {
    not_important: 'Got it · I will show this less prominently',
    important: 'Got it · I will treat this as more important',
    show_more: 'Got it · I will show more like this',
    show_less: 'Got it · I will show fewer like this',
    make_vip: '{name} is now a VIP.',
    stop_following: 'Follow-up closed · I will not remind you again',
    correct: 'Thanks · I will keep doing this',
    wrong: 'Got it · I will be more careful next time',
  },
};

function personLabel(ctx: FeedbackContext): string {
  return (
    ctx.entity.senderName?.trim() ||
    ctx.entity.senderEmail?.trim() ||
    (ctx.locale === 'en' ? 'this person' : 'bu kişi')
  );
}

function personKey(ctx: FeedbackContext): string | null {
  return ctx.entity.contactId ?? ctx.entity.senderEmail?.toLowerCase() ?? null;
}

function statement(
  locale: Locale,
  kind: 'person' | 'category' | 'dismiss' | 'focus',
  subject: string,
  direction: 'up' | 'down',
): string {
  const tr: Record<typeof kind, Record<typeof direction, string>> = {
    person: { up: `${subject} yüksek öncelikli.`, down: `${subject} daha az öncelikli.` },
    category: {
      up: `${subject} kategorisi daha önemli.`,
      down: `${subject} kategorisi daha az önemli.`,
    },
    dismiss: { up: `${subject} takip edilsin.`, down: `${subject} için takip istemiyor.` },
    focus: {
      up: `Brifingde ${subject} daha çok yer alsın.`,
      down: `Brifingde ${subject} daha az yer alsın.`,
    },
  };
  const en: Record<typeof kind, Record<typeof direction, string>> = {
    person: { up: `${subject} is high priority.`, down: `${subject} is lower priority.` },
    category: {
      up: `${subject} category matters more.`,
      down: `${subject} category matters less.`,
    },
    dismiss: { up: `Keep following ${subject}.`, down: `No follow-ups for ${subject}.` },
    focus: { up: `More ${subject} in briefings.`, down: `Less ${subject} in briefings.` },
  };
  return (locale === 'en' ? en : tr)[kind][direction];
}

const CATEGORY_LABEL_TR: Record<string, string> = {
  action_required: 'Aksiyon gereken',
  waiting_for_user: 'Senden beklenen',
  waiting_for_other: 'Karşıdan beklenen',
  deadline: 'Son tarih',
  meeting: 'Toplantı',
  travel: 'Seyahat',
  shipment: 'Kargo',
  payment: 'Ödeme',
  subscription: 'Abonelik',
  security: 'Güvenlik',
  information: 'Bilgi',
  promotion: 'Kampanya',
};

function categoryLabel(locale: Locale, category: string): string {
  return locale === 'en' ? category.replace(/_/g, ' ') : (CATEGORY_LABEL_TR[category] ?? category);
}

export function applyFeedback(kind: AiFeedbackKind, ctx: FeedbackContext): FeedbackPlan {
  const locale: Locale = ctx.locale ?? 'tr';
  const plan: FeedbackPlan = {
    learnedUpserts: [],
    vipUpserts: [],
    ruleSuggestions: [],
    followUpUpdates: [],
    ack: ACK[locale][kind],
  };
  const pKey = personKey(ctx);
  const pLabel = personLabel(ctx);
  const category = ctx.entity.category ?? null;
  const learn = ctx.learnFromInteractions;

  const learned = (u: LearnedPreferenceUpsert): void => {
    if (learn) plan.learnedUpserts.push(u);
  };
  const suggest = (s: RuleSuggestion): void => {
    if (!learn) plan.ruleSuggestions.push(s);
  };
  const person = (delta: number): void => {
    if (!pKey) return;
    learned({
      kind: 'person_priority',
      subjectKey: pKey,
      weightDelta: delta,
      statement: statement(locale, 'person', pLabel, delta > 0 ? 'up' : 'down'),
    });
  };
  const cat = (
    delta: number,
    prefKind: 'category_priority' | 'briefing_focus' = 'category_priority',
  ): void => {
    if (!category) return;
    learned({
      kind: prefKind,
      subjectKey: category,
      weightDelta: delta,
      statement: statement(
        locale,
        prefKind === 'briefing_focus' ? 'focus' : 'category',
        categoryLabel(locale, category),
        delta > 0 ? 'up' : 'down',
      ),
    });
  };
  const senderImportantSuggestion = (): void => {
    if (ctx.entity.senderEmail) {
      suggest({
        type: 'sender_important',
        value: ctx.entity.senderEmail.toLowerCase(),
        label:
          locale === 'en' ? `Mail from ${pLabel} is important` : `${pLabel} gönderdiğinde önemli`,
        reason:
          locale === 'en'
            ? 'Learning is off; add a rule so this sticks.'
            : 'Öğrenme kapalı; kalıcı olması için kural ekleyebilirsin.',
      });
    }
  };

  switch (kind) {
    case 'not_important':
      person(-0.35);
      cat(-0.15);
      if (category === 'promotion') {
        suggest({
          type: 'promotions_low',
          value: 'promotions',
          label: locale === 'en' ? 'Promotions are low priority' : 'Kampanyalar düşük öncelikli',
          reason:
            locale === 'en'
              ? 'Learning is off; add a rule so this sticks.'
              : 'Öğrenme kapalı; kalıcı olması için kural ekleyebilirsin.',
        });
      }
      break;
    case 'important':
      person(0.35);
      cat(0.15);
      senderImportantSuggestion();
      break;
    case 'show_more':
      person(0.25);
      cat(0.25, 'briefing_focus');
      senderImportantSuggestion();
      break;
    case 'show_less':
      person(-0.25);
      cat(-0.25, 'briefing_focus');
      if (ctx.entity.senderEmail) {
        suggest({
          type: 'mute_sender',
          value: ctx.entity.senderEmail.toLowerCase(),
          label: locale === 'en' ? `Mute ${pLabel}` : `${pLabel} sessize alınsın`,
          reason:
            locale === 'en'
              ? 'Learning is off; muting is the explicit alternative.'
              : 'Öğrenme kapalı; kalıcı olması için sessize alabilirsin.',
        });
      }
      break;
    case 'make_vip': {
      const name = ctx.entity.senderName?.trim() || ctx.entity.senderEmail?.trim() || '';
      if (name) {
        plan.vipUpserts.push({
          displayName: name,
          email: ctx.entity.senderEmail?.toLowerCase() ?? null,
          contactId: ctx.entity.contactId ?? null,
          notifyAlways: true,
        });
        person(0.5);
        plan.ack = ACK[locale].make_vip.replace('{name}', name);
      } else {
        plan.ack =
          locale === 'en'
            ? 'This item has no person to mark as VIP.'
            : 'Bu kartta VIP yapılacak bir kişi yok.';
      }
      break;
    }
    case 'stop_following': {
      const followUpId =
        ctx.entity.followUpId ??
        (ctx.entity.entityType === 'follow_up' ? ctx.entity.entityId : null);
      if (followUpId) plan.followUpUpdates.push({ followUpId, status: 'closed' });
      const subjectKey = pKey ?? ctx.entity.threadId ?? ctx.entity.entityId;
      learned({
        kind: 'dismiss_pattern',
        subjectKey,
        weightDelta: 0.5,
        statement: statement(locale, 'dismiss', pLabel, 'down'),
      });
      break;
    }
    case 'correct':
      cat(0.1);
      break;
    case 'wrong':
      cat(-0.2);
      person(-0.1);
      break;
  }
  return plan;
}
