const validateDateRange = (req, res, next) => {
  const { start_date, end_date } = req.query;
  
  if (start_date && end_date) {
    const start = new Date(start_date);
    const end = new Date(end_date);
    
    if (start >= end) {
      return res.status(400).json({
        success: false,
        error: {
          code: "INVALID_DATE_RANGE",
          message: "Start date must be before end date"
        }
      });
    }
  }
  next();
};

const validateRecurringPattern = (req, res, next) => {
  const { recurring } = req.body;
  
  if (recurring) {
    if (recurring.frequency === 'weekly' && !recurring.day_of_week) {
      return res.status(400).json({
        success: false,
        error: {
          code: "INVALID_RECURRING_PATTERN",
          message: "Weekly recurring slots must specify day_of_week"
        }
      });
    }
    
    if (recurring.frequency === 'monthly' && !recurring.day_of_month) {
      return res.status(400).json({
        success: false,
        error: {
          code: "INVALID_RECURRING_PATTERN",
          message: "Monthly recurring slots must specify day_of_month"
        }
      });
    }
  }
  next();
}; 