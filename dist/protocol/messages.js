export const DEFAULT_BRIDGE_PORT = 43117;
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
export function isClientCommand(value) {
    if (!isRecord(value) || typeof value.type !== 'string')
        return false;
    switch (value.type) {
        case 'prompt':
            return typeof value.message === 'string';
        case 'abort':
            return true;
        case 'new_session':
            return typeof value.cwd === 'string';
        case 'resume_session':
            return typeof value.sessionPath === 'string';
        case 'list_sessions':
            return typeof value.cwd === 'string';
        case 'set_cookie_access':
        case 'set_storage_access':
        case 'set_auto_approve_scripts':
            return typeof value.enabled === 'boolean';
        case 'extension_ui_response':
            return typeof value.id === 'string';
        case 'list_resources':
            return true;
        case 'get_completions':
            return typeof value.command === 'string' && typeof value.args === 'string';
        case 'set_model':
            return typeof value.provider === 'string' && typeof value.modelId === 'string';
        default:
            return false;
    }
}
//# sourceMappingURL=messages.js.map