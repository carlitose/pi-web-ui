export interface AuditEntry {
    timestamp: number;
    action: string;
    params?: unknown;
}
export declare function createAuditLog(): {
    record(entry: Omit<AuditEntry, "timestamp">): void;
    entries(): AuditEntry[];
};
export declare function createFileAuditLog(path: string): {
    record(entry: Omit<AuditEntry, "timestamp">): Promise<void>;
};
