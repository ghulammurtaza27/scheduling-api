const request = require('supertest');
const app = require('../index');
const pool = require('../config/database');
const { v4: uuidv4 } = require('uuid');

// Mock data
const mockConsultant = {
  id: uuidv4(),
  name: 'Dr. Smith'
};

const mockCustomer = {
  id: uuidv4(),
  name: 'John Doe'
};

describe('Time Slots API', () => {
  beforeAll(async () => {
    try {
      // First, create the UUID extension
      await pool.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');

      // Then create tables with UUID support
      await pool.query(`
        DROP TABLE IF EXISTS time_slots;
        DROP TABLE IF EXISTS recurring_patterns;
        DROP TABLE IF EXISTS customers;
        DROP TABLE IF EXISTS consultants;

        CREATE TABLE consultants (
          id UUID PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE customers (
          id UUID PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE recurring_patterns (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          frequency VARCHAR(10) NOT NULL,
          day_of_week INTEGER,
          day_of_month INTEGER,
          until_date TIMESTAMP NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE time_slots (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          consultant_id UUID REFERENCES consultants(id),
          customer_id UUID REFERENCES customers(id),
          start_time TIMESTAMP NOT NULL,
          end_time TIMESTAMP NOT NULL,
          is_booked BOOLEAN DEFAULT FALSE,
          recurring_pattern_id UUID REFERENCES recurring_patterns(id),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        -- Create the recurring slots function
        CREATE OR REPLACE FUNCTION create_recurring_slots(
          p_consultant_id UUID,
          p_start_time TIMESTAMP,
          p_end_time TIMESTAMP,
          p_pattern_id UUID,
          p_until_date TIMESTAMP
        ) RETURNS VOID AS $$
        DECLARE
          v_current_date TIMESTAMP;
          v_pattern RECORD;
          v_interval INTERVAL;
        BEGIN
          -- Get pattern details
          SELECT * INTO v_pattern FROM recurring_patterns WHERE id = p_pattern_id;
          
          -- Set initial date
          v_current_date := p_start_time;
          
          -- Calculate interval based on frequency
          IF v_pattern.frequency = 'weekly' THEN
            v_interval := '1 week'::INTERVAL;
          ELSE
            v_interval := '1 month'::INTERVAL;
          END IF;
          
          -- Create recurring slots
          WHILE v_current_date <= p_until_date LOOP
            INSERT INTO time_slots (
              consultant_id,
              start_time,
              end_time,
              recurring_pattern_id
            ) VALUES (
              p_consultant_id,
              v_current_date,
              v_current_date + (p_end_time - p_start_time),
              p_pattern_id
            );
            
            v_current_date := v_current_date + v_interval;
          END LOOP;
        END;
        $$ LANGUAGE plpgsql;
      `);

      // Insert test data
      await pool.query(
        `INSERT INTO consultants (id, name) 
         VALUES ($1::uuid, $2)`,
        [mockConsultant.id, mockConsultant.name]
      );

      await pool.query(
        `INSERT INTO customers (id, name) 
         VALUES ($1::uuid, $2)`,
        [mockCustomer.id, mockCustomer.name]
      );

    } catch (error) {
      console.error('Test setup failed:', error);
      throw error;
    }
  });

  afterEach(async () => {
    // Clean up test data after each test
    await pool.query(`
      DELETE FROM time_slots;
      DELETE FROM recurring_patterns;
    `);
  });

  afterAll(async () => {
    try {
      await pool.query('DROP TABLE IF EXISTS time_slots CASCADE');
      await pool.query('DROP TABLE IF EXISTS recurring_patterns CASCADE');
      await pool.query('DROP TABLE IF EXISTS customers CASCADE');
      await pool.query('DROP TABLE IF EXISTS consultants CASCADE');
      await pool.query('DROP FUNCTION IF EXISTS create_recurring_slots CASCADE');
    } finally {
      await pool.end();
    }
  });

  describe('POST /api/time-slots', () => {
    it('should create a single time slot', async () => {
      const response = await request(app)
        .post('/api/time-slots')
        .send({
          consultant_id: mockConsultant.id,
          start_time: "16:00",
          end_time: "17:00"
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Time slot created');
    });

    it('should create recurring time slots', async () => {
      const response = await request(app)
        .post('/api/time-slots')
        .send({
          consultant_id: mockConsultant.id,
          start_time: "16:00",
          end_time: "17:00",
          recurring: {
            frequency: "weekly",
            day_of_week: 6,
            until: "2025-07-15T00:00:00Z"
          }
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Recurring slots created');
    });
  });

  describe('GET /api/time-slots', () => {
    it('should get available time slots', async () => {
      // First create a time slot
      await request(app)
        .post('/api/time-slots')
        .send({
          consultant_id: mockConsultant.id,
          start_time: "14:00",
          end_time: "15:00"
        });

      const response = await request(app)
        .get('/api/time-slots')
        .query({ 
          consultant_id: mockConsultant.id,
          page: 1,
          limit: 20
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data.time_slots)).toBe(true);
      expect(response.body.data.pagination).toBeDefined();
      expect(response.body.data.pagination.current_page).toBe(1);
    });
  });
}); 