const express = require('express');
const router = express.Router();
const timeSlotController = require('../controllers/timeSlotController');
const sanitizeInput = require('../middleware/sanitization');
const { timeSlotCreate, validateRequest } = require('../middleware/validation');

// Create time slot
router.post('/',
  sanitizeInput,
  timeSlotCreate,
  validateRequest,
  timeSlotController.createTimeSlot.bind(timeSlotController)
);

// Get time slots
router.get('/',
  timeSlotController.getTimeSlots.bind(timeSlotController)
);

// Reserve time slot
router.post('/:slotId/reserve',
  sanitizeInput,
  validateRequest,
  timeSlotController.reserveTimeSlot.bind(timeSlotController)
);

// Delete time slot
router.delete('/:slotId/delete',
  timeSlotController.deleteTimeSlot.bind(timeSlotController)
);

module.exports = router;