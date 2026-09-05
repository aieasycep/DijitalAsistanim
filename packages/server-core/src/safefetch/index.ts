/**
 * safefetch — SSRF-safe fetching of user-supplied links (Universal Capture) plus
 * readable-text extraction from HTML.
 */
export type { BlockedIpReason, IpClassification } from './ip';
export { classifyIPv4, classifyIPv6, classifyIp, isIpLiteral, parseIPv4, parseIPv6 } from './ip';
export type { SafeFetchRejectReason, UrlPolicy, UrlValidation } from './url';
export {
  DEFAULT_ALLOWED_PORTS,
  isBlockedHostname,
  validateOutboundUrl,
  validateResolvedAddresses,
} from './url';
export type {
  DnsResolver,
  FetchLike,
  SafeFetchFailure,
  SafeFetchOptions,
  SafeFetchResult,
  SafeFetchSuccess,
} from './fetch';
export {
  DEFAULT_ALLOWED_CONTENT_TYPES,
  DEFAULT_SAFE_FETCH_MAX_BYTES,
  DEFAULT_SAFE_FETCH_MAX_REDIRECTS,
  DEFAULT_SAFE_FETCH_TIMEOUT_MS,
  parseContentType,
  safeFetch,
  safeFetchError,
  safeFetchOrThrow,
} from './fetch';
export type { ReadableText, ReadableTextOptions } from './readable';
export { collapseWhitespace, decodeHtmlEntities, extractReadableText } from './readable';
