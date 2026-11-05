import { type IncomingMessage, type ServerResponse } from 'node:http';
import { type ClientCommand, type JsonObject, type JsonValue } from '../protocol/index.js';
import { type BrowserClientRegistry, type BrowserToolRequestOptions } from './browser-client.js';
import { type BridgeStartContext } from './start-context.js';
import { type UiResponse } from './extension-ui-adapter.js';
export declare function createBridgeApp(options: {
    context: BridgeStartContext;
    pid?: number;
    sdkHost?: {
        create(options: {
            cwd: string;
            sessionPath?: string;
        }): Promise<unknown>;
    };
    ui?: {
        respond(response: UiResponse): boolean;
    };
}): {
    readonly browserClients: BrowserClientRegistry;
    status(): {
        running: boolean;
        pid: number;
        port: number;
        browserClients: number;
        session: import("../protocol/sessions.js").SessionState | undefined;
        sdkSession: unknown;
    };
    handleClientCommand(command: ClientCommand): Promise<import("../protocol/sessions.js").SessionState | {
        handled: boolean;
    } | undefined>;
    executeBrowserTool(tool: string, params: JsonObject, requestOptions?: BrowserToolRequestOptions): Promise<JsonValue | undefined>;
    readonly ready: Promise<void>;
};
export declare function createHttpServer(context: BridgeStartContext, sdkHost?: Parameters<typeof createBridgeApp>[0]['sdkHost']): import("http").Server<typeof IncomingMessage, typeof ServerResponse>;
export declare function main(): Promise<void>;
