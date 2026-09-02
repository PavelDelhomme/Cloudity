from fastapi import APIRouter

router = APIRouter(tags=["health"])


@router.get("/health")
@router.get("/admin/health")
async def health_check():
    """`/health` (direct) et `/admin/health` (via api-gateway PathPrefix)."""
    return {"status": "healthy", "service": "admin-service"}
