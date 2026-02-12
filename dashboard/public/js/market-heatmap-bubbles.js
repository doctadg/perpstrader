// Market Heatmap Bubble Visualization
// Interactive D3-style bubble map using HTML5 Canvas

const API_BASE = '/api/heatmap';
let bubbleData = [];
let filteredData = [];
let categories = [];
let currentCategory = 'all';
let currentMinHeat = 0;
let canvas, ctx;
let animationId;
let hoveredBubble = null;

// Clock
function updateClock() {
    const el = document.getElementById('clock');
    if (el) el.textContent = new Date().toISOString().slice(11, 19) + ' UTC';
}
setInterval(updateClock, 1000);
updateClock();

// Initialize canvas
function initCanvas() {
    canvas = document.getElementById('bubbleCanvas');
    if (!canvas) return;
    
    const container = canvas.parentElement;
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;
    ctx = canvas.getContext('2d');
    
    // Handle resize
    window.addEventListener('resize', () => {
        canvas.width = container.clientWidth;
        canvas.height = container.clientHeight;
        drawBubbles();
    });
    
    // Handle mouse events
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseleave', () => {
        hoveredBubble = null;
        hideTooltip();
    });
    canvas.addEventListener('click', handleClick);
}

// Fetch bubble data
async function fetchBubbles() {
    try {
        showLoading(true);
        
        const params = new URLSearchParams();
        if (currentCategory !== 'all') params.append('category', currentCategory);
        params.append('minHeat', currentMinHeat.toString());
        
        const res = await fetch(`${API_BASE}/bubbles?${params}`);
        const data = await res.json();
        
        if (data.success) {
            bubbleData = data.bubbles;
            filteredData = bubbleData;
            updateStats(data.bubbles);
            positionBubbles();
            animateBubbles();
        }
        
        showLoading(false);
    } catch (e) {
        console.error('Failed to fetch bubbles:', e);
        showLoading(false);
    }
}

// Position bubbles using simple force-directed layout
function positionBubbles() {
    if (!canvas) return;
    
    const width = canvas.width;
    const height = canvas.height;
    const padding = 60;
    
    // Get unique categories
    const uniqueCategories = [...new Set(bubbleData.map(b => b.category))].sort();
    categories = uniqueCategories;
    
    // Update category filter buttons
    updateCategoryButtons();
    
    // Calculate positions based on category and heat
    const categoryWidth = (width - padding * 2) / Math.max(1, uniqueCategories.length);
    
    // Assign initial positions
    bubbleData.forEach((bubble, i) => {
        const catIndex = uniqueCategories.indexOf(bubble.category);
        
        // X position: spread across categories
        const baseX = padding + catIndex * categoryWidth + categoryWidth / 2;
        const randomX = (Math.random() - 0.5) * categoryWidth * 0.6;
        
        // Y position: higher heat = higher on canvas (inverted)
        // Heat 0-100 mapped to bottom to top
        const heatY = height - padding - (bubble.y / 100) * (height - padding * 2);
        const randomY = (Math.random() - 0.5) * 50;
        
        bubble.x = baseX + randomX;
        bubble.y = heatY + randomY;
        bubble.targetX = bubble.x;
        bubble.targetY = heatY;
        bubble.vx = 0;
        bubble.vy = 0;
        bubble.pulsePhase = Math.random() * Math.PI * 2;
    });
}

// Animation loop
function animateBubbles() {
    if (!ctx || !canvas) return;
    
    drawBubbles();
    animationId = requestAnimationFrame(animateBubbles);
}

// Draw bubbles
function drawBubbles() {
    if (!ctx || !canvas) return;
    
    const width = canvas.width;
    const height = canvas.height;
    
    // Clear canvas
    ctx.clearRect(0, 0, width, height);
    
    // Draw category labels
    drawCategoryLabels();
    
    // Draw grid lines
    drawGrid();
    
    // Draw connections for related bubbles
    drawConnections();
    
    // Update and draw bubbles
    const time = Date.now() / 1000;
    
    filteredData.forEach(bubble => {
        // Gentle floating animation
        bubble.pulsePhase += 0.02;
        const pulseOffset = Math.sin(bubble.pulsePhase) * 2;
        
        // Apply gentle force toward target position
        const dx = bubble.targetX - bubble.x;
        const dy = bubble.targetY - bubble.y;
        bubble.vx += dx * 0.001;
        bubble.vy += dy * 0.001;
        bubble.vx *= 0.95; // Damping
        bubble.vy *= 0.95;
        bubble.x += bubble.vx;
        bubble.y += bubble.vy;
        
        // Draw bubble
        const size = bubble.size + pulseOffset;
        const isHovered = hoveredBubble && hoveredBubble.id === bubble.id;
        
        // Glow effect for hovered bubble
        if (isHovered) {
            const gradient = ctx.createRadialGradient(
                bubble.x, bubble.y, 0,
                bubble.x, bubble.y, size * 2
            );
            gradient.addColorStop(0, bubble.color + '80');
            gradient.addColorStop(1, 'transparent');
            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(bubble.x, bubble.y, size * 2, 0, Math.PI * 2);
            ctx.fill();
        }
        
        // Main bubble
        ctx.fillStyle = bubble.color + (isHovered ? 'FF' : 'CC');
        ctx.beginPath();
        ctx.arc(bubble.x, bubble.y, size, 0, Math.PI * 2);
        ctx.fill();
        
        // Border
        ctx.strokeStyle = bubble.color;
        ctx.lineWidth = isHovered ? 3 : 2;
        ctx.stroke();
        
        // Label (if bubble is large enough)
        if (size > 20 || isHovered) {
            ctx.fillStyle = '#fff';
            ctx.font = `${isHovered ? 'bold' : 'normal'} 11px 'JetBrains Mono'`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            
            // Truncate long names
            let name = bubble.name;
            if (name.length > 15 && !isHovered) {
                name = name.slice(0, 12) + '...';
            }
            
            ctx.fillText(name, bubble.x, bubble.y);
            
            // Article count badge
            if (isHovered) {
                ctx.fillStyle = 'rgba(0,0,0,0.7)';
                ctx.font = '10px "JetBrains Mono"';
                ctx.fillText(`${bubble.articleCount} articles`, bubble.x, bubble.y + 15);
            }
        }
        
        // Trend indicator
        if (bubble.trendDirection === 'SPIKING' || bubble.trendDirection === 'RISING') {
            ctx.fillStyle = '#00ff9d';
            ctx.font = '10px "JetBrains Mono"';
            ctx.textAlign = 'center';
            ctx.fillText('▲', bubble.x + size + 8, bubble.y - 5);
        } else if (bubble.trendDirection === 'CRASHING' || bubble.trendDirection === 'FALLING') {
            ctx.fillStyle = '#ff3e3e';
            ctx.font = '10px "JetBrains Mono"';
            ctx.textAlign = 'center';
            ctx.fillText('▼', bubble.x + size + 8, bubble.y + 10);
        }
    });
}

// Draw category labels
function drawCategoryLabels() {
    if (!ctx || categories.length === 0) return;
    
    const width = canvas.width;
    const height = canvas.height;
    const padding = 60;
    const categoryWidth = (width - padding * 2) / categories.length;
    
    ctx.fillStyle = '#00f2ff';
    ctx.font = '12px "JetBrains Mono"';
    ctx.textAlign = 'center';
    
    categories.forEach((cat, i) => {
        const x = padding + i * categoryWidth + categoryWidth / 2;
        ctx.fillText(cat, x, height - 20);
    });
}

// Draw grid lines
function drawGrid() {
    if (!ctx) return;
    
    const width = canvas.width;
    const height = canvas.height;
    const padding = 60;
    
    ctx.strokeStyle = 'rgba(0, 242, 255, 0.05)';
    ctx.lineWidth = 1;
    
    // Horizontal grid lines (heat levels)
    for (let i = 0; i <= 5; i++) {
        const y = padding + (height - padding * 2) * (i / 5);
        ctx.beginPath();
        ctx.moveTo(padding, y);
        ctx.lineTo(width - padding, y);
        ctx.stroke();
        
        // Heat value labels
        ctx.fillStyle = '#666';
        ctx.font = '10px "JetBrains Mono"';
        ctx.textAlign = 'right';
        ctx.fillText(`${100 - i * 20}`, padding - 10, y + 3);
    }
}

// Draw connections between related bubbles
function drawConnections() {
    if (!ctx || filteredData.length < 2) return;
    
    ctx.strokeStyle = 'rgba(0, 242, 255, 0.1)';
    ctx.lineWidth = 1;
    
    // Simple proximity-based connections
    for (let i = 0; i < filteredData.length; i++) {
        for (let j = i + 1; j < filteredData.length; j++) {
            const b1 = filteredData[i];
            const b2 = filteredData[j];
            
            // Connect if same category or similar heat
            const sameCategory = b1.category === b2.category;
            const heatDiff = Math.abs(b1.y - b2.y);
            
            if (sameCategory && heatDiff < 50) {
                const dx = b2.x - b1.x;
                const dy = b2.y - b1.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                
                if (distance < 150) {
                    ctx.globalAlpha = 1 - (distance / 150);
                    ctx.beginPath();
                    ctx.moveTo(b1.x, b1.y);
                    ctx.lineTo(b2.x, b2.y);
                    ctx.stroke();
                    ctx.globalAlpha = 1;
                }
            }
        }
    }
}

// Handle mouse move
function handleMouseMove(e) {
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    // Find hovered bubble
    let found = null;
    for (const bubble of filteredData) {
        const dx = x - bubble.x;
        const dy = y - bubble.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance < bubble.size) {
            found = bubble;
            break;
        }
    }
    
    if (found !== hoveredBubble) {
        hoveredBubble = found;
        canvas.style.cursor = found ? 'pointer' : 'default';
        
        if (found) {
            showTooltip(found, e.clientX, e.clientY);
        } else {
            hideTooltip();
        }
    } else if (found) {
        updateTooltipPosition(e.clientX, e.clientY);
    }
}

// Show tooltip
function showTooltip(bubble, x, y) {
    const tooltip = document.getElementById('tooltip');
    if (!tooltip) return;
    
    document.getElementById('tooltipType').textContent = bubble.type.toUpperCase();
    document.getElementById('tooltipName').textContent = bubble.name;
    document.getElementById('tooltipHeat').textContent = bubble.y.toFixed(1);
    document.getElementById('tooltipArticles').textContent = bubble.articleCount;
    document.getElementById('tooltipTrend').textContent = bubble.trendDirection;
    document.getElementById('tooltipVelocity').textContent = 
        (bubble.velocity >= 0 ? '+' : '') + bubble.velocity.toFixed(1) + '%';
    
    const sentimentEl = document.getElementById('tooltipSentiment');
    const sentiment = bubble.sentiment > 0.2 ? 'POSITIVE' : 
                     bubble.sentiment < -0.2 ? 'NEGATIVE' : 'NEUTRAL';
    const sentimentScore = bubble.sentiment >= 0 ? `+${bubble.sentiment.toFixed(2)}` : bubble.sentiment.toFixed(2);
    
    sentimentEl.textContent = `${sentiment} (${sentimentScore})`;
    sentimentEl.className = `tooltip-sentiment sentiment-${sentiment.toLowerCase()}`;
    
    tooltip.classList.add('visible');
    updateTooltipPosition(x, y);
}

// Update tooltip position
function updateTooltipPosition(x, y) {
    const tooltip = document.getElementById('tooltip');
    if (!tooltip) return;
    
    const rect = tooltip.getBoundingClientRect();
    let left = x + 15;
    let top = y + 15;
    
    // Keep within viewport
    if (left + rect.width > window.innerWidth) {
        left = x - rect.width - 15;
    }
    if (top + rect.height > window.innerHeight) {
        top = y - rect.height - 15;
    }
    
    tooltip.style.left = left + 'px';
    tooltip.style.top = top + 'px';
}

// Hide tooltip
function hideTooltip() {
    const tooltip = document.getElementById('tooltip');
    if (tooltip) tooltip.classList.remove('visible');
}

// Handle click
function handleClick(e) {
    if (!hoveredBubble) return;
    
    // Navigate to market detail
    window.location.href = `/market/${hoveredBubble.id}`;
}

// Update category filter buttons
function updateCategoryButtons() {
    const container = document.getElementById('categoryFilter');
    if (!container) return;
    
    // Keep "ALL" button
    container.innerHTML = '<button class="category-btn active" data-category="all">ALL</button>';
    
    // Add category buttons
    categories.forEach(cat => {
        const btn = document.createElement('button');
        btn.className = 'category-btn';
        btn.dataset.category = cat;
        btn.textContent = cat;
        btn.onclick = () => setCategory(cat, btn);
        container.appendChild(btn);
    });
}

// Set category filter
function setCategory(category, btn) {
    currentCategory = category;
    
    // Update button states
    document.querySelectorAll('.category-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    
    // Filter data
    if (category === 'all') {
        filteredData = bubbleData;
    } else {
        filteredData = bubbleData.filter(b => b.category === category);
    }
    
    positionBubbles();
}

// Set minimum heat filter
function setMinHeat(minHeat, btn) {
    currentMinHeat = minHeat;
    
    // Update button states
    document.querySelectorAll('[data-min]').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    
    // Refetch with new filter
    fetchBubbles();
}

// Update stats overlay
function updateStats(bubbles) {
    document.getElementById('totalMarkets').textContent = bubbles.length;
    
    const activeCount = bubbles.filter(b => b.articleCount > 0).length;
    document.getElementById('activeMarkets').textContent = activeCount;
    
    const avgSent = bubbles.length > 0 
        ? (bubbles.reduce((sum, b) => sum + b.sentiment, 0) / bubbles.length)
        : 0;
    document.getElementById('avgSentiment').textContent = 
        (avgSent >= 0 ? '+' : '') + avgSent.toFixed(2);
    
    document.getElementById('lastUpdate').textContent = new Date().toLocaleTimeString();
}

// Show/hide loading
function showLoading(show) {
    const loading = document.getElementById('loading');
    if (loading) loading.style.display = show ? 'block' : 'none';
}

// Setup event listeners
function setupEventListeners() {
    // Min heat filter buttons
    document.querySelectorAll('[data-min]').forEach(btn => {
        btn.addEventListener('click', () => {
            setMinHeat(parseInt(btn.dataset.min), btn);
        });
    });
    
    // Refresh button
    const refreshBtn = document.getElementById('refreshBtn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', fetchBubbles);
    }
}

// WebSocket for live updates
function setupWebSocket() {
    const socket = io();
    
    socket.on('market_heat_updated', () => {
        console.log('Market heat updated, refreshing...');
        fetchBubbles();
    });
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    initCanvas();
    setupEventListeners();
    fetchBubbles();
    setupWebSocket();
});
