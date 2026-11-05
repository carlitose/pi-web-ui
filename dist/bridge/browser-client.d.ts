import { type BrowserToolName, type JsonObject, type JsonValue } from '../protocol/index.js';
export interface BrowserSocketLike {
    send(message: string): void;
}
export interface BrowserClient {
    receive(message: string): void;
    disconnect(): void;
}
export interface BrowserToolRequestOptions {
    signal?: AbortSignal;
}
export interface BrowserClientRegistry {
    addClient(socket: BrowserSocketLike): BrowserClient;
    count(): number;
    broadcast(message: JsonObject): void;
    requestBrowserTool(tool: BrowserToolName, params: JsonObject, options?: BrowserToolRequestOptions): Promise<JsonValue | undefined>;
    cancelPending(): void;
}
export declare function createBrowserClientRegistry(options?: {
    onEmpty?: () => void;
}): BrowserClientRegistry;
