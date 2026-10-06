(function () {
  'use strict';

  const searchForm = document.getElementById('search-form');
  const urlInput = document.getElementById('url-input');
  const searchBtn = document.getElementById('search-btn');
  const loadingEl = document.getElementById('loading');
  const errorEl = document.getElementById('error');
  const errorMsg = errorEl.querySelector('.error-message');
  const retryBtn = document.getElementById('retry-btn');
  const resultsEl = document.getElementById('results');
  const resultsTitle = document.getElementById('results-title');
  const resultsSubtitle = document.getElementById('results-subtitle');
  const timelineMarkers = document.getElementById('timeline-markers');
  const snapshotsGrid = document.getElementById('snapshots-grid');
  const modal = document.getElementById('preview-modal');
  const modalYear = document.getElementById('modal-year');
  const modalDate = document.getElementById('modal-date');
  const modalIframe = document.getElementById('modal-iframe');
  const modalExternalLink = document.getElementById('modal-external-link');
  const modalCloseBtn = document.getElementById('modal-close');
  const modalOverlay = modal.querySelector('.modal-overlay');
  const navPrev = document.getElementById('nav-prev');
  const navNext = document.getElementById('nav-next');

  let currentSnapshots = [];
  let currentModalIndex = -1;
  let lastSearchedUrl = '';
  let activeRequest = null;

  searchForm.addEventListener('submit', (event) => {
    event.preventDefault();
    fetchSnapshots(urlInput.value);
  });

  document.querySelectorAll('.quick-link').forEach((button) => {
    button.addEventListener('click', () => {
      urlInput.value = button.dataset.url || '';
      fetchSnapshots(urlInput.value);
    });
  });

  retryBtn.addEventListener('click', () => {
    if (lastSearchedUrl) fetchSnapshots(lastSearchedUrl);
  });

  modalCloseBtn.addEventListener('click', closeModal);
  modalOverlay.addEventListener('click', closeModal);
  navPrev.addEventListener('click', () => navigateModal(-1));
  navNext.addEventListener('click', () => navigateModal(1));

  document.addEventListener('keydown', (event) => {
    if (modal.classList.contains('hidden')) return;
    if (event.key === 'Escape') closeModal();
    if (event.key === 'ArrowLeft') navigateModal(-1);
    if (event.key === 'ArrowRight') navigateModal(1);
  });

  async function fetchSnapshots(inputUrl) {
    const url = normalizeInputUrl(inputUrl);

    if (!url) {
      errorMsg.textContent = 'Enter a valid website URL, for example https://example.com.';
      showState('error');
      return;
    }

    lastSearchedUrl = url;
    showState('loading');

    if (activeRequest) activeRequest.abort();
    activeRequest = new AbortController();

    const timeoutId = setTimeout(() => activeRequest.abort(), 20000);

    try {
      const response = await fetch(`/api/snapshots?url=${encodeURIComponent(url)}`, {
        signal: activeRequest.signal,
        headers: { Accept: 'application/json' }
      });

      let data = {};
      try {
        data = await response.json();
      } catch {
        data = {};
      }

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch snapshots.');
      }

      if (!Array.isArray(data.snapshots) || data.snapshots.length === 0) {
        throw new Error(
          'No archived snapshots found for this website. Try a well-known domain like google.com or apple.com.'
        );
      }

      currentSnapshots = data.snapshots.filter(isSafeSnapshot);
      if (currentSnapshots.length === 0) {
        throw new Error('The archive returned no usable snapshots for this website.');
      }

      renderResults(url, currentSnapshots, Number(data.total) || currentSnapshots.length);
      showState('results');
    } catch (error) {
      if (error.name === 'AbortError') {
        if (!activeRequest || activeRequest.signal.aborted) {
          errorMsg.textContent = 'The archive request timed out or was cancelled. Please try again.';
        }
      } else {
        errorMsg.textContent = error.message || 'Something went wrong. Please try again.';
      }
      showState('error');
    } finally {
      clearTimeout(timeoutId);
    }
  }

  function normalizeInputUrl(input) {
    if (typeof input !== 'string') return null;
    let value = input.trim();
    if (!value) return null;
    if (!/^https?:\/\//i.test(value)) value = `https://${value}`;

    try {
      const parsed = new URL(value);
      if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname) return null;
      parsed.username = '';
      parsed.password = '';
      parsed.hash = '';
      return parsed.toString().replace(/\/+$/, '');
    } catch {
      return null;
    }
  }

  function isSafeSnapshot(snapshot) {
    return Boolean(
      snapshot &&
      Number.isInteger(snapshot.year) &&
      /^\d{14}$/.test(String(snapshot.timestamp || '')) &&
      typeof snapshot.date === 'string' &&
      typeof snapshot.url === 'string' &&
      /^https:\/\/web\.archive\.org\/web\/\d{14}\//.test(snapshot.url)
    );
  }

  function showState(state) {
    loadingEl.classList.toggle('hidden', state !== 'loading');
    errorEl.classList.toggle('hidden', state !== 'error');
    resultsEl.classList.toggle('hidden', state !== 'results');
    searchBtn.disabled = state === 'loading';
  }

  function renderResults(url, snapshots, totalCount) {
    const displayUrl = url.replace(/^https?:\/\//i, '').replace(/\/+$/, '');
    const yearRange = `${snapshots[0].year} — ${snapshots[snapshots.length - 1].year}`;
    resultsTitle.textContent = displayUrl;
    resultsSubtitle.textContent =
      `${snapshots.length} snapshots spanning ${yearRange} (${totalCount} total captures)`;

    renderTimeline(snapshots);
    renderCards(snapshots);
  }

  function renderTimeline(snapshots) {
    timelineMarkers.replaceChildren();

    snapshots.forEach((snapshot, index) => {
      const marker = document.createElement('div');
      marker.className = 'timeline-marker';
      marker.dataset.index = String(index);

      const year = document.createElement('span');
      year.className = 'marker-year';
      year.textContent = String(snapshot.year);

      const dot = document.createElement('div');
      dot.className = 'marker-dot';

      marker.append(year, dot);
      marker.addEventListener('click', () => {
        scrollToCard(index);
        setActiveMarker(index);
      });

      timelineMarkers.appendChild(marker);
    });
  }

  function renderCards(snapshots) {
    snapshotsGrid.replaceChildren();

    snapshots.forEach((snapshot, index) => {
      const card = document.createElement('div');
      card.className = 'snapshot-card';
      card.dataset.index = String(index);

      const preview = document.createElement('div');
      preview.className = 'card-preview';

      const loading = document.createElement('div');
      loading.className = 'card-preview-loading';
      loading.textContent = 'Loading preview...';

      const iframe = document.createElement('iframe');
      iframe.dataset.src = snapshot.url;
      iframe.title = `Snapshot from ${snapshot.year}`;
      iframe.loading = 'lazy';
      iframe.setAttribute('sandbox', 'allow-same-origin');

      const overlay = document.createElement('div');
      overlay.className = 'card-preview-overlay';

      preview.append(loading, iframe, overlay);

      const info = document.createElement('div');
      info.className = 'card-info';

      const textWrap = document.createElement('div');
      const year = document.createElement('div');
      year.className = 'card-year';
      year.textContent = String(snapshot.year);

      const date = document.createElement('div');
      date.className = 'card-date';
      date.textContent = formatDate(snapshot.date);

      textWrap.append(year, date);

      const badge = document.createElement('div');
      badge.className = 'card-badge';
      badge.textContent = 'View Full';

      info.append(textWrap, badge);
      card.append(preview, info);

      card.addEventListener('click', () => openModal(index));
      snapshotsGrid.appendChild(card);
    });

    lazyLoadIframes();
  }

  function lazyLoadIframes() {
    const iframes = snapshotsGrid.querySelectorAll('iframe[data-src]');

    const load = (iframe) => {
      const source = iframe.dataset.src;
      if (!source) return;

      iframe.src = source;
      delete iframe.dataset.src;

      iframe.addEventListener('load', () => {
        const loading = iframe.parentElement.querySelector('.card-preview-loading');
        if (loading) loading.hidden = true;
      }, { once: true });
    };

    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            load(entry.target);
            observer.unobserve(entry.target);
          }
        });
      }, { rootMargin: '200px' });

      iframes.forEach((iframe) => observer.observe(iframe));
    } else {
      iframes.forEach(load);
    }
  }

  function scrollToCard(index) {
    const card = snapshotsGrid.querySelector(`[data-index="${CSS.escape(String(index))}"]`);
    if (card) card.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function setActiveMarker(index) {
    document.querySelectorAll('.timeline-marker, .snapshot-card').forEach((element) => {
      element.classList.remove('active');
    });

    const marker = timelineMarkers.querySelector(`[data-index="${CSS.escape(String(index))}"]`);
    const card = snapshotsGrid.querySelector(`[data-index="${CSS.escape(String(index))}"]`);

    if (marker) marker.classList.add('active');
    if (card) card.classList.add('active');
  }

  function openModal(index) {
    const snapshot = currentSnapshots[index];
    if (!snapshot || !isSafeSnapshot(snapshot)) return;

    currentModalIndex = index;
    modalYear.textContent = String(snapshot.year);
    modalDate.textContent = formatDate(snapshot.date);
    modalIframe.src = snapshot.url;
    modalExternalLink.href = snapshot.url;

    updateNavButtons();
    setActiveMarker(index);
    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  }

  function closeModal() {
    modal.classList.add('hidden');
    modalIframe.src = 'about:blank';
    document.body.style.overflow = '';
    currentModalIndex = -1;
  }

  function navigateModal(direction) {
    const newIndex = currentModalIndex + direction;
    if (newIndex >= 0 && newIndex < currentSnapshots.length) openModal(newIndex);
  }

  function updateNavButtons() {
    navPrev.disabled = currentModalIndex <= 0;
    navNext.disabled = currentModalIndex >= currentSnapshots.length - 1;
  }

  function formatDate(dateString) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateString);
    if (!match) return dateString;

    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    if (Number.isNaN(date.getTime())) return dateString;

    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }
})();