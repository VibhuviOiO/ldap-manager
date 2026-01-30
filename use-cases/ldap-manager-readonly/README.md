# LDAP Manager - Read-Only Mode (Production Deployment)

## Overview

This deployment mode provides **anonymous read-only access** to LDAP directories without requiring user authentication. Perfect for public dashboards, monitoring displays, and network operations centers.

### Features

✅ **No Authentication Required** - Direct access without login
✅ **Read-Only Access** - View entries, search, statistics
❌ **No Write Operations** - Cannot create, edit, or delete
✅ **Lightweight** - ~200MB memory, fast startup
✅ **Secure** - All write operations blocked at API level

---

## Use Cases

- 📊 **Public Dashboards** - Display directory statistics and monitoring
- 🖥️ **NOC Displays** - Network operations center screens
- 🔍 **Directory Browser** - Self-service directory lookup
- 📺 **Kiosks** - Shared terminals in public areas
- 📈 **Reporting** - Read-only access for compliance/reporting tools

---

## Architecture

```
Browser → LDAP Manager (Read-Only) → LDAP Servers
          (No Authentication)           (Pre-configured password)
```

**Key Points:**
- No Keycloak server needed
- LDAP passwords pre-configured in `config.yml`
- All users have viewer-level access only
- Faster startup (~10s vs ~90s with Keycloak)

---

## Quick Start

### 1. Prerequisites

- Docker and Docker Compose installed
- LDAP Manager image built or pulled
- LDAP server(s) accessible from Docker host

### 2. Setup

```bash
# Create deployment directory
mkdir -p /opt/ldap-manager-readonly
cd /opt/ldap-manager-readonly

# Copy files from use-case template
cp /path/to/ldap-manager/use-cases/ldap-manager-readonly/* .

# Copy example config
cp .env.example .env

# Create config.yml with LDAP passwords
nano config.yml
```

### 3. Configure LDAP Connections

Edit `config.yml` and **include LDAP passwords** (required for read-only mode):

```yaml
clusters:
  - name: "vibhuvioio.com"
    host: "ldap.vibhuvioio.com"
    port: 389
    bind_dn: "cn=Manager,dc=vibhuvioio,dc=com"
    bind_password: "your-ldap-password"  # REQUIRED in read-only mode
    base_dn: "dc=vibhuvioio,dc=com"
    readonly: false
    description: "Production LDAP Cluster"

    # Optional: Custom table columns for read-only display
    table_columns:
      users:
        - name: uid
          label: Username
          default_visible: true
        - name: cn
          label: Full Name
          default_visible: true
        - name: mail
          label: Email
          default_visible: true
```

**Important:** Since users cannot configure LDAP connections in read-only mode, passwords MUST be in `config.yml`.

### 4. Environment Configuration

Edit `.env` file:

```bash
# Deployment mode (DO NOT CHANGE)
AUTH_MODE=legacy
READONLY_MODE=true

# CORS - Update with your domain
ALLOWED_ORIGINS=https://ldap.company.com,https://ldap-backup.company.com

# Logging
LOG_LEVEL=INFO
JSON_LOGS=true

# UI Footer
VITE_FOOTER_TEXT=LDAP Directory Browser (Read-Only)
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
docker logs -f ldap-manager-readonly
```

### 7. Access Application

```
http://localhost:5173
```

For production, use reverse proxy (see Production Deployment section below).

---

## Production Deployment

### Option 1: Nginx Reverse Proxy with HTTPS

**nginx.conf:**

```nginx
server {
    listen 80;
    server_name ldap.company.com;
    return 301 https://$server_name$request_uri;
}

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

    # Frontend (React app)
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

    # Health check endpoint
    location /health {
        proxy_pass http://localhost:8000/health;
        access_log off;
    }
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
ALLOWED_ORIGINS=https://ldap.company.com
```

### Option 2: Caddy Reverse Proxy (Automatic HTTPS)

**Caddyfile:**

```caddy
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
    }

    # Logging
    log {
        output file /var/log/caddy/ldap-manager.log
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

# Update .env
ALLOWED_ORIGINS=https://ldap.company.com
```

---

## Security Considerations

### ⚠️ Important Security Notes

1. **Public Read Access**
   - Anyone with network access can VIEW all LDAP data
   - Suitable for non-sensitive data or trusted networks only
   - For sensitive data, deploy behind VPN or firewall

2. **LDAP Passwords in config.yml**
   - Passwords stored in plaintext in config.yml
   - Set file permissions: `chmod 600 config.yml`
   - Mount as read-only: `-v ./config.yml:/app/config.yml:ro`

3. **Network Security**
   - Use firewall rules to restrict access
   - Deploy in DMZ or isolated network segment
   - Monitor access logs regularly

4. **HTTPS Required**
   - Always use HTTPS for production
   - Use reverse proxy (nginx/Caddy)
   - Valid SSL certificate recommended

### Firewall Configuration

```bash
# Allow only specific IPs (example)
sudo ufw allow from 192.168.1.0/24 to any port 5173
sudo ufw allow from 10.0.0.0/8 to any port 5173

# Or allow only via reverse proxy (local access only)
sudo ufw deny 5173
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
```

---

## Monitoring & Maintenance

### Health Check

```bash
# Check container health
docker-compose -f docker-compose.prod.yml ps

# Manual health check
curl http://localhost:8000/health | jq

# Expected response:
# {
#   "status": "healthy",
#   "version": "2.0.0",
#   "mode": "read-only"
# }
```

### Log Monitoring

```bash
# View logs
docker logs -f ldap-manager-readonly

# Search for errors
docker logs ldap-manager-readonly 2>&1 | grep -i error

# View access logs (JSON format)
docker logs ldap-manager-readonly 2>&1 | jq 'select(.level=="INFO" and .module=="app.main")'
```

### Automated Monitoring

**Prometheus metrics endpoint (optional):**

Add to docker-compose.prod.yml:

```yaml
    labels:
      - "prometheus.scrape=true"
      - "prometheus.port=8000"
      - "prometheus.path=/metrics"
```

**Uptime monitoring:**

```bash
# Add to crontab (check every 5 minutes)
*/5 * * * * curl -f http://localhost:8000/health || systemctl restart ldap-manager-readonly
```

---

## Troubleshooting

### Container won't start

```bash
# Check logs
docker logs ldap-manager-readonly

# Common issues:
# 1. Port already in use
sudo lsof -i :5173
sudo lsof -i :8000

# 2. Config file not found
ls -la config.yml

# 3. Invalid config.yml
docker run --rm -v $(pwd)/config.yml:/app/config.yml ldap-manager:latest python -c "
from app.core.config import load_config
config = load_config('/app/config.yml')
print('Config valid!')
"
```

### LDAP connection fails

```bash
# Test LDAP connectivity from container
docker exec ldap-manager-readonly ldapsearch -x \
  -H ldap://ldap.vibhuvioio.com:389 \
  -D "cn=Manager,dc=vibhuvioio,dc=com" \
  -w "your-password" \
  -b "dc=vibhuvioio,dc=com" \
  "(uid=*)" uid

# Check if password is configured
docker exec ldap-manager-readonly cat /app/config.yml | grep bind_password
```

### CORS errors in browser

```bash
# Check ALLOWED_ORIGINS
docker exec ldap-manager-readonly env | grep ALLOWED_ORIGINS

# Update .env and restart
nano .env
docker-compose -f docker-compose.prod.yml restart
```

### High memory usage

```bash
# Check resource usage
docker stats ldap-manager-readonly

# Reduce resource limits in docker-compose.prod.yml
# Current: 1G limit, 256M reservation
# Adjust based on your needs
```

---

## Backup & Restore

### Backup

```bash
# Backup configuration
tar -czf ldap-manager-readonly-backup-$(date +%Y%m%d).tar.gz \
  config.yml \
  .env \
  docker-compose.prod.yml

# Backup cache (optional)
docker run --rm \
  -v ldap-manager-readonly_ldap-cache:/cache \
  -v $(pwd):/backup \
  alpine tar -czf /backup/cache-backup-$(date +%Y%m%d).tar.gz -C /cache .
```

### Restore

```bash
# Extract backup
tar -xzf ldap-manager-readonly-backup-YYYYMMDD.tar.gz

# Restore cache (optional)
docker run --rm \
  -v ldap-manager-readonly_ldap-cache:/cache \
  -v $(pwd):/backup \
  alpine tar -xzf /backup/cache-backup-YYYYMMDD.tar.gz -C /cache
```

---

## Upgrading

```bash
# Pull new image
docker pull ldap-manager:latest

# Stop container
docker-compose -f docker-compose.prod.yml down

# Start with new image
docker-compose -f docker-compose.prod.yml up -d

# Check logs
docker logs -f ldap-manager-readonly
```

---

## Performance Tuning

### For Large Directories (>10,000 entries)

Update docker-compose.prod.yml:

```yaml
    deploy:
      resources:
        limits:
          cpus: '4'
          memory: 2G
        reservations:
          cpus: '1'
          memory: 512M
```

### Enable Connection Pooling

Already enabled by default. Check logs:

```bash
docker logs ldap-manager-readonly 2>&1 | grep "connection pool"
```

---

## FAQ

### Q: Can users still configure LDAP connections?

**A:** No, the `/api/connection/connect` endpoint returns 403 Forbidden in read-only mode.

### Q: What happens if I don't include bind_password in config.yml?

**A:** LDAP operations will fail with "Authentication required" error since users cannot configure passwords.

### Q: Can I expose this to the public internet?

**A:** Only if the LDAP data is non-sensitive (e.g., public directory). For sensitive data, use VPN or firewall restrictions.

### Q: How do I switch to read-write mode?

**A:** See `use-cases/ldap-manager-read-write/` for read-write deployment configuration.

### Q: How do I add authentication?

**A:** See `use-cases/ldap-manager-with-keycloak/` for authenticated deployment.

---

## Support

- **Documentation:** https://vibhuvioio.github.io/ldap-manager/
- **Issues:** https://github.com/VibhuviOiO/ldap-manager/issues
- **Main README:** ../../README.md

---

## License

Same as main LDAP Manager project.

---

**Deployment Status:** ✅ Production Ready
**Security Level:** ⚠️ Medium (Read-only, but no authentication)
**Recommended For:** Internal networks, public dashboards with non-sensitive data
