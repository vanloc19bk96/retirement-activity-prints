-- Normalize user email casing so hub launch tokens (lowercase) match stored rows.
--
-- Duplicate-merge: if two rows collide on lower(trim(email)), keep the oldest
-- (created_at, then id). Only delete a duplicate if it has NO row in
-- retirement_activity_prints.projects — ON DELETE CASCADE would wipe books.

delete from retirement_activity_prints.users as duplicate
where exists (
  select 1
  from retirement_activity_prints.users as keeper
  where lower(trim(keeper.email)) = lower(trim(duplicate.email))
    and keeper.id <> duplicate.id
    and (
      keeper.created_at < duplicate.created_at
      or (keeper.created_at = duplicate.created_at and keeper.id < duplicate.id)
    )
)
and not exists (
  select 1
  from retirement_activity_prints.projects as project
  where project.user_id = duplicate.id
);

update retirement_activity_prints.users
set email = lower(trim(email))
where email <> lower(trim(email));

create or replace function retirement_activity_prints.normalize_user_email()
returns trigger
language plpgsql
as $$
begin
  new.email = lower(trim(new.email));
  return new;
end;
$$;

drop trigger if exists users_normalize_email on retirement_activity_prints.users;
create trigger users_normalize_email
before insert or update of email on retirement_activity_prints.users
for each row
execute function retirement_activity_prints.normalize_user_email();
