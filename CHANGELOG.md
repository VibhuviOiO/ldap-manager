# Changelog

Notable changes per release. Versions match the image tag on Docker Hub.

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
