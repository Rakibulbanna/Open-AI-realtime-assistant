import { PrismaService } from "@app/prisma";
import { Injectable, Logger } from "@nestjs/common";
import * as path from "path";

import * as fs from "fs";
import { format } from "date-fns";
import { exec } from "child_process";

/**
 * AppService - Application service
 * 
 * Uses PrismaService via dependency injection to access the singleton database instance.
 * All database operations use the same PrismaService instance across the entire application.
 * No new instances are created per request or per API call.
 */
@Injectable()
export class AppService {
   /**
    * PrismaService - Singleton database service instance
    * Injected via dependency injection, ensuring the same instance is used everywhere
    */
   constructor(private readonly prisma: PrismaService) { }
   private readonly logger = new Logger("BackupService");

   async getHello(): Promise<Object> {
      // const a = await this.prisma.viewPendingApprovalReady.findMany({
      //    take: 10,
      //    include: {
      //       approvalAcceptance: true,
      //       approvalLayer: true,
      //       approvalAcceptanceHistory: true,
      //       permissionSelling: true,
      //    },
      // });
      // const hashPassword = await bcrypt.hash("password", 10);
      // console.log(hashPassword);
      return {
         message: "Golf Tracking API",
         status: "success",
         statusCode: 200,
         // data: a,
         // hashPassword,
      };
   }

   async backupDatabase(): Promise<string> {
      const backupDir = path.join(process.cwd(), "uploads");
      console.log("backupDir", backupDir);
      if (!fs.existsSync(backupDir)) {
         fs.mkdirSync(backupDir, { recursive: true });
      }
      const mysqldumpPath = `"C:\\xampp\\mysql\\bin\\mysqldump.exe"`;
      const timestamp = format(new Date(), "yyyy-MM-dd_HH-mm-ss");

      const backupFile = path.join(backupDir, `backup_${timestamp}.sql`);

      const DB_HOST = process.env.DB_HOST || "147.93.111.195";
      const DB_USER = process.env.DB_USER || "psl";
      const DB_PASSWORD = process.env.DB_PASSWORD || "PakizaCRM!1234@$";
      const DB_NAME = process.env.DB_NAME || "pakiza-crm";

      const dumpCommand = `${mysqldumpPath} --routines --triggers --events --single-transaction --default-character-set=utf8mb4 -h ${DB_HOST} -P 3306 -u ${DB_USER} -p${DB_PASSWORD} ${DB_NAME} > "${backupFile}"`;

      this.logger.log(`Running backup command: ${dumpCommand}`);

      return new Promise((resolve, reject) => {
         exec(dumpCommand, (error) => {
            if (error) {
               this.logger.error("Database backup failed", error);
               reject(error);
            } else {
               this.logger.log(`✅ Backup created: ${backupFile}`);
               resolve(backupFile);
            }
         });
      });
   }
}
