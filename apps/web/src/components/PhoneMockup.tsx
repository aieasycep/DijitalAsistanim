import { type Dictionary } from '@/i18n';
import { CalendarIcon, FeedIcon, MailIcon, PlayIcon, SparkleIcon, SunIcon } from './Icons';

const toneClass = {
  critical: 'badge badge-critical',
  neutral: 'badge badge-neutral',
  deadline: 'badge badge-deadline',
} as const;

/** The Today screen, built from real DOM and tokens — no images. */
export function PhoneMockup({ t }: { t: Dictionary }) {
  const p = t.phone;
  return (
    <div className="phone" role="img" aria-label={t.hero.phoneLabel}>
      <div className="phone-screen">
        <div className="status-bar" aria-hidden="true">
          <span>{p.time}</span>
          <span className="status-glyphs">
            <span className="status-signal" />
            <span className="status-battery" />
          </span>
        </div>
        <div className="today-header">
          <div>
            <div className="kicker">{p.date}</div>
            <div className="today-title">{p.greeting}</div>
          </div>
          <div className="avatar avatar-ink">{p.avatar}</div>
        </div>
        <div className="hero-card">
          <div className="ai-kicker">
            <SparkleIcon size={14} />
            <span>{p.briefKicker}</span>
          </div>
          <div className="hero-card-title">
            {p.briefTitleBefore}
            <span className="accent">{p.briefCount}</span>
            {p.briefTitleAfter}
          </div>
          <div className="hero-card-meta">{p.briefMeta}</div>
          <div className="hero-card-actions">
            <span className="mini-btn mini-btn-primary">{p.ctaSee}</span>
            <span className="mini-btn mini-btn-soft">
              <PlayIcon size={16} />
              {p.ctaListen}
            </span>
          </div>
        </div>
        <div className="kicker section-kicker">{p.priorities}</div>
        <div className="priority-list">
          {p.cards.map((c) => (
            <div className="priority-card" key={c.badge}>
              <div className="priority-row">
                <span className={toneClass[c.tone]}>{c.badge}</span>
                <span className="caption">{c.time}</span>
              </div>
              <div className="priority-title">{c.title}</div>
              <div className="source-line">
                {c.tone === 'neutral' ? <CalendarIcon size={13} /> : <MailIcon size={13} />}
                <span>{c.source}</span>
              </div>
            </div>
          ))}
        </div>
        <div className="tab-bar" aria-hidden="true">
          {p.tabs.map((label, i) => (
            <span key={label} className={i === 0 ? 'tab tab-active' : 'tab'}>
              {i === 0 && <SunIcon size={18} />}
              {i === 1 && <FeedIcon size={18} />}
              {i === 2 && <CalendarIcon size={18} />}
              {i === 3 && <SparkleIcon size={18} />}
              <span>{label}</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
