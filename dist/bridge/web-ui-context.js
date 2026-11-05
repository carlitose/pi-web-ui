import * as crypto from 'node:crypto';
/**
 * ExtensionUIContext implementation that delegates all UI operations
 * to the Chrome extension via WebSocket broadcast.
 */
export function createWebUiContext({ broadcast }) {
    const pending = new Map();
    const UI_REQUEST_TIMEOUT_MS = 30_000;
    function request(kind, payload, parseResponse, defaultValue) {
        const id = crypto.randomUUID();
        broadcast({ id, type: 'extension_ui_request', kind, ...payload });
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                pending.delete(id);
                resolve(defaultValue);
            }, UI_REQUEST_TIMEOUT_MS);
            pending.set(id, { resolve: (v) => { clearTimeout(timer); pending.delete(id); resolve(parseResponse(v)); }, reject, timer });
        });
    }
    function cleanup() {
        for (const [id, { reject, timer }] of pending) {
            clearTimeout(timer);
            reject(new Error('Session shutdown'));
            pending.delete(id);
        }
    }
    return {
        select(title, options, _opts) {
            return request('select', { title, options }, (r) => {
                if (typeof r === 'string')
                    return r;
                if (typeof r === 'object' && r !== null) {
                    if ('cancelled' in r && r.cancelled)
                        return undefined;
                    if ('value' in r)
                        return r.value ?? undefined;
                }
                return undefined;
            }, undefined);
        },
        confirm(title, message, _opts) {
            return request('confirm', { title, message }, (r) => {
                if (typeof r === 'object' && r !== null) {
                    if ('cancelled' in r && r.cancelled)
                        return false;
                    if ('confirmed' in r)
                        return r.confirmed ?? false;
                    if ('value' in r)
                        return Boolean(r.value);
                }
                return typeof r === 'boolean' ? r : false;
            }, false);
        },
        input(title, placeholder, _opts) {
            return request('input', { title, placeholder }, (r) => {
                if (typeof r === 'object' && r !== null) {
                    if ('cancelled' in r && r.cancelled)
                        return undefined;
                    if ('value' in r)
                        return r.value ?? undefined;
                }
                return typeof r === 'string' ? r : undefined;
            }, undefined);
        },
        notify(message, _type) {
            broadcast({ type: 'extension_ui_notify', message });
        },
        onTerminalInput() {
            return () => { };
        },
        setStatus(_key, _text) {
            // TUI-specific — no-op
        },
        setWorkingMessage(_message) {
            // TUI-specific — no-op
        },
        setWorkingVisible(_visible) {
            // TUI-specific — no-op
        },
        setWorkingIndicator(_options) {
            // TUI-specific — no-op
        },
        setHiddenThinkingLabel(_label) {
            // TUI-specific — no-op
        },
        setWidget(_key, _content, _options) {
            // TUI-specific — no-op
        },
        setFooter(_factory) {
            // TUI-specific — no-op
        },
        setHeader(_factory) {
            // TUI-specific — no-op
        },
        setTitle(_title) {
            // Not supported in web UI
        },
        async custom() {
            // TUI-only — not supported
            return undefined;
        },
        pasteToEditor(_text) {
            // Not supported in web UI
        },
        setEditorText(_text) {
            // Not supported in web UI
        },
        getEditorText() {
            return '';
        },
        async editor(_title, _prefill) {
            // Multi-line editor not supported in web UI
            return undefined;
        },
        addAutocompleteProvider() {
            // Not supported in web UI
        },
        setEditorComponent() {
            // Not supported in web UI
        },
        getEditorComponent() {
            return undefined;
        },
        get theme() {
            // No-op theme: returns plain text. The web UI uses CSS for styling,
            // so ANSI color codes are not needed. Extensions call theme.fg/bg/bold etc.
            const identity = (text) => text;
            const fg = (_color, text) => text;
            const bg = (_color, text) => text;
            return {
                name: 'default',
                colors: {},
                fg,
                bg,
                bold: identity,
                italic: identity,
                underline: identity,
                inverse: identity,
                strikethrough: identity,
                reset: identity,
            };
        },
        getAllThemes() {
            return [];
        },
        getTheme(_name) {
            return undefined;
        },
        setTheme(_theme) {
            return { success: false, error: 'Theme switching not supported in web UI' };
        },
        getToolsExpanded() {
            return false;
        },
        setToolsExpanded(_expanded) {
            // Not supported in web UI
        },
        respond(response) {
            const pendingRequest = pending.get(response.id);
            if (!pendingRequest)
                return false;
            pendingRequest.resolve(response.value);
            return true;
        },
        cleanup,
    };
}
//# sourceMappingURL=web-ui-context.js.map