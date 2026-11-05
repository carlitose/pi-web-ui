import type { Server } from 'node:http';
import { WebSocketServer } from 'ws';
import type { createBridgeApp } from './server.js';
export declare function attachWebSocketServer(httpServer: Server, app?: ReturnType<typeof createBridgeApp>): WebSocketServer;
