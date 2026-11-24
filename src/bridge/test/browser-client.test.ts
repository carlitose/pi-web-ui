import { describe, expect, it, vi } from 'vitest';
import { createBrowserClientRegistry } from '../browser-client.js';

describe('browser client registry', () => {
  it('tracks connected clients and broadcasts JSON messages', () => {
    const send = vi.fn();
    const registry = createBrowserClientRegistry();

    const client = registry.addClient({ send });
    registry.broadcast({ type: 'session_state', id: 'session-1' });

    expect(registry.count()).toBe(1);
    expect(send).toHaveBeenCalledWith(JSON.stringify({ type: 'session_state', id: 'session-1' }));

    client.disconnect();
    expect(registry.count()).toBe(0);
  });

  it('sends browser tool requests to the first connected client', async () => {
    const sent: string[] = [];
    const registry = createBrowserClientRegistry();
    const client = registry.addClient({ send: (message) => sent.push(message) });

    const pending = registry.requestBrowserTool('console.getLogs', { tabId: 'active' });
    const request = JSON.parse(sent[0]!);
    client.receive(JSON.stringify({ id: request.id, type: 'browser_tool_response', success: true, data: { logs: [] } }));

    await expect(pending).resolves.toEqual({ logs: [] });
  });

  it('rejects tool requests when no browser client is connected', async () => {
    const registry = createBrowserClientRegistry();

    await expect(registry.requestBrowserTool('console.getLogs', {})).rejects.toThrow('No Chrome extension client connected');
  });

  function profile(registry: ReturnType<typeof createBrowserClientRegistry>, tabs: number[], sent: Array<{ tool: string; params: unknown }>) {
    const client = registry.addClient({
      send(message) {
        const request = JSON.parse(message);
        sent.push({ tool: request.tool, params: request.params });
        const data = request.tool === 'tabs.list' ? { tabs: tabs.map((id) => ({ id, url: `https://site-${id}` })) } : { text: `tab ${request.params.tabId}` };
        queueMicrotask(() => client.receive(JSON.stringify({ id: request.id, type: 'browser_tool_response', success: true, data })));
      },
    });
    return client;
  }

  it('lists tabs from every connected Chrome profile', async () => {
    const registry = createBrowserClientRegistry();
    profile(registry, [1, 2], []);
    profile(registry, [30], []);

    await expect(registry.requestBrowserTool('tabs.list', {})).resolves.toEqual({
      tabs: [{ id: 1, url: 'https://site-1' }, { id: 2, url: 'https://site-2' }, { id: 30, url: 'https://site-30' }],
    });
  });

  it('routes a tab tool to the profile that owns the tab, discovering it when unknown', async () => {
    const registry = createBrowserClientRegistry();
    const firstSent: Array<{ tool: string; params: unknown }> = [];
    const secondSent: Array<{ tool: string; params: unknown }> = [];
    profile(registry, [1], firstSent);
    profile(registry, [30], secondSent);

    await expect(registry.requestBrowserTool('page.getText', { tabId: 30 })).resolves.toEqual({ text: 'tab 30' });
    expect(secondSent.map((entry) => entry.tool)).toEqual(['tabs.list', 'page.getText']);
    expect(firstSent.map((entry) => entry.tool)).toEqual(['tabs.list']);
  });

  it('keeps other profiles listed when one profile fails, and forgets tabs of a disconnected profile', async () => {
    const registry = createBrowserClientRegistry();
    const broken = registry.addClient({
      send(message) {
        const request = JSON.parse(message);
        queueMicrotask(() => broken.receive(JSON.stringify({ id: request.id, type: 'browser_tool_response', success: false, error: 'boom' })));
      },
    });
    const sent: Array<{ tool: string; params: unknown }> = [];
    const healthy = profile(registry, [7], sent);

    await expect(registry.requestBrowserTool('tabs.list', {})).resolves.toEqual({ tabs: [{ id: 7, url: 'https://site-7' }] });
    healthy.disconnect();
    await expect(registry.requestBrowserTool('tabs.list', {})).rejects.toThrow('boom');
  });

  it('opens a page in the profile of its opener tab', async () => {
    const registry = createBrowserClientRegistry();
    const firstSent: Array<{ tool: string; params: unknown }> = [];
    const secondSent: Array<{ tool: string; params: unknown }> = [];
    profile(registry, [1], firstSent);
    profile(registry, [30], secondSent);

    await registry.requestBrowserTool('tabs.create', { url: 'https://www.hattrick.org/', openerTabId: 30 });
    expect(secondSent.map((entry) => entry.tool)).toEqual(['tabs.list', 'tabs.create']);
    expect(firstSent.map((entry) => entry.tool)).toEqual(['tabs.list']);
  });
});
