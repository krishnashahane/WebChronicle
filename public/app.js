// ============================
// WebChronicle — App Logic
// ============================

(function () {
  'use strict';

  // DOM Elements
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

  // ---- Event Listeners ----

  searchForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const url = urlInput.value.trim();
    if (url) {
      fetchSnapshots(url);
    }
  });

  document.querySelectorAll('.quick-link').forEach((btn) => {
    btn.addEventListener('click', () => {
      const url = btn.dataset.url;
      urlInput.value = url;
      fetchSnapshots(url);
    });
  });

  retryBtn.addEventListener('click', () => {
    if (lastSearchedUrl) {
      fetchSnapshots(lastSearchedUrl);
    }
  });

  modalCloseBtn.addEventListener('click', closeModal);
  modalOverlay.addEventListener('click', closeModal);

  navPrev.addEventListener('click', () => navigateModal(-1));
  navNext.addEventListener('click', () => navigateModal(1));

  document.addEventListener('keydown', (e) => {
    if (!modal.classList.contains('hidden')) {
      if (e.key === 'Escape') closeModal();
      if (e.key === 'ArrowLeft') navigateModal(-1);
      if (e.key === 'ArrowRight') navigateModal(1);
    }
  });

  // ---- Core Functions ----

  async function fetchSnapshots(inputUrl) {
    // Normalize URL
    let url = inputUrl.trim();
    if (!/^https?:\/\//i.test(url)) {
      url = url.replace(/^\/\//, '');
    }

    lastSearchedUrl = url;
    showState('loading');

    try {
      const response = await fetch(`/api/snapshots?url=${encodeURIComponent(url)}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch snapshots');
      }

      if (!data.snapshots || data.snapshots.length === 0) {
        throw new Error(
          'No archived snapshots found for this website. Try a well-known domain like google.com or apple.com.'
        );
      }

      currentSnapshots = data.snapshots;
      renderResults(url, data.snapshots, data.total);
      showState('results');
    } catch (err) {
      errorMsg.textContent = err.message;
      showState('error');
    }
  }

  function showState(state) {
    loadingEl.classList.toggle('hidden', state !== 'loading');
    errorEl.classList.toggle('hidden', state !== 'error');
    resultsEl.classList.toggle('hidden', state !== 'results');
    searchBtn.disabled = state === 'loading';
  }

  function renderResults(url, snapshots, totalCount) {
    const displayUrl = url.replace(/^https?:\/\//, '').replace(/\/+$/, '');
    const yearRange = `${snapshots[0].year} — ${snapshots[snapshots.length - 1].year}`;
    resultsTitle.textContent = `${displayUrl}`;
    resultsSubtitle.textContent = `${snapshots.length} snapshots spanning ${yearRange} (${totalCount} total captures)`;

    renderTimeline(snapshots);
    renderCards(snapshots);
  }

  function renderTimeline(snapshots) {
    timelineMarkers.innerHTML = '';

    snapshots.forEach((snap, index) => {
      const marker = document.createElement('div');
      marker.className = 'timeline-marker';
      marker.dataset.index = index;
      marker.innerHTML = `
        <span class="marker-year">${snap.year}</span>
        <div class="marker-dot"></div>
      `;
      marker.addEventListener('click', () => {
        scrollToCard(index);
        setActiveMarker(index);
      });
      timelineMarkers.appendChild(marker);
    });
  }

  function renderCards(snapshots) {
    snapshotsGrid.innerHTML = '';

    snapshots.forEach((snap, index) => {
      const card = document.createElement('div');
      card.className = 'snapshot-card';
      card.dataset.index = index;

      const formattedDate = formatDate(snap.date);

      card.innerHTML = `
        <div class="card-preview">
          <div class="card-preview-loading">Loading preview...</div>
          <iframe
            data-src="${snap.url}"
            title="Snapshot from ${snap.year}"
            loading="lazy"
            sandbox="allow-same-origin"
          ></iframe>
          <div class="card-preview-overlay"></div>
        </div>
        <div class="card-info">
          <div>
            <div class="card-year">${snap.year}</div>
            <div class="card-date">${formattedDate}</div>
          </div>
          <div class="card-badge">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
              <polyline points="15 3 21 3 21 9"/>
              <line x1="10" y1="14" x2="21" y2="3"/>
            </svg>
            View Full
          </div>
        </div>
      `;

      card.addEventListener('click', () => openModal(index));
      snapshotsGrid.appendChild(card);
    });

    // Lazy-load iframes using IntersectionObserver
    lazyLoadIframes();
  }

  function lazyLoadIframes() {
    const iframes = snapshotsGrid.querySelectorAll('iframe[data-src]');

    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              const iframe = entry.target;
              iframe.src = iframe.dataset.src;
              iframe.removeAttribute('data-src');
              observer.unobserve(iframe);

              // Hide loading text once iframe loads
              iframe.addEventListener('load', () => {
                const loadingDiv = iframe.parentElement.querySelector('.card-preview-loading');
                if (loadingDiv) loadingDiv.style.display = 'none';
              });
            }
          });
        },
        { rootMargin: '200px' }
      );

      iframes.forEach((iframe) => observer.observe(iframe));
    } else {
      // Fallback: load all immediately
      iframes.forEach((iframe) => {
        iframe.src = iframe.dataset.src;
        iframe.removeAttribute('data-src');
      });
    }
  }

  function scrollToCard(index) {
    const card = snapshotsGrid.querySelector(`[data-index="${index}"]`);
    if (card) {
      card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  function setActiveMarker(index) {
    document.querySelectorAll('.timeline-marker').forEach((m) => m.classList.remove('active'));
    const marker = timelineMarkers.querySelector(`[data-index="${index}"]`);
    if (marker) marker.classList.add('active');

    document.querySelectorAll('.snapshot-card').forEach((c) => c.classList.remove('active'));
    const card = snapshotsGrid.querySelector(`[data-index="${index}"]`);
    if (card) card.classList.add('active');
  }

  // ---- Modal ----

  function openModal(index) {
    currentModalIndex = index;
    const snap = currentSnapshots[index];

    modalYear.textContent = snap.year;
    modalDate.textContent = formatDate(snap.date);
    modalIframe.src = snap.url;
    modalExternalLink.href = snap.url;

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
    if (newIndex >= 0 && newIndex < currentSnapshots.length) {
      openModal(newIndex);
    }
  }

  function updateNavButtons() {
    navPrev.disabled = currentModalIndex <= 0;
    navNext.disabled = currentModalIndex >= currentSnapshots.length - 1;
  }

  // ---- Helpers ----

  function formatDate(dateStr) {
    try {
      const [year, month, day] = dateStr.split('-').map(Number);
      const date = new Date(year, month - 1, day);
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    } catch {
      return dateStr;
    }
  }
})();
