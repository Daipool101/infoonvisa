// Editing a corridor by hand: what may be changed, what a change must satisfy,
// and how every change is recorded.
//
// This is the half of the admin that writes, so it is deliberately stricter
// than the half that reads. Three rules shape it:
//
//  1. Nothing is saved that the reader-facing code could not render. A verdict
//     is one of five values, a fee has a date and a source, a URL parses. The
//     validation lives here rather than in the endpoint so the rules cannot
//     differ between the form, the API and any script that reuses them.
//
//  2. Every change writes down who made it and what it replaced. An
//     information site that cannot say "this line changed on the 3rd, by this
//     person, from that" is asking to be trusted rather than earning it. The
//     `before` value is what makes undo possible at all.
//
//  3. A field is only touched if it actually differs. Sending the whole form
//     back unchanged must produce no history entries, or the log fills with
//     noise and stops being readable.
import type { CorridorData, Source, Verdict, VerifiedFee, VisaOption } from './corridor';

export type FieldKey =
  | 'verdict'
  | 'verdictHeadline'
  | 'summary'
  | 'maxStayDays'
  | 'processingTime'
  | 'officialSource'
  | 'sources'
  | 'visaOptions'
  | 'fees';

/** Applied in this order: options must settle before fees are checked against them. */
export const FIELD_ORDER: FieldKey[] = [
  'verdict',
  'verdictHeadline',
  'summary',
  'maxStayDays',
  'processingTime',
  'officialSource',
  'sources',
  'visaOptions',
  'fees',
];

export const FIELD_LABEL: Record<FieldKey, string> = {
  verdict: 'Verdict',
  verdictHeadline: 'Headline',
  summary: 'Summary',
  maxStayDays: 'Max stay (days)',
  processingTime: 'Processing time',
  officialSource: 'Official source',
  sources: 'Sources',
  visaOptions: 'Visa options',
  fees: 'Fees',
};

export interface ChangeEntry {
  id: string;
  at: string;
  by: string;
  field: FieldKey;
  before: unknown;
  after: unknown;
  /** Set when this entry reverts an earlier one. An undo is itself a change. */
  undoOf?: string;
}

/** Keep the row small. Forty edits is far more history than a page will ever need. */
export const CHANGELOG_MAX = 40;

/** A validation failure the operator can read and act on. */
export class EditError extends Error {}

const VERDICTS: Verdict[] = ['visa_free', 'voa', 'evisa', 'eta', 'embassy'];

// Not a whitelist — government domains worldwide are far too varied for that —
// but a stop on the handful of sites that look like sources and are not. Shared
// with /api/admin/verify so the two can never disagree about what counts.
const NOT_A_SOURCE = /(^|\.)(wikipedia\.org|blogspot\.|medium\.com|quora\.com|tripadvisor\.)/i;

export function checkSourceUrl(raw: string, what = 'The source'): string {
  const value = (raw ?? '').trim();
  if (!value) throw new EditError(`${what} URL is required.`);
  let u: URL;
  try {
    u = new URL(value);
  } catch {
    throw new EditError(`${what} must be a valid http(s) URL.`);
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') {
    throw new EditError(`${what} must be a valid http(s) URL.`);
  }
  if (NOT_A_SOURCE.test(u.hostname)) {
    throw new EditError(`${u.hostname} is not an official government source.`);
  }
  // Returned as typed, not as `u.toString()`. URL normalisation appends a slash
  // to a bare origin, so re-saving an untouched form would look like an edit
  // and write a history entry every time.
  return value;
}

function text(raw: unknown, what: string, opts: { min?: number; max: number; required?: boolean }): string {
  const value = typeof raw === 'string' ? raw.trim().replace(/\s+/g, ' ') : '';
  if (!value) {
    if (opts.required) throw new EditError(`${what} cannot be empty.`);
    return '';
  }
  if (opts.min && value.length < opts.min) {
    throw new EditError(`${what} is too short — at least ${opts.min} characters.`);
  }
  if (value.length > opts.max) {
    throw new EditError(`${what} is too long — at most ${opts.max} characters.`);
  }
  return value;
}

// Paragraphs keep their line breaks; everything else is collapsed to one line.
function paragraph(raw: unknown, what: string, max: number): string {
  const value = typeof raw === 'string' ? raw.trim().replace(/[ \t]+/g, ' ') : '';
  if (!value) throw new EditError(`${what} cannot be empty.`);
  if (value.length > max) throw new EditError(`${what} is too long — at most ${max} characters.`);
  return value;
}

function source(raw: unknown, what: string): Source {
  const o = (raw ?? {}) as Record<string, unknown>;
  const url = checkSourceUrl(String(o.url ?? ''), what);
  // A label is what the reader sees. Falling back to the hostname beats an
  // empty link, and beats making the operator retype "Ministry of…" every time.
  const label = text(o.label, `${what} label`, { max: 160 }) || new URL(url).hostname;
  return { label, url };
}

function optionalDate(raw: unknown, what: string): string {
  const value = String(raw ?? '').trim();
  if (!value) throw new EditError(`${what} is required.`);
  const t = Date.parse(value);
  if (Number.isNaN(t)) throw new EditError(`${what} is not a date I can read (use YYYY-MM-DD).`);
  // A fee "verified" tomorrow has not been verified. Allow a day of slack for
  // whatever timezone the operator's browser is in.
  if (t > Date.now() + 36 * 3600 * 1000) throw new EditError(`${what} cannot be in the future.`);
  return new Date(t).toISOString().slice(0, 10);
}

/**
 * Normalise one field's incoming value.
 *
 * Every branch rebuilds the value with its keys in a fixed order. That is not
 * cosmetic: change detection compares JSON, and two objects that differ only in
 * key order would otherwise look like an edit and fill the history with
 * changes nobody made.
 */
export function sanitizeField(field: FieldKey, raw: unknown, options: VisaOption[]): unknown {
  switch (field) {
    case 'verdict': {
      const v = String(raw ?? '');
      if (!VERDICTS.includes(v as Verdict)) throw new EditError(`"${v}" is not a verdict.`);
      return v as Verdict;
    }

    case 'verdictHeadline':
      return text(raw, 'The headline', { min: 8, max: 180, required: true });

    case 'summary':
      return paragraph(raw, 'The summary', 4000);

    case 'maxStayDays': {
      if (raw === null || raw === '' || raw === undefined) return undefined;
      const n = Number(raw);
      if (!Number.isInteger(n) || n < 1 || n > 3650) {
        throw new EditError('Max stay must be a whole number of days between 1 and 3650, or left blank.');
      }
      return n;
    }

    case 'processingTime': {
      const v = text(raw, 'Processing time', { max: 160 });
      return v || undefined;
    }

    case 'officialSource':
      return source(raw, 'The official source');

    case 'sources': {
      const list = Array.isArray(raw) ? raw : [];
      if (!list.length) throw new EditError('A page must cite at least one source.');
      if (list.length > 12) throw new EditError('Twelve sources is plenty — trim the list.');
      const out = list.map((s, i) => source(s, `Source ${i + 1}`));
      const seen = new Set<string>();
      for (const s of out) {
        if (seen.has(s.url)) throw new EditError(`${s.url} is listed twice.`);
        seen.add(s.url);
      }
      return out;
    }

    case 'visaOptions': {
      const list = Array.isArray(raw) ? raw : [];
      if (!list.length) throw new EditError('A page needs at least one visa option.');
      if (list.length > 12) throw new EditError('Twelve options is more than a reader can use.');
      const out: VisaOption[] = list.map((o, i) => {
        const v = (o ?? {}) as Record<string, unknown>;
        const opt: VisaOption = { type: text(v.type, `Option ${i + 1} name`, { max: 120, required: true }) };
        const validity = text(v.validity, 'Validity', { max: 160 });
        const maxStay = text(v.maxStay, 'Max stay', { max: 160 });
        const entries = text(v.entries, 'Entries', { max: 80 });
        const eligibility = text(v.eligibility, 'Eligibility', { max: 600 });
        if (validity) opt.validity = validity;
        if (maxStay) opt.maxStay = maxStay;
        if (entries) opt.entries = entries;
        if (eligibility) opt.eligibility = eligibility;
        return opt;
      });
      // Duplicate names are allowed. Real pages have them — India→Norway lists
      // "Schengen Tourist Visa (Type C)" twice, once single entry and once
      // multiple, which is how Norway describes it. Refusing that would have
      // made the options panel unsavable on a page with nothing wrong with it.
      // The ambiguity it creates is handled where it actually bites: a fee.
      return out;
    }

    case 'fees': {
      const list = Array.isArray(raw) ? raw : [];
      if (!list.length) return undefined; // no fees is a valid, honest state
      const types = new Set(options.map((o) => o.type));
      const duplicated = new Set(options.map((o) => o.type).filter((t, i, a) => a.indexOf(t) !== i));
      const out: VerifiedFee[] = list.map((f, i) => {
        const v = (f ?? {}) as Record<string, unknown>;
        const appliesTo = text(v.appliesTo, `Fee ${i + 1} "applies to"`, { max: 120, required: true });
        // A fee pointing at an option that no longer exists would silently stop
        // being shown — the reader sees no price and nothing says why.
        if (appliesTo !== '*' && !types.has(appliesTo)) {
          throw new EditError(
            `Fee ${i + 1} applies to "${appliesTo}", which is not one of this page's options. ` +
              `Point it at an existing option, or delete it.`
          );
        }
        // Options may share a name; a fee may not point at a shared one. The
        // reader would see the same price on two rows that cost different
        // amounts — a single- and a multiple-entry visa, say — with nothing
        // on the page admitting the fee only really belongs to one of them.
        if (duplicated.has(appliesTo)) {
          throw new EditError(
            `Fee ${i + 1} applies to "${appliesTo}", and two options share that name. ` +
              `Give them distinguishing names first (for example "(single entry)" and ` +
              `"(multiple entry)"), so the fee lands on one of them.`
          );
        }
        const refundableRaw = v.refundable;
        const refundable =
          refundableRaw === true || refundableRaw === 'true'
            ? true
            : refundableRaw === false || refundableRaw === 'false'
              ? false
              : null;
        const fee: VerifiedFee = {
          appliesTo,
          amount: text(v.amount, `Fee ${i + 1} amount`, { max: 80, required: true }),
          refundable,
          verifiedOn: optionalDate(v.verifiedOn, `Fee ${i + 1} "verified on" date`),
          source: source(v.source, `Fee ${i + 1} source`),
        };
        const note = text(v.note, 'Fee note', { max: 200 });
        const refundableNote = text(v.refundableNote, 'Refundable note', { max: 300 });
        // Rebuilt in declaration order so the JSON comparison stays stable.
        return {
          appliesTo: fee.appliesTo,
          amount: fee.amount,
          ...(note ? { note } : {}),
          refundable: fee.refundable,
          ...(refundableNote ? { refundableNote } : {}),
          verifiedOn: fee.verifiedOn,
          source: fee.source,
        };
      });
      const seen = new Set<string>();
      for (const f of out) {
        if (seen.has(f.appliesTo)) throw new EditError(`Two fees both apply to "${f.appliesTo}".`);
        seen.add(f.appliesTo);
      }
      return out;
    }
  }
}

/**
 * Compare two values by content, ignoring the order their keys happen to sit in.
 *
 * The saved row came out of Postgres, the incoming one out of a form, and the
 * two build their objects in whatever order their code does. A plain
 * JSON.stringify comparison would call `{url, label}` and `{label, url}`
 * different and write a history entry for an edit nobody made.
 */
export function canonical(v: unknown): string {
  const walk = (x: unknown): unknown => {
    if (Array.isArray(x)) return x.map(walk);
    if (x && typeof x === 'object') {
      const o = x as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      for (const k of Object.keys(o).sort()) {
        if (o[k] === undefined) continue;
        out[k] = walk(o[k]);
      }
      return out;
    }
    return x;
  };
  return JSON.stringify(walk(v ?? null) ?? null);
}

const same = (a: unknown, b: unknown) => canonical(a) === canonical(b);

export type CorridorRecord = CorridorData & Record<string, unknown>;

/**
 * Apply a patch and return the new data plus one history entry per real change.
 *
 * Returns `changes: []` when nothing differed — the caller should then skip the
 * write entirely rather than touch the row for nothing.
 */
export function applyEdits(
  current: CorridorRecord,
  patch: Partial<Record<FieldKey, unknown>>,
  by: string,
  undoOf?: string
): { data: CorridorRecord; changes: ChangeEntry[] } {
  const data: CorridorRecord = { ...current };
  const changes: ChangeEntry[] = [];
  const at = new Date().toISOString();

  for (const field of FIELD_ORDER) {
    if (!(field in patch)) continue;
    // Fees are checked against the options as they will be after this save,
    // not as they were before it — otherwise renaming an option and repointing
    // its fee in one go would always fail.
    const options = (data.visaOptions ?? []) as VisaOption[];
    const next = sanitizeField(field, patch[field], options);
    const before = (current as Record<string, unknown>)[field];
    if (same(before, next)) continue;

    if (next === undefined) delete (data as Record<string, unknown>)[field];
    else (data as Record<string, unknown>)[field] = next;

    changes.push({
      id: `${Date.now().toString(36)}-${field}-${changes.length}`,
      at,
      by,
      field,
      before: before ?? null,
      after: next ?? null,
      ...(undoOf ? { undoOf } : {}),
    });
  }

  if (changes.length) {
    const log = Array.isArray(data.changeLog) ? (data.changeLog as ChangeEntry[]) : [];
    data.changeLog = [...changes, ...log].slice(0, CHANGELOG_MAX);
  }
  return { data, changes };
}

/**
 * The columns that duplicate something inside `data`.
 *
 * Postgres holds verdict, max_stay_days and sources both as columns and inside
 * the JSON. The sitemap and the hub pages read the columns; the corridor page
 * renders the JSON. Updating one and not the other is the single most damaging
 * mistake available here — it once shipped a page whose headline said "ETA
 * required" under a green "Visa-free" badge. Every write goes through this.
 */
export function mirroredColumns(data: CorridorRecord) {
  return {
    verdict: data.verdict,
    max_stay_days: data.maxStayDays ?? null,
    sources: data.sources ?? [],
  };
}

/** The most recent entry per field — the only ones it is safe to offer undo on. */
export function undoableIds(log: ChangeEntry[]): Set<string> {
  const seen = new Set<FieldKey>();
  const ids = new Set<string>();
  for (const e of log) {
    if (seen.has(e.field)) continue;
    seen.add(e.field);
    ids.add(e.id);
  }
  return ids;
}
