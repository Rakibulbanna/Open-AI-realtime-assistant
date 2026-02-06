### Manual Commands

```bash
cd backend

# Step 1: Initialize indexes
yarn prisma db execute --file scripts/init-pgvector.sql

# Step 2: Update statistics
yarn prisma db execute --stdin --schema prisma/schema.prisma <<< "ANALYZE rule_documents;"

# Step 3 (Optional): Vacuum and Analyze (requires exclusive lock)
yarn prisma db execute --stdin --schema prisma/schema.prisma <<< "VACUUM ANALYZE rule_documents;"
```

### Load Golf Rules Data

```bash
cd backend

# Step 1: Initialize database tables (includes rule_documents table)
yarn prisma db execute --file scripts/init-pgvector.sql

# Step 2: Set OpenAI API key (required for embeddings)
export OPENAI_API_KEY="your-openai-api-key"

# Step 3: Load rules from JSON files (using script)
ts-node scripts/load-rules-data.ts sample_data/golf_rules_full_json_3_Dec

# Force reload (clears existing data)
ts-node scripts/load-rules-data.ts sample_data/golf_rules_full_json_3_Dec --force

# OR use the API endpoint:
# POST /api/v1/rules/load-from-json
```

### Load Golf Course Data

```bash
cd backend

# Step 1: Initialize database tables (includes golf course tables)
yarn prisma db execute --file scripts/init-pgvector.sql

# Step 2: Load course data from JSON file (using script)
ts-node scripts/load-course-data.ts sample_data/igolf_data/Stadium_Bro_Hof_Slott_Golf_Club.json CmYDhdNfkEug "Stadium - Bro Hof Slott Golf Club"

# OR use the API endpoint:
# POST /api/v1/golf-caddie/load-course-from-json
# Body: {
#   "filePath": "sample_data/igolf_data/Stadium_Bro_Hof_Slott_Golf_Club.json",
#   "courseId": "CmYDhdNfkEug",
#   "courseName": "Stadium - Bro Hof Slott Golf Club"
# }
```

### Redis Configuration

Redis is configured in docker-compose.yml. To start Redis:

```bash
docker-compose up redis -d
```

Or set `REDIS_URL` environment variable if Redis is not on localhost:6379:

```bash
export REDIS_URL=redis://localhost:6379
```
