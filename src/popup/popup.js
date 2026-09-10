/**
 * SEO Silo Analyzer — Extension Popup Controller
 * Phase 1 MVP Interface Logic
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
  const permissionBanner = document.getElementById('permission-banner');
  const btnRequestPerm = document.getElementById('btn-request-perm');

  // Live Audit Controls & Stats
  const liveStatusText = document.getElementById('live-status-text');
  const pulseDot = document.getElementById('pulse-dot');
  const crawlProgressBar = document.getElementById('crawl-progress-bar');
  const crawlProgressPercent = document.getElementById('crawl-progress-percent');
  const liveUrlTicker = document.getElementById('live-url-ticker');
  const statCrawled = document.getElementById('stat-crawled');
  const statQueue = document.getElementById('stat-queue');
  const statDepth = document.getElementById('stat-depth');
  const statErrors = document.getElementById('stat-errors');
  const statElapsed = document.getElementById('stat-elapsed');

  // Action Buttons
  const btnStartCrawl = document.getElementById('btn-start-crawl');
  const btnPauseCrawl = document.getElementById('btn-pause-crawl');
  const btnStopCrawl = document.getElementById('btn-stop-crawl');
  const btnOpenDashboard = document.getElementById('btn-open-dashboard');
  const btnExportAudit = document.getElementById('btn-export-audit');

  // Summary Elements
  const summaryScore = document.getElementById('summary-score');
  const summaryStatusTitle = document.getElementById('summary-status-title');
  const summarySiteUrl = document.getElementById('summary-site-url');
  const summaryStatusBadge = document.getElementById('summary-status-badge');
  const scoreArch = document.getElementById('score-arch');
  const scoreLinks = document.getElementById('score-links');
  const scoreIndex = document.getElementById('score-index');
  const scoreTech = document.getElementById('score-tech');
  const scoreContent = document.getElementById('score-content');
  const scoreSchema = document.getElementById('score-schema');
  const countCritical = document.getElementById('count-critical');
  const countWarnings = document.getElementById('count-warnings');
  const countPassed = document.getElementById('count-passed');

  // Application State
  let currentMaxPages = 100;
  let isCrawling = false;
  let isPaused = false;
  let elapsedTimeInterval = null;
  let startTime = null;

  // Inline Validation Helpers
  function showUrlError(msg) {
    if (urlErrorMsg) {
      urlErrorMsg.textContent = `⚠ ${msg}`;
      urlErrorMsg.style.display = 'block';
    }
    if (startUrlInput) {
      startUrlInput.classList.add('input-error');
      startUrlInput.focus();
    }
  }

  function clearUrlError() {
    if (urlErrorMsg) {
      urlErrorMsg.style.display = 'none';
    }
    if (startUrlInput) {
      startUrlInput.classList.remove('input-error');
    }
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
    if (themeIcon) {
      themeIcon.innerHTML = theme === 'dark' ? SUN_SVG_PATH : MOON_SVG_PATH;
    }
    themeToggleBtn.setAttribute('title', `Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Theme`);

    // Storage persistence
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({ theme });
    } else {
      localStorage.setItem('silo_theme', theme);
    }
  }

  function initTheme() {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(['theme'], (result) => {
        if (result.theme) {
          applyTheme(result.theme);
        } else {
          const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
          applyTheme(prefersDark ? 'dark' : 'light');
        }
      });
    } else {
      const savedTheme = localStorage.getItem('silo_theme');
      if (savedTheme) {
        applyTheme(savedTheme);
      } else {
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        applyTheme(prefersDark ? 'dark' : 'light');
      }
    }
  }

  themeToggleBtn.addEventListener('click', () => {
    const currentTheme = htmlEl.getAttribute('data-theme') || 'dark';
    const nextTheme = currentTheme === 'dark' ? 'light' : 'dark';
    applyTheme(nextTheme);
  });

  initTheme();

  // =========================================================================
  // 2. View Switching / Navigation
  // =========================================================================

  function switchView(viewName) {
    navTabs.forEach(tab => {
      if (tab.dataset.view === viewName) {
        tab.classList.add('active');
      } else {
        tab.classList.remove('active');
      }
    });

    viewPanels.forEach(panel => {
      if (panel.id === `panel-${viewName}`) {
        panel.classList.add('active');
      } else {
        panel.classList.remove('active');
      }
    });

    Object.keys(footerActionGroups).forEach(key => {
      if (footerActionGroups[key]) {
        footerActionGroups[key].style.display = (key === viewName) ? 'flex' : 'none';
      }
    });
  }

  navTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      switchView(tab.dataset.view);
    });
  });

  // =========================================================================
  // 3. Tab Detection & Host Permission Verification
  // =========================================================================

  function checkHostPermission(urlStr) {
    if (typeof chrome === 'undefined' || !chrome.permissions) return;
    try {
      const url = new URL(urlStr);
      const originPattern = `${url.protocol}//${url.hostname}/*`;

      chrome.permissions.contains({ origins: [originPattern] }, (granted) => {
        if (permissionBanner) {
          permissionBanner.style.display = granted ? 'none' : 'flex';
        }
      });
    } catch (e) {
      if (permissionBanner) permissionBanner.style.display = 'none';
    }
  }

  function detectActiveTab() {
    if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.query) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs && tabs.length > 0 && tabs[0].url) {
          const currentUrl = tabs[0].url;
          if (currentUrl.startsWith('http://') || currentUrl.startsWith('https://')) {
            startUrlInput.value = currentUrl;
            checkHostPermission(currentUrl);
          }
        }
      });
    }
  }

  btnDetectTab.addEventListener('click', () => {
    clearUrlError();
    detectActiveTab();
  });

  startUrlInput.addEventListener('input', () => {
    clearUrlError();
    checkHostPermission(startUrlInput.value);
  });

  if (btnRequestPerm) {
    btnRequestPerm.addEventListener('click', () => {
      if (!startUrlInput.value) return;
      try {
        const url = new URL(startUrlInput.value);
        const originPattern = `${url.protocol}//${url.hostname}/*`;
        chrome.permissions.request({ origins: [originPattern] }, (granted) => {
          if (granted && permissionBanner) {
            permissionBanner.style.display = 'none';
          }
        });
      } catch (e) {
        console.error('Invalid URL format for permissions request', e);
      }
    });
  }

  // Initial detection on launch
  detectActiveTab();

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

  function startTimer() {
    startTime = Date.now();
    if (elapsedTimeInterval) clearInterval(elapsedTimeInterval);

    elapsedTimeInterval = setInterval(() => {
      const elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);
      const mins = String(Math.floor(elapsedSeconds / 60)).padStart(2, '0');
      const secs = String(elapsedSeconds % 60).padStart(2, '0');
      statElapsed.textContent = `${mins}:${secs}`;
    }, 1000);
  }

  function stopTimer() {
    if (elapsedTimeInterval) {
      clearInterval(elapsedTimeInterval);
      elapsedTimeInterval = null;
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

  btnStartCrawl.addEventListener('click', () => {
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

    // Switch state to live crawl
    isCrawling = true;
    isPaused = false;
    switchView('live');

    liveStatusText.textContent = 'Crawling Active...';
    pulseDot.style.opacity = '1';
    crawlProgressBar.style.width = '2%';
    crawlProgressPercent.textContent = '2%';
    liveUrlTicker.textContent = `Fetching: ${config.startUrl}`;

    statCrawled.textContent = '1';
    statQueue.textContent = '0';
    statDepth.textContent = '0';
    statErrors.textContent = '0';

    startTimer();

    // Send start command to MV3 Service Worker
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
      chrome.runtime.sendMessage({
        action: 'START_CRAWL',
        config
      }, (response) => {
        if (chrome.runtime.lastError) {
          console.warn('Service worker response fallback:', chrome.runtime.lastError.message);
        }
      });
    }
  });

  btnPauseCrawl.addEventListener('click', () => {
    isPaused = !isPaused;
    if (isPaused) {
      btnPauseCrawl.textContent = 'Resume';
      liveStatusText.textContent = 'Audit Paused';
      pulseDot.style.animationPlayState = 'paused';
    } else {
      btnPauseCrawl.textContent = 'Pause';
      liveStatusText.textContent = 'Crawling Active...';
      pulseDot.style.animationPlayState = 'running';
    }

    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
      chrome.runtime.sendMessage({
        action: isPaused ? 'PAUSE_CRAWL' : 'RESUME_CRAWL'
      });
    }
  });

  btnStopCrawl.addEventListener('click', () => {
    isCrawling = false;
    isPaused = false;
    stopTimer();

    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
      chrome.runtime.sendMessage({ action: 'STOP_CRAWL' });
    }

    // Populate mock Phase 1 summary for immediate UX preview
    populateSummaryResults({
      siteUrl: startUrlInput.value || 'https://example.com',
      overallScore: 84,
      statusTitle: 'Solid Architecture',
      archScore: 78,
      linksScore: 72,
      indexScore: 91,
      techScore: 88,
      contentScore: 82,
      schemaScore: 94,
      criticalCount: 2,
      warningsCount: 7,
      passedCount: 45
    });

    switchView('summary');
  });

  // =========================================================================
  // 6. Audit Summary Population (FR-16, FR-17)
  // =========================================================================

  function populateSummaryResults(data) {
    summaryScore.textContent = data.overallScore ?? '--';
    summaryStatusTitle.textContent = data.statusTitle || 'Audit Complete';
    summarySiteUrl.textContent = data.siteUrl || '';
    summaryStatusBadge.textContent = data.overallScore >= 80 ? 'PASSED' : 'NEEDS ATTENTION';

    scoreArch.textContent = data.archScore ?? '--';
    scoreLinks.textContent = data.linksScore ?? '--';
    scoreIndex.textContent = data.indexScore ?? '--';
    scoreTech.textContent = data.techScore ?? '--';
    scoreContent.textContent = data.contentScore ?? '--';
    scoreSchema.textContent = data.schemaScore ?? '--';

    countCritical.textContent = data.criticalCount ?? 0;
    countWarnings.textContent = data.warningsCount ?? 0;
    countPassed.textContent = data.passedCount ?? 0;
  }

  // Dashboard & Export Launchers
  btnOpenDashboard.addEventListener('click', () => {
    if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.create) {
      chrome.tabs.create({ url: chrome.runtime.getURL('src/dashboard/dashboard.html') });
    } else {
      alert('Dashboard launcher: Available in Chrome Extension context.');
    }
  });

  btnExportAudit.addEventListener('click', () => {
    alert('Export options (CSV/JSON) will generate report from local IndexedDB.');
  });

  // Listen for real-time messages from background service worker
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((message) => {
      if (!message || !message.type) return;

      if (message.type === 'CRAWL_PROGRESS') {
        const p = message.progress;
        if (p) {
          statCrawled.textContent = p.crawledCount || 0;
          statQueue.textContent = p.queueCount || 0;
          statDepth.textContent = p.maxDepthReached || 0;
          statErrors.textContent = p.errorCount || 0;

          if (p.currentUrl) {
            liveUrlTicker.textContent = `Fetching: ${p.currentUrl}`;
          }

          if (p.percent) {
            crawlProgressBar.style.width = `${p.percent}%`;
            crawlProgressPercent.textContent = `${p.percent}%`;
          }
        }
      } else if (message.type === 'CRAWL_COMPLETE') {
        isCrawling = false;
        stopTimer();
        if (message.summary) {
          populateSummaryResults(message.summary);
        }
        switchView('summary');
      }
    });
  }
});
