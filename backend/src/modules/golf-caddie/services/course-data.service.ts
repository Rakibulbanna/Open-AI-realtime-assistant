import { HttpStatus, Injectable } from "@nestjs/common";
import { RedisService } from "@app/redis/redis.service";
import { CustomLogger } from "@app/common/logger.service";
import * as fs from "fs";
import { ApiError } from "@app/common/all-exceptions.filter";
import { PrismaService } from "@app/prisma";

/**
 * CourseDataService - Service for managing golf course data
 *
 * Uses PrismaService via dependency injection to access the singleton database instance.
 * All database operations use the same PrismaService instance across the entire application.
 * No new instances are created per request or per API call.
 */
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
            Greencenter?: any;
            Perimeter?: any;
            Teebox?: any;
            Bunker?: any;
            Fairway?: any;
            Centralpath?: any;
            Teeboxcenter?: any;
            Green?: any;
         }>;
      };
   };
}

@Injectable()
export class CourseDataService {
   private readonly logger = new CustomLogger("CourseDataService");

   constructor(
      private readonly redis: RedisService,
      /**
       * PrismaService - Singleton database service instance
       * Injected via dependency injection, ensuring the same instance is used everywhere.
       * This is the SAME instance used by all other services, controllers, and repositories.
       */
      private readonly prisma: PrismaService,
   ) {}

   /**
    * Load golf course data from JSON file and store in database
    */
   async loadCourseFromJson(filePath: string, courseId: string, courseName?: string): Promise<{ count: number }> {
      try {
         // check if database already seeded or not
         const isSeeded = await this.prisma.$queryRaw<Array<{ count: number }>>`
        SELECT COUNT(*) FROM golf_courses WHERE course_id = ${courseId}
      `;
         if (isSeeded.length > 0 && isSeeded[0].count > 0) {
            throw new ApiError(HttpStatus.BAD_REQUEST, `Course ${courseId} already seeded in the database`);
         }

         const fileContent = fs.readFileSync(filePath, "utf-8");
         const data: GolfCourseJsonData = JSON.parse(fileContent);

         const courseDataJson = JSON.stringify(data);
         const courseIdStr = courseId;

         // Store full course data using raw query
         await this.prisma.$executeRaw`
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

         let holeCount = 0;

         // Store holes separately
         if (data.vectorGPSObject?.Holes?.Hole) {
            for (const hole of data.vectorGPSObject.Holes.Hole) {
               const holeDataJson = JSON.stringify(hole);
               const holeNumber = hole.HoleNumber;

               await this.prisma.$executeRaw`
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
         }

         // Cache course-level features
         await this.cacheCourseFeatures(courseId, data);

         this.logger.log(`Successfully loaded course ${courseId} with ${holeCount} holes`);

         return { count: holeCount };
      } catch (error) {
         this.logger.error(`Failed to load course from JSON: ${filePath}`, error);
         throw error;
      }
   }

   /**
    * Cache course-level features (Water, Clubhouse, Background, Creek, Tree)
    */
   private async cacheCourseFeatures(courseId: string, data: GolfCourseJsonData): Promise<void> {
      const features = ["Water", "Clubhouse", "Background", "Creek", "Tree"];
      const cachePromises: Promise<void>[] = [];

      for (const featureName of features) {
         const featureData = data.vectorGPSObject?.[featureName as keyof typeof data.vectorGPSObject];
         if (featureData) {
            const cacheKey = `${courseId}:${featureName.toLowerCase()}`;
            cachePromises.push(
               this.redis.setJson(cacheKey, featureData, 3600 * 24), // 24 hours TTL
            );
         }
      }

      await Promise.all(cachePromises);
   }

   /**
    * Get hole data from cache or database
    */
   async getHoleData(courseId: string, holeNumber: number): Promise<any | null> {
      // Try cache first
      const cacheKey = `${holeNumber}:${courseId}:Hole`;
      const cached = await this.redis.getJson(cacheKey);
      if (cached) {
         return cached;
      }

      // Load from database using raw query
      const results = await this.prisma.$queryRaw<Array<{ data: any }>>`
      SELECT data
      FROM golf_course_holes
      WHERE course_id = ${courseId}
        AND hole_number = ${holeNumber}
      LIMIT 1
    `;

      if (results.length === 0) {
         return null;
      }

      const holeData = results[0].data;

      // Cache the hole data
      await this.redis.setJson(cacheKey, holeData, 3600 * 24); // 24 hours TTL

      return holeData;
   }

   /**
    * Get course data from database
    */
   async getCourseData(courseId: string): Promise<any | null> {
      const results = await this.prisma.$queryRaw<Array<{ data: any }>>`
      SELECT *
      FROM golf_courses
      WHERE course_id = ${courseId}
      LIMIT 1
    `;
      if (results.length === 0) {
         return null;
      }
      return results[0];
   }

   /**
    * Get course feature from cache or database
    */
   async getCourseFeature(courseId: string, featureName: string): Promise<any | null> {
      const cacheKey = `${courseId}:${featureName.toLowerCase()}`;
      const cached = await this.redis.getJson(cacheKey);
      if (cached) {
         return cached;
      }

      // Load from database using raw query
      const courseData = await this.getCourseData(courseId);
      if (!courseData) {
         return null;
      }
      const featureData = courseData?.data?.vectorGPSObject?.[featureName] || null;

      if (featureData) {
         // Cache the feature
         await this.redis.setJson(cacheKey, featureData, 3600 * 24); // 24 hours TTL
      }

      return featureData;
   }

   /**
    * Parse Points string to coordinates array
    * Points format: "lon lat,lon lat,lon lat"
    */
   private parsePoints(points: string): number[][] {
      if (!points) return [];
      return points.split(",").map((point) => {
         const [lon, lat] = point.trim().split(" ").map(Number);
         return [lon, lat];
      });
   }

   /**
    * Transform hole data to the format expected by the prediction engine
    */
   transformHoleDataForPrediction(
      holeData: any,
      startLon: number,
      startLat: number,
   ): {
      hole: {
         perimeter: number[][];
         green: number[][];
         bunkers: number[][][];
         water: number[][][];
         trees: number[][];
         no_fly_always: number[][];
         no_fly_safe: number[][];
         no_fly_aggressive: number[][];
         tee_boxes: number[][][];
         tee_center: number[];
         green_center: number[];
      };
      start_lon: number;
      start_lat: number;
   } {
      // Extract shapes from feature data - returns first polygon as array of coordinate pairs
      const extractShapes = (feature: any): number[][] => {
         if (!feature?.Shapes?.Shape) return [];
         const shapes = Array.isArray(feature.Shapes.Shape) ? feature.Shapes.Shape : [feature.Shapes.Shape];

         // Get the first shape's points (most features have a single polygon)
         const firstShape = shapes.find((shape: any) => shape.Points);
         if (firstShape?.Points) {
            return this.parsePoints(firstShape.Points);
         }
         return [];
      };

      // Get green center (single point: "lon lat")
      let greenCenter = [startLon, startLat];
      if (holeData.Greencenter?.Shapes?.Shape?.[0]?.Points) {
         const points = holeData.Greencenter.Shapes.Shape[0].Points.split(" ");
         if (points.length >= 2) {
            greenCenter = [Number(points[0]), Number(points[1])];
         }
      }

      // Get tee center (from Teeboxcenter or first Teebox)
      let teeCenter = [startLon, startLat];
      if (holeData.Teeboxcenter?.Shapes?.Shape?.[0]?.Points) {
         const points = holeData.Teeboxcenter.Shapes.Shape[0].Points.split(" ");
         if (points.length >= 2) {
            teeCenter = [Number(points[0]), Number(points[1])];
         }
      } else if (holeData.Teebox?.Shapes?.Shape?.[0]?.Points) {
         const firstPoint = this.parsePoints(holeData.Teebox.Shapes.Shape[0].Points)[0];
         if (firstPoint && firstPoint.length >= 2) {
            teeCenter = firstPoint;
         }
      }

      // Extract perimeter (single polygon - array of coordinate pairs)
      const perimeter = holeData.Perimeter ? extractShapes(holeData.Perimeter) : [];

      // Extract green (single polygon - array of coordinate pairs)
      const green = holeData.Green ? extractShapes(holeData.Green) : [];

      // Extract bunkers (array of polygons - each bunker is a polygon)
      const bunkers: number[][][] = [];
      if (holeData.Bunker?.Shapes?.Shape) {
         const bunkerShapes = Array.isArray(holeData.Bunker.Shapes.Shape)
            ? holeData.Bunker.Shapes.Shape
            : [holeData.Bunker.Shapes.Shape];
         for (const shape of bunkerShapes) {
            if (shape.Points) {
               const bunkerPolygon = this.parsePoints(shape.Points);
               if (bunkerPolygon.length > 0) {
                  bunkers.push(bunkerPolygon);
               }
            }
         }
      }

      // Extract tee boxes (array of polygons - each tee box is a polygon)
      const teeBoxes: number[][][] = [];
      if (holeData.Teebox?.Shapes?.Shape) {
         const teeBoxShapes = Array.isArray(holeData.Teebox.Shapes.Shape)
            ? holeData.Teebox.Shapes.Shape
            : [holeData.Teebox.Shapes.Shape];
         for (const shape of teeBoxShapes) {
            if (shape.Points) {
               const teeBoxPolygon = this.parsePoints(shape.Points);
               if (teeBoxPolygon.length > 0) {
                  teeBoxes.push(teeBoxPolygon);
               }
            }
         }
      }

      return {
         hole: {
            perimeter,
            green,
            bunkers,
            water: [], // Will be populated from course-level water data
            trees: [], // Will be populated from course-level tree data
            no_fly_always: [],
            no_fly_safe: [],
            no_fly_aggressive: [],
            tee_boxes: teeBoxes,
            tee_center: teeCenter,
            green_center: greenCenter,
         },
         start_lon: startLon,
         start_lat: startLat,
      };
   }

   /**
    * Get complete hole data with course-level features for prediction
    */
   async getHoleDataForPrediction(
      courseId: string,
      holeNumber: number,
      startLon: number,
      startLat: number,
   ): Promise<any> {
      // Get hole data
      const holeData = await this.getHoleData(courseId, holeNumber);
      if (!holeData) {
         throw new Error(`Hole ${holeNumber} not found for course ${courseId}`);
      }

      // Transform hole data
      const transformed = this.transformHoleDataForPrediction(holeData, startLon, startLat);

      // Get course-level water and trees
      const [
         water,
         //  trees
      ] = await Promise.all([
         this.getCourseFeature(courseId, "Water"),
         // this.getCourseFeature(courseId, "Tree"),
      ]);

      // Add water features to hole (array of polygons - each water hazard is a polygon)
      if (water?.Shapes?.Shape) {
         const waterShapes = Array.isArray(water.Shapes.Shape) ? water.Shapes.Shape : [water.Shapes.Shape];
         const waterPolygons: number[][][] = [];
         for (const shape of waterShapes) {
            if (shape.Points) {
               const waterPolygon = this.parsePoints(shape.Points);
               if (waterPolygon.length > 0) {
                  waterPolygons.push(waterPolygon);
               }
            }
         }
         transformed.hole.water = waterPolygons;
      }

      // Add tree features to hole (trees are point features - single point per shape)
      // if (trees?.Shapes?.Shape) {
      //   const treeShapes = Array.isArray(trees.Shapes.Shape)
      //     ? trees.Shapes.Shape
      //     : [trees.Shapes.Shape];
      //   transformed.hole.trees = treeShapes
      //     .filter((shape: any) => shape.Points)
      //     .map((shape: any) => {
      //       const points = shape.Points.split(" ");
      //       if (points.length >= 2) {
      //         return [Number(points[0]), Number(points[1])];
      //       }
      //       return null;
      //     })
      //     .filter((point: any) => point !== null);
      // }

      return transformed;
   }
}
