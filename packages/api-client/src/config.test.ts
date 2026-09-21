import { describe, expect, it } from 'vitest';
import { resolveMode } from './config';
import { ClientApiError, errorKey } from './errors';

describe('data source mode', () => {
  it('never allows demo in production', () => {
    expect(resolveMode({ requested: 'demo', isProduction: true, hasSupabase: true })).toBe(
      'supabase',
    );
    expect(resolveMode({ requested: 'demo', isProduction: true, hasSupabase: false })).toBe(
      'supabase',
    );
  });
  it('honours explicit request in development', () => {
    expect(resolveMode({ requested: 'demo', isProduction: false, hasSupabase: true })).toBe('demo');
    expect(resolveMode({ requested: 'supabase', isProduction: false, hasSupabase: true })).toBe(
      'supabase',
    );
  });
  it('falls back to demo when no backend configured', () => {
    expect(resolveMode({ requested: null, isProduction: false, hasSupabase: false })).toBe('demo');
    expect(resolveMode({ requested: null, isProduction: false, hasSupabase: true })).toBe(
      'supabase',
    );
  });
});

describe('errors', () => {
  it('maps codes to i18n keys', () => {
    expect(errorKey(new ClientApiError({ code: 'offline', message: 'x' }))).toBe('errors.offline');
    expect(errorKey(new TypeError('Network request failed'))).toBe('errors.offline');
    expect(errorKey(new Error('boom'))).toBe('common.genericError');
    expect(errorKey({ code: 'scope_required', message: 'x' })).toBe('approvals.scopeNeeded');
  });
});
