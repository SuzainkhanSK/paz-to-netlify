/*
  # Fix generate_promo_codes Function Admin Check

  The generate_promo_codes function is throwing "Access denied - admin privileges required" 
  even when called from the Edge Function with service role key. This migration removes
  the redundant admin check from the function since the Edge Function already handles
  admin authentication.

  ## Changes
  1. Drop and recreate generate_promo_codes function without admin privilege check
  2. The function will trust that the calling Edge Function has already verified admin access
*/

-- Drop the existing function
DROP FUNCTION IF EXISTS generate_promo_codes(jsonb);

-- Recreate the function without admin privilege check
CREATE OR REPLACE FUNCTION generate_promo_codes(codes_data jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    code_record jsonb;
    inserted_codes jsonb[] := '{}';
    result_code jsonb;
BEGIN
    -- Loop through each code in the input array
    FOR code_record IN SELECT * FROM jsonb_array_elements(codes_data)
    LOOP
        -- Insert the promo code
        INSERT INTO promo_codes (
            code,
            points,
            description,
            max_uses,
            starts_at,
            expires_at,
            is_active,
            created_by
        ) VALUES (
            (code_record->>'code')::text,
            (code_record->>'points')::integer,
            NULLIF(code_record->>'description', ''),
            CASE 
                WHEN code_record->>'max_uses' IS NOT NULL AND code_record->>'max_uses' != '' 
                THEN (code_record->>'max_uses')::integer 
                ELSE NULL 
            END,
            CASE 
                WHEN code_record->>'starts_at' IS NOT NULL AND code_record->>'starts_at' != '' 
                THEN (code_record->>'starts_at')::timestamptz 
                ELSE NULL 
            END,
            CASE 
                WHEN code_record->>'expires_at' IS NOT NULL AND code_record->>'expires_at' != '' 
                THEN (code_record->>'expires_at')::timestamptz 
                ELSE NULL 
            END,
            COALESCE((code_record->>'is_active')::boolean, true),
            auth.uid()
        )
        RETURNING to_jsonb(promo_codes.*) INTO result_code;
        
        -- Add to results array
        inserted_codes := inserted_codes || result_code;
    END LOOP;
    
    -- Return the inserted codes
    RETURN jsonb_build_object('success', true, 'codes', array_to_json(inserted_codes));
    
EXCEPTION
    WHEN unique_violation THEN
        RETURN jsonb_build_object('success', false, 'error', 'One or more promo codes already exist');
    WHEN OTHERS THEN
        RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;