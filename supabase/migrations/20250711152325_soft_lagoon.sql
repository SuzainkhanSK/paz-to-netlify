/*
  # Add metadata fields to subscription_availability table
  
  1. New Columns
    - `display_name` (text): Human-readable name for the subscription
    - `description` (text): Description of the subscription service
    - `category` (text): Category of the subscription (streaming, music, social, other)
    
  2. Changes
    - Add default values for existing records
    - Add constraints to ensure valid categories
*/

-- Add new columns with defaults
ALTER TABLE subscription_availability ADD COLUMN IF NOT EXISTS display_name text;
ALTER TABLE subscription_availability ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE subscription_availability ADD COLUMN IF NOT EXISTS category text DEFAULT 'other';

-- Update existing records with display names based on subscription_id
UPDATE subscription_availability
SET display_name = INITCAP(REPLACE(subscription_id, '_', ' '))
WHERE display_name IS NULL;

-- Update existing records with default descriptions
UPDATE subscription_availability
SET description = 'Premium subscription service'
WHERE description IS NULL;

-- Update categories based on subscription_id
UPDATE subscription_availability
SET category = 'streaming'
WHERE subscription_id LIKE '%netflix%' 
   OR subscription_id LIKE '%youtube%' 
   OR subscription_id LIKE '%disney%' 
   OR subscription_id LIKE '%prime%'
   OR subscription_id LIKE '%hulu%'
   OR subscription_id LIKE '%sony%'
   OR subscription_id LIKE '%hotstar%';

UPDATE subscription_availability
SET category = 'music'
WHERE subscription_id LIKE '%spotify%' 
   OR subscription_id LIKE '%apple_music%' 
   OR subscription_id LIKE '%jiosaavn%'
   OR subscription_id LIKE '%gaana%'
   OR subscription_id LIKE '%wynk%';

UPDATE subscription_availability
SET category = 'social'
WHERE subscription_id LIKE '%telegram%' 
   OR subscription_id LIKE '%discord%'
   OR subscription_id LIKE '%twitter%';

-- Add NOT NULL constraints
ALTER TABLE subscription_availability ALTER COLUMN display_name SET NOT NULL;
ALTER TABLE subscription_availability ALTER COLUMN description SET NOT NULL;
ALTER TABLE subscription_availability ALTER COLUMN category SET NOT NULL;

-- Add check constraint for valid categories
ALTER TABLE subscription_availability ADD CONSTRAINT subscription_availability_category_check
  CHECK (category IN ('streaming', 'music', 'social', 'other'));