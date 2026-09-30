// This file can be replaced during build by using the `fileReplacements` array.
// `ng build` replaces `environment.ts` with `environment.prod.ts`.
// The list of file replacements can be found in `angular.json`.

export const environment = {
  production: false,
  // OAuth 2.0 Client ID (Web application) from Google Cloud Console. Not a secret.
  // Authorized JavaScript origins must include the dev origin (http://localhost:8100).
  googleClientId: '13339603464-llug0icrob49kigh5o3cjkb1ttdnooqt.apps.googleusercontent.com',
  // Browser API key for reading folders shared as "Anyone with the link" without signing in.
  // Not stored in the repo: it's injected at build time from the GOOGLE_API_KEY environment variable
  // (a GitHub Actions secret in CI, or .env.local locally) — see scripts/ng-env.mjs. Empty = feature off.
  googleApiKey: typeof GOOGLE_API_KEY === 'string' ? GOOGLE_API_KEY : '',
};

/*
 * For easier debugging in development mode, you can import the following file
 * to ignore zone related error stack frames such as `zone.run`, `zoneDelegate.invokeTask`.
 *
 * This import should be commented out in production mode because it will have a negative impact
 * on performance if an error is thrown.
 */
// import 'zone.js/plugins/zone-error';  // Included with Angular CLI.
