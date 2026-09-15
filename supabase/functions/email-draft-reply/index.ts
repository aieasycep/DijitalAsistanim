/**
 * POST /email-draft-reply { threadId, tone, instructions? } — AI reply draft in one of four tones.
 * The draft is only text: sending happens exclusively through an approval (email_send).
 */
import { draftReplyRequestSchema } from '@da/validation';
import { draftReplyForThread } from '../_shared/draft.ts';
import {
  adminClient,
  assertMethod,
  enforceRateLimit,
  handler,
  json,
  parseInput,
  requireUser,
} from '../_shared/mod.ts';

Deno.serve(
  handler(async (req) => {
    assertMethod(req, 'POST');
    const { user, db } = await requireUser(req);
    const input = await parseInput(req, draftReplyRequestSchema);
    await enforceRateLimit('ai_call', user.id);
    const response = await draftReplyForThread(db, adminClient(), {
      userId: user.id,
      threadId: input.threadId,
      tone: input.tone,
      instructions: input.instructions ?? null,
    });
    return json(response);
  }),
);
