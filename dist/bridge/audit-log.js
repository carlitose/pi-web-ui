import { appendFile } from 'node:fs/promises';
export function createAuditLog() {
    const log = [];
    return {
        record(entry) {
            log.push({ ...entry, timestamp: Date.now() });
        },
        entries() {
            return [...log];
        },
    };
}
export function createFileAuditLog(path) {
    return {
        async record(entry) {
            await appendFile(path, `${JSON.stringify({ ...entry, timestamp: Date.now() })}\n`);
        },
    };
}
//# sourceMappingURL=audit-log.js.map