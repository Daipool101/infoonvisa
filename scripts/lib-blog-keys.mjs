// The API key pool, and the rotation that is the whole point of it.
//
// Google's AI Studio free tier allows 20 requests per day per model
// (GenerateRequestsPerDayPerProjectPerModel-FreeTier). A weekly blog run needs
// about five to seven. One key is therefore enough — until it is not: a key gets
// revoked, or rotated, or a retry burns the day's allowance, and then the run
// dies at 2am with nothing to show.
//
// So the job holds several keys and moves between them. A 429 is "use the next
// one", not "stop". Only when every key is spent does the run end, and then it
// says which keys it tried and when the quota resets, because "it failed" with
// no detail is the failure mode this project keeps having to fix.
//
// Vertex credentials are deliberately absent from this module. Corridor
// generation runs on Vertex and must not compete with the blog for quota, so
// the blog job has no way to reach them even by accident.

const MODEL = 'gemini-2.5-flash';
const ENDPOINT = (model, key) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;

/** Thrown when every key in the pool is spent. Carries what to tell the owner. */
export class PoolExhaustedError extends Error {
  constructor(tried) {
    const when = new Date();
    when.setUTCHours(24, 0, 0, 0); // Google's free-tier counters reset at UTC midnight
    super(
      `All ${tried.length} API key(s) are out of quota. ` +
        `Tried: ${tried.map((t) => t.label).join(', ')}. ` +
        `Google's free-tier counters reset at ${when.toISOString().replace('T', ' ').slice(0, 16)} UTC.`
    );
    this.tried = tried;
    this.resetsAt = when;
  }
}

const today = () => new Date().toISOString().slice(0, 10);

export class KeyPool {
  /**
   * @param {import('@supabase/supabase-js').SupabaseClient} db service-role client
   */
  constructor(db) {
    this.db = db;
    this.keys = [];
    this.calls = new Map(); // id -> calls made in THIS run
  }

  async load() {
    const { data, error } = await this.db
      .from('blog_api_keys')
      .select('id,label,api_key,calls_today,calls_date,exhausted_at')
      .eq('enabled', true);
    if (error) throw new Error(`cannot read key pool: ${error.message}`);
    if (!data?.length) {
      throw new Error(
        'No enabled API keys. Add at least one Google AI Studio key at /admin/blog ' +
          '(aistudio.google.com/apikey — the free tier is enough for a weekly run).'
      );
    }

    const d = today();
    // A counter from yesterday is not a counter. Treat a stale date as zero
    // rather than carrying a dead number into today's budgeting.
    this.keys = data
      .map((k) => ({
        ...k,
        usedToday: k.calls_date === d ? k.calls_today : 0,
        spent: false,
      }))
      // Freshest first: least used today, then whichever was exhausted longest ago.
      .sort((a, b) => a.usedToday - b.usedToday || String(a.exhausted_at ?? '').localeCompare(String(b.exhausted_at ?? '')));

    return this.keys.length;
  }

  /** Per-key call counts for this run, for the run record and the UI. */
  usage() {
    return this.keys
      .filter((k) => this.calls.get(k.id))
      .map((k) => ({ label: k.label, calls: this.calls.get(k.id) }));
  }

  get totalCalls() {
    return [...this.calls.values()].reduce((a, b) => a + b, 0);
  }

  async #markUsed(key) {
    const d = today();
    key.usedToday = (key.calls_date === d ? key.calls_today : 0) + (this.calls.get(key.id) ?? 0);
    await this.db
      .from('blog_api_keys')
      .update({ calls_today: key.usedToday, calls_date: d, last_used_at: new Date().toISOString() })
      .eq('id', key.id);
  }

  async #markSpent(key) {
    key.spent = true;
    await this.db
      .from('blog_api_keys')
      .update({ exhausted_at: new Date().toISOString() })
      .eq('id', key.id);
  }

  /**
   * One generateContent call, rotating keys on quota and retrying transient
   * failures.
   *
   * `attemptsPerKey` is deliberately small. A retry on a free tier is not free:
   * it spends the same budget the next article needs. Two attempts covers a
   * blip; more would quietly eat the run.
   */
  async call({ prompt, tools, config = {}, label = 'call', attemptsPerKey = 2 }) {
    const tried = [];

    for (const key of this.keys) {
      if (key.spent) continue;

      for (let attempt = 1; attempt <= attemptsPerKey; attempt++) {
        let res;
        try {
          res = await fetch(ENDPOINT(MODEL, key.api_key), {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              contents: [{ role: 'user', parts: [{ text: prompt }] }],
              ...(tools ? { tools } : {}),
              generationConfig: { temperature: 0, maxOutputTokens: 8192, ...config },
            }),
          });
        } catch (e) {
          // Network-level failure — worth one more go on the same key.
          if (attempt === attemptsPerKey) break;
          await new Promise((r) => setTimeout(r, 3000));
          continue;
        }

        this.calls.set(key.id, (this.calls.get(key.id) ?? 0) + 1);
        await this.#markUsed(key);

        if (res.ok) {
          process.stdout.write(`    ${label}: ok via "${key.label}"\n`);
          return res.json();
        }

        const body = (await res.text()).slice(0, 300);

        if (res.status === 429) {
          process.stdout.write(`    ${label}: "${key.label}" out of quota — rotating\n`);
          await this.#markSpent(key);
          tried.push({ label: key.label, status: 429 });
          break; // next key, not next attempt
        }

        if (res.status >= 500 && attempt < attemptsPerKey) {
          process.stdout.write(`    ${label}: ${res.status} from "${key.label}", retrying\n`);
          await new Promise((r) => setTimeout(r, 5000));
          continue;
        }

        // 400s other than quota are our fault, not the key's. Failing loudly
        // beats burning every key on the same malformed request.
        throw new Error(`Gemini ${res.status}: ${body}`);
      }

      if (!key.spent) tried.push({ label: key.label, status: 'failed' });
    }

    throw new PoolExhaustedError(tried.length ? tried : this.keys.map((k) => ({ label: k.label })));
  }
}

/** Text of a generateContent response, joining multi-part answers. */
export const textOf = (json) =>
  (json?.candidates?.[0]?.content?.parts ?? []).map((p) => p?.text).filter(Boolean).join('\n');

/** URLs the API says it actually fetched — not the model's claims about them. */
export const retrievedUrls = (json) =>
  (json?.candidates?.[0]?.urlContextMetadata?.urlMetadata ?? [])
    .filter((m) => String(m?.urlRetrievalStatus ?? '').includes('SUCCESS'))
    .map((m) => m.retrievedUrl)
    .filter(Boolean);

/** Titles of pages search surfaced. Usually bare domains. */
export const searchTitles = (json) =>
  (json?.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [])
    .map((c) => c?.web?.title)
    .filter(Boolean);
