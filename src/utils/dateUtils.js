/**
 * Generates time slots based on a recurring pattern
 */
const generateTimeSlots = async (patternId, consultantId, pattern) => {
  const slots = [];
  const currentDate = new Date(pattern.start_date);
  const endDate = new Date(pattern.end_date);

  // Keep generating slots until we hit the end date

  // add proper validation for date range
  while (currentDate <= endDate) {
    const dayOfWeek = currentDate.getDay();
    let shouldCreateSlot = false;

    switch (pattern.frequency) {
      case 'daily':
        shouldCreateSlot = true;
        break;

      case 'weekly':
      case 'biweekly':
        // Check if current day is in the selected days
        shouldCreateSlot = pattern.days_of_week.includes(dayOfWeek);
        
        // If it's not a selected day, just move to next day without weekly jump
        if (!shouldCreateSlot) {
          currentDate.setDate(currentDate.getDate() + 1);
          continue;
        }
        break;

      case 'monthly':
        shouldCreateSlot = currentDate.getDate() === new Date(pattern.start_date).getDate();
        break;
    }

    if (shouldCreateSlot) {
      // Create the slot using the pattern's time
      const startDateTime = new Date(currentDate);
      const [startHours, startMinutes] = pattern.start_time.split(':');
      startDateTime.setHours(parseInt(startHours), parseInt(startMinutes), 0, 0);

      const endDateTime = new Date(currentDate);
      const [endHours, endMinutes] = pattern.end_time.split(':');
      endDateTime.setHours(parseInt(endHours), parseInt(endMinutes), 0, 0);

      // Only add the slot if it's within our date range
      if (endDateTime <= endDate) {
        slots.push({
          consultant_id: consultantId,
          recurring_pattern_id: patternId,
          start_time: startDateTime,
          end_time: endDateTime,
        });
      }
    }

    // Move to next day
    currentDate.setDate(currentDate.getDate() + 1);
    
    // Handle frequency-specific jumps after creating the slot
    if (shouldCreateSlot && pattern.frequency !== 'daily') {
      switch (pattern.frequency) {
        case 'weekly':
          // Don't jump weeks - we need to check other days this week
          break;

        case 'biweekly':
          // Only jump if we've processed all days this week
          if (!pattern.days_of_week.some(day => day > dayOfWeek)) {
            currentDate.setDate(currentDate.getDate() + 6);
          }
          break;

        case 'monthly':
          const month = currentDate.getMonth();
          currentDate.setMonth(month + 1);
          
          // Handle month rollover
          if (currentDate.getMonth() !== (month + 1) % 12) {
            currentDate.setDate(0);
          }
          break;
      }
    }
  }

  return slots;
};

module.exports = {
  generateTimeSlots
};