-- The app's id model is "uuid for user-created rows, slug for shipped
-- content" (e.g. the home page's id IS "home", and seeded shipped pages keep
-- their slug ids). The initial schema over-assumed uuid everywhere; align the
-- columns with reality.
alter table pages alter column id type text;
alter table blocks alter column id type text;
alter table blocks alter column page_id type text;
alter table databases alter column id type text;
alter table database_rows alter column id type text;
alter table database_rows alter column database_id type text;
alter table shape_log alter column row_id type text;
