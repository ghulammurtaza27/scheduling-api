# Time Slots API Documentation

## Overview
RESTful API for managing consultant time slots. Built with Express.js and PostgreSQL.

## Base URL
```
http://localhost:3000/api
```

## Time Formats
- All times should be sent in ISO8601 format
- Times can include timezone offset or use the timezone parameter
- All responses return times in UTC (ISO8601 with Z suffix)

## Endpoints

### Create Time Slot
```javascript
POST /time-slots

// Request
{
  consultant_id: string,    // UUID
  start_time: string,      // "2025-03-26T08:00:00" or "2025-03-26T08:00:00+05:30"
  end_time: string,        // "2025-03-26T09:00:00" or "2025-03-26T09:00:00+05:30"
  timezone?: string,       // e.g., "Asia/Kolkata" (optional if offset provided in times)
  recurring?: {
    frequency: "weekly" | "monthly",
    until: string         // ISO8601 date
  }
}

// Response
{
  success: true,
  message: "Time slot created",
  data: {
    id: string,           // UUID
    consultant_id: string,
    customer_id: null,
    start_time: string,   // UTC ISO8601 "2025-03-26T02:30:00.000Z"
    end_time: string,     // UTC ISO8601 "2025-03-26T03:30:00.000Z"
    is_booked: boolean,
    is_cancelled: boolean,
    cancelled_at: string | null,
    created_at: string,   // UTC timestamp
    updated_at: string    // UTC timestamp
  }
}
```

### Get Time Slots
```javascript
GET /time-slots

// Query Parameters
{
  consultant_id?: string,  // UUID
  start_date?: string,    // YYYY-MM-DD
  end_date?: string,      // YYYY-MM-DD
  month?: string,         // YYYY-MM
  page?: number,          // default: 1
  limit?: number          // default: 20, max: 100
}

// Response
{
  success: true,
  data: {
    time_slots: [{
      id: string,
      consultant_id: string,
      customer_id: string | null,
      start_time: string,        // UTC ISO8601
      end_time: string,          // UTC ISO8601
      is_booked: boolean,
      consultant_name: string,
      customer_name: string | null,
      created_at: string,
      updated_at: string
    }],
    pagination: {
      current_page: number,
      total_pages: number,
      total_items: number,
      limit: number
    }
  }
}
```

### Reserve Time Slot
```javascript
POST /time-slots/:slotId/reserve

// Request
{
  customer_id: string  // UUID
}

// Response
{
  success: true,
  data: {
    id: string,
    consultant_id: string,
    customer_id: string,
    start_time: string,   // UTC ISO8601
    end_time: string,     // UTC ISO8601
    is_booked: true,
    updated_at: string
  }
}
```

### Delete Time Slot
```javascript
DELETE /time-slots/:slotId

// Response
{
  success: true,
  message: "Time slot deleted successfully"
}
```

## Time Zone Examples

### Using Timezone Parameter
```javascript
// Request
{
  "consultant_id": "27146189-b9e6-4654-8f06-b0206b0ba886",
  "start_time": "2025-03-26T08:00:00",  // Local time
  "end_time": "2025-03-26T09:00:00",    // Local time
  "timezone": "Asia/Kolkata"            // IST (+5:30)
}

// Response
{
  "success": true,
  "data": {
    "start_time": "2025-03-26T02:30:00.000Z",  // Converted to UTC
    "end_time": "2025-03-26T03:30:00.000Z"     // Converted to UTC
  }
}
```

### Using ISO8601 with Offset
```javascript
// Request
{
  "consultant_id": "27146189-b9e6-4654-8f06-b0206b0ba886",
  "start_time": "2025-03-26T08:00:00+05:30",  // IST with offset
  "end_time": "2025-03-26T09:00:00+05:30"     // IST with offset
}

// Response same as above
```

## Error Responses
```javascript
{
  success: false,
  error: string,     // Error message
  details?: string   // Additional error details if available
}
```

### Common Error Codes
- 400: Bad Request (validation errors)
- 404: Not Found
- 409: Conflict (e.g., slot already booked)
- 500: Internal Server Error

## Notes
- All times are stored and returned in UTC
- Client should handle timezone conversion for display
- DST transitions are handled automatically
- Overlapping slots are not allowed for the same consultant 