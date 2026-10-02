from fastapi import FastAPI, Request, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from pathlib import Path
import os
import time
import logging
from datetime import datetime
from app.api import entries, monitoring, logs, clusters, backup, ldif, schema, aci, audit, dashboard, capabilities
from app.api import auth as auth_api
from app.core.audit_middleware import AuditMiddleware
from app.core.connection_pool import pool as ldap_pool
from app.core.logging_config import setup_logging
from app.core.rbac import require_readonly

# Setup structured logging
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")
JSON_LOGS = os.getenv("JSON_LOGS", "true").lower() == "true"
setup_logging(log_level=LOG_LEVEL, json_format=JSON_LOGS)

logger = logging.getLogger(__name__)

# Get context path from environment variable (default: empty string for root)
CONTEXT_PATH = os.getenv("CONTEXT_PATH", "").rstrip("/")

# Configure CORS with environment-based origin whitelist
ALLOWED_ORIGINS_STR = os.getenv("ALLOWED_ORIGINS", "http://localhost:5173")
ALLOWED_ORIGINS = [origin.strip() for origin in ALLOWED_ORIGINS_STR.split(",") if origin.strip()]

app = FastAPI(
    title="LDAP Management API",
    description="RESTful API for OpenLDAP management",
    version="1.0.0",
    root_path=CONTEXT_PATH
)

# Every mutating request is recorded centrally, so a new write
# endpoint cannot be added without being audited.
app.add_middleware(AuditMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Content-Type", "Authorization"],
)

# Request logging middleware
@app.middleware("http")
async def log_requests(request: Request, call_next):
    """Log all HTTP requests with timing information."""
    start_time = time.time()
    request_id = f"{int(start_time * 1000)}"

    logger.info(
        "Request started",
        extra={
            "request_id": request_id,
            "method": request.method,
            "path": request.url.path,
            "client_ip": request.client.host if request.client else None
        }
    )

    response = await call_next(request)

    duration = time.time() - start_time
    logger.info(
        "Request completed",
        extra={
            "request_id": request_id,
            "method": request.method,
            "path": request.url.path,
            "status_code": response.status_code,
            "duration_ms": round(duration * 1000, 2)
        }
    )

    return response

# Auth endpoints manage their own access (status must stay public so the UI can
# decide between nothing, a login form, and the first-run wizard).
app.include_router(auth_api.router, prefix="/api/auth", tags=["auth"])

# Everything else needs at least 'readonly'. Individual routes escalate:
# entries writes -> readwrite, test-replication -> readwrite.
_READ = [Depends(require_readonly)]
app.include_router(clusters.router, prefix="/api/clusters", tags=["clusters"], dependencies=_READ)
app.include_router(entries.router, prefix="/api/entries", tags=["entries"], dependencies=_READ)
app.include_router(monitoring.router, prefix="/api/monitoring", tags=["monitoring"], dependencies=_READ)
app.include_router(logs.router, prefix="/api/logs", tags=["logs"], dependencies=_READ)
# A full directory dump is the most sensitive read the app offers, so the route
# itself requires admin rather than the readonly baseline.
app.include_router(backup.router, prefix="/api/backup", tags=["backup"])
# LDIF import: the route itself requires readwrite.
app.include_router(ldif.router, prefix="/api/ldif", tags=["ldif"])
# Schema browser: reads cn=config via the cluster's config credential.
app.include_router(schema.router, prefix="/api/schema", tags=["schema"], dependencies=_READ)
# ACI (olcAccess) editor: reads are readonly, writes require admin in-route.
app.include_router(aci.router, prefix="/api/aci", tags=["aci"], dependencies=_READ)
# Audit trail: admin-only inside the router (it names people).
app.include_router(audit.router, prefix="/api/audit", tags=["audit"])
# Home-page rollup: one call instead of one per cluster.
app.include_router(dashboard.router, prefix="/api/dashboard", tags=["dashboard"], dependencies=_READ)
# Optional-capability detection, so the UI can explain what a server lacks.
app.include_router(capabilities.router, prefix="/api/capabilities", tags=["capabilities"], dependencies=_READ)

# Lifecycle events
@app.on_event("startup")
async def startup_event():
    """Initialize resources on startup."""
    logger.info(
        "LDAP Manager started",
        extra={
            "version": "1.0.0",
            "context_path": CONTEXT_PATH,
            "allowed_origins": ALLOWED_ORIGINS,
            "log_level": LOG_LEVEL
        }
    )

    # mode=none + readonly is the safe default, but it is easy to mistake for a
    # broken install: every write returns 403. Say so loudly at startup.
    try:
        from app.core.auth import AuthMode, load_auth_settings

        settings = load_auth_settings()
        if settings.mode is AuthMode.NONE and settings.default_role.value == "readonly":
            logger.warning(
                "auth.mode is 'none' with default_role 'readonly' - the app is READ-ONLY. "
                "Set 'auth.default_role: admin' in config.yml to allow changes, or configure "
                "'auth.mode: local|ldap' for sign-in."
            )
        else:
            logger.info(
                "Authentication mode: %s (default role: %s)",
                settings.mode.value,
                settings.default_role.value,
            )
    except Exception as exc:  # noqa: BLE001 - never block startup over logging
        logger.warning("Could not evaluate auth settings: %s", exc)

@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup resources on shutdown."""
    logger.info("LDAP Manager shutting down")
    ldap_pool.clear()

# Serve static files
#
# index.html must always be revalidated: it is the file that names the current
# content-hashed bundle. Without Cache-Control a browser applies heuristic
# caching to it, keeps an old copy, and the user silently runs stale JavaScript
# (the classic "I rebuilt it but the UI did not change").
NO_CACHE = {"Cache-Control": "no-cache, must-revalidate"}
# Hashed filenames are content-addressed, so they can be cached hard.
IMMUTABLE = {"Cache-Control": "public, max-age=31536000, immutable"}

static_dir = Path(__file__).parent / "static"
if static_dir.exists():

    class ImmutableStaticFiles(StaticFiles):
        """Hashed assets are content-addressed, so let browsers keep them."""

        async def get_response(self, path, scope):
            response = await super().get_response(path, scope)
            if response.status_code == 200:
                response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
            return response

    app.mount(
        "/assets",
        ImmutableStaticFiles(directory=str(static_dir / "assets")),
        name="assets",
    )

    @app.get("/")
    async def serve_spa():
        return FileResponse(str(static_dir / "index.html"), headers=NO_CACHE)

    @app.get("/{full_path:path}")
    async def serve_spa_routes(full_path: str):
        file_path = static_dir / full_path
        if file_path.exists() and file_path.is_file():
            # Hashed asset -> cache hard; anything else -> revalidate.
            headers = IMMUTABLE if full_path.startswith("assets/") else NO_CACHE
            return FileResponse(str(file_path), headers=headers)
        return FileResponse(str(static_dir / "index.html"), headers=NO_CACHE)
else:
    @app.get("/")
    def root():
        return {"message": "LDAP Management API", "version": "1.0.0", "context_path": CONTEXT_PATH}

@app.get("/health")
async def health_check():
    """
    Production health check with dependency validation.

    Returns 200 if healthy, 503 if unhealthy or degraded.
    """
    from app.core.config import load_config
    from app.core.credentials import resolve_password
    from app.core.ldap_client import LDAPClient, LDAPConfig, tls_kwargs
    from app.core.node_selector import NodeSelector, OperationType

    health = {
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "version": "1.0.0",
        "context_path": CONTEXT_PATH,
        "checks": {}
    }

    # Check config file exists and is valid
    try:
        clusters = load_config()
        health["checks"]["config"] = {
            "status": "ok",
            "clusters_count": len(clusters)
        }
    except Exception as e:
        health["status"] = "unhealthy"
        health["checks"]["config"] = {
            "status": "failed",
            "error": str(e)
        }
        return JSONResponse(content=health, status_code=503)

    # Check connection pool status
    try:
        pool_stats = ldap_pool.get_stats()
        health["checks"]["connection_pool"] = {
            "status": "ok",
            "pool_size": pool_stats["pool_size"]
        }
    except Exception as e:
        health["status"] = "degraded"
        health["checks"]["connection_pool"] = {
            "status": "failed",
            "error": str(e)
        }

    # Check LDAP connectivity (first cluster only, if password is cached)
    try:
        if clusters:
            test_cluster = clusters[0]
            password = resolve_password(test_cluster)
            if password:
                host, port = NodeSelector.select_node(test_cluster, OperationType.HEALTH)
                config = LDAPConfig(
                    host=host,
                    port=port,
                    bind_dn=test_cluster.bind_dn,
                    bind_password=password,
                    base_dn=test_cluster.base_dn or '',
                    **tls_kwargs(test_cluster),
                )
                client = LDAPClient(config)
                client.connect()
                client.disconnect()
                health["checks"]["ldap"] = {
                    "status": "ok",
                    "cluster": test_cluster.name
                }
            else:
                health["checks"]["ldap"] = {
                    "status": "skipped",
                    "reason": "no_cached_password"
                }
    except Exception as e:
        health["status"] = "degraded"
        health["checks"]["ldap"] = {
            "status": "failed",
            "error": str(e)
        }

    status_code = 200 if health["status"] == "healthy" else 503
    return JSONResponse(content=health, status_code=status_code)
