from __future__ import annotations

from typing import Any
from unittest.mock import patch

from app.services.library_assets_service import list_indexed_library_assets


class FakeResponse:
    def __init__(self, data: list[dict[str, Any]]) -> None:
        self.data = data


class FakeQuery:
    def __init__(self, responses: list[list[dict[str, Any]]]) -> None:
        self.responses = responses
        self.ilike_calls: list[tuple[str, str]] = []
        self.range_calls: list[tuple[int, int]] = []

    def table(self, _name: str) -> FakeQuery:
        return self

    def select(self, _columns: str) -> FakeQuery:
        return self

    def eq(self, _column: str, _value: object) -> FakeQuery:
        return self

    def ilike(self, column: str, pattern: str) -> FakeQuery:
        self.ilike_calls.append((column, pattern))
        return self

    def order(self, _column: str, *, desc: bool) -> FakeQuery:
        return self

    def range(self, start: int, end: int) -> FakeQuery:
        self.range_calls.append((start, end))
        return self

    def limit(self, _limit: int) -> FakeQuery:
        return self

    def execute(self) -> FakeResponse:
        return FakeResponse(self.responses.pop(0))


def _row(index: int) -> dict[str, Any]:
    return {
        "id": f"00000000-0000-0000-0000-{index:012d}",
        "object_path": f"animals/item_{index}.svg",
        "thumbnail_object_path": None,
        "title": f"item {index}",
        "slug": f"item_{index}",
        "tags": ["animals"],
    }


def test_list_indexed_library_assets_returns_limit_plus_one_page() -> None:
    query = FakeQuery([[_row(1), _row(2), _row(3)]])

    with patch("app.services.library_assets_service._db", return_value=query):
        result = list_indexed_library_assets(
            kind="emoji",
            search_query=None,
            limit=2,
            offset=4,
        )

    assert result is not None
    rows, has_more = result
    assert [row.slug for row in rows] == ["item_1", "item_2"]
    assert has_more is True
    assert query.range_calls == [(4, 6)]


def test_list_indexed_library_assets_escapes_search_wildcards() -> None:
    query = FakeQuery([[_row(1)]])

    with patch("app.services.library_assets_service._db", return_value=query):
        list_indexed_library_assets(
            kind="outline",
            search_query="50%_off",
            limit=40,
            offset=0,
        )

    assert query.ilike_calls == [("search_text", "%50\\%\\_off%")]


def test_list_indexed_library_assets_returns_none_when_kind_is_unsynced() -> None:
    query = FakeQuery([[], []])

    with patch("app.services.library_assets_service._db", return_value=query):
        result = list_indexed_library_assets(
            kind="outline",
            search_query=None,
            limit=40,
            offset=0,
        )

    assert result is None
