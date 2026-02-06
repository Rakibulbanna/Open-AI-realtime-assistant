import { Injectable, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import Redis from "ioredis";
import { CustomLogger } from "@app/common/logger.service";


@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private client: Redis;
  private readonly logger = new CustomLogger("RedisService");
  private tryConnectCount = 0;

  constructor() {
    const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
    this.client = new Redis(redisUrl, {
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      maxRetriesPerRequest: 3,
      connectTimeout: 5000, // 5 second connection timeout
      lazyConnect: true, // Don't connect immediately
      enableOfflineQueue: false, // Don't queue commands when disconnected
    });

    this.client.on("error", (err) => {
      this.logger.error(
        "Redis connection error",
        err instanceof Error ? err.stack : String(err)
      );
      this.tryConnectCount++;
      if (this.tryConnectCount >= 3) {
        process.exit(1);
      }
    });

    this.client.on("connect", () => {
      this.logger.log("Redis connected");
    });
  }

  async onModuleInit() {
    // Initialize Redis connection asynchronously without blocking startup
    // Fire and forget - don't wait for it
    setImmediate(() => {
      this.initializeRedis().catch((error) => {
        this.logger.error(
          "Failed to initialize Redis (continuing without Redis)",
          error instanceof Error ? error.stack : String(error)
        );
      });
    });
  }

  private async initializeRedis() {
    try {
      // Connect with timeout
      await Promise.race([
        this.client.connect(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Redis connection timeout")), 5000)
        ),
      ]);

      // Ping to verify connection
      await Promise.race([
        this.client.ping(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Redis ping timeout")), 3000)
        ),
      ]);

      this.logger.log("Redis service initialized");
    } catch (error) {
      // Silently fail - Redis is optional
      this.logger.warn("Redis not available, continuing without cache");
    }
  }

  async onModuleDestroy() {
    await this.client.quit();
    this.logger.log("Redis connection closed");
  }

  /**
   * Get value from Redis
   */
  async get(key: string): Promise<string | null> {
    try {
      return await this.client.get(key);
    } catch (error) {
      this.logger.error(
        `Failed to get key: ${key}`,
        error instanceof Error ? error.stack : String(error)
      );
      return null;
    }
  }

  /**
   * Set value in Redis with optional expiration (in seconds)
   */
  async set(key: string, value: string, ttl?: number): Promise<void> {
    try {
      if (ttl) {
        await this.client.setex(key, ttl, value);
      } else {
        await this.client.set(key, value);
      }
    } catch (error) {
      this.logger.error(
        `Failed to set key: ${key}`,
        error instanceof Error ? error.stack : String(error)
      );
    }
  }

  /**
   * Set JSON value in Redis
   */
  async setJson(key: string, value: any, ttl?: number): Promise<void> {
    await this.set(key, JSON.stringify(value), ttl);
  }

  /**
   * Get JSON value from Redis
   */
  async getJson<T>(key: string): Promise<T | null> {
    const value = await this.get(key);
    if (!value) return null;
    try {
      return JSON.parse(value) as T;
    } catch (error) {
      this.logger.error(
        `Failed to parse JSON for key: ${key}`,
        error instanceof Error ? error.stack : String(error)
      );
      return null;
    }
  }

  /**
   * Delete key from Redis
   */
  async delete(key: string): Promise<void> {
    try {
      await this.client.del(key);
    } catch (error) {
      this.logger.error(
        `Failed to delete key: ${key}`,
        error instanceof Error ? error.stack : String(error)
      );
    }
  }

  /**
   * Delete multiple keys matching pattern
   */
  async deletePattern(pattern: string): Promise<number> {
    try {
      const keys = await this.client.keys(pattern);
      if (keys.length === 0) return 0;
      return await this.client.del(...keys);
    } catch (error) {
      this.logger.error(
        `Failed to delete pattern: ${pattern}`,
        error instanceof Error ? error.stack : String(error)
      );
      return 0;
    }
  }

  /**
   * Check if key exists
   */
  async exists(key: string): Promise<boolean> {
    try {
      const result = await this.client.exists(key);
      return result === 1;
    } catch (error) {
      this.logger.error(
        `Failed to check existence of key: ${key}`,
        error instanceof Error ? error.stack : String(error)
      );
      return false;
    }
  }

  /**
   * Get Redis client (for advanced operations)
   */
  getClient(): Redis {
    return this.client;
  }
}
