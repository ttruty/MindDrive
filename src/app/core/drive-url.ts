// Drive IDs are URL-safe base64-ish strings; folder IDs are typically 19–44 chars.
const ID_PATTERN = /^[A-Za-z0-9_-]{10,}$/;

/**
 * Extracts a Drive folder ID from a pasted folder link or a bare ID.
 * Handles e.g. `https://drive.google.com/drive/folders/<id>?usp=sharing`,
 * `.../drive/u/1/folders/<id>`, and `https://drive.google.com/open?id=<id>`.
 * Returns null when nothing ID-like can be found.
 */
export function parseFolderId(input: string): string | null {
  const text = input.trim();
  if (!text) return null;
  if (ID_PATTERN.test(text)) return text;

  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return null;
  }

  const fromPath = url.pathname.match(/\/folders\/([A-Za-z0-9_-]+)/)?.[1];
  const fromQuery = url.searchParams.get('id');
  const id = fromPath ?? fromQuery;
  return id && ID_PATTERN.test(id) ? id : null;
}
