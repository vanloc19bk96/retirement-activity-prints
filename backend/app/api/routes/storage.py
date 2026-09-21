from fastapi import APIRouter, Depends, HTTPException, UploadFile

from app.core.dependencies import get_current_user_id
from app.schemas.storage import UploadImageResponse
from app.services.storage_service import upload_user_image

router = APIRouter(prefix="/storage", tags=["storage"])


@router.post("/images", response_model=UploadImageResponse, summary="Upload image to Supabase Storage")
def upload_image(
    file: UploadFile,
    user_id: str = Depends(get_current_user_id),
) -> UploadImageResponse:
    try:
        result = upload_user_image(file=file, user_id=user_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # pragma: no cover - best-effort error mapping
        raise HTTPException(status_code=500, detail="Upload failed") from exc

    return UploadImageResponse(bucket=result.bucket, path=result.path, publicUrl=result.public_url)

