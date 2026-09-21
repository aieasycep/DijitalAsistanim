import type { Commitment, CommitmentDirection, Locale } from '@da/domain';
import type { CommitmentFormKind, CommitmentLanguage } from './shared';

export type { CommitmentFormKind, CommitmentLanguage } from './shared';

export interface CommitmentCounterpartHint {
  name?: string | null;
  email?: string | null;
}

export interface ExtractCommitmentsInput {
  text: string;
  /** True when the user wrote the text (sent mail, meeting notes, voice). */
  authorIsUser: boolean;
  /** The other party: recipient of a sent mail / sender of a received mail. Used when the sentence names nobody. */
  counterpartHint?: CommitmentCounterpartHint | null;
  /** Reference instant (ISO UTC) — message sentAt or note time. */
  now: string;
  /** IANA timezone used to resolve "yarın", "Cuma", "bu akşam". */
  timezone: string;
  locale?: Locale;
  /** Subject/topic used only to fill an empty object ("Cuma gönderirim" → "Teklifi gönder"). */
  topic?: string | null;
}

export interface CommitmentDue {
  /** Resolved instant (UTC). Date-only expressions resolve to 18:00 local (end of the working day). */
  iso: string;
  /** The matched span exactly as written ("yarın", "10 Eylül'e"). */
  text: string;
  /** Short verbatim snippet around the date. */
  evidence: string;
  /** False when the source named only a day. */
  hasTime: boolean;
  /** Local date key (YYYY-MM-DD) in the input timezone. */
  localDate: string;
}

export interface CommitmentCandidate {
  /** Normalized imperative ("Mehmet'e teklif gönder") or third-person future for the other party ("Mehmet dönüş yapacak"). */
  text: string;
  /** Verbatim clause the commitment was found in. */
  quote: string;
  direction: CommitmentDirection;
  counterpartName: string | null;
  due: CommitmentDue | null;
  dueText: string | null;
  /** 0.5 – 0.95 */
  confidence: number;
  /** Verbatim sentence (≤ 240 chars) that justifies the candidate. */
  evidence: string;
  /** Verb lemma that anchored the match: "gönder", "kontrol et", "send", "get back". */
  verb: string;
  language: CommitmentLanguage;
  form: CommitmentFormKind;
}

export interface NormalizeCommitmentOptions {
  direction?: CommitmentDirection;
  now?: string;
  timezone?: string;
  topic?: string | null;
}

export type CommitmentDraft = Omit<Commitment, 'id' | 'userId' | 'createdAt' | 'updatedAt'>;
