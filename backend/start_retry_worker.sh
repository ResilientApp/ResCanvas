#!/bin/bash
# Start the GraphQL retry worker for ResCanvas

WORKER_NAME="rescanvas_retry_worker"
BACKEND_DIR="/home/ubuntu/resilient-apps/ResCanvas/backend"
WORKER_SCRIPT="workers/graphql_retry_worker.py"

cd "$BACKEND_DIR" || exit 1

# Check if worker is already running
if screen -list | grep -q "$WORKER_NAME"; then
    echo "⚠️  Worker '$WORKER_NAME' is already running"
    echo "To view logs: screen -r $WORKER_NAME"
    echo "To stop: screen -S $WORKER_NAME -X quit"
    exit 0
fi

# Start worker in screen session
echo "🚀 Starting GraphQL retry worker..."
screen -S "$WORKER_NAME" -dm python3 "$WORKER_SCRIPT"

# Wait a moment for it to start
sleep 2

# Check if it started successfully
if screen -list | grep -q "$WORKER_NAME"; then
    echo "✅ Worker '$WORKER_NAME' started successfully"
    echo ""
    echo "Useful commands:"
    echo "  View logs:    screen -r $WORKER_NAME    (Ctrl+A then D to detach)"
    echo "  Check status: screen -ls | grep $WORKER_NAME"
    echo "  Stop worker:  screen -S $WORKER_NAME -X quit"
    echo ""
    echo "The worker will:"
    echo "  - Check for failed GraphQL commits every 60 seconds"
    echo "  - Automatically retry when ResilientDB comes back online"
    echo "  - Log all activity to the screen session"
else
    echo "❌ Failed to start worker"
    exit 1
fi
