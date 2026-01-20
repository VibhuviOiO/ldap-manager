from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pathlib import Path
import os
from app.api import connection, entries, monitoring, logs, clusters, password

# Get context path from environment variable (default: empty string for root)
CONTEXT_PATH = os.getenv("CONTEXT_PATH", "").rstrip("/")

app = FastAPI(
    title="LDAP Management API",
    description="RESTful API for OpenLDAP management",
    version="1.0.0",
    root_path=CONTEXT_PATH
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(clusters.router, prefix="/api/clusters", tags=["clusters"])
app.include_router(password.router, prefix="/api/password", tags=["password"])
app.include_router(connection.router, prefix="/api/connection", tags=["connection"])
app.include_router(entries.router, prefix="/api/entries", tags=["entries"])
app.include_router(monitoring.router, prefix="/api/monitoring", tags=["monitoring"])
app.include_router(logs.router, prefix="/api/logs", tags=["logs"])

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
def health():
    return {"status": "healthy", "context_path": CONTEXT_PATH}
