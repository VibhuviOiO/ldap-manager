#!/bin/bash
# Test runner script for LDAP Manager backend

set -e

echo "========================================="
echo "LDAP Manager Backend Test Suite"
echo "========================================="
echo ""

# Check if we're in the backend directory
if [ ! -f "requirements-test.txt" ]; then
    echo "Error: Must run from backend/ directory"
    exit 1
fi

# Check if test dependencies are installed
if ! python -c "import pytest" 2>/dev/null; then
    echo "Installing test dependencies..."
    pip install -r requirements-test.txt
fi

echo "Running tests with coverage..."
echo ""

# Run tests with coverage
pytest \
    --cov=app \
    --cov-report=html \
    --cov-report=term-missing \
    --cov-report=xml \
    --tb=short \
    "$@"

echo ""
echo "========================================="
echo "Test Results Summary"
echo "========================================="
echo ""
echo "✓ All tests completed"
echo "✓ Coverage report: htmlcov/index.html"
echo "✓ XML report: coverage.xml"
echo ""
echo "To view HTML coverage report:"
echo "  open htmlcov/index.html"
echo ""
