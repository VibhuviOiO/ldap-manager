# Keycloak Configuration for LDAP Manager

This directory contains the Keycloak realm configuration for LDAP Manager authentication.

## Quick Start (Development)

```bash
# Start both Keycloak and LDAP Manager
docker-compose up

# Wait for Keycloak to be ready (60-90 seconds)
# Keycloak will be available at: http://localhost:8080
# LDAP Manager will be available at: http://localhost:5173
```

## Test Users

The realm is preconfigured with the following test users:

| Username | Password | Role | Permissions |
|----------|----------|------|-------------|
| admin | admin123 | Admin | Full access (create, read, update, delete) |
| editor | editor123 | Editor | Read + write (create, update) |
| viewer | viewer123 | Viewer | Read-only (view entries and stats) |
| auditor | auditor123 | Auditor | Access to audit logs |

## Keycloak Admin Console

- **URL:** http://localhost:8080
- **Admin Username:** admin
- **Admin Password:** admin
- **Realm:** ldap-manager

Access the admin console to:
- Create additional users
- Modify roles and permissions
- Configure authentication flows
- View session information
- Monitor authentication events

## Realm Configuration (`realm-export.json`)

The realm configuration includes:

### Client Configuration
- **Client ID:** ldap-manager-client
- **Protocol:** OpenID Connect (OIDC)
- **Flow:** Authorization Code + PKCE (S256)
- **Access Type:** Public (browser-based SPA)
- **Token Lifespan:**
  - Access Token: 15 minutes (900 seconds)
  - Refresh Token: 7 days (604800 seconds)
  - SSO Session: 10 hours (36000 seconds)

### Roles
1. **admin** - Full access to all operations
2. **editor** - Create and update entries (no delete)
3. **viewer** - Read-only access
4. **auditor** - Access to audit logs and monitoring

### Security Features
- PKCE (Proof Key for Code Exchange) enabled
- Brute force protection enabled
- Password reset allowed
- Email verification required

## Production Deployment

### Using External Keycloak

Update your `.env` file:

```bash
# Backend - internal Keycloak URL
KEYCLOAK_URL=https://auth.company.com

# Frontend - browser-accessible Keycloak URL
VITE_KEYCLOAK_URL=https://auth.company.com

# Other settings
KEYCLOAK_REALM=ldap-manager
KEYCLOAK_CLIENT_ID=ldap-manager-client
AUTH_MODE=keycloak
```

### Security Checklist

1. **Change Admin Password**
   ```bash
   # Login to Keycloak admin console
   # Go to: Master realm → Users → admin → Credentials
   # Set a strong password
   ```

2. **Delete Test Users**
   ```bash
   # In ldap-manager realm → Users
   # Delete: admin, editor, viewer, auditor
   ```

3. **Create Real Users**
   ```bash
   # In ldap-manager realm → Users → Add user
   # Assign appropriate client roles
   ```

4. **Update Redirect URIs**
   ```bash
   # In ldap-manager realm → Clients → ldap-manager-client
   # Update Valid Redirect URIs:
   # - https://ldap.company.com/*
   # Remove localhost URIs
   ```

5. **Configure HTTPS**
   - Use reverse proxy (nginx/Caddy)
   - Enable SSL/TLS
   - Update KEYCLOAK_URL to use https://

6. **Enable Production Mode**
   ```bash
   # In Keycloak, use production start command
   # (not start-dev)
   ```

## Importing Realm Manually

If you need to import the realm manually:

1. Access Keycloak admin console
2. Select "Master" realm dropdown
3. Click "Create Realm"
4. Click "Browse" and select `realm-export.json`
5. Click "Create"

## Exporting Realm Configuration

To export the current realm configuration:

```bash
docker exec ldap-manager-keycloak /opt/keycloak/bin/kc.sh export \
  --realm ldap-manager \
  --dir /tmp \
  --users realm_file

docker cp ldap-manager-keycloak:/tmp/ldap-manager-realm.json ./keycloak/
```

## Troubleshooting

### Keycloak not starting

```bash
# Check Keycloak logs
docker logs ldap-manager-keycloak

# Verify realm-export.json is mounted
docker exec ldap-manager-keycloak ls /opt/keycloak/data/import/
```

### Login redirects not working

1. Check `VITE_KEYCLOAK_URL` is browser-accessible
2. Verify redirect URIs in client configuration
3. Check browser console for CORS errors

### Token validation failing

1. Verify `KEYCLOAK_URL` is accessible from backend container
2. Check time synchronization (JWT exp claim)
3. Ensure realm and client ID match in backend/frontend

### Users can't login

1. Verify user is enabled in Keycloak
2. Check user has client roles assigned
3. Verify credentials are correct
4. Check Keycloak events for login failures

## Integration with LDAP

Keycloak can optionally sync users from your LDAP directory:

1. Go to: ldap-manager realm → User Federation → Add provider → ldap
2. Configure LDAP connection:
   - Connection URL: ldap://your-ldap-server:389
   - Bind DN: cn=admin,dc=example,dc=com
   - Bind Credential: your-password
   - Users DN: ou=People,dc=example,dc=com
3. Test connection
4. Sync users

This allows users to login with their LDAP credentials while using Keycloak for authorization.

## More Information

- [Keycloak Documentation](https://www.keycloak.org/documentation)
- [LDAP Manager Documentation](https://vibhuvioio.com/ldap-manager/)
- [OpenID Connect Specification](https://openid.net/connect/)
