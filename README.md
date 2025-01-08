# Scheduling API

A RESTful API for managing consultant time slots, built with Node.js, Express, and PostgreSQL.

## Features

- ✨ Create single and recurring time slots
- 📅 Weekly and monthly recurring patterns
- 🔍 Filter slots by date, month, and consultant
- 📊 Pagination support
- 🔒 Concurrent booking protection
- ✅ Input validation
- 🚫 Overlap prevention
- 📝 Comprehensive error handling

## Prerequisites

- Node.js (v14 or higher)
- PostgreSQL (v12 or higher)
- npm or yarn

## Installation

1. Clone the repository:

```
bash
git clone <repository-url>
cd scheduling-api
```

2. Install dependencies:

```
bash
npm install
```

3. Set up environment variables:
```bash
cp .env.example .env
# Edit .env with your database credentials
```

4. Initialize the database:

```bash
psql -U postgres -c "CREATE DATABASE timeslots"
psql timeslots -f src/db/init.sql
```

## Running the Application

Development mode:
```bash
npm run dev
```

Production mode:
```bash
npm start
```

Run tests:
```bash
npm test
```

## API Endpoints

### Time Slots

#### Create Time Slot
- `POST /api/time-slots`
  - Single slot:
    ```json
    {
        "consultant_id": "uuid",
        "start_time": "2025-03-15T14:00:00Z",
        "end_time": "2025-03-15T15:00:00Z"
    }
    ```
  - Recurring slot:
    ```json
    {
        "consultant_id": "uuid",
        "start_time": "15:00",  // Time-only format for recurring slots
        "end_time": "16:00",
        "recurring": {
            "frequency": "weekly|monthly",
            "day_of_week": 0-6,  // for weekly
            "day_of_month": 1-31,  // for monthly
            "until": "2025-04-15T00:00:00Z"
        }
    }
    ```

#### Get Time Slots
- `GET /api/time-slots`
  - Query Parameters:
    - `consultant_id` (UUID)
    - `date` (YYYY-MM-DD)
    - `month` (YYYY-MM)
    - `start_date` (YYYY-MM-DD)
    - `end_date` (YYYY-MM-DD)
    - `page` (default: 1)
    - `limit` (default: 20, max: 100)

#### Reserve Time Slot
- `POST /api/time-slots/:slotId/reserve`
  ```json
  {
      "customer_id": "uuid"
  }
  ```

#### Delete Time Slot
```http
DELETE /api/time-slots/:slotId
```
- Deletes unreserved slots
- Prevents deletion of booked slots

## Data Validation

### Success Response
```json
{
    "success": true,
    "data": {
        "time_slots": [...],
        "pagination": {
            "current_page": 1,
            "total_pages": 5,
            "total_items": 100,
            "limit": 20
        }
    }
}
```

The API returns consistent error responses:
```json
{
  "success": false,
  "error": "Error message",
  "details": "Detailed error description"
}
```

## Error Handling

The API returns appropriate HTTP status codes:
- 200: Success
- 201: Created
- 400: Bad Request (Invalid input)
- 404: Not Found
- 409: Conflict (e.g., overlapping slots)
- 500: Server Error

## Database Schema

### time_slots
- id (UUID)
- consultant_id (UUID)
- customer_id (UUID, nullable)
- start_time (TIMESTAMP)
- end_time (TIMESTAMP)
- is_booked (BOOLEAN)
- recurring_pattern_id (UUID, nullable)
- created_at (TIMESTAMP)
- updated_at (TIMESTAMP)

### recurring_patterns
- id (UUID)
- frequency (VARCHAR)
- day_of_week (INTEGER)
- day_of_month (INTEGER)
- until_date (TIMESTAMP)
- created_at (TIMESTAMP)
- updated_at (TIMESTAMP)

## Future Improvements

- Authentication and authorization
- Rate limiting
- Caching for frequently accessed data
- Advanced filtering options
- Webhook notifications
- Bulk operations
- Metrics and monitoring

## Testing

The project includes comprehensive tests:
- Unit tests
- Integration tests
- Edge case handling
- Concurrency tests
- Validation tests

Run tests with:
```bash
npm test
```

## License

MIT

## Time Zone Handling

### Overview
The application handles time slots in UTC (Coordinated Universal Time) to ensure consistency across different time zones.

### Time Input Formats

1. **Non-Recurring Time Slots**
   ```json
   {
     "start_time": "2025-09-11T16:00:00Z",  // ISO 8601 with UTC indicator (Z)
     "end_time": "2025-09-11T17:00:00Z"
   }
   ```
   - Must include 'Z' suffix to indicate UTC
   - Times are stored directly as UTC in database
   - No timezone conversion is performed

2. **Recurring Time Slots**
   ```json
   {
     "start_time": "16:00",  // 24-hour format (HH:mm)
     "end_time": "17:00",
     "recurring": {
       "frequency": "weekly",
       "day_of_week": 3,     // 0 = Sunday, 6 = Saturday
       "until": "2025-10-19T00:00:00Z"
     }
   }
   ```
   - Simple time format (HH:mm) is interpreted as UTC
   - No timezone conversion is performed
   - 'until' date must be in ISO 8601 UTC format

### Important Notes

1. **All times are stored and returned in UTC**
   - Database stores times in UTC
   - API responses include UTC times with 'Z' suffix
   - No automatic timezone conversion

2. **Client Responsibility**
   - Clients must convert local times to UTC before sending
   - Clients must convert UTC to local time when displaying

3. **Examples**
   ```javascript
   // Client-side conversion to UTC
   const localTime = new Date('2025-09-11T12:00:00');
   const utcTime = localTime.toISOString(); // "2025-09-11T16:00:00Z"

   // Client-side conversion from UTC
   const utcResponse = "2025-09-11T16:00:00Z";
   const localTime = new Date(utcResponse).toLocaleString();
   ```

4. **Daylight Saving Time (DST)**
   - UTC times remain consistent during DST changes
   - Clients must handle DST conversions locally

### Best Practices

1. Always send times in UTC format with 'Z' suffix
2. For recurring slots, use 24-hour format without timezone
3. Handle all timezone conversions on the client side
4. Test across DST transitions
5. Validate timezone handling in your client application


