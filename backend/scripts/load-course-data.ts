/**
 * Script to load golf course data from JSON file into database
 *
 * Usage:
 * ts-node scripts/load-course-data.ts <json-file-path> <course-id> [course-name]
 *
 * Example:
 * ts-node scripts/load-course-data.ts sample_data/igolf_data/Stadium_Bro_Hof_Slott_Golf_Club.json CmYDhdNfkEug "Stadium - Bro Hof Slott Golf Club"
 *
 * Note: This script uses raw SQL queries. Set DATABASE_URL in .env. Run the SQL migration first:
 * yarn prisma db execute --file scripts/init-pgvector.sql
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import * as fs from "fs";
import * as path from "path";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("❌ DATABASE_URL environment variable is not set");
  process.exit(1);
}
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

interface GolfCourseJsonData {
  vectorGPSObject: {
    Path?: any;
    Water?: any;
    Clubhouse?: any;
    Background?: any;
    Creek?: any;
    Tree?: any;
    Holes?: {
      Hole: Array<{
        HoleNumber: number;
        [key: string]: any;
      }>;
    };
  };
}

async function loadCourseData(
  filePath: string,
  courseId: string,
  courseName?: string
) {
  try {
    console.log(`Loading course data from: ${filePath}`);
    console.log(`Course ID: ${courseId}`);
    console.log(`Course Name: ${courseName || "N/A"}`);

    // Read and parse JSON file
    const fullPath = path.resolve(process.cwd(), filePath);
    const fileContent = fs.readFileSync(fullPath, "utf-8");
    const data: GolfCourseJsonData = JSON.parse(fileContent);

    const courseDataJson = JSON.stringify(data);
    const courseIdStr = courseId;

    // Store full course data using raw query
    await prisma.$executeRaw`
      INSERT INTO golf_courses (id, course_id, name, data, created_at, updated_at)
      VALUES (
        gen_random_uuid(),
        ${courseIdStr},
        ${courseName || null},
        ${courseDataJson}::jsonb,
        NOW(),
        NOW()
      )
      ON CONFLICT (course_id) DO UPDATE SET
        name = EXCLUDED.name,
        data = EXCLUDED.data,
        updated_at = NOW()
    `;

    console.log(`✓ Course stored: ${courseId}`);

    // Store holes separately
    if (data.vectorGPSObject?.Holes?.Hole) {
      let holeCount = 0;
      for (const hole of data.vectorGPSObject.Holes.Hole) {
        const holeDataJson = JSON.stringify(hole);
        const holeNumber = hole.HoleNumber;

        await prisma.$executeRaw`
          INSERT INTO golf_course_holes (id, course_id, hole_number, data, created_at, updated_at)
          VALUES (
            gen_random_uuid(),
            ${courseIdStr},
            ${holeNumber},
            ${holeDataJson}::jsonb,
            NOW(),
            NOW()
          )
          ON CONFLICT (course_id, hole_number) DO UPDATE SET
            data = EXCLUDED.data,
            updated_at = NOW()
        `;
        holeCount++;
      }
      console.log(`✓ Stored ${holeCount} holes`);
    }

    console.log("✅ Course data loaded successfully!");
  } catch (error) {
    console.error("❌ Error loading course data:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Get command line arguments
const args = process.argv.slice(2);
if (args.length < 2) {
  console.error(
    "Usage: ts-node scripts/load-course-data.ts <json-file-path> <course-id> [course-name]"
  );
  process.exit(1);
}

const [filePath, courseId, courseName] = args;

loadCourseData(filePath, courseId, courseName)
  .then(() => {
    console.log("Script completed successfully");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Script failed:", error);
    process.exit(1);
  });
