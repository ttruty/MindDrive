export const environment = {
  production: true,
  // OAuth 2.0 Client ID (Web application) from Google Cloud Console. Not a secret.
  // Authorized JavaScript origins must include the dev origin (http://localhost:8100).
  googleClientId: '13339603464-llug0icrob49kigh5o3cjkb1ttdnooqt.apps.googleusercontent.com',
  // Browser API key for reading folders shared as "Anyone with the link" without signing in.
  // Not stored in the repo: it's injected at build time from the GOOGLE_API_KEY environment variable
  // (a GitHub Actions secret in CI, or .env.local locally) — see scripts/ng-env.mjs. Empty = feature off.
  googleApiKey: typeof GOOGLE_API_KEY === 'string' ? GOOGLE_API_KEY : '',
};
