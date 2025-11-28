import { isMagicLinkExpired, isSfuEmail, normalizeSfuEmail, MAGIC_LINK_TTL_MS } from '../validation';

describe('SFU email validation', () => {
  it('normalizes case and strips plus alias for primary domain', () => {
    const result = normalizeSfuEmail('User+tag@SFU.ca');

    expect(result).not.toBeNull();
    expect(result?.normalized).toBe('user@sfu.ca');
    expect(result?.isAlias).toBe(true);
  });

  it('rejects aliases on subdomains', () => {
    expect(normalizeSfuEmail('student+tag@cs.sfu.ca')).toBeNull();
  });

  it('accepts allowlisted subdomains without aliasing', () => {
    const result = normalizeSfuEmail('cs_student@cs.sfu.ca');
    expect(result?.normalized).toBe('cs_student@cs.sfu.ca');
    expect(result?.isAlias).toBe(false);
  });

  it('rejects non-allowlisted domains including punycode lookalikes', () => {
    expect(isSfuEmail('user@gmail.com')).toBe(false);
    expect(isSfuEmail('user@xn--sf-ska.ca')).toBe(false);
  });
});

describe('magic link expiry', () => {
  it('flags links at or beyond TTL as expired', () => {
    const sentAt = Date.now();

    expect(isMagicLinkExpired(sentAt, sentAt + MAGIC_LINK_TTL_MS)).toBe(true);
    expect(isMagicLinkExpired(sentAt, sentAt + MAGIC_LINK_TTL_MS + 1)).toBe(true);
  });

  it('keeps links valid before TTL elapses', () => {
    const sentAt = Date.now();

    expect(isMagicLinkExpired(sentAt, sentAt + MAGIC_LINK_TTL_MS - 1)).toBe(false);
  });
});
