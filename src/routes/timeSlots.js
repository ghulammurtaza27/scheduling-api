const express = require('express');
const router = express.Router();
const timeSlotController = require('../controllers/timeSlotController');
const sanitizeInput = require('../middleware/sanitization');
const { timeSlotCreate, validateRequest, timeSlotQuery, slotReservation } = require('../middleware/validation');

// Create time slot
router.post('/',
  sanitizeInput,
  timeSlotCreate,
  validateRequest,
  timeSlotController.createTimeSlot.bind(timeSlotController)
);

// Get time slots
router.get('/',
  timeSlotQuery,
  validateRequest,
  timeSlotController.getTimeSlots
);

// Reserve time slot
router.post('/:slotId/reserve',
  sanitizeInput,
  slotReservation,
  validateRequest,
  timeSlotController.reserveTimeSlot.bind(timeSlotController)
);

// Delete time slot
router.delete('/:slotId',
  timeSlotController.deleteTimeSlot.bind(timeSlotController)
);

module.exports = router;