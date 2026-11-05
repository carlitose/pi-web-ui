export interface UiResponse {
    id: string;
    value: unknown;
}
export declare function createExtensionUiAdapter({ broadcast }: {
    broadcast: (message: Record<string, unknown>) => void;
}): {
    confirm(message: string, options?: {
        signal?: AbortSignal;
    }): Promise<boolean>;
    input(message: string): Promise<string>;
    notify(message: string): void;
    respond(response: UiResponse): boolean;
    cancelPending(reason?: unknown): void;
};
