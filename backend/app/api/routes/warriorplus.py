"""WarriorPlus IPN routes."""

import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Form
from pydantic import BaseModel, ConfigDict, EmailStr

from app.services.user_service import get_user_service
from app.services.hub_sync import notify_hub_sync

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/warriorplus", tags=["WarriorPlus"])


class NotifySyncBody(BaseModel):
    """Body for testing hub sync from Swagger."""
    email: EmailStr


class RecentSaleItem(BaseModel):
    """Minimal sale row for dashboards."""

    model_config = ConfigDict(extra="ignore")

    name: str
    purchased_at: datetime
    seconds_since_purchase: int


class RecentSalesResponse(BaseModel):
    """New user signups in the window (WarriorPlus IPN), newest first."""

    model_config = ConfigDict(extra="ignore")

    since_utc: datetime
    until_utc: datetime
    count: int
    sales: list[RecentSaleItem]


@router.get(
    "/recent_sales",
    response_model=RecentSalesResponse,
    summary="Users created in the last 24 hours",
)
async def recent_sales():
    """
    New users in `retirement_activity_prints.users` with `created_at` in the past 24 hours (UTC).
    Each sale: display name, `purchased_at` (UTC), and `seconds_since_purchase` vs `until_utc`.
    Newest first.
    """
    until_utc = datetime.now(timezone.utc)
    since_utc = until_utc - timedelta(hours=24)
    user_service = get_user_service()
    sales = await user_service.list_recent_sales_since(since_utc, until_utc)
    return RecentSalesResponse(
        since_utc=since_utc,
        until_utc=until_utc,
        count=len(sales),
        sales=sales,
    )


@router.post("/notify-sync", summary="Notify hub to sync access (test)")
async def notify_sync_endpoint(body: NotifySyncBody):
    try:
        await notify_hub_sync(body.email)
        return {"message": "Sync requested", "email": body.email}
    except Exception as e:
        logger.exception("Notify sync failed: %s", e)
        return {"message": str(e), "email": body.email, "status": 500}


@router.post('/ipn')
async def warriorplus_ipn_handler(
    WP_BUYER_EMAIL: Optional[str] = Form(None),
    WP_BUYER_NAME: Optional[str] = Form(None), 
    WP_ITEM_NAME: Optional[str] = Form(None)
):
    """
    Handle WarriorPlus IPN notifications.
    
    - **WP_BUYER_EMAIL**: Buyer's email address
    - **WP_BUYER_NAME**: Buyer's full name
    - **WP_ITEM_NAME**: Product name purchased
    """
    try:
        # Extract user info from WarriorPlus IPN (field names are from WP API)
        email = WP_BUYER_EMAIL
        name = WP_BUYER_NAME
        product_name = WP_ITEM_NAME

        if not email:
            logger.warning("WarriorPlus IPN received without email")
            return {"message": "Missing email", "status": 400}

        # Create or update user by email (plan + quota)
        user_service = get_user_service()
        status, message = await user_service.upsert_user_on_purchase(
            email=email,
            name=name,
            product_name=product_name,
        )
        
        logger.info("WarriorPlus IPN processed: %s - %s for email: %s", status, message, email)

        # Notify hub to sync access so user can open app from hub
        if status == "success":
            try:
                await notify_hub_sync(email)
            except Exception as e:
                logger.warning("Hub sync after IPN failed (continuing): %s", e)
        
        # Always return OK for WarriorPlus (as per IPN requirements)
        return {"message": "OK", "status": 200}
        
    except Exception as e:
        logger.error(f"WarriorPlus IPN error: {str(e)}")
        return {"message": "OK", "status": 200}  # Still return OK to prevent IPN retries
