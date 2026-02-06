import { IoAdapter } from "@nestjs/platform-socket.io";
import { ServerOptions } from "socket.io";
import { INestApplication } from "@nestjs/common";
import { Server } from "socket.io";

/**
 * Custom Socket.IO Adapter that properly integrates with NestJS HTTP server
 * This ensures Socket.IO works correctly even with global API prefix
 */
export class SocketIOAdapter extends IoAdapter {
  constructor(private app: INestApplication) {
    super(app);
  }

  createIOServer(port: number, options?: ServerOptions): Server {
    // Get the HTTP server from NestJS
    const httpServer = this.app.getHttpServer();
    
    // Create Socket.IO server attached to the existing HTTP server
    const io = new Server(httpServer, {
      ...options,
      cors: {
        origin: "*",
        credentials: true,
        methods: ["GET", "POST"],
      },
      transports: ["websocket", "polling"],
      path: "/socket.io/",
    });

    return io;
  }
}
