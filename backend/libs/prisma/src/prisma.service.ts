import { Injectable, OnModuleInit, OnModuleDestroy, Scope } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { CustomLogger } from "@app/common/logger.service";
import { PrismaPg } from "@prisma/adapter-pg";

/**
 * PrismaService - Singleton database service for the entire application
 * 
 * This service ensures ONLY ONE PrismaClient instance exists across the entire application.
 * 
 * Singleton Enforcement:
 * 1. NestJS DI: Configured with Scope.DEFAULT (singleton) in PrismaModule
 * 2. Constructor Protection: Throws error if second instance attempted
 * 3. Static Instance Tracking: Stores instance in PrismaService.instance
 * 
 * Important:
 * - ONE instance is created at application startup
 * - SAME instance is reused for ALL API calls, requests, and modules
 * - NO new instances are created per request or per module mount
 * 
 * Usage:
 * - In NestJS modules: Inject via constructor (recommended)
 *   constructor(private readonly prisma: PrismaService)
 * - Outside NestJS context: Use PrismaService.getInstance()
 */
@Injectable({ scope: Scope.DEFAULT }) // Explicitly set singleton scope
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
   private static instance: PrismaService | null = null;
   private static isConnected: boolean = false;
   private readonly logger: CustomLogger;

   constructor() {
      // Prevent multiple instances - if one already exists, throw error
      if (PrismaService.instance) {
         throw new Error(
            "PrismaService instance already exists. Use dependency injection or PrismaService.getInstance() instead of creating a new instance."
         );
      }

      const connectionString = process.env.DATABASE_URL;

      if (!connectionString) {
         const error = new Error(
            "DATABASE_URL environment variable is not set. Please check your .env file."
         );
         console.error(error.message);
         throw error;
      }

      try {
         const adapter = new PrismaPg({ connectionString });

         super({
            adapter,
            log: [
               { emit: "event", level: "query" },
               { emit: "event", level: "error" },
               { emit: "event", level: "info" },
               { emit: "event", level: "warn" },
            ],
         });

         // Initialize logger after super() call
         this.logger = new CustomLogger("PrismaService");

         // Store this instance as the singleton
         PrismaService.instance = this;
      } catch (error) {
         console.error(
            "Failed to initialize Prisma adapter",
            error instanceof Error ? error.stack : String(error)
         );
         throw error;
      }
   }

   /**
    * Get the singleton instance of PrismaService
    * Note: In NestJS applications, prefer using dependency injection instead
    * @returns The singleton PrismaService instance
    * @throws Error if no instance has been created yet
    */
   public static getInstance(): PrismaService {
      if (!PrismaService.instance) {
         throw new Error(
            "PrismaService instance not initialized. Ensure PrismaModule is imported in your application."
         );
      }
      return PrismaService.instance;
   }

   async onModuleInit() {
      // Prevent multiple connections
      if (PrismaService.isConnected) {
         return;
      }

      // Connect in background to not block startup
      // setImmediate(async () => {
      try {
         await this.$connect();
         PrismaService.isConnected = true;
         console.log("✅ Successfully connected to the database");
         this.logger.log("Successfully connected to the database");
      } catch (error) {
         this.logger.error("Failed to connect to the database", error instanceof Error ? error.stack : undefined);
         console.warn("Database connection failed - will retry on first query");
      }
      // });
   }

   async onModuleDestroy() {
      if (!PrismaService.isConnected) {
         console.log("Database not connected, skipping disconnect...");
         return;
      }

      try {
         await this.$disconnect();
         PrismaService.isConnected = false;
         this.logger.log("Successfully disconnected from the database");
      } catch (error) {
         this.logger.error("Failed to disconnect from the database", error instanceof Error ? error.stack : undefined);
         throw error;
      }
   }
}
