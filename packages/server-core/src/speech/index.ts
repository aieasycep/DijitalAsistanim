/**
 * speech — optional server-side text-to-speech (briefing audio) and speech-to-text (voice mode).
 * When `TTS_PROVIDER` / `STT_PROVIDER` are `none` the resolvers return `null` and the apps use the
 * device engines; `buildAudioChapters` still produces the chapter timeline and a plain script that
 * device TTS can read without symbols, markdown or emoji.
 *
 * Web APIs only (fetch, FormData, Blob, AbortController); configuration is injected.
 */
import { z } from 'zod';
import { parseRetryAfterSec } from '../ai/providerError';
import type { AiFetch, AiLogger } from '../ai/types';
import { toArrayBuffer } from '../crypto/encoding';
import { AppError } from '../errors';
import { clamp } from '../util';

// ---------------------------------------------------------------------------
// Contracts
// ---------------------------------------------------------------------------

export const TTS_PROVIDER_NAMES = ['openai', 'elevenlabs'] as const;
export type TtsProviderName = (typeof TTS_PROVIDER_NAMES)[number];
export const STT_PROVIDER_NAMES = ['openai', 'deepgram'] as const;
export type SttProviderName = (typeof STT_PROVIDER_NAMES)[number];

export type SpeechLanguage = 'tr' | 'en';

export interface TtsSynthesizeOptions {
  /** Provider voice id / name; falls back to the configured voice. */
  voice?: string | null;
  /** Playback speed multiplier (1 = natural). */
  speed?: number;
  format: 'mp3';
}

export interface TtsResult {
  audio: Uint8Array;
  mimeType: 'audio/mpeg';
  /** Derived from word count and speed; the player uses real duration once decoded. */
  durationSecEstimate: number;
}

export interface TtsProvider {
  readonly name: TtsProviderName;
  synthesize(text: string, opts: TtsSynthesizeOptions): Promise<TtsResult>;
}

export interface SttTranscribeOptions {
  mimeType: string;
  language: SpeechLanguage;
}

export interface SttResult {
  text: string;
  durationSec?: number;
}

export interface SttProvider {
  readonly name: SttProviderName;
  transcribe(audio: Uint8Array, opts: SttTranscribeOptions): Promise<SttResult>;
}

export const OPENAI_SPEECH_URL = 'https://api.openai.com/v1/audio/speech';
export const OPENAI_TRANSCRIPTIONS_URL = 'https://api.openai.com/v1/audio/transcriptions';
export const ELEVENLABS_TTS_BASE_URL = 'https://api.elevenlabs.io/v1/text-to-speech';
export const ELEVENLABS_OUTPUT_FORMAT = 'mp3_44100_128';
export const DEFAULT_ELEVENLABS_MODEL = 'eleven_multilingual_v2';
export const DEEPGRAM_LISTEN_URL = 'https://api.deepgram.com/v1/listen';
export const DEFAULT_DEEPGRAM_MODEL = 'nova-3';

export const OPENAI_TTS_MODELS = ['gpt-4o-mini-tts', 'tts-1', 'tts-1-hd'] as const;
export type OpenAiTtsModel = (typeof OPENAI_TTS_MODELS)[number];
export const DEFAULT_OPENAI_TTS_MODEL: OpenAiTtsModel = 'gpt-4o-mini-tts';
export const DEFAULT_OPENAI_TTS_VOICE = 'alloy';

export const OPENAI_STT_MODELS = [
  'gpt-4o-mini-transcribe',
  'gpt-4o-transcribe',
  'whisper-1',
] as const;
export type OpenAiSttModel = (typeof OPENAI_STT_MODELS)[number];
export const DEFAULT_OPENAI_STT_MODEL: OpenAiSttModel = 'gpt-4o-mini-transcribe';

/** OpenAI accepts 4096 characters per request; ElevenLabs 5000. Segments stay below with a margin. */
export const OPENAI_TTS_SEGMENT_CHARS = 4000;
export const ELEVENLABS_SEGMENT_CHARS = 4500;
export const DEFAULT_WORDS_PER_MINUTE = 150;
const DEFAULT_TTS_TIMEOUT_MS = 60_000;
const DEFAULT_STT_TIMEOUT_MS = 60_000;

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

type SpeechProviderName = TtsProviderName | SttProviderName;

function speechError(
  provider: SpeechProviderName,
  kind: 'http' | 'network' | 'timeout' | 'parse',
  status: number | null,
  retryAfterSec?: number | null,
  cause?: unknown,
): AppError {
  const message =
    kind === 'timeout'
      ? 'Ses sağlayıcısı zaman aşımına uğradı.'
      : kind === 'network'
        ? 'Ses sağlayıcısına ulaşılamadı.'
        : kind === 'parse'
          ? 'Ses sağlayıcısının yanıtı çözümlenemedi.'
          : `Ses sağlayıcısı hata döndürdü (HTTP ${status}).`;
  return new AppError('ai_unavailable', message, {
    details: { provider, kind, ...(status !== null ? { status } : {}) },
    ...(retryAfterSec ? { retryAfterSec } : {}),
    cause,
  });
}

interface RawPostInput {
  provider: SpeechProviderName;
  fetch: AiFetch;
  url: string;
  headers: Record<string, string>;
  body: BodyInit;
  timeoutMs: number;
}

/** POST and return the raw Response body handling (timeouts, network errors, non-2xx mapped to AppError). */
async function postRaw(input: RawPostInput): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), input.timeoutMs);
  let response: Response;
  try {
    response = await input.fetch(input.url, {
      method: 'POST',
      headers: input.headers,
      body: input.body,
      signal: controller.signal,
    });
  } catch (cause) {
    clearTimeout(timer);
    throw speechError(
      input.provider,
      controller.signal.aborted ? 'timeout' : 'network',
      null,
      null,
      cause,
    );
  }
  if (!response.ok) {
    clearTimeout(timer);
    throw speechError(
      input.provider,
      'http',
      response.status,
      parseRetryAfterSec(response.headers.get('retry-after')),
    );
  }
  clearTimeout(timer);
  return response;
}

async function readBytes(provider: SpeechProviderName, response: Response): Promise<Uint8Array> {
  try {
    return new Uint8Array(await response.arrayBuffer());
  } catch (cause) {
    throw speechError(provider, 'network', null, null, cause);
  }
}

async function readJson(provider: SpeechProviderName, response: Response): Promise<unknown> {
  let text: string;
  try {
    text = await response.text();
  } catch (cause) {
    throw speechError(provider, 'network', null, null, cause);
  }
  try {
    return JSON.parse(text) as unknown;
  } catch (cause) {
    throw speechError(provider, 'parse', null, null, cause);
  }
}

export function concatBytes(parts: readonly Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.byteLength;
  }
  return out;
}

export function countWords(text: string): number {
  const matches = text.match(/[\p{L}\p{N}]+(?:['’][\p{L}]+)?/gu);
  return matches ? matches.length : 0;
}

export interface SpeechTimingOptions {
  wordsPerMinute?: number;
  speed?: number;
}

/** Seconds a text takes to read aloud at the given pace (one decimal). */
export function estimateSpeechSeconds(text: string, opts: SpeechTimingOptions = {}): number {
  const wpm = Math.max(60, opts.wordsPerMinute ?? DEFAULT_WORDS_PER_MINUTE);
  const speed = clamp(opts.speed ?? 1, 0.25, 4);
  const words = countWords(text);
  if (words === 0) return 0;
  return Math.max(0.1, Math.round(((words * 60) / (wpm * speed)) * 10) / 10);
}

/** Split long narration into provider-sized segments on sentence boundaries. */
export function splitForSpeech(text: string, maxChars: number): string[] {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return [];
  if (clean.length <= maxChars) return [clean];
  const sentences = clean.match(/[^.!?…]+[.!?…]+["”']?\s*|[^.!?…]+$/g) ?? [clean];
  const segments: string[] = [];
  let current = '';
  const flush = () => {
    if (current.trim()) segments.push(current.trim());
    current = '';
  };
  for (const raw of sentences) {
    let sentence = raw.trim();
    if (!sentence) continue;
    while (sentence.length > maxChars) {
      flush();
      let cut = sentence.lastIndexOf(' ', maxChars);
      if (cut < maxChars * 0.5) cut = maxChars;
      segments.push(sentence.slice(0, cut).trim());
      sentence = sentence.slice(cut).trim();
    }
    if (current.length + sentence.length + 1 > maxChars) flush();
    current = current ? `${current} ${sentence}` : sentence;
  }
  flush();
  return segments;
}

const AUDIO_EXTENSIONS: Record<string, string> = {
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/m4a': 'm4a',
  'audio/aac': 'aac',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/wave': 'wav',
  'audio/webm': 'webm',
  'video/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/oga': 'oga',
  'audio/flac': 'flac',
  'audio/x-flac': 'flac',
};

/** File extension providers use to sniff the container ("audio/mp4" → "m4a"). */
export function audioExtensionFor(mimeType: string): string {
  const base = mimeType.split(';')[0]?.trim().toLowerCase() ?? '';
  return AUDIO_EXTENSIONS[base] ?? 'm4a';
}

function assertAudio(audio: Uint8Array): void {
  if (audio.byteLength === 0) throw new AppError('validation', 'Ses verisi boş.');
}

function assertSpeechText(text: string): string {
  const clean = text.trim();
  if (!clean) throw new AppError('validation', 'Seslendirilecek metin boş.');
  return clean;
}

// ---------------------------------------------------------------------------
// TTS providers
// ---------------------------------------------------------------------------

export interface OpenAiTtsConfig {
  apiKey: string;
  model?: OpenAiTtsModel | string;
  voice?: string;
  fetch: AiFetch;
  timeoutMs?: number;
  logger?: AiLogger;
  url?: string;
  /** Style hint for gpt-4o-mini-tts ("Sakin, sıcak bir Türkçe anlatım"). */
  instructions?: string;
}

/** tts-1 / tts-1-hd honour `speed`; gpt-4o-mini-tts is steered through `instructions`. */
export function openAiTtsSupportsSpeed(model: string): boolean {
  return /^tts-1/i.test(model);
}

export class OpenAiTts implements TtsProvider {
  readonly name = 'openai' as const;
  private readonly config: OpenAiTtsConfig;

  constructor(config: OpenAiTtsConfig) {
    if (!config.apiKey) throw new AppError('internal', 'OpenAI TTS için API anahtarı eksik.');
    this.config = config;
  }

  get model(): string {
    return this.config.model ?? DEFAULT_OPENAI_TTS_MODEL;
  }

  buildBody(segment: string, opts: TtsSynthesizeOptions): Record<string, unknown> {
    const speed = clamp(opts.speed ?? 1, 0.25, 4);
    const body: Record<string, unknown> = {
      model: this.model,
      input: segment,
      voice: opts.voice?.trim() || this.config.voice || DEFAULT_OPENAI_TTS_VOICE,
      response_format: 'mp3',
    };
    if (openAiTtsSupportsSpeed(this.model)) {
      body.speed = speed;
    } else {
      const pace =
        speed > 1.1
          ? 'Biraz hızlı ama anlaşılır konuş.'
          : speed < 0.9
            ? 'Yavaş ve net konuş.'
            : 'Doğal bir hızda konuş.';
      body.instructions = [
        this.config.instructions ??
          'Sakin, sıcak ve doğal bir Türkçe anlatım; radyo sunucusu gibi değil, bir arkadaş gibi.',
        pace,
      ].join(' ');
    }
    return body;
  }

  async synthesize(text: string, opts: TtsSynthesizeOptions): Promise<TtsResult> {
    const clean = assertSpeechText(text);
    const parts: Uint8Array[] = [];
    for (const segment of splitForSpeech(clean, OPENAI_TTS_SEGMENT_CHARS)) {
      const response = await postRaw({
        provider: this.name,
        fetch: this.config.fetch,
        url: this.config.url ?? OPENAI_SPEECH_URL,
        headers: {
          authorization: `Bearer ${this.config.apiKey}`,
          'content-type': 'application/json',
          accept: 'audio/mpeg',
        },
        body: JSON.stringify(this.buildBody(segment, opts)),
        timeoutMs: this.config.timeoutMs ?? DEFAULT_TTS_TIMEOUT_MS,
      });
      parts.push(await readBytes(this.name, response));
    }
    return {
      audio: concatBytes(parts),
      mimeType: 'audio/mpeg',
      durationSecEstimate: estimateSpeechSeconds(clean, { speed: opts.speed ?? 1 }),
    };
  }
}

export interface ElevenLabsTtsConfig {
  apiKey: string;
  voiceId: string;
  modelId?: string;
  fetch: AiFetch;
  timeoutMs?: number;
  logger?: AiLogger;
  baseUrl?: string;
  outputFormat?: string;
}

export class ElevenLabsTts implements TtsProvider {
  readonly name = 'elevenlabs' as const;
  private readonly config: ElevenLabsTtsConfig;

  constructor(config: ElevenLabsTtsConfig) {
    if (!config.apiKey) throw new AppError('internal', 'ElevenLabs için API anahtarı eksik.');
    if (!config.voiceId)
      throw new AppError('internal', 'ElevenLabs için ses kimliği (voice id) eksik.');
    this.config = config;
  }

  urlFor(voiceId: string): string {
    const base = (this.config.baseUrl ?? ELEVENLABS_TTS_BASE_URL).replace(/\/+$/, '');
    return `${base}/${encodeURIComponent(voiceId)}?output_format=${encodeURIComponent(this.config.outputFormat ?? ELEVENLABS_OUTPUT_FORMAT)}`;
  }

  buildBody(segment: string, opts: TtsSynthesizeOptions): Record<string, unknown> {
    return {
      text: segment,
      model_id: this.config.modelId ?? DEFAULT_ELEVENLABS_MODEL,
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75,
        speed: clamp(opts.speed ?? 1, 0.7, 1.2),
      },
    };
  }

  async synthesize(text: string, opts: TtsSynthesizeOptions): Promise<TtsResult> {
    const clean = assertSpeechText(text);
    const voiceId = opts.voice?.trim() || this.config.voiceId;
    const parts: Uint8Array[] = [];
    for (const segment of splitForSpeech(clean, ELEVENLABS_SEGMENT_CHARS)) {
      const response = await postRaw({
        provider: this.name,
        fetch: this.config.fetch,
        url: this.urlFor(voiceId),
        headers: {
          'xi-api-key': this.config.apiKey,
          'content-type': 'application/json',
          accept: 'audio/mpeg',
        },
        body: JSON.stringify(this.buildBody(segment, opts)),
        timeoutMs: this.config.timeoutMs ?? DEFAULT_TTS_TIMEOUT_MS,
      });
      parts.push(await readBytes(this.name, response));
    }
    return {
      audio: concatBytes(parts),
      mimeType: 'audio/mpeg',
      durationSecEstimate: estimateSpeechSeconds(clean, { speed: opts.speed ?? 1 }),
    };
  }
}

export interface TtsConfig {
  provider: TtsProviderName | 'none';
  /** TTS_VOICE — OpenAI voice name; ignored by ElevenLabs (which uses the voice id). */
  voice?: string | null;
  openaiApiKey?: string | null;
  openaiModel?: string | null;
  elevenLabsApiKey?: string | null;
  elevenLabsVoiceId?: string | null;
  elevenLabsModelId?: string | null;
  fetch: AiFetch;
  logger?: AiLogger;
  timeoutMs?: number;
}

/** `null` means "use device TTS" — when disabled or when the chosen provider lacks credentials. */
export function resolveTtsProvider(config: TtsConfig): TtsProvider | null {
  if (config.provider === 'none') return null;
  const common = {
    fetch: config.fetch,
    ...(config.logger ? { logger: config.logger } : {}),
    ...(config.timeoutMs ? { timeoutMs: config.timeoutMs } : {}),
  };
  if (config.provider === 'openai') {
    if (!config.openaiApiKey) {
      config.logger?.warn('tts provider configured without api key; using device tts', {
        provider: config.provider,
      });
      return null;
    }
    return new OpenAiTts({
      ...common,
      apiKey: config.openaiApiKey,
      ...(config.openaiModel ? { model: config.openaiModel } : {}),
      ...(config.voice ? { voice: config.voice } : {}),
    });
  }
  if (!config.elevenLabsApiKey || !config.elevenLabsVoiceId) {
    config.logger?.warn('tts provider configured without credentials; using device tts', {
      provider: config.provider,
    });
    return null;
  }
  return new ElevenLabsTts({
    ...common,
    apiKey: config.elevenLabsApiKey,
    voiceId: config.elevenLabsVoiceId,
    ...(config.elevenLabsModelId ? { modelId: config.elevenLabsModelId } : {}),
  });
}

// ---------------------------------------------------------------------------
// Plain script + chapters (device TTS and player timeline)
// ---------------------------------------------------------------------------

export interface PlainSpeechOptions {
  language?: SpeechLanguage;
}

const TIME_RE = /(?<![\d:])([01]?\d|2[0-3]):([0-5]\d)(?![\d:])/g;
const TIME_RANGE_RE =
  /(?<![\d:])([01]?\d|2[0-3]):([0-5]\d)\s*[-–—]\s*([01]?\d|2[0-3]):([0-5]\d)(?![\d:])/g;
// Pictographs, flags, skin-tone modifiers, variation selector (U+FE0F) and zero-width joiner (U+200D).
const EMOJI_RE =
  /\p{Extended_Pictographic}|[\u{1F1E6}-\u{1F1FF}]|[\u{1F3FB}-\u{1F3FF}]|\uFE0F|\u200D/gu;

/**
 * Turn narration into text a device TTS engine reads naturally: no markdown, emoji, URLs or
 * symbols; "17:00" → "saat 17:00"; "14:00–18:00" → "saat 14:00 ile 18:00 arası"; "·" → ",";
 * "2 dk" → "2 dakika".
 */
export function toPlainSpeech(text: string, opts: PlainSpeechOptions = {}): string {
  const tr = (opts.language ?? 'tr') === 'tr';
  let out = text.replace(/\r/g, '');
  out = out
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/(^|\s)#{1,6}[ \t]+/gm, '$1')
    .replace(/^[ \t]*(?:[-*+•]|\d+[.)])[ \t]+/gm, '')
    .replace(/^[ \t]*>[ \t]?/gm, '')
    .replace(/(\*\*|__)(.+?)\1/g, '$2')
    .replace(/(?<![\p{L}\p{N}])[*_](.+?)[*_](?![\p{L}\p{N}])/gu, '$1')
    .replace(/~~(.+?)~~/g, '$1');
  out = out.replace(EMOJI_RE, ' ');
  out = out
    .replace(/\s*·\s*/g, ', ')
    .replace(/\s*•\s*/g, ', ')
    .replace(/\s*(→|->|➜)\s*/g, tr ? ' - ' : ' to ')
    .replace(/\s*[|]\s*/g, ', ');
  if (tr) {
    out = out.replace(
      TIME_RANGE_RE,
      (
        match: string,
        h1: string,
        m1: string,
        h2: string,
        m2: string,
        offset: number,
        whole: string,
      ) => {
        // "14:00–18:00 arasında" already carries the word; avoid "arası arasında".
        const followedByArasi = /^\s*aras[ıi]/i.test(whole.slice(offset + match.length));
        return `saat ${h1}:${m1} ile ${h2}:${m2}${followedByArasi ? '' : ' arası'}`;
      },
    );
    out = out.replace(
      TIME_RE,
      (match: string, _h: string, _m: string, offset: number, whole: string) => {
        const before = whole.slice(Math.max(0, offset - 12), offset).toLocaleLowerCase('tr-TR');
        if (/(^|\s)saat\s$/.test(before) || /\sile\s$/.test(before)) return match;
        return `saat ${match}`;
      },
    );
    out = out.replace(/(\d)\s*dk\b/g, '$1 dakika').replace(/(\d)\s*sn\b/g, '$1 saniye');
  }
  out = out
    .replace(/[ \t]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/,\s*([.!?])/g, '$1')
    .replace(/,{2,}/g, ',')
    .replace(/^[,\s]+|[,\s]+$/gm, '')
    .trim();
  return out;
}

export interface AudioChapterInput {
  title: string;
  text: string;
}

export interface AudioChapter {
  index: number;
  title: string;
  startSec: number;
  durationSec: number;
  /** Plain narration of this chapter (already passed through `toPlainSpeech`). */
  text: string;
}

export interface AudioChaptersOptions extends SpeechTimingOptions {
  language?: SpeechLanguage;
  /** Silence inserted between chapters in the timeline. */
  chapterPauseSec?: number;
}

export interface AudioChaptersResult {
  chapters: AudioChapter[];
  totalDurationSec: number;
  /** Full narration for device TTS: "Başlık. Metin…" per chapter, symbol-free. */
  plainScript: string;
}

function ensureSentenceEnd(text: string): string {
  return /[.!?…]$/.test(text) ? text : `${text}.`;
}

/** Chapter timeline (startSec / durationSec) for the player plus the device-readable script. */
export function buildAudioChapters(
  chapters: readonly AudioChapterInput[],
  opts: AudioChaptersOptions = {},
): AudioChaptersResult {
  const language = opts.language ?? 'tr';
  const pause = Math.max(0, opts.chapterPauseSec ?? 0);
  const out: AudioChapter[] = [];
  const scriptParts: string[] = [];
  let cursor = 0;
  for (const chapter of chapters) {
    const text = toPlainSpeech(chapter.text, { language });
    if (!text) continue;
    const title = toPlainSpeech(chapter.title, { language });
    const spoken = title
      ? `${ensureSentenceEnd(title)} ${ensureSentenceEnd(text)}`
      : ensureSentenceEnd(text);
    const durationSec = Math.max(
      1,
      Math.round(
        estimateSpeechSeconds(spoken, { wordsPerMinute: opts.wordsPerMinute, speed: opts.speed }),
      ),
    );
    const startSec = Math.round(cursor);
    out.push({
      index: out.length,
      title: title || chapter.title.trim(),
      startSec,
      durationSec,
      text,
    });
    scriptParts.push(spoken);
    cursor += durationSec + pause;
  }
  const last = out[out.length - 1];
  return {
    chapters: out,
    totalDurationSec: last ? last.startSec + last.durationSec : 0,
    plainScript: scriptParts.join('\n\n'),
  };
}

// ---------------------------------------------------------------------------
// STT providers
// ---------------------------------------------------------------------------

export interface OpenAiSttConfig {
  apiKey: string;
  model?: OpenAiSttModel | string;
  fetch: AiFetch;
  timeoutMs?: number;
  logger?: AiLogger;
  url?: string;
}

const openAiTranscriptionSchema = z.object({
  text: z.string(),
  duration: z.number().nonnegative().optional(),
});

export class OpenAiStt implements SttProvider {
  readonly name = 'openai' as const;
  private readonly config: OpenAiSttConfig;

  constructor(config: OpenAiSttConfig) {
    if (!config.apiKey) throw new AppError('internal', 'OpenAI STT için API anahtarı eksik.');
    this.config = config;
  }

  get model(): string {
    return this.config.model ?? DEFAULT_OPENAI_STT_MODEL;
  }

  buildForm(audio: Uint8Array, opts: SttTranscribeOptions): FormData {
    const form = new FormData();
    form.append(
      'file',
      new Blob([toArrayBuffer(audio)], { type: opts.mimeType }),
      `audio.${audioExtensionFor(opts.mimeType)}`,
    );
    form.append('model', this.model);
    form.append('language', opts.language);
    // whisper-1 reports duration through verbose_json; the gpt-4o transcribe models only support json/text.
    form.append('response_format', this.model === 'whisper-1' ? 'verbose_json' : 'json');
    return form;
  }

  async transcribe(audio: Uint8Array, opts: SttTranscribeOptions): Promise<SttResult> {
    assertAudio(audio);
    const response = await postRaw({
      provider: this.name,
      fetch: this.config.fetch,
      url: this.config.url ?? OPENAI_TRANSCRIPTIONS_URL,
      headers: { authorization: `Bearer ${this.config.apiKey}`, accept: 'application/json' },
      body: this.buildForm(audio, opts),
      timeoutMs: this.config.timeoutMs ?? DEFAULT_STT_TIMEOUT_MS,
    });
    const parsed = openAiTranscriptionSchema.safeParse(await readJson(this.name, response));
    if (!parsed.success) throw speechError(this.name, 'parse', response.status);
    return {
      text: parsed.data.text.trim(),
      ...(parsed.data.duration !== undefined ? { durationSec: parsed.data.duration } : {}),
    };
  }
}

export interface DeepgramSttConfig {
  apiKey: string;
  model?: string;
  fetch: AiFetch;
  timeoutMs?: number;
  logger?: AiLogger;
  url?: string;
}

const deepgramResponseSchema = z.object({
  metadata: z.object({ duration: z.number().nonnegative().optional() }).optional(),
  results: z.object({
    channels: z.array(z.object({ alternatives: z.array(z.object({ transcript: z.string() })) })),
  }),
});

export class DeepgramStt implements SttProvider {
  readonly name = 'deepgram' as const;
  private readonly config: DeepgramSttConfig;

  constructor(config: DeepgramSttConfig) {
    if (!config.apiKey) throw new AppError('internal', 'Deepgram için API anahtarı eksik.');
    this.config = config;
  }

  get model(): string {
    return this.config.model ?? DEFAULT_DEEPGRAM_MODEL;
  }

  urlFor(language: SpeechLanguage): string {
    const url = new URL(this.config.url ?? DEEPGRAM_LISTEN_URL);
    url.searchParams.set('language', language);
    url.searchParams.set('model', this.model);
    url.searchParams.set('smart_format', 'true');
    return url.toString();
  }

  async transcribe(audio: Uint8Array, opts: SttTranscribeOptions): Promise<SttResult> {
    assertAudio(audio);
    const response = await postRaw({
      provider: this.name,
      fetch: this.config.fetch,
      url: this.urlFor(opts.language),
      headers: {
        authorization: `Token ${this.config.apiKey}`,
        'content-type': opts.mimeType,
        accept: 'application/json',
      },
      body: toArrayBuffer(audio),
      timeoutMs: this.config.timeoutMs ?? DEFAULT_STT_TIMEOUT_MS,
    });
    const parsed = deepgramResponseSchema.safeParse(await readJson(this.name, response));
    if (!parsed.success) throw speechError(this.name, 'parse', response.status);
    const transcript = parsed.data.results.channels[0]?.alternatives[0]?.transcript ?? '';
    const duration = parsed.data.metadata?.duration;
    return {
      text: transcript.trim(),
      ...(duration !== undefined ? { durationSec: duration } : {}),
    };
  }
}

export interface SttConfig {
  provider: SttProviderName | 'none';
  openaiApiKey?: string | null;
  openaiModel?: string | null;
  deepgramApiKey?: string | null;
  deepgramModel?: string | null;
  fetch: AiFetch;
  logger?: AiLogger;
  timeoutMs?: number;
}

/** `null` means "use device speech recognition" — when disabled or when credentials are missing. */
export function resolveSttProvider(config: SttConfig): SttProvider | null {
  if (config.provider === 'none') return null;
  const common = {
    fetch: config.fetch,
    ...(config.logger ? { logger: config.logger } : {}),
    ...(config.timeoutMs ? { timeoutMs: config.timeoutMs } : {}),
  };
  if (config.provider === 'openai') {
    if (!config.openaiApiKey) {
      config.logger?.warn('stt provider configured without api key; using device recognition', {
        provider: config.provider,
      });
      return null;
    }
    return new OpenAiStt({
      ...common,
      apiKey: config.openaiApiKey,
      ...(config.openaiModel ? { model: config.openaiModel } : {}),
    });
  }
  if (!config.deepgramApiKey) {
    config.logger?.warn('stt provider configured without api key; using device recognition', {
      provider: config.provider,
    });
    return null;
  }
  return new DeepgramStt({
    ...common,
    apiKey: config.deepgramApiKey,
    ...(config.deepgramModel ? { model: config.deepgramModel } : {}),
  });
}
