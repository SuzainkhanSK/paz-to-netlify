/*
  # Fix Promo Code System Issues

  1. Schema Updates
    - Rename 'points_value' to 'points' in promo_codes table
    - Fix admin_users RLS policy to prevent infinite recursion
    - Update promo_code_redemptions foreign key constraint

  2. Security
    - Simplify RLS policies to prevent recursion
    - Add proper indexes for performance
*/

-- Fix admin_users RLS policy to prevent infinite recursion
DROP POLICY IF EXISTS "Super admins can manage all admin users" ON admin_users;
CREATE POLICY "Super admins can manage all admin users" ON admin_users
  USING (
    email IN (
      'suzainkhan8360@gmail.com',
      'Suzainkhan8360@gmail.com',
      'admin@premiumaccesszone.com',
      'support@premiumaccesszone.com',
      'moderator@premiumaccesszone.com'
    )
  )
  WITH CHECK (
    email IN (
      'suzainkhan8360@gmail.com',
      'Suzainkhan8360@gmail.com',
      'admin@premiumaccesszone.com',
      'support@premiumaccesszone.com',
      'moderator@premiumaccesszone.com'
    )
  );

-- Create helper function to check if user is admin
CREATE OR REPLACE FUNCTION is_admin_user(user_id uuid)
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM admin_users
    WHERE id = user_id
    AND is_active = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Fix promo_codes table schema
ALTER TABLE IF EXISTS promo_codes 
  RENAME COLUMN points_value TO points;

-- Create promo_codes table if it doesn't exist
CREATE TABLE IF NOT EXISTS promo_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  points integer NOT NULL CHECK (points > 0),
  description text,
  max_uses integer,
  current_uses integer DEFAULT 0,
  is_active boolean DEFAULT true,
  starts_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

-- Create promo_code_redemptions table if it doesn't exist
CREATE TABLE IF NOT EXISTS promo_code_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  promo_code_id uuid NOT NULL REFERENCES promo_codes(id) ON DELETE CASCADE,
  points_earned integer NOT NULL CHECK (points_earned > 0),
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, promo_code_id)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_promo_codes_code ON promo_codes(code);
CREATE INDEX IF NOT EXISTS idx_promo_codes_is_active ON promo_codes(is_active);
CREATE INDEX IF NOT EXISTS idx_promo_code_redemptions_user_id ON promo_code_redemptions(user_id);
CREATE INDEX IF NOT EXISTS idx_promo_code_redemptions_promo_code_id ON promo_code_redemptions(promo_code_id);

-- Drop and recreate RLS policies for promo_codes
DROP POLICY IF EXISTS "Admins can manage promo codes" ON promo_codes;
DROP POLICY IF EXISTS "Anyone can read active promo codes" ON promo_codes;

-- Simplified RLS policies to prevent recursion
CREATE POLICY "Admins can manage promo codes" ON promo_codes
  USING (is_admin_user(auth.uid()))
  WITH CHECK (is_admin_user(auth.uid()));

CREATE POLICY "Anyone can read active promo codes" ON promo_codes
  FOR SELECT
  USING (is_active = true);

-- Drop and recreate RLS policies for promo_code_redemptions
DROP POLICY IF EXISTS "Admins can view all redemptions" ON promo_code_redemptions;
DROP POLICY IF EXISTS "Users can redeem promo codes" ON promo_code_redemptions;
DROP POLICY IF EXISTS "Users can view their own redemptions" ON promo_code_redemptions;

-- Simplified RLS policies to prevent recursion
CREATE POLICY "Admins can view all redemptions" ON promo_code_redemptions
  FOR SELECT
  USING (is_admin_user(auth.uid()));

CREATE POLICY "Users can redeem promo codes" ON promo_code_redemptions
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can view their own redemptions" ON promo_code_redemptions
  FOR SELECT
  USING (user_id = auth.uid());

-- Create or replace the redeem_promo_code function
CREATE OR REPLACE FUNCTION redeem_promo_code(
  code_param TEXT,
  user_id_param UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  promo_code_record RECORD;
  result JSONB;
BEGIN
  -- Find the promo code
  SELECT * INTO promo_code_record
  FROM promo_codes
  WHERE code = code_param
  FOR UPDATE;
  
  -- Check if promo code exists
  IF promo_code_record IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Invalid promo code'
    );
  END IF;
  
  -- Check if promo code is active
  IF NOT promo_code_record.is_active THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'This promo code is no longer active'
    );
  END IF;
  
  -- Check if promo code has expired
  IF promo_code_record.expires_at IS NOT NULL AND promo_code_record.expires_at < NOW() THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'This promo code has expired'
    );
  END IF;
  
  -- Check if promo code has not started yet
  IF promo_code_record.starts_at IS NOT NULL AND promo_code_record.starts_at > NOW() THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'This promo code is not yet active'
    );
  END IF;
  
  -- Check if promo code has reached max uses
  IF promo_code_record.max_uses IS NOT NULL AND promo_code_record.current_uses >= promo_code_record.max_uses THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'This promo code has reached its maximum number of uses'
    );
  END IF;
  
  -- Check if user has already redeemed this code
  IF EXISTS (
    SELECT 1 FROM promo_code_redemptions
    WHERE user_id = user_id_param AND promo_code_id = promo_code_record.id
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'You have already redeemed this promo code'
    );
  END IF;
  
  -- All checks passed, redeem the code
  BEGIN
    -- Insert redemption record
    INSERT INTO promo_code_redemptions (
      user_id,
      promo_code_id,
      points_earned
    ) VALUES (
      user_id_param,
      promo_code_record.id,
      promo_code_record.points
    );
    
    -- Update promo code usage count
    UPDATE promo_codes
    SET current_uses = current_uses + 1
    WHERE id = promo_code_record.id;
    
    -- Add transaction record
    INSERT INTO transactions (
      user_id,
      type,
      points,
      description,
      task_type
    ) VALUES (
      user_id_param,
      'earn',
      promo_code_record.points,
      'Promo code redemption: ' || promo_code_record.code,
      'promo_code'
    );
    
    -- Update user points
    UPDATE profiles
    SET 
      points = points + promo_code_record.points,
      total_earned = total_earned + promo_code_record.points
    WHERE id = user_id_param;
    
    -- Return success
    RETURN jsonb_build_object(
      'success', true,
      'message', 'Promo code redeemed successfully',
      'points', promo_code_record.points
    );
  EXCEPTION
    WHEN unique_violation THEN
      RETURN jsonb_build_object(
        'success', false,
        'message', 'You have already redeemed this promo code'
      );
    WHEN OTHERS THEN
      RETURN jsonb_build_object(
        'success', false,
        'message', 'An error occurred while redeeming the promo code: ' || SQLERRM
      );
  END;
END;
$$;

-- Create or replace the generate_promo_codes function
CREATE OR REPLACE FUNCTION generate_promo_codes(
  count_param INTEGER,
  prefix_param TEXT DEFAULT '',
  length_param INTEGER DEFAULT 8,
  points_param INTEGER DEFAULT 100,
  description_param TEXT DEFAULT NULL,
  max_uses_param INTEGER DEFAULT NULL,
  starts_at_param TIMESTAMPTZ DEFAULT NULL,
  expires_at_param TIMESTAMPTZ DEFAULT NULL,
  created_by_param UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  i INTEGER;
  code TEXT;
  codes JSONB := '[]'::JSONB;
  chars TEXT := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  chars_length INTEGER := length(chars);
  random_part TEXT;
  j INTEGER;
BEGIN
  -- Validate parameters
  IF count_param <= 0 THEN
    RAISE EXCEPTION 'Count must be greater than 0';
  END IF;
  
  IF points_param <= 0 THEN
    RAISE EXCEPTION 'Points must be greater than 0';
  END IF;
  
  IF length_param < 4 THEN
    RAISE EXCEPTION 'Length must be at least 4 characters';
  END IF;
  
  -- Generate codes
  FOR i IN 1..count_param LOOP
    -- Generate random part of the code
    random_part := '';
    FOR j IN 1..length_param LOOP
      random_part := random_part || substr(chars, floor(random() * chars_length) + 1, 1);
    END LOOP;
    
    -- Combine prefix and random part
    code := prefix_param || random_part;
    
    -- Insert the code
    BEGIN
      INSERT INTO promo_codes (
        code,
        points,
        description,
        max_uses,
        current_uses,
        is_active,
        starts_at,
        expires_at,
        created_by
      ) VALUES (
        code,
        points_param,
        description_param,
        max_uses_param,
        0,
        TRUE,
        starts_at_param,
        expires_at_param,
        created_by_param
      )
      RETURNING code INTO code;
      
      -- Add to result array
      codes := codes || jsonb_build_object('code', code);
    EXCEPTION
      WHEN unique_violation THEN
        -- If code already exists, try again with a different random part
        i := i - 1;
      WHEN OTHERS THEN
        RAISE EXCEPTION 'Error generating promo code: %', SQLERRM;
    END;
  END LOOP;
  
  RETURN jsonb_build_object(
    'success', true,
    'count', count_param,
    'codes', codes
  );
END;
$$;