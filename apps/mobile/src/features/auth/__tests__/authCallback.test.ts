import type { AuthSession, DataSource } from '@da/api-client';
import { authCallbackCode, completeAuthCallback } from '../authCallback';

const SESSION: AuthSession = {
  user: {
    id: 'user-1',
    email: 'yunus@example.com',
    displayName: 'Yunus',
    avatarUrl: null,
    provider: 'google',
  },
  accessToken: 'at',
  expiresAt: new Date(Date.now() + 3600_000).toISOString(),
};

function fakeSource(exchange: jest.Mock): DataSource {
  return { auth: { exchangeCodeForSession: exchange } } as unknown as DataSource;
}

const URL_A = 'dijitalasistan://auth/callback?code=a0aa735e-5247-44de-af5e-b3f28141df48';
const URL_B = 'dijitalasistan://auth/callback?code=other-code';

describe('authCallbackCode', () => {
  it('reads the code from the query or the fragment and rejects empty values', () => {
    expect(authCallbackCode(URL_A)).toBe('a0aa735e-5247-44de-af5e-b3f28141df48');
    expect(authCallbackCode('dijitalasistan://auth/callback#code=frag&access_token=x')).toBe(
      'frag',
    );
    expect(authCallbackCode('dijitalasistan://auth/callback?code=%20')).toBeNull();
    expect(authCallbackCode('dijitalasistan://auth/callback?error=access_denied')).toBeNull();
  });
});

describe('completeAuthCallback', () => {
  it('exchanges a code once and hands the same promise to concurrent and later callers', async () => {
    const exchange = jest.fn(async () => SESSION);
    const ds = fakeSource(exchange);

    const [first, second] = await Promise.all([
      completeAuthCallback(ds, URL_A),
      completeAuthCallback(ds, URL_A),
    ]);
    const third = await completeAuthCallback(ds, URL_A);

    expect(exchange).toHaveBeenCalledTimes(1);
    expect(exchange).toHaveBeenCalledWith(URL_A);
    expect(first).toBe(SESSION);
    expect(second).toBe(SESSION);
    expect(third).toBe(SESSION);
  });

  it('exchanges different codes and different data sources separately', async () => {
    const exchangeA = jest.fn(async () => SESSION);
    const exchangeB = jest.fn(async () => SESSION);
    const dsA = fakeSource(exchangeA);
    const dsB = fakeSource(exchangeB);

    await completeAuthCallback(dsA, URL_A);
    await completeAuthCallback(dsA, URL_B);
    await completeAuthCallback(dsB, URL_A);

    expect(exchangeA).toHaveBeenCalledTimes(2);
    expect(exchangeB).toHaveBeenCalledTimes(1);
  });

  it('forgets a failed exchange so the next attempt runs again, and passes code-less URLs straight through', async () => {
    const exchange = jest
      .fn<Promise<AuthSession>, [string]>()
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce(SESSION);
    const ds = fakeSource(exchange);

    await expect(completeAuthCallback(ds, URL_A)).rejects.toThrow('network');
    await expect(completeAuthCallback(ds, URL_A)).resolves.toBe(SESSION);
    expect(exchange).toHaveBeenCalledTimes(2);

    exchange.mockRejectedValue(new Error('no code'));
    const errorUrl = 'dijitalasistan://auth/callback?error=access_denied';
    await expect(completeAuthCallback(ds, errorUrl)).rejects.toThrow('no code');
    await expect(completeAuthCallback(ds, errorUrl)).rejects.toThrow('no code');
    expect(exchange).toHaveBeenCalledTimes(4);
  });
});
