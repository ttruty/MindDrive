// Runs the Angular CLI with build-time values that must not live in the repo.
//
//   node scripts/ng-env.mjs serve        (npm start)
//   node scripts/ng-env.mjs build ...    (npm run build / preview / build:pages)
//
// GOOGLE_API_KEY comes from the environment (GitHub Actions secret in CI) or, locally, from a
// git-ignored .env.local file (see .env.example). It's passed as `--define`, so it's substituted
// into the bundle at build time. It's never printed.
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export function defineArgs() {
  if (!process.env.GOOGLE_API_KEY && existsSync('.env.local')) process.loadEnvFile('.env.local');
  const key = process.env.GOOGLE_API_KEY?.trim();
  console.log(`GOOGLE_API_KEY: ${key ? 'provided' : 'not set (shared links without sign-in are off)'}`);
  return key ? ['--define', `GOOGLE_API_KEY=${JSON.stringify(key)}`] : [];
}

export function runNg(args) {
  execFileSync('npx', ['ng', ...args, ...defineArgs()], { stdio: 'inherit' });
}

// Used directly as a CLI wrapper.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    runNg(process.argv.slice(2));
  } catch (err) {
    process.exit(err.status ?? 1);
  }
}
