/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

type Runtime = import('@astrojs/cloudflare').Runtime<Env>;

interface Env {
  PUBLIC_SUPABASE_URL: string;
  PUBLIC_SUPABASE_ANON_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  GEMINI_API_KEY: string;
  GEMINI_MODEL: string;
  PUBLIC_ADSENSE_CLIENT: string;
}

declare namespace App {
  interface Locals extends Runtime {}
}
