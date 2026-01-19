# Running E2E Tests

## Prerequisites

The E2E tests require both frontend and backend to be running.

### 1. Start Backend

```bash
cd backend
docker-compose up -d  # Start LDAP server
python -m uvicorn app.main:app --reload --port 8000
```

### 2. Start Frontend

```bash
cd frontend
npm run dev  # Runs on http://localhost:5173
```

### 3. Run Tests

```bash
cd frontend
npm run test:e2e        # Headless
npm run test:e2e:ui     # Interactive UI
npm run test:e2e:headed # See browser
```

## Test Files (Organized by Page)

- **dashboard.spec.ts** - Dashboard page tests (cluster list, navigation)
- **cluster-details.spec.ts** - Cluster details page tests (tabs, table, search)
- **user-creation.spec.ts** - User creation form tests (fields, dropdowns, submit)
- **column-settings.spec.ts** - Column visibility settings tests

## Run All Tests

```bash
npm run test:e2e
```

## Run Specific Page Tests

```bash
npm run test:e2e -- dashboard.spec.ts
npm run test:e2e -- cluster-details.spec.ts
npm run test:e2e -- user-creation.spec.ts
npm run test:e2e -- column-settings.spec.ts
```

## Full Test (With Backend)

```bash
# Terminal 1: Backend
cd backend && docker-compose up -d && python -m uvicorn app.main:app --reload

# Terminal 2: Frontend  
cd frontend && npm run dev

# Terminal 3: Tests
cd frontend && npm run test:e2e
```

## Troubleshooting

### "vibhuvioio.com not found"
- Backend not running
- LDAP server not started
- config.yml missing

**Fix:**
```bash
cd backend
docker-compose up -d
python -m uvicorn app.main:app --reload
```

### "Port 5173 already in use"
```bash
# Kill existing process
lsof -ti:5173 | xargs kill -9
npm run dev
```

### Tests timeout
Increase timeout in playwright.config.ts:
```typescript
use: {
  timeout: 30000, // 30 seconds
}
```
