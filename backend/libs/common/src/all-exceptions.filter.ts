import {
   ExceptionFilter,
   Catch,
   ArgumentsHost,
   HttpStatus,
   UnauthorizedException,
   ForbiddenException,
   NotFoundException,
} from "@nestjs/common";
import { Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import { CustomLogger } from "./logger.service";
import { handlePrismaError } from "@app/prisma/query.error.service";
import { MulterError } from "multer";

interface ApiErrorType extends Error {
   statusCode: number;
   status: string;
   isOperational: boolean;
}

export class ApiError extends Error implements ApiErrorType {
   statusCode: number;
   status: string;
   isOperational: boolean;

   constructor(statusCode: number, message: string) {
      super(message);
      this.statusCode = statusCode;
      this.status = `${statusCode}`.startsWith("4") ? "fail" : "error";
      this.isOperational = true;

      Error.captureStackTrace(this, this.constructor);
   }
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
   private readonly logger = new CustomLogger("ExceptionFilter");
   private readonly handlePrismaError = handlePrismaError;

   catch(err: unknown, host: ArgumentsHost) {
      const ctx = host.switchToHttp();
      const response = ctx.getResponse<Response>();
      const request = ctx.getRequest<Request>();

      console.log("\n\n%c**************** Main Error_____", "color: red; font-weight: bold;", err);

      const errorId = new Date().getTime();
      const stack = err instanceof Error ? err.stack : undefined;
      const timestamp = new Date().toISOString();

      let status = HttpStatus.INTERNAL_SERVER_ERROR;
      let message = "Internal server error";

      const writeLog = (statusCode: number, error: unknown) => {
         this.logger.error(
            `Error: ${JSON.stringify({
               errorId: errorId,
               statusCode,
               status: "error",
               url: request.originalUrl,
               error: error,
               timestamp: timestamp,
            })}`,
            undefined,
            "ExceptionFilter",
         );
      };

      if (err instanceof ApiError) {
         status = err.statusCode;
         message = err.message;
         console.log("err1111111111111___", status, message);
         writeLog(status, err);
      } else if (err instanceof ZodError) {
         status = HttpStatus.BAD_REQUEST;
         message = err.issues.map((issue) => `${issue.path.join(".")} is ${issue.message}`).join(", ");
         console.log("err2222222222222___", message);
      } else if (err instanceof Prisma.PrismaClientKnownRequestError) {
         const formattedError = this.handlePrismaError((err as Prisma.PrismaClientKnownRequestError).code);
         status = formattedError.httpStatus;
         message = formattedError.message;
         console.log("err3333333333333___", status, message);
         writeLog(status, err);
      } else if (err instanceof Prisma.PrismaClientValidationError) {
         status = HttpStatus.UNPROCESSABLE_ENTITY;
         message = err instanceof Error ? err.message : "Validation error";
         console.log("err4444444444444___", status, message);
      } else if (err instanceof Prisma.PrismaClientInitializationError) {
         const formattedError = this.handlePrismaError(err instanceof Error ? err.name : "PrismaClientInitializationError");
         status = formattedError.httpStatus;
         message = formattedError.message;
         console.log("err5555555555555___", status, message);
         writeLog(status, err);
      } else if (err instanceof Prisma.PrismaClientRustPanicError) {
         status = HttpStatus.INTERNAL_SERVER_ERROR;
         message = err instanceof Error ? err.message : "Rust panic error";
         console.log("err6666666666666___", status, message);
         writeLog(status, err);
      } else if (err instanceof Prisma.PrismaClientUnknownRequestError) {
         status = HttpStatus.INTERNAL_SERVER_ERROR;
         message = err instanceof Error ? err.message : "Unknown request error";
         console.log("err7777777777777___", status, message);
         writeLog(status, err);
      } else if (err instanceof UnauthorizedException) {
         message = err.message;
         status = HttpStatus.UNAUTHORIZED;
         console.log("err8888888888888___", status, message);
      } else if (err instanceof ForbiddenException) {
         message = err.message;
         status = HttpStatus.FORBIDDEN;
         console.log("err8888888888888___", status, message);
      } else if (typeof err === "object" && err !== null && "code" in err) {
         if (err.code === "P2025") {
            status = HttpStatus.NOT_FOUND;
            message = "Data not found by id";
            console.log("err9999999999999___", status, message);
         } else if (err.code === "P2002") {
            status = HttpStatus.BAD_REQUEST;
            message = "Data not found by id";
            console.log("err1010101010101___", status, message);
         } else if (err instanceof MulterError) {
            status = HttpStatus.BAD_REQUEST;
            message = "File upload failed";
            console.log("err1111111111111___", status, message);
         } else if (err instanceof Error) {
            status = HttpStatus.BAD_REQUEST;
            message = err.message;
            console.log("err1212121212121___", status, message);
         }
      } else if (err instanceof NotFoundException) {
         status = HttpStatus.NOT_FOUND;
         message = err.message || "API Not Found";
         console.log("err1313131313131___", status, message);
      }

      return response.status(status).json({
         errorId: errorId,
         status: "error",
         statusCode: status,
         url: request.originalUrl,
         message: message,
         timestamp: timestamp,
         stack: process.env.NODE_ENV === "development" ? stack : undefined, // Include stack trace only in development
      });
   }
}
