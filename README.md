<p align="center">
  <img src="https://vibhuvioio.com/ldap-manager/img/ldap.png" alt="LDAP Manager Logo" width="120">
</p>

# LDAP Manager


Modern web-based management interface for OpenLDAP servers with React + TypeScript frontend and FastAPI Python backend.

![License](https://img.shields.io/badge/license-MIT-green)
![Docker](https://img.shields.io/badge/docker-ready-blue)

![LDAP Manager Dashboard](https://vibhuvioio.com/ldap-manager/img/1ldap-cluster-home.png)
![Directory data](https://vibhuvioio.com/ldap-manager/img/3ldap-users.png)

## Features

- **Multi-cluster Management** - Manage multiple LDAP servers from single interface
- **Server-side Pagination & Search** - Efficient handling of large directories (LDAP RFC 2696)
- **Password Caching** - Secure SHA256-hashed password storage for shared access
- **Custom Schema Support** - Automatically detects and displays custom objectClasses
- **Health Monitoring** - Real-time cluster health status
- **Modern UI** - React 18 + TypeScript + shadcn/ui components

See [Full Documentation](https://vibhuvioio.com/ldap-manager/) for advanced configuration (custom forms, table columns, user creation).

## Quick Start

### System Requirements

| Resource | Minimum | Recommended | Production (High Traffic) |
|----------|---------|-------------|---------------------------|
| CPU      | 1 core  | 2 cores     | 4 cores                   |
| RAM      | 512 MB  | 1 GB        | 2 GB                      |
| Disk     | 500 MB  | 1 GB        | 2 GB                      |

### Docker Run (Fastest)

```bash
# Download config template
wget https://raw.githubusercontent.com/VibhuviOiO/ldap-manager/main/config.example.yml -O config.yml

# Edit config with your LDAP details
nano config.yml

# Run container
docker run -d \
  --name ldap-manager \
  -p 8000:8000 \
  -v $(pwd)/config.yml:/app/config.yml:ro \
  ghcr.io/vibhuvioio/ldap-manager:latest

# Access UI at http://localhost:8000
```

### Docker Compose (Recommended)

```bash
# Download docker-compose.prod.yml
wget https://raw.githubusercontent.com/VibhuviOiO/ldap-manager/main/docker-compose.prod.yml

# Download config template
wget https://raw.githubusercontent.com/VibhuviOiO/ldap-manager/main/config.example.yml -O config.yml

# Edit config with your LDAP details
nano config.yml

# Start application
docker-compose -f docker-compose.prod.yml up -d

# Access UI at http://localhost:8000
```

## Configuration

### Basic Setup (`config.yml`)

```yaml
clusters:
  - name: "Production LDAP"
    host: "ldap.example.com"
    port: 389
    bind_dn: "cn=Manager,dc=example,dc=com"
```

### Multi-Master Cluster

```yaml
clusters:
  - name: "LDAP Cluster"
    nodes:
      - host: "ldap1.company.com"
        port: 389
      - host: "ldap2.company.com"
        port: 389
    bind_dn: "cn=Manager,dc=company,dc=com"
```

### Context Path (for integration)

```bash
# Production
CONTEXT_PATH=/ldap-manager docker-compose -f docker-compose.prod.yml up -d

# Development
CONTEXT_PATH=/ldap-manager docker-compose up
```

## Documentation

- 📖 [Full Documentation](https://vibhuvioio.com/ldap-manager/)
- ⚙️ [Configuration Guide](https://vibhuvioio.com/ldap-manager/configuration.html)
- 🧪 [Testing Guide](https://vibhuvioio.com/ldap-manager/testing.html)
- 🛠️ [Development Setup](https://vibhuvioio.com/ldap-manager/development.html)
- 🔧 [Context Path Setup](https://vibhuvioio.com/ldap-manager/configuration.html#context-path-configuration)

## Technology Stack

**Frontend:** React 18, TypeScript, Vite, shadcn/ui, Tailwind CSS  
**Backend:** FastAPI, Python 3.11+, python-ldap, PyYAML

## Development

```bash
# Backend
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# Frontend
cd frontend
npm install
npm run dev
```

## Testing

```bash
cd frontend
npm install
npx playwright install
npx playwright test
```

✅ 95 tests across 3 browsers covering dashboard, user lifecycle, forms, and accessibility.

See [docs/testing.html](https://vibhuvioio.com/ldap-manager/testing.html) for detailed testing guide.

## Security

- Passwords cached using SHA256 hashing
- Cache files stored in `/app/.cache/` (container only)
- Use read-only LDAP accounts when possible
- Enable TLS/SSL for production (ldaps://)

## Compatible LDAP Servers

✅ **Tested**: OpenLDAP 2.4+, OpenLDAP 2.6+

🔄 **Should work** (RFC 4511 compliant): 389 Directory Server, ApacheDS, Active Directory

**Requirements**: LDAP v3 protocol, RFC 2696 (paged results) support recommended for large directories

## Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

## License

MIT License - See [LICENSE](LICENSE) file

## Support

- 📖 [Documentation](https://vibhuvioio.com/ldap-manager/)
- 🐛 [Issue Tracker](https://github.com/VibhuviOiO/ldap-manager/issues)
- 💬 [Discussions](https://github.com/VibhuviOiO/ldap-manager/discussions)

---

**Developed by [Vibhuvi OiO](https://vibhuvioio.com)**
