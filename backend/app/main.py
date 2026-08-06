from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
import app.db.base  # Ensure all models are registered
from app.db.base import Base
from app.db.session import engine
from app.api.v1 import auth, yummy, schema, remote_actions, sync

app = FastAPI(title=settings.PROJECT_NAME, version=settings.VERSION)

# Automatically create all tables (e.g. pairing_codes) if they don't exist
Base.metadata.create_all(bind=engine)

# Set all CORS enabled origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix=f"{settings.API_V1_STR}/auth", tags=["auth"])
app.include_router(yummy.router, prefix=f"{settings.API_V1_STR}/yummy-installations", tags=["yummy"])
app.include_router(schema.router, prefix=f"{settings.API_V1_STR}/schema", tags=["schema"])
app.include_router(remote_actions.router, prefix=f"{settings.API_V1_STR}/remote-actions", tags=["remote-actions"])
app.include_router(sync.router, prefix=f"{settings.API_V1_STR}/sync", tags=["sync"])
from app.api.v1 import dashboard
from app.api.v1 import data
from app.api.v1 import orders

app.include_router(dashboard.router, prefix=f"{settings.API_V1_STR}/dashboard", tags=["dashboard"])
app.include_router(data.router, prefix=f"{settings.API_V1_STR}/data", tags=["data"])
app.include_router(orders.router, prefix=f"{settings.API_V1_STR}/orders", tags=["orders"])

@app.get("/")
def root():
    return {"message": "Central Dashboard API is running. Go to /docs for API documentation."}
