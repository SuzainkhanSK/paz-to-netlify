/*
  # Create Promo Code System

  1. New Tables
    - `promo_codes` - Stores promo code information
    - `promo_code_redemptions` - Tracks promo code redemptions by users
  
  2. Security
    - Enable RLS on all tables
    - Add policies for proper access control
    
  3. Functions
    - `redeem_promo_code` - Validates and processes promo code redemptions
    - `generate_promo_codes` - Creates multiple promo codes at once
*/

-- Create promo_codes table
CREATE TABLE IF NOT EXISTS promo_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  points_value integer NOT NULL CHECK (points_value > 0),
  description text,
  max_uses integer,
  current_uses integer DEFAULT 0,
  is_active boolean DEFAULT true,
  starts_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

-- Create promo_code_redemptions table
CREATE TABLE IF NOT EXISTS promo_code_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  promo_code_id uuid NOT NULL REFERENCES promo_codes(id) ON DELETE CASCADE,
  points_earned integer NOT NULL CHECK (points_earned > 0),
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, promo_code_id)
);

-- Enable RLS
ALTER TABLE promo_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE promo_code_redemptions ENABLE ROW LEVEL SECURITY;

-- Create policies for promo_codes
CREATE POLICY "Admins can manage promo codes" 
  ON promo_codes 
  FOR ALL 
  TO authenticated 
  USING (
    EXISTS (
      SELECT 1 FROM admin_users 
      WHERE admin_users.id = auth.uid() 
      AND admin_users.is_active = true
    )
  );

CREATE POLICY "Anyone can read active promo codes" 
  ON promo_codes 
  FOR SELECT 
  TO anon, authenticated 
  USING (is_active = true);

-- Create policies for promo_code_redemptions
CREATE POLICY "Users can view their own redemptions" 
  ON promo_code_redemptions 
  FOR SELECT 
  TO authenticated 
  USING (user_id = auth.uid());

CREATE POLICY "Users can redeem promo codes" 
  ON promo_code_redemptions 
  FOR INSERT 
  TO authenticated 
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins can view all redemptions" 
  ON promo_code_redemptions 
  FOR SELECT 
  TO authenticated 
  USING (
    EXISTS (
      SELECT 1 FROM admin_users 
      WHERE admin_users.id = auth.uid() 
      AND admin_users.is_active = true
    )
  );

-- Create indexes for better performance
CREATE INDEX idx_promo_codes_code ON promo_codes(code);
CREATE INDEX idx_promo_codes_is_active ON promo_codes(is_active);
CREATE INDEX idx_promo_code_redemptions_user_id ON promo_code_redemptions(user_id);
CREATE INDEX idx_promo_code_redemptions_promo_code_id ON promo_code_redemptions(promo_code_id);
CREATE INDEX idx_promo_code_redemptions_created_at ON promo_code_redemptions(created_at DESC);

-- Create function to redeem promo code
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
  points_to_award INTEGER;
BEGIN
  -- Find the promo code
  SELECT * INTO promo_code_record
  FROM promo_codes
  WHERE code = UPPER(code_param);
  
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
  
  -- Check if promo code has started
  IF promo_code_record.starts_at IS NOT NULL AND promo_code_record.starts_at > NOW() THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'This promo code is not yet active'
    );
  END IF;
  
  -- Check if promo code has expired
  IF promo_code_record.expires_at IS NOT NULL AND promo_code_record.expires_at < NOW() THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'This promo code has expired'
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
  points_to_award := promo_code_record.points_value;
  
  -- Insert redemption record
  INSERT INTO promo_code_redemptions (
    user_id,
    promo_code_id,
    points_earned
  ) VALUES (
    user_id_param,
    promo_code_record.id,
    points_to_award
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
    points_to_award,
    'Promo code redemption: ' || promo_code_record.code,
    'promo_code'
  );
  
  -- Update user points
  UPDATE profiles
  SET 
    points = points + points_to_award,
    total_earned = total_earned + points_to_award
  WHERE id = user_id_param;
  
  -- Return success
  RETURN jsonb_build_object(
    'success', true,
    'message', 'Promo code redeemed successfully',
    'points', points_to_award
  );
  
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'message', 'An error occurred: ' || SQLERRM
  );
END;
$$;

-- Create function to generate multiple promo codes
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
  code_value TEXT;
  chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- Removed similar looking characters
  code_length INTEGER;
  generated_codes JSONB := '[]';
BEGIN
  -- Validate parameters
  IF count_param <= 0 THEN
    RAISE EXCEPTION 'Count must be greater than 0';
  END IF;
  
  IF length_param < 4 THEN
    RAISE EXCEPTION 'Code length must be at least 4 characters';
  END IF;
  
  IF points_param <= 0 THEN
    RAISE EXCEPTION 'Points value must be greater than 0';
  END IF;
  
  -- Calculate actual code length (minus prefix)
  code_length := length_param;
  
  -- Generate codes
  FOR i IN 1..count_param LOOP
    -- Generate a unique code
    LOOP
      code_value := prefix_param;
      
      -- Add random characters
      FOR j IN 1..code_length LOOP
        code_value := code_value || substr(chars, floor(random() * length(chars))::integer + 1, 1);
      END LOOP;
      
      -- Check if code already exists
      IF NOT EXISTS (SELECT 1 FROM promo_codes WHERE code = code_value) THEN
        EXIT; -- Exit loop if code is unique
      END IF;
    END LOOP;
    
    -- Insert the new code
    INSERT INTO promo_codes (
      code,
      points_value,
      description,
      max_uses,
      is_active,
      starts_at,
      expires_at,
      created_by
    ) VALUES (
      code_value,
      points_param,
      description_param,
      max_uses_param,
      TRUE,
      starts_at_param,
      expires_at_param,
      created_by_param
    )
    RETURNING code INTO code_value;
    
    -- Add to generated codes array
    generated_codes := generated_codes || jsonb_build_object('code', code_value);
  END LOOP;
  
  RETURN jsonb_build_object(
    'success', true,
    'count', count_param,
    'codes', generated_codes
  );
  
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'message', 'An error occurred: ' || SQLERRM
  );
END;
$$;