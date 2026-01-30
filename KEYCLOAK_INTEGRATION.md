# Keycloak Integration - Phase 1 MVP Complete

## Status: ✅ IMPLEMENTED & READY FOR TESTING

**Implementation Date**: 2026-01-29
**Phase**: 1 (MVP - Authentication & Basic RBAC)

---

## What's Been Implemented

### Backend (FastAPI)

#### 1. Authentication Infrastructure (`backend/app/core/auth.py`)
- JWT token validation using Keycloak's JWKS endpoint
- User model with roles extracted from JWT claims
- Support for both Keycloak mode and legacy mode (V1 compatibility)
- Token expiration, audience, and issuer validation
- Automatic JWKS caching with 24-hour TTL

#### 2. Role-Based Access Control (`backend/app/core/rbac.py`)
- Decorator-based RBAC system
- Four roles implemented:
  - `admin` - Full access (create, read, update, delete)
  - `editor` - Read + write (create, update)
  - `viewer` - Read-only access
  - `auditor` - Logs and monitoring only
- Decorators: `@admin_only`, `@editor_required`, `@viewer_required`, `@auditor_only`

#### 3. Protected API Endpoints
- All endpoints in `entries.py` protected with role decorators
- All endpoints in `clusters.py` require viewer role or higher
- Returns 401 for missing/invalid tokens
- Returns 403 for insufficient permissions
- User context added to all audit logs

#### 4. Dependencies Added (`requirements.txt`)
- `python-jose[cryptography]==3.3.0` - JWT validation
- `slowapi==0.1.9` - Rate limiting (Phase 2)
- `redis==5.0.1` - Distributed rate limiting (Phase 2)
- `requests==2.31.0` - HTTP client for JWKS fetching

### Frontend (React + TypeScript)

#### 1. Keycloak SDK Integration (`frontend/src/services/auth/KeycloakService.ts`)
- OAuth2 Authorization Code + PKCE (S256) flow
- Automatic token refresh (5 min before expiration)
- User profile extraction from JWT
- Role-based access helpers

#### 2. Authentication State (`frontend/src/store/appStore.ts`)
- Zustand store extended with auth state
- User object with roles
- `isAuthenticated` and `isLoading` flags
- `logout()` method

#### 3. Protected Routes (`frontend/src/App.tsx`)
- Keycloak initialization on app load
- Login-required guard (redirects to Keycloak)
- Loading spinner during authentication
- User profile display in header
- Logout button

#### 4. API Client Integration (`frontend/src/services/http/AxiosHttpClient.ts`)
- Request interceptor: Adds Bearer token to all API calls
- Response interceptor: Handles 401 with token refresh
- Automatic logout on token refresh failure

### Docker Configuration

#### 1. Keycloak Service (`docker-compose.yml`)
- Keycloak 24.0 container on port 8080
- Health check with TCP socket test (fixed curl issue)
- Automatic realm import from `keycloak/realm-export.json`
- Admin credentials: admin/admin

#### 2. Realm Configuration (`keycloak/realm-export.json`)
- Pre-configured `ldap-manager` realm
- Client: `ldap-manager-client` (public, PKCE enabled)
- 4 test users with roles assigned
- Token lifespans: 15 min access, 7 day refresh
- Redirect URIs for localhost and production

#### 3. Environment Variables (`.env.example`)
- Backend Keycloak URL (internal): `KEYCLOAK_URL=http://keycloak:8080`
- Frontend Keycloak URL (browser): `VITE_KEYCLOAK_URL=http://localhost:8080`
- Auth mode switch: `AUTH_MODE=keycloak` or `legacy`
- Development mode: `DEVELOPMENT_MODE=false`

---

## Test Users

| Username | Password | Role | Access Level |
|----------|----------|------|--------------|
| admin | admin123 | admin | Full access (CRUD) |
| editor | editor123 | editor | Create + update (no delete) |
| viewer | viewer123 | viewer | Read-only |
| auditor | auditor123 | auditor | Logs + monitoring only |

---

## How to Test

### 1. Start the Application

```bash
cd /Users/balu/OiO/ldap-manager
docker compose up -d
```

Wait 30 seconds for Keycloak to become healthy.

### 2. Access Points

- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:8000
- **Keycloak Admin**: http://localhost:8080 (admin/admin)

### 3. Manual Testing Checklist

#### Login Flow
1. Open http://localhost:5173 in browser
2. **Expected**: Automatic redirect to Keycloak login page
3. Login with: `admin` / `admin123`
4. **Expected**: Redirect back to dashboard
5. **Verify**: Header shows username "admin" and role badge
6. **Verify**: Logout button present in header

#### API Authentication
1. Open browser DevTools (F12) → Network tab
2. Click on any cluster to load data
3. **Verify**: API requests show `Authorization: Bearer <token>` header
4. **Verify**: API responses return data (not 401)

#### Role-Based Access Control
1. **Admin User** (admin/admin123):
   - Should see: Create, Edit, Delete buttons
   - Can perform all operations

2. **Viewer User** (viewer/viewer123):
   - Should see: Only search/view interface
   - Should NOT see: Create, Edit, Delete buttons
   - Try accessing create endpoint via curl:
     ```bash
     # Should return 403 Forbidden
     curl -H "Authorization: Bearer <viewer_token>" \
       -X POST http://localhost:8000/api/entries/create
     ```

3. **Editor User** (editor/editor123):
   - Should see: Create and Edit buttons
   - Should NOT see: Delete button
   - Can create and update, but not delete

#### Token Lifecycle
1. Stay logged in for 15+ minutes
2. **Expected**: Token auto-refreshes in background
3. No unexpected logouts
4. Close browser and reopen to http://localhost:5173
5. **Expected**: Login required again (no persistent session)

### 4. Verify Security

#### Authentication Required
```bash
# Should return 401
curl http://localhost:8000/api/clusters/list

# Response:
{"detail":"Authentication required"}
```

#### Health Endpoint (No Auth Required)
```bash
# Should return 200
curl http://localhost:8000/health

# Response:
{"status":"healthy",...}
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                           Browser                                │
│                                                                   │
│  1. User opens http://localhost:5173                            │
│  2. Redirect to Keycloak login                                  │
│  3. Enter credentials (admin/admin123)                          │
│  4. Redirect back with authorization code                       │
│  5. Exchange code for JWT token (PKCE protected)                │
│  6. Store token in memory (not localStorage for security)       │
└───────────────┬─────────────────────────────────────────────────┘
                │
                │ Authorization: Bearer <jwt_token>
                ▼
┌─────────────────────────────────────────────────────────────────┐
│                   FastAPI Backend (Port 8000)                    │
│                                                                   │
│  1. Extract Bearer token from Authorization header              │
│  2. Fetch Keycloak JWKS (cached)                                │
│  3. Verify JWT signature, expiration, audience, issuer          │
│  4. Extract user_id, username, roles from JWT claims            │
│  5. Check role requirements (@admin_only, @viewer_required)     │
│  6. Execute API logic if authorized                             │
│  7. Return 401 (no token) or 403 (insufficient role)            │
└───────────────┬─────────────────────────────────────────────────┘
                │
                │ Fetch JWKS (public keys)
                ▼
┌─────────────────────────────────────────────────────────────────┐
│                  Keycloak (Port 8080)                            │
│                                                                   │
│  - OAuth2/OIDC provider                                          │
│  - User database (4 test users)                                 │
│  - Token issuer (access + refresh tokens)                       │
│  - JWKS endpoint for signature verification                     │
│  - Admin console: http://localhost:8080                         │
└─────────────────────────────────────────────────────────────────┘
```

---

## Security Features Implemented

- ✅ **JWT Signature Validation**: Using Keycloak's public keys (JWKS)
- ✅ **Token Expiration**: 15-minute access tokens, auto-refresh
- ✅ **Audience Validation**: Ensures token is for our client
- ✅ **Issuer Validation**: Ensures token came from our Keycloak
- ✅ **PKCE Flow**: Protects against authorization code interception
- ✅ **Role-Based Access Control**: Granular permissions per endpoint
- ✅ **Audit Logging**: User ID and username in all logs
- ✅ **Token Storage**: Memory-only (not localStorage)
- ✅ **CORS Protection**: Environment-based origin whitelist

---

## Known Issues & Limitations

### 1. Direct Access Grants Testing
- **Issue**: Password grant (for testing via curl) requires HTTPS
- **Workaround**: Test via frontend UI (proper OAuth2 flow)
- **Status**: Low priority - frontend flow is production-ready

### 2. Legacy Mode for V1 Compatibility
- **How to enable**: Set `AUTH_MODE=legacy` in `.env`
- **Effect**: Disables authentication (all requests use "legacy-user")
- **Use case**: Temporary compatibility during migration

---

## Next Steps (Phase 2)

### 1. Per-User LDAP Password Cache (CRITICAL)
**Current**: All users share same LDAP credentials
**Target**: Each user enters their own LDAP password

**Changes needed**:
- Modify `backend/app/core/password_cache.py` - Add user_id to cache key
- Update all API endpoints to pass `user.user_id` to password cache
- Frontend: Each user enters their own LDAP password on first connection

**Benefit**: Audit logs show exact user who made changes, LDAP-level permissions honored

### 2. Rate Limiting (HIGH)
**Dependencies already installed**: slowapi, redis

**Changes needed**:
- Create `backend/app/core/rate_limit.py`
- Apply rate limits: 100 req/min per IP, 1000 req/hour per user
- Add Redis support for multi-instance deployments

### 3. Enhanced Audit Logging (MEDIUM)
**Current**: User context in logs
**Target**: Comprehensive audit trail

**Changes needed**:
- Log all CREATE/UPDATE/DELETE with full details
- Include cluster name, DN, operation type, changes made
- Centralized audit log endpoint for auditor role

### 4. Production Deployment Guide (MEDIUM)
**Changes needed**:
- External Keycloak setup instructions
- HTTPS/TLS configuration (reverse proxy)
- Security checklist
- Environment variable examples
- Multi-instance deployment (Redis for rate limiting)

---

## Files Changed

### New Files Created
```
backend/app/core/auth.py                   # JWT validation
backend/app/core/rbac.py                   # Role decorators
backend/tests/test_auth.py                 # Auth tests
frontend/src/services/auth/KeycloakService.ts  # Keycloak SDK wrapper
frontend/src/components/LoadingSpinner.tsx  # Auth loading UI
keycloak/realm-export.json                 # Keycloak configuration
keycloak/README.md                         # Keycloak setup guide
```

### Modified Files
```
backend/requirements.txt                   # Added auth deps
backend/app/main.py                        # User context logging
backend/app/api/entries.py                 # Protected endpoints
backend/app/api/clusters.py                # Protected endpoints
frontend/package.json                      # Added keycloak-js
frontend/src/App.tsx                       # Auth guard + logout
frontend/src/store/appStore.ts             # Auth state
frontend/src/services/http/AxiosHttpClient.ts  # Bearer token interceptor
docker-compose.yml                         # Added Keycloak service
.env.example                               # Keycloak env vars
```

---

## Troubleshooting

### Keycloak Not Starting
```bash
# Check logs
docker logs ldap-manager-keycloak

# Common issues:
# - Port 8080 already in use
# - Realm import error (check realm-export.json syntax)
# - Health check timing (increase start_period in docker-compose.yml)
```

### Backend Import Errors
```bash
# ModuleNotFoundError: No module named 'jose'
# Solution: Rebuild container
docker compose down
docker compose build --no-cache ldap-manager
docker compose up -d
```

### Frontend Not Redirecting to Keycloak
```bash
# Check environment variables in container
docker exec ldap-manager env | grep KEYCLOAK

# Verify Keycloak is accessible from browser
curl http://localhost:8080/realms/ldap-manager/.well-known/openid-configuration
```

### 401 on All API Requests
```bash
# Check KEYCLOAK_URL is accessible from backend container
docker exec ldap-manager curl http://keycloak:8080/realms/ldap-manager

# Verify token in browser DevTools
# Application → Local Storage → Check for Keycloak state
```

---

## Documentation

- **Setup Guide**: `keycloak/README.md`
- **Test Results**: `/private/tmp/claude/.../MVP_TEST_RESULTS.md`
- **Original Plan**: `/Users/balu/.claude/plans/floofy-wobbling-toast.md`
- **V2 Roadmap**: `/Users/balu/OiO/ldap-manager/PlanV2.md`

---

## Summary

✅ **Phase 1 MVP is complete and ready for testing!**

The application now has:
- Full OAuth2/OIDC authentication via Keycloak
- 4-role RBAC system
- Protected API endpoints
- Auto-refreshing JWT tokens
- User profile in UI
- Backward compatibility (legacy mode)

**Test it now** by opening http://localhost:5173 and logging in with admin/admin123.

Once confirmed working, we can proceed to Phase 2 (per-user LDAP credentials, rate limiting, production hardening).
