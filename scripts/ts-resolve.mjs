// Let Node resolve the extensionless imports the app's TypeScript uses.
//
// `import { sanitizeCorridorLinks } from './links'` is normal TypeScript and
// Vite resolves it without complaint, but Node's ESM resolver requires the
// extension, so any script that imports src/lib dies on the first hop. The
// existing workaround — reading the .ts file as text and regexing values out
// of it, as scripts/regen-audit.mjs does for OFFICIAL_PORTALS — drifts the
// moment the source is reformatted, and drifting is exactly what importing
// the real module is supposed to prevent.
//
// Register with --import, before --experimental-strip-types does the stripping:
//   node --import ./scripts/ts-resolve.mjs --experimental-strip-types script.mjs

import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

register(
  'data:text/javascript,' +
    encodeURIComponent(`
      import { existsSync } from 'node:fs';
      import { fileURLToPath } from 'node:url';
      export async function resolve(specifier, context, next) {
        if (specifier.startsWith('.') && !/\\.[a-z]+$/i.test(specifier)) {
          const asTs = new URL(specifier + '.ts', context.parentURL);
          if (existsSync(fileURLToPath(asTs))) return next(asTs.href, context);
        }
        return next(specifier, context);
      }
    `),
  pathToFileURL('./')
);
