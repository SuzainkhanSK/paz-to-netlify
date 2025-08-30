/*
  # Add Task Completion Function

  1. Telegram Task Completion
    - Atomic function for task completion
    - Prevents duplicate completions
    - Ensures single transaction per task

  2. Daily Check-in Processing
    - Atomic function for check-in rewards
    - Prevents duplicate check-ins
    - Handles streak calculations

  3. Special Task Processing
    - Atomic function for special tasks
    - Prevents duplicate completions
    - Handles daily limits
*/

-- Function to complete telegram tasks atomically
CREATE OR REPLACE FUNCTION complete_telegram_task(
  user_id_param UUID,
  task_type_param TEXT,
  task_id_param TEXT,
  points_earned_param INTEGER,
  description_param TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
  existing_task INTEGER;
BEGIN
  -- Check if task already completed
  SELECT COUNT(*) INTO existing_task
  FROM tasks
  WHERE user_id = user_id_param 
    AND task_type = task_type_param 
    AND task_id = task_id_param 
    AND completed = true;
  
  IF existing_task > 0 THEN
    RAISE EXCEPTION 'Task already completed';
  END IF;
  
  -- Mark task as completed
  INSERT INTO tasks (
    user_id, 
    task_type, 
    task_id, 
    completed, 
    points_earned, 
    completed_at
  )
  VALUES (
    user_id_param,
    task_type_param,
    task_id_param,
    true,
    points_earned_param,
    now()
  )
  ON CONFLICT (user_id, task_type, task_id) 
  DO UPDATE SET 
    completed = true,
    points_earned = points_earned_param,
    completed_at = now();
  
  -- Add transaction (trigger will update points automatically)
  INSERT INTO transactions (user_id, type, points, description, task_type)
  VALUES (
    user_id_param,
    'earn',
    points_earned_param,
    description_param,
    task_type_param
  );
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to process daily check-in atomically
CREATE OR REPLACE FUNCTION process_daily_checkin(
  user_id_param UUID,
  day_number INTEGER,
  points_earned_param INTEGER
)
RETURNS BOOLEAN AS $$
DECLARE
  today_checkin INTEGER;
BEGIN
  -- Check if already checked in today
  SELECT COUNT(*) INTO today_checkin
  FROM tasks
  WHERE user_id = user_id_param 
    AND task_type = 'daily_check_in'
    AND DATE(completed_at) = CURRENT_DATE;
  
  IF today_checkin > 0 THEN
    RAISE EXCEPTION 'Already checked in today';
  END IF;
  
  -- Create check-in task
  INSERT INTO tasks (
    user_id,
    task_type,
    task_id,
    completed,
    points_earned,
    completed_at
  )
  VALUES (
    user_id_param,
    'daily_check_in',
    'day_' || day_number || '_' || CURRENT_DATE,
    true,
    points_earned_param,
    now()
  );
  
  -- Add transaction (trigger will update points automatically)
  INSERT INTO transactions (user_id, type, points, description, task_type)
  VALUES (
    user_id_param,
    'earn',
    points_earned_param,
    'Daily Check-in: Day ' || day_number || ' (' || points_earned_param || ' points)',
    'daily_check_in'
  );
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to process special ad tasks atomically
CREATE OR REPLACE FUNCTION process_special_ad_task(
  user_id_param UUID,
  task_id_param TEXT,
  task_title_param TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
  today_task INTEGER;
  points_earned INTEGER := 50;
BEGIN
  -- Check if task already completed today
  SELECT COUNT(*) INTO today_task
  FROM tasks
  WHERE user_id = user_id_param 
    AND task_type = 'daily_ad'
    AND task_id = task_id_param
    AND DATE(completed_at) = CURRENT_DATE;
  
  IF today_task > 0 THEN
    RAISE EXCEPTION 'Task already completed today';
  END IF;
  
  -- Create task record
  INSERT INTO tasks (
    user_id,
    task_type,
    task_id,
    completed,
    points_earned,
    completed_at
  )
  VALUES (
    user_id_param,
    'daily_ad',
    task_id_param,
    true,
    points_earned,
    now()
  );
  
  -- Add transaction (trigger will update points automatically)
  INSERT INTO transactions (user_id, type, points, description, task_type)
  VALUES (
    user_id_param,
    'earn',
    points_earned,
    'Daily Ad Task: ' || task_title_param,
    'daily_ad'
  );
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;