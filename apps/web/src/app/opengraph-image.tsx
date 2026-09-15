import { ImageResponse } from 'next/og';
import { getDictionary } from '@/i18n';
import { getLang } from '@/i18n/server';

export const alt = 'Dijital Asistan';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function OpenGraphImage() {
  const lang = await getLang();
  const t = getDictionary(lang);
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '72px 80px',
        background: 'linear-gradient(160deg, #1E1E4C 0%, #3B3CA8 58%, #7071EA 100%)',
        color: '#FFFFFF',
        fontFamily: 'sans-serif',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
        <div
          style={{
            width: 72,
            height: 72,
            borderRadius: 22,
            background: '#FFFFFF',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <svg width="40" height="40" viewBox="0 0 24 24" fill="#5B5CE2">
            <path d="M12 2.5c.6 4.6 2.9 6.9 7.5 7.5-4.6.6-6.9 2.9-7.5 7.5-.6-4.6-2.9-6.9-7.5-7.5 4.6-.6 6.9-2.9 7.5-7.5Z" />
            <path d="M19 15c.3 1.9 1.1 2.7 3 3-1.9.3-2.7 1.1-3 3-.3-1.9-1.1-2.7-3-3 1.9-.3 2.7-1.1 3-3Z" />
          </svg>
        </div>
        <div style={{ fontSize: 36, fontWeight: 600, letterSpacing: -0.5 }}>{t.meta.siteName}</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        <div
          style={{
            fontSize: 68,
            fontWeight: 600,
            lineHeight: 1.08,
            letterSpacing: -2,
            maxWidth: 1000,
          }}
        >
          {t.meta.tagline}
        </div>
        <div style={{ fontSize: 28, color: 'rgba(255,255,255,0.75)' }}>{t.meta.ogSubtitle}</div>
      </div>
    </div>,
    { ...size },
  );
}
