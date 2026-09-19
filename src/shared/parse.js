/**
 * Parsers for the three things a crawl fetches: HTML, sitemap XML, robots.txt.
 * Pure functions over strings — no chrome APIs, no DOM, so they run anywhere.
 */

const stripNoise = (html) =>
  html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ');

/**
 * HTML/XML character references. Required, not cosmetic: standards-correct
 * markup writes `?a=1&amp;b=2`, and sitemaps MUST escape & as &amp;. Without
 * this the crawler requests URLs that don't exist and splits one page in two.
 */
const NAMED_ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  ndash: '–', mdash: '—', hellip: '…', lsquo: '‘', rsquo: '’',
  ldquo: '“', rdquo: '”', copy: '©', reg: '®', trade: '™'
};

function decodeEntities(text) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, ref) => {
    if (ref[0] !== '#') return NAMED_ENTITIES[ref.toLowerCase()] ?? match;
    const code = ref[1] === 'x' || ref[1] === 'X' ? parseInt(ref.slice(2), 16) : parseInt(ref.slice(1), 10);
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
  });
}

/** Read one attribute off a raw tag's attribute string. Handles ", ' and bare. */
function attr(attrs, name) {
  const m = attrs.match(
    new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`, 'i')
  );
  if (!m) return null;
  return decodeEntities((m[1] ?? m[2] ?? m[3] ?? '').trim());
}

// Tags stripped before decoding, so an encoded &lt;b&gt; stays literal text.
const textOf = (html) =>
  decodeEntities(html.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();

/**
 * Extract everything needs to keep crawling, plus the cheap page facts
 * that come free with the same scan.
 *
 * Hrefs are returned raw — resolving and normalizing them is the caller's job,
 * because only the caller knows the site scheme.
 */
export function extractPage(html, { baseUrl } = {}) {
  const clean = stripNoise(html);

  // <base href> overrides the document URL for every relative link on the page.
  const baseTag = clean.match(/<base\b([^>]*)>/i);
  const baseHref = baseTag ? attr(baseTag[1], 'href') : null;

  const titleMatch = clean.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? textOf(titleMatch[1]) : null;

  const canonicals = [];
  let next = null;
  let prev = null;
  for (const m of clean.matchAll(/<link\b([^>]*)>/gi)) {
    const rel = (attr(m[1], 'rel') || '').toLowerCase();
    const href = attr(m[1], 'href');
    if (!href) continue;
    if (rel === 'canonical') canonicals.push(href);
    else if (rel === 'next') next = href;      // pagination, where detectable
    else if (rel === 'prev') prev = href;
  }

  // Only the generic robots directive; per-bot meta tags don't apply to us.
  let metaRobots = null;
  for (const m of clean.matchAll(/<meta\b([^>]*)>/gi)) {
    if ((attr(m[1], 'name') || '').toLowerCase() === 'robots') {
      metaRobots = (attr(m[1], 'content') || '').toLowerCase();
    }
  }

  const links = [];
  for (const m of clean.matchAll(/<a\b([^>]*)>/gi)) {
    const href = attr(m[1], 'href');
    if (!href) continue;
    const rel = (attr(m[1], 'rel') || '').toLowerCase().split(/\s+/).filter(Boolean);

    // Anchor text: the slice up to the matching close tag. Bounded so a
    // missing </a> can't drag in the rest of the document.
    const from = m.index + m[0].length;
    const close = clean.indexOf('</a', from);
    const anchor =
      close > -1 && close - from < 2000 ? textOf(clean.slice(from, close)).slice(0, 200) : '';

    links.push({
      href,
      anchor,
      rel,
      nofollow: rel.includes('nofollow'),
      sponsored: rel.includes('sponsored'),
      ugc: rel.includes('ugc')
    });
  }

  return {
    title,
    baseHref: baseHref || baseUrl || null,
    canonical: canonicals[0] ?? null,
    canonicalCount: canonicals.length,
    metaRobots,
    noindex: metaRobots ? metaRobots.includes('noindex') : false,
    nofollowPage: metaRobots ? metaRobots.includes('nofollow') : false,
    links,
    next,
    prev
  };
}

/**
 * sitemap.xml or a sitemap index. Returns both buckets; the caller recurses
 * into `sitemaps` and queues `urls`.
 */
export function parseSitemap(xml) {
  const isIndex = /<sitemapindex[\s>]/i.test(xml);
  const locs = [...xml.matchAll(/<loc>\s*([\s\S]*?)\s*<\/loc>/gi)].map((m) => {
    const cdata = m[1].match(/^<!\[CDATA\[([\s\S]*?)\]\]>$/);
    return (cdata ? cdata[1] : decodeEntities(m[1])).trim();
  });
  return isIndex ? { urls: [], sitemaps: locs } : { urls: locs, sitemaps: [] };
}

function ruleToRegex(pattern) {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  // A trailing '$' in a robots rule anchors to end-of-path.
  return new RegExp(
    '^' + (escaped.endsWith('\\$') ? escaped.slice(0, -2) + '$' : escaped)
  );
}

/**
 * robots.txt for our user-agent. Returns the matched group's rules plus every
 * Sitemap: line (those are global, not per-group — they're a discovery source).
 */
export function parseRobots(text) {
  const groups = new Map();   // user-agent -> { allow, disallow, crawlDelay }
  const sitemaps = [];
  let current = [];
  let lastWasAgent = false;

  for (const rawLine of String(text).split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (!line) continue;
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const field = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();

    if (field === 'user-agent') {
      const agent = value.toLowerCase();
      if (!lastWasAgent) current = [];
      if (!groups.has(agent)) groups.set(agent, { allow: [], disallow: [], crawlDelay: null });
      current.push(groups.get(agent));
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;

    if (field === 'sitemap') {
      sitemaps.push(value);
      continue;
    }
    if (!current.length) continue;
    for (const group of current) {
      if (field === 'allow' && value) group.allow.push(value);
      else if (field === 'disallow') group.disallow.push(value);   // empty value = allow all
      else if (field === 'crawl-delay') {
        const n = Number(value);
        if (Number.isFinite(n) && n >= 0) group.crawlDelay = n * 1000;
      }
    }
  }

  const group = groups.get('*') ?? { allow: [], disallow: [], crawlDelay: null };
  const rules = [
    ...group.allow.filter(Boolean).map((p) => ({ allow: true, pattern: p, re: ruleToRegex(p) })),
    ...group.disallow.filter(Boolean).map((p) => ({ allow: false, pattern: p, re: ruleToRegex(p) }))
  ];

  return {
    crawlDelay: group.crawlDelay,
    sitemaps,
    /** Longest matching rule wins; Allow wins ties (standard robots precedence). */
    isAllowed(pathWithQuery) {
      let best = null;
      for (const rule of rules) {
        if (!rule.re.test(pathWithQuery)) continue;
        if (
          !best ||
          rule.pattern.length > best.pattern.length ||
          (rule.pattern.length === best.pattern.length && rule.allow)
        ) {
          best = rule;
        }
      }
      return best ? best.allow : true;
    }
  };
}