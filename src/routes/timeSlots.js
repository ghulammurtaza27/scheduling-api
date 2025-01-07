const express = require('express');
const router = express.Router();
const { param } = require('express-validator');
const pool = require('../config/database');
const timeSlotService = require('../services/timeSlotService');
const { validateRequest, timeSlotCreate, timeSlotQuery, slotReservation } = require('../middleware/validation');

router.post('/', timeSlotCreate, validateRequest, async (req, res) => {
  try {
    const { consultant_id, start_time, end_time, recurring } = req.body;

    // Handle time string format for recurring slots
    let formattedStartTime = start_time;
    let formattedEndTime = end_time;

    if (recurring && start_time.includes(':')) {
      // For recurring slots with time-only format (HH:mm)
      const [startHour, startMinute] = start_time.split(':');
      const [endHour, endMinute] = end_time.split(':');
      
      // Use the first occurrence date based on recurring pattern
      const firstDate = new Date();
      if (recurring.day_of_week !== undefined) {
        // Weekly pattern - find next occurrence of day_of_week
        const daysUntilFirst = (recurring.day_of_week - firstDate.getDay() + 7) % 7;
        firstDate.setDate(firstDate.getDate() + daysUntilFirst);
      } else if (recurring.day_of_month !== undefined) {
        // Monthly pattern - set to next occurrence of day_of_month
        firstDate.setDate(recurring.day_of_month);
        if (firstDate < new Date()) {
          firstDate.setMonth(firstDate.getMonth() + 1);
        }
      }

      // Format the datetime strings
      firstDate.setHours(parseInt(startHour), parseInt(startMinute), 0, 0);
      formattedStartTime = firstDate.toISOString();

      firstDate.setHours(parseInt(endHour), parseInt(endMinute), 0, 0);
      formattedEndTime = firstDate.toISOString();
    }

    const result = await timeSlotService.createTimeSlot(
      consultant_id, 
      formattedStartTime, 
      formattedEndTime, 
      recurring
    );
    
    if (result.status === 'error') {
      return res.status(result.statusCode).json({
        success: false,
        error: result.message
      });
    }

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
});

router.post('/:slotId/reserve', slotReservation, validateRequest, async (req, res) => {
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
    // Handle specific error types and status codes
    let statusCode = err.statusCode || 500;
    let errorMessage = err.message;

    // Map specific error types to status codes
    switch(true) {
      case err.message === 'Customer not found':
        statusCode = 404;
        break;
      case err.message === 'Time slot not found':
        statusCode = 404;
        break;
      case err.code === '23503': // Foreign key violation
        statusCode = 404;
        errorMessage = 'Referenced record not found';
        break;
      case err.code === '23505': // Unique violation
        statusCode = 409;
        break;
      case err.code === '22P02': // Invalid input syntax
        statusCode = 400;
        errorMessage = 'Invalid input format';
        break;
    }

    res.status(statusCode).json({
      success: false,
      error: errorMessage
    });
  }
});

router.get('/', timeSlotQuery, validateRequest, async (req, res) => {
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
});

router.delete('/:slotId', [
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
  }),
  validateRequest
], async (req, res) => {
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
});

module.exports = router;