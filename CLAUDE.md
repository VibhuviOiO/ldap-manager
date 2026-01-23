# LDAP Manager - Project Context for Claude

## Project Overview

**LDAP Manager** is a production-grade web application for managing OpenLDAP servers. Single Docker container serves both React frontend and FastAPI backend.

## Technology Stack

| Component | Technology | Version |
|-----------|------------|---------|
| Frontend | React + TypeScript + Vite | React 18.2, Vite 5.0 |
| UI Library | shadcn/ui + Tailwind CSS | Tailwind 3.4 |
| State | Zustand + TanStack Query | Zustand 5, TQ 5.90 |
| Backend | FastAPI + Uvicorn | FastAPI 0.109 |
| LDAP Client | python-ldap | 3.4.4 |
| Testing | Playwright (E2E) + Vitest (Unit) | 95+ tests |
| CI/CD | GitHub Actions | Active |

## Project Structure

```
ldap-manager/
├── backend/app/
│   ├── main.py              # FastAPI entry, routes, static serving
│   ├── core/
│   │   ├── config.py        # YAML config loader (LDAPClusterConfig)
│   │   ├── ldap_client.py   # LDAP operations (connect, search, add, modify, delete)
│   │   └── password_cache.py # SHA256 password caching in /app/.cache/
│   └── api/
│       ├── clusters.py      # GET /list, /health/{name}, /form/{name}, /columns/{name}
│       ├── entries.py       # Search, create, update, delete LDAP entries
│       ├── connection.py    # POST /connect, GET /status
│       ├── monitoring.py    # Node sync, topology, replication testing
│       ├── password.py      # Password cache status
│       └── logs.py          # Activity logs from cn=Monitor
├── frontend/src/
│   ├── App.tsx              # Router, header, theme, error boundary
│   ├── components/
│   │   ├── Dashboard.tsx    # Cluster list + password dialogs
│   │   ├── ClusterDetails.tsx # Tabs: Directory, Users, Groups, OUs, Monitoring
│   │   ├── DirectoryTable.tsx # Paginated entry display
│   │   ├── DirectoryBrowser.tsx # Tree navigation
│   │   ├── MonitoringView.tsx # Node sync, topology visualization
│   │   ├── CreateUserDialog.tsx # No-code form from config
│   │   ├── EditUserDialog.tsx # Entry modification
│   │   └── ui/              # shadcn/ui components
│   ├── services/api/        # API client layer (ClusterService, EntryService, etc.)
│   ├── hooks/               # useClusterInfo, useConnect
│   ├── store/               # Zustand appStore (theme persistence)
│   └── types/               # TypeScript interfaces
├── frontend/tests/
│   ├── e2e/                 # Playwright E2E tests
│   ├── integration/         # Integration tests
│   └── unit/                # Vitest unit tests
├── docs/                    # Documentation (GitHub Pages)
├── config.example.yml       # Full config template
├── config.minimal.yml       # Minimal setup
├── Dockerfile              # Development build
├── Dockerfile.prod         # Multi-stage production build
├── docker-compose.yml      # Development with hot-reload
├── docker-compose.prod.yml # Production deployment
└── entrypoint.sh           # Container startup (Vite + uvicorn)
```

## Configuration System

**config.yml** defines LDAP clusters with:
- Single node: `host`, `port`
- Multi-node: `nodes: [{host, port}, ...]`
- Auth: `bind_dn`, `bind_password` (optional, can be entered at runtime)
- Features: `readonly`, `description`
- Custom forms: `user_creation_form` with field definitions
- Custom columns: `table_columns` for Users/Groups/OUs tables

**Auto-generation features:**
- `${uid}` - Template variable replacement
- `next_uid` - Auto-increment from 2000
- `days_since_epoch` - Days since 1970-01-01

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
