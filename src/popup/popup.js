/**
 * SEO Silo Analyzer — Extension Popup Controller
 * Phase 1 MVP Interface Logic
 *
 * The popup owns NO crawl state. Its DOM is destroyed the moment it closes
 * while the crawl keeps running in the service worker, so on every open it
 * asks the worker what is true (GET_STATE) instead of remembering.
 */

document.addEventListener('DOMContentLoaded', () => {
  // DOM Element References
  const htmlEl = document.documentElement;
  const themeToggleBtn = document.getElementById('theme-toggle');
  const themeIcon = document.getElementById('theme-icon');

  // Navigation
  const navTabs = document.querySelectorAll('.nav-tab');
  const viewPanels = document.querySelectorAll('.view-panel');
  const footerActionGroups = {
    setup: document.getElementById('footer-setup-actions'),
    live: document.getElementById('footer-live-actions'),
    summary: document.getElementById('footer-summary-actions')
  };

  // Form Inputs
  const startUrlInput = document.getElementById('start-url');
  const urlErrorMsg = document.getElementById('url-error-msg');
  const btnDetectTab = document.getElementById('btn-detect-tab');
  const chipBtns = document.querySelectorAll('#max-pages-chips .chip-btn');
  const customPagesWrapper = document.getElementById('custom-pages-wrapper');
  const maxPagesCustomInput = document.getElementById('max-pages-custom');
  const pagesCapLabel = document.getElementById('pages-cap-label');
  const crawlDepthSelect = document.getElementById('crawl-depth');
  const toggleSubdomains = document.getElementById('toggle-subdomains');
  const toggleNofollow = document.getElementById('toggle-nofollow');
  const crawlDelaySlider = document.getElementById('crawl-delay');
  const delayValueDisplay = document.getElementById('delay-value');
  const resumeBanner = document.getElementById('resume-banner');
  const resumeDetail = document.getElementById('resume-detail');
  const btnResumeRun = document.getElementById('btn-resume-run');

  // Live Audit Controls & Stats
  const liveStatusText = document.getElementById('live-status-text');
  const pulseDot = document.getElementById('pulse-dot');
  const crawlProgressBar = document.getElementById('crawl-progress-bar');
  const crawlProgressPercent = document.getElementById('crawl-progress-percent');
  const liveUrlTicker = document.getElementById('live-url-ticker');
  const statCrawled = document.getElementById('stat-crawled');
  const statDiscovered = document.getElementById('stat-discovered');
  const statDepth = document.getElementById('stat-depth');
  const statErrors = document.getElementById('stat-errors');
  const statElapsed = document.getElementById('stat-elapsed');

  // Action Buttons
  const btnStartCrawl = document.getElementById('btn-start-crawl');
  const btnPauseCrawl = document.getElementById('btn-pause-crawl');
  const btnStopCrawl = document.getElementById('btn-stop-crawl');

  // Summary Elements
  const summaryScore = document.getElementById('summary-score');
  const summaryStatusTitle = document.getElementById('summary-status-title');
  const summarySiteUrl = document.getElementById('summary-site-url');
  const summaryStatusBadge = document.getElementById('summary-status-badge');
  const countCritical = document.getElementById('count-critical');
  const countWarnings = document.getElementById('count-warnings');
  const countPassed = document.getElementById('count-passed');

  let currentMaxPages = 100;
  let elapsedTimer = null;
  let elapsedBase = null;
  async function send(action, extra = {}) {
    try {
      return await chrome.runtime.sendMessage({ action, ...extra });
    } catch (err) {
      console.error('[popup] no response from service worker', action, err);
      return null;
    }
  }

  // Inline Validation Helpers
  function showUrlError(msg) {
    urlErrorMsg.textContent = `⚠ ${msg}`;
    urlErrorMsg.style.display = 'block';
    startUrlInput.classList.add('input-error');
    startUrlInput.focus();
  }

  function clearUrlError() {
    urlErrorMsg.style.display = 'none';
    startUrlInput.classList.remove('input-error');
  }

  // =========================================================================
  // 1. Theme Management (B&W Dark/Light Mode)
  // =========================================================================

  const SUN_SVG_PATH = `
    <circle cx="12" cy="12" r="5"></circle>
    <line x1="12" y1="1" x2="12" y2="3"></line>
    <line x1="12" y1="21" x2="12" y2="23"></line>
    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
    <line x1="1" y1="12" x2="3" y2="12"></line>
    <line x1="21" y1="12" x2="23" y2="12"></line>
    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
  `;

  const MOON_SVG_PATH = `
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
  `;

  function applyTheme(theme) {
    htmlEl.setAttribute('data-theme', theme);
    themeIcon.innerHTML = theme === 'dark' ? SUN_SVG_PATH : MOON_SVG_PATH;
    themeToggleBtn.setAttribute('title', `Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Theme`);
    chrome.storage.local.set({ theme });
  }

  function initTheme() {
    chrome.storage.local.get(['theme'], (result) => {
      if (result.theme) {
        applyTheme(result.theme);
      } else {
        applyTheme(window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
      }
    });
  }

  themeToggleBtn.addEventListener('click', () => {
    const currentTheme = htmlEl.getAttribute('data-theme') || 'dark';
    applyTheme(currentTheme === 'dark' ? 'light' : 'dark');
  });

  initTheme();

  // =========================================================================
  // 2. View Switching / Navigation
  // =========================================================================

  function switchView(viewName) {
    navTabs.forEach(tab => tab.classList.toggle('active', tab.dataset.view === viewName));
    viewPanels.forEach(panel => panel.classList.toggle('active', panel.id === `panel-${viewName}`));

    Object.keys(footerActionGroups).forEach(key => {
      footerActionGroups[key].style.display = (key === viewName) ? 'flex' : 'none';
    });
  }

  navTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      switchView(tab.dataset.view);
    });
  });

  // =========================================================================
  // 3. Tab Detection
  // =========================================================================

  function detectActiveTab() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const currentUrl = tabs && tabs[0] && tabs[0].url;
      if (currentUrl && /^https?:\/\//.test(currentUrl)) {
        startUrlInput.value = currentUrl;
      }
    });
  }

  btnDetectTab.addEventListener('click', () => {
    clearUrlError();
    detectActiveTab();
  });

  startUrlInput.addEventListener('input', () => {
    clearUrlError();
  });

  // =========================================================================
  // 4. Form Controls & Preset Segmented Chips
  // =========================================================================

  chipBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      chipBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const val = btn.dataset.value;
      if (val === 'custom') {
        customPagesWrapper.style.display = 'block';
        currentMaxPages = parseInt(maxPagesCustomInput.value, 10) || 250;
      } else {
        customPagesWrapper.style.display = 'none';
        currentMaxPages = parseInt(val, 10);
      }
      pagesCapLabel.textContent = `${currentMaxPages} pages`;
    });
  });

  maxPagesCustomInput.addEventListener('input', () => {
    const val = parseInt(maxPagesCustomInput.value, 10) || 100;
    currentMaxPages = val;
    pagesCapLabel.textContent = `${currentMaxPages} pages`;
  });

  crawlDelaySlider.addEventListener('input', () => {
    delayValueDisplay.textContent = `${crawlDelaySlider.value} ms`;
  });

  // =========================================================================
  // 5. Crawl Actions & Messaging Integration
  // =========================================================================

  /** 40276 → "40,276". Crawl counts get large fast. */
  const formatCount = (n) => (n ?? 0).toLocaleString();

  function formatElapsed(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const mins = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
    const secs = String(totalSeconds % 60).padStart(2, '0');
    return `${mins}:${secs}`;
  }

  /** Ticks locally, but anchored to the worker's elapsed time, not the popup's. */
  function startTimer(elapsedMs) {
    elapsedBase = Date.now() - (elapsedMs || 0);
    stopTimer();
    statElapsed.textContent = formatElapsed(Date.now() - elapsedBase);

    elapsedTimer = setInterval(() => {
      statElapsed.textContent = formatElapsed(Date.now() - elapsedBase);
    }, 1000);
  }

  function stopTimer() {
    if (elapsedTimer) {
      clearInterval(elapsedTimer);
      elapsedTimer = null;
    }
  }

  function getCrawlConfig() {
    return {
      startUrl: startUrlInput.value.trim(),
      maxPages: currentMaxPages,
      maxDepth: parseInt(crawlDepthSelect.value, 10),
      includeSubdomains: toggleSubdomains.checked,
      followNofollow: toggleNofollow.checked,
      requestDelayMs: parseInt(crawlDelaySlider.value, 10)
    };
  }

  function renderProgress(p) {
    if (!p) return;
    statCrawled.textContent = p.crawledCount ?? 0;
    statDiscovered.textContent = formatCount(p.discoveredCount);
    statDepth.textContent = p.maxDepthReached ?? 0;
    statErrors.textContent = p.errorCount ?? 0;

    if (p.currentUrl) {
      liveUrlTicker.textContent = `Fetching: ${p.currentUrl}`;
    }

    if (typeof p.percent === 'number') {
      crawlProgressBar.style.width = `${p.percent}%`;
      crawlProgressPercent.textContent = `${p.percent}%`;
    }
  }

  function renderRunningState(p) {
    const paused = p.status === 'paused';
    liveStatusText.textContent = paused ? 'Audit Paused' : 'Crawling Active...';
    btnPauseCrawl.textContent = paused ? 'Resume' : 'Pause';
    pulseDot.style.animationPlayState = paused ? 'paused' : 'running';
    pulseDot.style.opacity = '1';
    renderProgress(p);
  }

  btnStartCrawl.addEventListener('click', async () => {
    clearUrlError();
    const config = getCrawlConfig();

    if (!config.startUrl) {
      showUrlError('Please enter a website URL to begin audit.');
      return;
    }

    try {
      new URL(config.startUrl);
    } catch (e) {
      showUrlError('Invalid URL format. Include http:// or https://');
      return;
    }

    btnStartCrawl.disabled = true;
    const res = await send('START_CRAWL', { config });
    btnStartCrawl.disabled = false;

    if (!res || !res.ok) {
      showUrlError((res && res.error) || 'Could not start the crawl.');
      return;
    }

    resumeBanner.style.display = 'none';
    switchView('live');
    liveUrlTicker.textContent = `Fetching: ${config.startUrl}`;
    renderRunningState({ status: 'running', crawledCount: 0, discoveredCount: 0, percent: 0 });
    startTimer(0);
  });

  btnPauseCrawl.addEventListener('click', async () => {
    const pausing = btnPauseCrawl.textContent === 'Pause';
    const p = await send(pausing ? 'PAUSE_CRAWL' : 'RESUME_CRAWL');
    if (p) renderRunningState(p);
  });

  btnStopCrawl.addEventListener('click', async () => {
    btnStopCrawl.disabled = true;
    liveStatusText.textContent = 'Stopping...';
    // The worker replies with CRAWL_COMPLETE once the in-flight page settles.
    // The summary is populated from that, never from placeholder numbers.
    await send('STOP_CRAWL');
  });

  btnResumeRun.addEventListener('click', async () => {
    const runId = btnResumeRun.dataset.runId;
    if (!runId) return;

    const res = await send('RESUME_RUN', { runId });
    if (!res || !res.ok) {
      showUrlError((res && res.error) || 'Could not resume that run.');
      return;
    }

    resumeBanner.style.display = 'none';
    switchView('live');
  });

  // =========================================================================
  // 6. Audit Summary Population (FR-01 results only)
  // =========================================================================

  // A capped crawl is not a complete one — say which it was.
  const RUN_OUTCOMES = {
    complete: ['Crawl Complete', 'CRAWLED'],
    'page-limit': ['Page Limit Reached', 'PARTIAL'],
    stopped: ['Crawl Stopped', 'STOPPED']
  };

  /**
   * Only crawl facts are shown. The six category scores and the issue
   * breakdown belong to FR-16/FR-17 and stay '--' until those checks exist —
   * a placeholder number here is indistinguishable from a real score. Fetch
   * errors aren't classified issues either: a timeout is not an SEO defect.
   */
  function populateSummaryResults(summary) {
    if (!summary) return;
    const [title, badge] = RUN_OUTCOMES[summary.status] || ['Crawl Incomplete', 'INCOMPLETE'];

    summaryScore.textContent = '--';
    summaryStatusTitle.textContent = title;
    summaryStatusBadge.textContent = badge;

    const found = summary.discoveredCount ? ` of ${formatCount(summary.discoveredCount)} found` : '';
    summarySiteUrl.textContent =
      `${summary.startUrl || ''} — ${formatCount(summary.crawledCount)} crawled${found}, ` +
      `${formatCount(summary.errorCount)} errors`;

    countCritical.textContent = '--';
    countWarnings.textContent = '--';
    countPassed.textContent = '--';
  }

  // Export (FR-20) and Dashboard (FR-04) buttons stay disabled in the markup
  // until those features exist — no listeners to wire yet.

  // =========================================================================
  // 7. Sync with the service worker (runs on every popup open)
  // =========================================================================

  chrome.runtime.onMessage.addListener((message) => {
    if (!message || !message.type) return;

    if (message.type === 'CRAWL_PROGRESS') {
      renderProgress(message.progress);
    } else if (message.type === 'CRAWL_COMPLETE') {
      stopTimer();
      btnStopCrawl.disabled = false;
      populateSummaryResults(message.summary);
      switchView('summary');
    }
  });

  (async function syncWithWorker() {
    const state = await send('GET_STATE');
    if (!state) return;

    const { live, lastRun } = state;

    // A crawl is in flight: show it, wherever the popup was last left.
    if (live && live.status !== 'idle') {
      startUrlInput.value = live.startUrl || startUrlInput.value;
      switchView('live');
      renderRunningState(live);
      if (live.status === 'paused') {
        stopTimer();
        statElapsed.textContent = formatElapsed(live.elapsedMs || 0);
      } else {
        startTimer(live.elapsedMs);
      }
      return;
    }

    detectActiveTab();

    if (!lastRun) return;

    // Last result stays available in the Summary tab without stealing the view.
    populateSummaryResults({
      status: lastRun.status,
      startUrl: lastRun.startUrl,
      crawledCount: lastRun.stats?.crawled,
      discoveredCount: lastRun.stats?.discovered,
      errorCount: lastRun.stats?.errors
    });

    // Still marked running/paused with no live crawl means the worker was
    // evicted mid-run. Stopped and page-limit runs ended on purpose.
    if (lastRun.status === 'running' || lastRun.status === 'paused') {
      resumeDetail.textContent =
        `${formatCount(lastRun.stats?.crawled)} pages crawled of ${formatCount(lastRun.stats?.discovered)} found.`;
      btnResumeRun.dataset.runId = lastRun.id;
      resumeBanner.style.display = 'flex';
    }
  })();
});
