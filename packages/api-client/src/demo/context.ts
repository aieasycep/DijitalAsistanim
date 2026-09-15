import type { ISODateTime, UUID } from '@da/domain';
import type { DataSourceConfig } from '../config';
import type { AuthSession, Unsubscribe } from '../datasource';
import type { DemoClock } from './clock';
import type { Latency, Timings } from './latency';
import type { DemoState, DemoStore } from './state';

export class Emitter<T> {
  private readonly listeners = new Set<(value: T) => void>();

  on(cb: (value: T) => void): Unsubscribe {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  emit(value: T): void {
    for (const listener of Array.from(this.listeners)) listener(value);
  }
}

/** Shared plumbing handed to every API group of the demo adapter. */
export interface DemoContext {
  config: DataSourceConfig;
  clock: DemoClock;
  store: DemoStore;
  timings: Timings;
  latency: Latency;
  userId: UUID;
  /** Greeting / signature first name. */
  userName: string;
  webUrl: string;
  pendingChanged: Emitter<number>;
  authChanged: Emitter<AuthSession | null>;
  /** Waits for hydration + simulated latency, then runs the handler. */
  run<T>(fn: () => T | Promise<T>): Promise<T>;
  nowIso(): ISODateTime;
  nextId(): UUID;
  /** Fresh fixture state (used by reset / clearLocalState). */
  seed(): DemoState;
  /** Wiped state after account deletion. */
  emptySeed(): DemoState;
}
