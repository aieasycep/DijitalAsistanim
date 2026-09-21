import { serverEnv } from '@/lib/env';

export const dynamic = 'force-dynamic';

/**
 * Apple App Site Association — Universal Links for https://<host>/app/* and /referral/*.
 * Built from APPLE_TEAM_ID + IOS_BUNDLE_ID. Without a team id the structure stays valid with no app ids.
 */
export function GET(): Response {
  const env = serverEnv();
  const appIDs = env.appleTeamId ? [`${env.appleTeamId}.${env.iosBundleId}`] : [];
  const body = {
    applinks: {
      details: [
        {
          appIDs,
          components: [{ '/': '/app/*' }, { '/': '/referral/*' }],
        },
      ],
    },
    webcredentials: { apps: appIDs },
  };
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=3600, must-revalidate',
    },
  });
}
