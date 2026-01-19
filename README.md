# LDAP Manager

Modern web-based management interface for OpenLDAP servers with React + TypeScript frontend and FastAPI Python backend.

![License](https://img.shields.io/badge/license-MIT-green)
![Docker](https://img.shields.io/badge/docker-ready-blue)

## Features

### 🎯 Core Functionality
- **Multi-cluster Management** - Manage multiple LDAP servers from single interface
- **Server-side Pagination** - Efficient handling of large directories (LDAP RFC 2696)
- **Server-side Search** - Fast LDAP filter-based search across uid, cn, mail, sn
- **Password Caching** - Secure SHA256-hashed password storage for shared access
- **Auto-discovery** - Automatic base DN detection from LDAP rootDSE

### 📊 Directory Management
- **Users View** - Browse and search user entries with custom schema support
- **Groups View** - Manage groupOfNames, groupOfUniqueNames, posixGroup
- **Organizational Units** - Navigate OU hierarchy
- **All Entries** - Complete directory tree view

### 🔍 Advanced Features
- **Custom Schema Support** - Automatically detects and displays custom objectClasses
- **Entity-specific Tables** - Tailored columns for Users/Groups/OUs
- **Health Monitoring** - Real-time cluster health status
- **Activity Logs** - View LDAP operation logs with search examples

### 🎨 Modern UI
- React 18 + TypeScript
- shadcn/ui components
- Responsive design
- Green theme (customizable)

## Quick Start

### Prerequisites
- Docker 20.10+
- Docker Compose 2.0+
- OpenLDAP server (local or remote)

### 1. Clone Repository
```bash
git clone https://github.com/your-org/ldap-manager.git
cd ldap-manager
```

### 2. Configure Clusters
```bash
cp config.example.yml config.yml
nano config.yml
```

Example configuration:
```yaml
clusters:
  - name: "Production LDAP"
    host: "ldap.example.com"
    port: 389
    bind_dn: "cn=Manager,dc=example,dc=com"

  - name: "Development LDAP"
    host: "localhost"
    port: 389
    bind_dn: "cn=admin,dc=dev,dc=local"
```

### 3. Start Application
```bash
docker-compose up -d
```

### 4. Access UI
Open browser: `http://localhost:5173`

## Configuration

### Cluster Configuration (`config.yml`)

#### Single Node
```yaml
clusters:
  - name: "My LDAP Server"
    host: "ldap.company.com"
    port: 389
    bind_dn: "cn=Manager,dc=company,dc=com"
    base_dn: "dc=company,dc=com"  # Optional - auto-discovered if omitted
```

#### Multi-Master Cluster
```yaml
clusters:
  - name: "LDAP Cluster"
    nodes:
      - host: "ldap1.company.com"
        port: 389
      - host: "ldap2.company.com"
        port: 389
      - host: "ldap3.company.com"
        port: 389
    bind_dn: "cn=Manager,dc=company,dc=com"
```

#### Docker Host Connection
For connecting to LDAP running on Docker host:
```yaml
clusters:
  - name: "Local Docker LDAP"
    host: "host.docker.internal"  # Docker Desktop
    # host: "172.17.0.1"          # Linux Docker
    port: 389
    bind_dn: "cn=Manager,dc=example,dc=com"
```

### Environment Variables

Create `.env` file (optional):
```bash
FRONTEND_PORT=5173
BACKEND_PORT=8000

# Customize footer text (HTML allowed)
VITE_FOOTER_TEXT='LDAP Manager • Built by <a href="https://vibhuvioio.com" target="_blank" class="text-primary hover:underline">Vibhuvi OiO</a>'
```

## Usage

### First Time Setup
1. Open `http://localhost:5173`
2. Click on cluster name
3. Enter admin password when prompted
4. Password is cached (SHA256 hashed) for all users

### Search
- Type in search box to filter by username, name, email, or surname
- Search is performed server-side using LDAP filters
- Results update in real-time

### Pagination
- Default: 10 entries per page
- Navigate with Previous/Next buttons
- Server-side pagination reduces LDAP load

### Custom Schemas
LDAP Manager automatically detects custom objectClasses:
- Filters out standard classes (top, person, inetOrgPerson, etc.)
- Displays custom schema name in "Object Class" column
- Shows custom attributes in "Details" column

## Architecture

```
┌─────────────┐      ┌──────────────┐      ┌─────────────┐
│   Browser   │─────▶│  Frontend    │      │   Backend   │
│             │      │  React + TS  │◀────▶│   FastAPI   │
│  Port 5173  │      │  shadcn/ui   │      │   Python    │
└─────────────┘      └──────────────┘      └──────┬──────┘
                                                   │
                                                   │ python-ldap
                                                   ▼
                                            ┌─────────────┐
                                            │  OpenLDAP   │
                                            │   Server    │
                                            └─────────────┘
```

### Technology Stack

**Frontend:**
- React 18
- TypeScript
- Vite
- shadcn/ui (Radix UI + Tailwind CSS)
- Axios
- React Router

**Backend:**
- FastAPI (Python 3.11+)
- python-ldap
- PyYAML
- Uvicorn

## API Endpoints

### Entries
- `GET /api/entries/search?cluster=<name>&page=1&page_size=10&search=<query>&filter_type=users`

### Monitoring
- `GET /api/monitoring/health?cluster=<name>`

### Connection
- `POST /api/connection/test` - Test LDAP connection
- `POST /api/connection/connect` - Connect and cache password

### Password Cache
- `GET /api/password/check?cluster=<name>&bind_dn=<dn>`

## Development

### Local Development Setup

#### Backend
```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

#### Frontend
```bash
cd frontend
npm install
npm run dev
```

### Testing

#### E2E Testing with Playwright

The project includes comprehensive end-to-end tests covering:
- Dashboard navigation
- Cluster details and views
- User creation with custom schemas
- Column settings and preferences
- Complete user lifecycle (create → verify → delete)

**Setup:**
```bash
cd frontend
npm install
npx playwright install  # Install browsers
```

**Run Tests:**
```bash
# Run all tests (Chrome, Firefox, Safari)
npx playwright test

# Run specific browser
npx playwright test --project=chromium
npx playwright test --project=firefox
npx playwright test --project=webkit

# Run with UI (interactive mode)
npx playwright test --ui

# Run in headed mode (see browser)
npx playwright test --headed

# Run specific test file
npx playwright test user-lifecycle.spec.ts

# View HTML report
npx playwright show-report
```

**Test Coverage:**
- ✅ 95 tests across 3 browsers (100% pass rate)
- Dashboard: Cluster listing, navigation (5 tests)
- Cluster Details: View switching, search, pagination (8 tests)
- User Creation: Form validation, custom fields, dropdowns (7 tests)
- Column Settings: Show/hide columns, localStorage persistence (4 tests)
- User Lifecycle: Full E2E create → verify → delete flow (3 tests)
- User Edit: Field updates, validation, disabled fields (11 tests)
- Password Change: Policy validation, confirmation, shadowLastChange update (11 tests)
- Complete Lifecycle: Create → edit → password change → delete (5 tests)

**Test Organization:**
```
frontend/tests/e2e/
├── dashboard.spec.ts                # Dashboard page tests (5)
├── cluster-details.spec.ts          # Cluster view tests (8)
├── user-creation.spec.ts            # Form UI tests (7)
├── user-creation-simple.spec.ts     # Form validation only (3)
├── column-settings.spec.ts          # Column preferences (4)
├── user-lifecycle.spec.ts           # Full E2E lifecycle (3)
├── user-edit.spec.ts                # Edit functionality (11)
├── password-change.spec.ts          # Password change (11)
└── user-lifecycle-complete.spec.ts  # Complete workflow (5)
```

See [TESTING.md](docs/TESTING.md) for detailed testing guide.

### Project Structure
```
ldap-manager/
├── backend/
│   ├── app/
│   │   ├── api/          # API endpoints
│   │   ├── core/         # LDAP client, config
│   │   └── main.py       # FastAPI app
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── components/   # React components
│   │   ├── lib/          # Utilities
│   │   └── App.tsx
│   └── package.json
├── config.yml            # Cluster configuration
└── docker-compose.yml
```

## Security

### Password Storage
- Passwords cached using SHA256 hashing
- Cache files stored in `/app/.cache/` (container only)
- Never logged or transmitted in plain text

### Best Practices
- Use read-only LDAP accounts when possible
- Enable TLS/SSL for production (ldaps://)
- Restrict network access to LDAP Manager
- Regular password rotation
- Use strong bind DN passwords

### Clear Password Cache
```bash
docker exec ldap-manager rm -rf /app/.cache/
docker-compose restart
```

## Troubleshooting

### Cannot Connect to LDAP
```bash
# Check backend logs
docker-compose logs ldap-manager

# Test LDAP connectivity from container
docker exec ldap-manager ldapsearch -x -H ldap://your-ldap-host:389 -b "" -s base
```

### Password Not Working
- Verify bind DN format: `cn=Manager,dc=example,dc=com`
- Check LDAP server logs for authentication errors
- Clear password cache and re-enter

### Port Already in Use
```bash
# Change ports in docker-compose.yml
ports:
  - "5174:5173"  # Frontend
  - "8001:8000"  # Backend
```

## Compatible LDAP Servers

- ✅ OpenLDAP 2.4+
- ✅ OpenLDAP 2.6+
- ✅ 389 Directory Server
- ✅ ApacheDS
- ✅ Any RFC 4511 compliant LDAP server

## Recommended Companion

For containerized OpenLDAP deployment, see:
[openldap-docker](https://github.com/your-org/openldap-docker)

## Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

## License

MIT License - See [LICENSE](LICENSE) file

## Support

- 📖 [Documentation](docs/)
- 🐛 [Issue Tracker](https://github.com/your-org/ldap-manager/issues)
- 💬 [Discussions](https://github.com/your-org/ldap-manager/discussions)

## Roadmap

- [x] User creation with custom schemas
- [x] Dynamic form configuration (YAML-driven)
- [x] Column customization and preferences
- [x] E2E testing with Playwright (95 tests, 100% pass)
- [x] User editing (all fields except uid/uidNumber)
- [x] Password change with configurable policy
- [x] Full name display (first + last name)
- [x] Actions column (change password, edit, delete)
- [ ] Bulk operations
- [ ] LDIF import/export
- [ ] Advanced search filters
- [ ] Audit logging
- [ ] Multi-language support
- [ ] Dark mode
- [ ] Mobile app

---

**Made with ❤️ for the LDAP community**
