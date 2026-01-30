# LDAP Manager - Read-Write Mode (Production Deployment)

## Overview

This deployment mode provides **anonymous full admin access** to LDAP directories without requiring user authentication. This is **V1 compatibility mode** for trusted internal networks.

### Features

✅ **No Authentication Required** - Direct access without login
✅ **Full Admin Access** - Create, read, update, delete operations
✅ **LDAP Configuration** - Users can configure LDAP connections
✅ **Lightweight** - ~200MB memory, fast startup
⚠️ **NO ACCESS CONTROL** - Everyone has admin privileges

---

## ⚠️ CRITICAL SECURITY WARNING

**This mode provides UNRESTRICTED ACCESS to LDAP directories.**

- ❌ **DO NOT expose to public internet**
- ❌ **DO NOT use for sensitive production data without proper network security**
- ✅ **DO use behind VPN or firewall**
- ✅ **DO implement IP whitelisting**
- ✅ **DO enable audit logging and monitoring**

**Recommended:** Consider using `ldap-manager-with-keycloak` for production deployments requiring user authentication and role-based access control.

---

## Use Cases

- 🏢 **Internal Corporate Networks** - Trusted users only, VPN access
- 🔧 **Development Environments** - Testing and development
- 👥 **Small Teams** - Known users (< 10 people)
- 🔒 **Air-Gapped Networks** - Isolated from internet
- 📦 **V1 Migration** - Compatibility with LDAP Manager V1

---

## Architecture

```
Browser → LDAP Manager (Full Access) → LDAP Servers
          (No Authentication)            (User-configured password)
```

**Key Points:**
- No Keycloak server needed
- Users configure LDAP passwords via UI (encrypted cache)
- All users have admin privileges
- Generic audit logs (username: "legacy")

---

## Quick Start

### 1. Prerequisites

- Docker and Docker Compose installed
- LDAP Manager image built or pulled
- LDAP server(s) accessible from Docker host
- **Firewall or VPN configured** (required for security)

### 2. Setup

```bash
# Create deployment directory
mkdir -p /opt/ldap-manager-readwrite
cd /opt/ldap-manager-readwrite

# Copy files from use-case template
cp /path/to/ldap-manager/use-cases/ldap-manager-read-write/* .

# Copy example config
cp .env.example .env

# Create config.yml (passwords optional - can configure via UI)
nano config.yml
```

### 3. Configure LDAP Connections

Edit `config.yml`. Passwords are **optional** (users can configure via UI):

```yaml
clusters:
  - name: "vibhuvioio.com"
    host: "ldap.vibhuvioio.com"
    port: 389
    bind_dn: "cn=Manager,dc=vibhuvioio,dc=com"
    # bind_password: "changeme"  # Optional - can configure via UI
    base_dn: "dc=vibhuvioio,dc=com"
    readonly: false
    description: "Production LDAP Cluster"

    # User creation form
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
        - name: mail
          label: Email
          type: email
          required: true
        - name: userPassword
          label: Password
          type: password
          required: true
```

### 4. Environment Configuration

Edit `.env` file:

```bash
# Deployment mode (DO NOT CHANGE)
AUTH_MODE=legacy
READONLY_MODE=false

# CORS - Update with your domain
ALLOWED_ORIGINS=https://ldap.company.internal,https://ldap-backup.company.internal

# Logging
LOG_LEVEL=INFO
JSON_LOGS=true

# UI Footer
VITE_FOOTER_TEXT=LDAP Manager (Internal Use Only)
```

### 5. Build Image (if not already built)

```bash
# From main ldap-manager repository
cd /path/to/ldap-manager
docker build -f Dockerfile.prod -t ldap-manager:latest .
```

### 6. Deploy

```bash
# Start container
docker-compose -f docker-compose.prod.yml up -d

# Check health
docker-compose -f docker-compose.prod.yml ps

# View logs
docker logs -f ldap-manager-readwrite
```

### 7. Access Application

```
http://localhost:5173
```

**For production, MUST use reverse proxy + firewall** (see Production Deployment section).

---

## Production Deployment (REQUIRED SECURITY)

### Step 1: Firewall Configuration (MANDATORY)

**Option A: IP Whitelist (Recommended)**

```bash
# Allow specific office network
sudo ufw allow from 192.168.1.0/24 to any port 5173
sudo ufw allow from 192.168.1.0/24 to any port 8000

# Allow specific VPN subnet
sudo ufw allow from 10.8.0.0/24 to any port 5173
sudo ufw allow from 10.8.0.0/24 to any port 8000

# Deny all other access
sudo ufw deny 5173
sudo ufw deny 8000

# Allow reverse proxy (HTTPS only)
sudo ufw allow 443/tcp

# Enable firewall
sudo ufw enable
```

**Option B: VPN Required**

```bash
# Install WireGuard VPN
sudo apt install wireguard

# Configure VPN server
# Only allow access via VPN tunnel

# Block direct access
sudo ufw deny 5173
sudo ufw deny 8000
```

### Step 2: Reverse Proxy with HTTPS (REQUIRED)

**Nginx Configuration:**

```nginx
server {
    listen 80;
    server_name ldap.company.internal;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name ldap.company.internal;

    # SSL Configuration
    ssl_certificate /etc/nginx/ssl/ldap.company.internal.crt;
    ssl_certificate_key /etc/nginx/ssl/ldap.company.internal.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # Security Headers
    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "no-referrer" always;
    add_header Content-Security-Policy "default-src 'self';" always;

    # Rate Limiting (IMPORTANT)
    limit_req_zone $binary_remote_addr zone=ldap_limit:10m rate=10r/s;
    limit_req zone=ldap_limit burst=20 nodelay;

    # IP Whitelist (additional layer)
    allow 192.168.1.0/24;  # Office network
    allow 10.8.0.0/24;      # VPN
    deny all;

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

        # Additional security
        client_max_body_size 1M;
    }

    # Access logging (IMPORTANT for audit)
    access_log /var/log/nginx/ldap-manager-access.log combined;
    error_log /var/log/nginx/ldap-manager-error.log;
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

# Update .env
ALLOWED_ORIGINS=https://ldap.company.internal
```

### Step 3: Monitoring & Alerting (REQUIRED)

**Install monitoring stack:**

```bash
# Install fail2ban for intrusion detection
sudo apt install fail2ban

# Configure fail2ban for nginx
cat > /etc/fail2ban/jail.local <<EOF
[nginx-limit-req]
enabled = true
filter = nginx-limit-req
logpath = /var/log/nginx/ldap-manager-error.log
maxretry = 5
findtime = 60
bantime = 3600
EOF

sudo systemctl restart fail2ban
```

**Log monitoring:**

```bash
# Monitor all API write operations
docker logs -f ldap-manager-readwrite 2>&1 | grep -E "CREATE|UPDATE|DELETE"

# Set up alerts for suspicious activity
# (integrate with your monitoring system)
```

---

## Security Considerations

### ⚠️ Critical Security Requirements

1. **Firewall MANDATORY**
   - IP whitelist MUST be configured
   - Deny all by default, allow specific IPs only
   - Use VPN for remote access

2. **HTTPS MANDATORY**
   - All communication must be encrypted
   - Use valid SSL certificates
   - Enforce TLS 1.2+ only

3. **Network Isolation**
   - Deploy in isolated VLAN or DMZ
   - No direct internet exposure
   - Use jump hosts for access

4. **Audit Logging**
   - Enable JSON_LOGS=true
   - Ship logs to SIEM (Splunk, ELK, etc.)
   - Monitor for unauthorized changes
   - Set up alerts for CREATE/UPDATE/DELETE operations

5. **Access Control**
   - Limit to specific IP addresses
   - Use VPN for remote access
   - Regular access reviews
   - Disable when not needed

6. **Password Security**
   - LDAP passwords encrypted with Fernet (AES-128-CBC)
   - Cache files protected with 0600 permissions
   - 1-hour TTL (auto-expiration)
   - Regular password rotation

### Security Checklist

- [ ] Firewall configured with IP whitelist
- [ ] HTTPS enabled via reverse proxy
- [ ] VPN configured for remote access
- [ ] Audit logging enabled (JSON_LOGS=true)
- [ ] Log monitoring and alerting set up
- [ ] fail2ban or similar IDS deployed
- [ ] Network isolated (VLAN/DMZ)
- [ ] Regular backups configured
- [ ] Security audits scheduled
- [ ] Incident response plan documented

---

## Monitoring & Maintenance

### Health Monitoring

```bash
# Check container health
docker-compose -f docker-compose.prod.yml ps

# Manual health check
curl http://localhost:8000/health | jq

# Expected response:
# {
#   "status": "healthy",
#   "version": "2.0.0",
#   "mode": "read-write",
#   "auth_mode": "legacy"
# }
```

### Audit Log Monitoring

```bash
# Monitor CREATE operations
docker logs ldap-manager-readwrite 2>&1 | grep "operation.*CREATE"

# Monitor UPDATE operations
docker logs ldap-manager-readwrite 2>&1 | grep "operation.*UPDATE"

# Monitor DELETE operations (CRITICAL)
docker logs ldap-manager-readwrite 2>&1 | grep "operation.*DELETE"

# Monitor LDAP connection configuration
docker logs ldap-manager-readwrite 2>&1 | grep "LDAP connection configured"
```

### Real-time Monitoring Dashboard

**Grafana + Loki:**

```yaml
# Add to docker-compose.prod.yml
  loki:
    image: grafana/loki:latest
    ports:
      - "3100:3100"
    volumes:
      - loki-data:/loki

  grafana:
    image: grafana/grafana:latest
    ports:
      - "3000:3000"
    environment:
      - GF_AUTH_ANONYMOUS_ENABLED=false
    volumes:
      - grafana-data:/var/lib/grafana
```

---

## Backup & Disaster Recovery

### Daily Automated Backup

```bash
#!/bin/bash
# /opt/ldap-manager-backup.sh

BACKUP_DIR="/backup/ldap-manager"
DATE=$(date +%Y%m%d-%H%M%S)

# Backup configuration
mkdir -p $BACKUP_DIR/$DATE
cp /opt/ldap-manager-readwrite/config.yml $BACKUP_DIR/$DATE/
cp /opt/ldap-manager-readwrite/.env $BACKUP_DIR/$DATE/
cp /opt/ldap-manager-readwrite/docker-compose.prod.yml $BACKUP_DIR/$DATE/

# Backup password cache
docker run --rm \
  -v ldap-manager-readwrite_ldap-cache:/cache \
  -v $BACKUP_DIR/$DATE:/backup \
  alpine tar -czf /backup/cache.tar.gz -C /cache .

# Backup secrets
docker run --rm \
  -v ldap-manager-readwrite_ldap-secrets:/secrets \
  -v $BACKUP_DIR/$DATE:/backup \
  alpine tar -czf /backup/secrets.tar.gz -C /secrets .

# Retention: Keep last 30 days
find $BACKUP_DIR -type d -mtime +30 -exec rm -rf {} \;

echo "Backup completed: $BACKUP_DIR/$DATE"
```

**Add to crontab:**

```bash
# Daily backup at 2 AM
0 2 * * * /opt/ldap-manager-backup.sh >> /var/log/ldap-manager-backup.log 2>&1
```

### Restore from Backup

```bash
BACKUP_DATE="20260130-020000"
BACKUP_DIR="/backup/ldap-manager/$BACKUP_DATE"

# Stop container
docker-compose -f docker-compose.prod.yml down

# Restore configuration
cp $BACKUP_DIR/config.yml /opt/ldap-manager-readwrite/
cp $BACKUP_DIR/.env /opt/ldap-manager-readwrite/

# Restore cache
docker run --rm \
  -v ldap-manager-readwrite_ldap-cache:/cache \
  -v $BACKUP_DIR:/backup \
  alpine tar -xzf /backup/cache.tar.gz -C /cache

# Restore secrets
docker run --rm \
  -v ldap-manager-readwrite_ldap-secrets:/secrets \
  -v $BACKUP_DIR:/backup \
  alpine tar -xzf /backup/secrets.tar.gz -C /secrets

# Start container
docker-compose -f docker-compose.prod.yml up -d
```

---

## Upgrading

### Standard Upgrade

```bash
# Pull new image
docker pull ldap-manager:latest

# Backup current deployment
/opt/ldap-manager-backup.sh

# Stop container
docker-compose -f docker-compose.prod.yml down

# Start with new image
docker-compose -f docker-compose.prod.yml up -d

# Check logs
docker logs -f ldap-manager-readwrite

# Test functionality
curl http://localhost:8000/health
```

### Rollback

```bash
# Use previous image tag
docker pull ldap-manager:1.0.0

# Update docker-compose.prod.yml
sed -i 's/ldap-manager:latest/ldap-manager:1.0.0/' docker-compose.prod.yml

# Restart
docker-compose -f docker-compose.prod.yml up -d
```

---

## Migrating to Keycloak Mode (Recommended)

For better security, migrate to Keycloak authentication mode:

```bash
# Stop current deployment
docker-compose -f docker-compose.prod.yml down

# Copy Keycloak use-case template
cp -r /path/to/ldap-manager/use-cases/ldap-manager-with-keycloak/* /opt/ldap-manager-keycloak/

# Follow Keycloak setup guide
cd /opt/ldap-manager-keycloak
# See README.md in that directory
```

---

## Troubleshooting

### Issue: Unauthorized access detected

```bash
# Check access logs
sudo tail -f /var/log/nginx/ldap-manager-access.log

# Check fail2ban bans
sudo fail2ban-client status nginx-limit-req

# Block suspicious IP
sudo ufw deny from <IP_ADDRESS>

# Review audit logs
docker logs ldap-manager-readwrite 2>&1 | grep <IP_ADDRESS>
```

### Issue: LDAP password cache expired

```bash
# Check cache status
curl http://localhost:8000/api/password/check/vibhuvioio.com

# Re-configure via UI
# Navigate to cluster → Enter LDAP password → Connect
```

### Issue: High memory usage

```bash
# Check stats
docker stats ldap-manager-readwrite

# Check for connection leaks
docker logs ldap-manager-readwrite 2>&1 | grep "connection pool"

# Restart if needed
docker restart ldap-manager-readwrite
```

---

## FAQ

### Q: Is this mode safe for production?

**A:** Only if deployed behind firewall/VPN with IP whitelisting. Not recommended for internet-facing deployments.

### Q: Who can access the system?

**A:** Anyone with network access. There is NO authentication or authorization.

### Q: Can I audit who made changes?

**A:** Audit logs show "legacy" as username. For user-specific audit trail, use Keycloak mode.

### Q: Should I use this or Keycloak mode?

**A:** Use Keycloak mode for:
- Production environments
- External access
- Compliance requirements (audit trail with usernames)
- Role-based access control

Use Read-Write mode only for:
- Trusted internal networks
- Small teams (< 10 people)
- Development environments

### Q: How do I add authentication?

**A:** Migrate to Keycloak mode (see `use-cases/ldap-manager-with-keycloak/`).

---

## Support

- **Documentation:** https://vibhuvioio.github.io/ldap-manager/
- **Issues:** https://github.com/VibhuviOiO/ldap-manager/issues
- **Main README:** ../../README.md

---

## License

Same as main LDAP Manager project.

---

**Deployment Status:** ⚠️ Production Ready with SECURITY REQUIREMENTS
**Security Level:** ❌ Low (No authentication, firewall MANDATORY)
**Recommended For:** Trusted internal networks only, NOT for public internet
**Better Alternative:** `ldap-manager-with-keycloak` for production use
