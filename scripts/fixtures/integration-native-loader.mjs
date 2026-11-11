// Resolve the app's Next.js imports when running its synthetic tests directly in Node.
import { existsSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = new URL('../../', import.meta.url);
const local = (url) => url?.startsWith(root.href) && !url.startsWith(new URL('node_modules/', root).href);

registerHooks({
  resolve(specifier, context, next) {
    if (!local(context.parentURL)) return next(specifier, context);
    if (specifier === 'next/server') return next('next/server.js', context);
    if (specifier.startsWith('@/') || specifier.startsWith('.')) {
      const target = specifier.startsWith('@/')
        ? new URL(specifier.slice(2), root)
        : new URL(specifier, context.parentURL);
      if (local(target.href) && !extname(target.pathname)) {
        const typed = new URL(`${target.href}.ts`);
        if (existsSync(fileURLToPath(typed))) return next(typed.href, context);
      }
      if (specifier.startsWith('@/')) return next(target.href, context);
    }
    const result = next(specifier, context);
    // Next.js supplies the JSON import type for the app's catalogue snapshot.
    return local(result.url) && result.url.endsWith('.json')
      ? { ...result, importAttributes: { ...context.importAttributes, type: 'json' } }
      : result;
  },
});
