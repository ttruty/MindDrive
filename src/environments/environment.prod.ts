export const environment = {
  production: true,
  // OAuth 2.0 Client ID (Web application) from Google Cloud Console. Not a secret.
  // Authorized JavaScript origins must include the dev origin (http://localhost:8100).
  googleClientId: '13339603464-llug0icrob49kigh5o3cjkb1ttdnooqt.apps.googleusercontent.com',
  // Browser API key (Google Cloud → Credentials → API key) for reading folders shared as
  // "Anyone with the link" without signing in. Restrict it to the Google Drive API and to your
  // site's HTTP referrers (e.g. http://localhost:8100/*, https://timtruty.com/*). Leave empty to
  // require sign-in for everything.
  googleApiKey: '',
};
