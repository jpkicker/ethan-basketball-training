# Deployment Guide - Ethan's Basketball Training App

## Railway Deployment (Recommended)

Railway offers the easiest deployment with free PostgreSQL included.

### Step 1: Create Railway Account
1. Go to [railway.app](https://railway.app)
2. Sign up with GitHub (recommended for easy deploys)

### Step 2: Create New Project
1. Click "New Project"
2. Select "Deploy from GitHub repo"
3. Choose the `ethan-basketball-training` repository
4. Railway will auto-detect the Node.js app

### Step 3: Add PostgreSQL Database
1. In your project, click "New"
2. Select "Database" → "PostgreSQL"
3. Railway automatically provisions the database
4. `DATABASE_URL` is auto-set in your environment

### Step 4: Configure Environment Variables
In Railway dashboard, go to your service → Variables:

```
JWT_SECRET=your-super-secret-key-change-this-in-production
PORT=3000
FRONTEND_URL=https://your-frontend-url.com
```

**Important:** Generate a secure JWT_SECRET. You can use:
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### Step 5: Configure Root Directory
Since the server is in a subfolder:
1. Go to Settings → Root Directory
2. Set to: `server`

### Step 6: Deploy
Railway will automatically deploy when you push to your main branch.

### Step 7: Update Frontend
After deployment, update `index.html`:

Find the API_BASE_URL line:
```javascript
const API_BASE_URL = window.location.hostname === 'localhost'
  ? 'http://localhost:3000/api'
  : 'https://your-railway-app.up.railway.app/api';
```

Replace `your-railway-app.up.railway.app` with your actual Railway URL.

---

## Local Development

### Prerequisites
- Node.js 18+
- PostgreSQL (or use Docker)

### Setup
1. Clone the repository
2. Copy environment file:
   ```bash
   cd server
   cp .env.example .env
   ```

3. Update `.env` with your local PostgreSQL URL:
   ```
   DATABASE_URL="postgresql://user:password@localhost:5432/ethan_training"
   JWT_SECRET=dev-secret-key
   ```

4. Install dependencies:
   ```bash
   npm install
   ```

5. Generate Prisma client and push schema:
   ```bash
   npm run db:generate
   npm run db:push
   ```

6. Start the server:
   ```bash
   npm run dev
   ```

7. Open `index.html` in a browser (or use a local server)

### Using Docker for PostgreSQL
```bash
docker run --name ethan-postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=ethan_training -p 5432:5432 -d postgres:15
```

Then use this DATABASE_URL:
```
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/ethan_training"
```

---

## API Endpoints

### Authentication
- `POST /api/auth/register` - Create account
- `POST /api/auth/login` - Login
- `GET /api/auth/me` - Get current user

### Training Days
- `GET /api/training/:date` - Get/create training day
- `PUT /api/training/:date` - Update training day
- `GET /api/training?start=&end=` - Get date range

### Activities
- `POST /api/training/:date/planned` - Add planned activity
- `DELETE /api/training/:date/planned/:id` - Remove planned
- `POST /api/training/:date/actual` - Log completion
- `PUT /api/training/:date/shooting` - Update shooting makes

### Stats
- `GET /api/stats/streak` - Current streak
- `GET /api/stats/summary` - Overall stats
- `GET /api/stats/weekly` - Weekly breakdown

---

## Troubleshooting

### "Cannot connect to database"
- Verify DATABASE_URL is correct
- Ensure PostgreSQL is running
- Check network/firewall settings

### "Invalid token"
- JWT_SECRET must match between server restarts
- Clear localStorage and re-login

### "CORS error"
- Add your frontend URL to FRONTEND_URL env var
- Ensure the server is running on the expected port
