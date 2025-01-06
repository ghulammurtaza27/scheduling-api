-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Drop tables if they exist (in correct order)
DROP TABLE IF EXISTS time_slots CASCADE;
DROP TABLE IF EXISTS recurring_patterns CASCADE;
DROP TABLE IF EXISTS customers CASCADE;
DROP TABLE IF EXISTS consultants CASCADE;
DROP FUNCTION IF EXISTS create_recurring_slots CASCADE;

-- Create base tables
CREATE TABLE consultants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE customers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE recurring_patterns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  frequency VARCHAR(10) NOT NULL,
  day_of_week INTEGER,
  day_of_month INTEGER,
  until_date TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT check_frequency CHECK (frequency IN ('weekly', 'monthly')),
  CONSTRAINT check_day_of_week CHECK (day_of_week >= 0 AND day_of_week <= 6),
  CONSTRAINT check_day_of_month CHECK (day_of_month >= 1 AND day_of_month <= 31)
);

CREATE TABLE time_slots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  consultant_id UUID NOT NULL REFERENCES consultants(id),
  customer_id UUID REFERENCES customers(id),
  start_time TIMESTAMP NOT NULL,
  end_time TIMESTAMP NOT NULL,
  is_booked BOOLEAN DEFAULT FALSE,
  is_cancelled BOOLEAN DEFAULT FALSE,
  cancelled_at TIMESTAMP,
  recurring_pattern_id UUID REFERENCES recurring_patterns(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT check_times CHECK (end_time > start_time)
);

-- Create indexes
CREATE INDEX idx_time_slots_consultant ON time_slots(consultant_id);
CREATE INDEX idx_time_slots_customer ON time_slots(customer_id);
CREATE INDEX idx_time_slots_start_time ON time_slots(start_time);
CREATE INDEX idx_time_slots_recurring ON time_slots(recurring_pattern_id);

-- Create function for recurring slots
CREATE OR REPLACE FUNCTION create_recurring_slots(
  p_consultant_id UUID,
  p_start_time TIMESTAMP,
  p_end_time TIMESTAMP,
  p_pattern_id UUID,
  p_until_date TIMESTAMP
) RETURNS void AS $$
DECLARE
  v_current TIMESTAMP;
  v_slot_duration INTERVAL;
  v_frequency VARCHAR;
  v_day_of_week INTEGER;
BEGIN
  -- Get pattern details
  SELECT frequency, day_of_week 
  INTO v_frequency, v_day_of_week
  FROM recurring_patterns 
  WHERE id = p_pattern_id;
  
  -- Calculate slot duration
  v_slot_duration := p_end_time - p_start_time;
  v_current := p_start_time;
  
  WHILE v_current <= p_until_date LOOP
    -- Insert the time slot
    INSERT INTO time_slots (
      consultant_id,
      start_time,
      end_time,
      recurring_pattern_id
    ) VALUES (
      p_consultant_id,
      v_current,
      v_current + v_slot_duration,
      p_pattern_id
    );
    
    -- Increment the date based on frequency
    IF v_frequency = 'weekly' THEN
      v_current := v_current + INTERVAL '1 week';
    ELSE
      v_current := v_current + INTERVAL '1 month';
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Seed data
INSERT INTO consultants (name, email) VALUES
  ('Dr. Sarah Smith', 'sarah.smith@example.com'),
  ('Dr. John Davis', 'john.davis@example.com'),
  ('Dr. Maria Garcia', 'maria.garcia@example.com'),
  ('Dr. James Wilson', 'james.wilson@example.com'),
  ('Dr. Emily Chen', 'emily.chen@example.com');

INSERT INTO customers (name, email) VALUES
  ('Alice Johnson', 'alice.j@example.com'),
  ('Bob Williams', 'bob.w@example.com'),
  ('Carol Brown', 'carol.b@example.com'),
  ('David Miller', 'david.m@example.com'),
  ('Eva Martinez', 'eva.m@example.com');


