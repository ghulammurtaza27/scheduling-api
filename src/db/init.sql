-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Drop tables if they exist (in correct order)
DROP TABLE IF EXISTS time_slots CASCADE;
DROP TABLE IF EXISTS customers CASCADE;
DROP TABLE IF EXISTS consultants CASCADE;

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


CREATE TABLE time_slots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  consultant_id UUID NOT NULL REFERENCES consultants(id),
  customer_id UUID REFERENCES customers(id),
  start_time TIMESTAMP NOT NULL,
  end_time TIMESTAMP NOT NULL,
  is_booked BOOLEAN DEFAULT FALSE,
  is_cancelled BOOLEAN DEFAULT FALSE,
  cancelled_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT check_times CHECK (end_time > start_time)
);

-- Create indexes
CREATE INDEX idx_time_slots_consultant ON time_slots(consultant_id);
CREATE INDEX idx_time_slots_customer ON time_slots(customer_id);
CREATE INDEX idx_time_slots_start_time ON time_slots(start_time);


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


