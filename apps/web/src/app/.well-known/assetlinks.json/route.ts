import { serverEnv } from '@/lib/env';

export const dynamic = 'force-dynamic';

/**
 * Android Digital Asset Links — App Links for this host.
 * Built from ANDROID_PACKAGE + ANDROID_SHA256_CERT_FINGERPRINTS (comma separated). Without
 * fingerprints the structure stays valid with an empty list.
 */
export function GET(): Response {
  const env = serverEnv();
  const body = [
    {
      relation: ['delegate_permission/common.handle_all_urls'],
      target: {
        namespace: 'android_app',
        package_name: env.androidPackage,
        sha256_cert_fingerprints: env.androidSha256Fingerprints,
      },
    },
  ];
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=3600, must-revalidate',
    },
  });
}
