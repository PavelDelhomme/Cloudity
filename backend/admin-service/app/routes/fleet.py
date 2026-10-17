"""Applications déployées et disque — administration, pas le kanban Docs."""
from fastapi import APIRouter

from app.services.disk_usage import collect_disk
from app.services.fleet import collect_fleet

router = APIRouter(prefix="/admin", tags=["fleet"])


@router.get("/fleet")
async def get_fleet():
    return collect_fleet()


@router.get("/disk")
async def get_disk():
    return collect_disk()
