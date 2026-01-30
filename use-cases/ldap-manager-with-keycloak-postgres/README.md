# LDAP Manager with Keycloak + PostgreSQL (Enterprise Production Deployment)

## Overview

This is the **most production-ready deployment** for LDAP Manager with Keycloak authentication backed by PostgreSQL database. Designed for large-scale enterprise environments with high availability requirements.

### Features

✅ **PostgreSQL Backend** - Production-grade database for Keycloak
✅ **Horizontal Scaling** - Supports multiple Keycloak instances
✅ **High Availability** - Database replication and load balancing
✅ **Better Performance** - Faster than H2, optimized for large user bases
✅ **Enterprise Ready** - Backups, monitoring, security best practices
✅ **Full Authentication** - OAuth2/OIDC with role-based access control
✅ **Audit Trail** - Complete user activity tracking

---

## Use Cases

- 🏢 **Enterprise Environments** - Large organizations (> 100 users)
- 📈 **High Traffic** - High concurrent user load
- 🔄 **High Availability** - Zero-downtime requirements
- 🌐 **Multi-Instance** - Load-balanced Keycloak cluster
- 💼 **Mission-Critical** - Production SLA requirements
- 🔐 **Compliance** - SOC2, HIPAA, ISO27001

---

## Architecture

```
                        Load Balancer
                              ↓
                ┌─────────────┴─────────────┐
                ↓                           ↓
         Keycloak Instance 1         Keycloak Instance 2
                ↓                           ↓
                └─────────────┬─────────────┘
                              ↓
                      PostgreSQL Primary
                              ↓
                      PostgreSQL Replica
                              ↑
                              |
                        LDAP Manager
                              ↓
                        LDAP Servers
```

**Components:**
- **Keycloak:** Authentication server (supports multiple instances)
- **PostgreSQL:** Shared database for Keycloak (primary + replica)
- **LDAP Manager:** Application server (can scale horizontally)
- **Redis** (optional): Distributed rate limiting and session storage

---

## Quick Start (Single Instance)

### 1. Prerequisites

- Docker and Docker Compose installed
- 4GB+ RAM available
- LDAP Manager image built or pulled
- LDAP server(s) accessible

### 2. Setup

```bash
# Create deployment directory
mkdir -p /opt/ldap-manager-postgres
cd /opt/ldap-manager-postgres

# Copy files from use-case template
cp /path/to/ldap-manager/use-cases/ldap-manager-with-keycloak-postgres/* .

# Copy and configure environment
cp .env.example .env
nano .env
```

### 3. Configure Environment

Edit `.env` file with production credentials:

```bash
# PostgreSQL (CHANGE THESE!)
POSTGRES_DB=keycloak
POSTGRES_USER=keycloak
POSTGRES_PASSWORD=VerySecurePassword123!

# Keycloak Admin (CHANGE THESE!)
KEYCLOAK_ADMIN=admin
KEYCLOAK_ADMIN_PASSWORD=SuperSecurePassword456!

# Keycloak URLs
KEYCLOAK_URL=http://keycloak:8080
KEYCLOAK_ISSUER=http://localhost:8080/realms/ldap-manager
VITE_KEYCLOAK_URL=http://localhost:8080

# CORS
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:8000

# Logging
LOG_LEVEL=INFO
JSON_LOGS=true
```

### 4. Create LDAP Configuration

```bash
# Create config.yml
nano config.yml
```

```yaml
clusters:
  - name: "vibhuvioio.com"
    host: "ldap.vibhuvioio.com"
    port: 389
    bind_dn: "cn=Manager,dc=vibhuvioio,dc=com"
    base_dn: "dc=vibhuvioio,dc=com"
    readonly: false
    description: "Production LDAP Cluster"
```

### 5. Build Image (if needed)

```bash
# From main repository
cd /path/to/ldap-manager
docker build -f Dockerfile.prod -t ldap-manager:latest .
```

### 6. Deploy

```bash
# Start all services
docker-compose -f docker-compose.prod.yml up -d

# Monitor startup (Keycloak takes ~2 minutes)
docker-compose -f docker-compose.prod.yml logs -f keycloak

# Check all services are healthy
docker-compose -f docker-compose.prod.yml ps
```

### 7. Access

```
LDAP Manager: http://localhost:5173
Keycloak Admin: http://localhost:8080
```

**Test Users:**
- `admin` / `admin123` (full access)
- `editor` / `editor123` (read + write)
- `viewer` / `viewer123` (read-only)
- `auditor` / `auditor123` (logs only)

**⚠️ DELETE TEST USERS IN PRODUCTION!**

---

## Production Deployment with HTTPS

### Architecture Overview

```
Internet → Nginx/Caddy (HTTPS) → Keycloak (HTTP)
                                → LDAP Manager (HTTP)
                                → PostgreSQL (internal)
```

### Option 1: Nginx Reverse Proxy

**Install Nginx:**

```bash
sudo apt update
sudo apt install nginx certbot python3-certbot-nginx
```

**nginx.conf:**

```nginx
# Redirect HTTP to HTTPS
server {
    listen 80;
    server_name ldap.company.com auth.company.com;
    return 301 https://$server_name$request_uri;
}

# LDAP Manager
server {
    listen 443 ssl http2;
    server_name ldap.company.com;

    # SSL Configuration (Let's Encrypt)
    ssl_certificate /etc/letsencrypt/live/ldap.company.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/ldap.company.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # Security Headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;
    add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline';" always;

    # Compression
    gzip on;
    gzip_vary on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml;

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

        # Body size limit
        client_max_body_size 1M;
    }

    # Health check
    location /health {
        proxy_pass http://localhost:8000/health;
        access_log off;
    }

    # Logging
    access_log /var/log/nginx/ldap-manager-access.log combined buffer=16k;
    error_log /var/log/nginx/ldap-manager-error.log warn;
}

# Keycloak
server {
    listen 443 ssl http2;
    server_name auth.company.com;

    # SSL Configuration
    ssl_certificate /etc/letsencrypt/live/auth.company.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/auth.company.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # Security Headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;

    # Keycloak
    location / {
        proxy_pass http://localhost:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Forwarded-Port 443;

        # Keycloak requires larger buffers
        proxy_buffer_size 128k;
        proxy_buffers 4 256k;
        proxy_busy_buffers_size 256k;

        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # Logging
    access_log /var/log/nginx/keycloak-access.log combined buffer=16k;
    error_log /var/log/nginx/keycloak-error.log warn;
}
```

**Obtain SSL Certificates:**

```bash
# Get certificates for both domains
sudo certbot --nginx -d ldap.company.com -d auth.company.com

# Auto-renewal is configured automatically
sudo certbot renew --dry-run
```

**Deploy Nginx:**

```bash
# Copy nginx config
sudo cp nginx.conf /etc/nginx/sites-available/ldap-manager

# Enable site
sudo ln -s /etc/nginx/sites-available/ldap-manager /etc/nginx/sites-enabled/

# Test configuration
sudo nginx -t

# Reload nginx
sudo systemctl reload nginx
```

**Update .env for Production:**

```bash
# Stop containers
docker-compose -f docker-compose.prod.yml down

# Update .env
nano .env

# Set production URLs:
KC_HOSTNAME=auth.company.com
KEYCLOAK_ISSUER=https://auth.company.com/realms/ldap-manager
VITE_KEYCLOAK_URL=https://auth.company.com
ALLOWED_ORIGINS=https://ldap.company.com,https://auth.company.com

# Restart
docker-compose -f docker-compose.prod.yml up -d
```

---

## High Availability Setup

### Multi-Instance Keycloak with Load Balancer

**docker-compose-ha.yml:**

```yaml
version: '3.8'

services:
  postgres:
    # ... same as before

  keycloak-1:
    image: quay.io/keycloak/keycloak:24.0
    container_name: keycloak-1
    # ... same environment as single instance
    # No ports exposed (accessed via load balancer)
    networks:
      - ldap-network

  keycloak-2:
    image: quay.io/keycloak/keycloak:24.0
    container_name: keycloak-2
    # ... same environment as single instance
    networks:
      - ldap-network

  # Nginx load balancer for Keycloak
  keycloak-lb:
    image: nginx:alpine
    container_name: keycloak-lb
    ports:
      - "8080:80"
    volumes:
      - ./nginx-lb.conf:/etc/nginx/nginx.conf:ro
    depends_on:
      - keycloak-1
      - keycloak-2
    networks:
      - ldap-network

  # Redis for shared sessions
  redis:
    image: redis:7-alpine
    container_name: ldap-redis
    ports:
      - "6379:6379"
    volumes:
      - redis-data:/data
    networks:
      - ldap-network

  ldap-manager:
    # ... same as before
    environment:
      - KEYCLOAK_URL=http://keycloak-lb  # Use load balancer
      - REDIS_URL=redis://redis:6379  # Use Redis for rate limiting
```

**nginx-lb.conf:**

```nginx
events {
    worker_connections 1024;
}

http {
    upstream keycloak {
        least_conn;  # Load balancing algorithm
        server keycloak-1:8080 max_fails=3 fail_timeout=30s;
        server keycloak-2:8080 max_fails=3 fail_timeout=30s;
    }

    server {
        listen 80;

        location / {
            proxy_pass http://keycloak;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }
    }
}
```

### PostgreSQL Replication

**Primary-Replica Setup:**

1. Configure primary in docker-compose-ha.yml
2. Add replica configuration
3. Set up streaming replication
4. Use pgpool for automatic failover (advanced)

See PostgreSQL documentation for replication setup.

---

## Database Management

### PostgreSQL Backup

**Automated Daily Backup:**

```bash
#!/bin/bash
# /opt/backup-postgres.sh

BACKUP_DIR="/backup/postgresql"
DATE=$(date +%Y%m%d-%H%M%S)
KEEP_DAYS=30

# Create backup directory
mkdir -p $BACKUP_DIR

# Dump database
docker exec ldap-manager-postgres pg_dump -U keycloak keycloak \
  | gzip > $BACKUP_DIR/keycloak-$DATE.sql.gz

# Cleanup old backups
find $BACKUP_DIR -name "keycloak-*.sql.gz" -mtime +$KEEP_DAYS -delete

echo "Backup completed: $BACKUP_DIR/keycloak-$DATE.sql.gz"
```

**Add to crontab:**

```bash
# Daily backup at 2 AM
0 2 * * * /opt/backup-postgres.sh >> /var/log/postgres-backup.log 2>&1
```

### Restore from Backup

```bash
# Stop Keycloak
docker-compose -f docker-compose.prod.yml stop keycloak

# Restore database
gunzip < /backup/postgresql/keycloak-20260130-020000.sql.gz | \
  docker exec -i ldap-manager-postgres psql -U keycloak keycloak

# Start Keycloak
docker-compose -f docker-compose.prod.yml start keycloak
```

### Database Maintenance

```bash
# Check database size
docker exec ldap-manager-postgres psql -U keycloak -c "\l+"

# Vacuum (cleanup)
docker exec ldap-manager-postgres psql -U keycloak -c "VACUUM ANALYZE;"

# Check connections
docker exec ldap-manager-postgres psql -U keycloak -c \
  "SELECT count(*) FROM pg_stat_activity WHERE datname='keycloak';"
```

---

## Performance Tuning

### PostgreSQL Optimization

**postgresql.conf settings:**

```bash
# Create custom postgresql.conf
cat > postgresql-custom.conf <<EOF
# Memory Settings
shared_buffers = 256MB
effective_cache_size = 1GB
work_mem = 16MB
maintenance_work_mem = 128MB

# Connection Settings
max_connections = 200

# WAL Settings
wal_buffers = 16MB
checkpoint_completion_target = 0.9

# Query Planner
random_page_cost = 1.1  # For SSD
effective_io_concurrency = 200

# Logging
log_min_duration_statement = 1000  # Log slow queries (1 second)
EOF
```

**Mount in docker-compose:**

```yaml
postgres:
  volumes:
    - ./postgresql-custom.conf:/etc/postgresql/postgresql.conf
  command: postgres -c config_file=/etc/postgresql/postgresql.conf
```

### Keycloak Performance

**Increase memory:**

```yaml
keycloak:
  environment:
    - JAVA_OPTS_APPEND=-Xms1g -Xmx2g -XX:MetaspaceSize=256m -XX:MaxMetaspaceSize=512m
```

**Enable caching:**

Already enabled with `KC_CACHE=ispn` and `KC_CACHE_STACK=kubernetes`

---

## Monitoring & Alerting

### Prometheus + Grafana Stack

**docker-compose-monitoring.yml:**

```yaml
services:
  prometheus:
    image: prom/prometheus:latest
    container_name: prometheus
    ports:
      - "9090:9090"
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
      - prometheus-data:/prometheus
    networks:
      - ldap-network

  grafana:
    image: grafana/grafana:latest
    container_name: grafana
    ports:
      - "3000:3000"
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin
    volumes:
      - grafana-data:/var/lib/grafana
    networks:
      - ldap-network

  # PostgreSQL exporter
  postgres-exporter:
    image: prometheuscommunity/postgres-exporter:latest
    container_name: postgres-exporter
    environment:
      DATA_SOURCE_NAME: "postgresql://keycloak:password@postgres:5432/keycloak?sslmode=disable"
    networks:
      - ldap-network
```

**prometheus.yml:**

```yaml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'ldap-manager'
    static_configs:
      - targets: ['ldap-manager:8000']

  - job_name: 'postgres'
    static_configs:
      - targets: ['postgres-exporter:9187']
```

### Health Check Monitoring

```bash
#!/bin/bash
# /opt/health-check.sh

# Check all services
SERVICES="postgres keycloak ldap-manager"

for SERVICE in $SERVICES; do
    STATUS=$(docker inspect -f '{{.State.Health.Status}}' ldap-manager-$SERVICE 2>/dev/null)

    if [ "$STATUS" != "healthy" ]; then
        echo "ALERT: $SERVICE is not healthy (status: $STATUS)"
        # Send alert (email, Slack, PagerDuty, etc.)
    fi
done
```

**Add to crontab:**

```bash
# Check every 5 minutes
*/5 * * * * /opt/health-check.sh >> /var/log/health-check.log 2>&1
```

---

## Security Hardening

### PostgreSQL Security

1. **Enable SSL/TLS:**

```bash
# Generate certificates
openssl req -new -x509 -days 365 -nodes -text \
  -out server.crt -keyout server.key -subj "/CN=postgres"

# Set permissions
chmod 600 server.key
```

```yaml
postgres:
  volumes:
    - ./server.crt:/var/lib/postgresql/server.crt:ro
    - ./server.key:/var/lib/postgresql/server.key:ro
  command: postgres -c ssl=on -c ssl_cert_file=/var/lib/postgresql/server.crt -c ssl_key_file=/var/lib/postgresql/server.key
```

2. **Limit Connections:**

```yaml
postgres:
  environment:
    - POSTGRES_HOST_AUTH_METHOD=scram-sha-256
```

3. **Network Isolation:**

```yaml
networks:
  ldap-network:
    internal: true  # No external access
  public:
    driver: bridge

postgres:
  networks:
    - ldap-network  # Only internal network

ldap-manager:
  networks:
    - ldap-network
    - public
```

### Keycloak Security

1. **Change Default Passwords** (see .env)
2. **Enable Password Policies:**
   - Keycloak Admin → Realm Settings → Authentication → Policies
   - Minimum 12 characters
   - Require uppercase, lowercase, digits, special chars

3. **Enable MFA/2FA:**
   - Realm Settings → Authentication → Required Actions
   - Enable "Configure OTP"

4. **Session Security:**
   - Tokens → Access Token Lifespan: 15 minutes
   - Tokens → SSO Session Idle: 30 minutes
   - Tokens → SSO Session Max: 10 hours

---

## Troubleshooting

### PostgreSQL Connection Issues

```bash
# Check PostgreSQL logs
docker logs ldap-manager-postgres

# Test connection
docker exec ldap-manager-postgres psql -U keycloak -c "\conninfo"

# Check Keycloak can connect
docker exec ldap-manager-keycloak \
  curl -f jdbc:postgresql://postgres:5432/keycloak
```

### Keycloak Startup Slow

```bash
# Check memory
docker stats ldap-manager-keycloak

# Increase memory in docker-compose.prod.yml
# JAVA_OPTS_APPEND=-Xms2g -Xmx4g

# Check database initialization
docker logs ldap-manager-keycloak | grep "database"
```

### High Database Load

```bash
# Check slow queries
docker exec ldap-manager-postgres psql -U keycloak -c \
  "SELECT query, calls, total_time FROM pg_stat_statements ORDER BY total_time DESC LIMIT 10;"

# Check active connections
docker exec ldap-manager-postgres psql -U keycloak -c \
  "SELECT count(*), state FROM pg_stat_activity GROUP BY state;"
```

---

## Migration from H2 to PostgreSQL

```bash
# 1. Export H2 data from existing Keycloak
docker exec ldap-manager-keycloak /opt/keycloak/bin/kc.sh export \
  --file /tmp/keycloak-export.json --realm ldap-manager

docker cp ldap-manager-keycloak:/tmp/keycloak-export.json .

# 2. Stop H2-based deployment
docker-compose -f ../ldap-manager-with-keycloak/docker-compose.prod.yml down

# 3. Start PostgreSQL-based deployment
docker-compose -f docker-compose.prod.yml up -d postgres

# Wait for PostgreSQL to be ready
sleep 10

# 4. Import data to new Keycloak
docker cp keycloak-export.json ldap-manager-keycloak:/tmp/
docker exec ldap-manager-keycloak /opt/keycloak/bin/kc.sh import \
  --file /tmp/keycloak-export.json

# 5. Start Keycloak
docker-compose -f docker-compose.prod.yml up -d keycloak
```

---

## Scaling Guide

### Horizontal Scaling

1. **Multiple LDAP Manager Instances:**

```yaml
# Add to docker-compose
ldap-manager-2:
  # Same config as ldap-manager

# Nginx upstream
upstream ldap-backend {
    server ldap-manager-1:8000;
    server ldap-manager-2:8000;
}
```

2. **Load Balancer:**

Use nginx, HAProxy, or cloud load balancer (AWS ALB, GCP LB)

3. **Shared State:**

- Use Redis for rate limiting (already configured)
- LDAP password cache is per-instance (ok for admin-only config model)

---

## Cost Optimization

### Resource Limits

```yaml
# Minimal production setup
postgres:
  deploy:
    resources:
      limits:
        cpus: '1'
        memory: 512M

keycloak:
  deploy:
    resources:
      limits:
        cpus: '1'
        memory: 1G

ldap-manager:
  deploy:
    resources:
      limits:
        cpus: '1'
        memory: 512M
```

**Total:** ~2GB RAM, 3 CPU cores

### Cloud Deployment Costs

- **AWS:** t3.medium ($30/month) + RDS PostgreSQL ($15/month) = **$45/month**
- **GCP:** e2-medium ($25/month) + Cloud SQL ($10/month) = **$35/month**
- **DigitalOcean:** Droplet ($18/month) + Managed DB ($15/month) = **$33/month**

---

## Support & Documentation

- **Main Documentation:** https://vibhuvioio.github.io/ldap-manager/
- **Keycloak Docs:** https://www.keycloak.org/docs/latest/
- **PostgreSQL Docs:** https://www.postgresql.org/docs/
- **Issues:** https://github.com/VibhuviOiO/ldap-manager/issues

---

## License

Same as main LDAP Manager project.

---

**Deployment Status:** ✅ Enterprise Production Ready
**Security Level:** ✅ Very High (Auth + RBAC + PostgreSQL)
**Scalability:** ✅ Horizontal scaling supported
**Database:** PostgreSQL (production-grade)
**Recommended For:** Enterprise deployments, > 100 users, high availability requirements
