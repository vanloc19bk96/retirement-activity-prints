import type { WhoKnowsBestItem, WhoKnowsBestResponse } from '@/types/studio-who-knows-best.types'

/**
 * A service reply as it arrives: twelve questions from twelve topics (the
 * retirement-plans anchor first), then spares. Every question is valid and
 * distinct from every other. Mirrors FIXTURE in
 * backend/tests/test_studio_who_knows_best_service.py.
 */
export const WKB_FIXTURE_ITEMS: readonly WhoKnowsBestItem[] = [
  { topic: 'retirement-plans', shape: 'prediction', answer: 'phrase', concept: 'first free monday', question: 'What will they do on their very first free Monday?' },
  { topic: 'career-path', shape: 'past', answer: 'phrase', concept: 'first paid job', question: 'What was the very first job they were ever paid to do?' },
  { topic: 'drinks-snacks', shape: 'choice', answer: 'word', concept: 'hot drink pick', question: 'Tea, coffee or hot chocolate: which would they pick first?' },
  { topic: 'workday', shape: 'number', answer: 'word', concept: 'arrival time', question: 'What time did they usually arrive on a workday?' },
  { topic: 'personality', shape: 'known-for', answer: 'sentence', concept: 'signature saying', question: 'What do they always say when a plan goes sideways?' },
  { topic: 'travel', shape: 'top-pick', answer: 'phrase', concept: 'dream destination', question: 'Where in the world would they go if they could leave tomorrow?' },
  { topic: 'food', shape: 'habit', answer: 'phrase', concept: 'restaurant order', question: 'What do they usually order when eating out?' },
  { topic: 'hobbies', shape: 'top-pick', answer: 'phrase', concept: 'hours-long hobby', question: 'Which hobby could they talk about for hours?' },
  { topic: 'what-ifs', shape: 'prediction', answer: 'phrase', concept: 'dream shop', question: 'If they opened a small shop, what would it sell?' },
  { topic: 'social', shape: 'known-for', answer: 'phrase', concept: 'party role', question: 'What role do they always end up playing at a party?' },
  { topic: 'early-years', shape: 'past', answer: 'phrase', concept: 'childhood dream job', question: 'What did they want to be when they grew up?' },
  { topic: 'everyday', shape: 'number', answer: 'word', concept: 'day off wake time', question: 'What time do they wake up on a day off?' },
  { topic: 'entertainment', shape: 'choice', answer: 'word', concept: 'film night pick', question: 'Comedy, thriller or musical: which film would they choose?' },
  { topic: 'talents', shape: 'known-for', answer: 'phrase', concept: 'go-to fixer', question: 'What is the one thing everyone asks them to fix?' },
  { topic: 'little-pleasures', shape: 'top-pick', answer: 'phrase', concept: 'mood-lifting treat', question: 'Which small treat is guaranteed to brighten their day?' },
  { topic: 'legacy', shape: 'known-for', answer: 'sentence', concept: 'advice for new starters', question: 'What piece of advice did they give every new starter?' },
  { topic: 'retirement-plans', shape: 'top-pick', answer: 'phrase', concept: 'skill to learn', question: 'Which new skill are they most keen to learn now?' },
  { topic: 'drinks-snacks', shape: 'top-pick', answer: 'phrase', concept: 'train journey snack', question: 'What snack would they pack for a long train journey?' },
  { topic: 'travel', shape: 'choice', answer: 'word', concept: 'beach mountains or city', question: 'Beach, mountains or city: where would they rather spend a week?' },
  { topic: 'personality', shape: 'choice', answer: 'word', concept: 'early bird or night owl', question: 'Early bird or night owl: which one are they?' },
]

export const WKB_FIXTURE: WhoKnowsBestResponse = { questions: [...WKB_FIXTURE_ITEMS] }

export const WKB_FIXTURE_QUESTIONS: readonly string[] = WKB_FIXTURE_ITEMS.map((item) => item.question)
