const request = require('supertest');
const app = require('../index');
const pool = require('../config/database');
const { v4: uuidv4 } = require('uuid');

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
      await pool.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');

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
          SELECT * INTO v_pattern FROM recurring_patterns WHERE id = p_pattern_id;
          v_current_date := p_start_time;
          
          IF v_pattern.frequency = 'weekly' THEN
            v_interval := '1 week'::INTERVAL;
          ELSE
            v_interval := '1 month'::INTERVAL;
          END IF;
          
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

      await pool.query(
        'INSERT INTO consultants (id, name) VALUES ($1::uuid, $2)',
        [mockConsultant.id, mockConsultant.name]
      );

      await pool.query(
        'INSERT INTO customers (id, name) VALUES ($1::uuid, $2)',
        [mockCustomer.id, mockCustomer.name]
      );

    } catch (error) {
      console.error('Test setup failed:', error);
      throw error;
    }
  });

  afterEach(async () => {
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
          start_time: "2025-03-22T13:00:00Z",
          end_time: "2025-03-22T14:00:00Z"
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Time slot created');
    });

    it('should create recurring weekly time slots', async () => {
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

    it('should create recurring monthly time slots', async () => {
      const response = await request(app)
        .post('/api/time-slots')
        .send({
          consultant_id: mockConsultant.id,
          start_time: "16:00",
          end_time: "17:00",
          recurring: {
            frequency: "monthly",
            day_of_month: 15,
            until: "2025-07-15T00:00:00Z"
          }
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
    });

    it('should prevent overlapping time slots', async () => {
      // Create first slot
      await request(app)
        .post('/api/time-slots')
        .send({
          consultant_id: mockConsultant.id,
          start_time: "2025-03-22T13:00:00Z",
          end_time: "2025-03-22T14:00:00Z"
        });

      // Attempt to create overlapping slot
      const response = await request(app)
        .post('/api/time-slots')
        .send({
          consultant_id: mockConsultant.id,
          start_time: "2025-03-22T13:30:00Z",
          end_time: "2025-03-22T14:30:00Z"
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('overlaps');
    });
  });

  describe('GET /api/time-slots', () => {
    beforeEach(async () => {
      // Create test time slots
      await request(app)
        .post('/api/time-slots')
        .send({
          consultant_id: mockConsultant.id,
          start_time: "2025-03-22T14:00:00Z",
          end_time: "2025-03-22T15:00:00Z"
        });
    });

    it('should get available time slots with pagination', async () => {
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

    it('should filter time slots by date', async () => {
      const response = await request(app)
        .get('/api/time-slots')
        .query({ 
          consultant_id: mockConsultant.id,
          date: '2025-03-22'
        });

      expect(response.status).toBe(200);
      expect(response.body.data.time_slots.length).toBeGreaterThan(0);
      expect(response.body.data.time_slots[0].start_time).toContain('2025-03-22');
    });

    it('should filter time slots by month', async () => {
      const response = await request(app)
        .get('/api/time-slots')
        .query({ 
          consultant_id: mockConsultant.id,
          month: '2025-03'
        });

      expect(response.status).toBe(200);
      expect(response.body.data.time_slots.length).toBeGreaterThan(0);
    });
  });

  describe('POST /api/time-slots/:slotId/reserve', () => {
    let slotId;

    beforeEach(async () => {
      // Create a test slot and get its ID from the database
      const createResult = await pool.query(
        `INSERT INTO time_slots 
         (consultant_id, start_time, end_time)
         VALUES ($1, $2, $3)
         RETURNING id`,
        [
          mockConsultant.id,
          new Date("2025-03-22T14:00:00Z"),
          new Date("2025-03-22T15:00:00Z")
        ]
      );
      
      slotId = createResult.rows[0].id;
      console.log('Created slot with ID:', slotId);
    });

    it('should prevent reserving an already booked slot', async () => {
      // First reservation
      const firstReserve = await request(app)
        .post(`/api/time-slots/${slotId}/reserve`)
        .send({
          customer_id: mockCustomer.id
        });

      console.log('First reserve response:', firstReserve.body);

      // Attempt second reservation
      const response = await request(app)
        .post(`/api/time-slots/${slotId}/reserve`)
        .send({
          customer_id: mockCustomer.id
        });

      console.log('Second reserve response:', response.body);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      if (response.body.errors) {
        expect(response.body.errors[0].msg).toBe('Time slot is not available');
      } else {
        expect(response.body.details).toBe('Time slot is not available');
      }
    });
  });

  describe('DELETE /api/time-slots/:slotId', () => {
    let slotId;

    beforeEach(async () => {
      // Create a test slot directly in the database
      const createResult = await pool.query(
        `INSERT INTO time_slots 
         (consultant_id, start_time, end_time)
         VALUES ($1, $2, $3)
         RETURNING id`,
        [
          mockConsultant.id,
          new Date("2025-03-22T14:00:00Z"),
          new Date("2025-03-22T15:00:00Z")
        ]
      );
      
      slotId = createResult.rows[0].id;
      console.log('Created slot with ID:', slotId);
    });

    it('should prevent deleting booked slots', async () => {
      // Book the slot first
      const bookResponse = await request(app)
        .post(`/api/time-slots/${slotId}/reserve`)
        .send({ customer_id: mockCustomer.id });

      console.log('Book response:', bookResponse.body);

      // Attempt to delete
      const response = await request(app)
        .delete(`/api/time-slots/${slotId}`);

      console.log('Delete booked response:', response.body);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      if (response.body.errors) {
        expect(response.body.errors[0].msg).toBe('Cannot delete booked time slots');
      } else {
        expect(response.body.details).toBe('Cannot delete booked time slots');
      }
    });

    it('should prevent deleting non-existent slots', async () => {
      const response = await request(app)
        .delete(`/api/time-slots/${uuidv4()}`);

      console.log('Delete non-existent response:', response.body);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      if (response.body.errors) {
        expect(response.body.errors[0].msg).toBe('Time slot not found');
      } else {
        expect(response.body.details).toBe('Time slot not found');
      }
    });
  });
});