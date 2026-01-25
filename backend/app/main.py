from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from pathlib import Path
import os
import time
import logging
from datetime import datetime
from app.api import connection, entries, monitoring, logs, clusters, password
from app.core.connection_pool import pool as ldap_pool
from app.core.logging_config import setup_logging

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

app.include_router(clusters.router, prefix="/api/clusters", tags=["clusters"])
app.include_router(password.router, prefix="/api/password", tags=["password"])
app.include_router(connection.router, prefix="/api/connection", tags=["connection"])
app.include_router(entries.router, prefix="/api/entries", tags=["entries"])
app.include_router(monitoring.router, prefix="/api/monitoring", tags=["monitoring"])
app.include_router(logs.router, prefix="/api/logs", tags=["logs"])

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

@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup resources on shutdown."""
    logger.info("LDAP Manager shutting down")
    ldap_pool.clear()

# Serve static files
static_dir = Path(__file__).parent / "static"
if static_dir.exists():
    app.mount("/assets", StaticFiles(directory=str(static_dir / "assets")), name="assets")
    
    @app.get("/")
    async def serve_spa():
        return FileResponse(str(static_dir / "index.html"))
    
    @app.get("/{full_path:path}")
    async def serve_spa_routes(full_path: str):
        file_path = static_dir / full_path
        if file_path.exists() and file_path.is_file():
            return FileResponse(str(file_path))
        return FileResponse(str(static_dir / "index.html"))
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
    from app.core.password_cache import get_password
    from app.core.ldap_client import LDAPClient, LDAPConfig
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
            password = get_password(test_cluster.name, test_cluster.bind_dn)
            if password:
                host, port = NodeSelector.select_node(test_cluster, OperationType.HEALTH)
                config = LDAPConfig(
                    host=host,
                    port=port,
                    bind_dn=test_cluster.bind_dn,
                    bind_password=password,
                    base_dn=test_cluster.base_dn or ''
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
