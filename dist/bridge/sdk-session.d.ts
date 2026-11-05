import type { JsonObject } from '../protocol/index.js';
import type { BrowserToolRequestOptions } from './browser-client.js';
export declare function resolveCwd(cwd: string, homeDir?: string): string;
export interface SdkAdapter {
    createSession(options: {
        cwd: string;
        sessionPath?: string;
    }): Promise<unknown>;
}
export interface BrowserToolExecutorLike {
    execute(tool: string, params: JsonObject, options?: BrowserToolRequestOptions): Promise<unknown>;
}
interface PiSdkModuleLike {
    DefaultResourceLoader: new (options: {
        cwd: string;
        agentDir?: string;
    }) => unknown;
    SessionManager?: {
        open(path: string, sessionDir?: string, cwdOverride?: string): unknown;
    };
    createAgentSession: (options: Record<string, unknown>) => Promise<unknown> | unknown;
    defineTool: (definition: Record<string, unknown>) => unknown;
    discoverAndLoadExtensions?: (...args: unknown[]) => Promise<unknown> | unknown;
    loadSkills?: (...args: unknown[]) => Promise<unknown> | unknown;
    getAgentDir?: () => string;
    initTheme?: (...args: unknown[]) => void;
}
export declare function resolveBrowserToolName(name: string): string;
export declare function createSdkSessionHost(adapter: SdkAdapter): {
    create(options: {
        cwd: string;
        sessionPath?: string;
    }): Promise<unknown>;
};
export declare function createBrowserToolDefinitions(sdk: Pick<PiSdkModuleLike, 'defineTool'>, executor: BrowserToolExecutorLike): unknown[];
export declare function createPiSdkAdapter({ sdk, browserToolExecutor }: {
    sdk: PiSdkModuleLike;
    browserToolExecutor: BrowserToolExecutorLike;
}): SdkAdapter;
export declare function loadPiSdk(): Promise<PiSdkModuleLike>;
export declare function createDefaultPiSdkAdapter(browserToolExecutor: BrowserToolExecutorLike): Promise<SdkAdapter>;
export {};
