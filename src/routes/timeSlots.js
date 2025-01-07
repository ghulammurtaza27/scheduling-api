const express = require('express');
const router = express.Router();
const timeSlotController = require('../controllers/timeSlotController');
const { validateRequest, timeSlotCreate, timeSlotQuery, slotReservation } = require('../middleware/validation');

router.post('/', 
  timeSlotCreate, 
  validateRequest, 
  timeSlotController.createTimeSlot.bind(timeSlotController)
);

router.post('/:slotId/reserve', 
  slotReservation, 
  validateRequest, 
  timeSlotController.reserveTimeSlot.bind(timeSlotController)
);

router.get('/', 
  timeSlotQuery, 
  validateRequest, 
  timeSlotController.getTimeSlots.bind(timeSlotController)
);

router.delete('/:slotId',
  timeSlotController.deleteValidation,
  validateRequest,
  timeSlotController.deleteTimeSlot.bind(timeSlotController)
);

module.exports = router;