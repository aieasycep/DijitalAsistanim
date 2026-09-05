import { publicEnv } from './env';

/** Primary CTA: always lands on the download section, which either shows store badges or the beta path. */
export function ctaHref(): string {
  return '/#download';
}

export function hasStoreLinks(): boolean {
  return Boolean(publicEnv.appStoreUrl || publicEnv.playStoreUrl);
}

export function betaMailto(subject: string, email: string): string {
  return `mailto:${email}?subject=${encodeURIComponent(subject)}`;
}
