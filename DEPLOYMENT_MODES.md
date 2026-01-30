# LDAP Manager Deployment Modes

## Overview

LDAP Manager supports three deployment modes to suit different security requirements and environments:

1. **Mode 1: Keycloak Authentication** (Recommended for Production)
2. **Mode 2: No Authentication + Read-Only** (Public Dashboards)
3. **Mode 3: No Authentication + Full Access** (Trusted Networks)

---

## Mode 1: Keycloak Authentication

### Description

Full authentication with role-based access control (RBAC) via Keycloak.

### Use Cases

- Production environments
- Multi-user deployments
- External access (internet-facing)
- Compliance requirements (audit trail)
- Corporate networks with existing Keycloak

### Features

✅ User authentication required
✅ Role-based access control (admin, editor, viewer, auditor)
✅ Audit trail with username tracking
✅ Admin-only LDAP password configuration
✅ Secure JWT token validation
✅ Automatic token refresh

### Configuration

```bash
# .env
AUTH_MODE=keycloak
READONLY_MODE=false  # Ignored in keycloak mode
KEYCLOAK_URL=http://keycloak:8080
KEYCLOAK_ISSUER=http://localhost:8080/realms/ldap-manager
KEYCLOAK_REALM=ldap-manager
KEYCLOAK_CLIENT_ID=ldap-manager-client
```

### Docker Compose

```bash
# Start with Keycloak
docker-compose up -d

# Access the app
open http://localhost:5173

# Login with test users:
# - admin / admin123 (full access + LDAP config)
# - editor / editor123 (read + write)
# - viewer / viewer123 (read-only)
# - auditor / auditor123 (logs only)
```

### Role Permissions

| Role | LDAP Config | View | Create | Edit | Delete | Logs |
|------|-------------|------|--------|------|--------|------|
| **Admin** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Editor** | ❌ | ✅ | ✅ | ✅ | ❌ | ❌ |
| **Viewer** | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Auditor** | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ |

### Security Notes

- LDAP passwords configured by admin only
- All users share the admin-configured LDAP connection
- Non-admin users never see LDAP passwords
- JWT tokens expire after 15 minutes (auto-refresh)
- Refresh tokens valid for 7 days

---

## Mode 2: No Authentication + Read-Only

### Description

No login required. All users have viewer-level access (read-only).

### Use Cases

- Public monitoring dashboards
- Network operations center (NOC) displays
- Read-only directory browsers
- Compliance reporting (view-only)
- Kiosks or shared screens

### Features

✅ No login required
✅ Read-only access (view entries, search, statistics)
❌ Cannot create, edit, or delete entries
❌ Cannot configure LDAP connections
❌ No audit trail of individual users

### Configuration

```bash
# .env
AUTH_MODE=legacy
READONLY_MODE=true
```

### Docker Compose

```bash
# Create .env file
cat > .env <<EOF
AUTH_MODE=legacy
READONLY_MODE=true
ALLOWED_ORIGINS=http://localhost:5173
EOF

# Start without Keycloak (faster startup)
docker-compose up ldap-manager -d

# Access the app (no login required)
open http://localhost:5173
```

### Available Endpoints

| Endpoint | Access |
|----------|--------|
| `/api/clusters/list` | ✅ |
| `/api/entries/search` | ✅ |
| `/api/entries/stats` | ✅ |
| `/api/monitoring/nodes` | ✅ |
| `/api/entries/create` | ❌ 403 Forbidden |
| `/api/entries/update` | ❌ 403 Forbidden |
| `/api/entries/delete` | ❌ 403 Forbidden |
| `/api/connection/connect` | ❌ 403 Forbidden |

### Security Notes

- Anyone with network access can view data
- No audit trail of who viewed what
- LDAP passwords must be pre-configured in `config.yml`
- Suitable for trusted networks only

---

## Mode 3: No Authentication + Full Access

### Description

No login required. All users have admin-level access (full read-write). This is **V1 compatibility mode**.

### Use Cases

- Internal corporate networks (trusted users)
- Development environments
- Small teams (known users)
- Legacy V1 deployments
- Air-gapped networks

### Features

✅ No login required
✅ Full access (create, edit, delete)
✅ LDAP connection configuration
❌ No audit trail of individual users
❌ No role separation

### Configuration

```bash
# .env
AUTH_MODE=legacy
READONLY_MODE=false
```

### Docker Compose

```bash
# Create .env file
cat > .env <<EOF
AUTH_MODE=legacy
READONLY_MODE=false
ALLOWED_ORIGINS=http://localhost:5173
EOF

# Start without Keycloak
docker-compose up ldap-manager -d

# Access the app (no login required)
open http://localhost:5173
```

### Available Endpoints

| Endpoint | Access |
|----------|--------|
| All read endpoints | ✅ |
| All write endpoints | ✅ |
| All admin endpoints | ✅ |

### Security Notes

⚠️ **WARNING**: This mode provides unrestricted access to everyone.

- Anyone with network access can modify data
- No audit trail of who changed what
- Suitable for **trusted networks only**
- **DO NOT expose to public internet**
- Recommended to use firewall/VPN for access control

---

## Comparison Matrix

| Feature | Mode 1 (Keycloak) | Mode 2 (Read-Only) | Mode 3 (Full Access) |
|---------|-------------------|-------------------|---------------------|
| **Authentication** | Required | None | None |
| **User Management** | Keycloak | N/A | N/A |
| **Role-Based Access** | Yes (4 roles) | No (all viewers) | No (all admins) |
| **Audit Trail** | Username tracking | Generic logs | Generic logs |
| **LDAP Password** | Admin configures | Pre-configured | User configures |
| **Create Entries** | Admin + Editor | ❌ | ✅ |
| **Edit Entries** | Admin + Editor | ❌ | ✅ |
| **Delete Entries** | Admin only | ❌ | ✅ |
| **View Entries** | All roles | ✅ | ✅ |
| **Audit Logs** | Admin + Auditor | ❌ | ✅ |
| **Deployment** | Keycloak required | Standalone | Standalone |
| **Startup Time** | ~90s | ~10s | ~10s |
| **Memory Usage** | ~800MB | ~200MB | ~200MB |
| **Use Case** | Production | Public dashboards | Trusted networks |
| **Security Level** | High | Medium | Low |

---

## Switching Between Modes

### From Mode 1 to Mode 2

```bash
# Stop containers
docker-compose down

# Update .env
sed -i 's/AUTH_MODE=keycloak/AUTH_MODE=legacy/' .env
echo "READONLY_MODE=true" >> .env

# Start without Keycloak
docker-compose up ldap-manager -d
```

### From Mode 2 to Mode 3

```bash
# Update .env
sed -i 's/READONLY_MODE=true/READONLY_MODE=false/' .env

# Restart
docker restart ldap-manager
```

### From Mode 3 to Mode 1

```bash
# Stop container
docker-compose down

# Update .env
sed -i 's/AUTH_MODE=legacy/AUTH_MODE=keycloak/' .env
sed -i 's/READONLY_MODE=false/READONLY_MODE=false/' .env

# Start with Keycloak
docker-compose up -d
```

---

## Environment Variable Reference

| Variable | Mode 1 | Mode 2 | Mode 3 |
|----------|--------|--------|--------|
| `AUTH_MODE` | `keycloak` | `legacy` | `legacy` |
| `READONLY_MODE` | (ignored) | `true` | `false` |
| `KEYCLOAK_URL` | Required | N/A | N/A |
| `KEYCLOAK_ISSUER` | Required | N/A | N/A |
| `KEYCLOAK_REALM` | Required | N/A | N/A |
| `KEYCLOAK_CLIENT_ID` | Required | N/A | N/A |

---

## Production Deployment Recommendations

### High Security (External Access)

✅ **Use Mode 1** (Keycloak Authentication)
- User authentication required
- Role-based access control
- Audit trail with usernames
- HTTPS via reverse proxy
- Rate limiting enabled

### Medium Security (Internal Corporate Network)

✅ **Use Mode 1** or **Mode 2** (depending on need for write access)
- VPN or firewall access control
- HTTPS optional (if sensitive data)
- Monitoring and alerting

### Low Security (Trusted Environment)

✅ **Use Mode 3** (Full Access)
- Air-gapped network or isolated VLAN
- Known users only
- Physical security controls
- Regular backups

---

## Testing Each Mode

### Test Mode 1

```bash
# Start with Keycloak
docker-compose up -d

# Wait for Keycloak to be healthy
docker-compose ps keycloak

# Test login
open http://localhost:5173
# Login: admin / admin123

# Test role enforcement
curl -X POST http://localhost:8000/api/entries/create \
  -H "Authorization: Bearer $TOKEN" \
  # Should succeed for admin, fail for viewer
```

### Test Mode 2

```bash
# Switch to read-only mode
cat > .env <<EOF
AUTH_MODE=legacy
READONLY_MODE=true
EOF

docker-compose up ldap-manager -d

# Test read access (should work)
curl http://localhost:8000/api/entries/search?cluster=vibhuvioio.com

# Test write access (should fail with 403)
curl -X POST http://localhost:8000/api/entries/create \
  -H "Content-Type: application/json" \
  -d '{"cluster":"vibhuvioio.com","dn":"cn=test,...","attributes":{...}}'
# Expected: 403 Forbidden
```

### Test Mode 3

```bash
# Switch to full access mode
cat > .env <<EOF
AUTH_MODE=legacy
READONLY_MODE=false
EOF

docker restart ldap-manager

# Test write access (should work)
curl -X POST http://localhost:8000/api/entries/create \
  -H "Content-Type: application/json" \
  -d '{"cluster":"vibhuvioio.com","dn":"cn=test,...","attributes":{...}}'
# Expected: 200 OK
```

---

## Troubleshooting

### Mode 1: Login redirect loop

**Problem**: After login, page keeps redirecting to Keycloak

**Solution**: Check `KEYCLOAK_ISSUER` matches the issuer in JWT token
```bash
# Get issuer from token
echo $TOKEN | cut -d '.' -f 2 | base64 -d | jq .iss

# Update .env
KEYCLOAK_ISSUER=http://localhost:8080/realms/ldap-manager
```

### Mode 2/3: Still prompts for login

**Problem**: Frontend shows login page even with `AUTH_MODE=legacy`

**Solution**: Frontend needs rebuild to pick up environment variables
```bash
# Rebuild frontend
docker-compose down
docker-compose build ldap-manager
docker-compose up -d
```

### All Modes: CORS errors

**Problem**: Browser shows CORS policy errors

**Solution**: Update `ALLOWED_ORIGINS` environment variable
```bash
# .env
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:8000,https://ldap.company.com
```

---

## Migration Guide

### V1 to V2 (Mode 3 → Mode 1)

**Step 1**: Test Mode 3 compatibility
```bash
# Deploy V2 in Mode 3 (V1 compatibility)
AUTH_MODE=legacy
READONLY_MODE=false
docker-compose up -d
```

**Step 2**: Set up Keycloak
```bash
# Start Keycloak
docker-compose up keycloak -d

# Wait for healthy
docker-compose ps keycloak
```

**Step 3**: Create users in Keycloak
- Login to Keycloak Admin: http://localhost:8080
- Create real users
- Assign roles (admin, editor, viewer, auditor)

**Step 4**: Switch to Mode 1
```bash
# Update .env
AUTH_MODE=keycloak

# Restart
docker-compose restart ldap-manager
```

**Step 5**: Test authentication
- All users must login via Keycloak
- Admins configure LDAP connections
- Non-admin users use admin-configured connections

---

## Security Best Practices

### Mode 1 (Keycloak)

✅ Use HTTPS with valid SSL certificate
✅ Change default Keycloak admin password
✅ Delete test users, create real users
✅ Enable rate limiting (Redis)
✅ Use external Keycloak in production
✅ Configure session timeouts
✅ Enable audit logging

### Mode 2 (Read-Only)

✅ Use VPN or firewall for access control
✅ Pre-configure LDAP passwords in config.yml
✅ Enable monitoring and alerting
✅ Regular security audits
⚠️ Consider HTTPS if sensitive data displayed

### Mode 3 (Full Access)

✅ Use air-gapped network or isolated VLAN
✅ Implement firewall rules (whitelist IPs)
✅ Physical security controls
✅ Regular backups (daily)
✅ Monitor logs for suspicious activity
⚠️ **NEVER expose to public internet**

---

## FAQ

### Q: Can I switch modes without data loss?

**A**: Yes, modes only affect authentication/authorization. LDAP data and password cache are preserved.

### Q: Which mode is fastest?

**A**: Mode 2 and Mode 3 are faster (no Keycloak overhead). Mode 1 adds ~80s startup time for Keycloak.

### Q: Can I use external Keycloak with Mode 1?

**A**: Yes, set `KEYCLOAK_URL` to your external Keycloak instance (e.g., `https://auth.company.com`).

### Q: What happens to audit logs in Mode 2/3?

**A**: Logs show "legacy" or "readonly" as the username instead of real usernames.

### Q: Can I customize roles in Mode 1?

**A**: Yes, modify `keycloak/realm-export.json` to add custom roles and permissions.

### Q: How do I deploy Mode 1 in production?

**A**: Use external Keycloak, HTTPS reverse proxy (nginx/Caddy), Redis for rate limiting. See `PRODUCTION_DEPLOYMENT.md`.

---

## Summary

Choose the deployment mode based on your security requirements:

- **Need user authentication + RBAC?** → Mode 1 (Keycloak)
- **Need public read-only dashboard?** → Mode 2 (No Auth + Read-Only)
- **Trusted internal network?** → Mode 3 (No Auth + Full Access)

All modes support the same LDAP operations, the only difference is authentication and authorization.
