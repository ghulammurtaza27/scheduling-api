const timeSlotService = require('../services/timeSlotService');
const ResponseHandler = require('../utils/responseHandler');
const AppError = require('../utils/AppError');

class TimeSlotController {
  async createTimeSlot(req, res) {
    try {
      const { consultant_id, start_time, end_time, recurring } = req.body;
      const result = await timeSlotService.createTimeSlot(
        consultant_id,
        start_time,
        end_time,
        recurring
      );

      return ResponseHandler.success(res, {
        statusCode: 201,
        message: recurring ? 'Recurring slots created' : 'Time slot created',
        data: result.data
      });
    } catch (err) {
      const error = ResponseHandler.handleDatabaseError(err);
      return ResponseHandler.error(res, error);
    }
  }

  async reserveTimeSlot(req, res) {
    try {
      const result = await timeSlotService.reserveTimeSlot(
        req.params.slotId,
        req.body.customer_id
      );

      return ResponseHandler.success(res, {
        statusCode: 200,
        data: result.data
      });
    } catch (err) {
      const error = ResponseHandler.handleDatabaseError(err);
      return ResponseHandler.error(res, error);
    }
  }

  async getTimeSlots(req, res) {
    try {
      const { month, page, limit } = req.query;
      
      // Validate page number
      if (page) {
        const pageNum = parseInt(page, 10);
        if (isNaN(pageNum) || pageNum < 1) {
          return ResponseHandler.error(res, {
            statusCode: 400,
            message: 'Invalid page number. Must be a positive integer'
          });
        }
      }

      // Validate month format if provided
      if (month) {
        if (!/^\d{4}-\d{2}$/.test(month)) {
          return ResponseHandler.error(res, {
            statusCode: 400,
            message: 'Invalid month format. Use YYYY-MM'
          });
        }
        
        const [year, monthNum] = month.split('-').map(Number);
        if (monthNum < 1 || monthNum > 12) {
          return ResponseHandler.error(res, {
            statusCode: 400,
            message: 'Invalid month value'
          });
        }
      }

      const result = await timeSlotService.getTimeSlots(req.query);
      return ResponseHandler.success(res, {
        statusCode: 200,
        data: result.data
      });
    } catch (err) {
      const error = ResponseHandler.handleDatabaseError(err);
      return ResponseHandler.error(res, error);
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

      const result = await timeSlotService.deleteTimeSlot(req.params.slotId);
      return ResponseHandler.success(res, {
        statusCode: 200,
        message: result.message
      });
    } catch (err) {
      const error = ResponseHandler.handleDatabaseError(err);
      return ResponseHandler.error(res, error);
    }
  }
}

module.exports = new TimeSlotController(); 