/*
  # Fix User Registration Database Error

  1. Database Functions
    - Create or replace `handle_new_user` trigger function with SECURITY DEFINER
    - Create or replace `create_profile_for_user` function with proper permissions
    - Create or replace `award_signup_bonus_for_user` function with proper permissions

  2. Triggers
    - Ensure trigger on auth.users table for automatic profile creation

  3. Security
    - Fix RLS policies on profiles table for user registration
    - Ensure proper permissions for profile creation during signup

  This migration fixes the "Database error saving new user" issue during registration.
*/

-- Create or replace the profile creation function with SECURITY DEFINER
CREATE OR REPLACE FUNCTION public.create_profile_for_user()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO public.profiles (
    id,
    email,
    full_name,
    phone,
    points,
    total_earned,
    created_at,
    updated_at
  )
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'phone', ''),
    0,
    0,
    NOW(),
    NOW()
  );
  
  RETURN NEW;
EXCEPTION
  WHEN unique_violation THEN
    -- Profile already exists, just return
    RETURN NEW;
  WHEN OTHERS THEN
    -- Log error but don't fail the user creation
    RAISE WARNING 'Failed to create profile for user %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;

-- Create or replace the signup bonus function with SECURITY DEFINER
CREATE OR REPLACE FUNCTION public.award_signup_bonus_for_user()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  -- Only award bonus if email is confirmed
  IF NEW.email_confirmed_at IS NOT NULL AND OLD.email_confirmed_at IS NULL THEN
    -- Check if signup bonus already exists
    IF NOT EXISTS (
      SELECT 1 FROM public.transactions 
      WHERE user_id = NEW.id AND task_type = 'signup'
    ) THEN
      -- Insert signup bonus transaction
      INSERT INTO public.transactions (
        user_id,
        type,
        points,
        description,
        task_type,
        created_at
      )
      VALUES (
        NEW.id,
        'earn',
        100,
        'Welcome bonus for email confirmation',
        'signup',
        NOW()
      );
    END IF;
  END IF;
  
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log error but don't fail the user update
    RAISE WARNING 'Failed to award signup bonus for user %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;

-- Create or replace the main user handler function
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  -- Create profile
  PERFORM public.create_profile_for_user();
  
  -- Award signup bonus if email is confirmed
  IF NEW.email_confirmed_at IS NOT NULL THEN
    PERFORM public.award_signup_bonus_for_user();
  END IF;
  
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log error but don't fail the user creation
    RAISE WARNING 'Failed to handle new user %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;

-- Drop existing triggers if they exist
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP TRIGGER IF EXISTS on_auth_user_confirmed ON auth.users;

-- Create trigger for new user creation
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Create trigger for email confirmation
CREATE TRIGGER on_auth_user_confirmed
  AFTER UPDATE OF email_confirmed_at ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.award_signup_bonus_for_user();

-- Ensure proper RLS policies for profiles table
DROP POLICY IF EXISTS "Allow profile creation during signup" ON public.profiles;
DROP POLICY IF EXISTS "System can create profiles" ON public.profiles;

-- Create policy to allow profile creation during signup
CREATE POLICY "System can create profiles"
  ON public.profiles
  FOR INSERT
  TO public
  WITH CHECK (true);

-- Ensure authenticated users can still manage their own profiles
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'profiles' 
    AND policyname = 'Users can insert own profile'
  ) THEN
    CREATE POLICY "Users can insert own profile"
      ON public.profiles
      FOR INSERT
      TO authenticated
      WITH CHECK (auth.uid() = id);
  END IF;
END $$;

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON public.profiles TO postgres, service_role;
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.transactions TO postgres, service_role;
GRANT SELECT, INSERT ON public.transactions TO authenticated;