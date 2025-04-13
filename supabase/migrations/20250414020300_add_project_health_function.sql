-- Function to calculate project health based on example logic
CREATE OR REPLACE FUNCTION public.calculate_project_health(p_project_id uuid)
RETURNS text -- Returns 'On Track', 'At Risk', or 'Off Track'
LANGUAGE plpgsql
STABLE -- Doesn't modify data, just reads
SECURITY DEFINER -- To query related tables potentially restricted by RLS
SET search_path = public
AS $$
DECLARE
    v_total_tasks integer;
    v_overdue_tasks integer;
    v_overdue_percentage float;
    v_critical_milestone_overdue boolean := false;
    v_any_milestone_overdue boolean := false;
    v_open_high_critical_issues integer;
    v_open_high_impact_risks integer;
    v_health text := 'On Track'; -- Default to On Track
BEGIN
    -- Calculate overdue task percentage
    SELECT COUNT(*), COUNT(*) FILTER (WHERE status <> 'Complete' AND due_date IS NOT NULL AND due_date < now())
    INTO v_total_tasks, v_overdue_tasks
    FROM tasks t JOIN sections s ON t.section_id = s.id
    WHERE s.project_id = p_project_id;

    IF v_total_tasks > 0 THEN
        v_overdue_percentage := (v_overdue_tasks::float / v_total_tasks::float) * 100.0;
    ELSE
        v_overdue_percentage := 0;
    END IF;

    -- Check for overdue milestones
    SELECT EXISTS (SELECT 1 FROM milestones WHERE project_id = p_project_id AND status <> 'Completed' AND due_date IS NOT NULL AND due_date < (now() - interval '7 days')), -- Critical overdue > 7 days
           EXISTS (SELECT 1 FROM milestones WHERE project_id = p_project_id AND status <> 'Completed' AND due_date IS NOT NULL AND due_date < now()) -- Any overdue
    INTO v_critical_milestone_overdue, v_any_milestone_overdue;

    -- Count open high/critical issues
    SELECT COUNT(*) INTO v_open_high_critical_issues
    FROM issues
    WHERE project_id = p_project_id AND status IN ('Open', 'Investigating') AND priority IN ('High', 'Critical');

    -- Count open high impact risks
    SELECT COUNT(*) INTO v_open_high_impact_risks
    FROM risks
    WHERE project_id = p_project_id AND status IN ('Potential', 'Open') AND impact = 'High';

    -- Apply Rules (Order matters: Off Track > At Risk > On Track)
    IF v_overdue_percentage > 20.0 OR v_critical_milestone_overdue THEN
        v_health := 'Off Track';
    ELSIF v_overdue_percentage > 5.0 OR v_any_milestone_overdue OR (v_open_high_critical_issues + v_open_high_impact_risks) > 2 THEN
        v_health := 'At Risk';
    ELSE
        v_health := 'On Track';
    END IF;

    RETURN v_health;

END;
$$;

GRANT EXECUTE ON FUNCTION public.calculate_project_health(uuid) TO postgres; -- Grant to role running cron/scheduler function
GRANT EXECUTE ON FUNCTION public.calculate_project_health(uuid) TO authenticated; -- Grant to authenticated if needed elsewhere

COMMENT ON FUNCTION public.calculate_project_health(uuid) IS 'Calculates project health status based on overdue tasks, milestones, and open high-priority risks/issues.';
