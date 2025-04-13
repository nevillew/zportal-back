-- Function to prevent updates to completed meetings (except notes/recording)
CREATE OR REPLACE FUNCTION public.prevent_completed_meeting_updates()
RETURNS TRIGGER AS $$
BEGIN
    -- Check if the meeting status was already 'completed'
    IF OLD.status = 'completed' THEN
        -- Allow updates only to 'notes' or 'recording_url'
        IF NEW.notes IS DISTINCT FROM OLD.notes OR NEW.recording_url IS DISTINCT FROM OLD.recording_url THEN
            -- If only notes/recording changed, allow the update but keep status completed
            NEW.status = OLD.status; -- Ensure status doesn't accidentally change
            NEW.company_id = OLD.company_id;
            NEW.project_id = OLD.project_id;
            NEW.calendly_event_uri = OLD.calendly_event_uri;
            NEW.calendly_invitee_uri = OLD.calendly_invitee_uri;
            NEW.name = OLD.name;
            NEW.type = OLD.type;
            NEW.scheduled_at = OLD.scheduled_at;
            NEW.duration_minutes = OLD.duration_minutes;
            NEW.attendees = OLD.attendees;
            RETURN NEW;
        ELSE
            -- If any other field is being changed, raise an error
            RAISE EXCEPTION 'Cannot modify fields other than notes or recording_url for a completed meeting.';
        END IF;
    END IF;

    -- Allow updates if status was not 'completed'
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to enforce the lock
DROP TRIGGER IF EXISTS prevent_completed_meeting_updates_trigger ON public.meetings;
CREATE TRIGGER prevent_completed_meeting_updates_trigger
BEFORE UPDATE ON public.meetings
FOR EACH ROW
EXECUTE FUNCTION public.prevent_completed_meeting_updates();

COMMENT ON TRIGGER prevent_completed_meeting_updates_trigger ON public.meetings IS 'Prevents updates to completed meetings, except for the notes and recording_url fields.';
