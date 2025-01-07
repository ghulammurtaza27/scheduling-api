const timeSlotService = require('../services/timeSlotService');
const pool = require('../config/database');
const { param } = require('express-validator');

class TimeSlotController {
  constructor() {
    this.deleteValidation = [
      param('slotId').isUUID().custom(async (value) => {
        const slot = await pool.query(
          'SELECT is_booked, start_time, consultant_id FROM time_slots WHERE id = $1',
          [value]
        );
        if (!slot.rows.length) throw new Error('Time slot not found');
        if (slot.rows[0].is_booked) throw new Error('Cannot delete booked time slots');
        if (new Date(slot.rows[0].start_time) < new Date()) {
          throw new Error('Cannot delete past time slots');
        }
        return true;
      })
    ];
  }

  async createTimeSlot(req, res) {
    try {
      const { consultant_id, start_time, end_time, recurring } = req.body;
      const result = await timeSlotService.createTimeSlot(
        consultant_id,
        start_time,
        end_time,
        recurring
      );

      res.status(result.statusCode).json({
        success: true,
        message: recurring ? 'Recurring slots created' : 'Time slot created',
        data: result.data
      });
    } catch (err) {
      console.error('Error creating time slot:', err);
      
      let statusCode = err.statusCode || 400;
      if (err.code === '23505') statusCode = 409;
      if (err.code === '23503') statusCode = 404;
      
      res.status(statusCode).json({
        success: false,
        error: err.message
      });
    }
  }

  async reserveTimeSlot(req, res) {
    try {
      const result = await timeSlotService.reserveTimeSlot(
        req.params.slotId,
        req.body.customer_id
      );

      res.status(result.statusCode).json({
        success: true,
        data: result.data
      });
    } catch (err) {
      let statusCode = err.statusCode || 500;
      let errorMessage = err.message;

      switch(true) {
        case err.message === 'Customer not found':
          statusCode = 404;
          break;
        case err.message === 'Time slot not found':
          statusCode = 404;
          break;
        case err.code === '23503':
          statusCode = 404;
          errorMessage = 'Referenced record not found';
          break;
        case err.code === '23505':
          statusCode = 409;
          break;
        case err.code === '22P02':
          statusCode = 400;
          errorMessage = 'Invalid input format';
          break;
      }

      res.status(statusCode).json({
        success: false,
        error: errorMessage
      });
    }
  }

  async getTimeSlots(req, res) {
    try {
      const result = await timeSlotService.getTimeSlots(req.query);
      
      if (result.status === 'error') {
        return res.status(result.statusCode).json({
          success: false,
          error: result.message
        });
      }

      res.status(result.statusCode).json({
        success: true,
        data: result.data
      });
    } catch (err) {
      res.status(err.statusCode || 500).json({
        success: false,
        error: err.message
      });
    }
  }

  async deleteTimeSlot(req, res) {
    try {
      const result = await timeSlotService.deleteTimeSlot(req.params.slotId);
      
      if (result.status === 'error') {
        return res.status(result.statusCode).json({
          success: false,
          error: result.message
        });
      }

      res.status(result.statusCode).json({
        success: true,
        message: result.message
      });
    } catch (err) {
      res.status(err.statusCode || 400).json({
        success: false,
        error: err.message
      });
    }
  }
}

module.exports = new TimeSlotController(); 