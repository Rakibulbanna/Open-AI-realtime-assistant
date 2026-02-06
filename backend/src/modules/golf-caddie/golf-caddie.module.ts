import { Module } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";
import { GolfCaddieController } from "./golf-caddie.controller";
import { GolfCaddieService } from "./golf-caddie.service";
import { AssistantService } from "./services/assistant.service";
import { FunctionHandlerService } from "./services/function-handler.service";
import { CourseDataService } from "./services/course-data.service";
import { CacheCleanupService } from "./services/cache-cleanup.service";
import { RagModule } from "../rag/rag.module";
import { RedisModule } from "@app/redis/redis.module";

@Module({
  imports: [RagModule, RedisModule, ScheduleModule.forRoot()],
  controllers: [GolfCaddieController],
  providers: [
    GolfCaddieService,
    AssistantService,
    FunctionHandlerService,
    CourseDataService,
    CacheCleanupService,
  ],
  exports: [GolfCaddieService, AssistantService, CourseDataService, FunctionHandlerService],
})
export class GolfCaddieModule { }
