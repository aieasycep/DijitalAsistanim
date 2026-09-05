'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { type Lang } from '@/i18n';
import { GlobeIcon } from './Icons';

interface Props {
  to: Lang;
  label: string;
  ariaLabel: string;
  className?: string;
}

function LangLink({ to, label, ariaLabel, className }: Props) {
  const pathname = usePathname();
  const search = useSearchParams();
  const query = search.toString();
  const next = query ? `${pathname}?${query}` : pathname;
  return (
    <a
      className={className}
      href={`/lang?to=${to}&next=${encodeURIComponent(next)}`}
      hrefLang={to}
      lang={to}
      aria-label={ariaLabel}
      rel="nofollow"
    >
      <GlobeIcon size={16} />
      <span>{label}</span>
    </a>
  );
}

/** Language toggle. Persists the choice through the /lang route handler (cookie), no client state. */
export function LangSwitch(props: Props) {
  return (
    <Suspense
      fallback={
        <a
          className={props.className}
          href={`/lang?to=${props.to}&next=%2F`}
          hrefLang={props.to}
          lang={props.to}
          rel="nofollow"
        >
          <GlobeIcon size={16} />
          <span>{props.label}</span>
        </a>
      }
    >
      <LangLink {...props} />
    </Suspense>
  );
}
