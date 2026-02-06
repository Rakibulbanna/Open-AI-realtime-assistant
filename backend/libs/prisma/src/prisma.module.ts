import { Global, Module, Scope } from "@nestjs/common";
import { PrismaService } from "./prisma.service";

/**
 * PrismaModule - Global module that provides a singleton PrismaService instance
 * 
 * This module ensures ONLY ONE PrismaService instance exists across the entire application.
 * 
 * Configuration:
 * - @Global(): Makes PrismaService available to all modules without explicit import
 * - Scope.DEFAULT: Explicitly sets singleton scope (one instance for entire app lifetime)
 * - PrismaService constructor enforces singleton by preventing multiple instances
 * 
 * Usage:
 * - All services receive the SAME instance via dependency injection
 * - No new instances are created per request or per module
 * - Instance is created once at application startup and reused everywhere
 */
@Global()
@Module({
   providers: [
      {
         provide: PrismaService,
         useClass: PrismaService,
         scope: Scope.DEFAULT, // Explicitly set singleton scope (default, but explicit for clarity)
      },
   ],
   exports: [PrismaService],
})
export class PrismaModule {}
