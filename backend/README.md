# iCaddie Backend API

NestJS backend application for the iCaddie golf caddie system with RAG (Retrieval-Augmented Generation) capabilities and golf course data management.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Environment Variables](#environment-variables)
- [Installation](#installation)
- [Database Setup](#database-setup)
- [Running the Application](#running-the-application)
- [Data Seeding](#data-seeding)
- [Docker Deployment](#docker-deployment)
- [Production Deployment](#production-deployment)
- [API Documentation](#api-documentation)

## Prerequisites

- **Node.js**: v18.x or higher
- **Npm**: v1.22.x or higher
- **PostgreSQL**: 14+ with pgvector extension
- **Redis**: 7.x or higher
- **Docker & Docker Compose**: (optional, for containerized deployment)
- **OpenAI API Key**: For embeddings generation

## Environment Variables

Create a `.env` file in the `backend` directory with the following variables:

```env
# Database Configuration
DATABASE_URL="postgresql://postgres:password@localhost:8020/golf?schema=public"

# Redis Configuration
REDIS_URL="redis://localhost:6379"

# OpenAI API Key (Required for RAG functionality)
OPENAI_API_KEY="your-openai-api-key-here"

# Application Configuration
PORT=8010
NODE_ENV=development
API_VERSION=v1

# JWT Configuration (if using authentication)
JWT_SECRET="your-jwt-secret-key"
JWT_EXPIRES_IN="7d"

# FastAPI Prediction Engine (if using external service)
FASTAPI_ADDRESS="http://localhost:8000"
```

### Environment Variables Reference

| Variable          | Required | Description                   | Default                  |
| ----------------- | -------- | ----------------------------- | ------------------------ |
| `DATABASE_URL`    | Yes      | PostgreSQL connection string  | -                        |
| `REDIS_URL`       | Yes      | Redis connection string       | `redis://localhost:6379` |
| `OPENAI_API_KEY`  | Yes      | OpenAI API key for embeddings | -                        |
| `PORT`            | No       | Application port              | `8010`                   |
| `NODE_ENV`        | No       | Environment mode              | `development`            |
| `API_VERSION`     | No       | API version prefix            | `v1`                     |
| `JWT_SECRET`      | No       | JWT signing secret            | -                        |
| `JWT_EXPIRES_IN`  | No       | JWT expiration time           | `7d`                     |
| `FASTAPI_ADDRESS` | No       | Prediction engine API URL     | `http://localhost:8000`  |

## Installation

```bash
# Install dependencies

npm install
```

## Database Setup

### 1. Initialize PostgreSQL with pgvector

The application uses PostgreSQL with the `pgvector` extension for vector similarity search.

```bash
# Option A: Using Docker Compose (Recommended for development)
docker-compose up postgres-db -d

# Option B: Manual PostgreSQL setup
# Install pgvector extension in your PostgreSQL instance
# Then run the initialization script:
npx prisma db execute --file scripts/init-pgvector.sql
```

### 2. Initialize Database Schema

```bash
# Generate Prisma client
npx prisma generate

```

## Running the Application

### Development Mode

```bash
# Start with hot-reload

npm run start:dev
```

The application will be available at `http://localhost:8010`

### Production Mode

```bash
# Build the application
npm run build

# Start production server
npm run start:prod
```

## Data Seeding

### Seed Golf Rules Data

Load golf rules from JSON files into the database with embeddings:

```bash
# Load rules from default directory
ts-node scripts/load-rules-data.ts sample_data/golf_rules_full_json_3_Dec
```

**Note**: This script requires:

- `OPENAI_API_KEY` environment variable to be set
- `DATABASE_URL` environment variable to be set
- Database tables to be initialized (run `init-pgvector.sql` first)

### Seed Golf Course Data

Load golf course data from JSON files:

```bash
# Load course data
ts-node scripts/load-course-data.ts sample_data/igolf_data/Stadium_Bro_Hof_Slott_Golf_Club.json CmYDhdNfkEug "Stadium - Bro Hof Slott Golf Club"
```

**Note**: This script requires:

- `DATABASE_URL` environment variable to be set
- Database tables to be initialized (run `init-pgvector.sql` first)

### Alternative: Use API Endpoints

You can also seed data using the API endpoints:

```bash
# Seed rules via API
curl -X POST http://localhost:8010/api/v1/rules/load-from-json

# Load course via API
curl -X POST http://localhost:8010/api/v1/golf-caddie/load-course-from-json \
  -H "Content-Type: application/json" \
  -d '{
    "filePath": "sample_data/igolf_data/Stadium_Bro_Hof_Slott_Golf_Club.json",
    "courseId": "CmYDhdNfkEug",
    "courseName": "Stadium - Bro Hof Slott Golf Club"
  }'
```

## Docker Deployment

### Development with Docker Compose

```bash
# Start all services (PostgreSQL, Redis)
docker-compose up -d

# Start application in development mode
npm run start:dev
```

### Docker Compose Services

- **postgres-db**: PostgreSQL 14+ with pgvector extension (Port: 8020)
- **redis**: Redis 7-alpine (Port: 6379)

### Custom Docker Build

```bash
# Build custom image
docker build -f Dockerfile.dev -t icaddie-backend:dev .

# Run container
docker run -p 8010:8010 \
  -e DATABASE_URL="postgresql://postgres:password@host.docker.internal:8020/golf" \
  -e REDIS_URL="redis://host.docker.internal:6379" \
  -e OPENAI_API_KEY="your-key" \
  icaddie-backend:dev
```

## Production Deployment

### 1. Build Application

```bash
# Install dependencies
npm install --frozen-lockfile

# Build TypeScript
npm run build
```

### 2. Environment Configuration

Ensure all required environment variables are set in your production environment:

```bash
# Required variables
export DATABASE_URL="postgresql://user:pass@host:5432/golf"
export REDIS_URL="redis://host:6379"
export OPENAI_API_KEY="your-openai-key"
export NODE_ENV="production"
export PORT="8010"
export API_VERSION="v1"
```

### 3. Database Migration

```bash
# Run database initialization
npx prisma db execute --file scripts/init-pgvector.sql

# Generate Prisma client
npx prisma generate
```

### 4. Seed Initial Data

```bash
# Seed golf rules (requires OPENAI_API_KEY)
ts-node scripts/load-rules-data.ts sample_data/golf_rules_full_json_3_Dec

# Seed golf courses
ts-node scripts/load-course-data.ts sample_data/igolf_data/Stadium_Bro_Hof_Slott_Golf_Club.json CmYDhdNfkEug "Course Name"
```

### 5. Start Application

```bash
# Using PM2 (recommended)
pm2 start dist/main.js --name icaddie-backend

# Or using systemd
# Create service file: /etc/systemd/system/icaddie-backend.service
# Then:
sudo systemctl start icaddie-backend
sudo systemctl enable icaddie-backend
```

### 6. Health Checks

```bash
# Check application health
curl http://localhost:8010/api/v1/rules/health

# Check API documentation
curl http://localhost:8010/api/docs
```

## API Documentation

Once the application is running, API documentation is available at:

- **Swagger UI**: `http://localhost:8010/api/docs`
- **JSON Schema**: `http://localhost:8010/api/docs-json`

## Troubleshooting

### Database Connection Issues

```bash
# Test PostgreSQL connection
psql $DATABASE_URL

# Check pgvector extension
psql $DATABASE_URL -c "SELECT * FROM pg_extension WHERE extname = 'vector';"
```

### Redis Connection Issues

```bash
# Test Redis connection
redis-cli -u $REDIS_URL ping

# Check Redis keys
redis-cli -u $REDIS_URL keys "*"
```

### Embedding Generation Issues

- Verify `OPENAI_API_KEY` is set correctly
- Check OpenAI API rate limits
- Verify network connectivity to OpenAI API

### Common Issues

1. **"pgvector extension not found"**
   - Ensure PostgreSQL has pgvector extension installed
   - Run `scripts/init-pgvector.sql` to initialize

2. **"Redis connection error"**
   - Verify Redis is running: `docker-compose up redis -d`
   - Check `REDIS_URL` environment variable

3. **"OPENAI_API_KEY not set"**
   - Set the environment variable before running scripts or application
   - For scripts: `export OPENAI_API_KEY="your-key"`

## Development Scripts

```bash
# Development
npm run start:dev          # Start with hot-reload
npm run start:debug       # Start with debugger

# Building
npm run build              # Build for production
npm run start:prod         # Start production build


# Database
npx prisma generate     # Generate Prisma client

```

## Support

For issues and questions:

- Check the [scripts/README.md](scripts/README.md) for detailed setup instructions
- Review API documentation at `/api/docs`
- Check application logs in `logs/` directory
