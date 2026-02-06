import { Injectable } from "@nestjs/common";
import { extname } from "path";
import { createReadStream, existsSync, mkdirSync, unlink, writeFileSync } from "fs";
import { join } from "path";
import { ApiError } from "@app/common";

@Injectable()
export class FileUploadService {
   async uploadFile(file: Express.Multer.File, allowedExtensions?: RegExp[], folderName?: string): Promise<string> {
      try {
         if (!file) {
            throw new Error("No file provided");
         }

         const fileExt = extname(file.originalname).toLowerCase();
         if (allowedExtensions && allowedExtensions.length > 0) {
            const isAllowed = allowedExtensions.some((ext) => ext.test(fileExt));
            if (!isAllowed) {
               throw new Error("Invalid file type");
            }
         }
         const filenameWithoutExt = file.originalname.replace(fileExt, "").replace(/\s+/g, "-");

         const fileName = `${filenameWithoutExt}-${Date.now()}${fileExt}`;
         const uploadsDir = folderName ? join(process.cwd(), "uploads", folderName) : join(process.cwd(), "uploads");
         const relativePath = folderName ? join("uploads", folderName, fileName) : join("uploads", fileName);

         if (!existsSync(uploadsDir)) {
            mkdirSync(uploadsDir, { recursive: true });
         }
         writeFileSync(join(uploadsDir, fileName), file.buffer);
         return relativePath;
      } catch (error) {
         throw new ApiError(400, error.message);
      }
   }

   async getFileStream(fileName: string) {
      const filePath = join(process.cwd(), "uploads", fileName);
      if (existsSync(filePath)) {
         return createReadStream(filePath);
      }
      return null;
   }

   deleteFile(filePath: string) {
      if (existsSync(filePath)) {
         unlink(filePath, (err) => {
            if (err) console.log(err);
         });
      }
   }
}
