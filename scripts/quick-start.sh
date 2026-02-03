#!/bin/bash

# PerpsTrader Quick Start Script
# Simple script to get the system running quickly without systemd

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_header() {
    echo -e "${BLUE}=== $1 ===${NC}"
}

# Get local IP
get_local_ip() {
    hostname -I | awk '{print $1}'
}

# Start dashboard
start_dashboard() {
    print_header "Starting Dashboard"
    
    # Kill existing processes
    pkill -f "node.*dashboard" 2>/dev/null
    pkill -f "simple-dashboard" 2>/dev/null
    sleep 2
    
    cd "$PROJECT_DIR"
    
    # Create logs directory
    mkdir -p logs
    
    # Start dashboard
    nohup node simple-dashboard.js > logs/dashboard.log 2>&1 &
    
    sleep 3
    
    if curl -s http://localhost:3000/api/health > /dev/null; then
        LOCAL_IP=$(get_local_ip)
        print_status "Dashboard started successfully!"
        echo ""
        echo -e "${GREEN}🌐 Local Network Access:${NC} http://$LOCAL_IP:3000"
        echo -e "${GREEN}💻 Local Access:${NC} http://localhost:3000"
        echo ""
        echo -e "${BLUE}📱 From your phone/tablet:${NC} http://$LOCAL_IP:3000"
        echo ""
        echo -e "${YELLOW}📋 Test commands:${NC}"
        echo "   curl http://$LOCAL_IP:3000/api/health"
        echo "   curl http://$LOCAL_IP:3000/api/status"
        echo ""
        return 0
    else
        print_status "Dashboard failed to start. Check logs/dashboard.log"
        return 1
    fi
}

# Start AI agent
start_agent() {
    print_header "Starting AI Trading Agent"
    
    cd "$PROJECT_DIR"
    
    # Create logs directory
    mkdir -p logs
    
    # Start agent
    nohup node bin/agent.js > logs/agent.log 2>&1 &
    
    sleep 3
    
    if pgrep -f "node.*agent" > /dev/null; then
        print_status "AI Agent started successfully!"
        echo "📊 Logs: tail -f logs/agent.log"
        return 0
    else
        print_status "AI Agent failed to start. Check logs/agent.log"
        return 1
    fi
}

# Start all services
start_all() {
    print_header "Starting PerpsTrader AI System"
    
    # Start dashboard first
    if start_dashboard; then
        # Start agent
        start_agent
        
        print_status "All services started successfully!"
        echo ""
        echo -e "${GREEN}🎯 System Summary:${NC}"
        echo "   Dashboard: http://$(get_local_ip):3000"
        echo "   Agent Logs: tail -f logs/agent.log"
        echo "   Dashboard Logs: tail -f logs/dashboard.log"
        echo ""
        echo -e "${BLUE}⚠️  Important:${NC}"
        echo "   1. Configure API keys in config/hyperliquid.keys"
        echo "   2. Add Z.AI API key for GLM 4.6 integration"
        echo "   3. Start with testnet=true for safety"
        echo ""
    else
        print_status "Failed to start dashboard. Agent not started."
        exit 1
    fi
}

# Stop all services
stop_all() {
    print_header "Stopping All Services"
    
    pkill -f "node.*agent" 2>/dev/null && print_status "AI Agent stopped"
    pkill -f "node.*dashboard" 2>/dev/null && print_status "Dashboard stopped"
    pkill -f "simple-dashboard" 2>/dev/null && print_status "Dashboard stopped"
    
    print_status "All services stopped"
}

# Show status
show_status() {
    print_header "PerpsTrader System Status"
    
    LOCAL_IP=$(get_local_ip)
    
    echo "🌐 Dashboard URL: http://$LOCAL_IP:3000"
    echo ""
    
    # Check dashboard
    if curl -s http://localhost:3000/api/health > /dev/null 2>&1; then
        echo -e "${GREEN}✅ Dashboard:${NC} RUNNING"
        echo "   URL: http://$LOCAL_IP:3000"
    else
        echo -e "${RED}❌ Dashboard:${NC} STOPPED"
    fi
    
    # Check AI agent
    if pgrep -f "node.*agent" > /dev/null; then
        echo -e "${GREEN}✅ AI Agent:${NC} RUNNING"
        echo "   Logs: tail -f logs/agent.log"
    else
        echo -e "${RED}❌ AI Agent:${NC} STOPPED"
    fi
    
    echo ""
    
    # Show recent logs
    if [ -f "logs/agent.log" ]; then
        echo -e "${BLUE}📋 Recent Agent Logs:${NC}"
        tail -3 logs/agent.log 2>/dev/null | sed 's/^/   /'
    fi
}

# Show logs
show_logs() {
    local service=$1
    
    case $service in
        "agent"|"a")
            print_header "AI Agent Logs"
            tail -f logs/agent.log
            ;;
        "dashboard"|"d")
            print_header "Dashboard Logs"
            tail -f logs/dashboard.log
            ;;
        *)
            echo "Usage: $0 logs [agent|dashboard]"
            exit 1
            ;;
    esac
}

# Emergency stop
emergency_stop() {
    print_header "🚨 EMERGENCY STOP"
    
    pkill -f "node.*agent"
    pkill -f "node.*dashboard"
    pkill -f "simple-dashboard"
    
    print_status "Emergency stop activated - All trading halted!"
}

# Show help
show_help() {
    echo "PerpsTrader AI Trading System - Quick Start"
    echo ""
    echo "Usage: $0 [COMMAND]"
    echo ""
    echo "Commands:"
    echo "  start           Start dashboard + AI agent"
    echo "  dashboard       Start dashboard only"
    echo "  agent           Start AI agent only"
    echo "  stop            Stop all services"
    echo "  status          Show system status"
    echo "  logs [service]  Show logs (agent|dashboard)"
    echo "  emergency       Emergency stop all trading"
    echo "  help            Show this help"
    echo ""
    echo "Examples:"
    echo "  $0 start                    # Start everything"
    echo "  $0 dashboard                # Start dashboard only"
    echo "  $0 logs agent               # Watch agent logs"
    echo "  $0 status                   # Check system status"
    echo ""
    echo "🌐 Dashboard will be accessible on your entire local network!"
}

# Main logic
case $1 in
    "start")
        start_all
        ;;
    "stop")
        stop_all
        ;;
    "dashboard"|"dash")
        start_dashboard
        ;;
    "agent")
        start_agent
        ;;
    "status")
        show_status
        ;;
    "logs")
        show_logs $2
        ;;
    "emergency"|"stop-all")
        emergency_stop
        ;;
    "help"|"--help"|"-h"|"")
        show_help
        ;;
    *)
        echo "Unknown command: $1"
        show_help
        exit 1
        ;;
esac