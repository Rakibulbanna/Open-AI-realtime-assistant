import { Module } from "@nestjs/common";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";

// import { AuthModule } from "./modules/auth/auth.module";
import { CommonModule } from "@app/common";
import { PrismaModule } from "@app/prisma";
// import { SubscriptionModule } from "./modules/subscription/subscription.module";
import { GolfCaddieModule } from "./modules/golf-caddie/golf-caddie.module";
import { RagModule } from "./modules/rag/rag.module";
import { RealtimeModule } from "./modules/realtime/realtime.module";
@Module({
   imports: [PrismaModule, CommonModule, GolfCaddieModule, RagModule, RealtimeModule],
   controllers: [AppController],
   providers: [AppService],
})
export class AppModule { }
