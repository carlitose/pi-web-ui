export function createBrowserToolRequest(id, tool, params = {}) {
    return { id, type: 'browser_tool_request', tool, params };
}
export function createBrowserToolResponse(id, success, data, error) {
    return { id, type: 'browser_tool_response', success, ...(data === undefined ? {} : { data }), ...(error === undefined ? {} : { error }) };
}
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
export function isBrowserToolRequest(value) {
    return (isRecord(value) &&
        value.type === 'browser_tool_request' &&
        typeof value.id === 'string' &&
        typeof value.tool === 'string' &&
        isRecord(value.params));
}
export function isBrowserToolResponse(value) {
    return (isRecord(value) &&
        value.type === 'browser_tool_response' &&
        typeof value.id === 'string' &&
        typeof value.success === 'boolean' &&
        (value.error === undefined || typeof value.error === 'string'));
}
//# sourceMappingURL=browser-tools.js.map