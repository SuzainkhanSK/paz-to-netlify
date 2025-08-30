-- Create promo codes table and function
-- This migration creates the missing generate_promo_codes function

-- Create promo_codes table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.promo_codes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code text UNIQUE NOT NULL,
    points integer NOT NULL CHECK (points > 0),
    description text,
    max_uses integer,
    current_uses integer DEFAULT 0 NOT NULL CHECK (current_uses >= 0),
    starts_at timestamptz,
    expires_at timestamptz,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid REFERENCES auth.users(id),
    is_active boolean DEFAULT true NOT NULL
);

-- Enable RLS
ALTER TABLE public.promo_codes ENABLE ROW LEVEL SECURITY;

-- Create policies for promo_codes
DROP POLICY IF EXISTS "Anyone can read active promo codes" ON public.promo_codes;
CREATE POLICY "Anyone can read active promo codes" 
ON public.promo_codes FOR SELECT 
USING (is_active = true);

DROP POLICY IF EXISTS "Admins can manage promo codes" ON public.promo_codes;
CREATE POLICY "Admins can manage promo codes" 
ON public.promo_codes FOR ALL 
USING (is_admin_user(auth.uid()));

-- Create promo_code_redemptions table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.promo_code_redemptions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    promo_code_id uuid NOT NULL REFERENCES public.promo_codes(id) ON DELETE CASCADE,
    points_earned integer NOT NULL CHECK (points_earned > 0),
    created_at timestamptz DEFAULT now() NOT NULL,
    UNIQUE(user_id, promo_code_id)
);

-- Enable RLS
ALTER TABLE public.promo_code_redemptions ENABLE ROW LEVEL SECURITY;

-- Create policies for promo_code_redemptions
DROP POLICY IF EXISTS "Users can read own redemptions" ON public.promo_code_redemptions;
CREATE POLICY "Users can read own redemptions" 
ON public.promo_code_redemptions FOR SELECT 
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can redeem promo codes" ON public.promo_code_redemptions;
CREATE POLICY "Users can redeem promo codes" 
ON public.promo_code_redemptions FOR INSERT 
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can view all redemptions" ON public.promo_code_redemptions;
CREATE POLICY "Admins can view all redemptions" 
ON public.promo_code_redemptions FOR SELECT 
USING (is_admin_user(auth.uid()));

-- Create the missing generate_promo_codes function
CREATE OR REPLACE FUNCTION public.generate_promo_codes(codes_data jsonb)
RETURNS SETOF public.promo_codes
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    code_obj jsonb;
    inserted_code public.promo_codes;
BEGIN
    -- Check if user is admin
    IF NOT is_admin_user(auth.uid()) THEN
        RAISE EXCEPTION 'Access denied - admin privileges required';
    END IF;

    FOR code_obj IN SELECT * FROM jsonb_array_elements(codes_data)
    LOOP
        INSERT INTO public.promo_codes (
            code,
            points,
            description,
            max_uses,
            starts_at,
            expires_at,
            is_active,
            created_by
        ) VALUES (
            code_obj->>'code',
            (code_obj->>'points')::int,
            NULLIF(code_obj->>'description', ''),
            CASE WHEN code_obj->>'max_uses' IS NOT NULL AND code_obj->>'max_uses' != '' 
                 THEN (code_obj->>'max_uses')::int 
                 ELSE NULL END,
            CASE WHEN code_obj->>'starts_at' IS NOT NULL AND code_obj->>'starts_at' != '' 
                 THEN (code_obj->>'starts_at')::timestamptz 
                 ELSE NULL END,
            CASE WHEN code_obj->>'expires_at' IS NOT NULL AND code_obj->>'expires_at' != '' 
                 THEN (code_obj->>'expires_at')::timestamptz 
                 ELSE NULL END,
            COALESCE((code_obj->>'is_active')::boolean, true),
            auth.uid()
        )
        RETURNING * INTO inserted_code;
        RETURN NEXT inserted_code;
    END LOOP;
    RETURN;
END;
$$;

-- Create redeem_promo_code function
CREATE OR REPLACE FUNCTION public.redeem_promo_code(promo_code_text text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    promo_record public.promo_codes;
    user_record public.profiles;
    redemption_record public.promo_code_redemptions;
    result jsonb;
BEGIN
    -- Get current user
    SELECT * INTO user_record FROM public.profiles WHERE id = auth.uid();
    IF user_record IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'User not found');
    END IF;

    -- Find the promo code
    SELECT * INTO promo_record 
    FROM public.promo_codes 
    WHERE code = UPPER(promo_code_text) AND is_active = true;

    IF promo_record IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid or inactive promo code');
    END IF;

    -- Check if code has expired
    IF promo_record.expires_at IS NOT NULL AND promo_record.expires_at < NOW() THEN
        RETURN jsonb_build_object('success', false, 'error', 'Promo code has expired');
    END IF;

    -- Check if code hasn't started yet
    IF promo_record.starts_at IS NOT NULL AND promo_record.starts_at > NOW() THEN
        RETURN jsonb_build_object('success', false, 'error', 'Promo code is not yet active');
    END IF;

    -- Check if user has already redeemed this code
    IF EXISTS (
        SELECT 1 FROM public.promo_code_redemptions 
        WHERE user_id = auth.uid() AND promo_code_id = promo_record.id
    ) THEN
        RETURN jsonb_build_object('success', false, 'error', 'You have already redeemed this promo code');
    END IF;

    -- Check usage limits
    IF promo_record.max_uses IS NOT NULL AND promo_record.current_uses >= promo_record.max_uses THEN
        RETURN jsonb_build_object('success', false, 'error', 'Promo code usage limit reached');
    END IF;

    -- Create redemption record
    INSERT INTO public.promo_code_redemptions (user_id, promo_code_id, points_earned)
    VALUES (auth.uid(), promo_record.id, promo_record.points)
    RETURNING * INTO redemption_record;

    -- Update promo code usage count
    UPDATE public.promo_codes 
    SET current_uses = current_uses + 1 
    WHERE id = promo_record.id;

    -- Update user points
    UPDATE public.profiles 
    SET points = points + promo_record.points,
        total_earned = total_earned + promo_record.points
    WHERE id = auth.uid();

    -- Create transaction record
    INSERT INTO public.transactions (user_id, type, points, description, task_type)
    VALUES (auth.uid(), 'earn', promo_record.points, 'Promo code redeemed: ' || promo_record.code, 'promo_code');

    RETURN jsonb_build_object(
        'success', true, 
        'points_earned', promo_record.points,
        'code', promo_record.code,
        'description', promo_record.description
    );
END;
$$;

-- Create function to get user redemptions
CREATE OR REPLACE FUNCTION public.get_user_redemptions(user_id_param uuid DEFAULT NULL)
RETURNS TABLE (
    id uuid,
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
    -- Use current user if no user_id provided
    IF user_id_param IS NULL THEN
        user_id_param := auth.uid();
    END IF;

    -- Check if user can access this data
    IF user_id_param != auth.uid() AND NOT is_admin_user(auth.uid()) THEN
        RAISE EXCEPTION 'Access denied';
    END IF;

    RETURN QUERY
    SELECT 
        r.id,
        r.promo_code_id,
        r.points_earned,
        r.created_at,
        p.code,
        p.description
    FROM public.promo_code_redemptions r
    JOIN public.promo_codes p ON r.promo_code_id = p.id
    WHERE r.user_id = user_id_param
    ORDER BY r.created_at DESC
    LIMIT 10;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.generate_promo_codes(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_promo_code(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_redemptions(uuid) TO authenticated;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_promo_codes_code ON public.promo_codes(code);
CREATE INDEX IF NOT EXISTS idx_promo_codes_active ON public.promo_codes(is_active);
CREATE INDEX IF NOT EXISTS idx_promo_code_redemptions_user_id ON public.promo_code_redemptions(user_id);
CREATE INDEX IF NOT EXISTS idx_promo_code_redemptions_promo_code_id ON public.promo_code_redemptions(promo_code_id);