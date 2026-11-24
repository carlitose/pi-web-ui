import { describe, expect, it } from 'vitest';
import { evaluateBrowserToolPermission } from '../permissions.js';

const session = { id: 's', cwd: '/', cookieAccessEnabled: false, storageAccessEnabled: false } as never;

describe('opening pages', () => {
  it('allows http(s) pages and the link reader', () => {
    expect(evaluateBrowserToolPermission(session, 'tabs.create', { url: 'https://www.hattrick.org/Club/Matches/' })).toEqual({ allowed: true });
    expect(evaluateBrowserToolPermission(session, 'tabs.create', { url: 'http://example.com' })).toEqual({ allowed: true });
    expect(evaluateBrowserToolPermission(session, 'page.getLinks', { tabId: 3 })).toEqual({ allowed: true });
  });

  it('refuses every other address without asking', () => {
    for (const url of ['javascript:alert(1)', 'file:///C:/x', 'chrome://settings', 'data:text/html,x', 'not a url', undefined]) {
      expect(evaluateBrowserToolPermission(session, 'tabs.create', { url } as never)).toEqual({ allowed: false, reason: 'Only http(s) pages can be opened' });
    }
  });
});
