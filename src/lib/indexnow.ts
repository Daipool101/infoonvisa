// Tell Bing, Yandex, Seznam and Naver that a page changed.
//
// The key is public by design: IndexNow proves ownership by fetching
// https://infoonvisa.com/<key>.txt, so the file lives in public/ and the value
// below is not a secret. It must stay identical to scripts/indexnow.mjs.
//
// The status code is the whole point of this module. IndexNow answers 202 for
// a submission it has accepted but not acted on — in practice a 154-URL batch
// once returned 202 and never reached Bing at all. Only 200 means the URLs were
// taken, so the caller is told the number, not a boolean.
const KEY = 'a62d09a38dbf478d814ae3dbf091fc68';
const HOST = 'infoonvisa.com';

export interface PingResult {
  status: number;
  accepted: boolean;
  urls: string[];
  error?: string;
}

export async function pingIndexNow(urls: string[]): Promise<PingResult> {
  const list = urls.filter((u) => {
    try {
      return new URL(u).host === HOST;
    } catch {
      return false;
    }
  });
  if (!list.length) return { status: 0, accepted: false, urls: [], error: 'no URLs to submit' };

  try {
    const res = await fetch('https://api.indexnow.org/indexnow', {
      method: 'POST',
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        host: HOST,
        key: KEY,
        keyLocation: `https://${HOST}/${KEY}.txt`,
        urlList: list,
      }),
      signal: AbortSignal.timeout(10000),
    });
    return { status: res.status, accepted: res.status === 200, urls: list };
  } catch (e) {
    return { status: 0, accepted: false, urls: list, error: (e as Error).message };
  }
}

export const pageUrl = (slug: string) => `https://${HOST}/${slug}`;
