-- Function for an approver to action an approval step
CREATE OR REPLACE FUNCTION public.approve_milestone_step(
    p_approval_step_id uuid,
    p_action text, -- 'approve' or 'reject'
    p_comments text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER -- To update steps and potentially related records
SET search_path = public, extensions
AS $$
DECLARE
    v_user_id uuid := auth.uid();
    v_step RECORD;
    v_approval RECORD;
    v_milestone_id uuid;
    v_all_steps_approved boolean := true; -- Assume true initially
    v_any_step_rejected boolean := false;
BEGIN
    -- 1. Fetch the approval step and verify the current user is the approver
    SELECT * INTO v_step
    FROM public.approval_steps
    WHERE id = p_approval_step_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'APPROVAL_STEP_NOT_FOUND';
    END IF;

    IF v_step.approver_user_id <> v_user_id THEN
        RAISE EXCEPTION 'USER_NOT_APPROVER';
    END IF;

    IF v_step.status <> 'pending' THEN
        RAISE EXCEPTION 'STEP_ALREADY_ACTIONED:%', v_step.status;
    END IF;

    -- 2. Validate action
    IF p_action NOT IN ('approve', 'reject') THEN
        RAISE EXCEPTION 'INVALID_ACTION';
    END IF;

    -- *** BEGIN TRANSACTION (Implicit) ***

    -- 3. Update the approval step
    UPDATE public.approval_steps
    SET status = CASE p_action WHEN 'approve' THEN 'approved' WHEN 'reject' THEN 'rejected' END,
        comments = p_comments,
        actioned_at = now()
    WHERE id = p_approval_step_id;

    -- 4. Check the status of the overall approval request
    SELECT * INTO v_approval FROM public.approvals WHERE id = v_step.approval_id;

    IF v_approval.status = 'pending' THEN -- Only update overall status if it's still pending
        IF p_action = 'reject' THEN
            -- If any step is rejected, the whole approval is rejected
            UPDATE public.approvals
            SET status = 'rejected', finalized_at = now()
            WHERE id = v_step.approval_id;

            -- Update the related milestone status
            IF v_approval.entity_type = 'milestone' THEN
                UPDATE public.milestones
                SET status = 'Rejected' -- Set milestone status to Rejected
                WHERE id = v_approval.entity_id;
            END IF;
            -- TODO: Add notification logic for rejection

        ELSIF p_action = 'approve' THEN
            -- Check if all other steps are also approved (for multi-step workflows)
            SELECT NOT EXISTS (
                SELECT 1 FROM public.approval_steps
                WHERE approval_id = v_step.approval_id AND status <> 'approved'
            ) INTO v_all_steps_approved;

            IF v_all_steps_approved THEN
                -- All steps approved, update overall approval
                UPDATE public.approvals
                SET status = 'approved', finalized_at = now()
                WHERE id = v_step.approval_id;

                -- Update the related milestone status
                IF v_approval.entity_type = 'milestone' THEN
                    UPDATE public.milestones
                    SET status = 'Approved', -- Set milestone status to Approved
                        signed_off_by_user_id = v_user_id, -- Record final approver (could be last step approver)
                        signed_off_at = now()
                    WHERE id = v_approval.entity_id;
                END IF;
                -- TODO: Add notification logic for final approval
            END IF;
        END IF;
    END IF;

    -- *** END TRANSACTION (Commit on success) ***

EXCEPTION
    WHEN raise_exception THEN RAISE; -- Propagate specific errors
    WHEN others THEN
        RAISE WARNING 'Error in approve_milestone_step for step %: %', p_approval_step_id, SQLERRM;
        RAISE; -- Re-raise
END;
$$;

GRANT EXECUTE ON FUNCTION public.approve_milestone_step(uuid, text, text) TO authenticated;

COMMENT ON FUNCTION public.approve_milestone_step(uuid, text, text) IS 'Allows an assigned approver to approve or reject a specific approval step, updating related statuses.';
