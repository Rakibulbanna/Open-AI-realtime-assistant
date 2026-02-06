-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Create rule_documents table
CREATE TABLE IF NOT EXISTS "rule_documents" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "tags" TEXT[] NOT NULL DEFAULT '{}',
    "embedding" vector(1536),
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Drop existing index if it exists (to recreate with optimized parameters)
DROP INDEX IF EXISTS "rule_documents_embedding_idx";

-- Create optimized HNSW index for vector similarity search
-- Optimized parameters for better performance and accuracy:
-- m = 16: number of connections per layer (balance between accuracy and speed)
-- ef_construction = 64: size of candidate list during construction (higher = more accurate but slower inserts)
-- These parameters are optimized for read-heavy workloads with good accuracy
CREATE INDEX "rule_documents_embedding_idx" ON "rule_documents" 
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- Create index for category search
CREATE INDEX IF NOT EXISTS "rule_documents_category_idx" ON "rule_documents" ("category");

-- Create GIN index for tags array search
CREATE INDEX IF NOT EXISTS "rule_documents_tags_idx" ON "rule_documents" USING GIN ("tags");

-- Create composite index for title and content (for hybrid search keyword matching)
-- This helps with text-based searches when combined with vector search
CREATE INDEX IF NOT EXISTS "rule_documents_title_content_idx" ON "rule_documents" 
USING GIN (to_tsvector('swedish', title || ' ' || content));

-- Performance optimization: Set default ef_search parameter for HNSW queries
-- This controls the size of the candidate list during search (higher = more accurate but slower)
-- Note: This is a session-level setting, should be set per connection
-- Recommended value: 40-100 for good balance (default is 40)
-- You can set this in your connection pool configuration or per query:
-- SET hnsw.ef_search = 100;

-- Create golf_courses table
CREATE TABLE IF NOT EXISTS "golf_courses" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "course_id" TEXT NOT NULL UNIQUE,
    "name" TEXT,
    "data" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create index for course_id lookup
CREATE INDEX IF NOT EXISTS "golf_courses_course_id_idx" ON "golf_courses" ("course_id");

-- Create golf_course_holes table
CREATE TABLE IF NOT EXISTS "golf_course_holes" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "course_id" TEXT NOT NULL,
    "hole_number" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE("course_id", "hole_number")
);

-- Create indexes for golf_course_holes
CREATE INDEX IF NOT EXISTS "golf_course_holes_course_id_idx" ON "golf_course_holes" ("course_id");
CREATE INDEX IF NOT EXISTS "golf_course_holes_hole_number_idx" ON "golf_course_holes" ("hole_number");
CREATE INDEX IF NOT EXISTS "golf_course_holes_course_hole_idx" ON "golf_course_holes" ("course_id", "hole_number");

