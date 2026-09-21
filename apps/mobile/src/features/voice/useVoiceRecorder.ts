/**
 * React binding over the process-wide microphone session (`@/services/speech`): start/stop with the
 * permission outcome mapped to a screen status, live level for `<Waveform live>`, and transcription
 * (server STT → optional on-device provider). When no provider can transcribe, callers fall back to
 * typed input — nothing is guessed.
 */
import { useCallback, useEffect, useState } from 'react';
import type { SharedValue } from 'react-native-reanimated';
import { useDataSource } from '@/hooks/useDataSource';
import {
  TranscriptionError,
  transcribe,
  voiceRecorder,
  type VoiceInputState,
  type VoiceRecording,
} from '@/services/speech';

export type VoiceRecorderStatus =
  'idle' | 'recording' | 'transcribing' | 'denied' | 'unavailable' | 'error';

export type TranscribeResult =
  | { kind: 'text'; text: string }
  | { kind: 'no_provider' }
  | { kind: 'empty' }
  | { kind: 'error'; error: unknown };

export interface VoiceRecorderHandle {
  status: VoiceRecorderStatus;
  isRecording: boolean;
  durationSec: number;
  /** Live input level 0..1 (Reanimated shared value) for `<Waveform live level={…}>`. */
  level: SharedValue<number>;
  /** Resolves to the status after the attempt (`'recording'` when it started) — never read `status` right after. */
  start: () => Promise<VoiceRecorderStatus>;
  stop: () => Promise<VoiceRecording | null>;
  cancel: () => Promise<void>;
  transcribe: (recording: VoiceRecording) => Promise<TranscribeResult>;
  /** Stop the current recording and transcribe it in one go. */
  finish: () => Promise<TranscribeResult>;
  reset: () => void;
}

export function useVoiceRecorder(): VoiceRecorderHandle {
  const ds = useDataSource();
  const [state, setState] = useState<VoiceInputState>(() => voiceRecorder.getState());
  const [status, setStatus] = useState<VoiceRecorderStatus>('idle');

  useEffect(() => {
    const unsubscribe = voiceRecorder.subscribe(setState);
    return () => {
      unsubscribe();
      if (voiceRecorder.getState().status !== 'idle') void voiceRecorder.cancel();
    };
  }, []);

  const start = useCallback(async (): Promise<VoiceRecorderStatus> => {
    const outcome = await voiceRecorder.start();
    // 'busy' means a recording is already running: leave the state alone.
    if (outcome === 'busy') return 'recording';
    const next: VoiceRecorderStatus =
      outcome === 'started'
        ? 'recording'
        : outcome === 'permissionDenied'
          ? 'denied'
          : outcome === 'unsupported'
            ? 'unavailable'
            : 'error';
    setStatus(next);
    return next;
  }, []);

  const stop = useCallback(async (): Promise<VoiceRecording | null> => {
    const recording = await voiceRecorder.stop();
    setStatus('idle');
    return recording;
  }, []);

  const cancel = useCallback(async () => {
    await voiceRecorder.cancel();
    setStatus('idle');
  }, []);

  const runTranscribe = useCallback(
    async (recording: VoiceRecording): Promise<TranscribeResult> => {
      setStatus('transcribing');
      try {
        const result = await transcribe(ds, recording);
        setStatus('idle');
        return { kind: 'text', text: result.text };
      } catch (error) {
        if (error instanceof TranscriptionError) {
          if (error.reason === 'unsupported') {
            setStatus('unavailable');
            return { kind: 'no_provider' };
          }
          if (error.reason === 'empty') {
            setStatus('idle');
            return { kind: 'empty' };
          }
        }
        setStatus('error');
        return { kind: 'error', error };
      }
    },
    [ds],
  );

  const finish = useCallback(async (): Promise<TranscribeResult> => {
    const recording = await stop();
    if (!recording) return { kind: 'empty' };
    return runTranscribe(recording);
  }, [stop, runTranscribe]);

  return {
    status,
    isRecording: state.status === 'recording',
    durationSec: state.durationSec,
    level: voiceRecorder.level,
    start,
    stop,
    cancel,
    transcribe: runTranscribe,
    finish,
    reset: () => setStatus('idle'),
  };
}
