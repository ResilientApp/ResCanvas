#!/bin/bash
# Quick test runner for Crow API endpoints
# Usage: ./run_crow_tests.sh [simple|comprehensive|connectivity|mock|all]

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(dirname "$SCRIPT_DIR")"

show_usage() {
    echo "Usage: ./run_crow_tests.sh [OPTION]"
    echo ""
    echo "Options:"
    echo "  simple         Run quick 4-test suite (recommended)"
    echo "  comprehensive  Run full 7-test suite with JSON output"
    echo "  connectivity   Run diagnostic connectivity tests"
    echo "  mock           Run local mock tests (no network)"
    echo "  all            Run all test suites"
    echo "  help           Show this help message"
    echo ""
    echo "Examples:"
    echo "  ./run_crow_tests.sh simple"
    echo "  ./run_crow_tests.sh connectivity"
    echo ""
}

run_simple() {
    echo "Running simple Crow API tests..."
    cd "$SCRIPT_DIR"
    python3 test_crow_simple.py
}

run_comprehensive() {
    echo "Running comprehensive Crow API test suite..."
    cd "$BACKEND_DIR/tests"
    python3 test_crow_endpoints.py
}

run_connectivity() {
    echo "Running connectivity diagnostic..."
    cd "$SCRIPT_DIR"
    python3 test_crow_connectivity.py
}

run_mock() {
    echo "Running mock tests (local, no network)..."
    cd "$SCRIPT_DIR"
    python3 test_crow_mock.py
}

run_all() {
    echo "========================================"
    echo "Running ALL Crow API Test Suites"
    echo "========================================"
    echo ""
    
    echo "1. Connectivity Diagnostic"
    echo "----------------------------------------"
    run_connectivity
    echo ""
    
    echo "2. Mock Tests (Validation)"
    echo "----------------------------------------"
    run_mock
    echo ""
    
    echo "3. Simple Test Suite"
    echo "----------------------------------------"
    run_simple
    echo ""
    
    echo "4. Comprehensive Test Suite"
    echo "----------------------------------------"
    run_comprehensive
    echo ""
    
    echo "========================================"
    echo "All Test Suites Complete"
    echo "========================================"
}

# Main execution
case "${1:-simple}" in
    simple)
        run_simple
        ;;
    comprehensive)
        run_comprehensive
        ;;
    connectivity)
        run_connectivity
        ;;
    mock)
        run_mock
        ;;
    all)
        run_all
        ;;
    help|--help|-h)
        show_usage
        ;;
    *)
        echo "Error: Unknown option '$1'"
        echo ""
        show_usage
        exit 1
        ;;
esac
