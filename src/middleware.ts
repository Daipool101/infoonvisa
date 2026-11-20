import { defineMiddleware } from 'astro:middleware';

// Content-Security-Policy. 'unsafe-inline' is required for our inline scripts
// (GA, theme init, adsbygoogle) and scoped styles; the XSS sinks themselves are
// closed separately (safeUrl + JSON-LD escaping).
//
// AdSense needs far more than its one script tag, and this policy used to allow
// only the script tag. Seen in a browser on 21 Nov 2026, the day after AdSense
// rejected the site: every page logged "Connecting to
// https://ep1.adtrafficquality.google/... violates connect-src ... blocked".
// That is Google's ad traffic-quality check, and it was not the only thing
// stopped. The script could load and then do almost nothing — it could not
// phone home (connect-src), could not render an ad, which arrives in a
// googlesyndication or doubleclick frame (frame-src), and could not run the
// EEA/UK consent message enabled in Privacy & messaging, which is served from
// fundingchoicesmessages.google.com. Whether this contributed to the rejection
// cannot be known; that ads would never have appeared once approved can.
//
// ADS lists Google's ad-serving families as wildcards, the shape Google's own
// CSP guidance for AdSense uses. Each is a Google-controlled domain.
const ADS = [
  'https://*.googlesyndication.com',
  'https://*.doubleclick.net',
  'https://*.googleadservices.com',
  'https://*.adtrafficquality.google',
  'https://fundingchoicesmessages.google.com',
  'https://*.google.com',
].join(' ');

const CSP = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' https://www.googletagmanager.com ${ADS}`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: https:",
  `connect-src 'self' https://*.google-analytics.com https://*.analytics.google.com https://*.googletagmanager.com https://*.supabase.co ${ADS}`,
  `frame-src ${ADS}`,
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "upgrade-insecure-requests",
].join('; ');

const HEADERS: Record<string, string> = {
  'Content-Security-Policy': CSP,
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
  'Permissions-Policy': 'geolocation=(), microphone=(), camera=(), payment=(), browsing-topics=()',
};

export const onRequest = defineMiddleware(async (context, next) => {
  // SEO: exactly one canonical host. 301 www -> apex so Google never indexes
  // a duplicate copy of the site on www.infoonvisa.com.
  const url = new URL(context.request.url);
  if (url.hostname === 'www.infoonvisa.com') {
    url.hostname = 'infoonvisa.com';
    return new Response(null, {
      status: 301,
      headers: { Location: url.toString(), ...HEADERS },
    });
  }

  // SEO: exactly one URL form. /countries/ and /countries both returned 200
  // and self-canonicalised, so Google indexed them as duplicate pages. 301 the
  // trailing-slash form onto the canonical one (the site root keeps its slash).
  if (url.pathname.length > 1 && url.pathname.endsWith('/')) {
    url.pathname = url.pathname.replace(/\/+$/, '');
    return new Response(null, {
      status: 301,
      headers: { Location: url.toString(), ...HEADERS },
    });
  }

  const res = await next();
  for (const [k, v] of Object.entries(HEADERS)) res.headers.set(k, v);
  return res;
});
