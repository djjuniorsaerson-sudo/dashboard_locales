from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.api import deps
from app.services.extractor import DataExtractor

router = APIRouter()

@router.get("/metrics")
def get_dashboard_metrics(
    period: str = "today",
    db: Session = Depends(deps.get_db),
    # Podríamos añadir dependencias de seguridad: current_user = Depends(deps.get_current_active_user)
):
    """
    Retorna métricas reales en base a la extracción del POS.
    """
    return DataExtractor.get_dashboard_metrics(db, period)
