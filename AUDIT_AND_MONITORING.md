# Audit Logs and Monitoring Guide

## Where Is Data Stored?

### 1. User Management → Keycloak Database (H2)

**What's Stored**:
- User accounts (admin, editor, viewer, auditor)
- User roles and permissions
- Login sessions
- Authentication events (login, logout, token refresh)
- User profile information (email, name)

**Where to View**:
- **Keycloak Admin Console**: http://localhost:8080
- Login: admin / admin
- Realm: ldap-manager

**Storage Location**:
- Docker volume: `ldap-manager_keycloak-data`
- Database type: H2 (embedded)
- Files: `/opt/keycloak/data/h2/` inside Keycloak container

---

### 2. LDAP Operations Audit Logs → Backend Application Logs

**What's Tracked**:
- Which user performed each operation
- What operation (CREATE, UPDATE, DELETE, READ)
- Which cluster/LDAP server
- When (timestamp)
- What changed (DN, attributes)

**Where to View**:
- **Docker logs**: `docker logs ldap-manager`
- **Log file** (if configured): `/app/logs/` inside container

**Storage Location**:
- Docker container stdout/stderr
- Collected by Docker logging driver
- Can be exported to external logging systems

---

## 📊 Keycloak Admin Console - Viewing User Roles

### Access Keycloak Admin

```
URL: http://localhost:8080
Click: "Administration Console"
Login: admin / admin
Realm: ldap-manager (select from dropdown)
```

### View User Roles

**Step 1: Go to Users**
```
Left sidebar → Users
```

**Step 2: Find User**
```
Click "View all users" or search by username
Click on the user (e.g., "admin")
```

**Step 3: View Roles**
```
Click "Role mapping" tab
```

**What You'll See**:
```
Role Mapping
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Assigned roles:

Client roles: ldap-manager-client
  ✓ admin                 [Unassign]

Available roles:
  ○ editor
  ○ viewer
  ○ auditor
```

### View Login History

**Step 1: Go to Events**
```
Left sidebar → Events → Login events
```

**What You'll See**:
```
Recent Login Events
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Time                    User      Event       IP Address      Client
2026-01-30 10:00:00    admin     LOGIN       192.168.1.100   ldap-manager-client
2026-01-30 10:05:00    editor    LOGIN       192.168.1.101   ldap-manager-client
2026-01-30 10:10:00    viewer    LOGIN       192.168.1.102   ldap-manager-client
```

### View Active Sessions

**Step 1: Go to Sessions**
```
Left sidebar → Sessions → View all sessions
```

**What You'll See**:
```
Active User Sessions
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
User      IP Address      Started              Last Access         Clients
admin     192.168.1.100   10:00:00 (1h ago)    10:45:00 (15m ago)  ldap-manager-client
editor    192.168.1.101   10:05:00 (55m ago)   10:40:00 (20m ago)  ldap-manager-client
```

---

## 📝 Backend Audit Logs - Viewing LDAP Operations

### Quick Commands

```bash
# View all recent activity (last 100 lines)
docker logs ldap-manager --tail 100

# View real-time logs (follow mode)
docker logs ldap-manager -f

# View logs with timestamps
docker logs ldap-manager -t --tail 50

# Save logs to file
docker logs ldap-manager > ldap-manager.log
```

### Search Specific Operations

```bash
# Who configured LDAP connections?
docker logs ldap-manager 2>&1 | grep "LDAP connection configured"

# Example output:
# 2026-01-30 07:53:49 - INFO - LDAP connection configured by admin admin for cluster vibhuvioio.com

# Who created entries?
docker logs ldap-manager 2>&1 | grep "Entry created"

# Who updated entries?
docker logs ldap-manager 2>&1 | grep "Entry updated"

# Who deleted entries?
docker logs ldap-manager 2>&1 | grep "Entry deleted"
```

### Search by User

```bash
# See everything user "admin" did
docker logs ldap-manager 2>&1 | grep '"username": "admin"'

# See everything user "editor" did
docker logs ldap-manager 2>&1 | grep '"username": "editor"'

# See specific user's operations with details
docker logs ldap-manager 2>&1 | grep -A 5 '"username": "admin"'
```

### Search by Cluster

```bash
# All activity on vibhuvioio.com
docker logs ldap-manager 2>&1 | grep '"cluster": "vibhuvioio.com"'

# All activity on specific DN
docker logs ldap-manager 2>&1 | grep "cn=testuser"
```

### Search by Time

```bash
# Logs from today
docker logs ldap-manager --since "2026-01-30" 2>&1

# Logs from last hour
docker logs ldap-manager --since 1h 2>&1

# Logs from last 30 minutes
docker logs ldap-manager --since 30m 2>&1
```

---

## 📋 Audit Log Entry Examples

### Example 1: Admin Configures Connection

```json
{
  "timestamp": "2026-01-30T07:53:49.958Z",
  "level": "INFO",
  "module": "app.api.connection",
  "function": "connect",
  "message": "LDAP connection configured by admin admin for cluster vibhuvioio.com"
}
```

**Shows**:
- ✅ Who configured it: admin
- ✅ When: 2026-01-30 07:53:49
- ✅ Which cluster: vibhuvioio.com

### Example 2: User Creates Entry

```json
{
  "timestamp": "2026-01-30T10:15:30.123Z",
  "level": "INFO",
  "module": "app.api.entries",
  "function": "create_entry",
  "message": "Entry created",
  "extra": {
    "user_id": "abc-123-def-456",
    "username": "editor",
    "cluster": "vibhuvioio.com",
    "dn": "cn=newuser,ou=People,dc=vibhuvioio,dc=com",
    "operation": "CREATE",
    "object_classes": ["inetOrgPerson", "posixAccount"]
  }
}
```

**Shows**:
- ✅ Who: editor (username) + abc-123-def-456 (Keycloak user ID)
- ✅ What: Created new entry
- ✅ Where: vibhuvioio.com cluster
- ✅ DN: cn=newuser,ou=People,dc=vibhuvioio,dc=com
- ✅ When: 2026-01-30 10:15:30

### Example 3: User Updates Entry

```json
{
  "timestamp": "2026-01-30T10:20:45.789Z",
  "level": "INFO",
  "module": "app.api.entries",
  "function": "update_entry",
  "message": "Entry updated",
  "extra": {
    "user_id": "abc-123-def-456",
    "username": "editor",
    "cluster": "vibhuvioio.com",
    "dn": "cn=existinguser,ou=People,dc=vibhuvioio,dc=com",
    "operation": "UPDATE",
    "modifications": {
      "mail": ["newemail@example.com"],
      "telephoneNumber": ["555-1234"]
    }
  }
}
```

**Shows**:
- ✅ Who: editor
- ✅ What: Updated email and phone
- ✅ Which entry: cn=existinguser
- ✅ New values: shown in modifications

### Example 4: User Tries Unauthorized Action

```json
{
  "timestamp": "2026-01-30T10:25:00.456Z",
  "level": "WARNING",
  "module": "app.core.rbac",
  "function": "require_roles",
  "message": "Access denied: insufficient permissions",
  "extra": {
    "user_id": "xyz-789-ghi-012",
    "username": "viewer",
    "required_roles": ["admin", "editor"],
    "user_roles": ["viewer"],
    "endpoint": "/api/entries/create"
  }
}
```

**Shows**:
- ✅ Who tried: viewer
- ✅ What they tried: Create entry (requires editor role)
- ✅ Result: DENIED (403 Forbidden)
- ✅ Why: viewer role doesn't have permission

### Example 5: Admin Deletes Entry

```json
{
  "timestamp": "2026-01-30T10:30:00.123Z",
  "level": "INFO",
  "module": "app.api.entries",
  "function": "delete_entry",
  "message": "Entry deleted",
  "extra": {
    "user_id": "admin-user-id",
    "username": "admin",
    "cluster": "vibhuvioio.com",
    "dn": "cn=olduser,ou=People,dc=vibhuvioio,dc=com",
    "operation": "DELETE"
  }
}
```

**Shows**:
- ✅ Who deleted: admin
- ✅ What was deleted: cn=olduser
- ✅ When: 2026-01-30 10:30:00

---

## 🔍 Practical Audit Queries

### Who Did What Today?

```bash
# Show all operations by all users today
docker logs ldap-manager --since "$(date +%Y-%m-%d)" 2>&1 | \
  grep -E "CREATE|UPDATE|DELETE|configured" | \
  grep -E "username|admin"
```

### What Happened to a Specific Entry?

```bash
# Track all changes to cn=testuser
docker logs ldap-manager 2>&1 | grep "cn=testuser,ou=People"
```

### Who Configured Which Clusters?

```bash
# See all connection configurations
docker logs ldap-manager 2>&1 | grep "LDAP connection configured"

# Example output:
# 2026-01-30 07:53:49 - INFO - LDAP connection configured by admin admin for cluster vibhuvioio.com
# 2026-01-30 08:10:22 - INFO - LDAP connection configured by admin alice for cluster vibhuvi.com
```

### Failed Authentication Attempts

```bash
# Backend: Failed JWT validation
docker logs ldap-manager 2>&1 | grep "JWT validation failed"

# Backend: Failed LDAP connection
docker logs ldap-manager 2>&1 | grep "Failed to connect"

# Keycloak: Failed logins (view in Keycloak admin console)
# Events → Login events → Filter by "LOGIN_ERROR"
```

### Activity Summary by User

```bash
# Count operations per user
docker logs ldap-manager 2>&1 | \
  grep -E "CREATE|UPDATE|DELETE" | \
  grep -oP '"username": "\K[^"]+' | \
  sort | uniq -c | sort -rn

# Example output:
#   15 admin
#    8 editor
#    2 viewer
```

### Activity Summary by Cluster

```bash
# Count operations per cluster
docker logs ldap-manager 2>&1 | \
  grep -E "CREATE|UPDATE|DELETE" | \
  grep -oP '"cluster": "\K[^"]+' | \
  sort | uniq -c | sort -rn

# Example output:
#   12 vibhuvioio.com
#    8 vibhuvi.com
#    5 oiocloud.com
```

---

## 📊 Log Formats

### Current Format (Structured)

```
YYYY-MM-DD HH:MM:SS,mmm - module - LEVEL - message
```

Example:
```
2026-01-30 07:53:49,958 - app.api.connection - INFO - LDAP connection configured by admin admin for cluster vibhuvioio.com
```

### JSON Format (Optional)

You can enable JSON logging for easier parsing:

```bash
# In .env file
JSON_LOGS=true
```

Then logs look like:
```json
{
  "timestamp": "2026-01-30T07:53:49.958Z",
  "level": "INFO",
  "logger": "app.api.connection",
  "message": "LDAP connection configured by admin admin for cluster vibhuvioio.com",
  "extra": {
    "user_id": "admin-user-id",
    "username": "admin",
    "cluster": "vibhuvioio.com"
  }
}
```

Benefits:
- ✅ Easier to parse with tools like jq
- ✅ Easier to export to logging systems
- ✅ Structured fields for searching

---

## 🛠️ Log Management

### Export Logs to File

```bash
# Export all logs
docker logs ldap-manager > /path/to/ldap-manager-$(date +%Y%m%d).log

# Export with timestamps
docker logs ldap-manager -t > /path/to/ldap-manager-$(date +%Y%m%d).log

# Export last 1000 lines
docker logs ldap-manager --tail 1000 > /path/to/recent.log
```

### Rotate Logs (Automatic)

Docker automatically rotates logs if configured:

```yaml
# docker-compose.yml
ldap-manager:
  logging:
    driver: "json-file"
    options:
      max-size: "10m"      # Max 10MB per file
      max-file: "3"        # Keep 3 files
```

### Forward Logs to External System

```yaml
# docker-compose.yml - Syslog example
ldap-manager:
  logging:
    driver: "syslog"
    options:
      syslog-address: "tcp://192.168.1.200:514"
      tag: "ldap-manager"
```

Or use ELK stack, Splunk, Datadog, etc.

---

## 📈 Monitoring Dashboard (Optional)

### Option 1: Simple Script

```bash
#!/bin/bash
# monitor.sh - Simple monitoring

echo "=== LDAP Manager Activity Summary ==="
echo ""
echo "Total operations today:"
docker logs ldap-manager --since "$(date +%Y-%m-%d)" 2>&1 | \
  grep -c -E "CREATE|UPDATE|DELETE"

echo ""
echo "By operation type:"
echo "  Creates: $(docker logs ldap-manager --since "$(date +%Y-%m-%d)" 2>&1 | grep -c CREATE)"
echo "  Updates: $(docker logs ldap-manager --since "$(date +%Y-%m-%d)" 2>&1 | grep -c UPDATE)"
echo "  Deletes: $(docker logs ldap-manager --since "$(date +%Y-%m-%d)" 2>&1 | grep -c DELETE)"

echo ""
echo "By user:"
docker logs ldap-manager --since "$(date +%Y-%m-%d)" 2>&1 | \
  grep -oP '"username": "\K[^"]+' | sort | uniq -c

echo ""
echo "Active connections:"
docker logs ldap-manager 2>&1 | \
  grep "LDAP connection configured" | tail -5
```

### Option 2: Web Dashboard (Future Enhancement)

Could add:
- `/api/stats/users` - Operations per user
- `/api/stats/clusters` - Operations per cluster
- `/api/stats/timeline` - Operations over time
- Frontend dashboard page

---

## 🎯 Summary - Where Everything Is

| Data Type | Location | How to Access |
|-----------|----------|---------------|
| **User accounts** | Keycloak database | http://localhost:8080 → Users |
| **User roles** | Keycloak database | http://localhost:8080 → Users → Role mapping |
| **Login sessions** | Keycloak database | http://localhost:8080 → Sessions |
| **Login events** | Keycloak database | http://localhost:8080 → Events |
| **LDAP operations** | Backend logs | `docker logs ldap-manager` |
| **Admin config** | Backend logs | `docker logs ldap-manager \| grep configured` |
| **Who did what** | Backend logs | `docker logs ldap-manager \| grep username` |
| **Errors/warnings** | Backend logs | `docker logs ldap-manager \| grep -E "ERROR\|WARNING"` |
| **LDAP passwords** | Encrypted cache | `/app/.cache/` (admin only, encrypted) |

---

## 🔐 Security Notes

### Audit Log Retention

**Current**: Docker logs kept until container removal

**Production**: Configure log rotation and archival
- Max 10MB per file
- Keep 3 files (30MB total)
- Archive older logs to external storage

### Sensitive Data in Logs

**What's NOT logged**:
- ❌ LDAP passwords
- ❌ JWT tokens (full value)
- ❌ Encryption keys
- ❌ User passwords

**What IS logged**:
- ✅ Usernames
- ✅ User IDs (Keycloak sub)
- ✅ Cluster names
- ✅ DN paths
- ✅ Operation types
- ✅ Timestamps

### Access Control

**Backend logs**: Only accessible to users with Docker/server access
**Keycloak events**: Only accessible to Keycloak admins

---

## 📝 Compliance & Reporting

### Generate Audit Report

```bash
#!/bin/bash
# audit-report.sh - Generate monthly audit report

MONTH=$(date +%Y-%m)
REPORT_FILE="audit-report-$MONTH.txt"

{
  echo "LDAP Manager Audit Report - $MONTH"
  echo "=========================================="
  echo ""

  echo "Summary Statistics"
  echo "------------------"
  echo "Total operations: $(docker logs ldap-manager 2>&1 | grep -c -E "CREATE|UPDATE|DELETE")"
  echo "  Creates: $(docker logs ldap-manager 2>&1 | grep -c CREATE)"
  echo "  Updates: $(docker logs ldap-manager 2>&1 | grep -c UPDATE)"
  echo "  Deletes: $(docker logs ldap-manager 2>&1 | grep -c DELETE)"
  echo ""

  echo "Activity by User"
  echo "----------------"
  docker logs ldap-manager 2>&1 | \
    grep -oP '"username": "\K[^"]+' | sort | uniq -c | sort -rn
  echo ""

  echo "Admin Configuration Actions"
  echo "---------------------------"
  docker logs ldap-manager 2>&1 | grep "LDAP connection configured"
  echo ""

  echo "Failed Operations"
  echo "-----------------"
  docker logs ldap-manager 2>&1 | grep -E "ERROR|Access denied" | head -20

} > "$REPORT_FILE"

echo "Report generated: $REPORT_FILE"
```

---

This guide shows you exactly where to find each piece of data and how to query the audit logs!

Test commands:
```bash
# See current logs
docker logs ldap-manager --tail 50

# See admin configuration
docker logs ldap-manager 2>&1 | grep "configured by admin"
```
