# LDAP Manager - Production Deployment Use Cases

## Overview

This directory contains **four production-ready deployment configurations** for LDAP Manager, each optimized for different use cases and security requirements.

Choose the deployment mode that best fits your environment and requirements.

---

## 📁 Available Use Cases

### 1. [ldap-manager-readonly](ldap-manager-readonly/)
**Mode:** Read-Only (No Authentication)

**Best For:**
- 📊 Public dashboards
- 🖥️ Network operations center (NOC) displays
- 🔍 Self-service directory lookup
- 📺 Kiosks and shared screens

**Features:**
- ✅ No authentication required
- ✅ Fast startup (~10 seconds)
- ✅ Low memory footprint (~200MB)
- ✅ Anonymous read-only access
- ❌ No write operations

**Security:** ⚠️ Medium (anyone can view data)

**Deployment Size:** Lightweight (1 container)

---

### 2. [ldap-manager-read-write](ldap-manager-read-write/)
**Mode:** Full Access (No Authentication)

**Best For:**
- 🏢 Internal corporate networks (trusted users)
- 🔧 Development environments
- 👥 Small teams (< 10 known users)
- 🔒 Air-gapped networks

**Features:**
- ✅ No authentication required
- ✅ Full admin access (create, edit, delete)
- ✅ LDAP connection configuration
- ✅ V1 compatibility mode
- ⚠️ No access control

**Security:** ❌ Low (requires firewall/VPN)

**Deployment Size:** Lightweight (1 container)

**⚠️ WARNING:** Must deploy behind VPN or firewall. DO NOT expose to public internet.

---

### 3. [ldap-manager-with-keycloak](ldap-manager-with-keycloak/)
**Mode:** Keycloak Authentication (H2 Database)

**Best For:**
- 🏢 Production environments (< 100 users)
- 🔐 Multi-user access with RBAC
- 📋 Compliance requirements (audit trail)
- 🌐 Small to medium deployments

**Features:**
- ✅ User authentication (OAuth2/OIDC)
- ✅ 4 roles (admin, editor, viewer, auditor)
- ✅ Admin-only LDAP configuration
- ✅ Audit trail with usernames
- ✅ Auto token refresh
- ✅ Rate limiting

**Security:** ✅ High (authentication + RBAC)

**Deployment Size:** Medium (2 containers: Keycloak + LDAP Manager)

**Database:** H2 embedded (suitable for < 100 users)

---

### 4. [ldap-manager-with-keycloak-postgres](ldap-manager-with-keycloak-postgres/) ⭐ **RECOMMENDED**
**Mode:** Keycloak Authentication (PostgreSQL Database)

**Best For:**
- 🏢 Enterprise environments (> 100 users)
- 📈 High traffic / concurrent users
- 🔄 High availability requirements
- 🌐 Multi-instance load balanced setup
- 💼 Mission-critical deployments

**Features:**
- ✅ All features from Mode 3
- ✅ PostgreSQL backend (production-grade)
- ✅ Horizontal scaling support
- ✅ Database replication
- ✅ Better performance
- ✅ Enterprise ready

**Security:** ✅ Very High (authentication + RBAC + PostgreSQL)

**Deployment Size:** Full stack (3 containers: PostgreSQL + Keycloak + LDAP Manager)

**Database:** PostgreSQL (production-grade, unlimited users)

---

## 🎯 Quick Comparison

| Feature | Read-Only | Read-Write | Keycloak (H2) | Keycloak (PostgreSQL) |
|---------|-----------|------------|---------------|----------------------|
| **Authentication** | ❌ | ❌ | ✅ | ✅ |
| **User Management** | ❌ | ❌ | ✅ | ✅ |
| **Role-Based Access** | ❌ | ❌ | ✅ | ✅ |
| **Audit Trail (with usernames)** | ❌ | ❌ | ✅ | ✅ |
| **View Entries** | ✅ | ✅ | ✅ | ✅ |
| **Create/Edit Entries** | ❌ | ✅ | Role-based | Role-based |
| **Delete Entries** | ❌ | ✅ | Admin only | Admin only |
| **Configure LDAP** | ❌ | ✅ | Admin only | Admin only |
| **Horizontal Scaling** | ✅ | ✅ | ❌ | ✅ |
| **Database** | - | - | H2 (embedded) | PostgreSQL |
| **Startup Time** | ~10s | ~10s | ~90s | ~120s |
| **Memory Usage** | ~200MB | ~200MB | ~800MB | ~1.2GB |
| **Max Users** | Unlimited | Unlimited | < 100 | Unlimited |
| **Security Level** | ⚠️ Medium | ❌ Low | ✅ High | ✅ Very High |
| **Production Ready** | ✅ (internal) | ⚠️ (VPN only) | ✅ | ✅⭐ |

---

## 🚀 Quick Start Guide

### 1. Choose Your Deployment Mode

**Ask yourself:**

1. **Do you need user authentication?**
   - **No** → Choose Mode 1 (read-only) or Mode 2 (read-write)
   - **Yes** → Go to question 2

2. **How many users will you have?**
   - **< 100 users** → Mode 3 (Keycloak with H2)
   - **> 100 users** → Mode 4 (Keycloak with PostgreSQL) ⭐

3. **Do you need write access without authentication?**
   - **Yes, read-only is fine** → Mode 1
   - **Yes, need full access** → Mode 2 (requires VPN/firewall)

4. **Do you need high availability?**
   - **Yes** → Mode 4 (PostgreSQL + multi-instance Keycloak) ⭐
   - **No** → Mode 3 or 4

### 2. Follow the README in Your Chosen Directory

Each use case has a comprehensive README with:
- ✅ Prerequisites
- ✅ Step-by-step setup instructions
- ✅ Production deployment with HTTPS
- ✅ Security best practices
- ✅ Monitoring and maintenance
- ✅ Troubleshooting guide
- ✅ Backup and restore procedures

---

## 📋 Deployment Checklist

### Pre-Deployment

- [ ] Choose deployment mode based on requirements
- [ ] Provision server (VM, cloud instance, or bare metal)
- [ ] Install Docker and Docker Compose
- [ ] Configure DNS records (for production with HTTPS)
- [ ] Prepare SSL certificates (Let's Encrypt or corporate CA)
- [ ] Plan backup strategy
- [ ] Set up monitoring (Prometheus, Grafana, or cloud monitoring)

### Deployment

- [ ] Copy use-case files to server
- [ ] Configure .env file (change default passwords!)
- [ ] Create config.yml with LDAP clusters
- [ ] Build or pull LDAP Manager Docker image
- [ ] Start containers (docker-compose up -d)
- [ ] Verify all containers are healthy
- [ ] Configure reverse proxy (nginx or Caddy)
- [ ] Obtain SSL certificates
- [ ] Test access via HTTPS

### Post-Deployment

- [ ] Create production users (Keycloak modes only)
- [ ] Delete test users (Keycloak modes only)
- [ ] Configure firewall rules
- [ ] Set up automated backups
- [ ] Configure log rotation
- [ ] Test restore procedures
- [ ] Set up monitoring alerts
- [ ] Document admin procedures
- [ ] Train users
- [ ] Plan maintenance windows

---

## 🔐 Security Recommendations

### All Modes

✅ Use HTTPS with valid SSL certificates
✅ Enable firewall (allow only necessary ports)
✅ Regular security updates (Docker images, OS)
✅ Monitor logs for suspicious activity
✅ Set strong passwords for all services
✅ Regular backups (daily recommended)
✅ Test restore procedures

### Mode 1 (Read-Only)

⚠️ Deploy behind VPN or firewall for sensitive data
⚠️ LDAP passwords in config.yml (protect with chmod 600)
⚠️ Monitor access logs

### Mode 2 (Read-Write)

❌ **NEVER** expose to public internet
✅ VPN or firewall is **MANDATORY**
✅ IP whitelist recommended
✅ Audit log monitoring **REQUIRED**
✅ Daily backups **REQUIRED**

### Mode 3 & 4 (Keycloak)

✅ Change default Keycloak admin password
✅ Delete test users in production
✅ Enable password policies (minimum length, complexity)
✅ Configure session timeouts
✅ Enable MFA/2FA for admin users
✅ Regular Keycloak updates
✅ Database backups (especially Mode 4)

---

## 🔄 Migration Paths

### From Read-Write (Mode 2) to Keycloak (Mode 3/4)

**Reason:** Add authentication and role-based access control

1. Stop Mode 2 deployment
2. Backup config.yml and LDAP password cache
3. Deploy Mode 3 or Mode 4
4. Create users in Keycloak
5. Assign roles
6. Migrate password cache (optional)
7. Test and verify

**See:** `ldap-manager-with-keycloak/README.md` → Migration section

### From Keycloak H2 (Mode 3) to PostgreSQL (Mode 4)

**Reason:** Scale beyond 100 users, improve performance

1. Export Keycloak data (realm export)
2. Stop Mode 3 deployment
3. Deploy Mode 4 with PostgreSQL
4. Import Keycloak data
5. Verify all users and settings

**See:** `ldap-manager-with-keycloak-postgres/README.md` → Migration section

---

## 📊 Performance Benchmarks

### Mode 1 & 2 (No Auth)

- **Startup:** ~10 seconds
- **Memory:** ~200MB
- **CPU:** 0.1-0.5 cores (idle)
- **Requests/sec:** 500+ (read operations)

### Mode 3 (Keycloak + H2)

- **Startup:** ~90 seconds
- **Memory:** ~800MB (Keycloak 512MB + LDAP Manager 200MB)
- **CPU:** 0.5-1.5 cores (idle)
- **Requests/sec:** 200+ (with JWT validation)
- **Max Users:** < 100

### Mode 4 (Keycloak + PostgreSQL)

- **Startup:** ~120 seconds
- **Memory:** ~1.2GB (PostgreSQL 256MB + Keycloak 512MB + LDAP Manager 200MB)
- **CPU:** 1-2 cores (idle)
- **Requests/sec:** 500+ (optimized PostgreSQL)
- **Max Users:** Unlimited (tested up to 10,000)
- **Scalability:** Horizontal (multi-instance Keycloak)

---

## 💰 Cost Estimates

### Self-Hosted (Cloud VM)

| Mode | AWS | GCP | DigitalOcean |
|------|-----|-----|--------------|
| Mode 1/2 | t3.small ($17/mo) | e2-small ($14/mo) | Basic Droplet ($12/mo) |
| Mode 3 | t3.medium ($30/mo) | e2-medium ($25/mo) | General Droplet ($18/mo) |
| Mode 4 | t3.medium + RDS ($45/mo) | e2-medium + Cloud SQL ($35/mo) | Droplet + Managed DB ($33/mo) |

### On-Premise

| Mode | Hardware | Power/Cooling | Total |
|------|----------|---------------|-------|
| Mode 1/2 | Raspberry Pi 4 ($50 one-time) | $2/mo | $2/mo |
| Mode 3 | Mini PC ($200 one-time) | $5/mo | $5/mo |
| Mode 4 | Mid-range Server ($800 one-time) | $15/mo | $15/mo |

---

## 📞 Support

### Documentation

- **Main Docs:** https://vibhuvioio.github.io/ldap-manager/
- **GitHub Issues:** https://github.com/VibhuviOiO/ldap-manager/issues
- **Main README:** ../README.md

### Get Help

1. Check the README in your chosen use-case directory
2. Search existing GitHub issues
3. Create a new issue with:
   - Deployment mode (1, 2, 3, or 4)
   - Docker Compose logs
   - Steps to reproduce
   - Expected vs actual behavior

---

## 📝 License

Same as main LDAP Manager project.

---

**Last Updated:** 2026-01-30
**Version:** 2.0.0
**Maintained By:** Vibhuvi OiO

---

## 🎯 Recommended Deployment by Scenario

| Scenario | Recommended Mode | Why |
|----------|-----------------|-----|
| Corporate intranet (trusted users) | Mode 2 or Mode 3 | Depends on need for audit trail |
| Public dashboard (non-sensitive) | Mode 1 | Read-only, no auth needed |
| Production (< 100 users) | Mode 3 ⭐ | Authentication + RBAC |
| Production (> 100 users) | Mode 4 ⭐⭐⭐ | PostgreSQL for scale |
| High availability requirement | Mode 4 ⭐⭐⭐ | Multi-instance support |
| Development/Testing | Mode 2 | Simple, no auth overhead |
| Compliance (SOC2, HIPAA) | Mode 4 ⭐⭐⭐ | Full audit trail |
| Small business (5-10 staff) | Mode 3 | Good balance |
| Enterprise (1000+ users) | Mode 4 ⭐⭐⭐ | Production-grade DB |

---

**Need help choosing?**

Start with **Mode 3** for most production use cases, upgrade to **Mode 4** when you exceed 100 users or need high availability.
