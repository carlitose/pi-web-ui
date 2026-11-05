#!/usr/bin/env node
import { type PiWebUiController } from './launcher.js';
export declare function runCli(args?: string[], deps?: {
    controller?: PiWebUiController;
    cwd?: () => string;
    env?: NodeJS.ProcessEnv;
    write?: (text: string) => void;
}): Promise<void>;
