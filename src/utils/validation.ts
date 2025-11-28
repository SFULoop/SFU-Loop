import { toASCII } from 'punycode/';

const SFU_PRIMARY_DOMAIN = 'sfu.ca';
const SFU_DOMAIN_ALLOWLIST = [SFU_PRIMARY_DOMAIN, 'cs.sfu.ca'];
export const MAGIC_LINK_TTL_MS = 15 * 60 * 1000; // 15 minutes

export type NormalizedEmail = {
  normalized: string;
  asciiDomain: string;
  localPart: string;
  normalizedLocalPart: string;
  isAlias: boolean;
};

const sanitizeEmail = (email: string) => email.trim().toLowerCase();

const stripAlias = (localPart: string, domain: string) => {
  const plusIndex = localPart.indexOf('+');

  if (plusIndex === -1) {
    return { normalizedLocal: localPart, isAlias: false };
  }

  if (domain !== SFU_PRIMARY_DOMAIN) {
    // Plus-addressing allowed only for the primary SFU domain.
    return { normalizedLocal: '', isAlias: true };
  }

  return { normalizedLocal: localPart.slice(0, plusIndex), isAlias: true };
};

export const normalizeSfuEmail = (email: string): NormalizedEmail | null => {
  const sanitized = sanitizeEmail(email);
  const [localPart, rawDomain] = sanitized.split('@');

  if (!localPart || !rawDomain) {
    return null;
  }

  const asciiDomain = toASCII(rawDomain);
  if (!SFU_DOMAIN_ALLOWLIST.includes(asciiDomain)) {
    return null;
  }

  const { normalizedLocal, isAlias } = stripAlias(localPart, asciiDomain);
  if (!normalizedLocal) {
    return null;
  }

  return {
    normalized: `${normalizedLocal}@${asciiDomain}`,
    asciiDomain,
    localPart,
    normalizedLocalPart: normalizedLocal,
    isAlias
  };
};

export const isSfuEmail = (email: string) => !!normalizeSfuEmail(email);

export const isMagicLinkExpired = (sentAt: number, now: number = Date.now(), ttlMs = MAGIC_LINK_TTL_MS) =>
  now - sentAt >= ttlMs;
