const request = require('supertest');
const app = require('../index');
const pool = require('../config/database');
const { v4: uuidv4 } = require('uuid');
const moment = require('moment');
const TimeSlotService = require('../services/timeSlotService');

const mockConsultant = {
  id: uuidv4(),
  name: 'Dr. Test Smith',
  email: 'test.smith@example.com'
};

const mockCustomer = {
  id: uuidv4(),
  name: 'John Test',
  email: 'john.test@example.com'
};

describe('Time Slots API', () => {
  beforeAll(async () => {
    try {
      await pool.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');

      await pool.query(`
        -- Drop tables if they exist
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
      `);

      await pool.query(
        'INSERT INTO consultants (id, name, email) VALUES ($1::uuid, $2, $3)',
        [mockConsultant.id, mockConsultant.name, mockConsultant.email]
      );

      await pool.query(
        'INSERT INTO customers (id, name, email) VALUES ($1::uuid, $2, $3)',
        [mockCustomer.id, mockCustomer.name, mockCustomer.email]
      );

    } catch (error) {
     
      throw error;
    }
  });

  afterEach(async () => {
    // Clean up time_slots after each test
    await pool.query('DELETE FROM time_slots');
  });

  afterAll(async () => {
    try {
      // Drop all tables after tests
      await pool.query('DROP TABLE IF EXISTS time_slots CASCADE');
      await pool.query('DROP TABLE IF EXISTS customers CASCADE');
      await pool.query('DROP TABLE IF EXISTS consultants CASCADE');
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
          start_time: "2025-03-22T16:00:00Z",
          end_time: "2025-03-22T17:00:00Z",
          recurring: {
            frequency: "weekly",
            until: "2025-07-15T00:00:00Z"
          }
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
    });

    it('should create recurring monthly time slots', async () => {
      const response = await request(app)
        .post('/api/time-slots')
        .send({
          consultant_id: mockConsultant.id,
          start_time: "2025-03-15T16:00:00Z",
          end_time: "2025-03-15T17:00:00Z",
          recurring: {
            frequency: "monthly",
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
    it('should prevent reserving an already booked slot', async () => {
      // Create a time slot
      const timeSlot = await pool.query(
        'INSERT INTO time_slots (id, consultant_id, start_time, end_time, is_booked) VALUES ($1, $2, $3, $4, $5) RETURNING *',
        [uuidv4(), mockConsultant.id, '2025-03-25T10:00:00Z', '2025-03-25T11:00:00Z', true]
      );

      const response = await request(app)
        .post(`/api/time-slots/${timeSlot.rows[0].id}/reserve`)
        .send({
          customer_id: mockCustomer.id
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Time slot is not available');
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

    });

    it('should prevent deleting booked slots', async () => {
      // Book the slot first
      const bookResponse = await request(app)
        .post(`/api/time-slots/${slotId}/reserve`)
        .send({ customer_id: mockCustomer.id });


      // Attempt to delete
      const response = await request(app)
        .delete(`/api/time-slots/${slotId}`);



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


      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      if (response.body.errors) {
        expect(response.body.errors[0].msg).toBe('Time slot not found');
      } else {
        expect(response.body.details).toBe('Time slot not found');
      }
    });
  });

  describe('Concurrency', () => {
    let slotId;

    beforeEach(async () => {
      // Create a test slot first
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
    });

    it('should handle concurrent reservations correctly', async () => {
      // Simulate concurrent requests
      const promises = Array(5).fill().map(() => 
        request(app)
          .post(`/api/time-slots/${slotId}/reserve`)
          .send({ customer_id: mockCustomer.id })
      );

      const results = await Promise.all(promises);
      
      // Only one request should succeed
      const successCount = results.filter(r => r.body.success === true).length;
      expect(successCount).toBe(1);

      // All other requests should fail
      const failureCount = results.filter(r => r.body.success === false).length;
      expect(failureCount).toBe(4);

      // Verify the slot is actually booked
      const finalState = await pool.query(
        'SELECT is_booked, customer_id FROM time_slots WHERE id = $1',
        [slotId]
      );
      
      expect(finalState.rows[0].is_booked).toBe(true);
      expect(finalState.rows[0].customer_id).toBe(mockCustomer.id);
    });

    afterEach(async () => {
      // Clean up the test slot
      await pool.query('DELETE FROM time_slots WHERE id = $1', [slotId]);
    });
  });

  describe('Pagination and Filtering', () => {
    beforeEach(async () => {
      // Create multiple test slots
      const slots = Array(150).fill().map((_, index) => ({
        consultant_id: mockConsultant.id,
        start_time: new Date(Date.UTC(2025, 3, 1 + Math.floor(index / 6), 8 + (index % 6))),
        end_time: new Date(Date.UTC(2025, 3, 1 + Math.floor(index / 6), 9 + (index % 6)))
      }));

      for (const slot of slots) {
        await pool.query(
          `INSERT INTO time_slots (consultant_id, start_time, end_time)
           VALUES ($1, $2, $3)`,
          [slot.consultant_id, slot.start_time, slot.end_time]
        );
      }
    });

    it('should handle invalid page numbers', async () => {
      const response = await request(app)
        .get('/api/time-slots')
        .query({ 
          consultant_id: mockConsultant.id,
          page: -1
        });

      expect(response.status).toBe(400);
    });

    it('should respect maximum page size', async () => {
      const response = await request(app)
        .get('/api/time-slots')
        .query({ 
          consultant_id: mockConsultant.id,
          limit: 1000
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.time_slots.length).toBeLessThanOrEqual(100);
    });

    afterEach(async () => {
      // Clean up test data
      await pool.query('DELETE FROM time_slots WHERE consultant_id = $1', [mockConsultant.id]);
    });
  });

  describe('Recurring Slots', () => {
    it('should handle invalid recurring pattern', async () => {
      const response = await request(app)
        .post('/api/time-slots')
        .send({
          consultant_id: mockConsultant.id,
          start_time: "16:00",
          end_time: "17:00",
          recurring: {
            frequency: "invalid",
            until: "2025-07-15T00:00:00Z"
          }
        });

      expect(response.status).toBe(400);
    });

    it('should handle invalid "until" date (past)', async () => {
      const response = await request(app)
        .post('/api/time-slots')
        .send({
          consultant_id: mockConsultant.id,
          start_time: "14:00",
          end_time: "15:00",
          recurring: {
            frequency: "weekly",
            until: "2020-07-15T00:00:00Z"
          }
        });

      expect(response.status).toBe(400);
    });
  });

  describe('Time Slot Creation', () => {
    it('should reject slots with end time before start time', async () => {
      const response = await request(app)
        .post('/api/time-slots')
        .send({
          consultant_id: mockConsultant.id,
          start_time: "2025-03-22T14:00:00Z",
          end_time: "2025-03-22T13:00:00Z"
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('after start time');
    });

    it('should reject slots shorter than minimum duration', async () => {
      const response = await request(app)
        .post('/api/time-slots')
        .send({
          consultant_id: mockConsultant.id,
          start_time: "2025-03-22T14:00:00Z",
          end_time: "2025-03-22T14:15:00Z" // 15 minutes
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid slot duration');
    });
  });

  describe('Time Slot Reservation', () => {
    let testSlotId;

    beforeEach(async () => {
      // Create a test slot
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
      
      testSlotId = createResult.rows[0].id;
    });

    it('should handle non-existent customer_id', async () => {
      const response = await request(app)
        .post(`/api/time-slots/${testSlotId}/reserve`)
        .send({ customer_id: '00000000-0000-0000-0000-000000000000' });

      expect(response.status).toBe(400);
    });

    afterEach(async () => {
      await pool.query('DELETE FROM time_slots WHERE id = $1', [testSlotId]);
    });
  });

  describe('Time Slot Filtering', () => {
    it('should handle invalid date format', async () => {
      const response = await request(app)
        .get('/api/time-slots')
        .query({ 
          date: 'not-a-date'
        });

      expect(response.status).toBe(400);
    });

    it('should handle invalid month format', async () => {
      const response = await request(app)
        .get('/api/time-slots')
        .query({ 
          month: '2025-13' // Invalid month
        });

      expect(response.status).toBe(400);
    });

    it('should return empty array for future date with no slots', async () => {
      const response = await request(app)
        .get('/api/time-slots')
        .query({ 
          date: '2030-01-01'
        });

      expect(response.status).toBe(200);
      expect(response.body.data.time_slots).toHaveLength(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle database connection errors gracefully', async () => {
      // Save original implementations
      const originalPool = pool.query;
      const originalConsoleError = console.error;
      
      // Mock implementations
      pool.query = jest.fn().mockRejectedValue(new Error('Database connection lost'));
      console.error = jest.fn(); // Silence the error log
      
      const response = await request(app)
        .get('/api/time-slots');

      expect(response.status).toBe(500);
      expect(response.body.error).toBeTruthy();

      // Restore original implementations
      pool.query = originalPool;
      console.error = originalConsoleError;
    });

    it('should handle malformed UUID', async () => {
      const response = await request(app)
        .post('/api/time-slots/not-a-uuid/reserve')
        .send({ customer_id: mockCustomer.id });

      expect(response.status).toBe(400);
    });
  });

  describe('Date Validation', () => {
    it('should reject time slots in the past', async () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 1); // Yesterday
      
      const response = await request(app)
        .post('/api/time-slots')
        .send({
          consultant_id: mockConsultant.id,
          start_time: pastDate.toISOString(),
          end_time: new Date(pastDate.getTime() + 60 * 60 * 1000).toISOString() // +1 hour
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Cannot create slots in the past');
    });

    it('should accept time slots in the future', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 1); // Tomorrow
      
      const response = await request(app)
        .post('/api/time-slots')
        .send({
          consultant_id: mockConsultant.id,
          start_time: futureDate.toISOString(),
          end_time: new Date(futureDate.getTime() + 60 * 60 * 1000).toISOString() // +1 hour
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
    });
  });

  describe('TimeSlot Daylight Saving Time Handling', () => {
    beforeEach(async () => {
      await pool.query('DELETE FROM time_slots');
    });

    test('should handle DST transition correctly for recurring slots', async () => {
      const consultantId = mockConsultant.id;
      // Use 2025 Spring DST transition (March 9, 2025, 2:00 AM EST)
      const startTime = '2025-03-09T06:00:00Z';  // 1:00 AM EST, day of transition
      const endTime = '2025-03-09T08:00:00Z';    // 3:00 AM EST (after transition)
      const recurring = {
        frequency: 'weekly',
        day_of_week: 0,  // Sunday
        until: '2025-03-23T00:00:00Z'  // Two weeks later
      };
      const timezone = 'America/New_York';

      const result = await TimeSlotService.createTimeSlot(
        consultantId,
        startTime,
        endTime,
        recurring,
        timezone
      );

      expect(result.data).toBeDefined();
      expect(result.warnings).toContain('Time slot spans DST transition');
      
      const slots = result.data;
      expect(slots.length).toBeGreaterThan(0);
      
      slots.forEach(slot => {
        const duration = moment(slot.end_time).diff(moment(slot.start_time), 'hours');
        expect(duration).toBe(2); // 2-hour duration maintained across DST
        expect(slot.consultant_id).toBe(mockConsultant.id);
      });
    });
  });

  describe('Input Sanitization', () => {
    test('should handle SQL injection attempts', async () => {
      const response = await request(app)
        .post('/api/time-slots')
        .send({
          consultant_id: "'; DROP TABLE time_slots; --",
          start_time: "2025-03-22T14:00:00Z",
          end_time: "2025-03-22T15:00:00Z"
        });
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    test('should sanitize special characters in input', async () => {
      const response = await request(app)
        .post('/api/time-slots')
        .send({
          consultant_id: mockConsultant.id,
          start_time: "2025-03-22T14:00:00Z<script>alert(1)</script>",
          end_time: "2025-03-22T15:00:00Z",
          notes: "<script>alert('xss')</script>"
        });
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    test('should reject malformed UUIDs', async () => {
      const response = await request(app)
        .post('/api/time-slots')
        .send({
          consultant_id: "not-a-uuid",
          start_time: "2025-03-22T14:00:00Z",
          end_time: "2025-03-22T15:00:00Z"
        });
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    test('should handle null byte injection', async () => {
      const response = await request(app)
        .post('/api/time-slots')
        .send({
          consultant_id: mockConsultant.id + '\0',
          start_time: "2025-03-22T14:00:00Z",
          end_time: "2025-03-22T15:00:00Z"
        });
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    test('should reject oversized input', async () => {
      const response = await request(app)
        .post('/api/time-slots')
        .send({
          consultant_id: mockConsultant.id,
          start_time: "2025-03-22T14:00:00Z",
          end_time: "2025-03-22T15:00:00Z",
          notes: "a".repeat(10000) // Attempt to send very large string
        });
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });
});