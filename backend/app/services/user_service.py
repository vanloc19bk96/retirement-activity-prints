"""User service: upsert user on purchase (e.g. WarriorPlus IPN)."""

import logging
from datetime import datetime, timezone
from typing import Any, List, Optional, Tuple

from app.core.email import fetch_user_row_by_email, normalize_email
from app.core.supabase import create_supabase_admin_client

logger = logging.getLogger(__name__)

PROJECT_SCHEMA_NAME = "retirement_activity_prints"


class UserService:
    """Service for user operations: upsert on purchase."""

    PLAN_HIERARCHY = ["Starter", "Standard", "Pro"]

    def __init__(self):
        # Bind PostgREST client to non-public schema (Supabase defaults to `public`).
        self.supabase = create_supabase_admin_client().schema(PROJECT_SCHEMA_NAME)
        self.logger = logging.getLogger(__name__)

    def _normalize_plan(self, raw_plan: Optional[str]) -> str:
        if not raw_plan:
            return "Starter"
        normalized_plan = raw_plan.strip().lower()
        if normalized_plan in ("starter", "essential", "basic"):
            return "Starter"
        if normalized_plan in ("premium", "standard"):
            return "Standard"
        if normalized_plan in ("pro",):
            return "Pro"
        self.logger.warning("Unsupported plan received: %s. Fallback to Starter.", raw_plan)
        return "Starter"

    @staticmethod
    def _parse_iso_datetime(date_value: Optional[str]) -> Optional[datetime]:
        if not date_value:
            return None
        try:
            return datetime.fromisoformat(date_value.replace("Z", "+00:00"))
        except ValueError:
            return None

    async def upsert_user_on_purchase(
        self,
        email: str,
        name: Optional[str] = None,
        product_name: Optional[str] = None,
    ) -> Tuple[str, str]:
        """
        On purchase (e.g. IPN): create or update user by email. Returns (status, message).
        """
        try:
            plan = "Starter"
            if product_name and " - " in product_name:
                plan = product_name.split(" - ")[-1].strip()
            elif product_name:
                plan = product_name
            plan = self._normalize_plan(plan)

            stored_user = fetch_user_row_by_email(
                self.supabase.table("users").select("*"),
                email,
            )
            if stored_user:
                return await self._update_existing_user_on_purchase(stored_user, plan, email)
            return await self._create_new_user_on_purchase(email, name, plan)
        except Exception as e:
            self.logger.error("Error upserting user on purchase %s: %s", email, e)
            return "error", str(e)

    async def _update_existing_user_on_purchase(
        self, user: dict, plan: str, email: str
    ) -> Tuple[str, str]:
        """Update existing user plan (non-cumulative by plan)."""
        update_data = {}
        canonical = normalize_email(email)
        stored_email = str(user.get("email") or "")
        if stored_email != canonical:
            update_data["email"] = canonical
        if plan:
            existing_plan = self._normalize_plan(user.get("plan"))
            if existing_plan:
                try:
                    existing_plan_index = self.PLAN_HIERARCHY.index(existing_plan)
                except ValueError:
                    existing_plan_index = -1
                try:
                    new_plan_index = self.PLAN_HIERARCHY.index(plan)
                except ValueError:
                    new_plan_index = -1
                if new_plan_index > existing_plan_index:
                    update_data["plan"] = plan
            else:
                update_data["plan"] = plan
        if update_data:
            self.supabase.table("users").update(update_data).eq("id", user["id"]).execute()
            self.logger.info("Updated user on purchase: %s", email)
            return "success", f"User updated: {email}"
        return "success", f"User already exists: {email}"

    async def _create_new_user_on_purchase(
        self,
        email: str,
        name: Optional[str],
        plan: str,
    ) -> Tuple[str, str]:
        """Create user on first purchase (no password; access only via hub launch)."""
        canonical = normalize_email(email)
        new_user = {
            "email": canonical,
            "full_name": (name or canonical.split("@")[0]) if canonical else None,
            "plan": plan,
        }
        response = self.supabase.table("users").insert(new_user).execute()
        if response.data and len(response.data) > 0:
            self.logger.info("Created user on purchase: %s plan=%s", canonical, plan)
            return "success", f"User created: {canonical}"
        self.logger.error("Failed to create user: %s", canonical)
        return "error", "Failed to create user"

    @staticmethod
    def _display_name_from_user_row(row: dict[str, Any]) -> str:
        full_name = (row.get("full_name") or "").strip()
        if full_name:
            return full_name
        email = (row.get("email") or "").strip()
        if email and "@" in email:
            return email.split("@", 1)[0]
        return email or "Unknown"

    async def list_recent_sales_since(
        self,
        since: datetime,
        reference_time: datetime,
    ) -> List[dict[str, Any]]:
        """
        New signups since `since` (UTC), newest purchase first.
        Each item: name, purchased_at (UTC), seconds_since_purchase (vs reference_time).
        """
        since_iso = since.astimezone(timezone.utc).isoformat()
        response = (
            self.supabase.table("users")
            .select("full_name,email,created_at")
            .gte("created_at", since_iso)
            .order("created_at", desc=True)
            .execute()
        )
        rows: List[dict[str, Any]] = list(response.data or [])
        ref_utc = reference_time.astimezone(timezone.utc)

        def newest_first_key(row: dict[str, Any]) -> float:
            raw = row.get("created_at")
            parsed = self._parse_iso_datetime(raw) if isinstance(raw, str) else None
            if parsed is None:
                return float("-inf")
            return parsed.timestamp()

        rows.sort(key=newest_first_key, reverse=True)

        summaries: List[dict[str, Any]] = []
        for row in rows:
            raw_created = row.get("created_at")
            purchased_at = self._parse_iso_datetime(raw_created) if isinstance(raw_created, str) else None
            if purchased_at is None:
                self.logger.warning("User row missing parseable created_at, skipping: %s", row.get("email"))
                continue
            purchased_utc = purchased_at.astimezone(timezone.utc)
            seconds_since = max(0, int((ref_utc - purchased_utc).total_seconds()))
            summaries.append(
                {
                    "name": self._display_name_from_user_row(row),
                    "purchased_at": purchased_utc,
                    "seconds_since_purchase": seconds_since,
                }
            )
        return summaries

    def get_user_by_id(self, user_id: int | str) -> Optional[dict]:
        try:
            response = self.supabase.table("users").select("*").eq("id", user_id).execute()
            if response.data and len(response.data) > 0:
                return response.data[0]
            return None
        except Exception as e:
            self.logger.error(f"Error fetching user {user_id}: {str(e)}")
            return None

# Singleton instance
_user_service = None


def get_user_service() -> UserService:
    """Get or create UserService instance."""
    global _user_service
    if _user_service is None:
        _user_service = UserService()
    return _user_service
