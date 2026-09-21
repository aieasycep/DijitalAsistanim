/**
 * MIME helpers for the mail adapters: RFC 5322 message building for Gmail `raw` sends,
 * base64url / quoted-printable decoding, RFC 2047 encoded-word handling, address-list parsing,
 * HTML→text and quoted-reply stripping. Web APIs only (TextEncoder/TextDecoder, btoa/atob).
 */
import type { EmailParticipant } from '@da/domain';
import { base64UrlToBytes, bytesToBase64, bytesToBase64Url, utf8Encode } from '../crypto/encoding';
import { randomHex } from '../crypto/random';
import { collapseWhitespace, decodeHtmlEntities, extractReadableText } from '../safefetch/readable';
import type { SendMailInput } from './types';

const CRLF = '\r\n';
const BASE64_LINE = 76;
/** Bytes per encoded-word chunk so `=?UTF-8?B?…?=` stays under the 75-char RFC 2047 limit. */
const ENCODED_WORD_BYTES = 42;
const HTML_TEXT_MAX_LENGTH = 200_000;

// --- Encoding primitives -----------------------------------------------------------------------

/** base64url (no padding) of the UTF-8 bytes of `text` — the Gmail `raw` format. */
export function encodeBase64Url(text: string): string {
  return bytesToBase64Url(utf8Encode(text));
}

function decodeBytes(bytes: Uint8Array, charset: string | null | undefined): string {
  const label =
    (charset ?? 'utf-8')
      .trim()
      .replace(/^["']|["']$/g, '')
      .toLowerCase() || 'utf-8';
  try {
    return new TextDecoder(label).decode(bytes);
  } catch {
    return new TextDecoder('utf-8').decode(bytes);
  }
}

/** Decode base64url or standard base64 (whitespace tolerated) to text in the given charset. */
export function decodeBase64Url(data: string, charset: string | null = 'utf-8'): string {
  const compact = data.replace(/\s+/g, '').replace(/=+$/, '');
  if (compact === '') return '';
  // base64UrlToBytes maps -_ to +/ and re-pads, so unpadded standard base64 decodes too.
  return decodeBytes(base64UrlToBytes(compact), charset);
}

/** Decode a quoted-printable body (RFC 2045 §6.7): soft line breaks and `=XX` escapes. */
export function decodeQuotedPrintable(input: string, charset: string | null = 'utf-8'): string {
  const joined = input.replace(/=\r?\n/g, '');
  const bytes: number[] = [];
  for (let i = 0; i < joined.length; i++) {
    const ch = joined.charCodeAt(i);
    if (ch === 0x3d /* = */) {
      const hex = joined.slice(i + 1, i + 3);
      if (/^[0-9A-Fa-f]{2}$/.test(hex)) {
        bytes.push(Number.parseInt(hex, 16));
        i += 2;
        continue;
      }
    }
    bytes.push(ch & 0xff);
  }
  return decodeBytes(Uint8Array.from(bytes), charset);
}

function decodeQEncoding(text: string, charset: string): string {
  return decodeQuotedPrintable(text.replace(/_/g, ' '), charset);
}

/** Decode RFC 2047 encoded words (`=?UTF-8?B?…?=` / `=?ISO-8859-9?Q?…?=`) inside a header value. */
export function decodeEncodedWords(header: string): string {
  return header
    .replace(/(\?=)\s+(=\?)/g, '$1$2')
    .replace(
      /=\?([^?\s]+)\?([bBqQ])\?([^?\s]*)\?=/g,
      (match, charset: string, encoding: string, payload: string) => {
        try {
          return encoding.toUpperCase() === 'B'
            ? decodeBase64Url(payload, charset)
            : decodeQEncoding(payload, charset);
        } catch {
          return match;
        }
      },
    );
}

function isAscii(text: string): boolean {
  return /^[\x20-\x7e]*$/.test(text);
}

/** Encode `text` as one or more base64 encoded words joined with folding whitespace. */
export function encodeHeaderText(text: string): string {
  if (isAscii(text)) return text;
  const words: string[] = [];
  let chunk = '';
  let chunkBytes = 0;
  for (const ch of text) {
    const size = utf8Encode(ch).length;
    if (chunkBytes + size > ENCODED_WORD_BYTES && chunk !== '') {
      words.push(`=?UTF-8?B?${bytesToBase64(utf8Encode(chunk))}?=`);
      chunk = '';
      chunkBytes = 0;
    }
    chunk += ch;
    chunkBytes += size;
  }
  if (chunk !== '') words.push(`=?UTF-8?B?${bytesToBase64(utf8Encode(chunk))}?=`);
  return words.join(`${CRLF} `);
}

const NEEDS_QUOTING = /[()<>[\]:;@\\,."]/;

function formatDisplayName(name: string): string {
  if (!isAscii(name)) return encodeHeaderText(name);
  if (NEEDS_QUOTING.test(name)) return `"${name.replace(/(["\\])/g, '\\$1')}"`;
  return name;
}

/** `Name <address>` or bare address, with non-ASCII names RFC 2047 encoded. */
export function formatMailbox(participant: EmailParticipant): string {
  const email = participant.email.trim();
  const name = participant.name?.trim();
  return name ? `${formatDisplayName(name)} <${email}>` : email;
}

function wrapBase64(base64: string): string {
  const lines: string[] = [];
  for (let i = 0; i < base64.length; i += BASE64_LINE) lines.push(base64.slice(i, i + BASE64_LINE));
  return lines.join(CRLF);
}

function textPart(mimeType: string, content: string): string {
  return [
    `Content-Type: ${mimeType}; charset="UTF-8"`,
    'Content-Transfer-Encoding: base64',
    '',
    wrapBase64(bytesToBase64(utf8Encode(content))),
  ].join(CRLF);
}

function angle(id: string): string {
  const trimmed = id.trim();
  return trimmed.startsWith('<') ? trimmed : `<${trimmed}>`;
}

function rfc5322Date(date: Date): string {
  return date.toUTCString().replace(/GMT$/, '+0000');
}

export interface RawMessageInput extends SendMailInput {
  /** Sender mailbox; omitted → the provider fills it in from the authenticated account. */
  from?: string | null;
  /** RFC Message-ID of the answered message (already resolved by the client). */
  inReplyToMessageId?: string | null;
  date?: Date;
  /** Fixed multipart boundary (tests); random otherwise. */
  boundary?: string;
}

/** Build an RFC 5322 message (CRLF line endings) ready to be base64url-encoded for Gmail. */
export function buildRawMessage(input: RawMessageInput): string {
  const headers: string[] = [];
  if (input.from) {
    headers.push(`From: ${formatMailbox({ name: input.fromName ?? null, email: input.from })}`);
  }
  headers.push(`To: ${input.to.map(formatMailbox).join(`,${CRLF} `)}`);
  if (input.cc?.length) headers.push(`Cc: ${input.cc.map(formatMailbox).join(`,${CRLF} `)}`);
  if (input.bcc?.length) headers.push(`Bcc: ${input.bcc.map(formatMailbox).join(`,${CRLF} `)}`);
  headers.push(`Subject: ${encodeHeaderText(input.subject.replace(/[\r\n]+/g, ' '))}`);
  headers.push(`Date: ${rfc5322Date(input.date ?? new Date())}`);
  if (input.inReplyToMessageId) headers.push(`In-Reply-To: ${angle(input.inReplyToMessageId)}`);
  const references = (input.references ?? []).map(angle);
  if (input.inReplyToMessageId && !references.includes(angle(input.inReplyToMessageId))) {
    references.push(angle(input.inReplyToMessageId));
  }
  if (references.length > 0) headers.push(`References: ${references.join(`${CRLF} `)}`);
  headers.push('MIME-Version: 1.0');

  const html = input.bodyHtml?.trim();
  if (html) {
    const boundary = input.boundary ?? `=_da_${randomHex(12)}`;
    headers.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
    return [
      ...headers,
      '',
      `--${boundary}`,
      textPart('text/plain', input.bodyText),
      `--${boundary}`,
      textPart('text/html', html),
      `--${boundary}--`,
      '',
    ].join(CRLF);
  }
  return [...headers, textPart('text/plain', input.bodyText), ''].join(CRLF);
}

// --- Address lists -----------------------------------------------------------------------------

/** Split on commas/semicolons that are outside quotes, comments and angle brackets. */
function splitAddresses(header: string): string[] {
  const parts: string[] = [];
  let current = '';
  let quoted = false;
  let depthComment = 0;
  let inAngle = false;
  for (let i = 0; i < header.length; i++) {
    const ch = header[i] as string;
    if (quoted) {
      current += ch;
      if (ch === '\\' && i + 1 < header.length) {
        current += header[i + 1];
        i++;
      } else if (ch === '"') quoted = false;
      continue;
    }
    if (ch === '"') {
      quoted = true;
      current += ch;
    } else if (ch === '(') {
      depthComment++;
    } else if (ch === ')' && depthComment > 0) {
      depthComment--;
    } else if (depthComment > 0) {
      continue;
    } else if (ch === '<') {
      inAngle = true;
      current += ch;
    } else if (ch === '>') {
      inAngle = false;
      current += ch;
    } else if ((ch === ',' || ch === ';') && !inAngle) {
      parts.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  parts.push(current);
  return parts.map((p) => p.trim()).filter((p) => p !== '');
}

function unquote(name: string): string {
  const trimmed = name.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2) {
    return trimmed.slice(1, -1).replace(/\\(.)/g, '$1');
  }
  return trimmed;
}

const EMAIL_PATTERN = /[^\s<>"',;()]+@[^\s<>"',;()]+/;

/** Parse `Name <a@b.c>, "Last, First" <x@y.z>, plain@addr` into participants (emails lowercased). */
export function parseAddressList(header: string | null | undefined): EmailParticipant[] {
  if (!header) return [];
  const out: EmailParticipant[] = [];
  for (const part of splitAddresses(header)) {
    const angled = /^(.*?)\s*<([^<>]*)>\s*$/.exec(part);
    let name: string | null = null;
    let email: string | null = null;
    if (angled) {
      name = decodeEncodedWords(unquote(angled[1] ?? '')).trim() || null;
      email = (angled[2] ?? '').trim();
    } else {
      const match = EMAIL_PATTERN.exec(part);
      email = match?.[0] ?? null;
    }
    if (!email || !email.includes('@')) continue;
    out.push({ name, email: email.toLowerCase() });
  }
  return out;
}

// --- Body text ---------------------------------------------------------------------------------

/** Readable text of an HTML mail body (entities decoded, whitespace collapsed). */
export function htmlToText(html: string): string {
  if (!/<[a-zA-Z!/]/.test(html)) return collapseWhitespace(decodeHtmlEntities(html));
  return extractReadableText(html, { maxLength: HTML_TEXT_MAX_LENGTH }).text;
}

const QUOTE_MARKERS: RegExp[] = [
  // Gmail / Apple Mail (English), possibly wrapped over two lines.
  /^On [^\n]{0,200}?(?:\n[^\n]{0,200}?)?wrote:\s*$/m,
  // Gmail (Turkish): "5 Eyl 2026 Cum 10:00 tarihinde Ahmet Yılmaz <a@b> şunu yazdı:"
  /^[^\n]{0,200}? tarihinde [^\n]{0,200}?(?:\n[^\n]{0,200}?)?yazdı:\s*$/m,
  /^Le [^\n]{0,200}? a écrit\s*:\s*$/m,
  /^Am [^\n]{0,200}? schrieb [^\n]{0,200}?:\s*$/m,
  // Outlook separators (English / Turkish).
  /^-{2,}\s*Original Message\s*-{2,}\s*$/im,
  /^-{2,}\s*(?:Özgün|Orijinal|Orjinal) (?:İleti|Ileti|Mesaj)\s*-{2,}\s*$/im,
  /^_{5,}\s*$/m,
  /^From: [^\n]+\n(?:Sent|Date): [^\n]+$/m,
  /^Kimden: [^\n]+\n(?:Gönderme Tarihi|Gönderildi|Tarih): [^\n]+$/m,
  /^Sent from my (?:iPhone|iPad|Galaxy)[^\n]*\n[\s\S]*?^(?:From|On) /m,
];

/** Remove quoted reply history ("On … wrote:", "… tarihinde … yazdı:", Outlook separators, `>` lines). */
export function stripQuotedReply(text: string): string {
  const normalised = text.replace(/\r\n?/g, '\n');
  let cut = normalised.length;
  for (const marker of QUOTE_MARKERS) {
    const match = marker.exec(normalised);
    if (match && match.index < cut) cut = match.index;
  }
  const head = normalised.slice(0, cut);
  const withoutQuotes = head
    .split('\n')
    .filter((line) => !/^\s*>/.test(line))
    .join('\n')
    .trim();
  if (withoutQuotes !== '') return withoutQuotes;
  return normalised
    .split('\n')
    .filter((line) => !/^\s*>/.test(line))
    .join('\n')
    .trim();
}
