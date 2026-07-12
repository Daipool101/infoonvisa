import { defineMiddleware } from 'astro:middleware';

// Content-Security-Policy. 'unsafe-inline' is required for our inline scripts
// (GA, theme init, adsbygoogle) and scoped styles; the XSS sinks themselves are
// closed separately (safeUrl + JSON-LD escaping). AdSense/GA/Fonts hosts are
// pre-allowed so nothing breaks when ads are switched on.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://pagead2.googlesyndication.com https://*.googlesyndication.com https://partner.googleadservices.com https://www.google.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: https:",
  "connect-src 'self' https://*.google-analytics.com https://*.analytics.google.com https://*.googletagmanager.com https://*.supabase.co",
  "frame-src https://googleads.g.doubleclick.net https://td.doubleclick.net https://www.google.com",
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

  const res = await next();
  for (const [k, v] of Object.entries(HEADERS)) res.headers.set(k, v);
  return res;
});
