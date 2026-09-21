"""Service package exports for runtime task discovery."""

from __future__ import annotations

from importlib import import_module
from types import ModuleType

_LAZY_MODULE_EXPORTS = {"ai_image_tasks"}


def __getattr__(name: str) -> ModuleType:
    if name in _LAZY_MODULE_EXPORTS:
        module = import_module(f"app.services.{name}")
        globals()[name] = module
        return module
    raise AttributeError(f"module '{__name__}' has no attribute '{name}'")


__all__ = tuple(_LAZY_MODULE_EXPORTS)
