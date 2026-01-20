#!/bin/bash

# Max & Jacob Development Script
# Usage: ./dev.sh [command]

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
PID_FILE="$PROJECT_DIR/.dev.pid"
LOG_FILE="$PROJECT_DIR/server.log"
SERVER_FILE="$PROJECT_DIR/server/server.js"
PORT=3000

# Helper functions
print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

# Check if server is running
is_running() {
    if [ -f "$PID_FILE" ]; then
        PID=$(cat "$PID_FILE")
        if ps -p "$PID" > /dev/null 2>&1; then
            return 0
        else
            rm -f "$PID_FILE"
            return 1
        fi
    fi
    return 1
}

# Get server PID
get_pid() {
    if [ -f "$PID_FILE" ]; then
        cat "$PID_FILE"
    fi
}

# Start server
start_server() {
    if is_running; then
        print_warning "Server is already running (PID: $(get_pid))"
        return 1
    fi
    
    print_info "Starting server..."
    cd "$PROJECT_DIR"
    
    # Start server in background
    nohup node "$SERVER_FILE" > "$LOG_FILE" 2>&1 &
    SERVER_PID=$!
    
    # Save PID
    echo $SERVER_PID > "$PID_FILE"
    
    # Wait a moment and check if it's running
    sleep 2
    
    if is_running; then
        print_success "Server started successfully (PID: $SERVER_PID)"
        print_info "Logs: $LOG_FILE"
        print_info "URL: http://localhost:$PORT"
        return 0
    else
        print_error "Server failed to start"
        print_info "Check logs: tail -f $LOG_FILE"
        return 1
    fi
}

# Stop server
stop_server() {
    if ! is_running; then
        print_warning "Server is not running"
        return 1
    fi
    
    PID=$(get_pid)
    print_info "Stopping server (PID: $PID)..."
    
    kill "$PID" 2>/dev/null
    
    # Wait for process to stop
    for i in {1..10}; do
        if ! ps -p "$PID" > /dev/null 2>&1; then
            rm -f "$PID_FILE"
            print_success "Server stopped"
            return 0
        fi
        sleep 0.5
    done
    
    # Force kill if still running
    print_warning "Force stopping server..."
    kill -9 "$PID" 2>/dev/null
    rm -f "$PID_FILE"
    print_success "Server stopped (forced)"
    return 0
}

# Restart server
restart_server() {
    print_info "Restarting server..."
    stop_server
    sleep 1
    start_server
}

# Show server status
show_status() {
    echo "========================================"
    echo "  Max & Jacob Server Status"
    echo "========================================"
    
    if is_running; then
        PID=$(get_pid)
        print_success "Server is running"
        echo "  PID: $PID"
        echo "  Port: $PORT"
        echo "  URL: http://localhost:$PORT"
        
        # Show memory usage
        if command -v ps > /dev/null; then
            MEM=$(ps -o rss= -p "$PID" 2>/dev/null | awk '{print int($1/1024)}')
            if [ -n "$MEM" ]; then
                echo "  Memory: ${MEM}MB"
            fi
        fi
        
        # Show uptime
        if [ -f "$PID_FILE" ]; then
            START_TIME=$(stat -f %m "$PID_FILE" 2>/dev/null || stat -c %Y "$PID_FILE" 2>/dev/null)
            if [ -n "$START_TIME" ]; then
                CURRENT_TIME=$(date +%s)
                UPTIME=$((CURRENT_TIME - START_TIME))
                echo "  Uptime: $((UPTIME / 3600))h $((UPTIME % 3600 / 60))m $((UPTIME % 60))s"
            fi
        fi
    else
        print_error "Server is not running"
    fi
    
    echo "========================================"
    
    # Show recent logs
    if [ -f "$LOG_FILE" ]; then
        echo ""
        print_info "Recent logs (last 10 lines):"
        echo "----------------------------------------"
        tail -10 "$LOG_FILE"
        echo "----------------------------------------"
    fi
}

# Show logs
show_logs() {
    if [ ! -f "$LOG_FILE" ]; then
        print_error "Log file not found: $LOG_FILE"
        return 1
    fi
    
    if [ "$1" = "-f" ] || [ "$1" = "--follow" ]; then
        print_info "Following logs... (Ctrl+C to stop)"
        tail -f "$LOG_FILE"
    else
        print_info "Showing last 50 lines of logs:"
        echo "========================================"
        tail -50 "$LOG_FILE"
        echo "========================================"
        print_info "Use './dev.sh logs -f' to follow logs in real-time"
    fi
}

# Clean up
clean() {
    print_info "Cleaning up..."
    
    # Stop server if running
    if is_running; then
        print_warning "Stopping server first..."
        stop_server
    fi
    
    # Clean old logs (keep last 1000 lines)
    if [ -f "$LOG_FILE" ]; then
        tail -1000 "$LOG_FILE" > "$LOG_FILE.tmp"
        mv "$LOG_FILE.tmp" "$LOG_FILE"
        print_success "Logs cleaned (kept last 1000 lines)"
    fi
    
    # Clean old screenshots (older than 30 days)
    if [ -d "$PROJECT_DIR/public/audit_screenshots" ]; then
        find "$PROJECT_DIR/public/audit_screenshots" -type f -mtime +30 -delete 2>/dev/null
        print_success "Old screenshots cleaned"
    fi
    
    print_success "Cleanup complete"
}

# Show help
show_help() {
    echo "Max & Jacob Development Script"
    echo ""
    echo "Usage: ./dev.sh [command]"
    echo ""
    echo "Commands:"
    echo "  start         Start the server"
    echo "  stop          Stop the server"
    echo "  restart       Restart the server"
    echo "  status        Show server status"
    echo "  logs          Show server logs"
    echo "  logs -f       Follow server logs in real-time"
    echo "  clean         Clean up logs and old files"
    echo "  help          Show this help message"
    echo ""
    echo "Examples:"
    echo "  ./dev.sh start"
    echo "  ./dev.sh restart"
    echo "  ./dev.sh logs -f"
    echo ""
}

# Main command handler
case "${1:-help}" in
    start)
        start_server
        ;;
    stop)
        stop_server
        ;;
    restart)
        restart_server
        ;;
    status)
        show_status
        ;;
    logs)
        show_logs "$2"
        ;;
    clean)
        clean
        ;;
    help|--help|-h)
        show_help
        ;;
    *)
        print_error "Unknown command: $1"
        echo ""
        show_help
        exit 1
        ;;
esac

