import { parseFolderId } from './drive-url';

const ID = '1AbCdEfGhIjKlMnOpQrStUvWxYz_-123';

describe('parseFolderId', () => {
  it('accepts a bare ID', () => {
    expect(parseFolderId(ID)).toBe(ID);
    expect(parseFolderId(`  ${ID}\n`)).toBe(ID);
  });

  it('extracts the ID from folder links', () => {
    expect(parseFolderId(`https://drive.google.com/drive/folders/${ID}`)).toBe(ID);
    expect(parseFolderId(`https://drive.google.com/drive/folders/${ID}?usp=sharing`)).toBe(ID);
    expect(parseFolderId(`https://drive.google.com/drive/u/1/folders/${ID}`)).toBe(ID);
    expect(parseFolderId(`https://drive.google.com/open?id=${ID}`)).toBe(ID);
  });

  it('rejects input without a folder ID', () => {
    expect(parseFolderId('')).toBeNull();
    expect(parseFolderId('not a link')).toBeNull();
    expect(parseFolderId('https://drive.google.com/drive/my-drive')).toBeNull();
  });
});
