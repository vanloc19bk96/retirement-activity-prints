-- AI image form per project: the prompt, cover text and the last generated images, so they
-- are still there when the user comes back and image cleanup keeps those images.
--
-- Run BEFORE deploying the backend that reads this column. Until then the form still works,
-- it only forgets its contents, and image cleanup is skipped.

alter table retirement_activity_prints.projects
  add column if not exists ai_image_draft jsonb;

notify pgrst, 'reload schema';
