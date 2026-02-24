/**
 * Research Dashboard - Real-time Strategy Evolution & Backtesting Monitor
 */

(function() {
  'use strict';

  // State
  const state = {
    socket: null,
    ideas: [],
    backtests: [],
    leaderboard: [],
    evolution: [],
    currentGeneration: 0,
    marketRegime: 'UNKNOWN',
    sortColumn: 'sharpe',
    sortDirection: 'desc',
    evolutionChart: null,
    isConnected: false
  };

  // DOM Elements
  const elements = {};

  // Utility Functions
  function $(id) { return document.getElementById(id); }
  
  function formatMoney(value, signed = false) {
    const n = Number(value || 0);
    const abs = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (!signed) return `${n < 0 ? '-' : ''}$${abs}`;
    if (n > 0) return `+$${abs}`;
    if (n < 0) return `-$${abs}`;
    return `$${abs}`;
  }

  function formatPercent(value, signed = false) {
    const n = Number(value || 0);
    const abs = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    if (!signed) return `${n < 0 ? '-' : ''}${abs}%`;
    if (n > 0) return `+${abs}%`;
    if (n < 0) return `-${abs}%`;
    return `${abs}%`;
  }

  function classForNumeric(value) {
    const n = Number(value || 0);
    if (n > 0) return 'good';
    if (n < 0) return 'bad';
    return 'warn';
  }

  function updateClock() {
    const el = $('chip-time');
    if (el) el.textContent = new Date().toLocaleTimeString('en-GB');
  }

  // Initialize DOM References
  function initElements() {
    elements.ideasList = $('ideas-list');
    elements.ideasCount = $('ideas-count');
    elements.backtestQueue = $('backtest-queue');
    elements.backtestCount = $('backtest-count');
    elements.leaderboardBody = $('leaderboard-body');
    elements.leaderboardTable = $('leaderboard-table');
    elements.evolutionChart = $('evolution-chart');
    elements.evolutionTimeline = $('evolution-timeline');
    elements.regimeValue = $('regime-value');
    elements.regimeFactors = $('regime-factors');
    elements.chipConn = $('chip-conn');
  }

  // WebSocket Setup
  function initSocket() {
    state.socket = io();

    state.socket.on('connect', () => {
      state.isConnected = true;
      if (elements.chipConn) {
        elements.chipConn.textContent = 'ONLINE';
        elements.chipConn.parentElement.classList.remove('offline');
        elements.chipConn.parentElement.classList.add('online');
      }
      console.log('[Research] Socket connected');
      
      // Subscribe to research channels
      state.socket.emit('subscribe', 'research');
    });

    state.socket.on('disconnect', () => {
      state.isConnected = false;
      if (elements.chipConn) {
        elements.chipConn.textContent = 'OFFLINE';
        elements.chipConn.parentElement.classList.remove('online');
        elements.chipConn.parentElement.classList.add('offline');
      }
      console.log('[Research] Socket disconnected');
    });

    // Research-specific events
    state.socket.on('research:idea', handleNewIdea);
    state.socket.on('research:backtest:start', handleBacktestStart);
    state.socket.on('research:backtest:progress', handleBacktestProgress);
    state.socket.on('research:backtest:complete', handleBacktestComplete);
    state.socket.on('research:generation', handleNewGeneration);
    state.socket.on('research:regime', handleRegimeChange);
    state.socket.on('research:leaderboard:update', handleLeaderboardUpdate);
    
    // Legacy cycle events that provide research data
    state.socket.on('cycle_update', handleCycleUpdate);
    state.socket.on('cycle_complete', handleCycleComplete);
  }

  // Event Handlers
  function handleNewIdea(data) {
    const idea = {
      id: data.id || `idea_${Date.now()}`,
      name: data.name || 'Unnamed Strategy',
      description: data.description || '',
      timestamp: data.timestamp || new Date().toISOString(),
      confidence: data.confidence || 0,
      expectedReturn: data.expectedReturn || 0,
      regime: data.regime || state.marketRegime,
      tags: data.tags || [],
      isNew: true
    };

    state.ideas.unshift(idea);
    if (state.ideas.length > 50) state.ideas.pop();
    
    renderIdeas();
  }

  function handleBacktestStart(data) {
    const job = {
      id: data.id || `bt_${Date.now()}`,
      strategyName: data.strategyName || 'Unknown',
      status: 'running',
      progress: 0,
      startTime: data.startTime || new Date().toISOString()
    };

    state.backtests.push(job);
    renderBacktestQueue();
  }

  function handleBacktestProgress(data) {
    const job = state.backtests.find(b => b.id === data.id);
    if (job) {
      job.progress = data.progress || 0;
      renderBacktestQueue();
    }
  }

  function handleBacktestComplete(data) {
    const job = state.backtests.find(b => b.id === data.id);
    if (job) {
      job.status = data.success ? 'completed' : 'failed';
      job.progress = 100;
      job.result = data.result;
      
      // Remove completed jobs after a delay
      setTimeout(() => {
        state.backtests = state.backtests.filter(b => b.id !== data.id);
        renderBacktestQueue();
      }, 5000);
      
      renderBacktestQueue();
    }
  }

  function handleNewGeneration(data) {
    const gen = {
      number: data.generation || state.currentGeneration + 1,
      fitness: data.fitness || 0,
      bestStrategy: data.bestStrategy || null,
      populationSize: data.populationSize || 0,
      timestamp: data.timestamp || new Date().toISOString()
    };

    state.currentGeneration = gen.number;
    state.evolution.push(gen);
    if (state.evolution.length > 50) state.evolution.shift();
    
    $('chip-gen').textContent = gen.number;
    
    renderEvolutionTimeline();
    updateEvolutionChart();
  }

  function handleRegimeChange(data) {
    state.marketRegime = data.regime || 'UNKNOWN';
    renderRegimeIndicator(data);
  }

  function handleLeaderboardUpdate(data) {
    if (data.strategies) {
      state.leaderboard = data.strategies;
      renderLeaderboard();
    }
  }

  function handleCycleUpdate(data) {
    if (data.step === 'STRATEGY_IDEATION' && data.ideas) {
      data.ideas.forEach(idea => handleNewIdea(idea));
    }
    if (data.step === 'BACKTEST' && data.backtest) {
      handleBacktestStart(data.backtest);
    }
  }

  function handleCycleComplete(data) {
    if (data.traceSummary?.backtestResults) {
      // Update leaderboard with new results
      fetchLeaderboard();
    }
  }

  // Render Functions
  function renderIdeas() {
    if (!elements.ideasList) return;
    
    elements.ideasCount.textContent = `${state.ideas.length} Ideas`;

    if (state.ideas.length === 0) {
      elements.ideasList.innerHTML = '<li class="empty">Waiting for strategy ideas...</li>';
      return;
    }

    elements.ideasList.innerHTML = state.ideas.slice(0, 20).map(idea => `
      <li class="${idea.isNew ? 'new-idea' : ''}">
        <div class="top">
          <strong>${escapeHtml(idea.name)}</strong>
          <span class="tag ${idea.isNew ? 'new' : ''}">${idea.regime}</span>
        </div>
        <div class="sub">${escapeHtml(idea.description.substring(0, 120))}${idea.description.length > 120 ? '...' : ''}</div>
        <div class="sub">
          Conf: ${(idea.confidence * 100).toFixed(1)}% | 
          Exp: ${formatPercent(idea.expectedReturn, true)} | 
          ${formatTime(idea.timestamp)}
        </div>
      </li>
    `).join('');

    // Mark ideas as no longer new
    state.ideas.forEach(i => i.isNew = false);
  }

  function renderBacktestQueue() {
    if (!elements.backtestQueue) return;
    
    elements.backtestCount.textContent = `${state.backtests.length} Jobs`;

    if (state.backtests.length === 0) {
      elements.backtestQueue.innerHTML = '<div class="empty">No active backtests</div>';
      return;
    }

    elements.backtestQueue.innerHTML = state.backtests.map(job => `
      <div class="progress-item">
        <div class="progress-header">
          <span>${escapeHtml(job.strategyName)}</span>
          <span class="${job.status === 'failed' ? 'bad' : job.status === 'completed' ? 'good' : 'accent'}">
            ${job.status === 'running' ? `${job.progress.toFixed(0)}%` : job.status.toUpperCase()}
          </span>
        </div>
        <div class="progress-bar-bg">
          <div class="progress-bar-fill" style="width: ${job.progress}%; background: ${job.status === 'failed' ? 'var(--bad)' : job.status === 'completed' ? 'var(--good)' : ''}"></div>
        </div>
      </div>
    `).join('');
  }

  function renderLeaderboard() {
    if (!elements.leaderboardBody) return;

    const sorted = sortLeaderboard(state.leaderboard);

    if (sorted.length === 0) {
      elements.leaderboardBody.innerHTML = '<tr><td colspan="5" class="empty">No strategies ranked yet</td></tr>';
      return;
    }

    elements.leaderboardBody.innerHTML = sorted.slice(0, 15).map((strat, idx) => `
      <tr>
        <td>${idx + 1}</td>
        <td>${escapeHtml(strat.name || 'Unnamed')}</td>
        <td class="${classForNumeric(strat.sharpe)}">${Number(strat.sharpe || 0).toFixed(2)}</td>
        <td class="${classForNumeric(strat.winRate - 50)}">${formatPercent(strat.winRate)}</td>
        <td class="${classForNumeric(strat.pnl)}">${formatMoney(strat.pnl, true)}</td>
      </tr>
    `).join('');
  }

  function sortLeaderboard(strategies) {
    return [...strategies].sort((a, b) => {
      let valA = a[state.sortColumn];
      let valB = b[state.sortColumn];
      
      if (typeof valA === 'string') {
        valA = valA.toLowerCase();
        valB = valB.toLowerCase();
      } else {
        valA = Number(valA) || 0;
        valB = Number(valB) || 0;
      }

      if (valA < valB) return state.sortDirection === 'asc' ? -1 : 1;
      if (valA > valB) return state.sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }

  function renderEvolutionTimeline() {
    if (!elements.evolutionTimeline) return;

    if (state.evolution.length === 0) {
      elements.evolutionTimeline.innerHTML = '<div class="empty">No evolution data</div>';
      return;
    }

    const html = state.evolution.map((gen, idx) => `
      <div class="gen-node ${idx === state.evolution.length - 1 ? 'active' : ''}" data-gen="${gen.number}">
        <div class="gen-number">Gen ${gen.number}</div>
        <div class="gen-fitness">${Number(gen.fitness).toFixed(3)}</div>
        <div class="gen-count">${gen.populationSize} strat</div>
      </div>
      ${idx < state.evolution.length - 1 ? '<div class="gen-arrow">→</div>' : ''}
    `).join('');

    elements.evolutionTimeline.innerHTML = html;
    
    // Scroll to end
    elements.evolutionTimeline.scrollLeft = elements.evolutionTimeline.scrollWidth;
  }

  function renderRegimeIndicator(data) {
    if (!elements.regimeValue || !elements.regimeFactors) return;

    const regime = state.marketRegime;
    const regimeClass = {
      'TRENDING_UP': 'regime-trending',
      'TRENDING_DOWN': 'regime-trending',
      'RANGING': 'regime-ranging',
      'VOLATILE': 'regime-volatile'
    }[regime] || 'regime-unknown';

    elements.regimeValue.className = `regime-value ${regimeClass}`;
    elements.regimeValue.textContent = regime.replace(/_/g, ' ');

    const factors = data.factors || [];
    if (factors.length === 0) {
      elements.regimeFactors.innerHTML = '<span class="regime-factor">Analyzing market data...</span>';
    } else {
      elements.regimeFactors.innerHTML = factors.map(f => 
        `<span class="regime-factor">${escapeHtml(f)}</span>`
      ).join('');
    }
  }

  // Chart.js Evolution Chart
  function initEvolutionChart() {
    if (!elements.evolutionChart) return;

    const ctx = elements.evolutionChart.getContext('2d');
    
    state.evolutionChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: [],
        datasets: [
          {
            label: 'Best Fitness',
            data: [],
            borderColor: '#6df7b2',
            backgroundColor: 'rgba(109, 247, 178, 0.1)',
            fill: true,
            tension: 0.4
          },
          {
            label: 'Avg Fitness',
            data: [],
            borderColor: '#5cc9d7',
            backgroundColor: 'rgba(92, 201, 215, 0.1)',
            fill: true,
            tension: 0.4
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          intersect: false,
          mode: 'index'
        },
        plugins: {
          legend: {
            labels: {
              color: '#8fa0ac',
              font: { family: 'IBM Plex Mono', size: 11 }
            }
          }
        },
        scales: {
          x: {
            grid: { color: 'rgba(140, 171, 186, 0.1)' },
            ticks: { 
              color: '#8fa0ac',
              font: { family: 'IBM Plex Mono', size: 10 }
            }
          },
          y: {
            grid: { color: 'rgba(140, 171, 186, 0.1)' },
            ticks: { 
              color: '#8fa0ac',
              font: { family: 'IBM Plex Mono', size: 10 }
            }
          }
        }
      }
    });
  }

  function updateEvolutionChart() {
    if (!state.evolutionChart) return;

    const labels = state.evolution.map(g => `G${g.number}`);
    const bestData = state.evolution.map(g => g.fitness);
    const avgData = state.evolution.map(g => g.avgFitness || g.fitness * 0.9);

    state.evolutionChart.data.labels = labels;
    state.evolutionChart.data.datasets[0].data = bestData;
    state.evolutionChart.data.datasets[1].data = avgData;
    state.evolutionChart.update('none');
  }

  // API Fetch Functions
  async function fetchInitialData() {
    try {
      const [ideasRes, backtestsRes, leaderboardRes, evolutionRes] = await Promise.allSettled([
        fetch('/api/research/ideas'),
        fetch('/api/research/backtests'),
        fetch('/api/research/leaderboard'),
        fetch('/api/research/evolution')
      ]);

      if (ideasRes.status === 'fulfilled' && ideasRes.value.ok) {
        const ideas = await ideasRes.value.json();
        state.ideas = ideas.map(i => ({ ...i, isNew: false }));
        renderIdeas();
      }

      if (backtestsRes.status === 'fulfilled' && backtestsRes.value.ok) {
        const backtests = await backtestsRes.value.json();
        state.backtests = backtests;
        renderBacktestQueue();
      }

      if (leaderboardRes.status === 'fulfilled' && leaderboardRes.value.ok) {
        const leaderboard = await leaderboardRes.value.json();
        state.leaderboard = leaderboard;
        renderLeaderboard();
      }

      if (evolutionRes.status === 'fulfilled' && evolutionRes.value.ok) {
        const evolution = await evolutionRes.value.json();
        state.evolution = evolution;
        if (evolution.length > 0) {
          state.currentGeneration = evolution[evolution.length - 1].number;
          $('chip-gen').textContent = state.currentGeneration;
        }
        renderEvolutionTimeline();
        updateEvolutionChart();
      }
    } catch (error) {
      console.error('[Research] Error fetching initial data:', error);
    }
  }

  async function fetchLeaderboard() {
    try {
      const res = await fetch('/api/research/leaderboard');
      if (res.ok) {
        state.leaderboard = await res.json();
        renderLeaderboard();
      }
    } catch (error) {
      console.error('[Research] Error fetching leaderboard:', error);
    }
  }

  // Utility
  function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function formatTime(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;
    
    if (diff < 60000) return 'just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return date.toLocaleDateString();
  }

  // Sort Handler
  function initSortHandlers() {
    if (!elements.leaderboardTable) return;
    
    const headers = elements.leaderboardTable.querySelectorAll('th.sortable');
    headers.forEach(th => {
      th.addEventListener('click', () => {
        const column = th.dataset.sort;
        
        // Update sort direction
        if (state.sortColumn === column) {
          state.sortDirection = state.sortDirection === 'asc' ? 'desc' : 'asc';
        } else {
          state.sortColumn = column;
          state.sortDirection = 'desc';
        }

        // Update UI
        headers.forEach(h => h.classList.remove('sorted-asc', 'sorted-desc'));
        th.classList.add(`sorted-${state.sortDirection}`);

        renderLeaderboard();
      });
    });
  }

  // Initialize
  function init() {
    initElements();
    initSocket();
    initEvolutionChart();
    initSortHandlers();
    
    // Start clock
    updateClock();
    setInterval(updateClock, 1000);

    // Fetch initial data
    fetchInitialData();

    // Refresh data periodically
    setInterval(fetchLeaderboard, 30000);

    console.log('[Research] Dashboard initialized');
  }

  // Start when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();