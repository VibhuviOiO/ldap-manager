# E2E Testing with Playwright

## Why Playwright over Cypress?

| Feature | Playwright | Cypress |
|---------|-----------|---------|
| **Speed** | ✅ Faster | Slower |
| **Multi-browser** | ✅ Chrome, Firefox, Safari | Chrome, Firefox only |
| **Auto-wait** | ✅ Built-in | Manual waits needed |
| **Parallel tests** | ✅ Native | Paid feature |
| **API testing** | ✅ Built-in | Limited |
| **Modern** | ✅ 2024 standard | Older |

## Setup

```bash
cd frontend
npm install
npx playwright install
```

## Run Tests

```bash
# Run all tests (headless)
npm run test:e2e

# Run with UI (interactive)
npm run test:e2e:ui

# Run with browser visible
npm run test:e2e:headed
```

## Test Coverage

### User Creation Tests
- ✅ Open slide-in panel from right
- ✅ Display all form fields (standard + custom)
- ✅ Populate dropdown options from YAML config
- ✅ Auto-generate email from username
- ✅ Show readonly fields as disabled
- ✅ Create user with custom attributes (role, kingdom, weapon, allegiance)
- ✅ Validate required fields
- ✅ Close panel on cancel/backdrop click

### Column Settings Tests
- ✅ Open column settings panel
- ✅ Show all available columns with checkboxes
- ✅ Toggle column visibility
- ✅ Persist preferences in localStorage

### Table Display Tests
- ✅ Display custom attributes in table
- ✅ Render custom attribute values
- ✅ Show/hide columns based on config

## Writing Tests

```typescript
import { test, expect } from '@playwright/test';

test('should do something', async ({ page }) => {
  await page.goto('/');
  await page.click('text=Button');
  await expect(page.locator('text=Result')).toBeVisible();
});
```

## Best Practices

1. **Use data-testid for stable selectors**
   ```tsx
   <button data-testid="create-user-btn">Create User</button>
   ```
   ```typescript
   await page.click('[data-testid="create-user-btn"]');
   ```

2. **Auto-wait is built-in**
   ```typescript
   // No need for manual waits
   await page.click('button'); // Waits automatically
   ```

3. **Use page object pattern for reusability**
   ```typescript
   class UserPage {
     constructor(private page: Page) {}
     async createUser(data) { ... }
   }
   ```

4. **Test in multiple browsers**
   ```bash
   npx playwright test --project=chromium
   npx playwright test --project=firefox
   npx playwright test --project=webkit
   ```

## CI/CD Integration

```yaml
# .github/workflows/test.yml
name: E2E Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm ci
      - run: npx playwright install --with-deps
      - run: npm run test:e2e
```

## Debugging

```bash
# Debug mode (step through tests)
npx playwright test --debug

# Show trace viewer
npx playwright show-trace trace.zip

# Generate code from browser actions
npx playwright codegen http://localhost:5173
```

## Backend Testing

For backend API tests, use pytest:

```bash
cd backend
pip install pytest pytest-asyncio httpx
pytest tests/
```

Example backend test:
```python
import pytest
from httpx import AsyncClient
from app.main import app

@pytest.mark.asyncio
async def test_create_user():
    async with AsyncClient(app=app, base_url="http://test") as client:
        response = await client.post("/api/entries/create", json={
            "cluster_name": "test",
            "dn": "uid=test,ou=People,dc=test,dc=com",
            "attributes": {"uid": "test", "cn": "Test User"}
        })
        assert response.status_code == 200
```
