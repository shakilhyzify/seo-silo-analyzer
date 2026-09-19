/**
 * Message router. The crawl itself lives in crawler.js — this file only
 * translates popup messages into calls and returns a reply.
 *
 * Every handler returns fast: an MV3 worker is killed if one event takes
 * longer than 5 minutes, so nothing here awaits a crawl.
 */

import {
  startCrawl,
  pauseCrawl,
  resumeCrawl,
  stopCrawl,
  getState,
  resumeInterruptedRun
} from './crawler.js';
import { latestRun } from '../shared/db.js';

const handlers = {
  START_CRAWL: (msg) => startCrawl(msg.config),
  PAUSE_CRAWL: () => pauseCrawl(),
  RESUME_CRAWL: () => resumeCrawl(),
  STOP_CRAWL: () => stopCrawl(),
  RESUME_RUN: (msg) => resumeInterruptedRun(msg.runId),

  /**
   * The popup's DOM dies when it closes, so it owns no crawl state — it asks
   * for the truth on every open. When nothing is running, hand back the last
   * run so the popup can show its result or offer to resume it.
   */
  GET_STATE: async () => {
    const live = getState();
    if (live.status !== 'idle') return { live };
    const run = await latestRun();
    return { live, lastRun: run ?? null };
  }
};

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const handler = message && handlers[message.action];
  if (!handler) return false;

  Promise.resolve(handler(message))
    .then(sendResponse)
    .catch((err) => {
      console.error('[silo]', message.action, err);
      sendResponse({ ok: false, error: err?.message ?? String(err) });
    });

  return true;   // keeps the channel open for the async reply
});
