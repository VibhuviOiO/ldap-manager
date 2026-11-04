# Changelog

Notable changes per release. Versions match the image tag on Docker Hub.

## 1.2.0

### Security

- **Path traversal in the static SPA route (fixed).** The catch-all no longer joins request
  input into a filesystem path; root-level bundle files are served from a startup allowlist,
  so `../` and absolute paths cannot read outside the bundle.
- **LDIF editor XSS hardening.** Highlighted markup is passed through DOMPurify before it is
  injected as HTML.
- **LDAP injection hardening. Breaking:** the unused `POST /api/entries/search` passthrough
  was removed - it accepted a caller-supplied bind DN/password and a raw LDAP filter. The UI
  uses `GET /api/entries/search`, which escapes search terms. The login username is escaped as
  an RDN, and group-lookup filter values use `ldap.filter.escape_filter_chars`.
- **Less error disclosure.** `/health`, cluster health, the replication test and LDIF import
  return generic errors; exception detail stays in the server log. Key-generation logs no
  longer include the secrets path, and user-controlled log fields are stripped of CR/LF/NUL.

### Fixed

- **`/health` was unreachable when the UI was bundled.** The SPA catch-all was registered
  before the health route, so `/health` returned `index.html` with 200 and the compose
  healthcheck could never detect a failing backend. Static serving is now registered last.
- Stale frontend unit tests fixed; the Vitest suite is green (73 tests).

### Changed

- Backend: FastAPI 0.109.1 -> 0.162.0, uvicorn 0.27.0 -> 0.54.0, pydantic 2.5.3 -> 2.14.1,
  websockets 12.0 -> 17.1, python-ldap 3.4.4 -> 3.4.8, python-multipart 0.0.20 -> 0.0.32,
  PyYAML 6.0.1 -> 6.0.3.
- Frontend: TypeScript 5.9 -> 7.0.2 (the removed `baseUrl` option was dropped), lucide-react
  0.309 -> 1.49, tailwind-merge 2.6 -> 3.7, plus the npm minor/patch group.
- CI: added a test workflow (backend pytest, frontend typecheck/build/unit, advisory audit),
  CodeQL and Dependabot, and bumped the GitHub Actions to their current majors.
- Docs: `SECURITY.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md` and issue templates.

## 1.1.0

### Added

- **Authentication.** Three modes: `none` (anonymous traffic at a configured
  `default_role`), `local` (accounts stored in the container), and `ldap` (binds as the user's
  own DN, so no cluster-wide bind secret is needed to log in).
- **Role-based access.** `readonly`, `readwrite` and `admin`, enforced server-side on every
  route. Directory groups map to roles with the highest matching group winning.
- **LDIF editor.** Validate is a dry run; Apply writes and is admin-only.
- **Schema editor.** Read and write `cn=schema` through `cn=config`.
- **ACI editor.** Manage `olcAccess` per database.
- **Audit log.** Who changed what, on the data volume, with filters.
- **Capability detection.** The app probes for `cn=Monitor`, `accesslog` and `cn=config`, and
  shows the enablement LDIF in the UI when a feature is missing rather than erroring.
- **TLS / LDAPS** with certificate verification.
- **KPI dashboard** with per-cluster composition and TLS state.
- **Helm chart** published separately, with a `values.schema.json`.

### Changed

- Clusters are defined in `config.yml` only. **Breaking:** the runtime cluster and credential
  APIs are gone, along with `source: stored` and `source: prompt`. Bind passwords now come from
  the environment, a file, or the config file.
- `python-multipart` 0.0.6 to 0.0.20 and `fastapi` 0.109.0 to 0.109.1 (CVE-2024-24762,
  CVE-2024-53981).

### Fixed

- `HTTPException` was swallowed by a generic handler, so 404, 401 and 403 surfaced as 400 or
  500. Any client branching on status code was misled.
- `${uid}` auto-generation crashed on list-valued attributes, and silently never ran.
- TLS context was shared across parallel clusters; a verification failure on one cluster could
  affect another. TLS setup is now serialised.

## 1.0.0

Initial published image.
