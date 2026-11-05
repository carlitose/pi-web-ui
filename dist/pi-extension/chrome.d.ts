import { spawn as nodeSpawn, type ChildProcess } from 'node:child_process';
export interface ChromeOpenOptions {
    port: number;
}
export interface ChromeOpener {
    open(options: ChromeOpenOptions): Promise<void>;
}
type Platform = NodeJS.Platform;
type Spawn = (command: string, args: string[], options: Parameters<typeof nodeSpawn>[2]) => ChildProcess;
export declare function getChromeCommandCandidates(platform: Platform): string[];
export declare function createChromeOpener(deps?: {
    spawn?: Spawn;
    platform?: Platform;
}): ChromeOpener;
export {};
