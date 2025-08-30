/*
  # Update subscription availability table

  1. Changes
     - Add points_cost column to subscription_availability table if it doesn't exist
     - Add constraint to ensure points_cost is positive
     - Set default points values for existing subscriptions

  2. Security
     - No changes to RLS policies
*/

-- Add points_cost column if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'subscription_availability' AND column_name = 'points_cost'
  ) THEN
    ALTER TABLE subscription_availability ADD COLUMN points_cost INTEGER;
  END IF;
END $$;

-- Add constraint to ensure points_cost is positive
ALTER TABLE subscription_availability 
  DROP CONSTRAINT IF EXISTS subscription_availability_points_cost_check;

ALTER TABLE subscription_availability 
  ADD CONSTRAINT subscription_availability_points_cost_check 
  CHECK (points_cost > 0);

-- Set default points values for existing subscriptions based on duration
UPDATE subscription_availability
SET points_cost = 
  CASE 
    WHEN subscription_id = 'netflix' AND duration = '1 Month' THEN 1400
    WHEN subscription_id = 'netflix' AND duration = '3 Months' THEN 3800
    WHEN subscription_id = 'netflix' AND duration = '6 Months' THEN 7300
    WHEN subscription_id = 'netflix' AND duration = '1 Year' THEN 13500
    
    WHEN subscription_id = 'youtube_premium' AND duration = '1 Month' THEN 1000
    WHEN subscription_id = 'youtube_premium' AND duration = '3 Months' THEN 2700
    WHEN subscription_id = 'youtube_premium' AND duration = '6 Months' THEN 5200
    WHEN subscription_id = 'youtube_premium' AND duration = '1 Year' THEN 9500
    
    WHEN subscription_id = 'amazon_prime' AND duration = '1 Month' THEN 1200
    WHEN subscription_id = 'amazon_prime' AND duration = '3 Months' THEN 3200
    WHEN subscription_id = 'amazon_prime' AND duration = '6 Months' THEN 6000
    WHEN subscription_id = 'amazon_prime' AND duration = '1 Year' THEN 11000
    
    WHEN subscription_id = 'spotify_premium' AND duration = '1 Month' THEN 900
    WHEN subscription_id = 'spotify_premium' AND duration = '3 Months' THEN 2400
    WHEN subscription_id = 'spotify_premium' AND duration = '6 Months' THEN 4500
    WHEN subscription_id = 'spotify_premium' AND duration = '1 Year' THEN 8200
    
    WHEN subscription_id = 'disney_hotstar' AND duration = '1 Month' THEN 800
    WHEN subscription_id = 'disney_hotstar' AND duration = '3 Months' THEN 2100
    WHEN subscription_id = 'disney_hotstar' AND duration = '6 Months' THEN 3800
    WHEN subscription_id = 'disney_hotstar' AND duration = '1 Year' THEN 6500
    
    WHEN subscription_id = 'apple_music' AND duration = '1 Month' THEN 1100
    WHEN subscription_id = 'apple_music' AND duration = '3 Months' THEN 2900
    WHEN subscription_id = 'apple_music' AND duration = '6 Months' THEN 5500
    WHEN subscription_id = 'apple_music' AND duration = '1 Year' THEN 10000
    
    WHEN subscription_id = 'jiosaavn_pro' AND duration = '1 Month' THEN 700
    WHEN subscription_id = 'jiosaavn_pro' AND duration = '3 Months' THEN 1800
    WHEN subscription_id = 'jiosaavn_pro' AND duration = '6 Months' THEN 3200
    WHEN subscription_id = 'jiosaavn_pro' AND duration = '1 Year' THEN 5500
    
    WHEN subscription_id = 'sony_liv' AND duration = '1 Month' THEN 600
    WHEN subscription_id = 'sony_liv' AND duration = '3 Months' THEN 1500
    WHEN subscription_id = 'sony_liv' AND duration = '6 Months' THEN 2700
    WHEN subscription_id = 'sony_liv' AND duration = '1 Year' THEN 4500
    
    WHEN subscription_id = 'telegram_premium' AND duration = '1 Month' THEN 500
    WHEN subscription_id = 'telegram_premium' AND duration = '3 Months' THEN 1300
    WHEN subscription_id = 'telegram_premium' AND duration = '6 Months' THEN 2400
    WHEN subscription_id = 'telegram_premium' AND duration = '1 Year' THEN 4000
    
    -- Default values based on duration
    WHEN duration LIKE '%Month%' THEN 1000
    WHEN duration LIKE '%Year%' THEN 10000
    ELSE 1000
  END
WHERE points_cost IS NULL;