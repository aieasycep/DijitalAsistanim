import type { z } from '@da/validation';
import { ClientApiError } from '../errors';

/** Parses `input` with a zod schema or throws a `validation` ClientApiError with readable Turkish details. */
export function validate<T extends z.ZodTypeAny>(schema: T, input: unknown): z.infer<T> {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  const issues = result.error.issues.map((issue) => ({
    path: issue.path.map(String).join('.'),
    message: issue.message,
  }));
  const summary = issues
    .map((i) => (i.path ? `${i.path}: ${i.message}` : i.message))
    .slice(0, 5)
    .join(', ');
  throw new ClientApiError(
    { code: 'validation', message: `Geçersiz istek: ${summary}`, details: { issues } },
    400,
  );
}

export function notFound(what: string, id: string): ClientApiError {
  return new ClientApiError(
    { code: 'not_found', message: `${what} bulunamadı.`, details: { id } },
    404,
  );
}

export function conflict(message: string): ClientApiError {
  return new ClientApiError({ code: 'conflict', message }, 409);
}
