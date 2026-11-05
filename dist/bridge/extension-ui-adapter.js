import { randomUUID } from 'node:crypto';
export function createExtensionUiAdapter({ broadcast }) {
    const pending = new Map();
    function request(kind, payload, options = {}) {
        if (options.signal?.aborted)
            return Promise.reject(options.signal.reason);
        const id = `ui-${randomUUID()}`;
        return new Promise((resolve, reject) => {
            const cleanup = () => {
                if (!pending.delete(id))
                    return false;
                clearTimeout(timer);
                options.signal?.removeEventListener('abort', onAbort);
                return true;
            };
            const cancel = (reason) => {
                if (!cleanup())
                    return;
                // Chrome 1.4 already understands this invalidation event. Notification is best effort.
                try {
                    broadcast({ type: 'extension_ui_request_timeout', id });
                }
                catch { }
                reject(reason);
            };
            const onAbort = () => cancel(options.signal?.reason ?? new Error('Request canceled'));
            const timer = setTimeout(() => cancel(new Error('Permission request expired')), 30_000);
            pending.set(id, {
                resolve(value) { if (cleanup())
                    resolve(value); },
                reject: cancel,
            });
            options.signal?.addEventListener('abort', onAbort, { once: true });
            if (options.signal?.aborted)
                return onAbort();
            try {
                broadcast({ id, type: 'extension_ui_request', kind, ...payload });
            }
            catch (error) {
                cancel(error);
            }
        });
    }
    return {
        async confirm(message, options) {
            return (await request('confirm', { message }, options)) === true;
        },
        async input(message) {
            return (await request('input', { message }));
        },
        notify(message) {
            broadcast({ type: 'extension_ui_notify', message });
        },
        respond(response) {
            const waiter = pending.get(response.id);
            if (!waiter)
                return false;
            waiter.resolve(response.value);
            return true;
        },
        cancelPending(reason = new Error('Session canceled')) {
            for (const waiter of pending.values())
                waiter.reject(reason);
        },
    };
}
//# sourceMappingURL=extension-ui-adapter.js.map