from __future__ import annotations

from typing import Any

from app.core.email import (
    apply_case_insensitive_email_filter,
    escape_ilike_pattern,
    fetch_user_row_by_email,
    normalize_email,
    prefer_stored_email_row,
)


class FakeQuery:
    def __init__(self, rows: list[dict[str, Any]] | None = None) -> None:
        self.ilike_calls: list[tuple[str, str]] = []
        self.limit_calls: list[int] = []
        self.rows = rows or []

    def ilike(self, column: str, pattern: str) -> FakeQuery:
        self.ilike_calls.append((column, pattern))
        return self

    def limit(self, value: int) -> FakeQuery:
        self.limit_calls.append(value)
        return self

    def execute(self) -> Any:
        class FakeResponse:
            def __init__(self, data: list[dict[str, Any]]) -> None:
                self.data = data

        return FakeResponse(self.rows)


def test_normalize_email_lowercases_and_strips() -> None:
    assert normalize_email("  Latrydiafuller8@gmail.com  ") == "latrydiafuller8@gmail.com"


def test_escape_ilike_pattern_escapes_wildcards() -> None:
    assert escape_ilike_pattern("user_name@x.com") == "user\\_name@x.com"
    assert escape_ilike_pattern("50%@x.com") == "50\\%@x.com"
    assert escape_ilike_pattern("a\\b@x.com") == "a\\\\b@x.com"


def test_apply_case_insensitive_email_filter_calls_ilike_with_escaped_lowercase() -> None:
    query = FakeQuery()
    result = apply_case_insensitive_email_filter(query, "  Latrydiafuller8@gmail.com  ")
    assert result is query
    assert query.ilike_calls == [("email", "latrydiafuller8@gmail.com")]


def test_apply_case_insensitive_email_filter_escapes_email_wildcards() -> None:
    query = FakeQuery()
    apply_case_insensitive_email_filter(query, "User_Name@x.com")
    assert query.ilike_calls == [("email", "user\\_name@x.com")]


def test_prefer_stored_email_row_prefers_mixed_case_when_both_exist() -> None:
    rows: list[dict[str, Any]] = [
        {"id": "1", "email": "latrydiafuller8@gmail.com"},
        {"id": "2", "email": "Latrydiafuller8@gmail.com"},
    ]
    chosen = prefer_stored_email_row(rows, "latrydiafuller8@gmail.com")
    assert chosen == {"id": "2", "email": "Latrydiafuller8@gmail.com"}


def test_prefer_stored_email_row_matches_lowercase_query_to_mixed_case_stored() -> None:
    rows: list[dict[str, Any]] = [{"id": "1", "email": "Latrydiafuller8@gmail.com"}]
    chosen = prefer_stored_email_row(rows, "latrydiafuller8@gmail.com")
    assert chosen == {"id": "1", "email": "Latrydiafuller8@gmail.com"}


def test_fetch_user_row_by_email_uses_ilike_and_returns_mixed_case_row() -> None:
    query = FakeQuery([{"id": "1", "email": "Latrydiafuller8@gmail.com"}])
    chosen = fetch_user_row_by_email(query, "latrydiafuller8@gmail.com")
    assert chosen == {"id": "1", "email": "Latrydiafuller8@gmail.com"}
    assert query.ilike_calls == [("email", "latrydiafuller8@gmail.com")]
    assert query.limit_calls == [5]
