/**
 * Text extraction from captured media (screenshots, photos, PDFs, plain files) using the configured
 * LLM provider's vision / document input. The model is instructed to transcribe only — never to
 * "repair" or guess — and the result feeds the regular capture analysis prompt as evidence text.
 * Bytes are processed in memory and never logged.
 */
import { AppError } from '@da/server-core/errors';
import { getEnv } from './env.ts';

const MAX_MEDIA_BYTES = 20 * 1024 * 1024;
const MAX_OUTPUT_CHARS = 20_000;

const TRANSCRIBE_INSTRUCTION =
  'Transcribe ALL readable text from this content exactly as written, preserving line breaks and the original language (Turkish or English). ' +
  'Do not summarise, translate, correct spelling or add anything that is not visible. If there is no readable text, answer with the single word EMPTY.';

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk)
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(binary);
}

export type MediaKind = 'image' | 'pdf' | 'text';

export function mediaKindFor(mimeType: string | null | undefined): MediaKind | null {
  const mt = (mimeType ?? '').toLowerCase();
  if (mt.startsWith('image/')) return 'image';
  if (mt === 'application/pdf') return 'pdf';
  if (
    mt.startsWith('text/') ||
    mt === 'application/json' ||
    mt === 'text/markdown' ||
    mt === 'text/csv'
  )
    return 'text';
  return null;
}

async function anthropicExtract(
  apiKey: string,
  model: string,
  kind: 'image' | 'pdf',
  mimeType: string,
  bytes: Uint8Array,
): Promise<string> {
  const block =
    kind === 'image'
      ? { type: 'image', source: { type: 'base64', media_type: mimeType, data: toBase64(bytes) } }
      : {
          type: 'document',
          source: { type: 'base64', media_type: 'application/pdf', data: toBase64(bytes) },
        };
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      messages: [
        { role: 'user', content: [block, { type: 'text', text: TRANSCRIBE_INSTRUCTION }] },
      ],
    }),
  });
  if (!res.ok)
    throw new AppError('ai_unavailable', 'Görsel içerik okunamadı.', {
      status: res.status === 429 ? 429 : 503,
      details: { status: res.status },
    });
  const body = (await res.json()) as { content?: { type: string; text?: string }[] };
  return (body.content ?? [])
    .filter((c) => c.type === 'text')
    .map((c) => c.text ?? '')
    .join('\n');
}

async function openAiExtract(
  apiKey: string,
  model: string,
  kind: 'image' | 'pdf',
  mimeType: string,
  bytes: Uint8Array,
  filename: string,
): Promise<string> {
  const part =
    kind === 'image'
      ? { type: 'image_url', image_url: { url: `data:${mimeType};base64,${toBase64(bytes)}` } }
      : {
          type: 'file',
          file: { filename, file_data: `data:application/pdf;base64,${toBase64(bytes)}` },
        };
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      max_completion_tokens: 4096,
      messages: [{ role: 'user', content: [part, { type: 'text', text: TRANSCRIBE_INSTRUCTION }] }],
    }),
  });
  if (!res.ok)
    throw new AppError('ai_unavailable', 'Görsel içerik okunamadı.', {
      status: res.status === 429 ? 429 : 503,
      details: { status: res.status },
    });
  const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return body.choices?.[0]?.message?.content ?? '';
}

/** Returns the transcribed text, '' when the content holds no readable text. Throws `ai_unavailable` without a provider. */
export async function extractTextFromMedia(input: {
  bytes: Uint8Array;
  mimeType: string;
  filename?: string;
}): Promise<string> {
  if (input.bytes.byteLength === 0 || input.bytes.byteLength > MAX_MEDIA_BYTES)
    throw new AppError('validation', 'Dosya boyutu desteklenmiyor.');
  const kind = mediaKindFor(input.mimeType);
  if (kind === 'text')
    return new TextDecoder('utf-8', { fatal: false })
      .decode(input.bytes)
      .slice(0, MAX_OUTPUT_CHARS);
  if (!kind)
    throw new AppError('validation', 'Bu dosya türü analiz edilemiyor.', {
      details: { mimeType: input.mimeType },
    });
  const env = getEnv();
  let text: string;
  if (env.ai.provider === 'anthropic' && env.ai.anthropicApiKey)
    text = await anthropicExtract(
      env.ai.anthropicApiKey,
      env.ai.anthropicModelSmall,
      kind,
      input.mimeType,
      input.bytes,
    );
  else if (env.ai.openaiApiKey)
    text = await openAiExtract(
      env.ai.openaiApiKey,
      env.ai.openaiModelSmall,
      kind,
      input.mimeType,
      input.bytes,
      input.filename ?? 'capture.pdf',
    );
  else if (env.ai.anthropicApiKey)
    text = await anthropicExtract(
      env.ai.anthropicApiKey,
      env.ai.anthropicModelSmall,
      kind,
      input.mimeType,
      input.bytes,
    );
  else
    throw new AppError('ai_unavailable', 'Görsel ve PDF analizi için bir AI sağlayıcısı gerekli.', {
      status: 503,
    });
  const trimmed = text.trim();
  if (trimmed === 'EMPTY') return '';
  return trimmed.slice(0, MAX_OUTPUT_CHARS);
}
