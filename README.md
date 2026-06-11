# ✈ Travel Explorer API — Budget Tracker

A full-stack travel budget management application with a rich frontend UI and a Node.js backend that supports multiple databases.

---

## Features

- **Trip Management** — Create, view, edit, delete trips with destination, dates, currency, and budget
- **Expense Tracking** — Record expenses by category: Accommodation, Food, Transport, Shopping, Activities, Health, Communication, Visa, Insurance, and more
- **Budget Monitoring** — Real-time budget vs. spent progress bars per trip
- **Analytics Dashboard** — Interactive donut chart, category bar chart, daily spending breakdown
- **Multi-Database Support** — MongoDB, PostgreSQL, MySQL, or in-memory (no DB needed for demos)
- **Responsive Design** — Works on desktop and mobile

---

## Quick Start (No Database)

```bash
# 1. Install dependencies
npm install

# 2. Start the server (uses in-memory store — data lost on restart)
npm start

# 3. Open browser
open http://localhost:3000
```

---

## Setup with a Database

### MongoDB
```bash
# Copy and edit env
cp .env.example .env

# Edit .env:
DB_TYPE=mongodb
MONGODB_URI=mongodb://localhost:27017/travel_explorer

npm start
```

### PostgreSQL
```bash
# Edit .env:
DB_TYPE=postgres
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=travel_explorer
POSTGRES_USER=postgres
POSTGRES_PASSWORD=your_password

npm start
```

### MySQL
```bash
# Edit .env:
DB_TYPE=mysql
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_DB=travel_explorer
MYSQL_USER=root
MYSQL_PASSWORD=your_password

npm start
```

---

## Project Structure

```
travel-explorer/
├── server.js               # Express entry point
├── package.json
├── .env.example            # Environment template
├── config/
│   └── database.js         # Multi-DB connection manager
├── models/
│   ├── mongoModels.js       # Mongoose schemas (Trip + Expense)
│   └── inMemoryStore.js     # In-memory fallback store
├── routes/
│   ├── trips.js             # CRUD for trips
│   └── expenses.js          # CRUD + analytics for expenses
```

---

## API Reference

### Trips
| Method | Endpoint         | Description          |
|--------|-----------------|----------------------|
| GET    | /trips       | List all trips       |
| GET    | /trips/:id   | Get single trip      |
| POST   | /trips       | Create trip          |
| PUT    | /trips/:id   | Update trip          |
| DELETE | /trips/:id   | Delete trip + expenses |

### Expenses
| Method | Endpoint                        | Description             |
|--------|---------------------------------|-------------------------|
| GET    | /expenses?tripId=xxx         | List trip expenses      |
| GET    | /expenses/summary/:tripId    | Spending summary/analytics |
| POST   | /expenses                    | Add expense             |
| PUT    | /expenses/:id                | Update expense          |
| DELETE | /expenses/:id                | Delete expense          |

### Other
| Method | Endpoint    | Description     |
|--------|-------------|-----------------|
| GET    | /health  | Server health   |

---

## Expense Categories

- 🏨 Accommodation
- 🍜 Food & Drink
- 🚗 Transport
- 🛍 Shopping
- 🎯 Activities
- 💊 Health
- 📱 Communication
- 🛂 Visa & Fees
- 🛡 Insurance
- 📦 Other

## Supported Currencies

USD, EUR, GBP, AUD, NZD, JPY, CAD, SGD, THB, IDR, MYR, PHP, VND, INR, CNY, HKD, KRW

---

## Tech Stack

- **Backend**: Node.js, Express.js
- **Databases**: MongoDB (Mongoose), PostgreSQL (Sequelize), MySQL (Sequelize)
- **Frontend**: Vanilla HTML, CSS, JavaScript
- **Fonts**: Playfair Display, DM Sans, Space Mono
