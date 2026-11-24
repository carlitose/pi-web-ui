import { randomUUID } from 'node:crypto';
import { createBrowserToolRequest, isBrowserToolResponse, type BrowserToolName, type JsonObject, type JsonValue } from '../protocol/index.js';

export interface BrowserSocketLike {
  send(message: string): void;
}

export interface BrowserClient {
  receive(message: string): void;
  disconnect(): void;
}

export interface BrowserToolRequestOptions {
  signal?: AbortSignal;
}

export interface BrowserClientRegistry {
  addClient(socket: BrowserSocketLike): BrowserClient;
  count(): number;
  broadcast(message: JsonObject): void;
  requestBrowserTool(tool: BrowserToolName, params: JsonObject, options?: BrowserToolRequestOptions): Promise<JsonValue | undefined>;
  cancelPending(): void;
}

export function createBrowserClientRegistry(options: { onEmpty?: () => void } = {}): BrowserClientRegistry {
  const sockets = new Set<BrowserSocketLike>();
  const pending = new Map<string, { socket: BrowserSocketLike; resolve(value: JsonValue | undefined): void; reject(error: Error): void }>();
  const tabOwners = new Map<number, BrowserSocketLike>();

  function sendTo(socket: BrowserSocketLike, tool: BrowserToolName, params: JsonObject, requestOptions: BrowserToolRequestOptions): Promise<JsonValue | undefined> {
    if (requestOptions.signal?.aborted) return Promise.reject(requestOptions.signal.reason);
    const id = `browser-tool-${randomUUID()}`;
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        if (!pending.delete(id)) return false;
        clearTimeout(timer);
        requestOptions.signal?.removeEventListener('abort', onAbort);
        return true;
      };
      const fail = (error: Error) => { if (cleanup()) reject(error); };
      const onAbort = () => fail(new Error('Browser tool request canceled; dispatched action outcome is unknown. Do not automatically retry.'));
      const timer = setTimeout(() => fail(new Error('Browser tool request timed out; action outcome is unknown. Do not automatically retry.')), 30_000);
      pending.set(id, { socket, resolve(value) { if (cleanup()) resolve(value); }, reject: fail });
      requestOptions.signal?.addEventListener('abort', onAbort, { once: true });
      if (requestOptions.signal?.aborted) return onAbort();
      try { socket.send(JSON.stringify(createBrowserToolRequest(id, tool, params))); }
      catch (error) { fail(error instanceof Error ? error : new Error(String(error))); }
    });
  }

  // tabs.list is read-only, so it is safe to ask every profile; one failing profile does not hide the others.
  async function listAllTabs(requestOptions: BrowserToolRequestOptions): Promise<JsonValue> {
    const targets = [...sockets];
    const results = await Promise.allSettled(targets.map((socket) => sendTo(socket, 'tabs.list', {}, requestOptions)));
    const tabs: JsonValue[] = [];
    let firstError: unknown;
    results.forEach((result, index) => {
      if (result.status === 'rejected') { firstError ??= result.reason; return; }
      const listed = (result.value as { tabs?: unknown } | undefined)?.tabs;
      if (!Array.isArray(listed)) return;
      for (const tab of listed as JsonValue[]) {
        const id = (tab as { id?: unknown } | null)?.id;
        if (typeof id === 'number') tabOwners.set(id, targets[index]);
        tabs.push(tab);
      }
    });
    if (results.every((result) => result.status === 'rejected')) throw firstError;
    return { tabs };
  }

  return {
    addClient(socket) {
      sockets.add(socket);
      return {
        receive(message) {
          const parsed = JSON.parse(message) as unknown;
          if (!isBrowserToolResponse(parsed)) return;
          const waiter = pending.get(parsed.id);
          if (!waiter || waiter.socket !== socket) return;
          if (parsed.success) waiter.resolve(parsed.data);
          else waiter.reject(new Error(parsed.error ?? 'Browser tool request failed'));
        },
        disconnect() {
          if (!sockets.delete(socket)) return;
          for (const [tabId, owner] of tabOwners) if (owner === socket) tabOwners.delete(tabId);
          for (const waiter of pending.values()) {
            if (waiter.socket === socket) waiter.reject(new Error('Chrome extension disconnected; action outcome is unknown. Do not automatically retry.'));
          }
          if (sockets.size === 0) options.onEmpty?.();
        },
      };
    },
    count() { return sockets.size; },
    broadcast(message) {
      const serialized = JSON.stringify(message);
      console.log('[Bridge] Broadcasting to', sockets.size, 'client(s):', message.type);
      for (const socket of sockets) socket.send(serialized);
    },
    async requestBrowserTool(tool, params, requestOptions = {}) {
      if (requestOptions.signal?.aborted) throw requestOptions.signal.reason;
      const [first] = sockets;
      if (!first) throw new Error('No Chrome extension client connected');
      // Each Chrome profile connects its own extension client. Tab ids are unique within one
      // Chrome process, so list tabs from every profile and route tab tools to the owner.
      if (tool === 'tabs.list') return listAllTabs(requestOptions);
      // tabs.create opens next to its opener, so it belongs to the opener's profile.
      const tabId = typeof params.tabId === 'number' ? params.tabId : params.openerTabId;
      if (typeof tabId === 'number') {
        if (!tabOwners.has(tabId) && sockets.size > 1) await listAllTabs(requestOptions).catch(() => undefined);
        const owner = tabOwners.get(tabId);
        if (owner && sockets.has(owner)) return sendTo(owner, tool, params, requestOptions);
      }
      return sendTo(first, tool, params, requestOptions);
    },
    cancelPending() {
      for (const waiter of pending.values()) waiter.reject(new Error('Session canceled; dispatched action outcome is unknown. Do not automatically retry.'));
    },
  };
}
