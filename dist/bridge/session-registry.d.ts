import type { SessionState } from '../protocol/index.js';
export interface CreateSessionOptions {
    cwd: string;
    sessionPath?: string;
    cookieAccessEnabled?: boolean;
    storageAccessEnabled?: boolean;
}
export interface SessionRegistry {
    createSession(options: CreateSessionOptions): SessionState;
    resumeSession(sessionPath: string, options: Omit<CreateSessionOptions, 'sessionPath'>): SessionState;
    getCurrentSession(): SessionState | undefined;
    setCookieAccess(enabled: boolean): SessionState;
    setStorageAccess(enabled: boolean): SessionState;
    setAutoApproveScripts(enabled: boolean): SessionState;
}
export declare function createSessionRegistry(createId?: () => string): SessionRegistry;
