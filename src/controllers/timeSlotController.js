const timeSlotService = require('../services/timeSlotService');
const ResponseHandler = require('../utils/responseHandler');
const AppError = require('../utils/AppError');

class TimeSlotController {
  // Create a new time slot or recurring pattern
  async createTimeSlot(req, res) {
    try {
      // Extract time slot details from request
      const { consultant_id, start_time, end_time, recurring, timezone } = req.body;

      // Create the time slot(s) via service
      const result = await timeSlotService.createTimeSlot(
        consultant_id,
        start_time,
        end_time,
        recurring,
        timezone
      );

      // Return success with appropriate message
      return ResponseHandler.success(res, {
        statusCode: 201,
        message: recurring ? 'Recurring slots created' : 'Time slot created',
        data: result.data
      });
    } catch (err) {
      // Handle any errors that occurred
      const error = ResponseHandler.handleDatabaseError(err);
      return ResponseHandler.error(res, error);
    }
  }

  // Reserve a time slot for a customer
  async reserveTimeSlot(req, res) {
    try {
      // Attempt to reserve the slot
      const result = await timeSlotService.reserveTimeSlot(
        req.params.slotId,
        req.body.customer_id
      );

      // Return success response
      return ResponseHandler.success(res, {
        statusCode: 200,
        data: result.data
      });
    } catch (err) {
      // Handle booking errors (e.g., already reserved)
      const error = ResponseHandler.handleDatabaseError(err);
      return ResponseHandler.error(res, error);
    }
  }

  async getTimeSlots(req, res) {
    try {
      const result = await timeSlotService.getTimeSlots(req.query);
      
      return res.status(200).json({
        success: true,
        ...result
      });

    } catch (error) {
      // Handle AppError instances with specific status codes
      if (error instanceof AppError) {
        return res.status(error.statusCode).json({
          success: false,
          error: error.message
        });
      }

      // Handle unexpected errors
      console.error('Error getting time slots:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to get time slots'
      });
    }
  }

  async deleteTimeSlot(req, res) {
    try {
      // Check if slot exists and is not booked
      const slot = await timeSlotService.getSlotById(req.params.slotId);
      if (!slot) {
        throw new AppError('Time slot not found', 400);
      }
      if (slot.is_booked) {
        throw new AppError('Cannot delete booked time slots', 400);
      }

      // Delete the time slot
      const result = await timeSlotService.deleteTimeSlot(req.params.slotId);
      return ResponseHandler.success(res, {
        statusCode: 200,
        message: result.message
      });
    } catch (err) {
      // Handle any errors that occurred
      const error = ResponseHandler.handleDatabaseError(err);
      return ResponseHandler.error(res, error);
    }
  }
}

module.exports = new TimeSlotController(); 