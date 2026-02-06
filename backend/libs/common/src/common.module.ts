import { Global, Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { CommonService } from "./common.service";

@Global()
@Module({
   imports: [
      JwtModule.register({
         // JwtModule configuration - can be overridden by importing modules
      }),
   ],
   providers: [CommonService],
   exports: [CommonService, JwtModule],
})
export class CommonModule {}
