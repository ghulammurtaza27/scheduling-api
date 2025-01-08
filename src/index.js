// src/index.js
const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const sanitizeInput = require('./middleware/sanitization');
const timeSlotsRouter = require('./routes/timeSlots');

app.use(cors());
app.use(express.json());
app.use(sanitizeInput);

app.use('/api/time-slots', timeSlotsRouter);

// Export the app for testing
module.exports = app;

// Only start the server if this file is run directly
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
}