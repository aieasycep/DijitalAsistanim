/**
 * English clause analysis for commitments: "I'll / I will / we'll / going to + verb" first-person
 * promises, "can you / could you / please / I need you to / waiting for your …" requests. Negated
 * ("won't"), conditional ("if …") and question forms are rejected.
 */
import { extractDates, lowercasePreservingIndices, type ExtractedDate } from '../dates';
import { isNameToken, type AnalyzeOptions, type ClauseAnalysis, type ClauseName } from './shared';

const NB = '(?<![\\p{L}])';
const ADVERBS = '(?:(?:also|definitely|certainly|surely|just|quickly|gladly|then|probably|personally|of course|now|absolutely|still|first)\\s+)*';
const VERB = "(?<verb>[a-z]+(?:-[a-z]+)?)(?<rest>[^.!?;]*)";

const RE_NEG = new RegExp(
  `${NB}(?:i|we)\\s*(?:won't|will not|can't|cannot|couldn't|shan't|'ll not|'m not going to|am not going to|'re not going to|are not going to|do not think|don't think|'m unable to|am unable to|'m not able to|am not able to)`,
  'u',
);
const RE_FIRST = new RegExp(
  `${NB}(?:i|we)\\s*(?<aux>'ll|will|shall|'m going to|am going to|'re going to|are going to|'d be happy to|would be happy to|'ll be happy to|will be happy to|can|could|promise to|plan to|intend to|'m planning to|am planning to|'ll make sure to|will make sure to|'ll try to|will try to|'ll be sure to|will be sure to|'ll aim to|will aim to)\\s+${ADVERBS}${VERB}`,
  'u',
);
const RE_BARE_WILL = new RegExp(`^(?:will|'ll)\\s+${ADVERBS}${VERB}`, 'u');
const RE_REQ_MODAL = new RegExp(`${NB}(?:can|could|would|will)\\s+you\\s+(?:please\\s+|kindly\\s+)?${ADVERBS}${VERB}`, 'u');
const RE_REQ_NEED = new RegExp(`${NB}(?:i|we)\\s*(?:need|want|would like|'d like|expect|require|would need|'d need)\\s+you\\s+to\\s+${VERB}`, 'u');
const RE_REQ_PLEASE = new RegExp(`${NB}(?:please|kindly)\\s+${VERB}`, 'u');
const RE_REQ_WAIT = new RegExp(
  `${NB}(?:i|we)\\s*(?:'m|am|'re|are)?\\s*(?:still\\s+)?(?:waiting for|awaiting|looking forward to receiving|looking forward to|expecting)\\s+(?<obj>your\\s+[^.!?;,]+)`,
  'u',
);
const RE_REQ_SHORT = new RegExp(`${NB}(?<form>let me know|keep me posted|get back to me|send me|send us|share with me|share with us)(?<rest>[^.!?;]*)`, 'u');
const RE_CONDITIONAL = /^(?:if|unless|in case|should)\b|(?<![\p{L}])(?:if|unless|in case)\s+(?:you|i|we|they|it|he|she|that|this|the|there)\b/u;
const RE_HEDGES = /(?<![\p{L}])(?:if possible|if you can|if needed|if necessary|if you like|if you want|if you prefer|if that works|if it helps|if required)(?![\p{L}])/gu;
const RE_STRONG = /(?<![\p{L}])(?:definitely|certainly|promise|for sure|absolutely|guarantee|without fail)(?![\p{L}])/u;

/** Verbs whose object goes "to <name>" ("Send the proposal to Mehmet"). */
const TO_VERBS = new Set(['send', 'forward', 'share', 'deliver', 'submit', 'provide', 'return', 'pass', 'report', 'present', 'email', 'e-mail', 'mail', 'resend', 'upload', 'attach', 'post', 'ship', 'hand', 'give', 'bring', 'transfer']);
/** Verbs whose bare object is the counterpart ("Call Selin"). */
const CONTACT_VERBS = new Set(['call', 'ping', 'text', 'message', 'contact', 'reach', 'remind', 'notify', 'inform', 'update', 'meet', 'chase', 'brief', 'phone', 'ask', 'invite', 'cc']);
const REPLY_VERBS = new Set(['reply', 'respond', 'answer']);
const PLAIN_VERBS = new Set([
  'review', 'prepare', 'finish', 'complete', 'draft', 'write', 'fix', 'resolve', 'handle', 'book', 'schedule', 'confirm', 'arrange', 'organize', 'organise', 'set',
  'pay', 'sign', 'order', 'come', 'join', 'attend', 'publish', 'release', 'close', 'open', 'create', 'add', 'remove', 'cancel', 'investigate', 'test', 'verify',
  'double-check', 'revise', 'translate', 'print', 'pick', 'drop', 'work', 'start', 'begin', 'finalize', 'finalise', 'wrap', 'put', 'check', 'look', 'take', 'sort',
  'follow', 'circle', 'get', 'let', 'do', 'make', 'have', 'read', 'run', 'build', 'implement', 'deploy', 'merge', 'push', 'ship', 'process', 'approve', 'sync',
  'coordinate', 'plan', 'design', 'edit', 'proofread', 'clean', 'update', 'migrate', 'move', 'reschedule', 'reserve', 'renew', 'register', 'apply', 'collect',
  'gather', 'compile', 'summarize', 'summarise', 'document', 'record', 'measure', 'calculate', 'estimate', 'quote', 'invoice', 'refund', 'settle', 'reimburse',
]);
const BLOCKED_VERBS = new Set(['be', 'see', 'know', 'think', 'hope', 'need', 'want', 'keep', 'stay', 'wait', 'miss', 'love', 'like', 'remember', 'try', 'go', 'feel', 'find', 'note', 'appreciate', 'understand', 'assume', 'guess', 'say', 'tell', 'hear', 'talk', 'speak', 'discuss', 'consider', 'look', 'let']);
const PHRASAL: Record<string, string[]> = {
  get: ['back'],
  follow: ['up'],
  circle: ['back'],
  check: ['in', 'on'],
  look: ['into', 'over', 'at'],
  take: ['care of', 'over'],
  sort: ['out'],
  set: ['up'],
  pick: ['up'],
  drop: ['off'],
  work: ['on'],
  wrap: ['up'],
  put: ['together'],
  reach: ['out to', 'out'],
  hand: ['over', 'in'],
  pass: ['on', 'along'],
  send: ['over', 'across', 'through'],
  let: ['know'],
  find: ['out'],
  fill: ['in', 'out'],
};

const RE_NAME_AFTER = /(?<![\p{L}])(?:to|with|for|call|ping|email|e-mail|text|message|ask|remind|notify|inform|update|contact|cc|meet|brief|chase|phone)\s+(?<name>\p{Lu}\p{Ll}+(?:\s+\p{Lu}\p{Ll}+)?)(?![\p{L}])/gu;

interface Groups {
  verb?: string;
  rest?: string;
  aux?: string;
  obj?: string;
  form?: string;
}

function findNames(clause: string, dates: ExtractedDate[]): ClauseName[] {
  const out: ClauseName[] = [];
  RE_NAME_AFTER.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = RE_NAME_AFTER.exec(clause)) !== null) {
    const name = m.groups?.name ?? '';
    const nameStart = m.index + m[0].length - name.length;
    const nameEnd = m.index + m[0].length;
    if (dates.some((d) => nameStart < d.end && nameEnd > d.start)) continue;
    if (!name.split(/\s+/u).every((t) => isNameToken(t))) continue;
    const withPrep = /^(?:to|with|for)\s/u.test(m[0]);
    out.push({ name, phrase: withPrep ? m[0] : name, start: withPrep ? m.index : nameStart, end: nameEnd, kase: 'none' });
  }
  return out;
}

function stripObject(original: string, restStart: number, restEnd: number, dates: ExtractedDate[], removeSpan: { start: number; end: number } | null): { object: string; addressesYou: boolean } {
  let text = original.slice(restStart, restEnd);
  const cut = (s: number, e: number): void => {
    const a = Math.max(0, s - restStart);
    const b = Math.min(text.length, e - restStart);
    if (a < b) text = `${text.slice(0, a)}${' '.repeat(b - a)}${text.slice(b)}`;
  };
  for (const d of dates) if (d.start < restEnd && d.end > restStart) cut(d.start, d.end);
  if (removeSpan) cut(removeSpan.start, removeSpan.end);
  const lower = lowercasePreservingIndices(text);
  const addressesYou = /(?<![\p{L}])(?:you|your)(?![\p{L}])/u.test(lower);
  const cleaned = text
    .replace(/(?<![\p{L}])(?:to|for|with)\s+(?:you|us|me)(?![\p{L}])/giu, ' ')
    .replace(/^\s*(?:you|me|us|him|her|them)(?![\p{L}])/iu, ' ')
    .replace(/(?<![\p{L}])(?:please|kindly|asap|as soon as possible|then|also|too|of course|again|right away|straight away|today itself)(?![\p{L}])/giu, ' ')
    .replace(/(?<![\p{L}])(?:by|before|until|till|no later than|not later than|on|at|in|within|during|from|after|around|latest|at the latest|end of day|eod|cob)(?![\p{L}])(?=\s*(?:$|[,.;]|\s))/giu, ' ')
    .replace(/(?<![\p{L}])(?:so that|so|because|since|once|as soon as|when|while|and then|and)\s.*$/iu, ' ')
    .replace(/\s+/gu, ' ')
    .replace(/^[\s,;:\-–]+|[\s,;:\-–]+$/gu, '')
    .trim();
  return { object: cleaned, addressesYou };
}

function lemmaAndPhrasal(verb: string, restLower: string): { lemma: string; particle: string | null } {
  const particles = PHRASAL[verb];
  if (particles) {
    for (const p of particles) {
      const re = new RegExp(`^\\s*(?:(?:you|me|us|him|her|them)\\s+)?${p.replace(/\s+/g, '\\s+')}(?![\\p{L}])`, 'iu');
      if (re.test(restLower)) return { lemma: `${verb} ${p}`, particle: p };
    }
  }
  return { lemma: verb, particle: null };
}

function isCommitmentVerb(verb: string, restLower: string): boolean {
  if (TO_VERBS.has(verb) || CONTACT_VERBS.has(verb) || REPLY_VERBS.has(verb) || PLAIN_VERBS.has(verb)) return true;
  if (verb === 'have') return /\b(?:ready|done|finished|sorted|prepared)\b/u.test(restLower);
  return false;
}

function baseAnalysis(partial: Omit<ClauseAnalysis, 'language'>): ClauseAnalysis {
  return { language: 'en', ...partial };
}

export function analyzeEnglishClause(clause: string, opts: AnalyzeOptions): ClauseAnalysis | null {
  const trimmed = clause.trim();
  if (!trimmed) return null;
  const lower = lowercasePreservingIndices(clause);
  const unhedged = lower.replace(RE_HEDGES, (h) => ' '.repeat(h.length));
  const question = /\?\s*$/u.test(trimmed);
  const conditional = RE_CONDITIONAL.test(unhedged.trim());
  const dates = extractDates({ text: clause, now: opts.now, timezone: opts.timezone });
  const names = findNames(clause, dates);
  const strong = RE_STRONG.test(lower);

  // 1) first-person promises
  if (RE_NEG.test(lower)) return null;
  const first = RE_FIRST.exec(lower) ?? RE_BARE_WILL.exec(lower.trim() === lower ? lower : lower);
  const fg = (first?.groups ?? {}) as Groups;
  if (first && fg.verb && fg.rest !== undefined) {
    if (question || conditional) return null;
    const verb = fg.verb;
    const restStart = first.index + first[0].length - fg.rest.length;
    const restEnd = first.index + first[0].length;
    const restLower = lower.slice(restStart, restEnd);
    const { lemma, particle } = lemmaAndPhrasal(verb, restLower);
    if (BLOCKED_VERBS.has(verb) && !particle) return null;
    const known = isCommitmentVerb(verb, restLower) || particle !== null;
    const aux = fg.aux ?? 'will';
    let baseConfidence = 0.8;
    if (/promise/u.test(aux)) baseConfidence = 0.85;
    else if (/can|could/u.test(aux)) baseConfidence = 0.55;
    else if (/try|aim/u.test(aux)) baseConfidence = 0.58;
    else if (/plan|intend|planning/u.test(aux)) baseConfidence = 0.66;
    else if (/happy/u.test(aux)) baseConfidence = 0.62;
    if (!first.groups?.aux) baseConfidence = 0.62; // bare "will send tomorrow"
    if (!known) baseConfidence -= 0.15;
    const objectStart = restStart + (particle ? particleOffset(restLower, particle) : 0);
    const clauseName = names.find((n) => n.start >= objectStart) ?? null;
    const { object, addressesYou } = stripObject(clause, objectStart, restEnd, dates, null);
    const objectWithoutName = clauseName ? stripObject(clause, objectStart, restEnd, dates, clauseName).object : object;
    return baseAnalysis({
      lemma,
      person: 'first',
      form: /can|could/u.test(aux) ? 'ability' : 'future',
      formText: clause.slice(first.index, restStart).trim(),
      object,
      objectWithoutName,
      clauseName,
      counterpartCase: 'none',
      baseConfidence,
      strong,
      addressesYou,
    });
  }

  // 2) requests addressed to the reader
  const req = detectRequest(lower);
  if (req) {
    if (conditional) return null;
    const restLower = lower.slice(req.restStart, req.restEnd);
    const { lemma, particle } = lemmaAndPhrasal(req.verb, restLower);
    if (req.kind === 'please' && !(isCommitmentVerb(req.verb, restLower) || particle)) return null;
    if (BLOCKED_VERBS.has(req.verb) && !particle) return null;
    const objectStart = req.restStart + (particle ? particleOffset(restLower, particle) : 0);
    const clauseName = names.find((n) => n.start >= objectStart) ?? null;
    const { object } = stripObject(clause, objectStart, req.restEnd, dates, null);
    return baseAnalysis({
      lemma,
      person: 'second',
      form: 'request',
      formText: clause.slice(req.start, req.restStart).trim(),
      object,
      objectWithoutName: object,
      clauseName,
      counterpartCase: 'none',
      baseConfidence: req.confidence,
      strong,
      addressesYou: true,
    });
  }
  if (question || conditional) return null;

  // 3) "waiting for your reply" expectations
  const wait = RE_REQ_WAIT.exec(lower);
  const wg = (wait?.groups ?? {}) as Groups;
  if (wait && wg.obj) {
    const noun = wg.obj.replace(/^your\s+/u, '').trim();
    const verbStart = wait.index;
    const mapped = expectationLemma(noun);
    return baseAnalysis({
      lemma: mapped.lemma,
      person: 'second',
      form: 'expectation',
      formText: clause.slice(verbStart, wait.index + wait[0].length).trim(),
      object: mapped.object,
      objectWithoutName: mapped.object,
      clauseName: null,
      counterpartCase: 'none',
      baseConfidence: 0.62,
      strong,
      addressesYou: true,
    });
  }
  return null;
}

function particleOffset(restLower: string, particle: string): number {
  const re = new RegExp(`^\\s*(?:(?:you|me|us|him|her|them)\\s+)?${particle.replace(/\s+/g, '\\s+')}`, 'iu');
  const m = re.exec(restLower);
  return m ? m[0].length : 0;
}

function expectationLemma(noun: string): { lemma: string; object: string } {
  const n = noun.replace(/\s+/gu, ' ').trim();
  if (/^(?:reply|response|answer|revert)\b/u.test(n)) return { lemma: 'reply', object: '' };
  if (/^feedback\b/u.test(n)) return { lemma: 'share', object: 'feedback' };
  if (/^approval\b/u.test(n)) return { lemma: 'approve', object: '' };
  if (/^confirmation\b/u.test(n)) return { lemma: 'confirm', object: '' };
  if (/^(?:update|status)\b/u.test(n)) return { lemma: 'send', object: 'an update' };
  if (/^(?:thoughts|comments|input|review)\b/u.test(n)) return { lemma: 'share', object: n };
  return { lemma: 'send', object: n };
}

interface RequestHit {
  verb: string;
  kind: 'modal' | 'need' | 'please' | 'short';
  start: number;
  restStart: number;
  restEnd: number;
  confidence: number;
}

function detectRequest(lower: string): RequestHit | null {
  const modal = RE_REQ_MODAL.exec(lower);
  const mg = (modal?.groups ?? {}) as Groups;
  if (modal && mg.verb && mg.rest !== undefined) {
    return { verb: mg.verb, kind: 'modal', start: modal.index, restStart: modal.index + modal[0].length - mg.rest.length, restEnd: modal.index + modal[0].length, confidence: /please|kindly/u.test(modal[0]) ? 0.75 : 0.7 };
  }
  const need = RE_REQ_NEED.exec(lower);
  const ng = (need?.groups ?? {}) as Groups;
  if (need && ng.verb && ng.rest !== undefined) {
    return { verb: ng.verb, kind: 'need', start: need.index, restStart: need.index + need[0].length - ng.rest.length, restEnd: need.index + need[0].length, confidence: 0.7 };
  }
  const short = RE_REQ_SHORT.exec(lower);
  const sg = (short?.groups ?? {}) as Groups;
  if (short && sg.form && sg.rest !== undefined) {
    const verb = sg.form.startsWith('let') ? 'let' : sg.form.startsWith('keep') ? 'keep' : sg.form.startsWith('get') ? 'get' : sg.form.startsWith('share') ? 'share' : 'send';
    const restStart = short.index + short[0].length - sg.rest.length;
    return { verb, kind: 'short', start: short.index, restStart: verb === 'let' || verb === 'get' ? short.index + 4 : restStart, restEnd: short.index + short[0].length, confidence: 0.62 };
  }
  const please = RE_REQ_PLEASE.exec(lower);
  const pg = (please?.groups ?? {}) as Groups;
  if (please && pg.verb && pg.rest !== undefined) {
    return { verb: pg.verb, kind: 'please', start: please.index, restStart: please.index + please[0].length - pg.rest.length, restEnd: please.index + please[0].length, confidence: 0.62 };
  }
  return null;
}

function cap(s: string): string {
  return s ? (s[0] ?? '').toUpperCase() + s.slice(1) : s;
}

export interface ComposeEnglishInput {
  analysis: ClauseAnalysis;
  direction: 'user_owes' | 'other_owes';
  counterpartFirstName: string | null;
  clauseNameIsCounterpart: boolean;
  topic?: string | null;
}

/** "Send the proposal to Mehmet" / "Call Selin" for the user; "Mehmet will send the proposal" for the other party. */
export function composeEnglish(input: ComposeEnglishInput): string {
  const { analysis: a, direction, counterpartFirstName, clauseNameIsCounterpart } = input;
  const [verb, ...particleParts] = a.lemma.split(' ');
  const particle = particleParts.join(' ');
  const head = verb ?? a.lemma;
  let object = clauseNameIsCounterpart ? a.objectWithoutName : a.object;
  if (!object && input.topic && !CONTACT_VERBS.has(head) && !REPLY_VERBS.has(head) && head !== 'get' && head !== 'let') {
    const t = input.topic.replace(/^(?:\s*(?:re|fwd?|fw)\s*:\s*)+/iu, '').trim();
    if (t && t.split(/\s+/u).length <= 4) object = t.toLowerCase();
  }
  const name = counterpartFirstName;
  const userOwes = direction === 'user_owes';
  const who = userOwes ? name : 'you';
  const verbPhrase = `${head}${particle ? ` ${particle}` : ''}`;
  let phrase: string;
  if (head === 'let' && particle === 'know') phrase = `let ${who ?? 'them'} know${object ? ` ${object}` : ''}`;
  else if (head === 'get' && particle === 'back') phrase = `get back to ${who ?? 'them'}`;
  else if (head === 'keep') phrase = `keep ${who ?? 'them'} posted`;
  else if ((head === 'follow' || head === 'circle' || head === 'check') && particle && !object) phrase = `${head} ${particle} with ${who ?? 'them'}`;
  else if (REPLY_VERBS.has(head)) phrase = object ? `${head} ${object}` : `${head} to ${who ?? 'them'}`;
  else if (userOwes && TO_VERBS.has(head) && who && !/(?<![\p{L}])(?:to|with)\s/u.test(object)) phrase = `${verbPhrase} ${object || 'it'} ${head === 'share' ? 'with' : 'to'} ${who}`;
  else if (CONTACT_VERBS.has(head) && !object) phrase = `${verbPhrase} ${who ?? 'them'}`;
  else phrase = `${verbPhrase}${object ? ` ${object}` : ''}`;
  phrase = phrase.replace(/\s+/gu, ' ').trim();
  if (userOwes) return cap(phrase);
  return `${name ?? 'They'} will ${phrase}`;
}
