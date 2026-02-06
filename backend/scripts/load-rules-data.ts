/**
 * Script to load golf rules data from JSON files into database
 *
 * Usage:
 * ts-node scripts/load-rules-data.ts [directory-path] [--force]
 *
 * Example:
 * ts-node scripts/load-rules-data.ts sample_data/golf_rules_full_json_3_Dec
 * ts-node scripts/load-rules-data.ts sample_data/golf_rules_full_json_3_Dec --force
 *
 * Note: This script uses raw SQL queries and OpenAI embeddings. Make sure to:
 * 1. Run the SQL migration first:
 *    yarn prisma db execute --file scripts/init-pgvector.sql
 * 2. Set OPENAI_API_KEY in .env (or environment)
 * 3. Set DATABASE_URL in .env (or environment)
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import OpenAI from "openai";
import * as fs from "fs";
import * as path from "path";
import { loadGolfRulesFromJsonFiles } from "../src/modules/rag/utils/golf-rule-parser";
import { v4 as uuidv4 } from "uuid";
import { PrismaPg } from "@prisma/adapter-pg";

// Ensure we're in the backend directory
process.chdir(__dirname + "/..");

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("❌ DATABASE_URL environment variable is not set");
  process.exit(1);
}
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

// Initialize OpenAI for embeddings
const openaiApiKey = process.env.OPENAI_API_KEY;
if (!openaiApiKey) {
  console.error("❌ OPENAI_API_KEY environment variable is not set");
  process.exit(1);
}

const openai = new OpenAI({ apiKey: openaiApiKey });
const embeddingModel = "text-embedding-3-small";
const embeddingDimensions = 1536;

/**
 * Generate embeddings for multiple texts (batch)
 */
async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  const response = await openai.embeddings.create({
    model: embeddingModel,
    input: texts,
    dimensions: embeddingDimensions,
  });

  return response.data
    .sort((a, b) => a.index - b.index)
    .map((item) => item.embedding);
}

/**
 * Save a single rule document to database
 */
async function saveRule(rule: {
  id: string;
  title: string;
  content: string;
  category: string;
  tags: string[];
  embedding: number[];
  metadata?: Record<string, string>;
}): Promise<void> {
  const embeddingStr = rule.embedding ? `[${rule.embedding.join(",")}]` : null;

  await prisma.$executeRaw`
    INSERT INTO rule_documents (id, title, content, category, tags, embedding, metadata, created_at, updated_at)
    VALUES (
      ${rule.id}::uuid,
      ${rule.title},
      ${rule.content},
      ${rule.category},
      ${rule.tags},
      ${embeddingStr}::vector,
      ${rule.metadata ? JSON.stringify(rule.metadata) : null}::jsonb,
      NOW(),
      NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
      title = EXCLUDED.title,
      content = EXCLUDED.content,
      category = EXCLUDED.category,
      tags = EXCLUDED.tags,
      embedding = EXCLUDED.embedding,
      metadata = EXCLUDED.metadata,
      updated_at = NOW()
  `;
}

/**
 * Load and ingest golf rules from JSON files directory
 */
async function loadRulesData(
  directoryPath: string,
  forceReload: boolean = false
): Promise<{ count: number }> {
  try {
    console.log(`Loading rules data from: ${directoryPath}`);

    // Check if database already seeded
    const isSeeded = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint as count FROM rule_documents
    `;

    const existingCount = Number(isSeeded[0]?.count || 0);

    if (existingCount > 0 && !forceReload) {
      console.log(
        `⚠️  Database already contains ${existingCount} rules. Use --force to reload.`
      );
      return { count: existingCount };
    }

    if (forceReload && existingCount > 0) {
      console.log(`🗑️  Clearing existing ${existingCount} rules...`);
      await prisma.$executeRaw`DELETE FROM rule_documents`;
    }

    // Load and parse rules from JSON files
    console.log("📖 Parsing JSON files...");
    const rules = loadGolfRulesFromJsonFiles(directoryPath);
    console.log(`✓ Found ${rules.length} rules to process`);

    // Generate embeddings in batches
    console.log("🤖 Generating embeddings...");
    const batchSize = 100;
    let processedCount = 0;

    for (let i = 0; i < rules.length; i += batchSize) {
      const batch = rules.slice(i, i + batchSize);
      const textsForEmbedding = batch.map((r) => `${r.title}\n\n${r.content}`);

      console.log(
        `  Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(rules.length / batchSize)} (${batch.length} rules)...`
      );

      const embeddings = await generateEmbeddings(textsForEmbedding);

      // Save rules with embeddings
      for (let j = 0; j < batch.length; j++) {
        const rule = batch[j];
        const document = {
          id: uuidv4(),
          title: rule.title,
          content: rule.content,
          category: rule.category || "general",
          tags: rule.tags || [],
          embedding: embeddings[j],
          metadata: rule.metadata,
        };

        await saveRule(document);
        processedCount++;
      }

      console.log(`  ✓ Processed ${processedCount}/${rules.length} rules`);
    }

    console.log(
      `✅ Successfully loaded ${processedCount} rules into database!`
    );
    return { count: processedCount };
  } catch (error) {
    console.error("❌ Error loading rules data:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Get command line arguments
const args = process.argv.slice(2);
if (args.length < 1) {
  console.error(
    "Usage: ts-node scripts/load-rules-data.ts <directory-path> [--force]"
  );
  console.error(
    "Example: ts-node scripts/load-rules-data.ts sample_data/golf_rules_full_json_3_Dec"
  );
  process.exit(1);
}

const [directoryPath, forceFlag] = args;
const forceReload = forceFlag === "--force";

// Resolve directory path
const fullPath = path.resolve(process.cwd(), directoryPath);

if (!fs.existsSync(fullPath)) {
  console.error(`❌ Directory not found: ${fullPath}`);
  process.exit(1);
}

loadRulesData(fullPath, forceReload)
  .then((result) => {
    console.log(
      `\n✅ Script completed successfully. Loaded ${result.count} rules.`
    );
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ Script failed:", error);
    process.exit(1);
  });
