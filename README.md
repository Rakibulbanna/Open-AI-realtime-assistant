# AI-realtime-assistant System for Golfers 

A full-stack golf caddie application with AI-powered shot recommendations, golf rules RAG (Retrieval-Augmented Generation), and interactive course mapping.

---

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              INTERNET                                        │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         NGINX (Reverse Proxy + SSL)                         │
│                              Port 80 / 443                                  │
└─────────────────────────────────────────────────────────────────────────────┘
                    │                                │
                    ▼                                ▼
┌──────────────────────────────┐    ┌──────────────────────────────────────────┐
│         FRONTEND             │    │              BACKEND (Main Service)       │
│    React + Vite + Tailwind   │    │              NestJS - Port 8010           │
│    (Static files or :5173)   │    │                                          │
│                              │    │  ┌─────────────────────────────────────┐ │
│  • Interactive course map    │    │  │  API Domains:                       │ │
│  • Shot visualization        │    │  │  • Auth API (JWT, Postgres-backed)  │ │
│  • Caddie recommendations    │    │  │  • RAG API (Golf Rules + pgvector)  │ │
│                              │    │  │  • Golf Caddie API                  │ │
└──────────────────────────────┘    │  └─────────────────────────────────────┘ │
                                    │                    │                     │
                                    │                    ▼                     │
                                    │  ┌─────────────────────────────────────┐ │
                                    │  │   Internal HTTP Call (not exposed)  │ │
                                    │  └─────────────────────────────────────┘ │
                                    └──────────────────────────────────────────┘
                                                         │
                                                         ▼
                                    ┌──────────────────────────────────────────┐
                                    │       PREDICTION ENGINE (Internal)       │
                                    │       Python FastAPI - Port 8001         │
                                    │                                          │
                                    │  • A* pathfinding for shot planning      │
                                    │  • Safe/Aggressive shot profiles         │
                                    │  • Lie classification                    │
                                    │                                          │
                                    │  ⚠️  INTERNAL ONLY - Called by NestJS    │
                                    │     NOT exposed to frontend/internet     │
                                    └──────────────────────────────────────────┘
                                                         
                    ┌────────────────────────────────────────────────────────┐
                    │                    DATA LAYER                          │
                    │                                                        │
                    │   ┌─────────────────────┐    ┌─────────────────────┐  │
                    │   │     PostgreSQL      │    │       Redis         │  │
                    │   │   Port 5432/8020    │    │     Port 6379       │  │
                    │   │                     │    │                     │  │
                    │   │  • pgvector ext.    │    │  • Session cache    │  │
                    │   │  • Rule embeddings  │    │  • API caching      │  │
                    │   │  • Course data      │    │                     │  │
                    │   │  • User auth        │    │                     │  │
                    │   └─────────────────────┘    └─────────────────────┘  │
                    └────────────────────────────────────────────────────────┘
```

---

## ⚠️ IMPORTANT: All Three Services Are Required

| Service | Technology | Port | Role | Exposed? |
|---------|-----------|------|------|----------|
| **Frontend** | React + Vite + Tailwind | 5173 (dev) / static files (prod) | Client-facing UI | ✅ Yes (via nginx) |
| **Backend** | NestJS (Node.js) | 8010 | **Main API Server** - handles ALL client requests | ✅ Yes (via nginx) |
| **Prediction Engine** | FastAPI (Python) | 8001 | Internal shot calculation service | ❌ No (internal only) |

### Data Flow
```
Client Browser → Nginx → NestJS Backend (8010) → Prediction Engine (8001)
                              ↓
                        PostgreSQL + Redis
```

**The NestJS backend is the gateway.** All frontend requests go through it. The Python prediction engine is an internal microservice that ONLY the NestJS backend communicates with.

---

## 📁 Repository Structure

```
iCaddie/
├── frontend/                 # React + Vite + Tailwind frontend
│   ├── src/
│   ├── package.json
│   └── vite.config.ts
│
├── backend/                  # NestJS backend (MAIN SERVICE)
│   ├── src/
│   │   ├── modules/
│   │   │   ├── golf-caddie/  # Golf caddie API
│   │   │   └── rag/          # Rules RAG API
│   │   └── main.ts
│   ├── prisma/
│   │   └── schema.prisma
│   ├── scripts/
│   │   ├── init-pgvector.sql
│   │   ├── load-rules-data.ts
│   │   └── load-course-data.ts
│   ├── sample_data/          # Golf rules & course data
│   ├── docker-compose.yml    # PostgreSQL + Redis
│   └── package.json
│
├── prediction-engine/        # Python FastAPI (internal service)
│   ├── main.py
│   ├── planner.py
│   ├── models.py
│   ├── requirements.txt
│   └── data/
│       └── golf_hcp20_distances_meters_%.xlsx
│
└── README.md                 # This file
```

---

## 🚀 Server Setup Guide (For DevOps)

### Prerequisites

| Requirement | Version | Purpose |
|-------------|---------|---------|
| Node.js | 18.x+ | Backend & Frontend build |
| npm | 9.x+ | Package management |
| Python | 3.10+ | Prediction engine |
| PostgreSQL | 14+ | Database with pgvector |
| Redis | 7.x | Caching |
| Nginx | Latest | Reverse proxy + SSL |

### Step 1: Clone Repository

```bash
git clone <repository-url> /home/devel/iCaddie
cd /home/devel/iCaddie
```

### Step 2: PostgreSQL Setup (with pgvector)

PostgreSQL must have the `pgvector` extension installed.

```bash
# Option A: Install pgvector on existing PostgreSQL
sudo apt install postgresql-14-pgvector  # or postgresql-17-pgvector

# Connect and enable extension
sudo -u postgres psql -d golf -c "CREATE EXTENSION IF NOT EXISTS vector;"

# Option B: Verify existing installation
psql -d golf -c "SELECT * FROM pg_extension WHERE extname = 'vector';"
```

**Database Initialization:**
```bash
cd /home/devel/iCaddie/backend

# Run the initialization script to create tables
psql -U postgres -d golf -f scripts/init-pgvector.sql
```

### Step 3: Redis Setup

```bash
# Install Redis
sudo apt install redis-server

# Start and enable
sudo systemctl start redis-server
sudo systemctl enable redis-server

# Verify
redis-cli ping  # Should return PONG
```

### Step 4: Backend Setup (NestJS - Port 8010)

```bash
cd /home/devel/iCaddie/backend

# Install dependencies
npm install

# Create environment file
cat > .env << 'EOF'
# Database
DATABASE_URL="postgresql://postgres:password@localhost:5432/golf?schema=public"

# Redis
REDIS_URL="redis://localhost:6379"

# OpenAI (Required for RAG embeddings)
OPENAI_API_KEY="your-openai-api-key"

# Application
PORT=8010
NODE_ENV=production
API_VERSION=v1

# JWT
JWT_SECRET="your-secure-jwt-secret-min-32-chars"
JWT_EXPIRES_IN="7d"

# Prediction Engine (internal service)
FASTAPI_ADDRESS="http://localhost:8001"
EOF

# Generate Prisma client
npx prisma generate

# Build the application
npm run build

# Seed data (requires OPENAI_API_KEY)
npx ts-node scripts/load-rules-data.ts sample_data/golf_rules_full_json_3_Dec
npx ts-node scripts/load-course-data.ts sample_data/igolf_data/Stadium_Bro_Hof_Slott_Golf_Club.json CmYDhdNfkEug "Stadium - Bro Hof Slott Golf Club"
```

**Run Backend:**
```bash
# Development
npm run start:dev

# Production (recommended with PM2)
npm install -g pm2
pm2 start dist/main.js --name icaddie-backend
pm2 save
pm2 startup
```

### Step 5: Prediction Engine Setup (Python - Port 8001)

```bash
cd /home/devel/iCaddie/prediction-engine

# Create virtual environment
python3 -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Run the service
python main.py
# OR with uvicorn directly:
uvicorn main:app --host 127.0.0.1 --port 8001
```

**Production (with PM2):**
```bash
# Create ecosystem file
cat > ecosystem.config.js << 'EOF'
module.exports = {
  apps: [{
    name: 'prediction-engine',
    script: 'main.py',
    interpreter: '/home/devel/iCaddie/prediction-engine/venv/bin/python',
    cwd: '/home/devel/iCaddie/prediction-engine',
    env: {
      HOST: '127.0.0.1',
      PORT: '8001'
    }
  }]
};
EOF

pm2 start ecosystem.config.js
pm2 save
```

### Step 6: Frontend Build (Production)

```bash
cd /home/devel/iCaddie/frontend

# Install dependencies
npm install

# Build for production
npm run build

# Output will be in dist/ directory
# Serve via nginx or other static file server
```

### Step 7: Nginx Configuration

Create `/etc/nginx/sites-available/icaddie`:

```nginx
server {
    listen 80;
    server_name devel.icaddie.se;
    
    # Redirect HTTP to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name devel.icaddie.se;

    # SSL Configuration (Let's Encrypt)
    ssl_certificate /etc/letsencrypt/live/devel.icaddie.se/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/devel.icaddie.se/privkey.pem;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;

    # Frontend - Static files
    location / {
        root /home/devel/iCaddie/frontend/dist;
        try_files $uri $uri/ /index.html;
        
        # Cache static assets
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
        }
    }

    # Backend API - Proxy to NestJS
    location /api/ {
        proxy_pass http://127.0.0.1:8010;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 300s;
    }

    # API Documentation
    location /api/docs {
        proxy_pass http://127.0.0.1:8010/api/docs;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
    }
}
```

**Enable and restart:**
```bash
sudo ln -s /etc/nginx/sites-available/icaddie /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

---

## 🔧 Environment Variables Reference

### Backend (.env)

| Variable | Required | Description | Default |
|----------|----------|-------------|---------|
| `DATABASE_URL` | ✅ Yes | PostgreSQL connection string | - |
| `REDIS_URL` | ✅ Yes | Redis connection string | `redis://localhost:6379` |
| `OPENAI_API_KEY` | ✅ Yes | OpenAI API key for embeddings | - |
| `FASTAPI_ADDRESS` | ✅ Yes | Prediction engine URL | `http://localhost:8001` |
| `PORT` | No | Backend port | `8010` |
| `NODE_ENV` | No | Environment mode | `development` |
| `JWT_SECRET` | Yes (for auth) | JWT signing key | - |
| `JWT_EXPIRES_IN` | No | Token expiry | `7d` |

---

## 📋 Service Management Commands

### Start All Services

```bash
# PostgreSQL (if using systemd)
sudo systemctl start postgresql

# Redis
sudo systemctl start redis-server

# Backend (NestJS)
pm2 start icaddie-backend

# Prediction Engine
pm2 start prediction-engine

# Check status
pm2 status
```

### View Logs

```bash
# Backend logs
pm2 logs icaddie-backend

# Prediction engine logs
pm2 logs prediction-engine

# All logs
pm2 logs

# Nginx logs
tail -f /var/log/nginx/access.log
tail -f /var/log/nginx/error.log
```

### Health Checks

```bash
# Backend health
curl http://localhost:8010/api/v1/rules/health

# Prediction engine health
curl http://localhost:8001/health

# PostgreSQL
psql -U postgres -d golf -c "SELECT 1;"

# Redis
redis-cli ping
```

---

## 🔄 CI/CD & Auto-Deploy

For automatic deployment on git push, create `/home/devel/deploy.sh`:

```bash
#!/bin/bash
set -e

cd /home/devel/iCaddie
git pull origin main

# Backend
cd /home/devel/iCaddie/backend
npm install --frozen-lockfile
npm run build
pm2 restart icaddie-backend

# Prediction Engine
cd /home/devel/iCaddie/prediction-engine
source venv/bin/activate
pip install -r requirements.txt
pm2 restart prediction-engine

# Frontend (if serving static files)
cd /home/devel/iCaddie/frontend
npm install --frozen-lockfile
npm run build

echo "Deployment complete!"
```

**Cron job for polling (every 5 minutes):**
```bash
*/5 * * * * /home/devel/check-and-deploy.sh >> /home/devel/deploy.log 2>&1
```

---

## 🐛 Troubleshooting

### Backend won't start
```bash
# Check if port is in use
lsof -i :8010

# Check environment variables
cat /home/devel/iCaddie/backend/.env

# Run in foreground for debugging
cd /home/devel/iCaddie/backend && npm run start:dev
```

### Prediction Engine connection failed
```bash
# Verify it's running
curl http://localhost:8001/health

# Check if backend can reach it
curl http://localhost:8001/docs
```

### Database connection issues
```bash
# Test connection
psql $DATABASE_URL

# Check pgvector
psql -U postgres -d golf -c "SELECT * FROM pg_extension WHERE extname = 'vector';"

# Verify tables exist
psql -U postgres -d golf -c "\dt"
```

### Redis connection issues
```bash
# Test Redis
redis-cli -u $REDIS_URL ping

# Check Redis is listening
netstat -tlnp | grep 6379
```

---

## 📚 API Documentation

Once backend is running, documentation is available at:

- **Swagger UI**: `https://devel.icaddie.se/api/docs`
- **Health Check**: `https://devel.icaddie.se/api/v1/rules/health`

---

## 📞 Support

For setup issues, contact the development team:
- Backend/Frontend: Shovon
- DevOps coordination: Magnus

---

## License

Proprietary - iCaddie
