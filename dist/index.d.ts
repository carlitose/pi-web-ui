import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';
import { type PiWebUiController } from './pi-extension/launcher.js';
export declare function getController(): PiWebUiController | undefined;
export declare function setController(c: PiWebUiController | undefined): void;
export declare function createPiWebUiCommand(): {
    description: string;
    getArgumentCompletions: (prefix?: string) => {
        value: string;
        label: string;
    }[];
    handler: (args: string | undefined, ctx: ExtensionContext) => Promise<void>;
};
export declare function registerPiWebUiTools(pi: ExtensionAPI): void;
export default function createExtension(pi: ExtensionAPI): void;
