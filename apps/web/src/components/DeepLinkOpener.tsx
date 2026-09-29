'use client';

import { useEffect } from 'react';

/**
 * On mobile user agents, attempt to open the app via its custom scheme once the page is ready.
 * Desktop visitors keep the page; the visible "open in app" button always remains as a manual path.
 */
export function DeepLinkOpener({ href }: { href: string }) {
  useEffect(() => {
    const ua = navigator.userAgent;
    const isMobile = /iPhone|iPad|iPod|Android/i.test(ua);
    if (!isMobile) return;
    const timer = window.setTimeout(() => {
      window.location.href = href;
    }, 350);
    return () => window.clearTimeout(timer);
  }, [href]);
  return null;
}
