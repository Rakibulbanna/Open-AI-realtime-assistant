import { Module } from "@nestjs/common";
import { RealtimeGateway } from "./realtime.gateway";
import { RealtimeService } from "./realtime.service";
import { GolfCaddieModule } from "../golf-caddie/golf-caddie.module";
@Module({
    imports: [GolfCaddieModule],
    providers: [RealtimeGateway, RealtimeService],

})
export class RealtimeModule { }
