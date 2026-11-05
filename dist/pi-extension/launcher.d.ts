import { type JsonObject, type JsonValue } from '../protocol/index.js';
import { type BridgeProcessManager } from './bridge-process.js';
import { type ChromeOpener } from './chrome.js';
export type PiWebUiCommand = 'start' | 'stop' | 'status' | 'open';
export interface TerminalContext {
    cwd: string;
    sessionPath?: string;
}
export interface PiWebUiController {
    start(context: TerminalContext): Promise<string>;
    stop(): Promise<string>;
    status(): Promise<string>;
    open(): Promise<string>;
    requestBrowserTool(tool: string, params: JsonObject, options?: {
        signal?: AbortSignal;
    }): Promise<JsonValue | undefined>;
}
export declare function parsePiWebUiCommand(args: string[]): {
    command: PiWebUiCommand;
};
export declare function createPiWebUiController(deps?: {
    bridge?: BridgeProcessManager;
    chrome?: ChromeOpener;
}): PiWebUiController;
