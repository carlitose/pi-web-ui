export declare const DEFAULT_BRIDGE_PORT = 43117;
export type ClientCommand = {
    type: 'prompt';
    message: string;
} | {
    type: 'abort';
} | {
    type: 'new_session';
    cwd: string;
} | {
    type: 'resume_session';
    sessionPath: string;
} | {
    type: 'list_sessions';
    cwd: string;
} | {
    type: 'set_cookie_access';
    enabled: boolean;
} | {
    type: 'set_storage_access';
    enabled: boolean;
} | {
    type: 'set_auto_approve_scripts';
    enabled: boolean;
} | {
    type: 'extension_ui_response';
    id: string;
    value: unknown;
} | {
    type: 'list_resources';
} | {
    type: 'get_completions';
    command: string;
    args: string;
} | {
    type: 'set_model';
    provider: string;
    modelId: string;
};
export type SessionHistoryMessage = {
    role: 'user';
    text: string;
    image?: {
        data: string;
        mimeType: string;
    };
} | {
    role: 'assistant';
    text: string;
    thinking?: string;
} | {
    role: 'tool';
    toolName: string;
    toolResult: string;
    isError: boolean;
} | {
    role: 'bash';
    command: string;
    output: string;
    exitCode: number | null;
    isError: boolean;
} | {
    role: 'compaction';
    summary: string;
    tokensBefore: number;
};
export type ServerEvent = {
    type: 'session_state';
    session: unknown;
} | {
    type: 'prompt_received';
    message: string;
} | {
    type: 'prompt_sent';
    message: string;
} | {
    type: 'prompt_error';
    message: string;
    error: string;
} | {
    type: 'assistant_message';
    text: string;
    thinking?: string;
} | {
    type: 'tool_call';
    name: string;
    params: unknown;
} | {
    type: 'tool_result';
    name: string;
    result: unknown;
} | {
    type: 'extension_ui_request';
    id: string;
    kind: string;
    message: string;
    options?: unknown;
} | {
    type: 'extension_ui_notify';
    message: string;
} | {
    type: 'bridge_error';
    error: string;
} | {
    type: 'sessions_list';
    sessions: Array<{
        path: string;
        name?: string;
        timestamp: string;
        firstMessage?: string;
    }>;
} | {
    type: 'session_history';
    messages: Array<SessionHistoryMessage>;
    cwd?: string;
} | {
    type: 'resources_list';
    commands: CommandInfo[];
    skills: SkillInfo[];
    templates: TemplateInfo[];
} | {
    type: 'command_completions';
    items: CompletionItem[];
} | {
    type: 'extension_command_error';
    command: string;
    error: string;
} | {
    type: 'model_changed';
    provider: string;
    modelId: string;
    modelName?: string;
} | {
    type: 'thinking_changed';
    level: string;
} | {
    type: 'compaction_done';
    summary?: string;
    tokensBefore?: number;
} | {
    type: 'model_list';
    models: Array<{
        provider: string;
        id: string;
        name: string;
    }>;
    currentProvider?: string;
    currentModelId?: string;
};
export interface CommandInfo {
    name: string;
    description: string;
    source: string;
    hasCompletions: boolean;
}
export interface SkillInfo {
    name: string;
    description: string;
}
export interface TemplateInfo {
    name: string;
    description: string;
    args: string[];
}
export interface CompletionItem {
    value: string;
    label: string;
    description?: string;
}
export declare function isClientCommand(value: unknown): value is ClientCommand;
