import type { BrowserToolName, JsonObject, JsonValue, SessionState } from '../protocol/index.js';
import type { BrowserToolRequestOptions } from './browser-client.js';
export interface BrowserToolTransport {
    requestBrowserTool(tool: BrowserToolName, params: JsonObject, options?: BrowserToolRequestOptions): Promise<JsonValue | undefined>;
    confirm?(message: string, options?: BrowserToolRequestOptions): Promise<boolean>;
    input?(message: string): Promise<string>;
    notify?(message: string): void;
    audit?: {
        record(entry: {
            action: string;
            params?: unknown;
        }): void;
    };
}
export interface BrowserToolPolicy {
    /** Exact origins whose tabs may run `Runtime.evaluate` without the per-request prompt. Empty = always prompt. */
    autoApproveEvaluateOrigins?: ReadonlySet<string>;
}
/** Parses a comma-separated list of exact http(s) origins; paths, wildcards and other schemes are ignored. */
export declare function parseAutoApproveEvaluateOrigins(value: string | undefined): ReadonlySet<string>;
export declare function createBrowserToolExecutor(transport: BrowserToolTransport, session: SessionState, policy?: BrowserToolPolicy): {
    execute(tool: BrowserToolName, params: JsonObject, options?: BrowserToolRequestOptions): Promise<JsonValue | undefined>;
};
