# Contributing to LDAP Manager

Bug reports, feature requests and pull requests are all welcome.

## Before you open an issue

Check the [documentation](https://vibhuvioio.com/ldap-manager/) and search
[existing issues](https://github.com/VibhuviOiO/ldap-manager/issues) first.

When reporting a bug, include:

- the LDAP Manager version (`docker inspect vibhuvioio/ldap-manager:latest` or the tag you run)
- your OpenLDAP version, and whether it is a single node or a replication cluster
- the relevant part of `config.yml`, **with passwords removed**
- what you expected, what happened, and any error from the browser console or
  the container logs (`docker logs <container>`)

Please do not paste bind passwords, TLS private keys or directory contents.

## Development setup

**Backend** — Python 3.11, and `python-ldap` needs system headers:

```bash
cd /path/to/ldap-manager/backend
sudo apt-get install -y libsasl2-dev libldap2-dev libssl-dev   # or brew equivalent
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt -r requirements-test.txt
python -m pytest tests/ -q
```

**Frontend** — Node 20:

```bash
cd /path/to/ldap-manager/frontend
npm ci
npx tsc --noEmit
npx vitest run tests/unit
npm run build
```

`npm ci` rather than `npm install`, so you build against the committed lockfile.

## What CI checks

Every push and pull request runs `.github/workflows/test.yml`:

| Job | Command |
|---|---|
| Backend | `pytest tests/ -q` |
| Frontend | `tsc --noEmit`, `npm run build`, `vitest run tests/unit` |
| Audit | `npm audit --omit=dev --audit-level=critical` |

Run the same commands locally before opening a pull request. If `pytest` or
`vitest` drops a test that was passing, that is a regression — not a flaky test
to re-run.

## Pull requests

- One concern per pull request. A dependency bump and a behaviour change are two
  pull requests, because a red CI run should name its own cause.
- Say **why** in the commit message, not only what changed.
- Add or update a test for a behaviour change. The unit suite is the only thing
  that catches a regression in this project — there is no integration harness.
- Update the docs in the [documentation repository](https://github.com/VibhuviOiO/vibhuvioio.github.io)
  when you change configuration, an environment variable or a default. A feature
  that exists but is undocumented is not finished.

## Scope

LDAP Manager targets **OpenLDAP only**. Active Directory, 389 Directory Server
and ApacheDS are out of scope: schema and ACL editing read OpenLDAP's `cn=config`,
which has no equivalent elsewhere. A pull request that adds a second directory
backend is unlikely to be merged, but open an issue and make the case.

The application is **config-only by design**. Clusters are declared in
`config.yml`; there is no API for adding clusters or storing credentials at
runtime, and there will not be one. This keeps bind passwords out of the database
and the application stateless.

## Licence

Contributions are accepted under the MIT licence, the same as the project.
