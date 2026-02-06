import { LoggerService } from "@nestjs/common";
import * as fs from "fs";
import * as path from "path";

export class CustomLogger implements LoggerService {
   private context?: string;
   private logStream: fs.WriteStream;

   constructor(context?: string) {
      this.context = context;
      this.initializeLogStream();
   }

   private initializeLogStream() {
      const logDir = path.join(process.cwd(), "logs");

      // Create logs directory if it doesn't exist
      if (!fs.existsSync(logDir)) {
         fs.mkdirSync(logDir, { recursive: true });
      }

      const logFilePath = path.join(logDir, this.getLogFileName());
      this.logStream = fs.createWriteStream(logFilePath, { flags: "a" });
   }

   private getLogFileName(): string {
      const date = new Date();
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}.log`;
   }

   private writeToFile(level: string, message: string, trace?: string) {
      const timestamp = this.getTimestamp();
      const logEntry = `[${timestamp}] [${level}] ${message}\n`;

      this.logStream.write(logEntry);

      if (trace) {
         this.logStream.write(`${trace}\n`);
      }
   }

   log(message: any, context?: string) {
      const formattedMessage = `[${context || this.context || "INFO"}] ${message}`;
      console.log(`[${this.getTimestamp()}] ${formattedMessage}`);
      this.writeToFile("INFO", formattedMessage);
   }

   error(message: any, trace?: string, context?: string) {
      const formattedMessage = `[${context || this.context || "ERROR"}] ${message}`;
      console.error(`[${this.getTimestamp()}] ${formattedMessage}`);
      this.writeToFile("ERROR", formattedMessage, trace);
   }

   warn(message: any, context?: string) {
      const formattedMessage = `[${context || this.context || "WARN"}] ${message}`;
      console.warn(`[${this.getTimestamp()}] ${formattedMessage}`);
      this.writeToFile("WARN", formattedMessage);
   }

   debug(message: any, context?: string) {
      if (process.env.NODE_ENV !== "production") {
         const formattedMessage = `[${context || this.context || "DEBUG"}] ${message}`;
         console.debug(`[${this.getTimestamp()}] ${formattedMessage}`);
         this.writeToFile("DEBUG", formattedMessage);
      }
   }

   verbose(message: any, context?: string) {
      if (process.env.NODE_ENV !== "production") {
         const formattedMessage = `[${context || this.context || "VERBOSE"}] ${message}`;
         console.log(`[${this.getTimestamp()}] ${formattedMessage}`);
         this.writeToFile("VERBOSE", formattedMessage);
      }
   }
   fatal(message: any, context?: string) {
      const formattedMessage = `[${context || this.context || "FATAL"}] ${message}`;
      console.error(`[${this.getTimestamp()}] ${formattedMessage}`);
      this.writeToFile("FATAL", formattedMessage);
   }

   private getTimestamp(): string {
      return new Date().toISOString();
   }

   // Cleanup method to close the log stream
   close() {
      if (this.logStream) {
         this.logStream.end();
      }
   }
}
