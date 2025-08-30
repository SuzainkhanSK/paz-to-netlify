/*
  # Create admin_adjust_user_points function

  1. New Functions
    - `admin_adjust_user_points` - Allows admins to safely adjust user points
      - Parameters: user_id_param (uuid), points_change (integer), description_param (text)
      - Returns: success status, message, old_points, new_points
      - Handles both positive (earn) and negative (redeem) point changes
      - Prevents negative point balances
      - Creates audit trail in transactions table

  2. Security
    - Function is accessible to authenticated users (admin verification handled in Edge Function)
    - Includes proper error handling and validation
    - Creates transaction records for audit purposes
*/

CREATE OR REPLACE FUNCTION public.admin_adjust_user_points(
    user_id_param uuid,
    points_change integer,
    description_param text
)
RETURNS TABLE(success boolean, message text, old_points integer, new_points integer, points_change_val integer)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    current_points integer;
    current_total_earned integer;
    new_points_val integer;
    new_total_earned_val integer;
    transaction_type text;
BEGIN
    -- Get current points and total_earned from the profiles table
    SELECT points, total_earned INTO current_points, current_total_earned
    FROM public.profiles
    WHERE id = user_id_param;

    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, 'User not found'::text, NULL::integer, NULL::integer, NULL::integer;
        RETURN;
    END IF;

    -- Determine if it's an 'earn' or 'redeem' transaction
    IF points_change > 0 THEN
        transaction_type := 'earn';
    ELSE
        transaction_type := 'redeem';
    END IF;

    -- Calculate new points value
    new_points_val := current_points + points_change;
    
    -- Prevent negative points for 'redeem' operations
    IF new_points_val < 0 AND transaction_type = 'redeem' THEN
        RETURN QUERY SELECT FALSE, 'Cannot deduct points, user would have negative balance'::text, current_points, current_points, 0;
        RETURN;
    END IF;

    -- Update total_earned only for positive point changes (earnings)
    IF points_change > 0 THEN
        new_total_earned_val := current_total_earned + points_change;
    ELSE
        new_total_earned_val := current_total_earned;
    END IF;

    -- Update the user's profile with new points and total_earned
    UPDATE public.profiles
    SET
        points = new_points_val,
        total_earned = new_total_earned_val,
        updated_at = now()
    WHERE id = user_id_param;

    -- Insert a record into the transactions table for auditing
    INSERT INTO public.transactions (user_id, type, points, description, task_type, created_at)
    VALUES (user_id_param, transaction_type, ABS(points_change), description_param, 'admin_adjustment', now());

    -- Insert into points_audit_log for detailed auditing
    BEGIN
        INSERT INTO public.points_audit_log (user_id, old_points, new_points, changed_at, reason, changed_by)
        VALUES (user_id_param, current_points, new_points_val, now(), description_param, 'admin');
    EXCEPTION WHEN OTHERS THEN
        -- If points_audit_log insert fails, log but don't fail the entire operation
        RAISE NOTICE 'points_audit_log insert failed: %', SQLERRM;
    END;

    -- Return success status and updated point values
    RETURN QUERY SELECT TRUE, 'Points updated successfully'::text, current_points, new_points_val, points_change;
END;
$$;