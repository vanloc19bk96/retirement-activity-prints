from fastapi import APIRouter

from app.api.routes.storage import router as storage_router
from app.api.routes.projects import router as projects_router
from app.api.routes.canvases import router as canvases_router
from app.api.routes.warriorplus import router as warriorplus_router
from app.api.routes.auth import router as auth_router
from app.api.routes.ai_images import router as ai_images_router
from app.api.routes.cover import router as cover_router
from app.api.routes.outlines import router as outlines_router
from app.api.routes.emojis import router as emojis_router
from app.api.routes.thumbnail_asset import router as thumbnail_asset_router
from app.api.routes.downloads import router as downloads_router
from app.api.routes.studio_crossword import router as studio_crossword_router
from app.api.routes.studio_missing_vowels import router as studio_missing_vowels_router
from app.api.routes.studio_cryptogram import router as studio_cryptogram_router
from app.api.routes.studio_fallen_phrase import (
    router as studio_fallen_phrase_router,
)
from app.api.routes.studio_phrase_finder import (
    router as studio_phrase_finder_router,
)
from app.api.routes.studio_retirement_anagram import (
    router as studio_retirement_anagram_router,
)
from app.api.routes.studio_riddle_scramble import (
    router as studio_riddle_scramble_router,
)
from app.api.routes.studio_theme_words import router as studio_theme_words_router
from app.api.routes.studio_hidden_message import router as studio_hidden_message_router
from app.api.routes.studio_word_search import router as studio_word_search_router
from app.api.routes.studio_trivia_clues import router as studio_trivia_clues_router
from app.api.routes.studio_top_five_guess import router as studio_top_five_guess_router
from app.api.routes.studio_would_you_rather import router as studio_would_you_rather_router
from app.api.routes.studio_ever_or_never import router as studio_ever_or_never_router
from app.api.routes.studio_retired_name import router as studio_retired_name_router
from app.api.routes.studio_two_truths_fib import router as studio_two_truths_fib_router

router = APIRouter()


@router.get("/health", summary="Health check", tags=["health"])
def health_check() -> dict[str, str]:
    return {"status": "ok"}


router.include_router(storage_router)
router.include_router(projects_router)
router.include_router(canvases_router)
router.include_router(warriorplus_router)
router.include_router(auth_router)
router.include_router(ai_images_router)
router.include_router(cover_router)
router.include_router(outlines_router)
router.include_router(emojis_router)
router.include_router(thumbnail_asset_router)
router.include_router(downloads_router)
router.include_router(studio_crossword_router)
router.include_router(studio_missing_vowels_router)
router.include_router(studio_cryptogram_router)
router.include_router(studio_fallen_phrase_router)
router.include_router(studio_phrase_finder_router)
router.include_router(studio_retirement_anagram_router)
router.include_router(studio_riddle_scramble_router)
router.include_router(studio_theme_words_router)
router.include_router(studio_hidden_message_router)
router.include_router(studio_word_search_router)
router.include_router(studio_trivia_clues_router)
router.include_router(studio_top_five_guess_router)
router.include_router(studio_would_you_rather_router)
router.include_router(studio_ever_or_never_router)
router.include_router(studio_retired_name_router)
router.include_router(studio_two_truths_fib_router)

__all__ = ["router"]
