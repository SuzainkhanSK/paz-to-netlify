/*
  # Fix Points Calculation and Performance Issues

  1. Database Functions
    - Fix ambiguous column reference in recalculate_user_points
    - Create efficient user stats view for performance
    - Fix double points issue in promo code redemption

  2. Performance Improvements
    - Create materialized view for user statistics
    - Add proper indexes for faster queries

  3. Points System Fixes
    - Ensure all transactions are counted properly
    - Fix double points in admin adjustments and promo codes
*/

-- Drop existing function if it exists
DROP FUNCTION IF EXISTS recalculate_user_points(uuid);

-- Create improved recalculate_user_points function with proper column references
CREATE OR REPLACE FUNCTION recalculate_user_points(user_id_param uuid)
RETURNS TABLE(
  user_id uuid,
  old_points integer,
  new_points integer,
  fixed boolean
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  current_points integer;
  calculated_points integer;
  earned_points integer;
  redeemed_points integer;
BEGIN
  -- Get current points from profiles table
  SELECT p.points INTO current_points
  FROM profiles p
  WHERE p.id = user_id_param;
  
  -- Calculate earned points from all earn transactions
  SELECT COALESCE(SUM(t.points), 0) INTO earned_points
  FROM transactions t
  WHERE t.user_id = user_id_param AND t.type = 'earn';
  
  -- Calculate redeemed points from all redeem transactions
  SELECT COALESCE(SUM(t.points), 0) INTO redeemed_points
  FROM transactions t
  WHERE t.user_id = user_id_param AND t.type = 'redeem';
  
  -- Calculate what points should be
  calculated_points := GREATEST(0, earned_points - redeemed_points);
  
  -- Only update if there's a discrepancy
  IF current_points != calculated_points THEN
    -- Update profiles table with correct points
    UPDATE profiles p
    SET 
      points = calculated_points,
      total_earned = earned_points,
      updated_at = now()
    WHERE p.id = user_id_param;
    
    -- Return the fix details
    RETURN QUERY SELECT 
      user_id_param,
      current_points,
      calculated_points,
      true;
  ELSE
    -- No fix needed
    RETURN QUERY SELECT 
      user_id_param,
      current_points,
      calculated_points,
      false;
  END IF;
END;
$$;

-- Create materialized view for user statistics (for performance)
DROP MATERIALIZED VIEW IF EXISTS user_stats_summary;

CREATE MATERIALIZED VIEW user_stats_summary AS
SELECT 
  p.id as user_id,
  p.email,
  p.full_name,
  p.phone,
  p.points,
  p.total_earned,
  p.created_at,
  p.updated_at,
  p.profile_image,
  p.referral_code,
  p.referred_by,
  COALESCE(t.transaction_count, 0) as transaction_count,
  COALESCE(s.spin_count, 0) as spin_count,
  COALESCE(sc.scratch_count, 0) as scratch_count,
  COALESCE(tk.task_count, 0) as task_count
FROM profiles p
LEFT JOIN (
  SELECT user_id, COUNT(*) as transaction_count
  FROM transactions
  GROUP BY user_id
) t ON p.id = t.user_id
LEFT JOIN (
  SELECT user_id, COUNT(*) as spin_count
  FROM spin_history
  GROUP BY user_id
) s ON p.id = s.user_id
LEFT JOIN (
  SELECT user_id, COUNT(*) as scratch_count
  FROM scratch_history
  GROUP BY user_id
) sc ON p.id = sc.user_id
LEFT JOIN (
  SELECT user_id, COUNT(*) as task_count
  FROM tasks
  WHERE completed = true
  GROUP BY user_id
) tk ON p.id = tk.user_id;

-- Create index on the materialized view
CREATE UNIQUE INDEX idx_user_stats_summary_user_id ON user_stats_summary(user_id);
CREATE INDEX idx_user_stats_summary_email ON user_stats_summary(email);
CREATE INDEX idx_user_stats_summary_points ON user_stats_summary(points DESC);

-- Function to refresh the materialized view
CREATE OR REPLACE FUNCTION refresh_user_stats()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY user_stats_summary;
END;
$$;

-- Fix the redeem_promo_code function to prevent double points
DROP FUNCTION IF EXISTS redeem_promo_code(text, uuid);

CREATE OR REPLACE FUNCTION redeem_promo_code(code_param text, user_id_param uuid)
RETURNS TABLE(
  success boolean,
  message text,
  points integer
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  promo_record RECORD;
  user_email text;
BEGIN
  -- Get user email for logging
  SELECT email INTO user_email FROM profiles WHERE id = user_id_param;
  
  -- Check if promo code exists and is valid
  SELECT * INTO promo_record
  FROM promo_codes pc
  WHERE pc.code = code_param
    AND pc.is_active = true
    AND (pc.starts_at IS NULL OR pc.starts_at <= now())
    AND (pc.expires_at IS NULL OR pc.expires_at >= now())
    AND (pc.max_uses IS NULL OR pc.current_uses < pc.max_uses);
  
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'Invalid or expired promo code', 0;
    RETURN;
  END IF;
  
  -- Check if user has already redeemed this code
  IF EXISTS (
    SELECT 1 FROM promo_code_redemptions pcr
    WHERE pcr.promo_code_id = promo_record.id AND pcr.user_id = user_id_param
  ) THEN
    RETURN QUERY SELECT false, 'You have already redeemed this code', 0;
    RETURN;
  END IF;
  
  -- Insert redemption record (this will trigger points update via transaction)
  INSERT INTO promo_code_redemptions (user_id, promo_code_id, points_earned)
  VALUES (user_id_param, promo_record.id, promo_record.points);
  
  -- Insert transaction record ONLY (don't update profiles directly)
  INSERT INTO transactions (user_id, type, points, description, task_type)
  VALUES (
    user_id_param,
    'earn',
    promo_record.points,
    'Promo code: ' || promo_record.code || COALESCE(' - ' || promo_record.description, ''),
    'promo_code'
  );
  
  -- Update promo code usage count
  UPDATE promo_codes 
  SET current_uses = COALESCE(current_uses, 0) + 1
  WHERE id = promo_record.id;
  
  -- Return success
  RETURN QUERY SELECT true, 'Promo code redeemed successfully', promo_record.points;
END;
$$;

-- Create function to get user redemptions with proper joins
DROP FUNCTION IF EXISTS get_user_redemptions(uuid);

CREATE OR REPLACE FUNCTION get_user_redemptions(user_id_param uuid)
RETURNS TABLE(
  id uuid,
  user_id uuid,
  promo_code_id uuid,
  points_earned integer,
  created_at timestamptz,
  code text,
  description text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    pcr.id,
    pcr.user_id,
    pcr.promo_code_id,
    pcr.points_earned,
    pcr.created_at,
    pc.code,
    pc.description
  FROM promo_code_redemptions pcr
  JOIN promo_codes pc ON pcr.promo_code_id = pc.id
  WHERE pcr.user_id = user_id_param
  ORDER BY pcr.created_at DESC;
END;
$$;

-- Create trigger to automatically update user points when transactions are inserted
-- This ensures consistent point calculation across all point-earning activities

CREATE OR REPLACE FUNCTION update_user_points_from_transaction()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Update user points based on transaction type
  IF NEW.type = 'earn' THEN
    UPDATE profiles 
    SET 
      points = points + NEW.points,
      total_earned = total_earned + NEW.points,
      updated_at = now()
    WHERE id = NEW.user_id;
  ELSIF NEW.type = 'redeem' THEN
    UPDATE profiles 
    SET 
      points = GREATEST(0, points - NEW.points),
      updated_at = now()
    WHERE id = NEW.user_id;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS trg_update_user_points_from_transaction ON transactions;

-- Create the trigger
CREATE TRIGGER trg_update_user_points_from_transaction
  AFTER INSERT ON transactions
  FOR EACH ROW
  EXECUTE FUNCTION update_user_points_from_transaction();

-- Grant necessary permissions
GRANT SELECT ON user_stats_summary TO authenticated;
GRANT EXECUTE ON FUNCTION recalculate_user_points(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION redeem_promo_code(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_redemptions(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION refresh_user_stats() TO authenticated;