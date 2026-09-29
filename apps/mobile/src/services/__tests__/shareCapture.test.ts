import type { ShareIntent } from 'expo-share-intent';
import {
  MAX_SHARE_FILE_BYTES,
  captureKindForMime,
  clearPendingShareCapture,
  consumePendingShareCapture,
  mapShareIntentToCapture,
  peekPendingShareCapture,
  setPendingShareCapture,
  shareIntentSignature,
} from '@/services/shareCapture';

const intent = (overrides: Partial<ShareIntent>): ShareIntent => ({
  files: null,
  text: null,
  webUrl: null,
  type: null,
  ...overrides,
});

describe('captureKindForMime', () => {
  it('maps mime types to capture kinds', () => {
    expect(captureKindForMime('image/jpeg')).toBe('image');
    expect(captureKindForMime('application/pdf')).toBe('pdf');
    expect(captureKindForMime('audio/m4a')).toBe('audio');
    expect(captureKindForMime('application/vnd.ms-excel')).toBe('file');
    expect(captureKindForMime('')).toBe('file');
    expect(captureKindForMime('video/mp4')).toBeNull();
  });
});

describe('mapShareIntentToCapture', () => {
  it('maps shared text', () => {
    expect(
      mapShareIntentToCapture(intent({ type: 'text', text: 'Yarın 14:00 diş hekimi' })),
    ).toEqual([{ kind: 'text', text: 'Yarın 14:00 diş hekimi' }]);
  });

  it('maps a web url (with page title) and keeps surrounding text', () => {
    expect(
      mapShareIntentToCapture(
        intent({
          type: 'weburl',
          webUrl: 'https://example.com/etkinlik',
          text: 'Şuna bak https://example.com/etkinlik',
          meta: { title: 'Etkinlik' },
        }),
      ),
    ).toEqual([
      {
        kind: 'link',
        url: 'https://example.com/etkinlik',
        title: 'Etkinlik',
        text: 'Şuna bak https://example.com/etkinlik',
      },
    ]);
  });

  it('extracts a link from plain text when the platform did not', () => {
    expect(
      mapShareIntentToCapture(intent({ type: 'text', text: 'https://example.com/a' })),
    ).toEqual([{ kind: 'link', url: 'https://example.com/a' }]);
  });

  it('maps files by mime type, first file primary and the rest queued', () => {
    const items = mapShareIntentToCapture(
      intent({
        type: 'media',
        files: [
          {
            path: 'file:///a.jpg',
            mimeType: 'image/jpeg',
            fileName: 'a.jpg',
            size: 1024,
            width: 10,
            height: 10,
            duration: null,
          },
          {
            path: 'file:///b.pdf',
            mimeType: 'application/pdf',
            fileName: 'b.pdf',
            size: 2048,
            width: null,
            height: null,
            duration: null,
          },
        ],
      }),
    );
    expect(items.map((i) => i.kind)).toEqual(['image', 'pdf']);
    expect(items[0]?.file).toEqual({
      uri: 'file:///a.jpg',
      mimeType: 'image/jpeg',
      fileName: 'a.jpg',
      sizeBytes: 1024,
    });
    expect(items[1]?.title).toBe('b.pdf');
  });

  it('flags oversized and unsupported files instead of dropping them silently', () => {
    const items = mapShareIntentToCapture(
      intent({
        type: 'file',
        files: [
          {
            path: 'file:///big.pdf',
            mimeType: 'application/pdf',
            fileName: 'big.pdf',
            size: MAX_SHARE_FILE_BYTES + 1,
            width: null,
            height: null,
            duration: null,
          },
          {
            path: 'file:///clip.mp4',
            mimeType: 'video/mp4',
            fileName: 'clip.mp4',
            size: 10,
            width: null,
            height: null,
            duration: 3,
          },
        ],
      }),
    );
    expect(items[0]).toMatchObject({ kind: 'pdf', rejected: 'tooLarge' });
    expect(items[1]).toMatchObject({ kind: 'file', rejected: 'unsupported' });
  });

  it('returns nothing for empty intents', () => {
    expect(mapShareIntentToCapture(intent({}))).toEqual([]);
    expect(mapShareIntentToCapture(null)).toEqual([]);
  });
});

describe('pending capture hand-off', () => {
  afterEach(() => clearPendingShareCapture());

  it('stores, peeks and consumes exactly once', () => {
    const sig = shareIntentSignature(intent({ type: 'text', text: 'abc' }));
    expect(sig).toBe('text||abc|');
    expect(
      setPendingShareCapture(
        [{ kind: 'text', text: 'abc' }],
        sig,
        new Date('2030-09-05T06:00:00Z'),
      ),
    ).toMatchObject({ signature: sig, receivedAt: '2030-09-05T06:00:00.000Z' });
    expect(peekPendingShareCapture()?.items).toHaveLength(1);
    expect(consumePendingShareCapture()?.items[0]).toEqual({ kind: 'text', text: 'abc' });
    expect(consumePendingShareCapture()).toBeNull();
  });

  it('ignores empty item lists', () => {
    expect(setPendingShareCapture([], 'x')).toBeNull();
    expect(peekPendingShareCapture()).toBeNull();
  });
});
