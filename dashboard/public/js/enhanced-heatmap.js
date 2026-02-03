// Enhanced Heatmap UI Script

const API_BASE = '/api';
let currentHours = 24;
let currentSort = 'heat';
let currentTimelineRange = '24h';
let activeEntityFilter = null;
let heatTimelineChart = null;
let activeAlerts = new Map();

// Clock
function updateClock() {
    document.getElementById('clock').textContent = new Date().toISOString().slice(11, 19) + ' UTC';
}
setInterval(updateClock, 1000);
updateClock();

// Time controls
function setHours(h, btn) {
    currentHours = h;
    document.querySelectorAll('.filter-btn[data-sort]').forEach(b => {
        // Don't touch sort buttons
        if (!b.dataset.sort) b.classList.remove('active');
    });
    if (btn) btn.classList.add('active');
    fetchHeatmap();
}

function setSort(sort, btn) {
    currentSort = sort;
    document.querySelectorAll('.filter-btn[data-sort]').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    fetchHeatmap();
}

// Timeline controls
function setTimelineRange(range, btn) {
    currentTimelineRange = range;
    document.querySelectorAll('.timeline-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    updateHeatTimeline();
}

// Entity filter
function setEntityFilter(entity) {
    activeEntityFilter = entity;
    const filterGroup = document.getElementById('entityFilterGroup');
    const filterTag = document.getElementById('entityFilterTag');
    filterGroup.style.display = 'flex';
    filterTag.textContent = entity;
    filterTag.className = `entity-filter-tag entity-${getEntityType(entity)}`;
    fetchHeatmap();
}

function clearEntityFilter() {
    activeEntityFilter = null;
    document.getElementById('entityFilterGroup').style.display = 'none';
    fetchHeatmap();
}

function getEntityType(entityName) {
    // Simple heuristic to determine entity type
    const upper = entityName.toUpperCase();
    if (['BTC', 'ETH', 'SOL', 'USDC', 'USDT', 'DOGE', 'XRP', 'ADA', 'AVAX', 'DOT', 'LINK'].includes(upper)) {
        return 'token';
    } else if (upper === upper && entityName.length <= 4) {
        return 'token';
    }
    return 'person';
}

// Category styling
function getCategoryClass(cat) {
    return 'cat-' + (cat || 'general').toLowerCase();
}

// Anomaly Alerts
function renderAlerts(clusters) {
    const container = document.getElementById('alertsContainer');
    container.innerHTML = '';

    const highUrgencyClusters = clusters.filter(c => c.urgency === 'CRITICAL' || c.urgency === 'HIGH');

    highUrgencyClusters.forEach(cluster => {
        const alertId = `alert-${cluster.id}`;
        const existingAlert = activeAlerts.get(alertId);

        // Check if alert was dismissed
        if (existingAlert && existingAlert.dismissed) {
            // Check if 5 minutes have passed since dismissal
            const elapsed = Date.now() - existingAlert.dismissedAt;
            if (elapsed < 5 * 60 * 1000) {
                return; // Still in dismissal window
            } else {
                activeAlerts.delete(alertId);
            }
        }

        const isCritical = cluster.urgency === 'CRITICAL';
        const alert = document.createElement('div');
        alert.className = `anomaly-alert ${isCritical ? 'alert-critical' : 'alert-high'}`;
        alert.id = alertId;

        alert.innerHTML = `
            <div class="alert-header" onclick="toggleAlertDetails('${alertId}')">
                <div class="alert-title">
                    <span class="alert-icon">${isCritical ? '🔴' : '🟡'}</span>
                    <span class="alert-severity">${cluster.urgency}</span>
                    <span class="alert-message">${cluster.topic}</span>
                </div>
                <div class="alert-actions">
                    <button class="alert-dismiss" onclick="event.stopPropagation(); dismissAlert('${alertId}')">✕</button>
                </div>
            </div>
            <div class="alert-details" id="${alertId}-details">
                <div class="alert-detail-row">
                    <span class="detail-label">Heat Score:</span>
                    <span class="detail-value">${cluster.heatScore.toFixed(1)}</span>
                </div>
                <div class="alert-detail-row">
                    <span class="detail-label">Articles:</span>
                    <span class="detail-value">${cluster.articleCount}</span>
                </div>
                <div class="alert-detail-row">
                    <span class="detail-label">Prediction:</span>
                    <span class="detail-value">${getPredictionBadge(cluster)}</span>
                </div>
                <button class="alert-view-cluster" onclick="openCluster('${cluster.id}')">View Cluster →</button>
            </div>
        `;

        container.appendChild(alert);

        // Auto-dismiss timer (5 minutes)
        if (!activeAlerts.has(alertId)) {
            activeAlerts.set(alertId, { created: Date.now() });
            setTimeout(() => {
                dismissAlert(alertId);
            }, 5 * 60 * 1000);
        }
    });

    // Hide alerts section if no alerts
    const alertsSection = document.getElementById('alertsSection');
    if (container.children.length === 0) {
        alertsSection.style.display = 'none';
    } else {
        alertsSection.style.display = 'block';
    }
}

function toggleAlertDetails(alertId) {
    const details = document.getElementById(`${alertId}-details`);
    details.classList.toggle('expanded');
}

function dismissAlert(alertId) {
    const alert = document.getElementById(alertId);
    if (alert) {
        alert.style.animation = 'slideOut 0.3s ease-out';
        setTimeout(() => {
            alert.remove();
            // Check if alerts section should be hidden
            const container = document.getElementById('alertsContainer');
            const alertsSection = document.getElementById('alertsSection');
            if (container.children.length === 0) {
                alertsSection.style.display = 'none';
            }
        }, 300);
    }
    activeAlerts.set(alertId, { dismissed: true, dismissedAt: Date.now() });
}

function dismissAllAlerts() {
    const alerts = document.querySelectorAll('.anomaly-alert');
    alerts.forEach(alert => {
        const alertId = alert.id;
        alert.style.animation = 'slideOut 0.3s ease-out';
        setTimeout(() => alert.remove(), 300);
        activeAlerts.set(alertId, { dismissed: true, dismissedAt: Date.now() });
    });
    setTimeout(() => {
        document.getElementById('alertsSection').style.display = 'none';
    }, 300);
}

// Prediction Badges
function getPredictionBadge(cluster) {
    const heat = cluster.heatScore || 0;
    const velocity = cluster.velocity || 0;
    const trend = cluster.trendDirection || 'NEUTRAL';
    const confidence = cluster.predictionConfidence || 75;

    let prediction, emoji, color;

    if (heat > 80 && (trend === 'UP' || velocity > 50)) {
        prediction = 'SPIKING';
        emoji = '🚀';
        color = '#00ff9d';
    } else if (trend === 'UP' || velocity > 20) {
        prediction = 'GROWING';
        emoji = '📈';
        color = '#00f2ff';
    } else if (trend === 'DOWN' && velocity < -50) {
        prediction = 'CRASHING';
        emoji = '💥';
        color = '#ff3e3e';
    } else if (trend === 'DOWN' || velocity < -20) {
        prediction = 'DECAYING';
        emoji = '📉';
        color = '#ffb300';
    } else {
        prediction = 'STABLE';
        emoji = '➡️';
        color = '#666';
    }

    return `<span class="prediction-badge" style="background: ${color}20; color: ${color}; border-color: ${color};">
        ${emoji} ${prediction} <span class="confidence">${confidence}%</span>
    </span>`;
}

// Entity Tags
function getEntityTags(cluster) {
    // Extract entities from topic or generate mock entities
    const entities = cluster.entities || generateMockEntities(cluster.topic, 3);

    return entities.slice(0, 3).map(entity => {
        const type = getEntityType(entity);
        const colors = {
            token: '#ff9800',
            person: '#2196f3',
            org: '#9c27b0'
        };
        const color = colors[type] || colors.person;

        return `<span class="entity-tag entity-${type}" onclick="event.stopPropagation(); setEntityFilter('${entity}')" style="background: ${color}20; color: ${color}; border-color: ${color};">
            ${entity}
        </span>`;
    }).join('');
}

function generateMockEntities(topic, count = 3) {
    const tokens = ['BTC', 'ETH', 'SOL', 'USDC', 'USDT', 'DOGE', 'XRP', 'ADA'];
    const people = ['Powell', 'Yellen', 'Lagarde', 'Musk', 'Bezos', 'Dimon'];
    const orgs = ['Fed', 'SEC', 'CFTC', 'Binance', 'Coinbase'];

    const all = [...tokens, ...people, ...orgs];
    const selected = [];

    // Generate pseudo-random but consistent entities based on topic
    const hash = topic.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);

    for (let i = 0; i < count && i < all.length; i++) {
        const idx = (hash + i * 7) % all.length;
        if (!selected.includes(all[idx])) {
            selected.push(all[idx]);
        }
    }

    return selected.length > 0 ? selected : ['BTC', 'Fed'];
}

// Composite Rank
function calculateCompositeRank(cluster) {
    const heat = normalizeScore(cluster.heatScore || 0, 0, 100);
    const count = normalizeScore(cluster.articleCount || 0, 0, 50);
    const velocity = normalizeScore(cluster.velocity || 0, -100, 100);
    const entityScore = normalizeScore(cluster.entityScore || 0.5, 0, 1);
    const authority = normalizeScore(cluster.authorityScore || 0.5, 0, 1);

    // Weighted mix: 30% heat + 25% count + 15% velocity + 15% entity + 15% authority
    return (heat * 0.30 + count * 0.25 + Math.abs(velocity) * 0.15 + entityScore * 0.15 + authority * 0.15) * 100;
}

function normalizeScore(value, min, max) {
    if (max <= min) return 0.5;
    return Math.max(0, Math.min(1, (value - min) / (max - min)));
}

// Cross-Category
function hasCrossCategory(cluster, allClusters) {
    // Check if any other cluster has similar topic but different category
    return allClusters.some(c => {
        if (c.id === cluster.id) return false;
        if (c.category === cluster.category) return false;

        // Simple similarity check based on shared words
        const topic1Words = new Set(cluster.topic.toLowerCase().split(/\s+/));
        const topic2Words = new Set(c.topic.toLowerCase().split(/\s+/));
        const intersection = [...topic1Words].filter(x => topic2Words.has(x));

        return intersection.length >= 2;
    });
}

function getCrossCategoryClusters(cluster, allClusters) {
    return allClusters.filter(c => {
        if (c.id === cluster.id) return false;
        if (c.category === cluster.category) return false;

        const topic1Words = new Set(cluster.topic.toLowerCase().split(/\s+/));
        const topic2Words = new Set(c.topic.toLowerCase().split(/\s+/));
        const intersection = [...topic1Words].filter(x => topic2Words.has(x));

        return intersection.length >= 2;
    });
}

function openCrossCategoryModal(clusterId, clusters) {
    const cluster = clusters.find(c => c.id === clusterId);
    if (!cluster) return;

    const relatedClusters = getCrossCategoryClusters(cluster, clusters);
    const modal = document.getElementById('crossCategoryModal');
    const list = document.getElementById('crossCategoryList');
    const title = document.getElementById('crossCategoryTitle');

    title.textContent = `"${cluster.topic}" - Related Clusters Across Categories`;

    if (relatedClusters.length === 0) {
        list.innerHTML = '<div class="cross-category-empty">No related clusters found across categories</div>';
    } else {
        list.innerHTML = relatedClusters.map(c => `
            <div class="cross-category-item">
                <div class="cross-category-header">
                    <span class="cross-category-cat">${c.category}</span>
                    <span class="cross-category-heat">Heat: ${c.heatScore.toFixed(0)}</span>
                </div>
                <div class="cross-category-topic">${c.topic}</div>
                <button class="cross-category-view" onclick="closeCrossCategoryModal(); openCluster('${c.id}')">View Cluster →</button>
            </div>
        `).join('');
    }

    modal.classList.add('active');
}

function closeCrossCategoryModal(e) {
    if (e && e.target !== document.getElementById('crossCategoryModal')) return;
    document.getElementById('crossCategoryModal').classList.remove('active');
}

// Heat Timeline Chart
function updateHeatTimeline() {
    const canvas = document.getElementById('heatTimelineChart');
    const ctx = canvas.getContext('2d');

    // Generate mock timeline data
    const labels = generateTimelineLabels(currentTimelineRange);
    const datasets = generateTimelineDatasets(currentTimelineRange);

    if (heatTimelineChart) {
        heatTimelineChart.destroy();
    }

    heatTimelineChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: datasets
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
                    display: true,
                    labels: {
                        color: '#888',
                        font: {
                            family: 'JetBrains Mono',
                            size: 10
                        },
                        usePointStyle: true,
                        pointStyle: 'circle'
                    }
                },
                tooltip: {
                    backgroundColor: 'rgba(10, 10, 15, 0.95)',
                    titleColor: '#fff',
                    bodyColor: '#ccc',
                    borderColor: '#00f2ff',
                    borderWidth: 1,
                    titleFont: {
                        family: 'JetBrains Mono',
                        size: 11
                    },
                    bodyFont: {
                        family: 'Inter',
                        size: 12
                    },
                    padding: 12,
                    displayColors: true,
                    callbacks: {
                        label: function(context) {
                            return `${context.dataset.label}: Heat ${context.parsed.y.toFixed(1)}`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: {
                        color: 'rgba(255, 255, 255, 0.05)'
                    },
                    ticks: {
                        color: '#666',
                        font: {
                            family: 'JetBrains Mono',
                            size: 9
                        },
                        maxRotation: 45,
                        minRotation: 45
                    }
                },
                y: {
                    grid: {
                        color: 'rgba(255, 255, 255, 0.05)'
                    },
                    ticks: {
                        color: '#666',
                        font: {
                            family: 'JetBrains Mono',
                            size: 9
                        }
                    },
                    beginAtZero: true
                }
            }
        }
    });
}

function generateTimelineLabels(range) {
    const labels = [];
    let count, unit, step;

    switch (range) {
        case '1h':
            count = 12;
            unit = 'min';
            step = 5;
            break;
        case '6h':
            count = 12;
            unit = 'min';
            step = 30;
            break;
        case '24h':
            count = 12;
            unit = 'hour';
            step = 2;
            break;
        case '7d':
            count = 7;
            unit = 'day';
            step = 1;
            break;
    }

    for (let i = 0; i < count; i++) {
        labels.push(`${i * step}${unit === 'hour' ? 'h' : unit === 'day' ? 'd' : 'm'} ago`);
    }
    labels.push('Now');
    return labels;
}

function generateTimelineDatasets(range) {
    // Mock clusters for timeline
    const clusterNames = ['Fed Policy', 'BTC Surge', 'Earnings', 'SEC Action', 'DeFi Rally'];
    const colors = ['#ff9800', '#00ff9d', '#00f2ff', '#ff3e3e', '#9c27b0'];

    return clusterNames.map((name, idx) => {
        const data = [];
        let baseHeat = 50 + (idx * 10);
        let volatility = 10 + (idx * 5);

        for (let i = 0; i < generateTimelineLabels(range).length; i++) {
            const noise = (Math.random() - 0.5) * volatility * 2;
            const trend = Math.sin(i / 3) * volatility;
            data.push(Math.max(0, Math.min(100, baseHeat + trend + noise)));
        }

        return {
            label: name,
            data: data,
            borderColor: colors[idx],
            backgroundColor: colors[idx] + '20',
            tension: 0.4,
            fill: false,
            pointRadius: 2,
            pointHoverRadius: 5,
            borderWidth: 2
        };
    });
}

// Heatmap Fetching and Rendering
async function fetchHeatmap() {
    try {
        const res = await fetch(`${API_BASE}/news/clusters?hours=${currentHours}&limit=50`);
        const clusters = await res.json();
        renderHeatmap(clusters);
        renderAlerts(clusters);
        updateHeatTimeline();
    } catch (e) {
        console.error('Heatmap fetch failed:', e);
    }
}

function renderHeatmap(clusters) {
    const grid = document.getElementById('heatmapGrid');
    grid.innerHTML = '';

    // Apply entity filter if active
    let filteredClusters = clusters;
    if (activeEntityFilter) {
        filteredClusters = clusters.filter(c => {
            const entities = c.entities || generateMockEntities(c.topic, 5);
            return entities.some(e => e.toUpperCase() === activeEntityFilter.toUpperCase());
        });
    }

    if (filteredClusters.length === 0) {
        grid.innerHTML = '<div class="loading">' + (activeEntityFilter
            ? `NO CLUSTERS MATCHING ENTITY FILTER: ${activeEntityFilter}`
            : 'NO SIGNIFICANT EVENTS DETECTED IN TIMEFRAME') + '</div>';
        return;
    }

    // Apply sorting
    switch (currentSort) {
        case 'heat':
            filteredClusters.sort((a, b) => (b.heatScore || 0) - (a.heatScore || 0));
            break;
        case 'count':
            filteredClusters.sort((a, b) => (b.articleCount || 0) - (a.articleCount || 0));
            break;
        case 'composite':
            filteredClusters.sort((a, b) => calculateCompositeRank(b) - calculateCompositeRank(a));
            break;
    }

    const counts = filteredClusters.map(c => Number(c.articleCount) || 0).filter(n => n > 0);
    const minCount = counts.length ? Math.min(...counts) : 1;
    const maxCount = counts.length ? Math.max(...counts) : 1;
    const heats = filteredClusters.map(c => Number(c.heatScore) || 0);
    const minHeat = heats.length ? Math.min(...heats) : 0;
    const maxHeat = heats.length ? Math.max(...heats) : 0;

    function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }
    function normalize(n, lo, hi) {
        if (!Number.isFinite(n)) return 0;
        if (hi <= lo) return 0;
        return (n - lo) / (hi - lo);
    }

    filteredClusters.forEach(cluster => {
        const card = document.createElement('div');
        card.className = `heat-card ${getCategoryClass(cluster.category)}`;

        const count = Number(cluster.articleCount) || 0;
        const heat = Number(cluster.heatScore) || 0;

        const logCount = Math.log10(Math.max(1, count));
        const logMin = Math.log10(Math.max(1, minCount));
        const logMax = Math.log10(Math.max(1, maxCount));
        const countNorm = normalize(logCount, logMin, logMax);
        const heatNorm = normalize(heat, minHeat, maxHeat);

        const weight = clamp(countNorm * 0.85 + heatNorm * 0.15, 0, 1);
        const span = 1 + Math.round(weight * 3);
        card.style.gridColumnEnd = `span ${span}`;
        card.style.gridRowEnd = `span ${span}`;

        const trendArrow = getTrendArrow(cluster.trendDirection);
        const urgencyClass = `urgency-${(cluster.urgency || 'medium').toLowerCase()}`;
        const isCrossCategory = hasCrossCategory(cluster, filteredClusters);
        const compositeRank = calculateCompositeRank(cluster).toFixed(1);

        card.innerHTML = `
            <div class="card-header-row">
                <span class="category-badge">${cluster.category}</span>
                <div class="card-badges">
                    <span class="urgency-badge ${urgencyClass}">${cluster.urgency || 'MEDIUM'}</span>
                    ${isCrossCategory ? '<span class="cross-category-badge" onclick="event.stopPropagation(); openCrossCategoryModal(\'' + cluster.id + '\')">🌐</span>' : ''}
                </div>
            </div>
            <div class="card-topic">${cluster.topic} ${trendArrow}</div>
            <div class="card-entity-tags">${getEntityTags(cluster)}</div>
            <div class="card-prediction">${getPredictionBadge(cluster)}</div>
            <div class="card-metrics">
                <span class="metric">${count} MENTIONS</span>
                <span class="metric">HEAT ${heat.toFixed(0)}</span>
                ${currentSort === 'composite' ? `<span class="metric metric-composite">RANK ${compositeRank}</span>` : ''}
            </div>
        `;
        card.onclick = () => openCluster(cluster.id);
        grid.appendChild(card);
    });
}

function getTrendArrow(direction) {
    if (direction === 'UP') return '<span class="trend-arrow trend-up">↑</span>';
    if (direction === 'DOWN') return '<span class="trend-arrow trend-down">↓</span>';
    return '<span class="trend-arrow trend-neutral">-</span>';
}

// Cluster Modal
async function openCluster(id) {
    const modal = document.getElementById('clusterModal');
    modal.classList.add('active');

    try {
        const res = await fetch(`${API_BASE}/news/clusters/${id}`);
        const data = await res.json();

        document.getElementById('modalTopic').textContent = data.topic;

        const articleCount = data.articles?.length || 0;
        const heatScore = data.heatScore || 0;
        const velocity = data.velocity || 0;
        const authority = data.authorityScore || 0.5;
        const compositeRank = calculateCompositeRank(data).toFixed(1);

        document.getElementById('modalMeta').innerHTML = `
            Heat: ${heatScore.toFixed(1)} | Articles: ${articleCount} | Velocity: ${velocity.toFixed(1)} |
            Authority: ${(authority * 100).toFixed(0)}% | Composite Rank: ${compositeRank}
        `;

        document.getElementById('modalPredictionBadge').innerHTML = `
            <div style="font-family: var(--font-mono); font-size: 0.8em; color: #888; margin-bottom: 8px; text-transform: uppercase;">
                Prediction
            </div>
            ${getPredictionBadge(data)}
        `;

        document.getElementById('modalEntityTags').innerHTML = `
            <div style="font-family: var(--font-mono); font-size: 0.8em; color: #888; margin-bottom: 8px; text-transform: uppercase;">
                Trending Entities
            </div>
            <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                ${(data.entities || generateMockEntities(data.topic, 5)).map(entity => {
                    const type = getEntityType(entity);
                    const colors = { token: '#ff9800', person: '#2196f3', org: '#9c27b0' };
                    const color = colors[type] || colors.person;
                    return `<span class="entity-tag entity-${type}" style="background: ${color}20; color: ${color}; border-color: ${color};">${entity}</span>`;
                }).join('')}
            </div>
        `;

        const summaryText = data.summary || (articleCount > 0
            ? `${articleCount} articles about "${data.topic}". Heat score: ${heatScore.toFixed(1)}.`
            : 'No details available for this cluster.');
        document.getElementById('modalSummary').textContent = summaryText;

        const list = document.getElementById('modalArticles');
        if (!data.articles || data.articles.length === 0) {
            list.innerHTML = '<div class="article-item" style="color: #666;">No articles found for this cluster</div>';
        } else {
            list.innerHTML = data.articles.map(a => `
                <div class="article-item">
                    <a href="${a.url}" target="_blank" class="article-title">${a.title}</a>
                    <div class="article-meta">
                        ${a.source || 'Unknown'} // ${a.publishedAt ? new Date(a.publishedAt).toLocaleString() : 'No date'}
                    </div>
                </div>
            `).join('');
        }
    } catch (e) {
        console.error('Failed to fetch cluster details:', e);
        document.getElementById('modalTopic').textContent = 'Error loading cluster';
        document.getElementById('modalSummary').textContent = 'Unable to load cluster details. Please try again.';
    }
}

function closeModal(e) {
    if (e && e.target !== document.getElementById('clusterModal')) return;
    document.getElementById('clusterModal').classList.remove('active');
}

// Initial load
fetchHeatmap();

// Socket listener for live updates
const socket = io();
socket.on('cluster_update', () => {
    console.log('Cluster update received, refreshing...');
    fetchHeatmap();
});
