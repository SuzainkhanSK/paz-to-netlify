/*
  # Create points audit log table

  1. New Tables
    - `points_audit_log`
      - `id` (uuid, primary key)
      - `user_id` (uuid, foreign key to profiles)
      - `old_points` (integer, previous points value)
      - `new_points` (integer, new points value)
      - `changed_at` (timestamp, when the change occurred)
      - `reason` (text, reason for the change)
      - `changed_by` (text, who/what made the change)

  2. Security
    - Enable RLS on `points_audit_log` table
    - Add policy for users to read their own audit logs
    - Add policy for admins to read all audit logs

  3. Indexes
    - Index on user_id for efficient queries
    - Index on changed_at for time-based queries
*/

CREATE TABLE IF NOT EXISTS public.points_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  old_points integer NOT NULL,
  new_points integer NOT NULL,
  changed_at timestamp with time zone DEFAULT now() NOT NULL,
  reason text,
  changed_by text
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_points_audit_log_user_id ON public.points_audit_log (user_id);
CREATE INDEX IF NOT EXISTS idx_points_audit_log_changed_at ON public.points_audit_log (changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_points_audit_log_user_date ON public.points_audit_log (user_id, changed_at DESC);

-- Enable Row Level Security
ALTER TABLE public.points_audit_log ENABLE ROW LEVEL SECURITY;

-- Policy for users to read their own audit logs
CREATE POLICY "Users can read own audit logs"
  ON public.points_audit_log
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Policy for admins to read all audit logs
CREATE POLICY "Admins can read all audit logs"
  ON public.points_audit_log
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_users 
      WHERE id = auth.uid() AND is_active = true
    )
  );

-- Policy for system to insert audit logs
CREATE POLICY "System can insert audit logs"
  ON public.points_audit_log
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Function to automatically log points changes
CREATE OR REPLACE FUNCTION public.log_points_change()
RETURNS TRIGGER AS $$
BEGIN
  -- Only log if points actually changed
  IF OLD.points IS DISTINCT FROM NEW.points THEN
    INSERT INTO public.points_audit_log (
      user_id,
      old_points,
      new_points,
      reason,
      changed_by
    ) VALUES (
      NEW.id,
      COALESCE(OLD.points, 0),
      COALESCE(NEW.points, 0),
      CASE 
        WHEN NEW.points > OLD.points THEN 'Points earned'
        WHEN NEW.points < OLD.points THEN 'Points spent/deducted'
        ELSE 'Points updated'
      END,
      'system'
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;