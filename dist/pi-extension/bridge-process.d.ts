import { spawn as nodeSpawn, type ChildProcess } from 'node:child_process';
import type { JsonObject, JsonValue, SessionStartOptions } from '../protocol/index.js';
export interface BridgeStartOptions extends SessionStartOptions {
    port: number;
}
export interface BridgeStatus {
    running: boolean;
    pid?: number;
    port?: number;
}
export interface BridgeStartResult {
    pid?: number;
    port: number;
    alreadyRunning: boolean;
}
export interface BridgeProcessManager {
    start(options: BridgeStartOptions): Promise<BridgeStartResult>;
    stop(): Promise<void>;
    status(): Promise<BridgeStatus>;
    requestBrowserTool(tool: string, params: JsonObject, options?: {
        signal?: AbortSignal;
    }): Promise<JsonValue | undefined>;
}
type Spawn = (command: string, args: string[], options: Parameters<typeof nodeSpawn>[2]) => Partial<ChildProcess>;
type StatusProbe = (port: number) => Promise<BridgeStatus>;
export declare function defaultBridgeEntryPath(): string;
export declare function createBridgeProcessManager(deps?: {
    spawn?: Spawn;
    statusProbe?: StatusProbe;
    bridgeEntryPath?: string;
    readyTimeoutMs?: number;
    readyPollIntervalMs?: number;
    stopFn?: () => Promise<void>;
    /** Override host pi-coding-agent entry resolution (test seam). */
    resolveHostPiEntry?: () => string | undefined | Promise<string | undefined>;
}): BridgeProcessManager;
export {};
