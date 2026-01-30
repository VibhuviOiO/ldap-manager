# Keycloak User Management Guide

## Creating and Managing Users in LDAP Manager

This guide explains how to add, configure, and manage users in Keycloak for LDAP Manager authentication.

---

## Quick Start: Add a New User

### 1. Access Keycloak Admin Console

```
URL: http://localhost:8080
Click: "Administration Console"
Login: admin / admin
Select Realm: "ldap-manager" (dropdown in top-left)
```

### 2. Create User

1. Click **"Users"** in left sidebar
2. Click **"Add user"** button
3. Fill in:
   - **Username**: `jane.smith` (required, unique)
   - **Email**: `jane@company.com` (optional)
   - **First name**: `Jane` (optional)
   - **Last name**: `Smith` (optional)
   - **Email verified**: Toggle ON
   - **Enabled**: Toggle ON
4. Click **"Create"**

### 3. Set Password

1. Click **"Credentials"** tab
2. Click **"Set password"**
3. Enter password (e.g., `SecurePass123`)
4. **Temporary**: Toggle OFF (user won't need to change password)
5. Click **"Save"** → **"Save password"**

### 4. Assign Role

1. Click **"Role mapping"** tab
2. Click **"Assign role"**
3. Filter dropdown: Change to **"Filter by clients"**
4. Select: **"ldap-manager-client"**
5. Check role: **admin**, **editor**, **viewer**, or **auditor**
6. Click **"Assign"**

### 5. Test User

1. Go to http://localhost:5173
2. Login with: `jane.smith` / `SecurePass123`
3. Connect to cluster and enter LDAP password
4. ✅ User now has their own isolated password cache!

---

## Role Definitions

| Role | Permissions | Use Case |
|------|-------------|----------|
| **admin** | Full access (CRUD + delete) | IT administrators, directory managers |
| **editor** | Create + update (no delete) | Team leads, HR staff |
| **viewer** | Read-only | Support staff, analysts, auditors |
| **auditor** | Read + logs | Security team, compliance officers |

### Role Assignment Best Practices

- **Start with viewer role** for new users, upgrade as needed
- **Limit admin role** to 2-3 trusted users
- **Use editor role** for day-to-day directory management
- **Auditor role** for compliance/security team members

---

## Bulk User Creation

### Option 1: Keycloak Admin Console (Manual)

Repeat the steps above for each user.

### Option 2: Keycloak Admin REST API (Automated)

```bash
# Get admin token
ADMIN_TOKEN=$(curl -s -X POST "http://localhost:8080/realms/master/protocol/openid-connect/token" \
  -d "client_id=admin-cli" \
  -d "username=admin" \
  -d "password=admin" \
  -d "grant_type=password" | jq -r '.access_token')

# Create user
curl -X POST "http://localhost:8080/admin/realms/ldap-manager/users" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "john.doe",
    "enabled": true,
    "emailVerified": true,
    "firstName": "John",
    "lastName": "Doe",
    "email": "john@company.com",
    "credentials": [{
      "type": "password",
      "value": "SecurePass123",
      "temporary": false
    }]
  }'

# Get user ID
USER_ID=$(curl -s "http://localhost:8080/admin/realms/ldap-manager/users?username=john.doe" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | jq -r '.[0].id')

# Assign role
ROLE_ID=$(curl -s "http://localhost:8080/admin/realms/ldap-manager/clients" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | \
  jq -r '.[] | select(.clientId=="ldap-manager-client") | .id')

curl -X POST "http://localhost:8080/admin/realms/ldap-manager/users/$USER_ID/role-mappings/clients/$ROLE_ID" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '[{
    "name": "editor"
  }]'
```

### Option 3: Keycloak User Federation (LDAP/AD)

If you already have users in LDAP/Active Directory:

1. Navigate to: **User federation** → **Add provider** → **ldap**
2. Configure:
   - **Connection URL**: `ldap://your-ldap-server:389`
   - **Bind DN**: `cn=admin,dc=example,dc=com`
   - **Bind Credential**: Your LDAP admin password
   - **Users DN**: `ou=People,dc=example,dc=com`
3. Test connection → **Sync all users**
4. Users can now login with their LDAP credentials
5. Assign roles manually or via group mapping

---

## Verifying Per-User Password Isolation

### Check Cache Files

After users connect to clusters:

```bash
# List all cache files
docker exec ldap-manager ls -lh /app/.cache/

# Count cache files (1 per user per cluster)
docker exec ldap-manager find /app/.cache -name "*.json" | wc -l

# View cache file details
docker exec ldap-manager cat /app/.cache/*.json | python3 -m json.tool
```

### Example Output

```json
{
  "user_id": "abc-123-def-456",  ← Jane's Keycloak user ID
  "cluster": "vibhuvioio.com",
  "bind_dn": "cn=Manager,dc=vibhuvioio,dc=com",
  "encrypted_password": "gAAAAA...",
  "timestamp": 1738217600.0,
  "ttl": 3600
}

{
  "user_id": "xyz-789-ghi-012",  ← John's Keycloak user ID
  "cluster": "vibhuvioio.com",
  "bind_dn": "cn=Manager,dc=vibhuvioio,dc=com",
  "encrypted_password": "gAAAAB...",  ← Different encrypted password
  "timestamp": 1738217650.0,
  "ttl": 3600
}
```

**Key Points**:
- ✅ Different `user_id` for each user
- ✅ Different `encrypted_password` (each user's own LDAP credentials)
- ✅ Same `cluster` and `bind_dn` (connecting to same server)
- ✅ Separate files (isolation prevents cross-user access)

---

## User Management Tasks

### Disable User

1. Go to **Users** → Find user → **Edit**
2. Toggle **Enabled** to OFF
3. Click **Save**
4. User can no longer login (existing sessions terminated)

### Reset User Password

1. Go to **Users** → Find user → **Credentials** tab
2. Click **Reset password**
3. Enter new password
4. **Temporary**: Toggle ON if user should change it on next login
5. Click **Save**

### Change User Roles

1. Go to **Users** → Find user → **Role mapping** tab
2. **Remove role**: Select role → Click **Unassign**
3. **Add role**: Click **Assign role** → Select new role → **Assign**

### Delete User

1. Go to **Users** → Find user
2. Click **Delete**
3. Confirm deletion
4. **Note**: User's password cache will remain until TTL expires (1 hour)

### View User Sessions

1. Go to **Users** → Find user → **Sessions** tab
2. See active sessions (Keycloak login sessions)
3. Click **Sign out** to terminate all user sessions

---

## Audit Trail for Users

### View User Activity in Backend Logs

```bash
# Find all actions by specific user
docker logs ldap-manager 2>&1 | grep "user_id.*abc-123"

# Find all CREATE operations
docker logs ldap-manager 2>&1 | grep "operation.*CREATE"

# Find who accessed specific cluster
docker logs ldap-manager 2>&1 | grep "cluster.*vibhuvioio.com"
```

### Example Log Entry

```json
{
  "timestamp": "2026-01-30T10:15:30Z",
  "level": "INFO",
  "module": "app.api.entries",
  "function": "create_entry",
  "message": "Entry created",
  "extra": {
    "user_id": "abc-123-def-456",
    "username": "jane.smith",
    "cluster": "vibhuvioio.com",
    "dn": "cn=newuser,ou=People,dc=vibhuvioio,dc=com",
    "operation": "CREATE"
  }
}
```

---

## Security Best Practices

### Password Policies

1. **Keycloak Password**: Set in Keycloak admin console
   - Go to: **Authentication** → **Policies** tab
   - Configure minimum length, special characters, etc.

2. **LDAP Password**: Each user enters their own
   - Not stored in Keycloak
   - Cached encrypted for 1 hour (configurable TTL)
   - Each user's LDAP password is isolated

### User Provisioning Workflow

1. **Create user in Keycloak** (HR/IT admin)
2. **Assign initial role** (viewer by default)
3. **User receives credentials** (email/secure channel)
4. **User logs in first time**
   - Changes password if temporary
   - Enters their LDAP credentials
5. **Role upgrade** (as needed based on responsibilities)

### Deprovisioning Workflow

1. **Disable user in Keycloak** (keeps audit trail)
2. **User sessions terminated immediately**
3. **Password cache expires** (1 hour TTL)
4. **Delete user** (after retention period if needed)

---

## Testing Multi-User Scenario

### Scenario: 3 Users, Same Cluster

1. **Create users**: alice, bob, carol in Keycloak
2. **Assign roles**: alice=admin, bob=editor, carol=viewer
3. **Login as alice**:
   - Connect to cluster with LDAP password: `alice_ldap_pass`
   - Create new entry
4. **Logout, login as bob**:
   - Connect to cluster with LDAP password: `bob_ldap_pass`
   - Edit existing entry (allowed)
   - Try to delete entry (denied - only editors)
5. **Logout, login as carol**:
   - Connect to cluster with LDAP password: `carol_ldap_pass`
   - View entries (allowed)
   - Try to create entry (denied - viewer role)
6. **Check cache files**:
   ```bash
   docker exec ldap-manager ls /app/.cache/
   # Should show 3 files (one per user)
   ```

---

## Integration with External Identity Providers

### LDAP/Active Directory

Keycloak can sync users from existing LDAP:

1. **User federation** → **Add provider** → **ldap**
2. Users login with their LDAP username/password to Keycloak
3. Keycloak validates against LDAP
4. User gets JWT token
5. User then enters their LDAP password again for LDAP Manager
6. Both passwords can be the same (common scenario)

**Why two passwords?**
- **Keycloak password**: Authentication to the web application
- **LDAP password**: Authorization to modify LDAP directory
- Can be the same password, but serves different purposes

### SAML/OIDC Federation

Keycloak can act as identity broker:

1. **Identity Providers** → **Add provider** → **OIDC/SAML**
2. Configure your corporate SSO (Okta, Azure AD, Google, etc.)
3. Users login with corporate credentials
4. Still need to enter LDAP password for directory access

---

## Monitoring User Activity

### Real-time User Count

```bash
# Count active Keycloak sessions
curl -s "http://localhost:8080/admin/realms/ldap-manager/users" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | \
  jq '[.[] | select(.enabled==true)] | length'

# Count cached LDAP passwords (active users)
docker exec ldap-manager find /app/.cache -name "*.json" | wc -l
```

### User Statistics

```bash
# Total users
# Total enabled users
# Users by role
# Users with cached passwords
```

Access Keycloak metrics at: http://localhost:8080/metrics

---

## Troubleshooting

### User Can't Login

1. **Check user enabled**: Keycloak → Users → Verify "Enabled" is ON
2. **Check credentials**: Reset password if needed
3. **Check realm**: Ensure user is in "ldap-manager" realm, not "master"
4. **Check browser**: Clear cookies for localhost:5173

### User Can't Access LDAP

1. **Check role assigned**: User must have at least "viewer" role
2. **Check password cached**: User must connect to cluster first
3. **Check LDAP password correct**: Try connecting again
4. **Check backend logs**: `docker logs ldap-manager | grep user_id`

### Multiple Users See Each Other's Data

**This should NOT happen** - each user has isolated cache!

If it does:
1. Check cache files have different user_id
2. Verify backend is Phase 2 version
3. Clear all caches: `docker exec ldap-manager rm -rf /app/.cache/*`
4. Restart: `docker restart ldap-manager`

---

## Summary

✅ **Unlimited Users**: Create as many users as needed in Keycloak
✅ **Per-User Isolation**: Each user has their own password cache
✅ **Role-Based Access**: Assign appropriate role during user creation
✅ **Audit Trail**: All actions logged with user_id and username
✅ **Scalable**: Handles hundreds/thousands of users

**Next**: Create your first user and test the isolated password cache!
