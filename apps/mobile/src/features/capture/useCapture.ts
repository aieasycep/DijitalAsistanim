/**
 * Universal Capture pipeline: pick (camera / library / document) or type (text / link) → upload →
 * createCapture → analyzeCapture. Pro-gated sources (PDF, file) ask the paywall first; quota errors do
 * the same with the capture context. Share-extension hand-offs enter through `startFromShare`.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ClientApiError, qk } from '@da/api-client';
import type { Capture, CaptureKind } from '@da/domain';
import { useToast } from '@da/ui';
import { useDataSource } from '@/hooks/useDataSource';
import { useEntitlement } from '@/hooks/useEntitlement';
import { describeError } from '@/lib/errors';
import { pickDocument, pickImage, type PickedMedia } from '@/services/media';
import { consumePendingShareCapture, type ShareCaptureItem } from '@/services/shareCapture';
import { openAppSettings } from '@/services/handoff';

export type CaptureSource = 'camera' | 'photo' | 'pdf' | 'file' | 'link' | 'text';

export type CapturePhase =
  | { kind: 'idle' }
  | { kind: 'uploading' }
  | { kind: 'analyzing'; capture: Capture }
  | { kind: 'done'; capture: Capture }
  | { kind: 'error'; error: unknown };

const URL_RE = /^https?:\/\/[^\s]+$/i;

export function isValidCaptureUrl(value: string): boolean {
  return URL_RE.test(value.trim());
}

export function useCapture(initialId?: string | null) {
  const { t } = useTranslation();
  const ds = useDataSource();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { gate } = useEntitlement();
  const [phase, setPhase] = useState<CapturePhase>({ kind: 'idle' });
  const [sharedItem, setSharedItem] = useState<ShareCaptureItem | null>(() =>
    initialId ? null : (consumePendingShareCapture()?.items[0] ?? null),
  );
  const lastRun = useRef<(() => Promise<Capture>) | null>(null);

  const fail = useCallback(
    (error: unknown) => {
      setPhase({ kind: 'error', error });
      const code = ClientApiError.from(error).code;
      if (code === 'quota_exceeded') {
        toast.show({ message: t('capture.quota'), icon: 'lock', iconTone: 'critical' });
        gate('advanced_capture', 'capture');
        return;
      }
      toast.show({
        message: describeError(error, t).title,
        icon: 'conflict',
        iconTone: 'critical',
      });
    },
    [gate, t, toast],
  );

  const run = useCallback(
    async (create: () => Promise<Capture>): Promise<Capture | null> => {
      lastRun.current = create;
      setPhase({ kind: 'uploading' });
      try {
        const created = await create();
        setPhase({ kind: 'analyzing', capture: created });
        const analyzed =
          created.status === 'analyzed' ? created : await ds.capture.analyzeCapture(created.id);
        setPhase({ kind: 'done', capture: analyzed });
        queryClient.setQueryData(qk.capture(analyzed.id), analyzed);
        await queryClient.invalidateQueries({ queryKey: qk.captures });
        return analyzed;
      } catch (error) {
        fail(error);
        return null;
      }
    },
    [ds, fail, queryClient],
  );

  const submitText = useCallback(
    (text: string, origin: Capture['origin'] = 'in_app') => {
      const trimmed = text.trim();
      if (!trimmed) return Promise.resolve(null);
      return run(() => ds.capture.createCapture({ kind: 'text', text: trimmed, origin }));
    },
    [ds, run],
  );

  const submitLink = useCallback(
    (url: string, origin: Capture['origin'] = 'in_app') => {
      const trimmed = url.trim();
      if (!isValidCaptureUrl(trimmed)) {
        toast.show({ message: t('capture.linkBlocked'), icon: 'conflict', iconTone: 'critical' });
        return Promise.resolve(null);
      }
      return run(() => ds.capture.createCapture({ kind: 'link', url: trimmed, origin }));
    },
    [ds, run, t, toast],
  );

  const submitFile = useCallback(
    (
      asset: {
        uri: string;
        mimeType: string;
        fileName: string;
        sizeBytes: number | null;
        kind: CaptureKind;
      },
      origin: Capture['origin'] = 'in_app',
    ) =>
      run(async () => {
        const { storagePath } = await ds.capture.uploadCaptureFile({
          uri: asset.uri,
          mimeType: asset.mimeType,
          sizeBytes: asset.sizeBytes ?? 0,
          fileName: asset.fileName,
        });
        return ds.capture.createCapture({
          kind: asset.kind,
          storagePath,
          mimeType: asset.mimeType,
          sizeBytes: asset.sizeBytes ?? undefined,
          origin,
        });
      }),
    [ds, run],
  );

  const handlePick = useCallback(
    async (result: Awaited<ReturnType<typeof pickImage>>) => {
      switch (result.status) {
        case 'picked':
          return submitFile(result.asset);
        case 'cancelled':
          return null;
        case 'rejected':
          toast.show({
            message:
              result.reason === 'tooLarge' ? t('capture.tooLarge') : t('capture.unsupported'),
            icon: 'conflict',
            iconTone: 'critical',
          });
          return null;
        case 'permissionDenied':
          toast.show({
            message: t('capture.permissionDenied'),
            icon: 'lock',
            iconTone: 'critical',
            actionLabel: t('assistant.voice.openSettings'),
            onAction: () => void openAppSettings(),
          });
          return null;
        case 'failed':
          toast.show({
            message: t('errors.captureFailed'),
            icon: 'conflict',
            iconTone: 'critical',
          });
          return null;
      }
    },
    [submitFile, t, toast],
  );

  /** Camera / photo library / PDF / any file. PDF and file are Pro. */
  const pick = useCallback(
    async (source: Exclude<CaptureSource, 'link' | 'text'>): Promise<Capture | null> => {
      if ((source === 'pdf' || source === 'file') && !gate('advanced_capture', 'capture'))
        return null;
      const result =
        source === 'camera' || source === 'photo'
          ? await pickImage({ camera: source === 'camera' })
          : await pickDocument({ kinds: [source] });
      return handlePick(result);
    },
    [gate, handlePick],
  );

  const load = useCallback(
    (id: string) =>
      run(async () => {
        const capture = await ds.capture.getCapture(id);
        return capture;
      }),
    [ds, run],
  );

  const startFromShare = useCallback(
    (item: ShareCaptureItem): Promise<Capture | null> => {
      if (item.rejected) {
        toast.show({
          message: item.rejected === 'tooLarge' ? t('capture.tooLarge') : t('capture.unsupported'),
          icon: 'conflict',
          iconTone: 'critical',
        });
        return Promise.resolve(null);
      }
      const origin: Capture['origin'] = 'share_extension';
      if (item.kind === 'link' && item.url) return submitLink(item.url, origin);
      if (item.kind === 'text' && item.text) return submitText(item.text, origin);
      if (item.file) {
        const file: PickedMedia = { ...item.file, kind: item.kind };
        if ((item.kind === 'pdf' || item.kind === 'file') && !gate('advanced_capture', 'capture'))
          return Promise.resolve(null);
        return submitFile(file, origin);
      }
      return Promise.resolve(null);
    },
    [gate, submitFile, submitLink, submitText, t, toast],
  );

  const retry = useCallback(() => {
    if (lastRun.current) void run(lastRun.current);
  }, [run]);

  const reset = useCallback(() => {
    lastRun.current = null;
    setPhase({ kind: 'idle' });
    setSharedItem(null);
  }, []);

  // Entry: `?id=` (share extension already created the capture) or a pending native share. The
  // async work is scheduled after mount (never a synchronous state update inside the effect) and
  // guarded so StrictMode's double-invocation still starts it exactly once.
  const booted = useRef(false);
  useEffect(() => {
    const timer = setTimeout(() => {
      if (booted.current) return;
      booted.current = true;
      if (initialId) void load(initialId);
      else if (sharedItem) void startFromShare(sharedItem);
    }, 0);
    return () => clearTimeout(timer);
  }, [initialId, sharedItem, load, startFromShare]);

  return {
    phase,
    sharedItem,
    submitText,
    submitLink,
    pick,
    retry,
    reset,
    busy: phase.kind === 'uploading' || phase.kind === 'analyzing',
  };
}
