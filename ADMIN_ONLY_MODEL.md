# Admin-Only LDAP Configuration Model

## Overview

**Model**: Keycloak controls web app access, Admin configures LDAP connections

This document describes how the LDAP Manager authentication works with admin-only LDAP configuration.

---

## How It Works

### 1. Web App Access (Keycloak)

```
User → Logs into Keycloak → Gets JWT token → Accesses web app
```

**Keycloak Manages**:
- Who can access the web application
- User roles (admin, editor, viewer, auditor)
- Login sessions
- User profile information

**Stored in**: Keycloak database (H2 or PostgreSQL)

### 2. LDAP Connection (Admin Configures)

```
Admin → Configures cluster → Enters LDAP password → Saves to cache
All users → Automatically use configured connection → No password prompt
```

**LDAP Password Cache**:
- Admin enters LDAP password ONCE
- Password encrypted and cached (1 hour TTL)
- ALL users share this connection
- Non-admin users never see the password

**Stored in**: `/app/.cache/` (encrypted with Fernet)

---

## User Roles & Permissions

### Admin Role

**Can**:
- ✅ Configure LDAP connections (enter/update passwords)
- ✅ Clear LDAP password cache
- ✅ Full CRUD on LDAP entries (create, read, update, delete)
- ✅ View audit logs
- ✅ Manage all clusters

**Cannot**:
- ❌ N/A (full access)

### Editor Role

**Can**:
- ✅ View LDAP entries (if admin configured connection)
- ✅ Create new LDAP entries
- ✅ Update existing LDAP entries
- ✅ View statistics

**Cannot**:
- ❌ Configure LDAP connections (password setup)
- ❌ Delete LDAP entries
- ❌ Clear password cache

### Viewer Role

**Can**:
- ✅ View LDAP entries (if admin configured connection)
- ✅ Search directory
- ✅ View statistics
- ✅ View monitoring data

**Cannot**:
- ❌ Configure LDAP connections
- ❌ Create, update, or delete entries
- ❌ Clear password cache

### Auditor Role

**Can**:
- ✅ View audit logs
- ✅ View monitoring data
- ✅ View statistics

**Cannot**:
- ❌ Configure LDAP connections
- ❌ Modify LDAP entries
- ❌ Clear password cache

---

## Workflow Examples

### Example 1: Initial Setup

**Step 1: Admin Configures Connection**
```
1. Admin logs in (Keycloak: admin/admin123)
2. Admin clicks on cluster "vibhuvioio.com"
3. Admin enters LDAP password: "changeme"
4. Admin clicks "Connect"
5. System caches password (encrypted)
6. Success: "Cluster configured by admin. All users can now access this cluster."
```

**Step 2: Editor Uses Connection**
```
1. Editor logs in (Keycloak: editor/editor123)
2. Editor clicks on cluster "vibhuvioio.com"
3. NO password prompt (admin already configured)
4. Editor sees directory entries
5. Editor creates new user → Success!
```

**Step 3: Viewer Uses Connection**
```
1. Viewer logs in (Keycloak: viewer/viewer123)
2. Viewer clicks on cluster "vibhuvioio.com"
3. NO password prompt (admin already configured)
4. Viewer sees directory entries (read-only)
5. Viewer tries to create user → Denied (403 Forbidden)
```

### Example 2: Password Expiration

**After 1 Hour (TTL)**:
```
1. Viewer tries to access cluster
2. Error: "LDAP connection not configured. Contact admin to set up cluster connection."
3. Viewer contacts admin
4. Admin re-enters password
5. All users can access again
```

### Example 3: Changing LDAP Password

**When LDAP password changes**:
```
1. Admin goes to cluster settings
2. Admin clicks "Clear Connection"
3. Admin re-enters NEW LDAP password
4. Admin clicks "Connect"
5. New password cached
6. All users automatically use new password
```

---

## API Endpoints & Access Control

### Connection Management (ADMIN ONLY)

| Endpoint | Method | Role | Description |
|----------|--------|------|-------------|
| `/api/connection/connect` | POST | **admin** | Configure LDAP connection |
| `/api/password/cache/{cluster}` | DELETE | **admin** | Clear password cache |

### Password Status (ALL USERS)

| Endpoint | Method | Role | Description |
|----------|--------|------|-------------|
| `/api/password/check/{cluster}` | GET | viewer+ | Check if connection configured |
| `/api/password/status/{cluster}` | GET | viewer+ | Get cache details (age, TTL) |

### LDAP Operations (ROLE-BASED)

| Endpoint | Method | Role | Description |
|----------|--------|------|-------------|
| `/api/entries/search` | GET | viewer+ | Search directory |
| `/api/entries/stats` | GET | viewer+ | Get statistics |
| `/api/entries/create` | POST | **editor+** | Create entry |
| `/api/entries/update` | PUT | **editor+** | Modify entry |
| `/api/entries/delete` | DELETE | **admin** | Delete entry |

---

## Security Model

### Two Layers of Security

**Layer 1: Web App Access (Keycloak)**
```
Question: Who can access the web application?
Answer: Only users with Keycloak accounts in "ldap-manager" realm
```

**Layer 2: LDAP Operations (Roles)**
```
Question: What can they do?
Answer: Depends on their Keycloak role assignment
  - admin: Full access + connection setup
  - editor: Create & update entries
  - viewer: Read-only access
  - auditor: Logs & monitoring
```

### Password Security

**LDAP Password**:
- Entered by admin only
- Encrypted with Fernet (AES-128-CBC + HMAC)
- Stored in `/app/.cache/` with 0600 permissions
- Auto-expires after 1 hour (configurable TTL)
- Never sent to frontend or logged

**Keycloak Password**:
- Stored in Keycloak database
- Used for web app login only
- Separate from LDAP password
- Can be same or different

---

## Cache File Structure

### Location
```
/app/.cache/
├── abc123def456.json  ← Cluster 1 (vibhuvioio.com)
├── xyz789ghi012.json  ← Cluster 2 (vibhuvi.com)
└── mno345pqr678.json  ← Cluster 3 (oiocloud.com)
```

### File Format (Encrypted)
```json
{
  "cluster": "vibhuvioio.com",
  "bind_dn": "cn=Manager,dc=vibhuvioio,dc=com",
  "encrypted_password": "gAAAABhmC8x...",
  "timestamp": 1738217600.0,
  "ttl": 3600
}
```

**Key Points**:
- One file per cluster (NOT per user)
- All users share the same cached password
- File name is hash of `cluster:bind_dn`
- Password is encrypted with Fernet key

---

## Common Scenarios

### Scenario 1: New Cluster Added

**config.yml**:
```yaml
clusters:
  - name: "new-cluster"
    host: "ldap.new.com"
    port: 389
    bind_dn: "cn=admin,dc=new,dc=com"
    base_dn: "dc=new,dc=com"
```

**Steps**:
1. Restart LDAP Manager: `docker restart ldap-manager`
2. Admin logs in and sees new cluster
3. Admin clicks cluster → enters LDAP password
4. All users can now access new cluster

### Scenario 2: Admin Forgot LDAP Password

**Problem**: Admin doesn't remember the LDAP password

**Solution Options**:

**Option A**: Retrieve from another system
1. Login to LDAP server directly
2. Reset `cn=Manager` password in LDAP
3. Enter new password in LDAP Manager

**Option B**: Ask another admin
1. If multiple admins, one can configure
2. Password cache is shared

**Option C**: Check config.yml (if password stored there)
```yaml
clusters:
  - name: "cluster"
    bind_password: "changeme"  # If set in config
```

### Scenario 3: Multiple Admins

**All admins can configure connections**:
```
Admin Alice → Configures cluster A
Admin Bob → Configures cluster B
Admin Carol → Reconfigures cluster A (updates password)
```

All admins have equal power to configure/clear connections.

### Scenario 4: User Tries to Access Unconfigured Cluster

**Flow**:
```
1. Viewer clicks "vibhuvioio.com"
2. Backend checks cache → Not found
3. Error: "LDAP connection not configured. Contact admin to set up cluster connection."
4. Frontend shows: "This cluster needs to be configured by an admin first."
```

**User sees**:
- Friendly error message
- Instructions to contact admin
- NO password input field (they can't configure it)

---

## Audit Trail

### Admin Configuration Logged

```json
{
  "timestamp": "2026-01-30T10:00:00Z",
  "level": "INFO",
  "module": "app.api.connection",
  "function": "connect",
  "message": "LDAP connection configured by admin alice for cluster vibhuvioio.com"
}
```

### User Operations Logged

```json
{
  "timestamp": "2026-01-30T10:05:00Z",
  "level": "INFO",
  "module": "app.api.entries",
  "function": "create_entry",
  "message": "Entry created",
  "extra": {
    "user_id": "abc-123-def-456",
    "username": "bob",
    "cluster": "vibhuvioio.com",
    "dn": "cn=newuser,ou=People,dc=vibhuvioio,dc=com",
    "operation": "CREATE"
  }
}
```

**Audit shows**:
- Which admin configured cluster
- Which user performed each operation
- When password cache expires
- When password cache is cleared

---

## Comparison: Per-User vs Shared Cache

### Shared Cache (Current Model) ✅

**Pros**:
- ✅ Simpler for users (no password prompt)
- ✅ Admin controls all connections
- ✅ Single password per cluster
- ✅ Less storage (one cache file per cluster)

**Cons**:
- ❌ Can't track which user's LDAP account made changes
- ❌ All users use same LDAP bind DN
- ❌ LDAP-level ACLs not enforced per user

**Best For**:
- IT manages external data (customers, devices)
- Centralized LDAP administration
- Users are staff, not LDAP entries

### Per-User Cache (Alternative Model)

**Pros**:
- ✅ Each user uses their own LDAP account
- ✅ LDAP ACLs enforced (user can only modify their entry)
- ✅ Full audit trail at LDAP level

**Cons**:
- ❌ Each user must enter LDAP password
- ❌ More complex for users
- ❌ Only works if users have LDAP accounts

**Best For**:
- Employees managing their own LDAP entries
- Self-service directory management
- LDAP as employee database

---

## Your Current Setup

```yaml
# config.yml
clusters:
  - name: "vibhuvioio.com"
    host: "192.168.0.101"
    port: 389
    bind_dn: "cn=Manager,dc=vibhuvioio,dc=com"  ← Shared admin account
    base_dn: "dc=vibhuvioio,dc=com"
```

**Interpretation**:
- `cn=Manager` is the LDAP admin account
- All users connect as "Manager" (not individual accounts)
- Admin enters "Manager" password once
- All users share this connection

**This is the CORRECT model for your use case!**

---

## Testing Guide

### Test 1: Admin Configures Connection

**As Admin**:
1. Login: admin / admin123
2. Go to cluster "vibhuvioio.com"
3. Enter password: `changeme`
4. Click "Connect"
5. **Expected**: "Cluster configured by admin. All users can now access this cluster."

### Test 2: Editor Uses Connection

**As Editor**:
1. Login: editor / editor123
2. Go to cluster "vibhuvioio.com"
3. **Expected**: NO password prompt, directory loads automatically
4. Try to create entry → **Success** ✅
5. Try to delete entry → **Forbidden** (403) ❌

### Test 3: Viewer Uses Connection

**As Viewer**:
1. Login: viewer / viewer123
2. Go to cluster "vibhuvioio.com"
3. **Expected**: NO password prompt, directory loads automatically
4. View entries → **Success** ✅
5. Try to create entry → **Forbidden** (403) ❌

### Test 4: Non-Admin Cannot Configure

**As Editor**:
1. Try to access `/api/connection/connect` endpoint
2. **Expected**: 403 Forbidden - "Access denied"

### Test 5: Password Cache Expiration

**Simulate**:
```bash
# Clear cache as admin
curl -X DELETE http://localhost:8000/api/password/cache/vibhuvioio.com \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# Try to access as viewer
# Expected: "LDAP connection not configured. Contact admin."
```

---

## FAQ

### Q: Can non-admin users see the LDAP password?
**A**: No. The password is never sent to the frontend or displayed anywhere.

### Q: What happens when admin leaves the company?
**A**: Create another admin user in Keycloak, or use existing admin account to reconfigure.

### Q: Can I have different LDAP passwords per cluster?
**A**: Yes! Each cluster has its own cached password.

### Q: How often does admin need to re-enter passwords?
**A**: Every 1 hour (default TTL), or when cache is manually cleared.

### Q: Can I change the TTL (password cache duration)?
**A**: Yes, modify `DEFAULT_TTL` in `backend/app/core/password_cache.py` (default: 3600 seconds = 1 hour)

### Q: What if LDAP password changes?
**A**: Admin clears cache and re-enters new password. All users automatically use new password.

### Q: Do Keycloak password and LDAP password need to match?
**A**: No, they are completely separate. Keycloak is for web app access, LDAP is for directory operations.

### Q: Can I use my existing LDAP server for Keycloak users?
**A**: Yes! Configure Keycloak User Federation → LDAP. Users can login with their LDAP credentials to access the web app.

---

## Summary

✅ **Keycloak**: Controls who accesses the web application
✅ **Admin**: Configures LDAP connections (enters passwords)
✅ **All Users**: Automatically use configured connections
✅ **Roles**: Control what operations users can perform
✅ **Audit**: Tracks which Keycloak user did what
✅ **Simple**: Non-admin users never deal with LDAP passwords

This model is perfect for IT staff managing LDAP directories!
