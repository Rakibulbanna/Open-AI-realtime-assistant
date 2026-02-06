import { Module } from "@nestjs/common";
import { SendMailerService } from "./send-mailer.service";

@Module({
   providers: [SendMailerService],
   exports: [SendMailerService],
})
export class SendMailerModule {}
