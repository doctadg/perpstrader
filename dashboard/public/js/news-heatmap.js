(() => {
  'use strict';

  const API_BASE = '/api/news';
  const CARD_LIMIT = 120;
  const AUTO_REFRESH_MS = 30_000;

  const state = {
    hours: 24,
    category: 'ALL',
    sort: 'heat',
    query: '',
    generatedAt: '',
    totalArticles: 0,
    totalClusters: 0,
    clusters: [],
    llm: {
      enabled: false,
      model: '',
      labeledArticles: 0,
      coverage: 0,
    },
    timeline: [],
    loading: false,
  };

  const els = {
    grid: document.getElementById('heatmapGrid'),
    llmStatus: document.getElementById('llmStatus'),
    dataStatus: document.getElementById('dataStatus'),
    updateStatus: document.getElementById('updateStatus'),
    statArticles: document.getElementById('statArticles'),
    statClusters: document.getElementById('statClusters'),
    statCoverage: document.getElementById('statCoverage'),
    statMaxHeat: document.getElementById('statMaxHeat'),
    categoryFilter: document.getElementById('categoryFilter'),
    sortFilter: document.getElementById('sortFilter'),
    searchInput: document.getElementById('searchInput'),
    refreshBtn: document.getElementById('refreshBtn'),
    rebuildBtn: document.getElementById('rebuildBtn'),
    timelineCanvas: document.getElementById('timelineCanvas'),
    timelineRange: document.getElementById('timelineRange'),
    detailDrawer: document.getElementById('detailDrawer'),
    closeDrawerBtn: document.getElementById('closeDrawerBtn'),
    drawerTitle: document.getElementById('drawerTitle'),
    drawerMeta: document.getElementById('drawerMeta'),
    drawerSummary: document.getElementById('drawerSummary'),
    drawerArticles: document.getElementById('drawerArticles'),
  };

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function formatAgo(isoDate) {
    if (!isoDate) return '--';
    const ts = new Date(isoDate).getTime();
    if (!Number.isFinite(ts)) return '--';
    const diffMs = Date.now() - ts;
    const minutes = Math.floor(diffMs / 60_000);
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }

  function sentimentClass(sentiment) {
    if (sentiment === 'BULLISH') return 'trend-up';
    if (sentiment === 'BEARISH') return 'trend-down';
    return 'trend-flat';
  }

  function trendArrow(direction) {
    if (direction === 'UP') return '↑';
    if (direction === 'DOWN') return '↓';
    return '→';
  }

  function urgencyClass(urgency) {
    if (!urgency) return 'low';
    return urgency.toLowerCase();
  }

  function heatColor(cluster) {
    if (cluster.sentiment === 'BULLISH') {
      return cluster.heatScore > 70 ? '#4be4a0' : '#6fd9b3';
    }
    if (cluster.sentiment === 'BEARISH') {
      return cluster.heatScore > 70 ? '#ff6b6b' : '#ff9a8f';
    }
    return cluster.heatScore > 70 ? '#6fcde9' : '#8eb5d0';
  }

  function setDataStatus(stateLabel, mode) {
    if (!els.dataStatus) return;
    const label = escapeHtml(stateLabel);
    const cls = mode || '';
    els.dataStatus.className = `chip ${cls}`.trim();
    els.dataStatus.innerHTML = `Data <strong>${label}</strong>`;
  }

  function setLlmStatus(info) {
    if (!els.llmStatus) return;
    const enabled = !!info?.enabled;
    const model = info?.model || 'not configured';
    const coverage = `${Math.round((info?.coverage || 0) * 100)}%`;
    els.llmStatus.className = `chip ${enabled ? 'ok' : 'warn'}`;
    els.llmStatus.innerHTML = `LLM <strong>${enabled ? 'ON' : 'OFF'}</strong> <span style="opacity:.8">${escapeHtml(model)} / ${coverage}</span>`;
  }

  function setUpdateStatus() {
    if (!els.updateStatus) return;
    const value = state.generatedAt ? formatAgo(state.generatedAt) : '--';
    els.updateStatus.className = 'chip';
    els.updateStatus.innerHTML = `Updated <strong>${escapeHtml(value)}</strong>`;
  }

  function updateStats() {
    if (els.statArticles) els.statArticles.textContent = String(state.totalArticles || 0);
    if (els.statClusters) els.statClusters.textContent = String(state.clusters.length || 0);
    if (els.statCoverage) els.statCoverage.textContent = `${Math.round((state.llm?.coverage || 0) * 100)}%`;
    if (els.statMaxHeat) {
      const maxHeat = state.clusters.length ? Math.max(...state.clusters.map(c => c.heatScore || 0)) : 0;
      els.statMaxHeat.textContent = maxHeat.toFixed(1);
    }
  }

  function applyFiltersAndSort() {
    const query = state.query.trim().toLowerCase();
    let clusters = [...state.clusters];

    if (query) {
      clusters = clusters.filter(cluster => {
        const topic = String(cluster.topic || '').toLowerCase();
        const keywords = Array.isArray(cluster.keywords) ? cluster.keywords.join(' ').toLowerCase() : '';
        const category = String(cluster.category || '').toLowerCase();
        return topic.includes(query) || keywords.includes(query) || category.includes(query);
      });
    }

    switch (state.sort) {
      case 'velocity':
        clusters.sort((a, b) => (b.velocity || 0) - (a.velocity || 0));
        break;
      case 'articles':
        clusters.sort((a, b) => (b.articleCount || 0) - (a.articleCount || 0));
        break;
      case 'freshness':
        clusters.sort((a, b) => (a.freshnessMinutes || 0) - (b.freshnessMinutes || 0));
        break;
      case 'heat':
      default:
        clusters.sort((a, b) => (b.heatScore || 0) - (a.heatScore || 0));
        break;
    }

    return clusters.slice(0, CARD_LIMIT);
  }

  function renderGrid() {
    if (!els.grid) return;
    const clusters = applyFiltersAndSort();
    els.grid.innerHTML = '';

    if (!clusters.length) {
      els.grid.innerHTML = '<div class="empty">No clusters match current filters.</div>';
      return;
    }

    const heats = clusters.map(cluster => Number(cluster.heatScore) || 0);
    const minHeat = Math.min(...heats);
    const maxHeat = Math.max(...heats);

    for (const cluster of clusters) {
      const card = document.createElement('article');
      card.className = 'card';
      card.style.borderLeftColor = heatColor(cluster);

      const normalizedHeat = maxHeat > minHeat
        ? (cluster.heatScore - minHeat) / (maxHeat - minHeat)
        : 0.5;
      const span = Math.min(3, Math.max(1, 1 + Math.round(normalizedHeat * 2)));
      card.style.gridColumnEnd = `span ${span}`;
      card.style.gridRowEnd = `span ${Math.min(2, span)}`;

      const directionClass = cluster.trendDirection === 'UP'
        ? 'trend-up'
        : cluster.trendDirection === 'DOWN'
          ? 'trend-down'
          : 'trend-flat';

      card.innerHTML = `
        <div class="card-head">
          <span class="category">${escapeHtml(cluster.category)}</span>
          <span class="badge ${urgencyClass(cluster.urgency)}">${escapeHtml(cluster.urgency)}</span>
        </div>
        <div class="topic">${escapeHtml(cluster.topic)}</div>
        <div class="card-meta">
          <span>Heat ${Number(cluster.heatScore || 0).toFixed(1)}</span>
          <span class="${directionClass}">${trendArrow(cluster.trendDirection)} ${Number(cluster.velocity || 0).toFixed(1)}</span>
        </div>
        <div class="card-meta">
          <span>${cluster.articleCount} articles</span>
          <span>${cluster.sourceCount} sources</span>
          <span class="${sentimentClass(cluster.sentiment)}">${escapeHtml(cluster.sentiment)}</span>
        </div>
      `;

      card.addEventListener('click', () => openCluster(cluster.id));
      els.grid.appendChild(card);
    }
  }

  async function openCluster(clusterId) {
    if (!clusterId || !els.detailDrawer) return;

    try {
      const res = await fetch(`${API_BASE}/clusters/${encodeURIComponent(clusterId)}?hours=${state.hours}`);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const cluster = await res.json();

      els.drawerTitle.textContent = cluster.topic || 'Cluster';
      els.drawerMeta.textContent = `${cluster.category} | Heat ${Number(cluster.heatScore || 0).toFixed(1)} | ${cluster.articleCount || 0} articles | ${cluster.sourceCount || 0} sources`;
      els.drawerSummary.innerHTML = `
        <div style="padding:10px;border:1px solid rgba(138,186,217,.2);border-radius:10px;background:rgba(8,13,19,.75);">
          ${escapeHtml(cluster.summary || 'No summary available.')}
        </div>
      `;

      const articles = Array.isArray(cluster.articles) ? cluster.articles : [];
      if (articles.length === 0) {
        els.drawerArticles.innerHTML = '<div class="article">No linked articles available for this cluster.</div>';
      } else {
        els.drawerArticles.innerHTML = articles.map(article => `
          <article class="article">
            <a href="${escapeHtml(article.url || '#')}" target="_blank" rel="noopener noreferrer">${escapeHtml(article.title || 'Untitled')}</a>
            <div class="article-meta">
              ${escapeHtml(article.source || 'Unknown')} | ${escapeHtml(article.importance || 'MEDIUM')} | ${escapeHtml(article.sentiment || 'NEUTRAL')} | ${escapeHtml(formatAgo(article.publishedAt))}
            </div>
            <div>${escapeHtml(article.summary || article.snippet || '')}</div>
          </article>
        `).join('');
      }

      els.detailDrawer.classList.add('open');
    } catch (error) {
      els.drawerTitle.textContent = 'Failed to load cluster';
      els.drawerMeta.textContent = String(error);
      els.drawerSummary.textContent = 'Unable to fetch cluster details.';
      els.drawerArticles.innerHTML = '';
      els.detailDrawer.classList.add('open');
    }
  }

  function closeDrawer() {
    if (!els.detailDrawer) return;
    els.detailDrawer.classList.remove('open');
  }

  function drawTimeline(points) {
    if (!els.timelineCanvas) return;
    const canvas = els.timelineCanvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    canvas.width = Math.floor(rect.width * dpr);
    canvas.height = Math.floor(rect.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const width = rect.width;
    const height = rect.height;
    ctx.clearRect(0, 0, width, height);

    if (!Array.isArray(points) || points.length === 0) {
      ctx.fillStyle = 'rgba(158,179,195,0.9)';
      ctx.font = '12px "IBM Plex Mono", monospace';
      ctx.fillText('No timeline samples yet', 16, Math.max(24, height / 2));
      return;
    }

    const maxHeat = Math.max(10, ...points.map(point => Number(point.avgHeat || 0)));
    const minHeat = Math.min(0, ...points.map(point => Number(point.avgHeat || 0)));

    const left = 40;
    const right = width - 14;
    const top = 14;
    const bottom = height - 22;
    const plotWidth = Math.max(1, right - left);
    const plotHeight = Math.max(1, bottom - top);

    // Grid.
    ctx.strokeStyle = 'rgba(138,186,217,0.12)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = top + (plotHeight * i) / 4;
      ctx.beginPath();
      ctx.moveTo(left, y);
      ctx.lineTo(right, y);
      ctx.stroke();
    }

    // Heat line.
    const pointsScaled = points.map((point, index) => {
      const heat = Number(point.avgHeat || 0);
      const x = left + (plotWidth * index) / Math.max(1, points.length - 1);
      const ratio = maxHeat === minHeat ? 0.5 : (heat - minHeat) / (maxHeat - minHeat);
      const y = bottom - ratio * plotHeight;
      return { x, y, heat };
    });

    ctx.beginPath();
    for (let i = 0; i < pointsScaled.length; i++) {
      const p = pointsScaled[i];
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    ctx.strokeStyle = '#6fcde9';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.beginPath();
    for (let i = 0; i < pointsScaled.length; i++) {
      const p = pointsScaled[i];
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    ctx.lineTo(pointsScaled[pointsScaled.length - 1].x, bottom);
    ctx.lineTo(pointsScaled[0].x, bottom);
    ctx.closePath();
    ctx.fillStyle = 'rgba(111,205,233,0.12)';
    ctx.fill();

    // Ticks.
    ctx.fillStyle = 'rgba(158,179,195,0.95)';
    ctx.font = '11px "IBM Plex Mono", monospace';
    ctx.textAlign = 'right';
    ctx.fillText(maxHeat.toFixed(0), left - 6, top + 3);
    ctx.fillText(((maxHeat + minHeat) / 2).toFixed(0), left - 6, top + plotHeight / 2 + 3);
    ctx.fillText(minHeat.toFixed(0), left - 6, bottom + 3);

    ctx.textAlign = 'left';
    ctx.fillText(formatAgo(points[0].bucketStart), left, height - 6);
    ctx.textAlign = 'right';
    ctx.fillText(formatAgo(points[points.length - 1].bucketStart), right, height - 6);
  }

  async function fetchTimeline() {
    try {
      const bucketHours = state.hours >= 48 ? 4 : state.hours >= 24 ? 2 : 1;
      const params = new URLSearchParams({
        hours: String(state.hours),
        bucketHours: String(bucketHours),
        category: state.category,
      });
      const res = await fetch(`${API_BASE}/heatmap/timeline?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      state.timeline = Array.isArray(data.points) ? data.points : [];
      if (els.timelineRange) {
        els.timelineRange.textContent = `Last ${state.hours}h`;
      }
      drawTimeline(state.timeline);
    } catch (error) {
      state.timeline = [];
      drawTimeline([]);
    }
  }

  async function fetchHeatmap(force = false) {
    if (state.loading) return;
    state.loading = true;
    setDataStatus('Syncing', 'warn');

    try {
      const params = new URLSearchParams({
        hours: String(state.hours),
        limit: String(CARD_LIMIT),
        category: state.category,
      });
      if (force) params.set('force', 'true');

      const res = await fetch(`${API_BASE}/heatmap?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      state.generatedAt = data.generatedAt || new Date().toISOString();
      state.totalArticles = Number(data.totalArticles || 0);
      state.totalClusters = Number(data.totalClusters || 0);
      state.clusters = Array.isArray(data.clusters) ? data.clusters : [];
      state.llm = data.llm || state.llm;

      setLlmStatus(state.llm);
      setUpdateStatus();
      setDataStatus('Live', 'ok');
      updateStats();
      renderGrid();
      await fetchTimeline();
    } catch (error) {
      setDataStatus('Error', 'bad');
      if (els.grid) {
        els.grid.innerHTML = `<div class="empty">Heatmap load failed: ${escapeHtml(String(error))}</div>`;
      }
    } finally {
      state.loading = false;
    }
  }

  async function rebuildHeatmap() {
    if (state.loading) return;
    setDataStatus('Rebuilding', 'warn');

    try {
      const params = new URLSearchParams({
        hours: String(state.hours),
        limit: String(CARD_LIMIT),
        category: state.category,
      });
      const res = await fetch(`${API_BASE}/heatmap/rebuild?${params}`, { method: 'POST' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await fetchHeatmap(true);
    } catch (error) {
      setDataStatus('Rebuild Failed', 'bad');
    }
  }

  function bindControls() {
    document.querySelectorAll('[data-hours]').forEach(btn => {
      btn.addEventListener('click', () => {
        const nextHours = Number(btn.getAttribute('data-hours'));
        if (!Number.isFinite(nextHours)) return;
        state.hours = nextHours;
        document.querySelectorAll('[data-hours]').forEach(node => node.classList.remove('active'));
        btn.classList.add('active');
        fetchHeatmap(false);
      });
    });

    if (els.categoryFilter) {
      els.categoryFilter.addEventListener('change', () => {
        state.category = String(els.categoryFilter.value || 'ALL').toUpperCase();
        fetchHeatmap(false);
      });
    }

    if (els.sortFilter) {
      els.sortFilter.addEventListener('change', () => {
        state.sort = String(els.sortFilter.value || 'heat');
        renderGrid();
      });
    }

    if (els.searchInput) {
      els.searchInput.addEventListener('input', () => {
        state.query = String(els.searchInput.value || '');
        renderGrid();
      });
    }

    if (els.refreshBtn) {
      els.refreshBtn.addEventListener('click', () => fetchHeatmap(false));
    }

    if (els.rebuildBtn) {
      els.rebuildBtn.addEventListener('click', rebuildHeatmap);
    }

    if (els.closeDrawerBtn) {
      els.closeDrawerBtn.addEventListener('click', closeDrawer);
    }

    if (els.detailDrawer) {
      els.detailDrawer.addEventListener('click', event => {
        if (event.target === els.detailDrawer) closeDrawer();
      });
    }

    window.addEventListener('resize', () => drawTimeline(state.timeline));
  }

  function setupSocketRefresh() {
    try {
      const socket = io();
      socket.on('connect', () => setDataStatus('Live', 'ok'));
      socket.on('disconnect', () => setDataStatus('Socket Lost', 'warn'));
      socket.on('news_clustered', () => fetchHeatmap(false));
    } catch (error) {
      // Socket is optional for the page to function.
    }
  }

  function init() {
    bindControls();
    setupSocketRefresh();
    fetchHeatmap(false);
    setInterval(() => fetchHeatmap(false), AUTO_REFRESH_MS);
  }

  init();
})();
