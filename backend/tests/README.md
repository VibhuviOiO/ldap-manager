# LDAP Manager Backend Tests

Comprehensive test suite for the LDAP Manager backend with >80% code coverage target.

## Test Structure

```
tests/
├── __init__.py                    # Test package marker
├── conftest.py                    # Shared fixtures and configuration
├── README.md                      # This file
├── test_password_cache.py         # Password encryption tests (24 tests)
├── test_node_selector.py          # Load balancing tests (19 tests)
├── test_ldap_client.py            # LDAP client tests (20 tests)
├── test_api_entries.py            # API endpoint tests (25 tests)
├── test_config_validator.py       # Configuration validation (25 tests)
└── test_connection_pool.py        # Connection pooling tests (15 tests)
```

**Total: 128+ tests**

## Prerequisites

Install test dependencies:

```bash
cd backend
pip install -r requirements-test.txt
```

## Running Tests

### Run all tests

```bash
pytest
```

### Run with coverage report

```bash
pytest --cov=app --cov-report=html --cov-report=term-missing
```

View HTML coverage report:

```bash
open htmlcov/index.html
```

### Run specific test file

```bash
pytest tests/test_password_cache.py
```

### Run specific test

```bash
pytest tests/test_password_cache.py::TestPasswordEncryption::test_encryption_key_generation
```

### Run tests by marker

```bash
# Run only unit tests
pytest -m unit

# Run only integration tests
pytest -m integration

# Exclude slow tests
pytest -m "not slow"
```

### Verbose output

```bash
pytest -v
```

### Show print statements

```bash
pytest -s
```

## Test Categories

### Unit Tests (Fast)

- **test_password_cache.py**: Encryption, TTL, cache operations
- **test_node_selector.py**: Node selection logic, failover
- **test_config_validator.py**: Pydantic validation
- **test_connection_pool.py**: Connection pooling, TTL

### Integration Tests

- **test_ldap_client.py**: LDAP operations with mocked connections
- **test_api_entries.py**: FastAPI endpoints with TestClient

## Coverage Goals

Target: **>80% code coverage**

Check coverage per module:

```bash
pytest --cov=app --cov-report=term-missing
```

Current coverage areas:

| Module | Focus |
|--------|-------|
| `password_cache.py` | Encryption, TTL, security |
| `node_selector.py` | Load balancing, failover |
| `ldap_client.py` | LDAP operations, error handling |
| `connection_pool.py` | Pooling, TTL, cleanup |
| `config_validator.py` | Schema validation |
| `api/entries.py` | HTTP endpoints, security |

## Writing New Tests

### Test File Naming

- Files: `test_<module_name>.py`
- Classes: `Test<FeatureName>`
- Methods: `test_<specific_behavior>`

### Example Test Structure

```python
import pytest
from unittest.mock import Mock, patch


class TestFeature:
    """Test feature X functionality."""

    @pytest.fixture
    def sample_data(self):
        """Fixture for test data."""
        return {"key": "value"}

    def test_basic_functionality(self, sample_data):
        """Test that feature works as expected."""
        result = my_function(sample_data)
        assert result == expected_value

    def test_error_handling(self):
        """Test that errors are handled gracefully."""
        with pytest.raises(ValueError, match="error message"):
            my_function(invalid_input)
```

### Mocking Guidelines

1. **Mock external dependencies**: LDAP connections, file I/O
2. **Use fixtures** for reusable mocks
3. **Patch at usage point**, not definition point
4. **Verify calls** when behavior matters

Example:

```python
@patch('app.api.entries.LDAPClient')
def test_with_mock(self, mock_client_class):
    mock_instance = MagicMock()
    mock_client_class.return_value = mock_instance

    # Test code here

    mock_instance.connect.assert_called_once()
```

## Continuous Integration

Tests run automatically on GitHub Actions for:

- Pull requests
- Pushes to main branch

CI enforces:

- All tests must pass
- Coverage must be >80%
- No linting errors

## Troubleshooting

### Tests fail with import errors

```bash
# Ensure you're in backend directory
cd backend

# Install dependencies
pip install -r requirements.txt
pip install -r requirements-test.txt
```

### Tests pass locally but fail in CI

Check:

1. Environment variables
2. File paths (use `Path` from `pathlib`)
3. Time-dependent tests (use `freezegun`)

### Coverage below 80%

```bash
# Find uncovered lines
pytest --cov=app --cov-report=term-missing

# Add tests for uncovered code paths
```

## Best Practices

1. **Fast tests**: Unit tests should run in milliseconds
2. **Isolated tests**: No dependencies between tests
3. **Clear names**: Test name describes what is being tested
4. **One assertion per test**: Or closely related assertions
5. **Mock external services**: Don't call real LDAP servers
6. **Use fixtures**: For common setup
7. **Test edge cases**: Empty lists, None values, errors

## Resources

- [pytest documentation](https://docs.pytest.org/)
- [unittest.mock guide](https://docs.python.org/3/library/unittest.mock.html)
- [FastAPI testing](https://fastapi.tiangolo.com/tutorial/testing/)
- [Coverage.py](https://coverage.readthedocs.io/)
