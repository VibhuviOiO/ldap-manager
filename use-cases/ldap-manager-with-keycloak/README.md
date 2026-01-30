# LDAP Manager with Keycloak Authentication (Production Deployment)

## Overview

This deployment mode provides **full authentication with Role-Based Access Control (RBAC)** using Keycloak as the identity provider. Best for production environments requiring user management and audit trails.

### Features

✅ **User Authentication** - OAuth2/OIDC login via Keycloak
✅ **Role-Based Access Control** - 4 roles (admin, editor, viewer, auditor)
✅ **Admin-Only LDAP Configuration** - Admins configure, all users share
✅ **Audit Trail** - All operations logged with usernames
✅ **Auto Token Refresh** - Seamless 15-min access, 7-day refresh tokens
✅ **Rate Limiting** - Built-in protection against abuse
✅ **Production-Ready** - HTTPS, monitoring, security best practices

---

## Use Cases

- 🏢 **Production Environments** - Corporate LDAP management
- 🌐 **External Access** - Internet-facing with authentication
- 👥 **Multi-User Teams** - Role-based permissions
- 📋 **Compliance** - Audit trail with usernames
- 🔐 **High Security** - JWT validation, encrypted passwords

---

## Architecture

```
Browser → Keycloak (OAuth2 Login) → JWT Token → LDAP Manager
                                                      ↓
                                        Validates JWT (JWKS)
                                                      ↓
                                        Role-Based Access Control
                                                      ↓
                                        LDAP Operations (admin-configured password)
```

**Key Points:**
- Keycloak manages users and authentication
- LDAP Manager validates JWT tokens
- Admin configures LDAP passwords (encrypted cache)
- All users share admin-configured LDAP connection
- Full audit trail with usernames

---

## User Roles & Permissions

| Role | Login | View | Create | Edit | Delete | Configure LDAP | Logs |
|------|-------|------|--------|------|--------|----------------|------|
| **Admin** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Editor** | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| **Viewer** | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Auditor** | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ |

### Admin-Only LDAP Configuration

**How it works:**
1. Admin logs in and selects a cluster
2. Admin enters LDAP password once
3. Password encrypted and cached (1-hour TTL)
4. All users (admin, editor, viewer) automatically use this connection
5. Non-admin users never see or enter LDAP passwords

---

## Quick Start

### 1. Prerequisites

- Docker and Docker Compose installed
- LDAP Manager image built or pulled
- LDAP server(s) accessible from Docker host
- Domain name (for production with HTTPS)

### 2. Setup

```bash
# Create deployment directory
mkdir -p /opt/ldap-manager-keycloak
cd /opt/ldap-manager-keycloak

# Copy files from use-case template
cp /path/to/ldap-manager/use-cases/ldap-manager-with-keycloak/* .

# Copy example config
cp .env.example .env

# Create LDAP config.yml
nano config.yml
```

### 3. Configure LDAP Connections

Edit `config.yml` (passwords will be configured by admin via UI):

```yaml
clusters:
  - name: "vibhuvioio.com"
    host: "ldap.vibhuvioio.com"
    port: 389
    bind_dn: "cn=Manager,dc=vibhuvioio,dc=com"
    # bind_password: ""  # Admin will configure via UI
    base_dn: "dc=vibhuvioio,dc=com"
    readonly: false
    description: "Production LDAP Cluster"

    # User creation form (for admin/editor roles)
    user_creation_form:
      base_ou: "ou=People,dc=vibhuvioio,dc=com"
      object_classes: [inetOrgPerson, posixAccount, shadowAccount]
      fields:
        - name: uid
          label: Username
          type: text
          required: true
        - name: cn
          label: Full Name
          type: text
          required: true
        # ... more fields
```

### 4. Environment Configuration

Edit `.env` file:

```bash
# Keycloak admin credentials (CHANGE IN PRODUCTION!)
KEYCLOAK_ADMIN=admin
KEYCLOAK_ADMIN_PASSWORD=SecurePassword123!

# Keycloak configuration
KEYCLOAK_URL=http://keycloak:8080
KEYCLOAK_ISSUER=http://localhost:8080/realms/ldap-manager
KEYCLOAK_REALM=ldap-manager
KEYCLOAK_CLIENT_ID=ldap-manager-client

# Frontend Keycloak (browser-accessible)
VITE_KEYCLOAK_URL=http://localhost:8080
VITE_KEYCLOAK_REALM=ldap-manager
VITE_KEYCLOAK_CLIENT_ID=ldap-manager-client

# CORS
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:8000

# Logging
LOG_LEVEL=INFO
JSON_LOGS=true
```

### 5. Build Image (if not already built)

```bash
# From main ldap-manager repository
cd /path/to/ldap-manager
docker build -f Dockerfile.prod -t ldap-manager:latest .
```

### 6. Deploy

```bash
# Start Keycloak and LDAP Manager
docker-compose -f docker-compose.prod.yml up -d

# Wait for Keycloak to be healthy (~90 seconds)
docker-compose -f docker-compose.prod.yml ps keycloak

# Check logs
docker logs -f ldap-manager-keycloak
docker logs -f ldap-manager-auth
```

### 7. Access Application

```
Frontend: http://localhost:5173
Keycloak Admin: http://localhost:8080
```

### 8. Test Login with Pre-configured Users

The realm-export.json includes test users:

| Username | Password | Role | Description |
|----------|----------|------|-------------|
| `admin` | `admin123` | admin | Full access + LDAP config |
| `editor` | `editor123` | editor | Read + write (no delete) |
| `viewer` | `viewer123` | viewer | Read-only |
| `auditor` | `auditor123` | auditor | Logs and monitoring |

**Login flow:**
1. Go to http://localhost:5173
2. Click login (redirects to Keycloak)
3. Enter username: `admin`, password: `admin123`
4. Redirected back to LDAP Manager with JWT token

**Configure LDAP as admin:**
1. Login as `admin`
2. Click on cluster "vibhuvioio.com"
3. Enter LDAP password: `changeme` (or your actual password)
4. Click "Connect"
5. Success! All users can now access this cluster.

**Test as viewer:**
1. Logout
2. Login as `viewer` / `viewer123`
3. Click on cluster "vibhuvioio.com"
4. No password prompt (admin already configured)
5. Can view entries, but cannot create/edit/delete

---

## Production Deployment

### Option 1: Nginx Reverse Proxy with HTTPS

**nginx.conf:**

```nginx
# Redirect HTTP to HTTPS
server {
    listen 80;
    server_name ldap.company.com auth.company.com;
    return 301 https://$server_name$request_uri;
}

# LDAP Manager (main app)
server {
    listen 443 ssl http2;
    server_name ldap.company.com;

    # SSL Configuration
    ssl_certificate /etc/nginx/ssl/ldap.company.com.crt;
    ssl_certificate_key /etc/nginx/ssl/ldap.company.com.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # Security Headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    # Frontend
    location / {
        proxy_pass http://localhost:5173;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Backend API
    location /api {
        proxy_pass http://localhost:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Timeouts
        proxy_connect_timeout 30s;
        proxy_send_timeout 30s;
        proxy_read_timeout 30s;
    }

    # Health check
    location /health {
        proxy_pass http://localhost:8000/health;
        access_log off;
    }

    # Logging
    access_log /var/log/nginx/ldap-manager-access.log combined;
    error_log /var/log/nginx/ldap-manager-error.log;
}

# Keycloak (authentication server)
server {
    listen 443 ssl http2;
    server_name auth.company.com;

    # SSL Configuration
    ssl_certificate /etc/nginx/ssl/auth.company.com.crt;
    ssl_certificate_key /etc/nginx/ssl/auth.company.com.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # Security Headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    # Keycloak
    location / {
        proxy_pass http://localhost:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host;

        # Required for Keycloak
        proxy_buffer_size 128k;
        proxy_buffers 4 256k;
        proxy_busy_buffers_size 256k;
    }

    # Logging
    access_log /var/log/nginx/keycloak-access.log combined;
    error_log /var/log/nginx/keycloak-error.log;
}
```

**Deploy with Nginx:**

```bash
# Copy nginx config
sudo cp nginx.conf /etc/nginx/sites-available/ldap-manager

# Enable site
sudo ln -s /etc/nginx/sites-available/ldap-manager /etc/nginx/sites-enabled/

# Test config
sudo nginx -t

# Reload nginx
sudo systemctl reload nginx

# Update .env with production URLs
nano .env
```

**Update .env for production:**

```bash
# Keycloak
KC_HOSTNAME=auth.company.com
KEYCLOAK_URL=http://keycloak:8080  # Internal URL
KEYCLOAK_ISSUER=https://auth.company.com/realms/ldap-manager
VITE_KEYCLOAK_URL=https://auth.company.com  # Public URL

# CORS
ALLOWED_ORIGINS=https://ldap.company.com,https://auth.company.com
```

```bash
# Restart containers
docker-compose -f docker-compose.prod.yml restart
```

### Option 2: Caddy Reverse Proxy (Automatic HTTPS)

**Caddyfile:**

```caddy
# LDAP Manager
ldap.company.com {
    # Frontend
    handle /* {
        reverse_proxy localhost:5173
    }

    # Backend API
    handle /api/* {
        reverse_proxy localhost:8000
    }

    # Health check
    handle /health {
        reverse_proxy localhost:8000
    }

    # Security headers
    header {
        X-Frame-Options "SAMEORIGIN"
        X-Content-Type-Options "nosniff"
        X-XSS-Protection "1; mode=block"
        Referrer-Policy "no-referrer-when-downgrade"
        Strict-Transport-Security "max-age=31536000; includeSubDomains"
    }

    # Logging
    log {
        output file /var/log/caddy/ldap-manager.log
        format json
    }
}

# Keycloak
auth.company.com {
    reverse_proxy localhost:8080 {
        header_up X-Forwarded-Host {host}
    }

    # Security headers
    header {
        X-Frame-Options "SAMEORIGIN"
        X-Content-Type-Options "nosniff"
        Referrer-Policy "no-referrer-when-downgrade"
        Strict-Transport-Security "max-age=31536000; includeSubDomains"
    }

    # Logging
    log {
        output file /var/log/caddy/keycloak.log
        format json
    }
}
```

**Deploy with Caddy:**

```bash
# Install Caddy
sudo apt install caddy

# Copy Caddyfile
sudo cp Caddyfile /etc/caddy/Caddyfile

# Reload Caddy
sudo systemctl reload caddy

# Update .env (same as nginx example above)
```

---

## Keycloak User Management

### Access Keycloak Admin Console

```
URL: http://localhost:8080 (or https://auth.company.com)
Username: admin (from KEYCLOAK_ADMIN env var)
Password: admin (from KEYCLOAK_ADMIN_PASSWORD env var)
```

### Create New Users

1. Login to Keycloak Admin Console
2. Select realm: "ldap-manager"
3. Go to "Users" → "Add user"
4. Fill in details:
   - Username: `jdoe`
   - Email: `jdoe@company.com`
   - First Name: `John`
   - Last Name: `Doe`
   - Email Verified: `Yes`
5. Click "Create"
6. Go to "Credentials" tab
   - Set temporary password: `TempPass123!`
   - Temporary: `Off` (or `On` to force password change on first login)
7. Go to "Role Mappings" tab
   - Client Roles: Select "ldap-manager-client"
   - Available Roles: Select role (admin, editor, viewer, or auditor)
   - Click "Add selected"

### Assign Roles to Existing Users

1. Go to "Users" → Find user → Click username
2. Go to "Role Mappings" tab
3. Client Roles: "ldap-manager-client"
4. Available Roles: Select role → "Add selected"

### Delete Test Users (Production)

**IMPORTANT:** Delete test users before production use!

1. Go to "Users"
2. Search for: admin, editor, viewer, auditor
3. Click each user → "Delete" button
4. Confirm deletion

---

## Monitoring & Maintenance

### Health Checks

```bash
# Check all containers
docker-compose -f docker-compose.prod.yml ps

# Check Keycloak health
curl http://localhost:8080/health/ready | jq

# Check LDAP Manager health
curl http://localhost:8000/health | jq
```

### View Logs

```bash
# Keycloak logs
docker logs -f ldap-manager-keycloak

# LDAP Manager logs
docker logs -f ldap-manager-auth

# Filter for user activity
docker logs ldap-manager-auth 2>&1 | jq 'select(.username)'

# Filter for LDAP operations
docker logs ldap-manager-auth 2>&1 | grep -E "CREATE|UPDATE|DELETE"
```

### Audit Trail

All operations include username in logs:

```json
{
  "timestamp": "2026-01-30T10:05:00Z",
  "level": "INFO",
  "module": "app.api.entries",
  "message": "Entry created",
  "extra": {
    "user_id": "abc-123-def-456",
    "username": "jdoe",
    "cluster": "vibhuvioio.com",
    "dn": "cn=newuser,ou=People,dc=vibhuvioio,dc=com",
    "operation": "CREATE"
  }
}
```

### Backup Keycloak Database

```bash
#!/bin/bash
# Backup H2 database

BACKUP_DIR="/backup/keycloak"
DATE=$(date +%Y%m%d-%H%M%S)

# Stop Keycloak (to ensure consistency)
docker-compose -f docker-compose.prod.yml stop keycloak

# Backup H2 database
docker run --rm \
  -v ldap-manager-with-keycloak_keycloak-data:/data \
  -v $BACKUP_DIR:/backup \
  alpine tar -czf /backup/keycloak-db-$DATE.tar.gz -C /data .

# Start Keycloak
docker-compose -f docker-compose.prod.yml start keycloak

echo "Backup completed: $BACKUP_DIR/keycloak-db-$DATE.tar.gz"
```

---

## Security Best Practices

### Production Checklist

- [ ] Change default Keycloak admin password
- [ ] Create real users in Keycloak
- [ ] Delete test users (admin, editor, viewer, auditor)
- [ ] Enable HTTPS via reverse proxy
- [ ] Use valid SSL certificates
- [ ] Configure firewall rules
- [ ] Enable rate limiting
- [ ] Set up log monitoring
- [ ] Regular backups (daily)
- [ ] Security audit logs review (weekly)
- [ ] Regular Keycloak updates

### Keycloak Hardening

1. **Change Admin Password:**
   ```bash
   # Update .env
   KEYCLOAK_ADMIN_PASSWORD=VerySecurePassword123!

   # Restart Keycloak
   docker-compose -f docker-compose.prod.yml restart keycloak
   ```

2. **Enable Email Verification:**
   - Keycloak Admin → Realm Settings → Login
   - Enable "Verify email"
   - Configure SMTP settings

3. **Password Policies:**
   - Keycloak Admin → Realm Settings → Authentication → Policies
   - Add policies: Minimum length, uppercase, lowercase, digits, special chars

4. **Session Timeouts:**
   - Keycloak Admin → Realm Settings → Tokens
   - SSO Session Idle: 30 minutes
   - SSO Session Max: 10 hours
   - Access Token Lifespan: 15 minutes

### LDAP Password Security

- Encrypted with Fernet (AES-128-CBC + HMAC)
- Stored in `/app/.cache` with 0600 permissions
- 1-hour TTL (auto-expiration)
- Admin-only configuration
- Never logged or sent to frontend

---

## Scaling Considerations

### Current Setup (H2 Database)

**Suitable for:**
- < 100 users
- Single instance deployment
- Development/testing
- Small teams

**Limitations:**
- No horizontal scaling
- Single point of failure
- File-based database (slower)

### Upgrade to PostgreSQL

For larger deployments (> 100 users), see:
```
use-cases/ldap-manager-with-keycloak-postgres/
```

**Benefits:**
- Multiple Keycloak instances (load balanced)
- Better performance
- Proper replication
- Production-grade database

---

## Troubleshooting

### Issue: "Invalid token" errors

**Check issuer mismatch:**

```bash
# Get issuer from token (login to get token first)
# In browser console:
# console.log(keycloakService.keycloak.tokenParsed.iss)

# Compare with KEYCLOAK_ISSUER in .env
docker exec ldap-manager-auth env | grep KEYCLOAK_ISSUER

# Update if mismatch
# .env: KEYCLOAK_ISSUER=https://auth.company.com/realms/ldap-manager
```

### Issue: Login redirect loop

**Check CORS and origins:**

```bash
# Verify ALLOWED_ORIGINS includes both app and Keycloak URLs
docker exec ldap-manager-auth env | grep ALLOWED_ORIGINS

# Should include both:
# ALLOWED_ORIGINS=https://ldap.company.com,https://auth.company.com
```

### Issue: Keycloak won't start

```bash
# Check logs
docker logs ldap-manager-keycloak

# Common issues:
# 1. Port 8080 already in use
sudo lsof -i :8080

# 2. Database corruption
docker-compose -f docker-compose.prod.yml down
docker volume rm ldap-manager-with-keycloak_keycloak-data
docker-compose -f docker-compose.prod.yml up -d
```

### Issue: User cannot configure LDAP connection

**Check role assignment:**

1. Login to Keycloak Admin Console
2. Users → Find user → Role Mappings
3. Verify user has "admin" role in "ldap-manager-client"

Only admin role can configure LDAP connections!

---

## Migration from Read-Write Mode

### Step-by-Step Migration

```bash
# 1. Stop read-write deployment
cd /opt/ldap-manager-readwrite
docker-compose -f docker-compose.prod.yml down

# 2. Backup data
tar -czf backup-$(date +%Y%m%d).tar.gz config.yml .env

# 3. Setup Keycloak deployment
mkdir -p /opt/ldap-manager-keycloak
cd /opt/ldap-manager-keycloak
cp /path/to/use-cases/ldap-manager-with-keycloak/* .

# 4. Copy config.yml (no changes needed)
cp /opt/ldap-manager-readwrite/config.yml .

# 5. Configure .env for Keycloak
cp .env.example .env
nano .env  # Update as needed

# 6. Start Keycloak deployment
docker-compose -f docker-compose.prod.yml up -d

# 7. Create users in Keycloak
# (see Keycloak User Management section)

# 8. Test login with new users

# 9. Migrate password cache (optional)
docker run --rm \
  -v ldap-manager-readwrite_ldap-cache:/old \
  -v ldap-manager-with-keycloak_ldap-cache:/new \
  alpine sh -c "cp -r /old/* /new/"
```

---

## FAQ

### Q: Can I use my existing LDAP for Keycloak users?

**A:** Yes! Configure Keycloak User Federation → LDAP:

1. Keycloak Admin → User Federation → Add Provider → LDAP
2. Configure LDAP connection (host, bind DN, base DN)
3. Users can now login with their LDAP credentials
4. Assign roles in Keycloak based on LDAP groups

### Q: How do I integrate with Active Directory?

**A:** Similar to LDAP federation:

1. User Federation → Add Provider → LDAP
2. Vendor: "Active Directory"
3. Connection URL: `ldap://ad.company.com`
4. Users DN: `CN=Users,DC=company,DC=com`
5. Bind DN: `CN=ServiceAccount,CN=Users,DC=company,DC=com`

### Q: Can I have multiple admins?

**A:** Yes! Assign "admin" role to multiple users in Keycloak.

### Q: What happens when admin leaves?

**A:** Create another admin user before they leave, or use Keycloak admin console to assign admin role to someone else.

### Q: How do I enable 2FA?

**A:** Keycloak supports OTP:

1. Realm Settings → Authentication → Required Actions
2. Enable "Configure OTP"
3. Users will be prompted to set up 2FA on next login

### Q: Can I customize the login page?

**A:** Yes! Keycloak supports custom themes:

1. Create custom theme in Keycloak
2. Realm Settings → Themes → Login Theme
3. See Keycloak documentation for theme development

---

## Support

- **Documentation:** https://vibhuvioio.github.io/ldap-manager/
- **Keycloak Docs:** https://www.keycloak.org/docs/latest/
- **Issues:** https://github.com/VibhuviOiO/ldap-manager/issues
- **Main README:** ../../README.md

---

## License

Same as main LDAP Manager project.

---

**Deployment Status:** ✅ Production Ready
**Security Level:** ✅ High (Authentication + RBAC)
**Recommended For:** Production environments, external access, compliance requirements
**Database:** H2 (embedded, suitable for < 100 users)
**Upgrade Path:** See `ldap-manager-with-keycloak-postgres` for PostgreSQL backend
