# Security Policy

## Supported versions

| Version | Supported |
| ------- | --------- |
| 1.1.x   | ✅ |
| 1.0.x   | ❌ |

## Reporting a vulnerability

**Please do not open a public issue for a security problem.**

Use GitHub's private reporting, which keeps the report confidential until a fix is
published:

**→ [Report a vulnerability](https://github.com/VibhuviOiO/ldap-manager/security/advisories/new)**

If you cannot use that, email the maintainer listed in `Chart.yaml`, or open a minimal
public issue that says only that you have a security report and asks for a private
channel — never the details.

## What to expect

| Stage | Target |
| ----- | ------ |
| Acknowledgement | 3 business days |
| Initial assessment | 7 days |
| Fix or mitigation | 30 days for high and critical |

We will credit you in the advisory unless you ask us not to.

## Scope

**In scope**

- The application (`backend/`, `frontend/`) and the published image
  `vibhuvioio/ldap-manager`
- Authentication, authorisation and session handling (`auth.mode` in all three modes)
- Credential handling — how cluster bind passwords are stored and resolved
- The published Helm chart, where a default is insecure
- Anything that lets a `readonly` user act as `readwrite` or `admin`

**Out of scope**

- OpenLDAP itself — report those upstream
- The `openldap-docker` image and the `openldap` chart (separate repositories)
- Findings that require an already-compromised host
- Missing hardening headers with no demonstrated impact
- Outdated dependencies with no reachable path from this application

## Design notes relevant to reports

A few properties are deliberate. Please don't report them as vulnerabilities:

- **`auth.mode: none` serves anonymous requests** at the operator-configured
  `auth.default_role`. That is the documented behaviour, and it is why `default_role` is
  not user-selectable — allowing a user to pick their own role would be privilege
  escalation.
- **The application never writes `config.yml`.** Credentials come from the environment,
  a file, or the config file. There is no runtime credential API, so a request cannot
  change which password the server uses.
- **Credential resolution is server-side.** Bind passwords are never returned to the
  browser — only whether one is configured.
- **The capability probe is read-only** and degrades rather than failing: it reports
  `unknown` when it cannot determine a server feature, and never assumes.

## Verifying a release

Every image is built from source in GitHub Actions and published to Docker Hub and GHCR:

```bash
docker pull vibhuvioio/ldap-manager:1.1.0
docker run --rm --entrypoint sh vibhuvioio/ldap-manager:1.1.0 -c 'ls /app/app/api/'
```

