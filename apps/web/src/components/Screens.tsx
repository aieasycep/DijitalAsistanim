import { type Dictionary } from '@/i18n';
import {
  BoltIcon,
  CarIcon,
  ClockIcon,
  HeadphonesIcon,
  MailIcon,
  PhoneCallIcon,
  SparkleIcon,
} from './Icons';

/** Editorial briefing card (ad/03 composition) — Lora body, dark CTA. */
export function BriefingCard({ t }: { t: Dictionary }) {
  const b = t.briefing;
  return (
    <div className="screen screen-paper">
      <div className="ai-kicker">
        <SparkleIcon size={14} />
        <span>{b.cardKicker}</span>
      </div>
      <div className="brief-greeting">{b.cardGreeting}</div>
      <p className="editorial">{b.cardBody}</p>
      <span className="mini-btn mini-btn-dark mini-btn-block">
        <HeadphonesIcon size={18} />
        {b.cardCta}
      </span>
    </div>
  );
}

/** Mail intelligence summary (store/02). */
export function MailScreen({ t }: { t: Dictionary }) {
  const m = t.mail;
  return (
    <div className="screen">
      <div className="stat-row">
        <span className="stat-number">{m.count}</span>
        <span className="stat-label">{m.countLabel}</span>
      </div>
      <div className="stat-line">
        {m.attentionBefore}
        <span className="accent">{m.attentionCount}</span>
        {m.attentionAfter}
      </div>
      <div className="segment-bar" aria-hidden="true">
        <span className="segment segment-primary" style={{ width: '5%' }} />
        <span className="segment segment-mid" style={{ width: '37%' }} />
        <span className="segment segment-noise" style={{ width: '58%' }} />
      </div>
      {m.cards.map((c) => (
        <div className="mail-card" key={c.initials}>
          <div className="mail-row">
            <span className={`avatar avatar-sm avatar-${c.tint}`}>{c.initials}</span>
            <span className="mail-name">{c.name}</span>
            {c.badge && <span className="badge badge-critical">{c.badge}</span>}
            {c.meta && <span className="caption">{c.meta}</span>}
          </div>
          <p className="mail-body">{c.summary}</p>
        </div>
      ))}
    </div>
  );
}

/** Meeting prep (store/03). */
export function MeetingScreen({ t }: { t: Dictionary }) {
  const m = t.meeting;
  return (
    <div className="screen">
      <div className="prep-top">
        <span className="kicker">{m.screenKicker}</span>
        <span className="chip chip-warning">
          <ClockIcon size={14} />
          {m.countdown}
        </span>
      </div>
      <div className="person-row">
        <span className="avatar avatar-lg avatar-blue">MY</span>
        <div>
          <div className="person-name">{m.person}</div>
          <div className="secondary">{m.personMeta}</div>
        </div>
      </div>
      <div className="dark-card">
        <div className="ai-kicker ai-kicker-glow">
          <SparkleIcon size={14} />
          <span>{m.aiKicker}</span>
        </div>
        <ol className="points">
          {m.points.map((pt, i) => (
            <li key={pt.title}>
              <span className="point-num">{i + 1}</span>
              <span>
                <span className="point-title">{pt.title}</span>
                <span className="point-detail">{pt.detail}</span>
              </span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

/** Plan tab with calendar intelligence (store/05). */
export function PlanScreen({ t }: { t: Dictionary }) {
  const p = t.planning;
  return (
    <div className="screen">
      <div className="screen-title">{p.screenTitle}</div>
      <div className="insight-card insight-card-ai">
        <div className="ai-kicker">
          <SparkleIcon size={14} />
          <span>{p.aiKicker}</span>
        </div>
        <div className="insight-title">{p.aiTitle}</div>
        <div className="secondary">{p.aiDetail}</div>
        <span className="mini-btn mini-btn-primary mini-btn-inline">{p.aiCta}</span>
      </div>
      {p.insights.map((ins) => (
        <div className="insight-row" key={ins.title}>
          <span
            className={
              ins.tone === 'warning' ? 'insight-icon tone-warning' : 'insight-icon tone-info'
            }
          >
            {ins.tone === 'warning' ? <BoltIcon size={18} /> : <CarIcon size={18} />}
          </span>
          <span>
            <span className="insight-row-title">{ins.title}</span>
            <span className="insight-row-detail">{ins.detail}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

/** Assistant chat with sources (store/06). */
export function AssistantScreen({ t }: { t: Dictionary }) {
  const m = t.memory;
  return (
    <div className="screen">
      <div className="screen-title">{m.screenTitle}</div>
      <div className="bubble bubble-user">{m.user}</div>
      <div className="bubble bubble-assistant">{m.assistant}</div>
      <div className="sources-card">
        <div className="kicker">{m.sourcesKicker}</div>
        {m.sources.map((s) => (
          <div className="source-row" key={s.label}>
            {s.kind === 'mail' ? <MailIcon size={16} /> : <PhoneCallIcon size={16} />}
            <span className="source-label">{s.label}</span>
            <span className="caption">{s.date}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
