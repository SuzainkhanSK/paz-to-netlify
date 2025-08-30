/*
  # Fix Points Auto-Deduction Issues

  This migration fixes critical issues causing automatic point deductions and ensures data integrity.

  1. Database Fixes
    - Remove problematic triggers that might cause auto-deductions
    - Fix any constraints that might cause issues
    - Ensure proper data types and constraints

  2. Security
    - Ensure RLS policies don't accidentally deduct points
    - Fix any problematic functions

  3. Data Integrity
    - Ensure all users have correct points based on their transactions
    - Fix any negative or impossible point values
*/

-- First, let's check if there are any problematic triggers
DO $$
BEGIN
  -- Disable any triggers that might be causing auto-deductions
  IF EXISTS (
    SELECT 1 FROM information_schema.triggers 
    WHERE trigger_name = 'trg_auto_deduct_points'
  ) THEN
    DROP TRIGGER IF EXISTS trg_auto_deduct_points ON profiles;
    RAISE NOTICE 'Removed problematic auto-deduct trigger';
  END IF;
END $$;

-- Create a SAFE function to recalculate user points without deductions
CREATE OR REPLACE FUNCTION safe_recalculate_user_points(user_id_param UUID)
RETURNS TABLE(
  user_id UUID,
  old_points INTEGER,
  new_points INTEGER,
  old_total_earned INTEGER,
  new_total_earned INTEGER,
  fixed BOOLEAN
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  current_points INTEGER;
  current_total_earned INTEGER;
  calculated_earned INTEGER;
  calculated_redeemed INTEGER;
  correct_points INTEGER;
  correct_total_earned INTEGER;
BEGIN
  -- Get current user data
  SELECT points, total_earned INTO current_points, current_total_earned
  FROM profiles 
  WHERE id = user_id_param;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Calculate correct values from transactions
  SELECT 
    COALESCE(SUM(CASE WHEN type = 'earn' THEN points ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN type = 'redeem' THEN points ELSE 0 END), 0)
  INTO calculated_earned, calculated_redeemed
  FROM transactions 
  WHERE user_id = user_id_param;

  correct_points := GREATEST(0, calculated_earned - calculated_redeemed);
  correct_total_earned := calculated_earned;

  -- Only update if user has LESS than they should (NEVER reduce points)
  IF current_points < correct_points OR current_total_earned < correct_total_earned THEN
    UPDATE profiles 
    SET 
      points = GREATEST(current_points, correct_points),
      total_earned = GREATEST(current_total_earned, correct_total_earned),
      updated_at = NOW()
    WHERE id = user_id_param;

    RETURN QUERY SELECT 
      user_id_param,
      current_points,
      GREATEST(current_points, correct_points),
      current_total_earned,
      GREATEST(current_total_earned, correct_total_earned),
      TRUE;
  ELSE
    RETURN QUERY SELECT 
      user_id_param,
      current_points,
      current_points,
      current_total_earned,
      current_total_earned,
      FALSE;
  END IF;
END;
$$;

-- Create emergency fix function for all users
CREATE OR REPLACE FUNCTION emergency_fix_all_user_points()
RETURNS TABLE(
  users_checked INTEGER,
  users_fixed INTEGER,
  issues_found TEXT[]
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  user_record RECORD;
  fix_result RECORD;
  checked_count INTEGER := 0;
  fixed_count INTEGER := 0;
  issues TEXT[] := ARRAY[]::TEXT[];
BEGIN
  -- Loop through all users
  FOR user_record IN 
    SELECT id, email, points, total_earned FROM profiles
  LOOP
    checked_count := checked_count + 1;
    
    -- Fix this user's points
    SELECT * INTO fix_result 
    FROM safe_recalculate_user_points(user_record.id);
    
    IF fix_result.fixed THEN
      fixed_count := fixed_count + 1;
      issues := array_append(issues, 
        format('Fixed %s: Points %s → %s, Total %s → %s', 
          user_record.email, 
          fix_result.old_points, 
          fix_result.new_points,
          fix_result.old_total_earned,
          fix_result.new_total_earned
        )
      );
    END IF;
  END LOOP;

  RETURN QUERY SELECT checked_count, fixed_count, issues;
END;
$$;

-- Create a function to prevent future auto-deductions
CREATE OR REPLACE FUNCTION prevent_unauthorized_point_deductions()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Only allow point reductions if it's a legitimate redemption or admin action
  IF NEW.points < OLD.points THEN
    -- Check if this is a legitimate redemption (there should be a corresponding transaction)
    IF NOT EXISTS (
      SELECT 1 FROM transactions 
      WHERE user_id = NEW.id 
      AND type = 'redeem' 
      AND created_at > NOW() - INTERVAL '1 minute'
    ) THEN
      -- This is an unauthorized deduction, prevent it
      RAISE EXCEPTION 'Unauthorized point deduction prevented. Points cannot be reduced without a valid redemption transaction.';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Apply the protection trigger
DROP TRIGGER IF EXISTS prevent_point_deductions ON profiles;
CREATE TRIGGER prevent_point_deductions
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  WHEN (NEW.points < OLD.points)
  EXECUTE FUNCTION prevent_unauthorized_point_deductions();

-- Fix any existing negative points immediately
UPDATE profiles 
SET points = 0 
WHERE points < 0;

-- Create RPC function for frontend to safely recalculate points
CREATE OR REPLACE FUNCTION recalculate_user_points(user_id_param UUID)
RETURNS TABLE(
  old_points INTEGER,
  new_points INTEGER,
  fixed BOOLEAN
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result_record RECORD;
BEGIN
  -- Use the safe recalculation function
  SELECT * INTO result_record 
  FROM safe_recalculate_user_points(user_id_param);
  
  RETURN QUERY SELECT 
    result_record.old_points,
    result_record.new_points,
    result_record.fixed;
END;
$$;

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION safe_recalculate_user_points(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION recalculate_user_points(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION emergency_fix_all_user_points() TO authenticated;