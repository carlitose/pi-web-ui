import { randomUUID } from 'node:crypto';
import { createBrowserToolRequest, isBrowserToolResponse } from '../protocol/index.js';
export function createBrowserClientRegistry(options = {}) {
    const sockets = new Set();
    const pending = new Map();
    return {
        addClient(socket) {
            sockets.add(socket);
            return {
                receive(message) {
                    const parsed = JSON.parse(message);
                    if (!isBrowserToolResponse(parsed))
                        return;
                    const waiter = pending.get(parsed.id);
                    if (!waiter || waiter.socket !== socket)
                        return;
                    if (parsed.success)
                        waiter.resolve(parsed.data);
                    else
                        waiter.reject(new Error(parsed.error ?? 'Browser tool request failed'));
                },
                disconnect() {
                    if (!sockets.delete(socket))
                        return;
                    for (const waiter of pending.values()) {
                        if (waiter.socket === socket)
                            waiter.reject(new Error('Chrome extension disconnected; action outcome is unknown. Do not automatically retry.'));
                    }
                    if (sockets.size === 0)
                        options.onEmpty?.();
                },
            };
        },
        count() { return sockets.size; },
        broadcast(message) {
            const serialized = JSON.stringify(message);
            console.log('[Bridge] Broadcasting to', sockets.size, 'client(s):', message.type);
            for (const socket of sockets)
                socket.send(serialized);
        },
        requestBrowserTool(tool, params, requestOptions = {}) {
            if (requestOptions.signal?.aborted)
                return Promise.reject(requestOptions.signal.reason);
            const [socket] = sockets;
            if (!socket)
                return Promise.reject(new Error('No Chrome extension client connected'));
            const id = `browser-tool-${randomUUID()}`;
            return new Promise((resolve, reject) => {
                const cleanup = () => {
                    if (!pending.delete(id))
                        return false;
                    clearTimeout(timer);
                    requestOptions.signal?.removeEventListener('abort', onAbort);
                    return true;
                };
                const fail = (error) => { if (cleanup())
                    reject(error); };
                const onAbort = () => fail(new Error('Browser tool request canceled; dispatched action outcome is unknown. Do not automatically retry.'));
                const timer = setTimeout(() => fail(new Error('Browser tool request timed out; action outcome is unknown. Do not automatically retry.')), 30_000);
                pending.set(id, { socket, resolve(value) { if (cleanup())
                        resolve(value); }, reject: fail });
                requestOptions.signal?.addEventListener('abort', onAbort, { once: true });
                if (requestOptions.signal?.aborted)
                    return onAbort();
                try {
                    socket.send(JSON.stringify(createBrowserToolRequest(id, tool, params)));
                }
                catch (error) {
                    fail(error instanceof Error ? error : new Error(String(error)));
                }
            });
        },
        cancelPending() {
            for (const waiter of pending.values())
                waiter.reject(new Error('Session canceled; dispatched action outcome is unknown. Do not automatically retry.'));
        },
    };
}
//# sourceMappingURL=browser-client.js.map