-- Apply moddatetime trigger to tables with an updated_at column

-- Function provided by the moddatetime extension
-- CREATE FUNCTION moddatetime() RETURNS trigger LANGUAGE C AS '$libdir/moddatetime', 'moddatetime_timestamp';

-- Apply trigger to companies
CREATE TRIGGER handle_updated_at BEFORE UPDATE ON companies
  FOR EACH ROW EXECUTE FUNCTION extensions.moddatetime (updated_at);

-- Apply trigger to user_profiles
CREATE TRIGGER handle_updated_at BEFORE UPDATE ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION extensions.moddatetime (updated_at);

-- Apply trigger to invitations
CREATE TRIGGER handle_updated_at BEFORE UPDATE ON invitations
  FOR EACH ROW EXECUTE FUNCTION extensions.moddatetime (updated_at);

-- Apply trigger to roles
CREATE TRIGGER handle_updated_at BEFORE UPDATE ON roles
  FOR EACH ROW EXECUTE FUNCTION extensions.moddatetime (updated_at);

-- Apply trigger to sso_configurations
CREATE TRIGGER handle_updated_at BEFORE UPDATE ON sso_configurations
  FOR EACH ROW EXECUTE FUNCTION extensions.moddatetime (updated_at);

-- Apply trigger to projects
CREATE TRIGGER handle_updated_at BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION extensions.moddatetime (updated_at);

-- Apply trigger to milestones
CREATE TRIGGER handle_updated_at BEFORE UPDATE ON milestones
  FOR EACH ROW EXECUTE FUNCTION extensions.moddatetime (updated_at);

-- Apply trigger to risks
CREATE TRIGGER handle_updated_at BEFORE UPDATE ON risks
  FOR EACH ROW EXECUTE FUNCTION extensions.moddatetime (updated_at);

-- Apply trigger to issues
CREATE TRIGGER handle_updated_at BEFORE UPDATE ON issues
  FOR EACH ROW EXECUTE FUNCTION extensions.moddatetime (updated_at);

-- Apply trigger to sections
CREATE TRIGGER handle_updated_at BEFORE UPDATE ON sections
  FOR EACH ROW EXECUTE FUNCTION extensions.moddatetime (updated_at);

-- Apply trigger to tasks
CREATE TRIGGER handle_updated_at BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION extensions.moddatetime (updated_at);

-- Apply trigger to task_comments
CREATE TRIGGER handle_updated_at BEFORE UPDATE ON task_comments
  FOR EACH ROW EXECUTE FUNCTION extensions.moddatetime (updated_at);

-- Apply trigger to documents
CREATE TRIGGER handle_updated_at BEFORE UPDATE ON documents
  FOR EACH ROW EXECUTE FUNCTION extensions.moddatetime (updated_at);

-- Apply trigger to pages (Commented out: Table might not exist yet)
-- CREATE TRIGGER handle_updated_at BEFORE UPDATE ON pages
--   FOR EACH ROW EXECUTE FUNCTION extensions.moddatetime (updated_at);

-- Apply trigger to document_comments (Commented out: Table might not exist yet)
-- CREATE TRIGGER handle_updated_at BEFORE UPDATE ON document_comments
--   FOR EACH ROW EXECUTE FUNCTION extensions.moddatetime (updated_at);

-- Apply trigger to meetings (Commented out: Table might not exist yet)
-- CREATE TRIGGER handle_updated_at BEFORE UPDATE ON meetings
--   FOR EACH ROW EXECUTE FUNCTION extensions.moddatetime (updated_at);

-- Apply trigger to courses (Commented out: Table might not exist yet)
-- CREATE TRIGGER handle_updated_at BEFORE UPDATE ON courses
--   FOR EACH ROW EXECUTE FUNCTION extensions.moddatetime (updated_at);

-- Apply trigger to lessons (Commented out: Table might not exist yet)
-- CREATE TRIGGER handle_updated_at BEFORE UPDATE ON lessons
--   FOR EACH ROW EXECUTE FUNCTION extensions.moddatetime (updated_at);

-- Note: Tables like pages, document_comments, meetings, courses, lessons, task_files,
-- course_assignments, lesson_completions, user_badges might need triggers added later
-- once the tables are confirmed/created. Some are append-only and might not need it.
-- might be less critical, but could be added for consistency if desired.
