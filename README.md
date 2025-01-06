# Scheduling API

A REST API for managing consultant scheduling and appointments, supporting both single and recurring time slots.

## Features

- Create single and recurring time slots
- Book appointments
- View available time slots with filtering options
- Delete time slots (single or recurring)
- Pagination support
- Transaction-based operations
- Input validation
- Overlap prevention

## Prerequisites

- Node.js (v14 or higher)
- PostgreSQL (v12 or higher)
- npm or yarn

## Setup

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

Create `.env` file:

```env
DATABASE_URL=postgresql://postgres:your_password@localhost:5432/timeslots
PORT=3000
DB_USER=postgres
DB_PASSWORD=your_password
DB_HOST=localhost
DB_PORT=5432
DB_NAME=timeslots
```

4. Initialize the database:

```bash
psql -U postgres -c "CREATE DATABASE timeslots"
psql timeslots -f src/db/init.sql
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
        "start_time": "2025-03-15T14:00:00Z",
        "end_time": "2025-03-15T15:00:00Z",
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
- `DELETE /api/time-slots/:slotId`
  - Deletes single slot or all future instances of recurring slot

## Response Formats

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

### Error Response
```json
{
    "success": false,
    "error": "Error message",
    "details": "Detailed error message"
}
```

## Development

The project uses:
- Express.js for the API server
- PostgreSQL for data storage
- express-validator for input validation
- Transaction support for data integrity

## Error Handling

The API returns appropriate HTTP status codes:
- 200: Success
- 201: Created
- 400: Bad Request
- 404: Not Found
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

## License

MIT


