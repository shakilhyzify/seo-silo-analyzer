/**
 * The crawl engine. Background context only.
 *
 * Shape is dictated by two verified MV3 facts:
 *  1. A service worker dies after 30s idle, and any single event that takes
 *     over 5 minutes is killed. So the crawl loop is NOT awaited inside the
 *     message handler — startCrawl() returns immediately and the loop drives
 *     itself, with each fetch resetting the idle timer.
 *  2. The worker can still be evicted between pages, so progress is persisted
 *     as it happens. An interrupted run is resumable, never lost.
 *
 * WHICH pages get crawled, in what order and within what budget, is decided
 * by frontier.js. This file is the IO around it.
 */

import { normalizeUrl, rootHostOf, isSameSite } from '../shared/url.js';
import { extractPage, parseSitemap, parseRobots } from '../shared/parse.js';
import * as db from '../shared/db.js';
import { createFrontier } from './frontier.js';

const FETCH_TIMEOUT_MS = 15000;   // under the 30s idle kill, with room to spare
const SAVE_EVERY = 10;
const MAX_SITEMAP_FILES = 50;
const MAX_HTML_BYTES = 5_000_000;

/** The one live crawl. Null when idle. */
let state = null;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Popup may be closed — that's normal, not an error. */
function emit(message) {
  try {
    chrome.runtime.sendMessage(message, () => void chrome.runtime.lastError);
  } catch {
    /* no receiver */
  }
}

/** robots.txt rules, adapted to the full-URL shape the frontier works in. */
const robotsAllows = (rules) => (url) => {
  const u = new URL(url);
  return rules.isAllowed(u.pathname + u.search);
};

function snapshot() {
  if (!state) return { status: 'idle' };
  return {
    status: state.stopRequested ? 'stopping' : state.paused ? 'paused' : 'running',
    runId: state.runId,
    startUrl: state.config.startUrl,
    crawledCount: state.stats.crawled,
    discoveredCount: state.frontier.size(),
    maxDepthReached: state.stats.maxDepth,
    errorCount: state.stats.errors,
    percent: Math.min(99, Math.round((state.stats.crawled / state.config.maxPages) * 100)),
    currentUrl: state.stats.currentUrl,
    elapsedMs: Date.now() - state.stats.startedAt
  };
}

export function getState() {
  return snapshot();
}

/**
 * Writes the run record plus only the discovered-URL rows that changed since
 * the last save, in one transaction — so on resume the stats and the frontier
 * describe the same moment. Never throws: a failed save must not wedge the
 * crawl in a permanent "running" state, and its rows are retried next save.
 */
async function persist(status) {
  if (!state) return;
  const { runId, frontier } = state;
  state.stats.discovered = frontier.size();
  const rows = frontier.takeDirty();

  try {
    await db.saveProgress(
      {
        id: runId,
        startUrl: state.config.startUrl,
        rootHost: state.rootHost,
        config: state.config,
        status,
        complete: status === 'complete',
        startedAt: state.stats.startedAt,
        updatedAt: Date.now(),
        finishedAt: status === 'running' || status === 'paused' ? null : Date.now(),
        stats: { ...state.stats }
      },
      rows.map((row) => ({ ...row, key: `${runId}|${row.url}`, runId }))
    );
  } catch (err) {
    frontier.markDirty(rows.map((row) => row.url));
    console.error('[crawl] save failed, will retry', err);
  }
}

/**
 * Redirect hops observed for the fetch currently in flight, keyed by the URL
 * the next hop will arrive at.
 *
 * fetch() follows redirects itself and reports only the endpoints — res.url
 * and res.redirected. The 301/302 responses in between are invisible to it,
 * so webRequest is the only way to see them (verified: MV3 dropped
 * webRequestBlocking; observation is unchanged).
 *
 * The map lookup is the filter: only fetchText seeds it, so a hop for a URL we
 * are not fetching is ignored, the map cannot grow, and traffic from tabs and
 * other extensions is never stored. Deliberately no types/initiator filter —
 * both guess how Chrome labels a service worker's own request, and a wrong
 * guess drops every event with no error.
 */
const redirectHops = new Map();

chrome.webRequest.onBeforeRedirect.addListener(
  ({ url, redirectUrl, statusCode }) => {
    const hops = redirectHops.get(url);
    if (!hops) return;
    hops.push({ url, status: statusCode });
    redirectHops.delete(url);
    redirectHops.set(redirectUrl, hops);
  },
  { urls: ['<all_urls>'] }
);

async function fetchText(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  const hops = [];
  redirectHops.set(url, hops);
  try {
    const res = await fetch(url, { signal: controller.signal, credentials: 'omit' });
    const contentType = res.headers.get('content-type') || '';
    const isHtml = contentType.includes('html') || contentType.includes('xml');
    let body = '';
    if (isHtml && res.ok) {
      body = await res.text();
      if (body.length > MAX_HTML_BYTES) body = body.slice(0, MAX_HTML_BYTES);
    }
    return {
      ok: res.ok,
      status: res.status,
      statusText: res.statusText,
      contentType,
      finalUrl: res.url,
      redirected: res.redirected,
      chain: [...hops, { url: res.url, status: res.status }],
      body
    };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      statusText: err.name === 'AbortError' ? 'Timeout' : err.message,
      contentType: '',
      finalUrl: url,
      redirected: false,
      chain: hops,   // hops seen before it failed; there is no terminal response
      body: '',
      error: true
    };
  } finally {
    clearTimeout(timer);
    for (const [key, value] of redirectHops) {
      if (value === hops) redirectHops.delete(key);
    }
  }
}

/** robots.txt: politeness rules and a discovery source in one fetch. */
async function loadRobots(origin) {
  const res = await fetchText(`${origin}/robots.txt`);
  if (!res.ok || !res.body) return { rules: parseRobots(''), sitemaps: [] };
  const rules = parseRobots(res.body);
  return { rules, sitemaps: rules.sitemaps };
}

/** Walks sitemap indexes breadth-first, capped so a hostile index can't spin. */
async function collectSitemapUrls(seedUrls, isAlive) {
  const found = [];
  const queue = [...seedUrls];
  const done = new Set();

  while (queue.length && done.size < MAX_SITEMAP_FILES && isAlive()) {
    const url = queue.shift();
    if (done.has(url)) continue;
    done.add(url);

    const res = await fetchText(url);
    if (!res.ok || !res.body) continue;
    const { urls, sitemaps } = parseSitemap(res.body);
    found.push(...urls);
    queue.push(...sitemaps);
    await sleep(state?.delayMs ?? 250);
  }
  return found;
}

/** Resolve, normalize and scope-check a raw href, then record it. Returns the key. */
function discoverHref(rawHref, base, { depth = null, source, crawlable = true }) {
  const url = normalizeUrl(rawHref, base, state.scheme);
  if (url && isSameSite(url, state.rootHost, state.config.includeSubdomains)) {
    state.frontier.discover(url, { depth, source, crawlable });
  }
  return url;
}

async function processOne({ url }) {
  state.stats.currentUrl = url;
  const entry = state.frontier.get(url);
  const depth = entry.depth;   // shortest found so far — may beat the depth it was queued at
  const target = new URL(url);

  // robots.txt is respected, not optional (see .claude/rules/guardrails.md).
  // The frontier already filters on it; this catches the start URL, which is
  // recorded before robots.txt has been fetched.
  if (!state.robots.isAllowed(target.pathname + target.search)) {
    state.frontier.markVisited(url, { blocked: true });
    await db.savePageWithLinks(
      {
        key: `${state.runId}|${url}`,
        runId: state.runId,
        url,
        depth,
        sources: [...entry.sources],
        status: null,
        statusText: 'Blocked by robots.txt',
        blockedByRobots: true,
        fetchedAt: Date.now()
      },
      []
    );
    return;
  }

  const res = await fetchText(url);
  state.frontier.markVisited(url, { fetched: true });
  state.stats.crawled = state.frontier.fetched();
  if (!res.ok) state.stats.errors += 1;
  if (depth !== null && depth > state.stats.maxDepth) state.stats.maxDepth = depth;

  const finalUrl = normalizeUrl(res.finalUrl, url, state.scheme) || url;
  const redirected = res.redirected && finalUrl !== url;
  if (redirected && isSameSite(finalUrl, state.rootHost, state.config.includeSubdomains)) {
    // Its content just arrived via `url`; fetching it again would count one page twice.
    state.frontier.discover(finalUrl, { depth, source: 'redirect', crawlable: false });
    state.frontier.markVisited(finalUrl);
  }

  const page = {
    key: `${state.runId}|${url}`,
    runId: state.runId,
    url,
    finalUrl,
    redirected,
    depth,
    sources: [...entry.sources],
    status: res.status,
    statusText: res.statusText,
    contentType: res.contentType,
    fetchedAt: Date.now(),
    redirectChain: res.chain.length > 1 ? res.chain : null,
    title: null,
    canonical: null,
    canonicalCount: 0,
    metaRobots: null,
    noindex: false,
    outLinksInternal: 0,
    outLinksExternal: 0
  };

  const linkRows = [];

  if (res.body && res.contentType.includes('html')) {
    const parsed = extractPage(res.body, { baseUrl: finalUrl });
    const base = parsed.baseHref || finalUrl;

    page.title = parsed.title;
    page.canonicalCount = parsed.canonicalCount;
    page.metaRobots = parsed.metaRobots;
    page.noindex = parsed.noindex;

    // Canonical is a discovery source in its own right (FR-01). A self-canonical
    // isn't a discovery, and tagging every page with it would drown FR-06.
    if (parsed.canonical) {
      page.canonical = normalizeUrl(parsed.canonical, base, state.scheme);
      if (page.canonical && page.canonical !== finalUrl) {
        discoverHref(parsed.canonical, base, { source: 'canonical' });
      }
    }
    // Pagination, where detectable: rel=next / rel=prev.
    for (const href of [parsed.next, parsed.prev]) {
      if (href) discoverHref(href, base, { source: 'pagination' });
    }

    const childDepth = depth === null ? null : depth + 1;
    const seenOnPage = new Set();

    for (const link of parsed.links) {
      const resolved = normalizeUrl(link.href, base, state.scheme);
      if (!resolved) continue;

      const internal = isSameSite(resolved, state.rootHost, state.config.includeSubdomains);
      internal ? (page.outLinksInternal += 1) : (page.outLinksExternal += 1);

      // One edge per (target, anchor) — repeated identical links aren't signal.
      const edgeKey = `${resolved} ${link.anchor}`;
      if (!seenOnPage.has(edgeKey)) {
        seenOnPage.add(edgeKey);
        linkRows.push({
          runId: state.runId,
          from: finalUrl,
          to: resolved,
          anchor: link.anchor,
          rel: link.rel,
          nofollow: link.nofollow,
          sponsored: link.sponsored,
          ugc: link.ugc,
          internal
        });
      }

      if (!internal) continue;

      // Recorded either way — FR-06 needs every internal link. Only a followable
      // link makes its target crawlable and gives it a click depth.
      const follow = state.config.followNofollow || (!link.nofollow && !parsed.nofollowPage);
      state.frontier.discover(resolved, {
        depth: follow ? childDepth : null,
        source: link.nofollow ? 'link-nofollow' : 'link',
        crawlable: follow
      });
    }
  }

  await db.savePageWithLinks(page, linkRows);
}

async function runLoop() {
  if (!state || state.loopRunning) return;   // never two loops on one crawl
  state.loopRunning = true;
  let sinceSave = 0;

  while (true) {
    if (!state || state.stopRequested) break;
    if (state.paused) {
      state.loopRunning = false;                    // resume() restarts the loop
      return;
    }
    if (state.stats.crawled >= state.config.maxPages) break;

    const item = state.frontier.next();
    if (!item) break;

    try {
      await processOne(item);
    } catch (err) {
      // A single bad page must never kill the run — or leak its budget slot.
      state.frontier.markVisited(item.url);
      state.stats.errors += 1;
      console.error('[crawl] page failed', item.url, err);
    }

    emit({ type: 'CRAWL_PROGRESS', progress: snapshot() });
    sinceSave += 1;
    if (sinceSave >= SAVE_EVERY) {
      sinceSave = 0;
      await persist('running');
    }
    await sleep(state.delayMs);
  }

  if (!state) return;
  state.loopRunning = false;
  if (state.stopRequested) return finish('stopped');

  // Hitting the page cap with URLs left is NOT a complete crawl. Anything that
  // reasons about the whole site (orphans, depth, silos) must be able to tell.
  const capped = state.stats.crawled >= state.config.maxPages;
  await finish(capped && state.frontier.summary().notCrawled > 0 ? 'page-limit' : 'complete');
}

async function finish(status) {
  if (!state) return;
  const { discovered, notCrawled, beyondDepth, blocked } = state.frontier.summary();
  Object.assign(state.stats, { discovered, notCrawled, beyondDepth, blocked, finishedAt: Date.now() });
  await persist(status);

  const summary = {
    ...snapshot(),
    notCrawled,
    beyondDepth,
    blocked,
    status,
    complete: status === 'complete',
    percent: status === 'stopped' ? snapshot().percent : 100
  };
  state = null;
  emit({ type: 'CRAWL_COMPLETE', summary });
}

export async function startCrawl(rawConfig) {
  if (state) return { ok: false, error: 'A crawl is already running.' };

  const startUrl = normalizeUrl(rawConfig.startUrl);
  if (!startUrl) return { ok: false, error: 'Enter a valid http(s) URL.' };

  const origin = new URL(startUrl).origin;

  const config = {
    startUrl,
    maxPages: Math.max(1, Number(rawConfig.maxPages) || 100),
    maxDepth: Math.max(0, Number(rawConfig.maxDepth) || 0),
    includeSubdomains: Boolean(rawConfig.includeSubdomains),
    followNofollow: Boolean(rawConfig.followNofollow),
    requestDelayMs: Math.max(0, Number(rawConfig.requestDelayMs) || 250)
  };

  const runId = `run-${Date.now()}`;
  state = {
    runId,
    config,
    rootHost: rootHostOf(startUrl),
    scheme: new URL(startUrl).protocol,
    robots: parseRobots(''),
    frontier: createFrontier({ maxPages: config.maxPages, maxDepth: config.maxDepth }),
    delayMs: config.requestDelayMs,
    paused: false,
    stopRequested: false,
    loopRunning: false,
    discovering: true,   // robots + sitemap still loading; the loop must not start yet
    stats: {
      crawled: 0,
      discovered: 0,
      errors: 0,
      maxDepth: 0,
      currentUrl: startUrl,
      startedAt: Date.now(),
      finishedAt: null
    }
  };

  state.frontier.discover(startUrl, { depth: 0, source: 'start' });
  await persist('running');

  const isAlive = () => state?.runId === runId && !state.stopRequested;

  (async () => {
    try {
      const { rules, sitemaps } = await loadRobots(origin);
      if (isAlive()) {
        state.robots = rules;
        state.frontier.setAllowed(robotsAllows(rules));
        // Honour a slower crawl-delay than ours, never a faster one.
        if (rules.crawlDelay) state.delayMs = Math.max(state.delayMs, rules.crawlDelay);

        const seeds = sitemaps.length ? sitemaps : [`${origin}/sitemap.xml`];
        const sitemapUrls = await collectSitemapUrls(seeds, isAlive);
        if (isAlive()) {
          for (const raw of sitemapUrls) discoverHref(raw, origin, { source: 'sitemap' });
          // The discovered set is written once here, then only its changes.
          await persist('running');
          emit({ type: 'CRAWL_PROGRESS', progress: snapshot() });
        }
      }
    } catch (err) {
      console.error('[crawl] discovery failed', err);
    }
    if (state?.runId === runId) state.discovering = false;
    await runLoop();   // also what finishes a run stopped during discovery
  })();

  return { ok: true, runId };
}

export async function pauseCrawl() {
  if (!state || state.paused) return snapshot();
  state.paused = true;
  await persist('paused');
  return snapshot();
}

export function resumeCrawl() {
  if (!state || !state.paused) return snapshot();
  state.paused = false;
  // Resuming mid-discovery must not start the loop early: it could drain the
  // link queue and finish "complete" before the sitemap URLs even exist.
  if (!state.discovering) runLoop();
  return snapshot();
}

export async function stopCrawl() {
  if (!state) return { status: 'idle' };
  state.stopRequested = true;
  const current = snapshot();
  if (state.paused) await finish('stopped');   // loop isn't running to notice
  return current;
}

/**
 * Restores an interrupted run (worker eviction, browser restart) from what was
 * persisted, then continues.
 */
export async function resumeInterruptedRun(runId) {
  if (state) return { ok: false, error: 'A crawl is already running.' };

  const run = await db.getRun(runId);
  if (!run || (run.status !== 'running' && run.status !== 'paused')) {
    return { ok: false, error: 'Nothing to resume.' };
  }

  const rows = await db.getDiscovered(runId);
  if (!rows.length) {
    return { ok: false, error: "This run was saved by an older version and can't be resumed. Start a new audit." };
  }

  const origin = new URL(run.startUrl).origin;
  const { rules } = await loadRobots(origin);
  if (state) return { ok: false, error: 'A crawl is already running.' };

  const frontier = createFrontier({
    maxPages: run.config.maxPages,
    maxDepth: run.config.maxDepth,
    isAllowed: robotsAllows(rules)
  });
  frontier.restore(rows, run.stats?.crawled ?? 0);

  state = {
    runId: run.id,
    config: run.config,
    rootHost: run.rootHost,
    scheme: new URL(run.startUrl).protocol,
    robots: rules,
    frontier,
    delayMs: Math.max(run.config.requestDelayMs, rules.crawlDelay ?? 0),
    paused: false,
    stopRequested: false,
    loopRunning: false,
    stats: { ...run.stats, currentUrl: null }
  };

  runLoop();
  return { ok: true, runId: state.runId };
}
