/**
 * The crawl frontier: every URL discovered, and which one to fetch next.
 * Pure — no chrome.*, no IndexedDB — so the rules that decide WHICH pages a
 * capped crawl.
 */

export function createFrontier({ maxPages, maxDepth = 0, isAllowed = () => true }) {
  const entries = new Map();
  const queue = [];
  const dirty = new Set();
  let cursor = entries.entries();
  let allowed = isAllowed;
  let pending = 0;
  let fetchedCount = 0;

  const withinDepth = (depth) => maxDepth === 0 || depth === null || depth <= maxDepth;
  const budget = () => maxPages - fetchedCount - pending;
  const eligible = (e) => e.crawlable && !e.queued && !e.visited && !e.blocked;

  function claim(e) {
    e.queued = true;
    pending += 1;
  }

  /**
   * Record a sighting of an internal URL. `crawlable: false` records it without
   * authorising a fetch — a nofollow link, or a redirect target already fetched.
   */
  function discover(url, { depth = null, source, crawlable = true } = {}) {
    let e = entries.get(url);
    if (!e) {
      e = { depth: null, sources: new Set(), crawlable: false, blocked: false, queued: false, visited: false };
      entries.set(url, e);
    }
    dirty.add(url);
    if (source) e.sources.add(source);
    if (depth !== null && (e.depth === null || depth < e.depth)) e.depth = depth;

    if (!crawlable) return e;
    if (!e.crawlable) {
      e.crawlable = true;
      e.blocked = !allowed(url);
    }

    if (!eligible(e) || e.depth === null || !withinDepth(e.depth) || budget() <= 0) return e;
    claim(e);
    queue.push(url);
    return e;
  }

  function next() {
    while (queue.length) {
      const url = queue.shift();
      const e = entries.get(url);
      if (!e.visited) return { url, depth: e.depth };
    }
    if (budget() <= 0) return null;

    for (let pass = 0; pass < 2; pass += 1) {
      for (let step = cursor.next(); !step.done; step = cursor.next()) {
        const [url, e] = step.value;
        if (eligible(e) && withinDepth(e.depth)) {
          claim(e);
          return { url, depth: e.depth };
        }
      }
      cursor = entries.entries();
    }
    return null;
  }

  function markVisited(url, { fetched = false, blocked = false } = {}) {
    const e = entries.get(url);
    if (!e || e.visited) return e;
    if (e.queued) pending -= 1;
    e.visited = true;
    if (blocked) e.blocked = true;
    if (fetched) fetchedCount += 1;
    dirty.add(url);
    return e;
  }

  /** Counts for the run record. One O(n) pass — call at the end, not per page. */
  function summary() {
    let notCrawled = 0;
    let beyondDepth = 0;
    let blocked = 0;
    for (const e of entries.values()) {
      if (e.blocked) blocked += 1;
      else if (e.crawlable && !e.visited) {
        if (withinDepth(e.depth)) notCrawled += 1;
        else beyondDepth += 1;
      }
    }
    return { discovered: entries.size, crawled: fetchedCount, notCrawled, beyondDepth, blocked };
  }

  /** Rows changed since last call, handed out once. Persistence cost ∝ change, not size. */
  function takeDirty() {
    const rows = [];
    for (const url of dirty) {
      const e = entries.get(url);
      rows.push({
        url,
        depth: e.depth,
        sources: [...e.sources],
        crawlable: e.crawlable,
        blocked: e.blocked,
        visited: e.visited
      });
    }
    dirty.clear();
    return rows;
  }

  /** A save failed — give these back so the next save retries them. */
  function markDirty(urls) {
    for (const url of urls) if (entries.has(url)) dirty.add(url);
  }

  /**
   * Rebuild from persisted rows. The queue is derived, never stored: every
   * unvisited linked URL, re-sorted breadth-first, up to the budget.
   */
  function restore(rows, crawledSoFar) {
    fetchedCount = crawledSoFar;
    for (const row of rows) {
      entries.set(row.url, {
        depth: row.depth,
        sources: new Set(row.sources),
        crawlable: row.crawlable,
        blocked: row.blocked,
        queued: false,
        visited: row.visited
      });
    }
    const linked = [...entries]
      .filter(([, e]) => eligible(e) && e.depth !== null && withinDepth(e.depth))
      .sort((a, b) => a[1].depth - b[1].depth);
    for (const [url, e] of linked) {
      if (budget() <= 0) break;
      claim(e);
      queue.push(url);
    }
    cursor = entries.entries();
  }

  return {
    discover,
    next,
    markVisited,
    summary,
    takeDirty,
    markDirty,
    restore,
    get: (url) => entries.get(url),
    size: () => entries.size,
    fetched: () => fetchedCount,
    /** robots.txt arrives after the start URL is already recorded. */
    setAllowed: (fn) => {
      allowed = fn;
    }
  };
}
