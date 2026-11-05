export interface BridgeStartContext {
    cwd: string;
    sessionPath?: string;
    cookieAccessEnabled: boolean;
    storageAccessEnabled: boolean;
    port: number;
}
export declare function parseStartContext(serialized: string | undefined): BridgeStartContext;
