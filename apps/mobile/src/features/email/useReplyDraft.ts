import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { DraftReplyResponse, ReplyTone } from '@da/domain';
import { useDataSource } from '@/hooks/useDataSource';

/**
 * AI draft for a thread (per tone) or for a follow-up. The editor shows the latest draft until the
 * user edits it; edits are tied to the draft they were made on, so a tone change or "Yeniden Yaz"
 * naturally replaces the text with the new draft (no effect needed).
 */
export function useReplyDraft(threadId: string | undefined, followUpId: string | undefined) {
  const ds = useDataSource();
  const [tone, setTone] = useState<ReplyTone>('professional');
  const [edit, setEdit] = useState<{ draft: DraftReplyResponse; text: string } | null>(null);

  const query = useQuery({
    queryKey: ['replyDraft', threadId ?? '', followUpId ?? null, followUpId ? 'follow_up' : tone],
    queryFn: () =>
      followUpId
        ? ds.email.draftFollowUpMessage(followUpId)
        : ds.email.draftReply({ threadId: threadId ?? '', tone }),
    enabled: Boolean(threadId),
    staleTime: 0,
    gcTime: 0,
  });

  const draft = query.data;
  const activeEdit = edit && draft && edit.draft === draft ? edit : null;
  const text = activeEdit?.text ?? draft?.draft ?? '';
  const edited = activeEdit !== null && activeEdit.text !== draft?.draft;

  const changeText = (next: string) => {
    if (!draft) return;
    setEdit({ draft, text: next });
  };

  return {
    ...query,
    draft,
    tone,
    changeTone: setTone,
    text,
    changeText,
    edited,
    regenerate: () => query.refetch(),
  };
}
