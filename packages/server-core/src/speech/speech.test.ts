import { describe, expect, it } from 'vitest';
import type { AiFetch } from '../ai/types';
import { isAppError } from '../errors';
import {
  DEEPGRAM_LISTEN_URL,
  DeepgramStt,
  ELEVENLABS_TTS_BASE_URL,
  ElevenLabsTts,
  OPENAI_SPEECH_URL,
  OPENAI_TRANSCRIPTIONS_URL,
  OPENAI_TTS_SEGMENT_CHARS,
  OpenAiStt,
  OpenAiTts,
  audioExtensionFor,
  buildAudioChapters,
  countWords,
  estimateSpeechSeconds,
  resolveSttProvider,
  resolveTtsProvider,
  splitForSpeech,
  toPlainSpeech,
} from './index';

interface RawCall {
  url: string;
  headers: Record<string, string>;
  body: BodyInit | null | undefined;
}

function mockFetch(responder: (call: RawCall, index: number) => Response) {
  const calls: RawCall[] = [];
  const fetch: AiFetch = async (url, init) => {
    const call: RawCall = {
      url,
      headers: (init.headers ?? {}) as Record<string, string>,
      body: init.body,
    };
    calls.push(call);
    return responder(call, calls.length - 1);
  };
  return { fetch, calls };
}

function bytes(n: number, fill = 7): Uint8Array {
  return new Uint8Array(n).fill(fill);
}

function audioResponse(payload: Uint8Array): Response {
  return new Response(new Uint8Array(payload).buffer, {
    status: 200,
    headers: { 'content-type': 'audio/mpeg' },
  });
}

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

function parseBody(call: RawCall): Record<string, unknown> {
  return JSON.parse(String(call.body)) as Record<string, unknown>;
}

async function expectAppError(promise: Promise<unknown>, code: string) {
  try {
    await promise;
  } catch (error) {
    if (!isAppError(error)) throw new Error(`expected AppError, got ${String(error)}`);
    expect(error.code).toBe(code);
    return error;
  }
  throw new Error(`expected rejection with ${code}`);
}

// ---------------------------------------------------------------------------
// TTS
// ---------------------------------------------------------------------------

describe('speech · OpenAI TTS', () => {
  it('posts /v1/audio/speech with model, voice, mp3 format and returns mp3 bytes', async () => {
    const { fetch, calls } = mockFetch(() => audioResponse(bytes(10)));
    const tts = new OpenAiTts({ apiKey: 'sk-test', voice: 'alloy', fetch });
    const result = await tts.synthesize('Bugün bilmen gereken 5 şey var.', {
      voice: null,
      speed: 1,
      format: 'mp3',
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(OPENAI_SPEECH_URL);
    expect(calls[0]!.headers.authorization).toBe('Bearer sk-test');
    const body = parseBody(calls[0]!);
    expect(body).toMatchObject({
      model: 'gpt-4o-mini-tts',
      input: 'Bugün bilmen gereken 5 şey var.',
      voice: 'alloy',
      response_format: 'mp3',
    });
    expect(typeof body.instructions).toBe('string');
    expect(body.speed).toBeUndefined();
    expect(result.mimeType).toBe('audio/mpeg');
    expect(result.audio).toEqual(bytes(10));
    expect(result.durationSecEstimate).toBeGreaterThan(0);
  });

  it('tts-1 receives the speed parameter and a voice override wins over the configured one', async () => {
    const { fetch, calls } = mockFetch(() => audioResponse(bytes(3)));
    const tts = new OpenAiTts({ apiKey: 'sk-test', model: 'tts-1', voice: 'alloy', fetch });
    await tts.synthesize('Merhaba.', { voice: 'nova', speed: 1.25, format: 'mp3' });
    expect(parseBody(calls[0]!)).toEqual({
      model: 'tts-1',
      input: 'Merhaba.',
      voice: 'nova',
      response_format: 'mp3',
      speed: 1.25,
    });
  });

  it('splits long scripts into provider-sized segments and concatenates the audio', async () => {
    const { fetch, calls } = mockFetch((_call, index) => audioResponse(bytes(5, index + 1)));
    const tts = new OpenAiTts({ apiKey: 'sk-test', fetch });
    const script = 'Bu bir cümle ve biraz uzunca. '.repeat(400); // ~12k chars
    const result = await tts.synthesize(script, { format: 'mp3' });
    expect(calls.length).toBeGreaterThanOrEqual(3);
    for (const call of calls)
      expect((parseBody(call).input as string).length).toBeLessThanOrEqual(
        OPENAI_TTS_SEGMENT_CHARS,
      );
    expect(result.audio.byteLength).toBe(calls.length * 5);
    expect(result.audio.slice(0, 5)).toEqual(bytes(5, 1));
    expect(result.audio.slice(5, 10)).toEqual(bytes(5, 2));
  });

  it('maps provider errors and rejects empty text', async () => {
    const { fetch } = mockFetch(() =>
      json({ error: { message: 'rate' } }, 429, { 'retry-after': '12' }),
    );
    const tts = new OpenAiTts({ apiKey: 'sk-test', fetch });
    const error = await expectAppError(
      tts.synthesize('Merhaba', { format: 'mp3' }),
      'ai_unavailable',
    );
    expect(error.retryAfterSec).toBe(12);
    expect(error.details).toMatchObject({ provider: 'openai', status: 429 });
    await expectAppError(tts.synthesize('   ', { format: 'mp3' }), 'validation');
  });
});

describe('speech · ElevenLabs TTS', () => {
  it('posts to /v1/text-to-speech/{voiceId} with xi-api-key and mp3_44100_128', async () => {
    const { fetch, calls } = mockFetch(() => audioResponse(bytes(4)));
    const tts = new ElevenLabsTts({ apiKey: 'xi-test', voiceId: 'voice123', fetch });
    const result = await tts.synthesize('Günaydın Yunus.', { speed: 2, format: 'mp3' });
    expect(calls[0]!.url).toBe(`${ELEVENLABS_TTS_BASE_URL}/voice123?output_format=mp3_44100_128`);
    expect(calls[0]!.headers['xi-api-key']).toBe('xi-test');
    expect(calls[0]!.headers.accept).toBe('audio/mpeg');
    expect(parseBody(calls[0]!)).toEqual({
      text: 'Günaydın Yunus.',
      model_id: 'eleven_multilingual_v2',
      voice_settings: { stability: 0.5, similarity_boost: 0.75, speed: 1.2 },
    });
    expect(result.audio).toEqual(bytes(4));
    await tts.synthesize('Selam.', { voice: 'other-voice', format: 'mp3' });
    expect(calls[1]!.url).toContain('/other-voice?');
  });
});

describe('speech · resolveTtsProvider', () => {
  const fetch: AiFetch = async () => json({});
  it('returns null for none or missing credentials and a provider otherwise', () => {
    const warnings: string[] = [];
    const logger = { warn: (m: string) => void warnings.push(m), error: () => undefined };
    expect(resolveTtsProvider({ provider: 'none', fetch })).toBeNull();
    expect(resolveTtsProvider({ provider: 'openai', fetch, logger })).toBeNull();
    expect(
      resolveTtsProvider({ provider: 'elevenlabs', elevenLabsApiKey: 'k', fetch, logger }),
    ).toBeNull();
    expect(warnings).toHaveLength(2);
    const openai = resolveTtsProvider({
      provider: 'openai',
      openaiApiKey: 'k',
      openaiModel: 'tts-1',
      voice: 'shimmer',
      fetch,
    });
    expect(openai).toBeInstanceOf(OpenAiTts);
    expect((openai as OpenAiTts).model).toBe('tts-1');
    expect(
      resolveTtsProvider({
        provider: 'elevenlabs',
        elevenLabsApiKey: 'k',
        elevenLabsVoiceId: 'v',
        fetch,
      }),
    ).toBeInstanceOf(ElevenLabsTts);
  });
});

// ---------------------------------------------------------------------------
// Plain script and chapters
// ---------------------------------------------------------------------------

describe('speech · toPlainSpeech', () => {
  it('expands clock times, ranges and abbreviations for Turkish narration', () => {
    expect(toPlainSpeech('Toplantı 17:00.')).toBe('Toplantı saat 17:00.');
    expect(toPlainSpeech('Toplantı saat 17:00.')).toBe('Toplantı saat 17:00.');
    expect(toPlainSpeech('Yarın 09:15 uçuş var.')).toBe('Yarın saat 09:15 uçuş var.');
    expect(toPlainSpeech('Kargo 14:00–18:00 arasında geliyor.')).toBe(
      'Kargo saat 14:00 ile 18:00 arasında geliyor.',
    );
    expect(toPlainSpeech('Boşluk: 14:00–16:30.')).toBe('Boşluk: saat 14:00 ile 16:30 arası.');
    expect(toPlainSpeech('Süre 2 dk 14 sn.')).toBe('Süre 2 dakika 14 saniye.');
    expect(toPlainSpeech('Fatura 1.842 TL, 10 Eylül.')).toBe('Fatura 1.842 TL, 10 Eylül.');
  });

  it('normalises separators, strips markdown, emoji, urls and list markers', () => {
    expect(toPlainSpeech('3 önemli mail · 4 etkinlik · 2 takip')).toBe(
      '3 önemli mail, 4 etkinlik, 2 takip',
    );
    expect(toPlainSpeech('**Bugün** *sakin* bir gün. ## Başlık\n- madde bir\n- madde iki')).toBe(
      'Bugün sakin bir gün. Başlık\nmadde bir\nmadde iki',
    );
    expect(toPlainSpeech('✅ Tamam 🎉 gönderildi 👍🏽')).toBe('Tamam gönderildi');
    expect(
      toPlainSpeech('Ayrıntılar: https://example.com/x?y=1 burada. [Teklif](https://x.y) hazır.'),
    ).toBe('Ayrıntılar: burada. Teklif hazır.');
    expect(toPlainSpeech('TK2412 İstanbul → Antalya')).toBe('TK2412 İstanbul - Antalya');
    expect(toPlainSpeech('a_b değişkeni ve `kod`')).toBe('a_b değişkeni ve kod');
  });
});

describe('speech · buildAudioChapters', () => {
  it('lays chapters out on a timeline at 150 words per minute and produces a device-safe script', () => {
    const words150 = Array.from({ length: 150 }, (_, i) => `kelime${i}`).join(' ');
    const words75 = Array.from({ length: 75 }, (_, i) => `söz${i}`).join(' ');
    const result = buildAudioChapters([
      { title: '', text: words150 },
      { title: 'Programın', text: `Saat 14:30 · müşteri toplantısı 🎉 **Ofis**. ${words75}` },
      { title: 'Boş', text: '   ' },
    ]);
    expect(result.chapters).toHaveLength(2);
    expect(result.chapters[0]).toMatchObject({ index: 0, startSec: 0, durationSec: 60 });
    expect(result.chapters[1]!.index).toBe(1);
    expect(result.chapters[1]!.startSec).toBe(60);
    // 1 title word + 6 sentence words ("14:30" is spoken as two) + 75 = 82 words → 32.8s → 33
    expect(result.chapters[1]!.durationSec).toBe(33);
    expect(result.chapters[1]!.title).toBe('Programın');
    expect(result.chapters[1]!.text).toBe(`Saat 14:30, müşteri toplantısı Ofis. ${words75}`);
    expect(result.totalDurationSec).toBe(93);
    expect(result.plainScript).toContain('Programın. Saat 14:30, müşteri toplantısı Ofis.');
    expect(result.plainScript).not.toMatch(/[·*🎉]/u);
    expect(result.plainScript.split('\n\n')).toHaveLength(2);
  });

  it('honours playback speed and chapter pauses', () => {
    const text = Array.from({ length: 150 }, (_, i) => `k${i}`).join(' ');
    const fast = buildAudioChapters(
      [
        { title: '', text },
        { title: '', text },
      ],
      { speed: 1.5, chapterPauseSec: 2 },
    );
    expect(fast.chapters.map((c) => [c.startSec, c.durationSec])).toEqual([
      [0, 40],
      [42, 40],
    ]);
    expect(fast.totalDurationSec).toBe(82);
    expect(buildAudioChapters([]).totalDurationSec).toBe(0);
    expect(buildAudioChapters([]).plainScript).toBe('');
  });

  it('timing helpers', () => {
    expect(countWords("Mehmet'e teklif, 17:00'de.")).toBe(4);
    expect(estimateSpeechSeconds('', {})).toBe(0);
    expect(
      estimateSpeechSeconds(Array.from({ length: 300 }, () => 'a').join(' '), {
        wordsPerMinute: 150,
      }),
    ).toBe(120);
    expect(splitForSpeech('Bir. İki! Üç? Dört.', 9)).toEqual(['Bir. İki!', 'Üç? Dört.']);
    expect(splitForSpeech('x'.repeat(25), 10)).toEqual(['xxxxxxxxxx', 'xxxxxxxxxx', 'xxxxx']);
    expect(splitForSpeech('   ', 10)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// STT
// ---------------------------------------------------------------------------

describe('speech · OpenAI STT', () => {
  it('posts multipart /v1/audio/transcriptions with file, model and language tr', async () => {
    const { fetch, calls } = mockFetch(() => json({ text: " Mehmet'ten cevap geldi mi? " }));
    const stt = new OpenAiStt({ apiKey: 'sk-test', fetch });
    const audio = bytes(64, 9);
    const result = await stt.transcribe(audio, { mimeType: 'audio/mp4', language: 'tr' });
    expect(calls[0]!.url).toBe(OPENAI_TRANSCRIPTIONS_URL);
    expect(calls[0]!.headers.authorization).toBe('Bearer sk-test');
    expect(calls[0]!.headers['content-type']).toBeUndefined();
    const form = calls[0]!.body as FormData;
    expect(form).toBeInstanceOf(FormData);
    expect(form.get('model')).toBe('gpt-4o-mini-transcribe');
    expect(form.get('language')).toBe('tr');
    expect(form.get('response_format')).toBe('json');
    const file = form.get('file');
    expect(file).toBeInstanceOf(Blob);
    const blob = file as File;
    expect(blob.type).toBe('audio/mp4');
    expect(blob.name).toBe('audio.m4a');
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(audio);
    expect(result).toEqual({ text: "Mehmet'ten cevap geldi mi?" });
  });

  it('whisper-1 asks for verbose_json and returns the duration', async () => {
    const { fetch, calls } = mockFetch(() => json({ text: 'Merhaba', duration: 2.4 }));
    const stt = new OpenAiStt({ apiKey: 'sk-test', model: 'whisper-1', fetch });
    const result = await stt.transcribe(bytes(8), { mimeType: 'audio/webm', language: 'tr' });
    expect((calls[0]!.body as FormData).get('response_format')).toBe('verbose_json');
    expect(((calls[0]!.body as FormData).get('file') as File).name).toBe('audio.webm');
    expect(result).toEqual({ text: 'Merhaba', durationSec: 2.4 });
  });

  it('rejects empty audio and maps failures', async () => {
    const { fetch } = mockFetch(() => json({ error: { message: 'bad' } }, 500));
    const stt = new OpenAiStt({ apiKey: 'sk-test', fetch });
    await expectAppError(
      stt.transcribe(new Uint8Array(0), { mimeType: 'audio/mp4', language: 'tr' }),
      'validation',
    );
    const error = await expectAppError(
      stt.transcribe(bytes(4), { mimeType: 'audio/mp4', language: 'tr' }),
      'ai_unavailable',
    );
    expect(error.details).toMatchObject({ provider: 'openai', status: 500 });
  });
});

describe('speech · Deepgram STT', () => {
  it('posts raw audio to /v1/listen with language, nova-3 and smart_format', async () => {
    const { fetch, calls } = mockFetch(() =>
      json({
        metadata: { duration: 3.2 },
        results: { channels: [{ alternatives: [{ transcript: 'Brifingimi oku. ' }] }] },
      }),
    );
    const stt = new DeepgramStt({ apiKey: 'dg-test', fetch });
    const audio = bytes(32, 3);
    const result = await stt.transcribe(audio, { mimeType: 'audio/wav', language: 'tr' });
    const url = new URL(calls[0]!.url);
    expect(`${url.origin}${url.pathname}`).toBe(DEEPGRAM_LISTEN_URL);
    expect(url.searchParams.get('language')).toBe('tr');
    expect(url.searchParams.get('model')).toBe('nova-3');
    expect(url.searchParams.get('smart_format')).toBe('true');
    expect(calls[0]!.headers.authorization).toBe('Token dg-test');
    expect(calls[0]!.headers['content-type']).toBe('audio/wav');
    expect(new Uint8Array(calls[0]!.body as ArrayBuffer)).toEqual(audio);
    expect(result).toEqual({ text: 'Brifingimi oku.', durationSec: 3.2 });
  });

  it('returns empty text when nothing was recognised', async () => {
    const { fetch } = mockFetch(() => json({ results: { channels: [] } }));
    const stt = new DeepgramStt({ apiKey: 'dg-test', fetch });
    expect(await stt.transcribe(bytes(4), { mimeType: 'audio/wav', language: 'tr' })).toEqual({
      text: '',
    });
  });
});

describe('speech · resolveSttProvider and helpers', () => {
  const fetch: AiFetch = async () => json({});
  it('returns null for none / missing keys and the configured provider otherwise', () => {
    expect(resolveSttProvider({ provider: 'none', fetch })).toBeNull();
    expect(resolveSttProvider({ provider: 'openai', fetch })).toBeNull();
    expect(resolveSttProvider({ provider: 'deepgram', fetch })).toBeNull();
    const openai = resolveSttProvider({
      provider: 'openai',
      openaiApiKey: 'k',
      openaiModel: 'whisper-1',
      fetch,
    });
    expect(openai).toBeInstanceOf(OpenAiStt);
    expect((openai as OpenAiStt).model).toBe('whisper-1');
    expect(resolveSttProvider({ provider: 'deepgram', deepgramApiKey: 'k', fetch })).toBeInstanceOf(
      DeepgramStt,
    );
  });

  it('audioExtensionFor maps common containers', () => {
    expect(audioExtensionFor('audio/mp4')).toBe('m4a');
    expect(audioExtensionFor('audio/mpeg; codecs=mp3')).toBe('mp3');
    expect(audioExtensionFor('audio/webm')).toBe('webm');
    expect(audioExtensionFor('application/octet-stream')).toBe('m4a');
  });
});
