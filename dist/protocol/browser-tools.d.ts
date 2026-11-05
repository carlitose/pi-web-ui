export type BrowserToolName = 'tabs.list' | 'tabs.getCurrent' | 'tabs.select' | 'page.getHtml' | 'page.getText' | 'page.getSelection' | 'page.captureScreenshot' | 'console.getLogs' | 'console.clearLogBuffer' | 'network.startCapture' | 'network.stopCapture' | 'network.getRequests' | 'network.getRequest' | 'network.getResponseBody' | 'debugger.attach' | 'debugger.detach' | 'debugger.getAttachedTabs' | 'debugger.sendCdpCommand' | 'debugger.evaluateScript' | 'cookies.get' | 'storage.getLocal' | 'storage.getSession' | (string & {});
export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | {
    [key: string]: JsonValue;
};
export type JsonObject = {
    [key: string]: JsonValue;
};
export interface BrowserToolRequest {
    id: string;
    type: 'browser_tool_request';
    tool: BrowserToolName;
    params: JsonObject;
}
export interface BrowserToolResponse {
    id: string;
    type: 'browser_tool_response';
    success: boolean;
    data?: JsonValue;
    error?: string;
}
export declare function createBrowserToolRequest(id: string, tool: BrowserToolName, params?: JsonObject): BrowserToolRequest;
export declare function createBrowserToolResponse(id: string, success: boolean, data?: JsonValue, error?: string): BrowserToolResponse;
export declare function isBrowserToolRequest(value: unknown): value is BrowserToolRequest;
export declare function isBrowserToolResponse(value: unknown): value is BrowserToolResponse;
