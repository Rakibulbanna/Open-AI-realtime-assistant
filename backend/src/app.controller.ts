import { Controller, Get } from "@nestjs/common";
import { AppService } from "./app.service";
import { ApiTags, ApiOperation, ApiResponse } from "@nestjs/swagger";

class AppInfoResponseDto {
   message: string;
   version?: string;
   timestamp?: string;
}

class DbBackupResponseDto {
   success: boolean;
   message: string;
   backupPath?: string;
}

@ApiTags("App")
@Controller()
export class AppController {
   constructor(private readonly appService: AppService) {}

   @Get()
   @ApiOperation({
      summary: "Application info",
      description: "Get basic application information and health status.",
   })
   @ApiResponse({
      status: 200,
      description: "Application is running",
      type: AppInfoResponseDto,
   })
   getHello(): Object {
      return this.appService.getHello();
   }

   @Get("/db-backup")
   @ApiOperation({
      summary: "Trigger database backup",
      description: "Initiate a database backup process. Returns backup status and location.",
   })
   @ApiResponse({
      status: 200,
      description: "Backup initiated successfully",
      type: DbBackupResponseDto,
   })
   @ApiResponse({
      status: 500,
      description: "Backup failed",
   })
   getDBBackup(): Object {
      return this.appService.backupDatabase();
   }
}
