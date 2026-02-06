// main.ts
import "dotenv/config";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { NestExpressApplication } from "@nestjs/platform-express";
import { ValidationPipe } from "@nestjs/common";
import { join } from "path";
import { cwd } from "process";
import { AllExceptionsFilter } from "@app/common/all-exceptions.filter";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { json } from "express";
import { SocketIOAdapter } from "./common/adapters/socket-io.adapter";

// Note: Do NOT create PrismaClient instances directly
// Use PrismaService via dependency injection or PrismaService.getInstance()
async function bootstrap() {
   try {
      const app = await NestFactory.create<NestExpressApplication>(AppModule, {
         logger: false,
         bodyParser: false, // Disable default to configure custom limit
      });
      app.set("trust proxy", true);

      // Configure WebSocket adapter for Socket.IO
      // Socket.IO works at root level, bypassing the global API prefix
      app.useWebSocketAdapter(new SocketIOAdapter(app));

      // Configure JSON body parser with 10MB limit to handle large course data
      app.use(json({ limit: "10mb" }));

      // CORS
      app.enableCors({
         origin: true,
         credentials: true,
      });

      const apiPrefix = `api/${process.env.API_VERSION}`;
      app.setGlobalPrefix(apiPrefix);
      app.useGlobalFilters(new AllExceptionsFilter());
      app.useStaticAssets(join(cwd(), "uploads"), {
         prefix: "/uploads",
      });

      app.useGlobalPipes(
         new ValidationPipe({
            whitelist: true,
            forbidNonWhitelisted: true,
         }),
      );

      // Swagger Configuration
      const config = new DocumentBuilder()
         .setTitle("iCaddie API")
         .setDescription("AI-powered Golf Caddie API - Get shot recommendations, query golf rules, and more.")
         .setVersion("1.0")
         .addTag("App", "Application health and utility endpoints")
         .addTag("Golf Caddie", "AI-powered shot recommendation endpoints")
         .addTag("Rules", "Golf rules RAG (Retrieval-Augmented Generation) endpoints")
         .addBearerAuth()
         .build();

      const document = SwaggerModule.createDocument(app, config);
      SwaggerModule.setup("api/docs", app, document, {
         swaggerOptions: {
            persistAuthorization: true,
            tagsSorter: "alpha",
            operationsSorter: "method",
         },
         customSiteTitle: "iCaddie API Documentation",
      });

      const port = process.env.PORT || 8010;
      try {
         const server = await app.listen(port);

         // Configure Socket.IO to use the HTTP server (bypasses global prefix)
         const ioAdapter = app.getHttpAdapter().getInstance();
         if (ioAdapter && typeof ioAdapter === "object" && "io" in ioAdapter) {
            // Socket.IO is already attached
         }

         console.log(`🚀 Server running on http://localhost:${port}`);
         console.log(`📚 Swagger docs available at http://localhost:${port}/api/docs`);
         console.log(`🔌 WebSocket available at ws://localhost:${port}/rag-realtime`);
      } catch (error) {
         console.error("Failed to start server:", error);
         process.exit(1);
      }
   } catch (error) {
      console.error("[Bootstrap] Fatal error:", error);
      process.exit(1);
   }
}

bootstrap().catch((error) => {
   console.error("Fatal error during application bootstrap:", error);
   process.exit(1);
});
