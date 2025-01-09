# Time Slots API Documentation

## Overview
RESTful API for managing consultant time slots. Built with Express.js and PostgreSQL.

## Base URL
```
http://localhost:3000/api
```

## Time Handling
- All times should be sent in ISO8601 format
- Times can include timezone offset or use the timezone parameter
- All responses return times in UTC (ISO8601 with Z suffix)
- Client should handle timezone conversion for display
- DST transitions are handled automatically

## Endpoints

### 1. Create Time Slot
Create a single or recurring time slot for a consultant.

```javascript
POST /time-slots

// Request
{
  consultant_id: string,    // Valid consultant UUID (required)
  start_time: string,      // "2025-03-26T08:00:00" or "2025-03-26T08:00:00+05:30"
  end_time: string,        // "2025-03-26T09:00:00" or "2025-03-26T09:00:00+05:30"
  timezone?: string,       // e.g., "Asia/Kolkata" (optional if offset provided in times)
  recurring?: {
    frequency: "weekly" | "monthly",
    until: string         // ISO8601 date
  }
}

// Example
{
  "consultant_id": "valid-consultant-uuid",  // Must exist in database
  "start_time": "2025-03-26T08:00:00",
  "end_time": "2025-03-26T09:00:00",
  "timezone": "Asia/Kolkata"
}

// Response
{
  success: true,
  message: "Time slot created",
  data: {
    id: string,           // Generated UUID
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

### 2. Get Time Slots
Retrieve time slots with pagination and filtering options.

```javascript
GET /time-slots

// Query Parameters
{
  consultant_id?: string,  // Valid consultant UUID (optional)
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
      id: string,           // UUID
      consultant_id: string,
      customer_id: string | null,
      start_time: string,   // UTC ISO8601
      end_time: string,     // UTC ISO8601
      is_booked: boolean,
      consultant_name: string,
      customer_name: string | null,
      created_at: string,   // UTC timestamp
      updated_at: string    // UTC timestamp
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

### 3. Reserve Time Slot
Book a time slot for a customer.

```javascript
POST /time-slots/:slotId/reserve

// URL Parameters
slotId: string            // Valid time slot UUID

// Request Body
{
  customer_id: string     // Valid customer UUID (required)
}

// Response
{
  success: true,
  data: {
    id: string,           // Time slot UUID
    consultant_id: string,
    customer_id: string,
    start_time: string,   // UTC ISO8601
    end_time: string,     // UTC ISO8601
    is_booked: true,
    updated_at: string    // UTC timestamp
  }
}
```

### 4. Delete Time Slot
Delete an unbooked time slot.

```javascript
DELETE /time-slots/:slotId

// URL Parameters
slotId: string            // Valid time slot UUID

// Response
{
  success: true,
  message: "Time slot deleted successfully"
}
```

## Timezone Examples

### Example 1: Using Timezone Parameter
```javascript
// Request
{
  "consultant_id": "valid-consultant-uuid",
  "start_time": "2025-03-26T08:00:00",    // Local time
  "end_time": "2025-03-26T09:00:00",      // Local time
  "timezone": "Asia/Kolkata"              // IST (+5:30)
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

### Example 2: Using ISO8601 with Offset
```javascript
// Request
{
  "consultant_id": "valid-consultant-uuid",
  "start_time": "2025-03-26T08:00:00+05:30",  // IST with offset
  "end_time": "2025-03-26T09:00:00+05:30"     // IST with offset
}

// Response same as Example 1
```

## Error Handling

### Error Response Format
```javascript
{
  success: false,
  error: string,     // Error message
  details?: string   // Additional error details if available
}
```

### Common Error Codes
| Code | Description | Example Scenario |
|------|-------------|-----------------|
| 400  | Bad Request | Invalid UUID format, Invalid time format |
| 404  | Not Found   | Time slot or consultant not found |
| 409  | Conflict    | Slot already booked, Overlapping slots |
| 500  | Server Error| Database connection failed |

## Important Notes
- All responses return times in UTC format
- Overlapping slots are not allowed for the same consultant
- Booked slots cannot be deleted
- Time slots must be created with valid consultant UUIDs
- Reservations must be made with valid customer UUIDs 