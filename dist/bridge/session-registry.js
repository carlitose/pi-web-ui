export function createSessionRegistry(createId = () => crypto.randomUUID()) {
    let current;
    function requireCurrent() {
        if (!current)
            throw new Error('No active Pi Web UI session');
        return current;
    }
    return {
        createSession(options) {
            current = {
                id: createId(),
                cwd: options.cwd,
                ...(options.sessionPath ? { sessionPath: options.sessionPath } : {}),
                cookieAccessEnabled: options.cookieAccessEnabled ?? false,
                storageAccessEnabled: options.storageAccessEnabled ?? false,
                autoApproveScriptsEnabled: false,
            };
            return current;
        },
        resumeSession(sessionPath, options) {
            return this.createSession({ ...options, sessionPath });
        },
        getCurrentSession() {
            return current;
        },
        setCookieAccess(enabled) {
            current = { ...requireCurrent(), cookieAccessEnabled: enabled };
            return current;
        },
        setStorageAccess(enabled) {
            current = { ...requireCurrent(), storageAccessEnabled: enabled };
            return current;
        },
        setAutoApproveScripts(enabled) {
            current = { ...requireCurrent(), autoApproveScriptsEnabled: enabled };
            return current;
        },
    };
}
//# sourceMappingURL=session-registry.js.map