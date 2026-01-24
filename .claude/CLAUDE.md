# LDAP Manager – Claude System Memory

## System Design
Single-container app serving React frontend + FastAPI backend for managing OpenLDAP clusters.

## Architecture
Browser → React UI → FastAPI API → LDAP servers (single or multi-master).

## Tech Stack
Frontend: React 18, TypeScript, Vite, shadcn/ui, Tailwind CSS  
State & Data: Zustand (UI state), TanStack Query (server cache)  
Backend: FastAPI, Python 3.11, Uvicorn  
Directory Protocol: LDAP v3 via python-ldap  
Testing: Playwright (E2E), Vitest (unit/integration)  
Packaging: Single Docker image, Docker Compose (dev/prod)  
CI/CD: GitHub Actions (build, test, publish)  
Docs: GitHub Pages (static markdown)

## Current Milestone
v1: Multi-cluster LDAP management, user/group CRUD, health monitoring, pagination.

## Core Constraints
- LDAP v3 compliant servers
- RFC 2696 pagination required for large directories
- Single Docker image deployment
- Config-driven behavior via config.yml

## Configuration System

config.yml is a declarative control plane defining:
- LDAP cluster topology (single-node or multi-master)
- Authentication and directory base
- Read-only and descriptive cluster metadata
- UI-driven user creation forms
- UI table column visibility for Users, Groups, and OUs

## Config Auto-Generation

Configuration supports runtime value resolvers:
- ${field} for template substitution
- next_uid for auto-incremented numeric IDs
- days_since_epoch for derived time-based values

## Project Structure (Semantic)

backend/app/ – FastAPI backend and LDAP integration  
backend/app/core/ – Config loading, LDAP client, password cache  
backend/app/api/ – REST endpoints (clusters, entries, monitoring)  

frontend/src/ – React application root  
frontend/src/components/ – Feature-level UI components  
frontend/src/services/ – Typed API clients  
frontend/src/hooks/ – React hooks for data/state  
frontend/src/store/ – Global UI state (Zustand)  
frontend/src/types/ – Shared TypeScript models  

docs/ – User and developer documentation  
config*.yml – LDAP cluster configuration  
docker* – Dev and production container setup

## Non-Goals (for Claude)
- Do not redesign architecture
- Do not introduce heavy external dependencies
- Do not convert to microservices








## Key API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/clusters/list` | GET | List all configured clusters |
| `/api/clusters/health/{name}` | GET | Check cluster health |
| `/api/connection/connect` | POST | Authenticate with LDAP |
| `/api/entries/search` | GET | Paginated entry search (RFC 2696) |
| `/api/entries/create` | POST | Create new LDAP entry |
| `/api/entries/update` | PUT | Modify entry attributes |
| `/api/entries/delete` | DELETE | Remove entry |
| `/api/monitoring/nodes` | GET | Node sync statistics |
| `/api/monitoring/topology` | GET | Replication topology |

## User Context & Preferences

**Deployment:** Self-hosted Docker on own servers
**Scale:** Medium directories (1K-10K entries)
**Group Schema:** `groupOfUniqueNames` with `uniqueMember` attribute
**TLS/SSL:** Mixed setup across clusters
**CI/CD:** GitHub Actions

## Development Goals

1. **SOLID Principles** - Production-grade backend code
2. **Testing Coverage** - Comprehensive unit tests + E2E tests
3. **Group Management** - Add/remove users from groups (groupOfUniqueNames)
4. **User Management** - Create/edit/delete users, password policies
5. **Monitoring** - Multi-master sync, health checks
6. **UI/UX** - Dashboard improvements, form enhancements
7. **Integrations** - LDAPS, StartTLS, new LDAP server support

## Docker Commands

```bash
# Development (hot-reload)
docker-compose up

# Production
docker-compose -f docker-compose.prod.yml up -d

# With context path
CONTEXT_PATH=/ldap-manager docker-compose -f docker-compose.prod.yml up -d
```

## Testing Commands

```bash
cd frontend
npm run test           # Unit tests (Vitest)
npx playwright test    # E2E tests (3 browsers)
```

## Key Files to Read First

1. [config.example.yml](config.example.yml) - Configuration structure
2. [backend/app/main.py](backend/app/main.py) - API routing
3. [backend/app/core/ldap_client.py](backend/app/core/ldap_client.py) - LDAP operations
4. [frontend/src/App.tsx](frontend/src/App.tsx) - React routing
5. [frontend/src/components/Dashboard.tsx](frontend/src/components/Dashboard.tsx) - Main UI entry

## Code Style Notes

- Backend: FastAPI with Pydantic models, async where beneficial
- Frontend: Functional React components, TypeScript strict mode
- UI: shadcn/ui components, Tailwind for styling
- Forms: React Hook Form with validation
- Data fetching: TanStack Query with caching
