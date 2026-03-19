#!/bin/bash

# Research Engine Control Script
# Similar to perps-control but specific to research engine

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    local color=$1
    local message=$2
    echo -e "${color}${message}${NC}"
}

# Function to check if service is running
check_service() {
    local service=$1
    if systemctl is-active --quiet "$service" 2>/dev/null; then
        echo -e "${GREEN}RUNNING${NC}"
    else
        echo -e "${RED}STOPPED${NC}"
    fi
}

# Function to show service status
show_status() {
    print_status $BLUE "🔍 Research Engine Service Status"
    echo "======================================"
    printf "%-25s %s\n" "Service" "Status"
    printf "%-25s %s\n" "-------------------------" "------"
    printf "%-25s %s\n" "perps-research" "$(check_service perps-research)"
    echo ""

    # Show additional info if running
    if systemctl is-active --quiet perps-research 2>/dev/null; then
        print_status $GREEN "✅ Research engine is active"
        echo ""
        echo "Configuration:"
        if [ -f "$PROJECT_DIR/.env" ]; then
            source "$PROJECT_DIR/.env"
        fi
        echo "  Research interval: ${RESEARCH_INTERVAL_MINUTES:-15} minutes"
        echo "  Evolution interval: ${EVOLUTION_INTERVAL_HOURS:-6} hours"
        echo "  Min Sharpe ratio: ${RESEARCH_MIN_SHARPE_RATIO:-1.5}"
        echo "  Min win rate: ${RESEARCH_MIN_WIN_RATE:-55}%"
        echo ""
        echo "Log file: /var/log/perps-trader/research.log"
    else
        print_status $YELLOW "⚠️  Research engine is not running"
    fi
}

# Function to start research service
start_research() {
    print_status $BLUE "🚀 Starting research engine..."

    # Ensure log directory exists
    sudo mkdir -p /var/log/perps-trader
    sudo chown d:d /var/log/perps-trader

    sudo systemctl start perps-research
    sleep 2

    if systemctl is-active --quiet perps-research; then
        print_status $GREEN "✅ Research engine started successfully"
    else
        print_status $RED "❌ Failed to start research engine"
        echo "Check logs with: $0 logs"
    fi
}

# Function to stop research service
stop_research() {
    print_status $YELLOW "🛑 Stopping research engine..."
    sudo systemctl stop perps-research

    if ! systemctl is-active --quiet perps-research 2>/dev/null; then
        print_status $GREEN "✅ Research engine stopped successfully"
    else
        print_status $RED "❌ Failed to stop research engine"
    fi
}

# Function to restart research service
restart_research() {
    print_status $BLUE "🔄 Restarting research engine..."

    # Ensure log directory exists
    sudo mkdir -p /var/log/perps-trader
    sudo chown d:d /var/log/perps-trader

    sudo systemctl restart perps-research
    sleep 2

    if systemctl is-active --quiet perps-research; then
        print_status $GREEN "✅ Research engine restarted successfully"
    else
        print_status $RED "❌ Failed to restart research engine"
    fi
}

# Function to show logs
show_logs() {
    print_status $BLUE "📋 Showing research engine logs (Ctrl+C to exit)..."

    # Check if log file exists
    if [ -f "/var/log/perps-trader/research.log" ]; then
        tail -f /var/log/perps-trader/research.log
    else
        # Fall back to journalctl
        journalctl -u perps-research -f
    fi
}

# Function to enable service on boot
enable_research() {
    print_status $BLUE "🔧 Enabling research engine on boot..."
    sudo systemctl enable perps-research
    print_status $GREEN "✅ Research engine enabled"
}

# Function to disable service from boot
disable_research() {
    print_status $YELLOW "🔧 Disabling research engine from boot..."
    sudo systemctl disable perps-research
    print_status $GREEN "✅ Research engine disabled"
}

# Function to show research engine stats
show_stats() {
    print_status $BLUE "📊 Research Engine Statistics"
    echo "======================================"

    if ! systemctl is-active --quiet perps-research 2>/dev/null; then
        print_status $YELLOW "⚠️  Research engine is not running"
        return 1
    fi

    # Load .env for database path
    if [ -f "$PROJECT_DIR/.env" ]; then
        source "$PROJECT_DIR/.env"
    fi

    local db_path="${RESEARCH_DB_PATH:-$PROJECT_DIR/data/research.db}"

    if [ -f "$db_path" ]; then
        echo "Database: $db_path"
        echo ""

        # Get pending ideas count
        local pending=$(sqlite3 "$db_path" "SELECT COUNT(*) FROM strategy_ideas WHERE status='PENDING';" 2>/dev/null || echo "N/A")
        echo "Pending ideas: $pending"

        # Get completed backtests count
        local completed=$(sqlite3 "$db_path" "SELECT COUNT(*) FROM backtest_jobs WHERE status='COMPLETED';" 2>/dev/null || echo "N/A")
        echo "Completed backtests: $completed"

        # Get top strategy Sharpe
        local top_sharpe=$(sqlite3 "$db_path" "SELECT MAX(sharpe_ratio) FROM backtest_results;" 2>/dev/null || echo "N/A")
        echo "Top strategy Sharpe: $top_sharpe"
    else
        echo "Database not found at $db_path"
    fi
}

# Function to trigger manual research cycle
trigger_research() {
    print_status $BLUE "Triggering manual research cycle..."
    redis-cli -p 6380 PUBLISH "research:autoresearch:trigger" '{"type":"manual","source":"cli"}' > /dev/null 2>&1
    print_status $GREEN "Research cycle triggered via Redis"
}

# Function to trigger manual evolution cycle
trigger_evolution() {
    print_status $BLUE "Triggering manual evolution cycle..."
    redis-cli -p 6380 PUBLISH "research:autoresearch:trigger" '{"type":"evolution","source":"cli"}' > /dev/null 2>&1
    print_status $GREEN "Evolution cycle triggered via Redis"
}

# ─── AutoResearch Bridge ──────────────────────────────────────────────

# Function to show autoresearch bridge status
show_autoresearch_status() {
    print_status $BLUE "AutoResearch Bridge Status"
    echo "===================================="
    printf "%-30s %s\n" "Component" "Status"
    printf "%-30s %s\n" "------------------------------" "------"
    printf "%-30s %s\n" "perps-autoresearch (systemd)" "$(check_service perps-autoresearch)"
    printf "%-30s %s\n" "Python bridge_client.py" "$([ -f /home/d/autoresearch/bridge_client.py ] && echo 'EXISTS' || echo 'MISSING')"
    printf "%-30s %s\n" "Python experiment.py" "$([ -f /home/d/autoresearch/experiment.py ] && echo 'EXISTS' || echo 'MISSING')"
    printf "%-30s %s\n" "Redis (6380)" "$(redis-cli -p 6380 ping 2>/dev/null || echo 'DOWN')"
    echo ""

    if systemctl is-active --quiet perps-autoresearch 2>/dev/null; then
        print_status $GREEN "AutoResearch bridge is active"
        echo ""
        echo "Experiment stats:"
        redis-cli -p 6380 GET "research:autoresearch:stats" 2>/dev/null || echo "  (no stats published yet)"
    else
        print_status $YELLOW "AutoResearch bridge is not running"
        echo ""
        echo "Start with: $0 autoresearch start"
    fi
}

# Function to start autoresearch bridge
start_autoresearch() {
    print_status $BLUE "Starting AutoResearch bridge..."
    sudo mkdir -p /var/log/perps-trader
    sudo chown d:d /var/log/perps-trader
    sudo cp "$PROJECT_DIR/perps-autoresearch.service" /etc/systemd/system/
    sudo systemctl daemon-reload
    sudo systemctl start perps-autoresearch
    sleep 2
    if systemctl is-active --quiet perps-autoresearch; then
        print_status $GREEN "AutoResearch bridge started"
    else
        print_status $RED "Failed to start AutoResearch bridge"
        echo "Check: journalctl -u perps-autoresearch -n 20"
    fi
}

# Function to stop autoresearch bridge
stop_autoresearch() {
    print_status $YELLOW "Stopping AutoResearch bridge..."
    sudo systemctl stop perps-autoresearch 2>/dev/null
    if ! systemctl is-active --quiet perps-autoresearch 2>/dev/null; then
        print_status $GREEN "AutoResearch bridge stopped"
    else
        print_status $RED "Failed to stop AutoResearch bridge"
    fi
}

# Function to restart autoresearch bridge
restart_autoresearch() {
    stop_autoresearch
    sleep 1
    start_autoresearch
}

# Function to show autoresearch logs
autoresearch_logs() {
    print_status $BLUE "AutoResearch bridge logs (Ctrl+C to exit)..."
    journalctl -u perps-autoresearch -f
}

# Function to show autoresearch experiment stats
show_autoresearch_stats() {
    print_status $BLUE "AutoResearch Experiment Statistics"
    echo "=========================================="

    local db_path="/home/d/PerpsTrader/data/trading.db"
    if [ -f "$db_path" ]; then
        echo "Database: $db_path"
        echo ""
        local total=$(sqlite3 "$db_path" "SELECT COUNT(*) FROM autoresearch_experiments;" 2>/dev/null || echo "N/A")
        echo "Total experiments: $total"
        local completed=$(sqlite3 "$db_path" "SELECT COUNT(*) FROM autoresearch_experiments WHERE status='completed';" 2>/dev/null || echo "N/A")
        echo "Completed: $completed"
        local adopted=$(sqlite3 "$db_path" "SELECT COUNT(*) FROM autoresearch_experiments WHERE result='adopted';" 2>/dev/null || echo "N/A")
        echo "Adopted: $adopted"
        local discarded=$(sqlite3 "$db_path" "SELECT COUNT(*) FROM autoresearch_experiments WHERE result='discarded';" 2>/dev/null || echo "N/A")
        echo "Discarded: $discarded"
        local best=$(sqlite3 "$db_path" "SELECT metrics FROM autoresearch_experiments WHERE status='completed' ORDER BY json_extract(metrics, '$.sharpe_ratio') DESC LIMIT 1;" 2>/dev/null || echo "N/A")
        echo "Best metrics: $best"
    else
        echo "Database not found at $db_path"
    fi
}

# Function to trigger a single autoresearch experiment
trigger_autoresearch_experiment() {
    print_status $BLUE "Triggering AutoResearch experiment..."
    redis-cli -p 6380 PUBLISH "research:autoresearch:trigger" "{\"type\":\"experiment\",\"params\":${2:-'{}'},\"source\":\"cli\"}" > /dev/null 2>&1
    print_status $GREEN "Experiment triggered via Redis"
}

# Function to show help
show_help() {
    echo "Research Engine Control Script"
    echo "Usage: $0 [COMMAND]"
    echo ""
    echo "Commands:"
    echo "  status              Show research engine status"
    echo "  start               Start the research engine"
    echo "  stop                Stop the research engine"
    echo "  restart             Restart the research engine"
    echo "  logs                Show research engine logs"
    echo "  enable              Enable research engine on boot"
    echo "  disable             Disable research engine from boot"
    echo "  stats               Show research engine statistics"
    echo "  research            Trigger manual research cycle"
    echo "  evolution           Trigger manual evolution cycle"
    echo ""
    echo "AutoResearch Bridge Commands:"
    echo "  autoresearch status     Show autoresearch bridge status"
    echo "  autoresearch start      Start the autoresearch bridge service"
    echo "  autoresearch stop       Stop the autoresearch bridge service"
    echo "  autoresearch restart    Restart the autoresearch bridge service"
    echo "  autoresearch logs       Show autoresearch bridge logs"
    echo "  autoresearch stats      Show experiment statistics"
    echo "  autoresearch trigger    Trigger a single experiment"
    echo ""
    echo "Examples:"
    echo "  $0 status               # Show current status"
    echo "  $0 start                # Start the research engine"
    echo "  $0 autoresearch start   # Start the autoresearch bridge"
    echo "  $0 autoresearch trigger # Trigger a single experiment"
    echo "  $0 logs                 # View logs in real-time"
}

# Main script logic
case "${1:-status}" in
    "status")
        show_status
        ;;
    "start")
        start_research
        ;;
    "stop")
        stop_research
        ;;
    "restart")
        restart_research
        ;;
    "logs")
        show_logs
        ;;
    "enable")
        enable_research
        ;;
    "disable")
        disable_research
        ;;
    "stats")
        show_stats
        ;;
    "research")
        trigger_research
        ;;
    "evolution")
        trigger_evolution
        ;;
    "autoresearch")
        case "${2:-status}" in
            "status")
                show_autoresearch_status
                ;;
            "start")
                start_autoresearch
                ;;
            "stop")
                stop_autoresearch
                ;;
            "restart")
                restart_autoresearch
                ;;
            "logs")
                autoresearch_logs
                ;;
            "stats")
                show_autoresearch_stats
                ;;
            "trigger")
                trigger_autoresearch_experiment "$3"
                ;;
            *)
                echo "Unknown autoresearch command: ${2:-}"
                echo "Usage: $0 autoresearch [status|start|stop|restart|logs|stats|trigger]"
                ;;
        esac
        ;;
    "help"|*)
        show_help
        ;;
esac
