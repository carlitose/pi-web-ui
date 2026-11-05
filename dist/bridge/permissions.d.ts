import type { BrowserToolName, JsonObject, SessionState } from '../protocol/index.js';
export type ToolPermissionDecision = {
    allowed: true;
} | {
    allowed: false;
    reason: string;
    requiresConfirmation?: boolean;
};
export declare function evaluateBrowserToolPermission(session: SessionState, tool: BrowserToolName, params?: JsonObject): ToolPermissionDecision;
