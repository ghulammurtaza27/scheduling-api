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
  "start_time": "2025-03-15T14:00:00+00:00",
  "end_time": "2025-03-15T15:00:00+00:00",
  "timezone": "America/New_York"
}
```

#### 🔄 Create Recurring Slot
```http
POST /api/time-slots
```
```json
{
  "consultant_id": "uuid",
  "start_time": "2025-03-15T14:00:00+00:00",
  "end_time": "2025-03-15T15:00:00+00:00",
  "timezone": "America/New_York",
  "recurring": {
    "frequency": "weekly|monthly",
    "until": "2025-04-15T00:00:00+00:00"
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

Results are sorted by start_time in ascending order.

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

## 🌐 Time Zone Handling

### Key Points
- Accepts ISO8601 formatted times with timezone offsets
- Optional timezone parameter for explicit timezone handling
- Times stored in UTC in database
- DST transitions handled automatically
- System maintains consistent durations across DST changes

### Examples
```json
// New York time (EDT)
{
  "start_time": "2025-03-15T10:00:00-04:00",
  "end_time": "2025-03-15T11:00:00-04:00"
}

// Tokyo time (JST)
{
  "start_time": "2025-03-15T10:00:00+09:00",
  "end_time": "2025-03-15T11:00:00+09:00"
}

// With explicit timezone
{
  "start_time": "2025-03-15T10:00:00",
  "end_time": "2025-03-15T11:00:00",
  "timezone": "Asia/Tokyo"
}
```

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


