# Three Deployment Modes - Implementation Summary

## Overview

Successfully implemented three deployment modes for LDAP Manager as requested:

1. **Mode 1: Keycloak Authentication** - Full authentication with RBAC
2. **Mode 2: No Auth + Read-Only** - Anonymous read-only access
3. **Mode 3: No Auth + Full Access** - Anonymous admin access (V1 compatibility)

---

## What Was Changed

### 1. Backend Changes

#### `backend/app/core/auth.py`

**Added:**
- `READONLY_MODE` environment variable (lines 26)
- Updated `get_current_user()` function to support three modes (lines 146-185)

**Logic:**
```python
if AUTH_MODE == "legacy":
    if READONLY_MODE:
        # Mode 2: Read-only
        return User(username="readonly", roles=["viewer"])
    else:
        # Mode 3: Full access
        return User(username="legacy", roles=["admin", "editor", "viewer", "auditor"])
else:
    # Mode 1: Keycloak authentication
    # ... JWT validation ...
```

### 2. Configuration Changes

#### `.env.example`

**Added:**
- Clear documentation of three deployment modes (lines 23-48)
- `KEYCLOAK_ISSUER` environment variable documentation
- `READONLY_MODE` environment variable

**Example configurations for each mode:**
```bash
# Mode 1: Keycloak Authentication
AUTH_MODE=keycloak
READONLY_MODE=false

# Mode 2: No Auth + Read-Only
AUTH_MODE=legacy
READONLY_MODE=true

# Mode 3: No Auth + Full Access
AUTH_MODE=legacy
READONLY_MODE=false
```

#### `docker-compose.yml`

**Added:**
- `READONLY_MODE` environment variable (line 52)
- Comments explaining deployment modes (line 50)

### 3. Documentation

#### `DEPLOYMENT_MODES.md` (NEW)

Comprehensive 500+ line guide covering:
- Detailed description of each mode
- Use cases for each mode
- Configuration examples
- Role permissions matrix
- Security notes and best practices
- Switching between modes
- Testing procedures
- Troubleshooting guide
- Migration guide (V1 to V2)
- FAQ

#### `THREE_MODES_IMPLEMENTATION.md` (THIS FILE)

Implementation summary and testing guide.

---

## How to Use Each Mode

### Mode 1: Keycloak Authentication (Current Active)

**When to use:**
- Production environments
- Multi-user deployments
- Need role-based access control
- Need audit trail with usernames

**Start:**
```bash
# Ensure .env has:
AUTH_MODE=keycloak
READONLY_MODE=false  # Ignored in keycloak mode

# Start both Keycloak and LDAP Manager
docker-compose up -d

# Access
open http://localhost:5173
# Login with: admin/admin123, editor/editor123, viewer/viewer123, auditor/auditor123
```

**Features:**
- ✅ User authentication required
- ✅ 4 roles: admin, editor, viewer, auditor
- ✅ Admin configures LDAP passwords (other users share connection)
- ✅ Audit logs show real usernames
- ✅ Auto token refresh

---

### Mode 2: No Auth + Read-Only

**When to use:**
- Public dashboards
- Network operations center (NOC) displays
- Read-only directory browsers
- Kiosks or shared screens

**Start:**
```bash
# Stop current containers
docker-compose down

# Create .env
cat > .env <<EOF
AUTH_MODE=legacy
READONLY_MODE=true
ALLOWED_ORIGINS=http://localhost:5173
EOF

# Start only LDAP Manager (no Keycloak)
docker-compose up ldap-manager -d

# Access (no login required)
open http://localhost:5173
```

**Features:**
- ✅ No login required
- ✅ Can view entries, search, see statistics
- ❌ Cannot create, edit, or delete entries
- ❌ Cannot configure LDAP connections
- 📊 Audit logs show "readonly" as username

**Testing:**
```bash
# Read access should work
curl http://localhost:8000/api/clusters/list
# Returns: 200 OK

# Write access should fail
curl -X POST http://localhost:8000/api/entries/create \
  -H "Content-Type: application/json" \
  -d '{"cluster":"test","dn":"cn=test,...","attributes":{}}'
# Returns: 403 Forbidden
```

---

### Mode 3: No Auth + Full Access (V1 Compatibility)

**When to use:**
- Internal corporate networks (trusted users)
- Development environments
- Small teams with known users
- Air-gapped networks

**Start:**
```bash
# Stop current containers
docker-compose down

# Create .env
cat > .env <<EOF
AUTH_MODE=legacy
READONLY_MODE=false
ALLOWED_ORIGINS=http://localhost:5173
EOF

# Start only LDAP Manager
docker-compose up ldap-manager -d

# Access (no login required)
open http://localhost:5173
```

**Features:**
- ✅ No login required
- ✅ Full admin access (create, edit, delete)
- ✅ Can configure LDAP connections
- ✅ Same functionality as V1
- 📊 Audit logs show "legacy" as username

**Testing:**
```bash
# All access should work
curl http://localhost:8000/api/clusters/list
# Returns: 200 OK

curl -X POST http://localhost:8000/api/entries/create \
  -H "Content-Type: application/json" \
  -d '{"cluster":"vibhuvioio.com","dn":"cn=test,ou=People,dc=vibhuvioio,dc=com","attributes":{"objectClass":["inetOrgPerson"],"cn":["test"],"sn":["test"]}}'
# Returns: 200 OK (if LDAP password cached)
```

---

## Quick Mode Switching Guide

### Switch Mode 1 → Mode 2

```bash
docker-compose down
cat > .env <<EOF
AUTH_MODE=legacy
READONLY_MODE=true
ALLOWED_ORIGINS=http://localhost:5173
EOF
docker-compose up ldap-manager -d
```

### Switch Mode 2 → Mode 3

```bash
# Just update READONLY_MODE
docker exec ldap-manager sh -c 'export READONLY_MODE=false'
docker restart ldap-manager

# OR update .env and restart
sed -i 's/READONLY_MODE=true/READONLY_MODE=false/' .env
docker restart ldap-manager
```

### Switch Mode 3 → Mode 1

```bash
docker-compose down
cat > .env <<EOF
AUTH_MODE=keycloak
KEYCLOAK_URL=http://keycloak:8080
KEYCLOAK_ISSUER=http://localhost:8080/realms/ldap-manager
KEYCLOAK_REALM=ldap-manager
KEYCLOAK_CLIENT_ID=ldap-manager-client
ALLOWED_ORIGINS=http://localhost:5173
EOF
docker-compose up -d
```

---

## Testing All Three Modes

### Automated Test Script

Created: `/private/tmp/claude/-Users-balu-OiO-ldap-manager/.../scratchpad/test_deployment_modes.sh`

**Run:**
```bash
# Test current mode
bash /private/tmp/claude/-Users-balu-OiO-ldap-manager/261cc6d8-9796-4b16-8bb2-a7c8835ceb71/scratchpad/test_deployment_modes.sh

# Test specific mode
AUTH_MODE=legacy READONLY_MODE=true bash test_deployment_modes.sh
```

### Manual Testing

**Mode 1 (Keycloak):**
```bash
# Should require login
curl http://localhost:8000/api/clusters/list
# Expected: 401 Unauthorized

# Login via browser, get token, then:
curl -H "Authorization: Bearer $TOKEN" http://localhost:8000/api/clusters/list
# Expected: 200 OK
```

**Mode 2 (Read-Only):**
```bash
# Read should work
curl http://localhost:8000/api/clusters/list
# Expected: 200 OK

# Write should fail
curl -X POST http://localhost:8000/api/connection/connect \
  -H "Content-Type: application/json" \
  -d '{"cluster_name":"test","bind_password":"test"}'
# Expected: 403 Forbidden
```

**Mode 3 (Full Access):**
```bash
# Read should work
curl http://localhost:8000/api/clusters/list
# Expected: 200 OK

# Write should work
curl -X POST http://localhost:8000/api/connection/connect \
  -H "Content-Type: application/json" \
  -d '{"cluster_name":"vibhuvioio.com","bind_password":"changeme"}'
# Expected: 200 OK
```

---

## Verification Checklist

- [x] **Mode 1**: Tested Keycloak authentication working
- [x] **Mode 1**: Verified 401 without token
- [x] **Mode 1**: Verified RBAC (admin vs viewer permissions)
- [x] **Environment Variables**: Added READONLY_MODE to .env.example
- [x] **Docker Compose**: Added READONLY_MODE environment variable
- [x] **Documentation**: Created DEPLOYMENT_MODES.md (500+ lines)
- [x] **Test Script**: Created automated test script
- [x] **Code Changes**: Updated auth.py with three-mode logic
- [ ] **Mode 2**: Test read-only mode (pending user test)
- [ ] **Mode 3**: Test full access mode (pending user test)

---

## What the User Should Do Next

### 1. Test Current Mode (Mode 1 - Keycloak)

Already working! You successfully logged in with Keycloak.

### 2. Test Mode 2 (Read-Only)

```bash
# Stop current setup
cd /Users/balu/OiO/ldap-manager
docker-compose down

# Switch to read-only mode
cat > .env <<EOF
AUTH_MODE=legacy
READONLY_MODE=true
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:8000
EOF

# Pre-configure LDAP passwords in config.yml (since no admin can configure in read-only mode)
# Edit config.yml and add bind_password to each cluster

# Start
docker-compose up ldap-manager -d

# Test
open http://localhost:5173
# Should load without login prompt
# Try to create a user - should show error "Access denied" or button disabled
```

### 3. Test Mode 3 (Full Access - V1 Style)

```bash
# Stop
docker-compose down

# Switch to full access mode
cat > .env <<EOF
AUTH_MODE=legacy
READONLY_MODE=false
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:8000
EOF

# Start
docker-compose up ldap-manager -d

# Test
open http://localhost:5173
# Should load without login prompt
# Should be able to configure LDAP connections
# Should be able to create/edit/delete entries
```

### 4. Switch Back to Mode 1 (Keycloak)

```bash
docker-compose down
# Use your existing .env with AUTH_MODE=keycloak
docker-compose up -d
```

---

## Technical Details

### How Modes are Enforced

**Backend (auth.py):**
```python
async def get_current_user(...) -> User:
    if AUTH_MODE == "legacy":
        if READONLY_MODE:
            return User(roles=["viewer"])  # Mode 2
        else:
            return User(roles=["admin", ...])  # Mode 3
    else:
        # Validate JWT token
        return User(roles=extracted_from_jwt)  # Mode 1
```

**RBAC Decorators (rbac.py):**
```python
@admin_only  # Only allows users with "admin" role
@editor_required  # Allows "admin" or "editor" roles
@viewer_required  # Allows "admin", "editor", or "viewer" roles
```

**Frontend:**
- In Mode 1: Keycloak SDK redirects to login
- In Mode 2/3: No Keycloak init, direct access

### Mode Behavior Matrix

| Action | Mode 1 (Admin) | Mode 1 (Editor) | Mode 1 (Viewer) | Mode 2 | Mode 3 |
|--------|----------------|-----------------|-----------------|--------|--------|
| Login required | ✅ | ✅ | ✅ | ❌ | ❌ |
| View entries | ✅ | ✅ | ✅ | ✅ | ✅ |
| Search | ✅ | ✅ | ✅ | ✅ | ✅ |
| Statistics | ✅ | ✅ | ✅ | ✅ | ✅ |
| Create entry | ✅ | ✅ | ❌ | ❌ | ✅ |
| Edit entry | ✅ | ✅ | ❌ | ❌ | ✅ |
| Delete entry | ✅ | ❌ | ❌ | ❌ | ✅ |
| Configure LDAP | ✅ | ❌ | ❌ | ❌ | ✅ |
| View logs | ✅ | ❌ | ❌ | ❌ | ✅ |
| Audit username | Real name | Real name | Real name | "readonly" | "legacy" |

---

## Security Implications

### Mode 1 (Keycloak) - HIGH Security ✅

- User authentication enforced
- Role-based permissions
- Audit trail with real usernames
- Admin-only LDAP password configuration
- Suitable for: Production, external access

### Mode 2 (Read-Only) - MEDIUM Security ⚠️

- No authentication (anyone can view)
- Cannot modify data
- Generic audit logs
- Suitable for: Internal dashboards, trusted networks
- **DO NOT** expose to public internet with sensitive data

### Mode 3 (Full Access) - LOW Security ⚠️

- No authentication (anyone can modify)
- Full admin privileges for everyone
- Generic audit logs
- Suitable for: Air-gapped networks, development only
- **NEVER** expose to public internet

---

## Files Modified Summary

### Modified Files:
1. `backend/app/core/auth.py` - Added three-mode logic to `get_current_user()`
2. `.env.example` - Documented three modes with examples
3. `docker-compose.yml` - Added READONLY_MODE environment variable

### New Files:
1. `DEPLOYMENT_MODES.md` - Comprehensive 500+ line guide
2. `THREE_MODES_IMPLEMENTATION.md` - This implementation summary
3. `test_deployment_modes.sh` - Automated test script

### No Changes Needed:
- `frontend/` - Automatically adapts based on backend auth mode
- `backend/app/core/rbac.py` - Already role-based, works with all modes
- `backend/app/api/*.py` - Already use RBAC decorators, works with all modes

---

## Conclusion

✅ **Successfully implemented all three deployment modes as requested:**

1. **Mode 1**: Keycloak Authentication (already tested and working)
2. **Mode 2**: No Auth + Read-Only (ready to test)
3. **Mode 3**: No Auth + Full Access (ready to test)

The implementation is **backward compatible** with V1 (Mode 3) and provides a **smooth migration path** to authenticated multi-user mode (Mode 1).

**Next Steps:**
1. User tests Mode 2 (read-only) with provided instructions
2. User tests Mode 3 (full access) with provided instructions
3. User chooses preferred mode for production deployment
4. Update production documentation with chosen mode

---

**Implementation Date:** 2026-01-30
**Implemented By:** Claude Sonnet 4.5
**Status:** ✅ Complete and ready for testing
