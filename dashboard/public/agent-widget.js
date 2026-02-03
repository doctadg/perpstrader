// Conversational Agent Chat Widget
// Floating chat interface for the trading system AI assistant

(function() {
  'use strict';

  // ============================================================================
  // CONFIGURATION
  // ============================================================================

  const CONFIG = {
    socketUrl: window.location.origin,
    apiEndpoint: '/api/agent/chat',
    namespace: '/agent',
    maxHistorySize: 100,
  };

  // ============================================================================
  // CHAT WIDGET CLASS
  // ============================================================================

  class ChatWidget {
    constructor() {
      this.state = {
        isOpen: false,
        isMinimized: false,
        conversationId: null,
        messages: [],
        isTyping: false,
        pendingConfirmation: null,
        socket: null,
      };

      this.elements = {};
      this.init();
    }

    // ========================================================================
    // INITIALIZATION
    // ========================================================================

    init() {
      this.createDOM();
      this.connectSocket();
      this.loadConversationHistory();
      this.attachEventListeners();
      this.startContextUpdates();
    }

    createDOM() {
      // Check if already exists
      if (document.getElementById('agent-widget')) {
        return;
      }

      const widget = document.createElement('div');
      widget.id = 'agent-widget';
      widget.innerHTML = `
        <!-- Floating Toggle Button -->
        <button id="agent-toggle" class="agent-toggle-btn" title="AI Trading Assistant">
          <span class="agent-icon">🤖</span>
          <span class="agent-badge" id="agent-badge" style="display: none;"></span>
        </button>

        <!-- Chat Modal -->
        <div id="agent-modal" class="agent-modal" style="display: none;">
          <div class="agent-header">
            <div class="agent-title">
              <span class="agent-icon">🤖</span>
              <span>AI Trading Assistant</span>
              <span class="agent-status" id="agent-status">ONLINE</span>
            </div>
            <div class="agent-controls">
              <button id="agent-minimize" class="agent-control-btn" title="Minimize">−</button>
              <button id="agent-clear" class="agent-control-btn" title="Clear chat">🗑</button>
              <button id="agent-close" class="agent-control-btn" title="Close">✕</button>
            </div>
          </div>

          <div class="agent-context-bar" id="agent-context-bar">
            <div class="agent-context-item">
              <span>Portfolio:</span>
              <strong id="ctx-portfolio">Loading...</strong>
            </div>
            <div class="agent-context-item">
              <span>P&L:</span>
              <strong id="ctx-pnl">Loading...</strong>
            </div>
            <div class="agent-context-item">
              <span>Positions:</span>
              <strong id="ctx-positions">Loading...</strong>
            </div>
          </div>

          <div id="agent-messages" class="agent-messages">
            <div class="agent-welcome">
              <p>👋 Hi! I'm your AI trading assistant.</p>
              <p>I can help you:</p>
              <ul>
                <li>Check portfolio, positions, and trades</li>
                <li>Analyze trading traces and explain decisions</li>
                <li>Execute trades (with confirmation)</li>
                <li>Update risk parameters</li>
                <li>Diagnose and fix system issues</li>
              </ul>
              <p>What would you like to do?</p>
            </div>
          </div>

          <div id="agent-typing" class="agent-typing" style="display: none;">
            <span></span><span></span><span></span>
          </div>

          <div id="agent-actions" class="agent-actions"></div>

          <div class="agent-input-area">
            <textarea
              id="agent-input"
              placeholder="Ask about your trades, portfolio, or execute actions..."
              rows="1"
            ></textarea>
            <button id="agent-send" title="Send">Send</button>
          </div>
        </div>

        <!-- Confirmation Modal -->
        <div id="agent-confirm-modal" class="agent-confirm-modal" style="display: none;">
          <div class="agent-confirm-content">
            <h3>⚠️ Confirmation Required</h3>
            <p id="agent-confirm-message"></p>
            <div class="agent-confirm-details">
              <pre id="agent-confirm-details"></pre>
            </div>
            <div class="agent-confirm-actions">
              <button id="agent-confirm-cancel" class="agent-confirm-cancel">Cancel</button>
              <button id="agent-confirm-ok" class="agent-confirm-ok">Confirm</button>
            </div>
          </div>
        </div>
      `;

      document.body.appendChild(widget);
      this.cacheElements();
    }

    cacheElements() {
      this.elements = {
        widget: document.getElementById('agent-widget'),
        toggle: document.getElementById('agent-toggle'),
        modal: document.getElementById('agent-modal'),
        messages: document.getElementById('agent-messages'),
        input: document.getElementById('agent-input'),
        send: document.getElementById('agent-send'),
        typing: document.getElementById('agent-typing'),
        actions: document.getElementById('agent-actions'),
        contextBar: document.getElementById('agent-context-bar'),
        status: document.getElementById('agent-status'),
        badge: document.getElementById('agent-badge'),
        minimize: document.getElementById('agent-minimize'),
        clear: document.getElementById('agent-clear'),
        close: document.getElementById('agent-close'),
        confirmModal: document.getElementById('agent-confirm-modal'),
        confirmMessage: document.getElementById('agent-confirm-message'),
        confirmDetails: document.getElementById('agent-confirm-details'),
        confirmOk: document.getElementById('agent-confirm-ok'),
        confirmCancel: document.getElementById('agent-confirm-cancel'),
        ctxPortfolio: document.getElementById('ctx-portfolio'),
        ctxPnl: document.getElementById('ctx-pnl'),
        ctxPositions: document.getElementById('ctx-positions'),
      };
    }

    // ========================================================================
    // SOCKET.IO CONNECTION
    // ========================================================================

    connectSocket() {
      try {
        // Use global socket.io if available (loaded from dashboard)
        if (typeof io === 'undefined') {
          console.error('[Agent Widget] Socket.IO not loaded');
          this.elements.status.textContent = 'OFFLINE';
          return;
        }

        this.state.socket = io(CONFIG.socketUrl + CONFIG.namespace, {
          reconnection: true,
          reconnectionAttempts: 5,
          reconnectionDelay: 1000,
        });

        this.state.socket.on('connect', () => {
          console.log('[Agent Widget] Connected');
          this.updateStatus('ONLINE', 'green');

          // Load/create conversation
          if (!this.state.conversationId) {
            this.startNewConversation();
          }
        });

        this.state.socket.on('disconnect', () => {
          console.log('[Agent Widget] Disconnected');
          this.updateStatus('RECONNECTING', 'orange');
        });

        this.state.socket.on('reconnect', () => {
          this.updateStatus('ONLINE', 'green');
        });

        this.state.socket.on('connected', (data) => {
          console.log('[Agent Widget] Server acknowledged connection');
        });

        this.state.socket.on('response', (data) => {
          this.handleAgentResponse(data);
        });

        this.state.socket.on('typing', (data) => {
          this.setTyping(data.isTyping);
        });

        this.state.socket.on('confirmation_required', (data) => {
          this.showConfirmationDialog(data);
        });

        this.state.socket.on('confirmation_result', (data) => {
          this.handleConfirmationResult(data);
        });

        this.state.socket.on('error', (data) => {
          this.showError(data.message || 'An error occurred');
        });

      } catch (error) {
        console.error('[Agent Widget] Socket connection error:', error);
        this.updateStatus('ERROR', 'red');
      }
    }

    // ========================================================================
    // CONVERSATION MANAGEMENT
    // ========================================================================

    async loadConversationHistory() {
      if (this.state.conversationId) {
        try {
          const response = await fetch(`${CONFIG.apiEndpoint.replace('/chat', '/history')}?conversationId=${this.state.conversationId}`);
          if (response.ok) {
            const data = await response.json();
            this.state.messages = data.messages || [];
            this.renderMessages();
          }
        } catch (error) {
          console.error('[Agent Widget] Failed to load history:', error);
        }
      }
    }

    startNewConversation() {
      this.state.conversationId = this.generateConversationId();
      this.state.messages = [];
      this.renderMessages();
    }

    generateConversationId() {
      return 'dashboard-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 11);
    }

    // ========================================================================
    // MESSAGING
    // ========================================================================

    async sendMessage(message) {
      if (!message || !message.trim()) return;

      // Add user message
      this.addMessage({
        role: 'user',
        content: message.trim(),
        timestamp: new Date(),
      });

      this.elements.input.value = '';
      this.setTyping(true);

      try {
        if (this.state.socket && this.state.socket.connected) {
          // Use Socket.IO
          this.state.socket.emit('message', {
            message: message.trim(),
            conversationId: this.state.conversationId,
          });
        } else {
          // Fallback to REST API
          const response = await fetch(CONFIG.apiEndpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              message: message.trim(),
              conversationId: this.state.conversationId,
            }),
          });

          if (!response.ok) {
            throw new Error('Failed to send message');
          }

          const data = await response.json();
          this.handleAgentResponse(data);
          this.setTyping(false);
        }
      } catch (error) {
        console.error('[Agent Widget] Send error:', error);
        this.setTyping(false);
        this.addMessage({
          role: 'assistant',
          content: 'Sorry, I encountered an error. Please try again.',
          timestamp: new Date(),
          error: true,
        });
      }
    }

    handleAgentResponse(data) {
      this.setTyping(false);

      // Update conversation ID if new
      if (data.conversationId && data.conversationId !== this.state.conversationId) {
        this.state.conversationId = data.conversationId;
      }

      // Add assistant message
      this.addMessage({
        role: 'assistant',
        content: data.response || '',
        timestamp: new Date(),
        suggestedActions: data.suggestedActions || [],
      });

      // Show suggested actions
      if (data.suggestedActions && data.suggestedActions.length > 0) {
        this.showSuggestedActions(data.suggestedActions);
      }

      // Show notification if minimized
      if (this.state.isMinimized) {
        this.showNotification();
      }

      // Scroll to bottom
      this.scrollToBottom();
    }

    addMessage(message) {
      this.state.messages.push(message);
      this.renderMessage(message);
      this.scrollToBottom();
    }

    renderMessage(message) {
      // Remove welcome message on first user message
      const welcome = this.elements.messages.querySelector('.agent-welcome');
      if (welcome && message.role === 'user') {
        welcome.remove();
      }

      const msgEl = document.createElement('div');
      msgEl.className = `agent-message agent-message-${message.role}`;
      if (message.error) msgEl.classList.add('agent-message-error');

      const content = this.formatMessageContent(message.content);

      msgEl.innerHTML = `
        <div class="agent-message-header">
          <span class="agent-message-role">${message.role === 'user' ? 'You' : 'Agent'}</span>
          <span class="agent-message-time">${this.formatTime(message.timestamp)}</span>
        </div>
        <div class="agent-message-content">${content}</div>
      `;

      this.elements.messages.appendChild(msgEl);
    }

    renderMessages() {
      // Clear existing messages (keep welcome)
      const welcome = this.elements.messages.querySelector('.agent-welcome');
      this.elements.messages.innerHTML = '';
      if (welcome) this.elements.messages.appendChild(welcome);

      // Render all messages
      for (const message of this.state.messages) {
        if (!welcome && this.state.messages.length > 0) {
          // Don't show welcome if there are messages
        }
        this.renderMessage(message);
      }

      this.scrollToBottom();
    }

    formatMessageContent(content) {
      if (!content) return '';

      // Escape HTML
      let formatted = content
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

      // Code blocks
      formatted = formatted.replace(/```(\w+)?\n([\s\S]*?)```/g, (match, lang, code) => {
        return `<pre><code class="language-${lang || 'text'}">${code.trim()}</code></pre>`;
      });

      // Inline code
      formatted = formatted.replace(/`([^`]+)`/g, '<code>$1</code>');

      // Bold
      formatted = formatted.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

      // Italic
      formatted = formatted.replace(/\*([^*]+)\*/g, '<em>$1</em>');

      // Line breaks
      formatted = formatted.replace(/\n/g, '<br>');

      return formatted;
    }

    formatTime(timestamp) {
      const date = new Date(timestamp);
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    // ========================================================================
    // SUGGESTED ACTIONS
    // ========================================================================

    showSuggestedActions(actions) {
      this.elements.actions.innerHTML = '';

      for (const action of actions.slice(0, 4)) {
        const btn = document.createElement('button');
        btn.className = 'agent-action-btn';
        btn.innerHTML = `${action.icon || '→'} ${action.label}`;
        btn.addEventListener('click', () => this.executeAction(action));
        this.elements.actions.appendChild(btn);
      }
    }

    executeAction(action) {
      // Send as a message
      const actionText = this.actionToText(action);
      this.sendMessage(actionText);
    }

    actionToText(action) {
      switch (action.action) {
        case 'get_portfolio':
          return 'Show me my portfolio';
        case 'get_positions':
          return 'What are my open positions?';
        case 'analyze_trace':
          return `Analyze trace ${action.params?.traceId || ''}`;
        case 'get_system_status':
          return 'What is the system status?';
        default:
          return action.label;
      }
    }

    // ========================================================================
    // CONFIRMATION DIALOG
    // ========================================================================

    showConfirmationDialog(data) {
      this.state.pendingConfirmation = data;

      this.elements.confirmMessage.textContent = data.message || 'Please confirm this action';
      this.elements.confirmDetails.textContent = JSON.stringify(data.details || {}, null, 2);

      // Style based on risk level
      const riskLevel = data.riskLevel || 'UNKNOWN';
      const okBtn = this.elements.confirmOk;

      okBtn.className = 'agent-confirm-ok';
      if (riskLevel === 'CRITICAL' || riskLevel === 'HIGH') {
        okBtn.classList.add('agent-confirm-danger');
      }

      okBtn.textContent = `Confirm ${riskLevel}`;

      this.elements.confirmModal.style.display = 'flex';
    }

    hideConfirmationDialog() {
      this.elements.confirmModal.style.display = 'none';
      this.state.pendingConfirmation = null;
    }

    async submitConfirmation(confirmed) {
      const actionId = this.state.pendingConfirmation?.actionId;
      if (!actionId) return;

      if (this.state.socket && this.state.socket.connected) {
        this.state.socket.emit('confirm', { actionId, confirmed });
      } else {
        // Fallback to REST API
        try {
          await fetch('/api/agent/confirm', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ actionId, confirmed }),
          });
        } catch (error) {
          console.error('[Agent Widget] Confirm error:', error);
        }
      }

      this.hideConfirmationDialog();
    }

    handleConfirmationResult(data) {
      if (data.success) {
        this.addMessage({
          role: 'assistant',
          content: `✓ Action completed successfully`,
          timestamp: new Date(),
        });
      } else {
        this.addMessage({
          role: 'assistant',
          content: `✗ Action ${data.message || 'failed'}`,
          timestamp: new Date(),
          error: true,
        });
      }
    }

    // ========================================================================
    // CONTEXT BAR UPDATES
    // ========================================================================

    startContextUpdates() {
      this.updateContextBar();
      setInterval(() => this.updateContextBar(), 30000); // Update every 30s
    }

    async updateContextBar() {
      try {
        const response = await fetch('/api/portfolio');
        if (response.ok) {
          const data = await response.json();

          const totalValue = data.portfolio?.totalValue || 0;
          const pnl = (data.realizedPnL || 0) + (data.portfolio?.unrealizedPnL || 0);
          const positionCount = data.positions?.length || 0;

          this.elements.ctxPortfolio.textContent = `$${totalValue.toFixed(2)}`;
          this.elements.ctxPnl.textContent = `$${pnl.toFixed(2)}`;
          this.elements.ctxPnl.className = pnl >= 0 ? 'positive' : 'negative';
          this.elements.ctxPositions.textContent = positionCount;
        }
      } catch (error) {
        // Silent fail on context updates
      }
    }

    // ========================================================================
    // UI HELPERS
    // ========================================================================

    toggle() {
      this.state.isOpen = !this.state.isOpen;
      this.elements.modal.style.display = this.state.isOpen ? 'flex' : 'none';
      if (this.state.isOpen) {
        this.state.isMinimized = false;
        this.elements.badge.style.display = 'none';
        this.elements.input.focus();
      }
    }

    minimize() {
      this.state.isMinimized = true;
      this.elements.modal.style.display = 'none';
    }

    close() {
      this.state.isOpen = false;
      this.state.isMinimized = false;
      this.elements.modal.style.display = 'none';
    }

    clearChat() {
      if (confirm('Clear all messages?')) {
        this.state.messages = [];
        this.renderMessages();
      }
    }

    setTyping(isTyping) {
      this.state.isTyping = isTyping;
      this.elements.typing.style.display = isTyping ? 'flex' : 'none';
      if (isTyping) {
        this.scrollToBottom();
      }
    }

    updateStatus(status, color) {
      this.elements.status.textContent = status;
      this.elements.status.style.color = color === 'green' ? 'var(--agent-success)' :
        color === 'orange' ? 'var(--agent-warning)' :
        color === 'red' ? 'var(--agent-danger)' : 'var(--agent-primary)';
    }

    showNotification() {
      this.elements.badge.textContent = '!';
      this.elements.badge.style.display = 'block';
    }

    showError(message) {
      this.addMessage({
        role: 'assistant',
        content: `⚠️ ${message}`,
        timestamp: new Date(),
        error: true,
      });
    }

    scrollToBottom() {
      setTimeout(() => {
        this.elements.messages.scrollTop = this.elements.messages.scrollHeight;
      }, 10);
    }

    // ========================================================================
    // EVENT LISTENERS
    // ========================================================================

    attachEventListeners() {
      // Toggle button
      this.elements.toggle.addEventListener('click', () => this.toggle());

      // Control buttons
      this.elements.minimize.addEventListener('click', () => this.minimize());
      this.elements.close.addEventListener('click', () => this.close());
      this.elements.clear.addEventListener('click', () => this.clearChat());

      // Send button
      this.elements.send.addEventListener('click', () => {
        this.sendMessage(this.elements.input.value);
      });

      // Input handling
      this.elements.input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          this.sendMessage(this.elements.input.value);
        }
      });

      // Auto-resize textarea
      this.elements.input.addEventListener('input', () => {
        this.elements.input.style.height = 'auto';
        this.elements.input.style.height = Math.min(this.elements.input.scrollHeight, 120) + 'px';
      });

      // Confirmation dialog
      this.elements.confirmOk.addEventListener('click', () => {
        this.submitConfirmation(true);
      });

      this.elements.confirmCancel.addEventListener('click', () => {
        this.submitConfirmation(false);
      });

      // Close confirmation on outside click
      this.elements.confirmModal.addEventListener('click', (e) => {
        if (e.target === this.elements.confirmModal) {
          this.submitConfirmation(false);
        }
      });
    }
  }

  // ============================================================================
  // INITIALIZE ON DOM READY
  // ============================================================================

  function initWidget() {
    // Check if we should embed widget (check for meta tag or data attribute)
    const shouldEnable = document.querySelector('meta[name="agent-widget"]')?.getAttribute('content') !== 'false';

    if (shouldEnable) {
      window.agentChatWidget = new ChatWidget();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initWidget);
  } else {
    initWidget();
  }

})();
