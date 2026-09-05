/** JSON-schema helpers: zod → JSON schema, provider strict-mode compatibility, lenient JSON extraction. */
import { z } from 'zod';
import type { AiJsonSchema } from './types';

/** Build a provider-ready JSON schema from a zod schema (draft 2020-12, `$schema` removed). */
export function jsonSchemaFor(schema: z.ZodType): AiJsonSchema {
  const raw = z.toJSONSchema(schema, { unrepresentable: 'any' });
  return stripSchemaMeta(raw as AiJsonSchema);
}

/** Remove keys providers reject or ignore (`$schema`, `$id`). */
export function stripSchemaMeta(schema: AiJsonSchema): AiJsonSchema {
  const out: AiJsonSchema = {};
  for (const [key, value] of Object.entries(schema)) {
    if (key === '$schema' || key === '$id') continue;
    out[key] = value;
  }
  return out;
}

/** Keywords OpenAI strict mode rejects (it only supports a JSON-schema subset). */
const OPENAI_STRICT_UNSUPPORTED = new Set([
  'minLength',
  'maxLength',
  'pattern',
  'format',
  'minimum',
  'maximum',
  'exclusiveMinimum',
  'exclusiveMaximum',
  'multipleOf',
  'minItems',
  'maxItems',
  'uniqueItems',
  'default',
  'propertyNames',
  'patternProperties',
  'minProperties',
  'maxProperties',
]);

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * OpenAI `strict: true` requires every object to list all properties as required, forbid
 * additional properties and avoid validation keywords. Returns true only when the schema can be
 * sent unchanged in strict mode — otherwise the caller falls back to non-strict json_schema.
 */
export function isOpenAiStrictCompatible(schema: unknown): boolean {
  if (!isRecord(schema)) return true;
  for (const key of Object.keys(schema)) if (OPENAI_STRICT_UNSUPPORTED.has(key)) return false;
  if (schema.type === 'object' || isRecord(schema.properties)) {
    if (schema.additionalProperties !== false) return false;
    const properties = isRecord(schema.properties) ? schema.properties : {};
    const required = Array.isArray(schema.required) ? schema.required.filter((r): r is string => typeof r === 'string') : [];
    for (const name of Object.keys(properties)) if (!required.includes(name)) return false;
    for (const value of Object.values(properties)) if (!isOpenAiStrictCompatible(value)) return false;
  }
  if (schema.items !== undefined && !isOpenAiStrictCompatible(schema.items)) return false;
  for (const combinator of ['anyOf', 'oneOf', 'allOf'] as const) {
    const branches = schema[combinator];
    if (Array.isArray(branches)) for (const branch of branches) if (!isOpenAiStrictCompatible(branch)) return false;
  }
  return true;
}

/**
 * Pull a JSON value out of free-form model text: strips ``` fences and leading/trailing prose
 * around the outermost object/array. Returns `undefined` when nothing parseable is found.
 */
export function extractJson(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) return undefined;
  const direct = tryParse(trimmed);
  if (direct !== undefined) return direct;
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed);
  if (fenced?.[1]) {
    const inner = tryParse(fenced[1].trim());
    if (inner !== undefined) return inner;
  }
  const starts = [trimmed.indexOf('{'), trimmed.indexOf('[')].filter((i) => i >= 0);
  if (starts.length === 0) return undefined;
  const start = Math.min(...starts);
  const open = trimmed[start];
  const close = open === '{' ? '}' : ']';
  const end = trimmed.lastIndexOf(close);
  if (end <= start) return undefined;
  return tryParse(trimmed.slice(start, end + 1));
}

function tryParse(s: string): unknown {
  try {
    return JSON.parse(s) as unknown;
  } catch {
    return undefined;
  }
}

/** Compact, content-free description of validation failures for the repair prompt. */
export function formatZodIssues(error: z.ZodError, maxIssues = 12): string {
  const lines = error.issues.slice(0, maxIssues).map((issue) => {
    const path = issue.path.length ? issue.path.map(String).join('.') : '(root)';
    return `- ${path}: ${issue.message}`;
  });
  if (error.issues.length > maxIssues) lines.push(`- … ve ${error.issues.length - maxIssues} sorun daha`);
  return lines.join('\n');
}
