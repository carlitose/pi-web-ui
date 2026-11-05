import type { JsonObject } from '../protocol/index.js';
/**
 * ExtensionUIContext implementation that delegates all UI operations
 * to the Chrome extension via WebSocket broadcast.
 */
export declare function createWebUiContext({ broadcast }: {
    broadcast: (message: JsonObject) => void;
}): {
    select(title: string, options: string[], _opts?: unknown): Promise<string | undefined>;
    confirm(title: string, message: string, _opts?: unknown): Promise<boolean>;
    input(title: string, placeholder: string, _opts?: unknown): Promise<string | undefined>;
    notify(message: string, _type?: string): void;
    onTerminalInput(): () => void;
    setStatus(_key: string, _text: string): void;
    setWorkingMessage(_message: string): void;
    setWorkingVisible(_visible: boolean): void;
    setWorkingIndicator(_options: unknown): void;
    setHiddenThinkingLabel(_label: string): void;
    setWidget(_key: string, _content: unknown, _options?: unknown): void;
    setFooter(_factory: unknown): void;
    setHeader(_factory: unknown): void;
    setTitle(_title: string): void;
    custom(): Promise<undefined>;
    pasteToEditor(_text: string): void;
    setEditorText(_text: string): void;
    getEditorText(): string;
    editor(_title: string, _prefill?: string): Promise<string | undefined>;
    addAutocompleteProvider(): void;
    setEditorComponent(): void;
    getEditorComponent(): undefined;
    readonly theme: {
        name: string;
        colors: {};
        fg: (_color: string, text: string) => string;
        bg: (_color: string, text: string) => string;
        bold: (text: string) => string;
        italic: (text: string) => string;
        underline: (text: string) => string;
        inverse: (text: string) => string;
        strikethrough: (text: string) => string;
        reset: (text: string) => string;
    };
    getAllThemes(): Array<{
        name: string;
    }>;
    getTheme(_name: string): undefined;
    setTheme(_theme: unknown): {
        success: boolean;
        error: string;
    };
    getToolsExpanded(): boolean;
    setToolsExpanded(_expanded: boolean): void;
    respond(response: {
        id: string;
        value: unknown;
    }): boolean;
    cleanup: () => void;
};
