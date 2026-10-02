import { describe, expect, it } from 'vitest';
import { resolveMode } from './config';
import { ClientApiError } from './errors';

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
  it('normalises thrown values to ClientApiError codes', () => {
    expect(ClientApiError.from(new ClientApiError({ code: 'offline', message: 'x' })).code).toBe(
      'offline',
    );
    expect(ClientApiError.from(new TypeError('Network request failed')).code).toBe('offline');
    expect(ClientApiError.from(new Error('boom')).code).toBe('internal');
    expect(ClientApiError.from({ code: 'scope_required', message: 'x' }).code).toBe(
      'scope_required',
    );
    expect(ClientApiError.from({ code: 'made_up', message: 'x' }).code).toBe('internal');
  });
});
