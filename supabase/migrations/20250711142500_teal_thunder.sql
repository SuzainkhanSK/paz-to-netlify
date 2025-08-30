/*
  # Add points_cost to subscription_availability table

  1. New Columns
    - `points_cost` (integer) - The number of points required to redeem this subscription
    
  2. Changes
    - Add points_cost column to subscription_availability table
    - Add default points values for common subscription durations
*/

-- Add points_cost column to subscription_availability table
ALTER TABLE subscription_availability ADD COLUMN IF NOT EXISTS points_cost INTEGER;

-- Update existing records with default points values based on duration
DO $$
BEGIN
  -- YouTube Premium
  UPDATE subscription_availability 
  SET points_cost = 1000
  WHERE subscription_id = 'youtube_premium' AND duration = '1 Month' AND points_cost IS NULL;
  
  UPDATE subscription_availability 
  SET points_cost = 1900
  WHERE subscription_id = 'youtube_premium' AND duration = '2 Months' AND points_cost IS NULL;
  
  UPDATE subscription_availability 
  SET points_cost = 2700
  WHERE subscription_id = 'youtube_premium' AND duration = '3 Months' AND points_cost IS NULL;
  
  UPDATE subscription_availability 
  SET points_cost = 5200
  WHERE subscription_id = 'youtube_premium' AND duration = '6 Months' AND points_cost IS NULL;
  
  UPDATE subscription_availability 
  SET points_cost = 9500
  WHERE subscription_id = 'youtube_premium' AND duration = '1 Year' AND points_cost IS NULL;
  
  -- Netflix
  UPDATE subscription_availability 
  SET points_cost = 1400
  WHERE subscription_id = 'netflix' AND duration = '1 Month' AND points_cost IS NULL;
  
  UPDATE subscription_availability 
  SET points_cost = 2650
  WHERE subscription_id = 'netflix' AND duration = '2 Months' AND points_cost IS NULL;
  
  UPDATE subscription_availability 
  SET points_cost = 3800
  WHERE subscription_id = 'netflix' AND duration = '3 Months' AND points_cost IS NULL;
  
  UPDATE subscription_availability 
  SET points_cost = 7300
  WHERE subscription_id = 'netflix' AND duration = '6 Months' AND points_cost IS NULL;
  
  UPDATE subscription_availability 
  SET points_cost = 13500
  WHERE subscription_id = 'netflix' AND duration = '1 Year' AND points_cost IS NULL;
  
  -- Amazon Prime
  UPDATE subscription_availability 
  SET points_cost = 1200
  WHERE subscription_id = 'amazon_prime' AND duration = '1 Month' AND points_cost IS NULL;
  
  UPDATE subscription_availability 
  SET points_cost = 3200
  WHERE subscription_id = 'amazon_prime' AND duration = '3 Months' AND points_cost IS NULL;
  
  UPDATE subscription_availability 
  SET points_cost = 6000
  WHERE subscription_id = 'amazon_prime' AND duration = '6 Months' AND points_cost IS NULL;
  
  UPDATE subscription_availability 
  SET points_cost = 11000
  WHERE subscription_id = 'amazon_prime' AND duration = '1 Year' AND points_cost IS NULL;
  
  -- Spotify Premium
  UPDATE subscription_availability 
  SET points_cost = 900
  WHERE subscription_id = 'spotify_premium' AND duration = '1 Month' AND points_cost IS NULL;
  
  UPDATE subscription_availability 
  SET points_cost = 1700
  WHERE subscription_id = 'spotify_premium' AND duration = '2 Months' AND points_cost IS NULL;
  
  UPDATE subscription_availability 
  SET points_cost = 2400
  WHERE subscription_id = 'spotify_premium' AND duration = '3 Months' AND points_cost IS NULL;
  
  UPDATE subscription_availability 
  SET points_cost = 4500
  WHERE subscription_id = 'spotify_premium' AND duration = '6 Months' AND points_cost IS NULL;
  
  UPDATE subscription_availability 
  SET points_cost = 8200
  WHERE subscription_id = 'spotify_premium' AND duration = '1 Year' AND points_cost IS NULL;
  
  -- Set a default value for any remaining subscriptions without points
  UPDATE subscription_availability 
  SET points_cost = 1000
  WHERE points_cost IS NULL;
END $$;