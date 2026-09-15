import { describe, expect, it } from 'vitest';
import type { LearnedPreference, PriorityRule, VipPerson } from '@da/domain';
import {
  applyFeedback,
  rankCandidates,
  scoreCandidate,
  selectTopPriorities,
  type PriorityCandidate,
  type PriorityContext,
} from './index';

const now = '2026-09-04T05:42:00.000Z'; // Friday 08:42 Istanbul
const tz = 'Europe/Istanbul';

function ctx(partial: Partial<PriorityContext> = {}): PriorityContext {
  return { rules: [], vips: [], learned: [], now, timezone: tz, ...partial };
}

function cand(partial: Partial<PriorityCandidate> & { id: string }): PriorityCandidate {
  return {
    kind: 'email',
    category: 'information',
    importance: 'normal',
    requiresUserAction: false,
    isUserCommitment: false,
    isPromotion: false,
    isNewsletter: false,
    confidence: 0.8,
    ageHours: 1,
    ...partial,
  };
}

function rule(type: PriorityRule['type'], value: string, position = 0): PriorityRule {
  return {
    id: `rule-${type}-${value}`,
    userId: 'u1',
    type,
    value,
    label: value,
    enabled: true,
    position,
    createdAt: now,
    updatedAt: now,
  };
}

function vip(
  displayName: string,
  email: string | null,
  contactId: string | null = null,
): VipPerson {
  return {
    id: `vip-${displayName}`,
    userId: 'u1',
    displayName,
    email,
    contactId,
    relation: null,
    notifyAlways: true,
    createdAt: now,
    updatedAt: now,
  };
}

function learned(
  kind: LearnedPreference['kind'],
  subjectKey: string,
  weight: number,
  statement = '',
): LearnedPreference {
  return {
    id: `lp-${kind}-${subjectKey}`,
    userId: 'u1',
    kind,
    statement,
    subjectKey,
    weight,
    evidenceCount: 3,
    enabled: true,
    lastReinforcedAt: now,
    createdAt: now,
    updatedAt: now,
  };
}

describe('priority · ordering', () => {
  it('mute rules produce muted:true, score 0 and a Turkish reason', () => {
    const r = scoreCandidate(
      cand({ id: 'a', senderEmail: 'bot@spam.io', importance: 'critical' }),
      ctx({ rules: [rule('mute_domain', 'spam.io')] }),
    );
    expect(r.muted).toBe(true);
    expect(r.score).toBe(0);
    expect(r.tier).toBe('low');
    expect(r.reasons).toEqual(['Kuralın: bu alan adı sessize alınmış']);
  });
  it('explicit sender_important rule lifts a low AI importance to high with the canonical reason', () => {
    const r = scoreCandidate(
      cand({ id: 'a', senderEmail: 'ahmet@musteri.com', importance: 'low' }),
      ctx({ rules: [rule('sender_important', 'ahmet@musteri.com')] }),
    );
    expect(r.tier).toBe('high');
    expect(r.reasons[0]).toBe('Kuralın: bu göndericiden gelenler her zaman önemli');
    expect(r.matchedRuleIds).toHaveLength(1);
  });
  it('explicit rule beats learned preference in both directions', () => {
    const down = learned('person_priority', 'ahmet@musteri.com', -1, 'Ahmet daha az öncelikli.');
    const withRule = scoreCandidate(
      cand({ id: 'a', senderEmail: 'ahmet@musteri.com', importance: 'normal' }),
      ctx({ rules: [rule('sender_important', 'ahmet@musteri.com')], learned: [down] }),
    );
    const withoutRule = scoreCandidate(
      cand({ id: 'a', senderEmail: 'ahmet@musteri.com', importance: 'normal' }),
      ctx({ learned: [down] }),
    );
    expect(withoutRule.tier).toBe('low');
    expect(withRule.tier).toBe('high');
    expect(withRule.reasons.some((x) => x.startsWith('Öğrendiğim'))).toBe(false);

    const up = learned('person_priority', 'promo@shop.com', 1, 'Shop yüksek öncelikli.');
    const lowRule = scoreCandidate(
      cand({
        id: 'b',
        senderEmail: 'promo@shop.com',
        importance: 'high',
        text: 'Yeni kampanya başladı',
      }),
      ctx({ rules: [rule('keyword_low', 'kampanya')], learned: [up] }),
    );
    expect(lowRule.tier).toBe('low');
    expect(lowRule.reasons[0]).toBe("Kuralın: 'kampanya' geçenler düşük öncelikli");
  });
  it('explicit low rules even beat security and deadlines (user rules are law)', () => {
    const r = scoreCandidate(
      cand({
        id: 'a',
        category: 'security',
        importance: 'critical',
        text: 'Haftalık güvenlik bülteni',
        deadlineAt: '2026-09-04T14:00:00.000Z',
      }),
      ctx({ rules: [rule('keyword_low', 'bülten')] }),
    );
    expect(r.tier).toBe('low');
  });
  it('security is critical/high regardless of promo flags', () => {
    const r = scoreCandidate(
      cand({ id: 'a', category: 'security', importance: 'critical', isNewsletter: true }),
      ctx(),
    );
    expect(r.tier).toBe('critical');
    expect(r.reasons).toContain('Güvenlik uyarısı');
    expect(
      scoreCandidate(cand({ id: 'b', category: 'security', importance: 'normal' }), ctx()).tier,
    ).toBe('high');
  });
  it('a deadline within 24h that needs a reply is critical with a natural reason', () => {
    const r = scoreCandidate(
      cand({
        id: 'a',
        category: 'action_required',
        importance: 'normal',
        requiresUserAction: true,
        deadlineAt: '2026-09-04T14:00:00.000Z',
      }),
      ctx(),
    );
    expect(r.tier).toBe('critical');
    expect(r.reasons).toContain("Bugün 17:00'ye kadar cevap istendi");
    expect(r.reasons).toContain('Senden yanıt bekleniyor');
  });
  it('deadline tiers by horizon: 3 days → high, 6 days → normal floor, far → no floor, overdue → high', () => {
    const in3 = scoreCandidate(
      cand({
        id: 'a',
        importance: 'low',
        deadlineAt: '2026-09-06T15:00:00.000Z',
        deadlineHasTime: false,
      }),
      ctx(),
    );
    expect(in3.tier).toBe('high');
    expect(in3.reasons[0]).toBe('Son tarih: Pazar sonuna kadar');
    expect(
      scoreCandidate(
        cand({ id: 'b', importance: 'low', deadlineAt: '2026-09-10T15:00:00.000Z' }),
        ctx(),
      ).tier,
    ).toBe('normal');
    expect(
      scoreCandidate(
        cand({ id: 'c', importance: 'low', deadlineAt: '2026-10-10T15:00:00.000Z' }),
        ctx(),
      ).tier,
    ).toBe('low');
    const overdue = scoreCandidate(
      cand({ id: 'd', importance: 'low', deadlineAt: '2026-09-03T15:00:00.000Z' }),
      ctx(),
    );
    expect(overdue.tier).toBe('high');
    expect(overdue.reasons[0]).toBe('Son tarihi geçti: dün');
  });
  it('VIP person is at least high with "VIP: name"', () => {
    const r = scoreCandidate(
      cand({ id: 'a', senderEmail: 'ahmet@musteri.com', importance: 'low' }),
      ctx({ vips: [vip('Ahmet Yılmaz', 'ahmet@musteri.com')] }),
    );
    expect(r.tier).toBe('high');
    expect(r.reasons).toContain('VIP: Ahmet Yılmaz');
    const byContact = scoreCandidate(
      cand({ id: 'b', contactId: 'c-1', importance: 'low' }),
      ctx({ vips: [vip('Elif', null, 'c-1')] }),
    );
    expect(byContact.reasons).toContain('VIP: Elif');
  });
  it('waiting for reply, own commitment and meeting relevance set a normal floor', () => {
    expect(
      scoreCandidate(
        cand({
          id: 'a',
          importance: 'low',
          category: 'waiting_for_user',
          requiresUserAction: true,
          ageHours: 60,
        }),
        ctx(),
      ).reasons,
    ).toContain('2 gündür senden yanıt bekleniyor');
    const c = scoreCandidate(
      cand({ id: 'b', kind: 'commitment', importance: 'low', isUserCommitment: true }),
      ctx(),
    );
    expect(c.tier).toBe('normal');
    expect(c.reasons).toContain('Kendi verdiğin bir söz');
    const m = scoreCandidate(
      cand({ id: 'c', importance: 'low', relatedMeetingAt: '2026-09-04T11:30:00.000Z' }),
      ctx(),
    );
    expect(m.tier).toBe('normal');
    expect(m.reasons).toContain('Toplantıyla ilgili: bugün 14:30');
  });
  it('learned preference shifts the AI tier by one step and explains itself', () => {
    const up = scoreCandidate(
      cand({ id: 'a', contactId: 'c-9', importance: 'normal' }),
      ctx({ learned: [learned('person_priority', 'c-9', 0.7, 'Mehmet Yılmaz yüksek öncelikli.')] }),
    );
    expect(up.tier).toBe('high');
    expect(up.reasons).toContain('Öğrendiğim: Mehmet Yılmaz yüksek öncelikli.');
    const down = scoreCandidate(
      cand({ id: 'b', category: 'information', importance: 'high' }),
      ctx({ learned: [learned('category_priority', 'information', -0.6)] }),
    );
    expect(down.tier).toBe('normal');
    const weak = scoreCandidate(
      cand({ id: 'c', contactId: 'c-9', importance: 'normal' }),
      ctx({ learned: [learned('person_priority', 'c-9', 0.2)] }),
    );
    expect(weak.tier).toBe('normal');
  });
  it('AI importance decides the base tier; promotions drop to low when nothing above applies', () => {
    expect(scoreCandidate(cand({ id: 'a', importance: 'critical' }), ctx()).tier).toBe('critical');
    expect(scoreCandidate(cand({ id: 'b', importance: 'high' }), ctx()).reasons).toContain(
      'Önemli görünüyor',
    );
    const promo = scoreCandidate(cand({ id: 'c', importance: 'high', isPromotion: true }), ctx());
    expect(promo.tier).toBe('low');
    expect(promo.reasons).toContain('Kampanya içeriği');
    const promoWithDeadline = scoreCandidate(
      cand({
        id: 'd',
        importance: 'high',
        isPromotion: true,
        requiresUserAction: true,
        deadlineAt: '2026-09-04T14:00:00.000Z',
      }),
      ctx(),
    );
    expect(promoWithDeadline.tier).toBe('critical');
  });
  it('score is monotonic with tier and bounded 0..1000', () => {
    const c = scoreCandidate(
      cand({
        id: 'a',
        importance: 'critical',
        category: 'security',
        requiresUserAction: true,
        deadlineAt: '2026-09-04T14:00:00.000Z',
      }),
      ctx({ vips: [vip('X', null)] }),
    );
    const l = scoreCandidate(
      cand({ id: 'b', importance: 'low', isNewsletter: true, ageHours: 500 }),
      ctx(),
    );
    expect(c.score).toBeGreaterThanOrEqual(750);
    expect(c.score).toBeLessThanOrEqual(1000);
    expect(l.score).toBeGreaterThanOrEqual(0);
    expect(l.score).toBeLessThan(250);
  });
  it('English locale variants', () => {
    const r = scoreCandidate(
      cand({
        id: 'a',
        senderEmail: 'ahmet@musteri.com',
        requiresUserAction: true,
        deadlineAt: '2026-09-04T14:00:00.000Z',
      }),
      ctx({ locale: 'en', vips: [vip('Ahmet Yılmaz', 'ahmet@musteri.com')] }),
    );
    expect(r.reasons).toContain('Reply requested by today 17:00');
    expect(r.reasons).toContain('VIP: Ahmet Yılmaz');
  });
});

describe('priority · ranking and selection', () => {
  it('rankCandidates is deterministic: tier, score, earliest deadline, freshness, id', () => {
    const items = [
      cand({ id: 'newsletter', importance: 'high', isNewsletter: true }),
      cand({
        id: 'deadline-late',
        importance: 'normal',
        requiresUserAction: true,
        deadlineAt: '2026-09-05T14:00:00.000Z',
      }),
      cand({
        id: 'deadline-soon',
        importance: 'normal',
        requiresUserAction: true,
        deadlineAt: '2026-09-04T14:00:00.000Z',
      }),
      cand({ id: 'plain', importance: 'normal' }),
      cand({ id: 'muted', importance: 'critical', senderEmail: 'x@muted.com' }),
      cand({ id: 'security', category: 'security', importance: 'critical' }),
    ];
    const ranked = rankCandidates(items, ctx({ rules: [rule('mute_sender', 'x@muted.com')] }));
    expect(ranked.map((r) => r.candidate.id)).toEqual([
      'deadline-soon',
      'security',
      'deadline-late',
      'plain',
      'newsletter',
      'muted',
    ]);
    const again = rankCandidates(
      [...items].reverse(),
      ctx({ rules: [rule('mute_sender', 'x@muted.com')] }),
    );
    expect(again.map((r) => r.candidate.id)).toEqual(ranked.map((r) => r.candidate.id));
  });
  it('selectTopPriorities keeps diversity across threads and people', () => {
    const items: PriorityCandidate[] = [];
    for (let i = 0; i < 6; i++)
      items.push(
        cand({
          id: `ahmet-${i}`,
          importance: 'critical',
          senderEmail: 'ahmet@musteri.com',
          threadId: i < 3 ? 't-1' : `t-${i}`,
          ageHours: i,
        }),
      );
    items.push(
      cand({ id: 'elif', importance: 'high', senderEmail: 'elif@firma.com', threadId: 't-9' }),
    );
    items.push(
      cand({
        id: 'mehmet',
        importance: 'normal',
        senderEmail: 'mehmet@firma.com',
        threadId: 't-10',
      }),
    );
    items.push(
      cand({ id: 'promo', importance: 'low', isPromotion: true, senderEmail: 'promo@shop.com' }),
    );
    const ranked = rankCandidates(items, ctx());
    const top = selectTopPriorities(ranked, { max: 5 });
    const ids = top.map((r) => r.candidate.id);
    expect(ids).toHaveLength(5);
    expect(ids.filter((id) => id.startsWith('ahmet'))).toHaveLength(2);
    expect(new Set(top.map((r) => r.candidate.threadId)).size).toBe(5);
    expect(ids).toContain('elif');
    expect(ids).toContain('mehmet');
    expect(ids).toContain('promo');
  });
  it('selectTopPriorities relaxes the person cap (never the thread cap) when nobody else is left', () => {
    const items: PriorityCandidate[] = [];
    for (let i = 0; i < 6; i++)
      items.push(
        cand({
          id: `ahmet-${i}`,
          importance: 'critical',
          senderEmail: 'ahmet@musteri.com',
          threadId: i < 2 ? 't-1' : `t-${i}`,
          ageHours: i,
        }),
      );
    items.push(
      cand({ id: 'elif', importance: 'high', senderEmail: 'elif@firma.com', threadId: 't-9' }),
    );
    const top = selectTopPriorities(rankCandidates(items, ctx()), { max: 5 });
    const ids = top.map((r) => r.candidate.id);
    expect(ids).toHaveLength(5);
    expect(ids).toContain('elif');
    expect(ids).not.toContain('ahmet-1');
    expect(new Set(top.map((r) => r.candidate.threadId)).size).toBe(5);
  });
  it('selectTopPriorities never returns muted items and respects max', () => {
    const items = [
      cand({ id: 'a', senderEmail: 'x@muted.com' }),
      cand({ id: 'b' }),
      cand({ id: 'c' }),
    ];
    const top = selectTopPriorities(
      rankCandidates(items, ctx({ rules: [rule('mute_sender', 'x@muted.com')] })),
      { max: 2 },
    );
    expect(top.map((r) => r.candidate.id)).toEqual(['b', 'c']);
  });
});

describe('priority · feedback', () => {
  const entity = {
    entityType: 'email_thread' as const,
    entityId: 'e-1',
    contactId: 'c-1',
    senderEmail: 'Ahmet@Musteri.com',
    senderName: 'Ahmet Yılmaz',
    category: 'information' as const,
  };
  it('learns from not_important / important when learning is on', () => {
    const plan = applyFeedback('not_important', { learnFromInteractions: true, entity, now });
    expect(plan.learnedUpserts).toEqual([
      {
        kind: 'person_priority',
        subjectKey: 'c-1',
        weightDelta: -0.35,
        statement: 'Ahmet Yılmaz daha az öncelikli.',
      },
      {
        kind: 'category_priority',
        subjectKey: 'information',
        weightDelta: -0.15,
        statement: 'Bilgi kategorisi daha az önemli.',
      },
    ]);
    expect(plan.ruleSuggestions).toHaveLength(0);
    expect(plan.ack).toBe('Öğrendim · Bunu daha az öne çıkaracağım');
    const up = applyFeedback('important', { learnFromInteractions: true, entity, now });
    expect(up.learnedUpserts[0]?.weightDelta).toBe(0.35);
  });
  it('suggests explicit rules instead when learning is off', () => {
    const plan = applyFeedback('important', { learnFromInteractions: false, entity, now });
    expect(plan.learnedUpserts).toHaveLength(0);
    expect(plan.ruleSuggestions[0]).toMatchObject({
      type: 'sender_important',
      value: 'ahmet@musteri.com',
    });
    const promo = applyFeedback('not_important', {
      learnFromInteractions: false,
      entity: { ...entity, category: 'promotion' },
      now,
    });
    expect(promo.ruleSuggestions[0]?.type).toBe('promotions_low');
    const less = applyFeedback('show_less', { learnFromInteractions: false, entity, now });
    expect(less.ruleSuggestions[0]?.type).toBe('mute_sender');
  });
  it('make_vip always produces a VipPerson upsert and a personal ack', () => {
    const plan = applyFeedback('make_vip', { learnFromInteractions: false, entity, now });
    expect(plan.vipUpserts).toEqual([
      {
        displayName: 'Ahmet Yılmaz',
        email: 'ahmet@musteri.com',
        contactId: 'c-1',
        notifyAlways: true,
      },
    ]);
    expect(plan.ack).toBe('Ahmet Yılmaz artık VIP.');
    const noPerson = applyFeedback('make_vip', {
      learnFromInteractions: true,
      entity: { entityType: 'life_event', entityId: 'le-1' },
      now,
    });
    expect(noPerson.vipUpserts).toHaveLength(0);
    expect(noPerson.ack).toBe('Bu kartta VIP yapılacak bir kişi yok.');
  });
  it('stop_following closes the follow-up and records a dismiss pattern', () => {
    const plan = applyFeedback('stop_following', {
      learnFromInteractions: true,
      entity: { ...entity, entityType: 'follow_up', entityId: 'fu-7' },
      now,
    });
    expect(plan.followUpUpdates).toEqual([{ followUpId: 'fu-7', status: 'closed' }]);
    expect(plan.learnedUpserts[0]).toMatchObject({ kind: 'dismiss_pattern', subjectKey: 'c-1' });
    expect(plan.ack).toBe('Takip kapatıldı · Bunu bir daha hatırlatmam');
  });
  it('correct / wrong nudge category weights and speak English when asked', () => {
    const ok = applyFeedback('correct', { learnFromInteractions: true, entity, now, locale: 'en' });
    expect(ok.learnedUpserts[0]).toMatchObject({ kind: 'category_priority', weightDelta: 0.1 });
    expect(ok.ack).toBe('Thanks · I will keep doing this');
    const bad = applyFeedback('wrong', { learnFromInteractions: true, entity, now });
    expect(bad.learnedUpserts.map((u) => u.weightDelta)).toEqual([-0.2, -0.1]);
  });
});
