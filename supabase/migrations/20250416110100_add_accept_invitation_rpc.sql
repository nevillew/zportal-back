-- Migration to create the accept_invitation RPC function for transactional invite acceptance

CREATE OR REPLACE FUNCTION public.accept_invitation(
    p_token text,
    p_user_id uuid -- The user accepting the invitation (passed from Edge Function)
)
RETURNS uuid -- Returns the company_id the user was added to
LANGUAGE plpgsql
VOLATILE -- Modifies the database
SECURITY DEFINER -- To update invitations and insert into company_users
SET search_path = public, extensions
AS $$
DECLARE
    v_invitation RECORD;
    v_company_id uuid;
BEGIN
    -- 1. Fetch Invitation by Token
    SELECT id, email, company_id, role, status, expires_at
    INTO v_invitation
    FROM public.invitations
    WHERE token = p_token;

    -- 2. Validate Invitation
    IF NOT FOUND THEN
        RAISE EXCEPTION 'INVITATION_NOT_FOUND'; -- Specific error code
    END IF;

    IF v_invitation.status <> 'pending' THEN
        RAISE EXCEPTION 'INVITATION_ALREADY_USED:%', v_invitation.status; -- Specific error code with status
    END IF;

    IF v_invitation.expires_at < now() THEN
        -- Update status to 'expired' for clarity
        UPDATE public.invitations SET status = 'expired' WHERE id = v_invitation.id;
        RAISE EXCEPTION 'INVITATION_EXPIRED'; -- Specific error code
    END IF;

    -- 3. Verify User Email Matches Invitation Email (User must be authenticated)
    IF (SELECT email FROM auth.users WHERE id = p_user_id) <> v_invitation.email THEN
        RAISE EXCEPTION 'EMAIL_MISMATCH'; -- Specific error code
    END IF;

    -- *** BEGIN TRANSACTION (Implicit in PL/pgSQL function) ***

    -- 4. Create company_users record (Handle potential conflict)
    BEGIN
        INSERT INTO public.company_users (user_id, company_id, role)
        VALUES (p_user_id, v_invitation.company_id, v_invitation.role);
    EXCEPTION
        WHEN unique_violation THEN
            -- User is already a member, this is acceptable. Log and continue.
            RAISE LOG 'User % already member of company %. Proceeding to accept invitation status.', p_user_id, v_invitation.company_id;
    END;

    -- 5. Update Invitation Status
    UPDATE public.invitations
    SET status = 'accepted'
    WHERE id = v_invitation.id;

    -- *** END TRANSACTION (Commit happens automatically on success) ***

    v_company_id := v_invitation.company_id;
    RETURN v_company_id;

EXCEPTION
    -- Catch specific exceptions raised above and re-raise them
    WHEN raise_exception THEN
        RAISE EXCEPTION '%', SQLERRM; -- Propagate the specific error message
    -- Catch any other unexpected errors
    WHEN others THEN
        RAISE WARNING 'Unexpected error accepting invitation token % for user %: %', p_token, p_user_id, SQLERRM;
        RAISE EXCEPTION 'INTERNAL_SERVER_ERROR:%', SQLERRM; -- Generic internal error code
END;
$$;

-- Grant execute permission to the authenticated role
GRANT EXECUTE ON FUNCTION public.accept_invitation(text, uuid) TO authenticated;

COMMENT ON FUNCTION public.accept_invitation(text, uuid) IS 'Accepts an invitation token for the specified user, creating the company user link and updating invitation status within a transaction.';
