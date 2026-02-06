export enum module_name {
   TODO = "TODO",
}
export const jwt_secret = process.env.JWT_SECRET || "default-token-checker";
export enum project_status_name {
   "To do" = "TO_DO",
   "In progress" = "IN_PROGRESS",
   "Completed" = "COMPLETED",
   "QA" = "QA",
   "Development" = "DEVELOPMENT",
}

export const photoExtensions = /\.(jpg|jpeg|png|gif|bmp|tiff)$/i;
export const docExtensions = /\.(pdf|doc|docx|xls|xlsx|ppt|pptx)$/i;
export const videoExtensions = /\.(mp4|avi|mov|mkv|wmv|flv|webm|m4v)$/i;
export const photoOrVideoExtensions = /\.(jpg|jpeg|png|gif|bmp|tiff|mp4|avi|mov|mkv|wmv|flv|webm|m4v)$/i;
