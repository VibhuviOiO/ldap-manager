# LDAP Manager - 📖 [Docs](https://vibhuvioio.com/ldap-manager/)

[![GitHub Stars](https://img.shields.io/github/stars/VibhuviOiO/ldap-manager?style=flat&logo=github)](https://github.com/VibhuviOiO/ldap-manager)
[![License](https://img.shields.io/github/license/VibhuviOiO/ldap-manager?style=flat)](https://github.com/VibhuviOiO/ldap-manager/blob/main/LICENSE)
[![Docker Pulls](https://img.shields.io/docker/pulls/vibhuvioio/ldap-manager?style=flat&logo=docker)](https://hub.docker.com/r/vibhuvioio/ldap-manager)
[![Build](https://img.shields.io/github/actions/workflow/status/VibhuviOiO/ldap-manager/docker-publish.yml?label=build&logo=githubactions&logoColor=white)](https://github.com/VibhuviOiO/ldap-manager/actions/workflows/docker-publish.yml)

Modern web-based management interface for OpenLDAP servers with a React + TypeScript frontend and FastAPI Python backend.

<table>
  <tr>
    <td width="50%">
      <img src="https://vibhuvioio.com/img/ldap-manager/1ldap-cluster-home.png" alt="LDAP Manager" width="100%">
    </td>
    <td width="50%">
      <img src="https://vibhuvioio.com/img/ldap-manager/ldap-monitoring-multi-node.png" alt="Directory Data" width="100%">
    </td>
  </tr>
  <tr>
    <td align="center"><b>LDAP Manager</b></td>
    <td align="center"><b>Directory Data</b></td>
  </tr>

  <tr>
    <td width="50%">
      <img src="https://vibhuvioio.com/img/ldap-manager/3ldap-users.png" alt="Users" width="100%">
    </td>
    <td width="50%">
      <img src="https://vibhuvioio.com/img/ldap-manager/4ldap-groups.png" alt="Groups" width="100%">
    </td>
  </tr>
  <tr>
    <td align="center"><b>Users</b></td>
    <td align="center"><b>Groups</b></td>
  </tr>
</table>

## Features

**Directory**
- **DIT tree browser** - Lazy-loaded tree of the whole directory; inspect any entry's attributes
- **Entry management** - Create, edit, change passwords, manage group membership, delete
- **Bulk operations** - Select many entries and set an attribute, add them to a group, or delete
- **LDIF editor** - Syntax-highlighted, with Validate (dry run) and Apply; supports add, modify and delete
- **Export** - Download any filtered view as CSV, or the full directory as LDIF

**Schema and security**
- **Schema editor** - Browse and edit `olcAttributeTypes` / `olcObjectClasses` in `cn=schema`
- **ACI editor** - Read and edit `olcAccess` rules per database, in evaluation order
- **Role-aware UI** - `readonly`, `readwrite` and `admin` see different controls (see [Roles](#roles-and-what-they-see))

**Operational**
- **Multi-cluster** - Many LDAP servers from one interface, file-owned or UI-owned
- **Replication topology** - Animated syncRepl view plus a per-node table
- **TLS / LDAPS** - `ldaps`, StartTLS, CA and client-certificate verification per cluster
- **Health monitoring** - Live cluster and node health
- **Authentication** - `none`, `local` or `ldap`, with per-user and per-group roles
- **Server-side pagination & search** - Efficient on large directories (RFC 2696)

## Quick Start

### System Requirements

| Resource | Minimum | Recommended | Production (High Traffic) |
|----------|---------|-------------|---------------------------|
| CPU      | 1 core  | 2 cores     | 4 cores                   |
| RAM      | 512 MB  | 1 GB        | 2 GB                      |
| Disk     | 500 MB  | 1 GB        | 2 GB                      |

### Docker Run (Fastest)

```bash
# Download the config template
wget https://raw.githubusercontent.com/VibhuviOiO/ldap-manager/main/config.example.yml -O config.yml

# Edit config with your LDAP details
nano config.yml

# Run the Docker Hub image
docker run -d \
  --name ldap-manager \
  -p 8000:8000 \
  -v $(pwd)/config.yml:/app/config.yml:ro \
  vibhuvioio/ldap-manager:latest

# Access the UI at http://localhost:8000
```

### Docker Compose (Recommended)

```bash
# Download the production compose file and config template
wget https://raw.githubusercontent.com/VibhuviOiO/ldap-manager/main/docker-compose.prod.yml
wget https://raw.githubusercontent.com/VibhuviOiO/ldap-manager/main/config.example.yml -O config.yml

# Edit config with your LDAP details
nano config.yml

# Start the application
docker compose -f docker-compose.prod.yml up -d

# Access the UI at http://localhost:8000
```

> **Registry note:** The primary image is hosted on Docker Hub at `vibhuvioio/ldap-manager`. The same image is also available on GHCR at `ghcr.io/vibhuvioio/ldap-manager` if you prefer GitHub's registry.

## Configuration

### Basic Setup (`config.yml`)

```yaml
clusters:
  - name: "Production LDAP"
    host: "ldap.example.com"
    port: 389
    bind_dn: "cn=Manager,dc=example,dc=com"
```

### Authentication

Sign-in to LDAP Manager is your choice. Set `auth.mode`:

| mode | behaviour |
|------|-----------|
| `none` | No login. Use when nginx / oauth2-proxy / your SSO already authenticates users. Visitors get `auth.default_role`, **readonly by default**. |
| `local` | Built-in accounts with no external integration. On first start the UI shows a one-time wizard to create an admin, plus optional operator and viewer accounts. Passwords are hashed with scrypt and stored encrypted. |
| `ldap` | **One of your clusters authenticates your users**; the rest stay clusters to manage. Users sign in with their own directory password, so no cluster-wide bind secret is needed to log in. Their role comes from LDAP group membership. |

Three roles: **readonly** (browse, monitoring), **readwrite** (also create/edit/delete entries),
**admin** (also clusters, credentials and backups).

> With no `auth:` block the app runs in `none` mode with the `readonly` default role, so it is
> view-only. To keep full access behind your own proxy, set `auth.default_role: admin`.

```yaml
auth:
  mode: ldap
  default_role: readonly        # for mode: none
  session:
    lifetime_hours: 12
  ldap:
    cluster: "Production LDAP"  # which cluster authenticates
    user_dn_template: "uid={username},ou=People,dc=example,dc=com"
    user_base_dn: "dc=example,dc=com"
    role_map:
      default: readonly
      groups:                   # member, uniqueMember and memberUid all work
        "cn=ldap-admins,ou=Group,dc=example,dc=com": admin
        "cn=ldap-ops,ou=Group,dc=example,dc=com": readwrite
```

**How a role is decided, per mode**

| mode | who you are | where the role comes from |
|------|-------------|---------------------------|
| `none` | everyone (no login) | `auth.default_role` — a single, operator-set role |
| `local` | a built-in account | that account's `role`, set when the account is created |
| `ldap` | a directory user (binds with their own password) | the first matching group in `auth.ldap.role_map.groups`; if none match, `role_map.default`. When several groups match, the **highest** role wins |

`auth.default_role` is deliberately **not** selectable in the UI. Letting an anonymous
visitor choose "admin" would be privilege escalation, not a feature. The header badge
always shows which role is in force and where it came from.

In `local` and `ldap` mode a login is **required** — anonymous requests get
`401 Authentication required` even for reads. Only `none` serves anonymous traffic.

### Roles and what they see

| capability | readonly | readwrite | admin |
|---|:--:|:--:|:--:|
| Browse, DIT tree, search, export CSV | ✅ | ✅ | ✅ |
| Monitoring, topology, activity | ✅ | ✅ | ✅ |
| Schema and ACI viewing | ✅ | ✅ | ✅ |
| LDIF editor: Validate (dry run) | — | ✅ | ✅ |
| Create / edit / delete entries | — | ✅ | ✅ |
| Bulk set attribute, bulk group add, bulk delete | — | ✅ | ✅ |
| LDIF editor: **Apply** | — | ✅ | ✅ |
| Add / remove schema definitions | — | — | ✅ |
| Add / remove `olcAccess` rules | — | — | ✅ |
| Cluster management, backups, local users | — | — | ✅ |

Controls a role cannot use are hidden or disabled, and every check is enforced again
server-side — the UI is a convenience, not the boundary.

### TLS / LDAPS

Per cluster, so a plaintext lab and a hardened production directory can coexist:

```yaml
clusters:
  - name: "secure"
    host: "ldap.example.com"
    port: 636
    bind_dn: "cn=admin,dc=example,dc=com"
    base_dn: "dc=example,dc=com"
    tls:
      mode: ldaps          # none (default) | ldaps | starttls
      ca_file: /certs/ca.crt
      verify: true         # false accepts any certificate - lab only
      # cert_file: /certs/client.crt   # mutual TLS
      # key_file: /certs/client.key
```

- The certificate paths are **inside the container**, so mount them:
  `-v ./certs:/certs:ro`.
- `mode: ldaps` with a configured port of `389` is raised to `636` (logged), since 389 is
  the plaintext default. Set `port` explicitly to use something else.
- `mode: starttls` connects on `ldap://` and upgrades before binding.
- A failed certificate check reports which settings were in play, e.g.
  `LDAP connection failed: ... certificate verify failed [TLS mode 'ldaps', CA /certs/ca.crt, certificate verification ON]`.

TLS applies to **every** connection the app opens - entries, monitoring, schema, ACI,
backup, LDIF and LDAP authentication.

### Schema and ACI editing (`cn=config`)

The schema and ACI editors read and write `cn=schema,cn=config` and `olcAccess`. The data
bind DN normally **cannot** see `cn=config`, so those clusters need a second credential:

```yaml
    config:
      bind_dn: "cn=config"
      credential:
        source: env          # LDAP_MANAGER_CONFIG_<CLUSTER>_PASSWORD
```

Without this block the editors return a clear "no cn=config credential" message and the
rest of the app is unaffected. Both editors are admin-only; a bad schema definition is
rejected by the directory, while `olcAccess` is the one place a wrong change can lock
people out - the UI warns before applying.

### Cluster credentials

Each cluster's bind password is read from wherever you supply it. LDAP Manager
never stores a password: there is no runtime credential cache, and no UI or API
writes one.

```yaml
clusters:
  - name: "Production LDAP"
    # ...
    credential:
      source: env   # env | file | config
```

| source | where the password lives |
|--------|--------------------------|
| `env` (default) | An environment variable, default `LDAP_MANAGER_CLUSTER_<NAME>_PASSWORD` |
| `file` | A mounted secret file (Docker/Kubernetes secret) |
| `config` | Plaintext `bind_password` in `config.yml` (logged as a warning) |

### Clusters come from config.yml

Clusters are declared only in `config.yml`. The app reads that file on the next
request after an edit, so there is **no restart** and no way to change a cluster
from the browser:

```yaml
clusters:
  - name: "Production LDAP"
    host: "ldap.example.com"
    bind_dn: "cn=admin,dc=example,dc=com"
    base_dn: "dc=example,dc=com"
```

`config.yml` stays operator-owned and is **never written to** by the app.

```bash
docker run -d --name ldap-manager -p 8000:8000 \
  -v $PWD/config.yml:/app/config.yml:ro \
  vibhuvioio/ldap-manager:latest
```

`/app/.data` is still used for the audit log, but no cluster definition or
password is ever written there.

### Validating the configuration

Check `config.yml` before starting the app. Exit code is 0 when valid, 1 when not,
so it also works in CI or as a pre-flight step:

```bash
# inside the running container
docker exec ldap-manager python -m app.cli validate

# or against any file, without starting the app
docker run --rm -v "$PWD/config.yml:/app/config.yml:ro" \
  vibhuvioio/ldap-manager python -m app.cli validate

# also try to bind to each cluster (needs network access to your LDAP)
docker exec ldap-manager python -m app.cli validate --check-connections

# machine-readable, for CI
docker exec ldap-manager python -m app.cli validate --json
```

It checks the cluster schema, duplicate names, `host`/`nodes` exclusivity, node
ports, the form builder, each cluster's credential source (including whether an
`env` variable or secret `file` is actually present), and the `auth` block —
including that `auth.ldap.cluster` names a cluster that exists.

Warnings do not fail the run. Advisory examples:

```
warn  auth.mode is 'none' with default_role 'readonly': the app is READ-ONLY. ...
warn  Cluster 'prod': $LDAP_MANAGER_CLUSTER_PROD_PASSWORD is not set in this environment
warn  Cluster 'prod': password stored in PLAINTEXT in config.yml - prefer 'env' or 'file'
```

### Backup

Admins can download a cluster's directory as LDIF from the cluster card, or directly:

```bash
curl -b cookie.txt -O -J http://localhost:8000/api/backup/Production%20LDAP
# ?scope=one&base_dn=ou=People,dc=example,dc=com   narrower export
# ?operational=true                                include operational attributes
```

The export is paged, base64-encodes binary attributes, and re-imports with `ldapadd`.

### Multi-Master Cluster

```yaml
clusters:
  - name: "LDAP Cluster"
    nodes:
      - host: "ldap1.company.com"
        port: 389
      - host: "ldap2.company.com"
        port: 389
    bind_dn: "cn=Manager,dc=company,dc=com"
```

### Context Path (for integration)

```bash
# Production
CONTEXT_PATH=/ldap-manager docker compose -f docker-compose.prod.yml up -d

# Development
CONTEXT_PATH=/ldap-manager docker compose up
```

## Documentation

- 📖 [Full Documentation](https://vibhuvioio.com/ldap-manager/)
- ⚙️ [Configuration Guide](https://vibhuvioio.com/ldap-manager/configuration.html)
- 🧪 [Testing Guide](https://vibhuvioio.com/ldap-manager/testing.html)
- 🛠️ [Development Setup](https://vibhuvioio.com/ldap-manager/development.html)
- 🔧 [Context Path Setup](https://vibhuvioio.com/ldap-manager/configuration.html#context-path-configuration)

## Technology Stack

**Frontend:** React 18, TypeScript, Vite, shadcn/ui, Tailwind CSS  
**Backend:** FastAPI, Python 3.11+, python-ldap, PyYAML

## Development

```bash
# Backend
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# Frontend
cd frontend
npm install
npm run dev
```

### Iterating without rebuilding the image

`docker build` takes minutes; a change should take seconds. Mount the working tree
and let uvicorn reload:

```bash
docker run -d --name ldap-dev --network ldap-shared-network -p 8000:8000 \
  -v "$PWD/backend/app:/app/app" \
  -v "$PWD/config.yml:/config.yml:ro" \
  -v ldap-manager-data:/app/.data -v ldap-manager-secrets:/app/.secrets \
  -e LDAP_MANAGER_CONFIG=/config.yml \
  -e LDAP_MANAGER_CLUSTER_EXAMPLE_PASSWORD='...' \
  ldap-manager:auth uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Backend edits reload automatically. For the frontend, rebuild the bundle into the
served directory - about five seconds, still no image build:

```bash
cd frontend && npm run build && cp -r dist/* ../backend/app/static/
```

> **Mount `config.yml` outside `/app`.** When `/app` is a bind mount of `backend/`,
> also mounting `config.yml` at `/app/config.yml` collides with it and Docker refuses
> to start the container. Put it at `/config.yml` and set `LDAP_MANAGER_CONFIG`.

> **Stale UI?** `index.html` is served `no-cache` and content-hashed assets are
> `immutable`, so a reload always picks up a new build. If you still see an old
> interface, you are running an old **image** or **container** - rebuild or recreate
> it. `curl -s <url>/ | grep -o 'assets/index-[^\"]*\.js'` shows which bundle is being
> served.

## Testing

Two automated suites:

- **Backend:** pytest in `backend/tests/`
- **Frontend:** Playwright in `frontend/tests/e2e/`

### Deployment audit

`frontend/tests/e2e/audit/` checks a **running** instance rather than the dev server:
every view loads, makes no failing API calls, and renders the controls the current role
should see. It writes a screenshot per view to `test-results/screenshots/`, so a change
can be reviewed without opening a browser.

```bash
cd frontend
AUDIT_BASE_URL=http://localhost:8000 \
AUDIT_CLUSTER=vibhuvioio \
EXPECTED_ROLE=admin EXPECTED_CAN_WRITE=true \
npx playwright test -c playwright.audit.config.ts
```

### RBAC across every auth mode

One command deploys the app in each auth mode and asserts that role's permissions -
`none` (admin and readonly), `local` (admin, readwrite, readonly) and `ldap` (same three,
resolved from group membership). The containers mount the working tree, so it always
tests current code:

```bash
./scripts/e2e-auth-matrix.sh
```

Each scenario starts a throwaway container, runs `rbac.spec.ts` with `EXPECTED_ROLE`,
captures screenshots, and tears it down; the script prints a pass/fail line per mode and
leaves the full logs behind.

```bash
# Backend tests
cd backend
pytest

# Frontend E2E tests (dev server)
cd frontend
npm install
npx playwright install
npx playwright test
```

## Security

- Bind passwords are read from `env`, a mounted secret `file`, or `config` — never stored by the app
- Built-in login accounts are hashed with scrypt; their encryption key lives in `/app/.secrets/` with `0600` permissions
- Use read-only LDAP accounts when possible
- Enable TLS/SSL for production (`ldaps://`)

## Compatible LDAP Servers

✅ **Tested**: OpenLDAP 2.4+, OpenLDAP 2.6+

🔄 **Should work** (RFC 4511 compliant): 389 Directory Server, ApacheDS, Active Directory

**Requirements**: LDAP v3 protocol, RFC 2696 (paged results) support recommended for large directories

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

MIT License - See [LICENSE](LICENSE) file

## Support

- 📖 [Documentation](https://vibhuvioio.com/ldap-manager/)
- 🐛 [Issue Tracker](https://github.com/VibhuviOiO/ldap-manager/issues)
- 💬 [Discussions](https://github.com/VibhuviOiO/ldap-manager/discussions)

---

**Developed by [Vibhuvi OiO](https://vibhuvioio.com)**
