/**
 * URL normalization.
 *
 * THE single implementation. Every comparison, dedupe, graph key and storage
 * key in this codebase goes through normalizeUrl(). A second "quick normalize"
 * anywhere silently splits one page into two nodes, which then surfaces as a
 * phantom orphan, a wrong click depth and a missing link.
 */

// Params that identify a campaign/session, not a page. Stripped before keying.
const TRACKING_PARAMS = new Set([
  'gclid', 'gclsrc', 'dclid', 'gbraid', 'wbraid', 'fbclid', 'msclkid',
  'mc_cid', 'mc_eid', 'igshid', 'twclid', 'ttclid', 'yclid', '_ga', '_gl',
  'ref', 'ref_src', 'source', 'campaignid', 'adgroupid', 'sessionid',
  'phpsessid', 'jsessionid'
]);

const isTracking = (key) => {
  const k = key.toLowerCase();
  return TRACKING_PARAMS.has(k) || k.startsWith('utm_');
};

/**
 * Normalize a URL to its canonical internal key. Returns null for anything
 * uncrawlable (mailto:, tel:, javascript:, data:, unparseable, non-HTTP).
 *
 * @param {string} input        raw href, may be relative
 * @param {string} [base]       base URL to resolve against
 * @param {string} [forceScheme] 'https:' — collapse http/https for the same
 *        site. Callers pass the site's own scheme so http://x/a and
 *        https://x/a key alike (spec FR-02). Applied only when the URL is on
 *        the same root host as `base`; cross-site URLs keep their own scheme.
 */
export function normalizeUrl(input, base, forceScheme) {
  if (typeof input !== 'string' || !input.trim()) return null;

  let u;
  try {
    u = new URL(input.trim(), base);
  } catch {
    return null;
  }

  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;

  u.hash = '';
  u.username = '';
  u.password = '';

  if (forceScheme === 'http:' || forceScheme === 'https:') {
    if (isSameSite(u.href, rootHostOf(base || u.href), true)) {
      u.protocol = forceScheme;
      if ((u.protocol === 'http:' && u.port === '80') || (u.protocol === 'https:' && u.port === '443')) {
        u.port = '';
      }
    }
  }

  const kept = [...u.searchParams.entries()]
    .filter(([key]) => !isTracking(key))
    .sort(([ka, va], [kb, vb]) =>
      ka < kb ? -1 : ka > kb ? 1 : va < vb ? -1 : va > vb ? 1 : 0);

  u.search = '';
  for (const [key, value] of kept) u.searchParams.append(key, value);

  if (u.pathname.length > 1 && u.pathname.endsWith('/')) {
    u.pathname = u.pathname.slice(0, -1);
  }

  return u.toString();
}

/**
 * The host used as "this site". Strips a leading www. so that a crawl started
 * at www.example.com still recognises example.com as the same site.
 */
export function rootHostOf(urlString) {
  try {
    return new URL(urlString).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

/** Is this URL in scope for the crawl? */
export function isSameSite(urlString, rootHost, includeSubdomains) {
  if (!rootHost) return false;
  let host;
  try {
    host = new URL(urlString).hostname.replace(/^www\./, '');
  } catch {
    return false;
  }
  if (host === rootHost) return true;
  return includeSubdomains ? host.endsWith('.' + rootHost) : false;
}
