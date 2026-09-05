/**
 * Tiny URL helpers that do not depend on WHATWG `URL` / `URLSearchParams` — React Native's polyfills of those
 * are incomplete (no `searchParams`, no `get`), so query strings are built and parsed by hand.
 */

/**
 * Serialises a plain object into a query string. `undefined`/`null` values are skipped, arrays become repeated
 * keys, nested objects are JSON-encoded, everything else is stringified.
 */
export function buildQuery(params: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    const values = Array.isArray(value) ? value : [value];
    for (const v of values) {
      if (v === undefined || v === null) continue;
      const text = typeof v === 'object' ? JSON.stringify(v) : String(v);
      parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(text)}`);
    }
  }
  return parts.join('&');
}

/**
 * Reads query (`?a=b`) and fragment (`#a=b`) parameters from a URL / deep link. Query parameters win over
 * fragment parameters with the same name. Malformed percent-encoding is returned verbatim.
 */
export function parseQueryParams(url: string): Record<string, string> {
  const hashIndex = url.indexOf('#');
  const fragment = hashIndex >= 0 ? url.slice(hashIndex + 1) : '';
  const beforeHash = hashIndex >= 0 ? url.slice(0, hashIndex) : url;
  const queryIndex = beforeHash.indexOf('?');
  const query = queryIndex >= 0 ? beforeHash.slice(queryIndex + 1) : '';
  return { ...parsePairs(fragment), ...parsePairs(query) };
}

function parsePairs(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!raw) return out;
  for (const pair of raw.split('&')) {
    if (!pair) continue;
    const eq = pair.indexOf('=');
    const key = decode(eq >= 0 ? pair.slice(0, eq) : pair);
    const value = eq >= 0 ? decode(pair.slice(eq + 1)) : '';
    if (key) out[key] = value;
  }
  return out;
}

function decode(component: string): string {
  const spaced = component.replace(/\+/g, ' ');
  try {
    return decodeURIComponent(spaced);
  } catch {
    return spaced;
  }
}
