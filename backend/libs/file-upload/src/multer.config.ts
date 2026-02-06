import { diskStorage } from "multer";
import path from "path";
import fsp from "fs/promises";

export const allocateDirectory = async (folderName: string) => {
   if (folderName && typeof folderName === "string") {
      try {
         // Check if the folder exists by reading the directory
         await fsp.readdir(folderName);
      } catch (error) {
         // If the directory doesn't exist, create it with the necessary parent directories
         await fsp.mkdir(folderName, { recursive: true });
      }
   }
};
export const uploadFileConfig = (folderName?: string) => ({
   storage: diskStorage({
      destination: async function (req, file, cb) {
         const folder = folderName ? path.join("uploads", folderName) : path.join("uploads");
         await allocateDirectory(path.join(process.cwd(), folder));
         cb(null, folder);
      },
      filename: function (req, file, cb) {
         cb(null, Date.now() + "-" + file?.originalname?.split(" ")?.join("-"));
      },
   }),
});
