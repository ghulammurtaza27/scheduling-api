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

### consultants
- `id` (UUID, PRIMARY KEY, default: uuid_generate_v4())
- `name` (VARCHAR(255), NOT NULL)
- `email` (VARCHAR(255), UNIQUE, NOT NULL)
- `created_at` (TIMESTAMP, default: CURRENT_TIMESTAMP)

### customers
- `id` (UUID, PRIMARY KEY, default: uuid_generate_v4())
- `name` (VARCHAR(255), NOT NULL)
- `email` (VARCHAR(255), UNIQUE, NOT NULL)
- `created_at` (TIMESTAMP, default: CURRENT_TIMESTAMP)

### recurring_patterns
- `id` (UUID, PRIMARY KEY, default: uuid_generate_v4())
- `frequency` (VARCHAR(10), NOT NULL) - 'weekly' or 'monthly'
- `day_of_week` (INTEGER, nullable) - 0-6 for weekly patterns
- `day_of_month` (INTEGER, nullable) - 1-31 for monthly patterns
- `until_date` (TIMESTAMP, NOT NULL)
- `created_at` (TIMESTAMP, default: CURRENT_TIMESTAMP)
- `updated_at` (TIMESTAMP, default: CURRENT_TIMESTAMP)

### time_slots
- `id` (UUID, PRIMARY KEY, default: uuid_generate_v4())
- `consultant_id` (UUID, NOT NULL, FOREIGN KEY)
- `customer_id` (UUID, nullable, FOREIGN KEY)
- `start_time` (TIMESTAMP, NOT NULL)
- `end_time` (TIMESTAMP, NOT NULL)
- `is_booked` (BOOLEAN, default: false)
- `is_cancelled` (BOOLEAN, default: false)
- `cancelled_at` (TIMESTAMP, nullable)
- `recurring_pattern_id` (UUID, nullable, FOREIGN KEY)
- `created_at` (TIMESTAMP, default: CURRENT_TIMESTAMP)
- `updated_at` (TIMESTAMP, default: CURRENT_TIMESTAMP)

### Constraints
- `check_frequency`: frequency IN ('weekly', 'monthly')
- `check_day_of_week`: day_of_week >= 0 AND day_of_week <= 6
- `check_day_of_month`: day_of_month >= 1 AND day_of_month <= 31
- `check_times`: end_time > start_time

### Relationships
- `time_slots.consultant_id` → `consultants.id`
- `time_slots.customer_id` → `customers.id`
- `time_slots.recurring_pattern_id` → `recurring_patterns.id`

### Indexes
- `idx_time_slots_consultant` on `time_slots(consultant_id)`
- `idx_time_slots_customer` on `time_slots(customer_id)`
- `idx_time_slots_start_time` on `time_slots(start_time)`
- `idx_time_slots_recurring` on `time_slots(recurring_pattern_id)`

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
The application handles time slots in UTC (Coordinated Universal Time) to ensure consistency across different time zones, including proper handling of Daylight Saving Time (DST) transitions.

### Time Input Formats

1. **Time Slots**
   ```json
   {
     "consultant_id": "uuid",
     "start_time": "2025-03-15T14:00:00Z",
     "end_time": "2025-03-15T15:00:00Z"
   }
   ```
   - Times must be in ISO 8601 format with UTC indicator (Z)
   - Times are stored in UTC in database
   - DST transitions are handled automatically

2. **Recurring Time Slots**
   ```json
   {
     "consultant_id": "uuid",
     "start_time": "2025-03-15T14:00:00Z",
     "end_time": "2025-03-15T15:00:00Z",
     "recurring": {
       "frequency": "weekly|monthly",
       "until": "2025-04-15T00:00:00Z"
     }
   }
   ```

### Important Notes

1. **All times are in UTC**
   - Database stores times in UTC
   - API accepts and returns UTC times
   - DST transitions are handled internally

2. **Client Responsibility**
   - Convert local times to UTC before sending
   - Convert UTC to local time when displaying

3. **DST Handling**
   - System maintains consistent durations across DST changes
   - Warnings are provided for slots spanning DST transitions
   - Recurring slots maintain their local time across DST boundaries

4. **Best Practices**
   - Always use ISO 8601 format with 'Z' suffix
   - Test bookings across DST transitions
   - Handle timezone conversions client-side


