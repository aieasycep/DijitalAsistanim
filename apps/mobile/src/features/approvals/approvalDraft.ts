/**
 * Edited-but-not-yet-approved payloads live in memory keyed by approval id, so leaving the card and
 * coming back (or the list re-rendering) keeps the user's edits until they approve, reject or discard.
 */
import { useCallback, useState } from 'react';

type Draft = Record<string, unknown>;

const drafts = new Map<string, Draft>();

export function getApprovalDraft(id: string): Draft | null {
  return drafts.get(id) ?? null;
}

export function setApprovalDraft(id: string, draft: Draft | null): void {
  if (draft) drafts.set(id, draft);
  else drafts.delete(id);
}

export function clearApprovalDrafts(): void {
  drafts.clear();
}

export function useApprovalDraft(id: string): [Draft | null, (draft: Draft | null) => void] {
  const [draft, setState] = useState<Draft | null>(() => getApprovalDraft(id));
  const setDraft = useCallback(
    (next: Draft | null) => {
      setApprovalDraft(id, next);
      setState(next);
    },
    [id],
  );
  return [draft, setDraft];
}
