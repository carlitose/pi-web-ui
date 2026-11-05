import { spawn as nodeSpawn } from 'node:child_process';
export function getChromeCommandCandidates(platform) {
    if (platform === 'darwin')
        return ['open'];
    if (platform === 'win32')
        return ['cmd'];
    return ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'vivaldi-stable', 'vivaldi', 'xdg-open'];
}
function argsFor(command, url) {
    if (command === 'open')
        return ['-a', 'Google Chrome', url];
    if (command === 'cmd')
        return ['/c', 'start', 'chrome', url];
    return [url];
}
function spawnChild(command, url, spawn) {
    return new Promise((resolve, reject) => {
        const child = spawn(command, argsFor(command, url), { detached: true, stdio: 'ignore' });
        child.unref?.();
        child.on('error', (error) => {
            const err = error;
            reject(err.code === 'ENOENT' ? new Error(`ENOENT: ${command}`) : error);
        });
        // Fire-and-forget: resolve immediately after spawn succeeds.
        // Browser launchers like xdg-open may not emit 'exit' reliably.
        setImmediate(resolve);
    });
}
export function createChromeOpener(deps = {}) {
    const spawn = deps.spawn ?? nodeSpawn;
    const platform = deps.platform ?? process.platform;
    return {
        async open({ port }) {
            const candidates = getChromeCommandCandidates(platform);
            const url = 'https://chromewebstore.google.com/detail/pi-coding-agent-web-ui/clhbmkkjcoknpbkicpfalmapgogeikhi?hl=en-US&utm_source=ext_sidebar';
            for (const command of candidates) {
                try {
                    await spawnChild(command, url, spawn);
                    return;
                }
                catch (error) {
                    const msg = error.message ?? '';
                    if (!msg.startsWith('ENOENT:'))
                        throw error;
                }
            }
            throw new Error(`Chrome browser not found. Tried: ${candidates.join(', ')}. Please install Google Chrome or Chromium.`);
        },
    };
}
//# sourceMappingURL=chrome.js.map