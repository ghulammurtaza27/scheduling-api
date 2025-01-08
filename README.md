# 🗓️ Scheduling API

> A RESTful API for managing consultant time slots, built with Node.js, Express, and PostgreSQL.

## 🚀 Quick Start

### Prerequisites
- Node.js (v14+)
- PostgreSQL (v12+)
- npm or yarn

### Installation

1️⃣ Clone and enter repository
```bash
git clone <repository-url>
cd scheduling-api
```

2️⃣ Install dependencies
```bash
npm install
```

3️⃣ Configure environment
```bash
cp .env.example .env
# Edit .env with your database credentials
```

4️⃣ Initialize database
```bash
psql -U postgres -c "CREATE DATABASE timeslots"
psql timeslots -f src/db/init.sql
```

### Running the App

```bash
npm run dev    # Development
npm start      # Production
npm test       # Run tests
```

## 📚 API Reference

### Time Slots

#### ✨ Create Single Slot
```http
POST /api/time-slots
```
```json
{
  "consultant_id": "uuid",
  "start_time": "2025-03-15T14:00:00Z",
  "end_time": "2025-03-15T15:00:00Z"
}
```

#### 🔄 Create Recurring Slot
```http
POST /api/time-slots
```
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

#### 🔍 Get Time Slots
```http
GET /api/time-slots
```
Query Parameters:
- `consultant_id` (UUID)
- `start_date` (YYYY-MM-DD)
- `end_date` (YYYY-MM-DD)
- `month` (YYYY-MM)
- `page` (default: 1)
- `limit` (default: 20, max: 100)

#### ✅ Reserve Slot
```http
POST /api/time-slots/:slotId/reserve
```
```json
{
  "customer_id": "uuid"
}
```

#### ❌ Delete Slot
```http
DELETE /api/time-slots/:slotId
```
> Note: Cannot delete booked slots

## 💡 Response Examples

### ✅ Success
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

### ❌ Error
```json
{
  "success": false,
  "error": "Error message",
  "details": "Detailed error description"
}
```

## 🌐 Time Zone Handling

### Key Points
- All times are in UTC (ISO 8601 format with Z suffix)
- Times stored in UTC in database
- DST transitions handled automatically
- System maintains consistent durations across DST changes

### Client Responsibilities
- Convert local times to UTC before sending
- Convert UTC to local time when displaying
- Handle timezone conversions client-side

## 🗄️ Database Schema

### Core Tables
- `consultants`
- `customers`
- `time_slots`
- `recurring_patterns`

> See `src/db/init.sql` for complete schema

## 🧪 Testing

Comprehensive test suite includes:
- ✅ Unit tests
- 🔄 Integration tests
- 🌐 DST transition tests
- ✨ Validation tests
- 🔄 Concurrency tests

## ⚠️ Error Codes

| Code | Description |
|------|-------------|
| 200  | Success     |
| 201  | Created     |
| 400  | Bad Request |
| 404  | Not Found   |
| 409  | Conflict    |
| 500  | Server Error|

## 📄 License

MIT


