import { Injectable } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { RedisService } from "@app/redis/redis.service";
import { CustomLogger } from "@app/common/logger.service";

@Injectable()
export class CacheCleanupService {
  private readonly logger = new CustomLogger("CacheCleanupService");

  constructor(private readonly redis: RedisService) {}

  /**
   * Clean up Redis cache every 6 hours
   * This removes expired keys and optionally clears old course data
   */
  @Cron(CronExpression.EVERY_6_HOURS)
  async cleanupCache() {
    this.logger.log("Starting cache cleanup...");
    try {
      // Redis automatically handles TTL expiration, but we can also
      // manually clean up patterns if needed
      // For now, Redis TTL will handle expiration automatically
      
      // Optional: Clean up old patterns if needed
      // const deleted = await this.redis.deletePattern("course:*");
      // this.logger.log(`Cleaned up ${deleted} cache keys`);
      
      this.logger.log("Cache cleanup completed");
    } catch (error) {
      this.logger.error("Cache cleanup failed", error);
    }
  }

  /**
   * Manual cache cleanup for specific course
   */
  async cleanupCourseCache(courseId: string): Promise<number> {
    try {
      const patterns = [
        `${courseId}:*`, // Course-level features
        `*:${courseId}:Hole`, // Holes
      ];

      let totalDeleted = 0;
      for (const pattern of patterns) {
        const deleted = await this.redis.deletePattern(pattern);
        totalDeleted += deleted;
      }

      this.logger.log(
        `Cleaned up ${totalDeleted} cache keys for course ${courseId}`
      );
      return totalDeleted;
    } catch (error) {
      this.logger.error(
        `Failed to cleanup cache for course ${courseId}`,
        error
      );
      return 0;
    }
  }
}

