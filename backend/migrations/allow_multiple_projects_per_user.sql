-- Hub projects: a user can keep several projects, each opened from the Creator Hub by id.
--
-- Run only AFTER the backend that reads projects by id (not by user) is deployed: the old
-- backend saved settings with `upsert(on_conflict="user_id")`, which needs this constraint.
-- No row is changed: every existing project keeps its id and its canvases.
--
-- Rolling back (re-adding the unique constraint) is only possible while no user has a
-- second project.

alter table retirement_activity_prints.projects
  drop constraint if exists projects_user_id_key;

-- The user's projects, latest first (projects_service.latest_project_id, image cleanup).
create index if not exists projects_user_id_updated_at_idx
  on retirement_activity_prints.projects (user_id, updated_at desc);
