/** Lightweight readable-text extraction from HTML (no DOM, regex based, Deno-safe). */

export interface ReadableText {
  title: string;
  description: string | null;
  lang: string | null;
  text: string;
  truncated: boolean;
}

export interface ReadableTextOptions {
  /** Max characters of `text` (default 20 000). */
  maxLength?: number;
}

const DEFAULT_MAX_LENGTH = 20_000;

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ensp: ' ',
  emsp: ' ',
  thinsp: ' ',
  mdash: '—',
  ndash: '–',
  hellip: '…',
  laquo: '«',
  raquo: '»',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  bull: '•',
  middot: '·',
  times: '×',
  copy: '©',
  reg: '®',
  trade: '™',
  euro: '€',
  pound: '£',
  deg: '°',
  ccedil: 'ç',
  Ccedil: 'Ç',
  ouml: 'ö',
  Ouml: 'Ö',
  uuml: 'ü',
  Uuml: 'Ü',
  scedil: 'ş',
  Scedil: 'Ş',
  gbreve: 'ğ',
  Gbreve: 'Ğ',
  inodot: 'ı',
  Idot: 'İ',
  auml: 'ä',
  Auml: 'Ä',
  eacute: 'é',
  Eacute: 'É',
  egrave: 'è',
  agrave: 'à',
  acirc: 'â',
  icirc: 'î',
  ucirc: 'û',
  ocirc: 'ô',
  szlig: 'ß',
};

export function decodeHtmlEntities(input: string): string {
  return input.replace(
    /&(#x[0-9a-fA-F]{1,6}|#\d{1,7}|[A-Za-z][A-Za-z0-9]{1,31});/g,
    (match, entity: string) => {
      if (entity.startsWith('#x') || entity.startsWith('#X')) {
        const code = Number.parseInt(entity.slice(2), 16);
        return safeFromCodePoint(code, match);
      }
      if (entity.startsWith('#')) {
        const code = Number.parseInt(entity.slice(1), 10);
        return safeFromCodePoint(code, match);
      }
      return NAMED_ENTITIES[entity] ?? match;
    },
  );
}

function safeFromCodePoint(code: number, fallback: string): string {
  if (
    !Number.isFinite(code) ||
    code <= 0 ||
    code > 0x10ffff ||
    (code >= 0xd800 && code <= 0xdfff)
  ) {
    return fallback;
  }
  return String.fromCodePoint(code);
}

export function collapseWhitespace(text: string): string {
  return text
    .replace(/\r/g, '')
    .replace(/[ \t\f\v\u00a0]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function stripBlocks(html: string, tags: string[]): string {
  let out = html;
  for (const tag of tags) {
    out = out.replace(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}\\s*>`, 'gi'), ' ');
    // Unterminated block: drop everything after the opening tag.
    out = out.replace(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*$`, 'i'), ' ');
  }
  return out;
}

/** Paragraph-level boundary marker (private-use code point; becomes a blank line after collapsing). */
const PARAGRAPH_MARK = '\uE000';
const PARAGRAPH_CLOSERS = 'p|h[1-6]|ul|ol|table|blockquote|pre|section|article|main|figure|details';
const BLOCK_TAGS =
  'p|div|section|article|main|li|ul|ol|h[1-6]|tr|table|thead|tbody|blockquote|pre|dd|dt|dl|figure|figcaption|header|footer|address|details|summary|nav|aside|form|fieldset|legend|option';
const INLINE_TAGS =
  'a|abbr|b|bdi|bdo|cite|code|data|dfn|em|i|kbd|mark|q|s|samp|small|span|strong|sub|sup|time|u|var|font|ins|del|label|img';

/** Convert markup to text with line structure: blocks → newline, paragraphs → blank line. */
function stripTags(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<\s*(br|hr)\b[^>]*\/?>/gi, '\n')
    .replace(new RegExp(`<\\/\\s*(?:${PARAGRAPH_CLOSERS})\\s*>`, 'gi'), `\n${PARAGRAPH_MARK}\n`)
    .replace(new RegExp(`<\\/?\\s*(?:${BLOCK_TAGS})\\b[^>]*>`, 'gi'), '\n')
    .replace(/<\/\s*(td|th)\s*>/gi, ' ')
    .replace(new RegExp(`<\\/?\\s*(?:${INLINE_TAGS})\\b[^>]*>`, 'gi'), '')
    .replace(/<[^>]+>/g, ' ');
}

/** Whitespace collapsing that understands the paragraph marker. */
function collapseWithParagraphs(text: string): string {
  return text
    .replace(/\r/g, '')
    .replace(/[ \t\f\v ]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n+/g, '\n')
    .replace(/(?:\n?\uE000\n?)+/g, '\n\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function firstMatch(html: string, pattern: RegExp): string | null {
  const m = pattern.exec(html);
  return m?.[1] !== undefined
    ? collapseWhitespace(decodeHtmlEntities(stripTags(m[1]).replace(/\uE000/g, ''))) || null
    : null;
}

function metaContent(html: string, names: string[]): string | null {
  for (const name of names) {
    const patterns = [
      new RegExp(
        `<meta\\b[^>]*(?:name|property)\\s*=\\s*["']${name}["'][^>]*content\\s*=\\s*["']([^"']*)["']`,
        'i',
      ),
      new RegExp(
        `<meta\\b[^>]*content\\s*=\\s*["']([^"']*)["'][^>]*(?:name|property)\\s*=\\s*["']${name}["']`,
        'i',
      ),
    ];
    for (const p of patterns) {
      const m = p.exec(html);
      if (m?.[1]) {
        const value = collapseWhitespace(decodeHtmlEntities(m[1]));
        if (value) return value;
      }
    }
  }
  return null;
}

/** Pick the most content-bearing region: <main>, then <article>, then <body>, then everything. */
function pickMainRegion(html: string): string {
  const candidates: string[] = [];
  for (const tag of ['main', 'article']) {
    const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}\\s*>`, 'gi');
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) if (m[1]) candidates.push(m[1]);
  }
  if (candidates.length > 0) {
    return candidates.reduce((best, c) => (c.length > best.length ? c : best));
  }
  const body =
    /<body\b[^>]*>([\s\S]*?)<\/body\s*>/i.exec(html)?.[1] ??
    /<body\b[^>]*>([\s\S]*)$/i.exec(html)?.[1];
  return body ?? html;
}

/**
 * Title + main text with scripts/styles/navigation stripped, whitespace collapsed and a length cap.
 * Good enough for capture analysis; it is not a full readability implementation.
 */
export function extractReadableText(html: string, opts: ReadableTextOptions = {}): ReadableText {
  const maxLength = Math.max(200, opts.maxLength ?? DEFAULT_MAX_LENGTH);
  const withoutNoise = stripBlocks(html, [
    'script',
    'style',
    'noscript',
    'template',
    'svg',
    'iframe',
    'object',
    'embed',
  ]);

  const title =
    firstMatch(withoutNoise, /<title\b[^>]*>([\s\S]*?)<\/title\s*>/i) ??
    metaContent(withoutNoise, ['og:title', 'twitter:title']) ??
    '';
  const description = metaContent(withoutNoise, [
    'description',
    'og:description',
    'twitter:description',
  ]);
  const langMatch =
    /<html\b[^>]*\blang\s*=\s*["']?([A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*)["'\s>]/i.exec(
      withoutNoise,
    );
  const lang = langMatch?.[1]?.toLowerCase() ?? null;

  const region = pickMainRegion(withoutNoise);
  const withoutChrome = stripBlocks(region, [
    'nav',
    'header',
    'footer',
    'aside',
    'form',
    'button',
    'select',
  ]);
  const text = collapseWithParagraphs(
    decodeHtmlEntities(stripTags(withoutChrome.replace(/\uE000/g, ''))),
  );

  const truncated = text.length > maxLength;
  return {
    title: title.slice(0, 300),
    description: description ? description.slice(0, 500) : null,
    lang,
    text: truncated ? `${text.slice(0, maxLength - 1).trimEnd()}…` : text,
    truncated,
  };
}
