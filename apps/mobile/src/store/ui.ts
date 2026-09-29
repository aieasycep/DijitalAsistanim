import { create } from 'zustand';
import type { BriefingAudio } from '@da/domain';

export interface AudioPlayerState {
  briefingId: string | null;
  title: string;
  chapters: BriefingAudio['chapters'];
  script: string;
  provider: 'device_tts' | 'server_tts';
  url?: string | null;
  playing: boolean;
  positionSec: number;
  durationSec: number;
  speed: 1 | 1.25 | 1.5;
  chapterIndex: number;
  visible: boolean;
}

interface UiState {
  offline: boolean;
  setOffline: (v: boolean) => void;
  audio: AudioPlayerState;
  setAudio: (patch: Partial<AudioPlayerState>) => void;
  closeAudio: () => void;
  pendingApprovals: number;
  setPendingApprovals: (n: number) => void;
  lastAnalyzedAt: string | null;
  setLastAnalyzedAt: (iso: string | null) => void;
}

const initialAudio: AudioPlayerState = {
  briefingId: null,
  title: '',
  chapters: [],
  script: '',
  provider: 'device_tts',
  url: null,
  playing: false,
  positionSec: 0,
  durationSec: 0,
  speed: 1,
  chapterIndex: 0,
  visible: false,
};

export const useUiStore = create<UiState>((set) => ({
  offline: false,
  setOffline: (offline) => set({ offline }),
  audio: initialAudio,
  setAudio: (patch) => set((s) => ({ audio: { ...s.audio, ...patch } })),
  closeAudio: () => set({ audio: initialAudio }),
  pendingApprovals: 0,
  setPendingApprovals: (pendingApprovals) => set({ pendingApprovals }),
  lastAnalyzedAt: null,
  setLastAnalyzedAt: (lastAnalyzedAt) => set({ lastAnalyzedAt }),
}));
