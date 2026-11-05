import { createServer } from 'node:http';
import * as fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { isClientCommand } from '../protocol/index.js';
import { createBrowserClientRegistry } from './browser-client.js';
import { createBrowserToolExecutor, parseAutoApproveEvaluateOrigins } from './browser-tools.js';
import { createSessionRegistry } from './session-registry.js';
import { parseStartContext } from './start-context.js';
import { attachWebSocketServer } from './websocket-server.js';
import { createDefaultPiSdkAdapter, resolveCwd, loadPiSdk } from './sdk-session.js';
import { createExtensionUiAdapter } from './extension-ui-adapter.js';
import { createWebUiContext } from './web-ui-context.js';
import { mergeCurrentModel, normalizeModelRegistry } from './model-list.js';
export function createBridgeApp(options) {
    const clients = createBrowserClientRegistry({ onEmpty: () => uiAdapter.cancelPending(new Error('Chrome extension disconnected')) });
    const uiAdapter = createExtensionUiAdapter({ broadcast: (msg) => clients.broadcast(msg) });
    const webUiContext = createWebUiContext({ broadcast: (msg) => clients.broadcast(msg) });
    const sessions = createSessionRegistry();
    sessions.createSession(options.context);
    const browserToolPolicy = { autoApproveEvaluateOrigins: parseAutoApproveEvaluateOrigins(process.env.PI_WEB_UI_AUTO_APPROVE_EVALUATE_ORIGINS) };
    let sdkSession;
    let cachedModels = [];
    let unsubscribeSdk;
    // Track whether the user requested an abort — suppress any message_end arriving after
    let aborted = false;
    function setupSdkSubscription(session) {
        // Clean up previous subscription
        unsubscribeSdk?.();
        console.log('[Bridge] Setting up SDK subscription, session:', typeof session, session ? 'exists' : 'null');
        // Subscribe to SDK session events and relay them to clients
        if (session && typeof session.subscribe === 'function') {
            console.log('[Bridge] SDK session has subscribe method, attaching listener');
            unsubscribeSdk = session.subscribe((event) => {
                try {
                    console.log('[Bridge] SDK event received:', event.type, event);
                    // SDK emits: message_end (with message.role), tool_execution_start/update/end, etc.
                    if (event.type === 'message_end' && event.message?.role === 'assistant') {
                        // Skip messages that arrive after the user clicked abort — the model may finish
                        // generating before the abort signal reaches the provider, resulting in a
                        // normal stopReason ("end_turn") instead of "aborted"
                        if (aborted) {
                            console.log('[Bridge] Suppressing assistant message_end — abort was requested');
                        }
                        else if (event.message.stopReason === 'aborted') {
                            console.log('[Bridge] Skipping aborted assistant message_end');
                        }
                        else {
                            // Extract text content from assistant message
                            const content = event.message.content;
                            const text = Array.isArray(content)
                                ? content.filter((c) => c.type === 'text').map((c) => c.text).join('\n')
                                : typeof content === 'string' ? content : JSON.stringify(content);
                            // Extract thinking block if present
                            let thinking;
                            if (Array.isArray(content)) {
                                const thinkingBlock = content.find((c) => c?.type === 'thinking');
                                if (thinkingBlock) {
                                    thinking = thinkingBlock.thinking || thinkingBlock.text || '';
                                }
                            }
                            console.log('[Bridge] Broadcasting assistant_message, text length:', text?.length ?? 0, 'thinking:', !!thinking);
                            if (text || thinking) {
                                const msg = { type: 'assistant_message', text: text || '' };
                                if (thinking)
                                    msg.thinking = thinking;
                                clients.broadcast(msg);
                            }
                            else {
                                console.log('[Bridge] No text or thinking content in assistant message_end event');
                            }
                        }
                    }
                    else if (event.type === 'tool_execution_start') {
                        console.log('[Bridge] Broadcasting tool_call:', event.toolName);
                        clients.broadcast({ type: 'tool_call', name: event.toolName ?? 'unknown', params: {} });
                    }
                    else if (event.type === 'tool_execution_end') {
                        console.log('[Bridge] Broadcasting tool_result:', event.toolName);
                        clients.broadcast({ type: 'tool_result', name: event.toolName ?? 'unknown', result: event.result });
                    }
                }
                catch (err) {
                    console.error('[Bridge] SDK subscription callback error:', err);
                    // Never let callback errors propagate — they would reject the SDK's prompt() call
                }
            });
        }
        else {
            console.log('[Bridge] SDK session missing or has no subscribe method');
        }
    }
    async function bindSessionExtensions(session) {
        if (!session || typeof session.bindExtensions !== 'function') {
            console.log('[Bridge] Skipping bindExtensions — session missing or no bindExtensions method');
            return;
        }
        try {
            console.log('[Bridge] Calling bindExtensions on session');
            await session.bindExtensions({
                uiContext: webUiContext,
                mode: 'rpc',
                commandContextActions: {
                    waitForIdle: () => {
                        if (sdkSession && typeof sdkSession.agent?.waitForIdle === 'function') {
                            return sdkSession.agent.waitForIdle();
                        }
                        return Promise.resolve();
                    },
                    newSession: async (_options) => {
                        // Defer to bridge command handler
                        return { cancelled: false };
                    },
                    switchSession: async (_sessionPath, _options) => {
                        // Defer to bridge command handler
                        return { cancelled: false };
                    },
                    fork: async (_entryId, _options) => {
                        return { cancelled: true };
                    },
                    navigateTree: async (_targetId, _options) => {
                        return { cancelled: true };
                    },
                    reload: async () => {
                        if (sdkSession && typeof sdkSession.reload === 'function') {
                            await sdkSession.reload();
                        }
                    },
                },
                onError: (err) => {
                    console.error('[Bridge] Extension error:', err?.extensionPath, err?.error);
                    clients.broadcast({ type: 'extension_ui_notify', message: `Extension error: ${err?.error || 'unknown'}` });
                },
            });
            console.log('[Bridge] bindExtensions completed');
            // Check if commands are now registered
            const runner = session._extensionRunner;
            if (runner?.getRegisteredCommands) {
                const cmds = runner.getRegisteredCommands();
                console.log('[Bridge] After bindExtensions: registered commands:', cmds?.length || 0);
                for (const cmd of cmds) {
                    console.log('[Bridge]   -', cmd.invocationName || cmd.name, ':', cmd.description);
                }
            }
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error('[Bridge] bindExtensions failed:', errorMessage);
        }
    }
    function listResources() {
        if (!sdkSession)
            return { commands: [], skills: [], templates: [] };
        const commands = [];
        const skills = [];
        const templates = [];
        // Built-in commands (handled by bridge, not extension runner)
        const builtInCommands = [
            { name: 'compact', description: 'Compact the conversation context', source: 'builtin', hasCompletions: false },
            { name: 'thinking', description: 'Cycle thinking level', source: 'builtin', hasCompletions: false },
        ];
        try {
            const runner = sdkSession._extensionRunner;
            console.log('[Bridge] listResources: _extensionRunner exists:', !!runner);
            if (runner?.getRegisteredCommands) {
                const registered = runner.getRegisteredCommands();
                console.log('[Bridge] listResources: registered commands:', registered?.length || 0);
                for (const cmd of registered) {
                    commands.push({
                        name: cmd.invocationName || cmd.name,
                        description: cmd.description || '',
                        source: cmd.sourceInfo?.path || 'extension',
                        hasCompletions: typeof cmd.getArgumentCompletions === 'function',
                    });
                }
            }
        }
        catch (e) {
            console.warn('[Bridge] Failed to list extension commands:', e);
        }
        // Prepend built-in commands
        commands.unshift(...builtInCommands);
        try {
            const loader = sdkSession.resourceLoader;
            console.log('[Bridge] listResources: resourceLoader exists:', !!loader);
            if (loader?.getSkills) {
                const skillList = loader.getSkills();
                console.log('[Bridge] listResources: skills:', skillList?.skills?.length || 0);
                for (const skill of skillList.skills || []) {
                    skills.push({ name: skill.name, description: skill.description || '' });
                }
            }
        }
        catch (e) {
            console.warn('[Bridge] Failed to list skills:', e);
        }
        try {
            const promptTemplates = sdkSession.promptTemplates;
            console.log('[Bridge] listResources: promptTemplates exists:', !!promptTemplates, 'isArray:', Array.isArray(promptTemplates));
            if (Array.isArray(promptTemplates)) {
                console.log('[Bridge] listResources: templates:', promptTemplates.length);
                for (const tmpl of promptTemplates) {
                    templates.push({
                        name: tmpl.name,
                        description: tmpl.description || '',
                        args: tmpl.args || [],
                    });
                }
            }
        }
        catch (e) {
            console.warn('[Bridge] Failed to list templates:', e);
        }
        console.log('[Bridge] listResources: returning', commands.length, 'commands,', skills.length, 'skills,', templates.length, 'templates');
        return { commands, skills, templates };
    }
    async function getCompletions(commandName, argsPrefix) {
        if (!sdkSession)
            return [];
        try {
            const runner = sdkSession._extensionRunner;
            if (!runner?.getCommand)
                return [];
            const cmd = runner.getCommand(commandName);
            if (!cmd?.getArgumentCompletions)
                return [];
            const results = await cmd.getArgumentCompletions(argsPrefix);
            return (results || []).map((r) => ({
                value: r.value || r.label || String(r),
                label: r.label || r.value || String(r),
                description: r.description || '',
            }));
        }
        catch (e) {
            console.warn('[Bridge] Failed to get completions:', e);
            return [];
        }
    }
    /**
     * Handle built-in slash commands (/compact, /thinking) directly in the bridge.
     * These commands are NOT registered as extension commands in the SDK — they are handled
     * at the interactive-mode level in the TUI. For the web UI, we handle them here.
     *
     * Returns synchronously (true/false) while spawning the actual work as fire-and-forget.
     * This is critical: the caller (handleClientCommand) must return immediately so that
     * session_state is broadcast to the websocket client. If we awaited the async work,
     * the client would never receive session_state until the user responded to the UI.
     *
     * @returns true if the command was handled, false if it should be forwarded to the SDK as a normal prompt
     */
    function handleSlashCommand(message, session, readyPromise, broadcastClients, uiContext) {
        if (!message.startsWith('/'))
            return false;
        const spaceIndex = message.indexOf(' ');
        const commandName = spaceIndex === -1 ? message.slice(1) : message.slice(1, spaceIndex);
        if (commandName === 'compact' || commandName === 'thinking') {
            // Spawn the actual command work as fire-and-forget
            void executeSlashCommand(commandName, session, readyPromise, broadcastClients, uiContext);
            return true;
        }
        return false; // Not a built-in slash command, forward to SDK
    }
    /** Execute the actual slash command work (fire-and-forget). */
    async function executeSlashCommand(commandName, session, readyPromise, broadcastClients, uiContext) {
        // Wait for SDK session to be ready if not yet available
        if (!session) {
            try {
                await readyPromise;
            }
            catch (e) {
                broadcastClients.broadcast({ type: 'bridge_error', error: 'SDK session not ready' });
                return;
            }
        }
        if (!session) {
            broadcastClients.broadcast({ type: 'bridge_error', error: 'SDK session not available' });
            return;
        }
        switch (commandName) {
            case 'compact':
                await handleSlashCompact(session, broadcastClients);
                break;
            case 'thinking':
                await handleSlashThinking(session, broadcastClients);
                break;
        }
    }
    /** Fetch and broadcast the model list to all clients. */
    async function broadcastModelList(session) {
        if (!session)
            return;
        try {
            const registry = normalizeModelRegistry(session);
            // The active model may still be broadcast even without a registry, but we
            // need one to enumerate the full available list.
            const currentModel = session.model;
            registry?.refresh();
            // getAvailable works across both SDK shapes: 0.78.x exposed a `modelRegistry`
            // facade with getAvailable(); 0.80.x exposes a raw `modelRuntime` with
            // getAvailableSnapshot(). normalizeModelRegistry() papers over that.
            const availableModels = registry ? await registry.getAvailable() : [];
            // Ensure the active/default model is always listed. It may be a
            // synthesized fallback (e.g. a default model id that doesn't exactly match
            // a registered built-in) and therefore absent from getAvailable(); without
            // this it would be invisible in the extension's model picker.
            const modelsToShow = mergeCurrentModel(availableModels ?? [], currentModel);
            if (modelsToShow.length === 0)
                return;
            // Cache the model objects so set_model can use the same instances
            cachedModels = modelsToShow.map((m) => ({
                provider: m.provider,
                id: m.id,
                name: m.name || m.id,
                _ref: m, // Keep a reference to the actual model object
            }));
            clients.broadcast({
                type: 'model_list',
                models: cachedModels,
                currentProvider: currentModel?.provider,
                currentModelId: currentModel?.id,
            });
        }
        catch (error) {
            console.warn('[Bridge] Failed to broadcast model list:', error);
        }
    }
    async function handleSlashCompact(session, broadcastClients) {
        try {
            if (typeof session.compact !== 'function') {
                broadcastClients.broadcast({ type: 'bridge_error', error: 'Session does not support compact' });
                return true;
            }
            broadcastClients.broadcast({ type: 'extension_ui_notify', message: 'Compacting conversation context...' });
            await session.compact();
            broadcastClients.broadcast({ type: 'compaction_done' });
            broadcastClients.broadcast({ type: 'extension_ui_notify', message: 'Context compacted successfully' });
            return true;
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error('[Bridge] /compact command failed:', error);
            broadcastClients.broadcast({ type: 'bridge_error', error: `Compaction failed: ${errorMessage}` });
            return true;
        }
    }
    async function handleSlashThinking(session, broadcastClients) {
        try {
            if (typeof session.cycleThinkingLevel !== 'function') {
                broadcastClients.broadcast({ type: 'bridge_error', error: 'Session does not support cycleThinkingLevel' });
                return true;
            }
            const result = await session.cycleThinkingLevel();
            const newLevel = result?.thinkingLevel || session.thinkingLevel || 'unknown';
            broadcastClients.broadcast({ type: 'thinking_changed', level: newLevel });
            broadcastClients.broadcast({ type: 'extension_ui_notify', message: `Thinking level changed to: ${newLevel}` });
            return true;
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error('[Bridge] /thinking command failed:', error);
            broadcastClients.broadcast({ type: 'bridge_error', error: `Thinking level change failed: ${errorMessage}` });
            return true;
        }
    }
    function cancelBrowserRequests() {
        uiAdapter.cancelPending();
        clients.cancelPending();
    }
    // Create browser tool executor for SDK integration
    const transport = {
        requestBrowserTool: async (tool, params, requestOptions = {}) => {
            const session = sessions.getCurrentSession() ?? { id: 'default', cwd: options.context.cwd, cookieAccessEnabled: options.context.cookieAccessEnabled, storageAccessEnabled: options.context.storageAccessEnabled };
            const executor = createBrowserToolExecutor({ ...clients, confirm: uiAdapter.confirm, input: uiAdapter.input, notify: uiAdapter.notify }, session, browserToolPolicy);
            return executor.execute(tool, params, requestOptions);
        },
    };
    // If no sdkHost provided, create one using the default Pi SDK adapter
    let sdkHost = options.sdkHost;
    if (!sdkHost) {
        console.log('[Bridge] Creating default Pi SDK adapter...');
        // Create SDK adapter asynchronously - it will be ready when first needed
        const sdkAdapterPromise = createDefaultPiSdkAdapter({ execute: transport.requestBrowserTool });
        sdkHost = {
            async create(createOptions) {
                console.log('[Bridge] Creating SDK session with options:', createOptions);
                const adapter = await sdkAdapterPromise;
                return adapter.createSession(createOptions);
            },
        };
    }
    let ready = sdkHost.create({ cwd: options.context.cwd, sessionPath: options.context.sessionPath }).then(async (session) => {
        sdkSession = session;
        console.log('[Bridge] SDK session created successfully, has prompt:', typeof session?.prompt);
        setupSdkSubscription(session);
        await bindSessionExtensions(session);
        // Broadcast available models to all connected clients
        void broadcastModelList(session);
    }).catch((error) => {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error('[Bridge] Failed to create SDK session:', error);
        clients.broadcast({ type: 'bridge_error', error: `SDK initialization failed: ${errorMessage}` });
    });
    const app = {
        // Expose browser clients for WebSocket server to register connections
        get browserClients() {
            return clients;
        },
        status() {
            return {
                running: true,
                pid: options.pid ?? process.pid,
                port: options.context.port,
                browserClients: clients.count(),
                session: sessions.getCurrentSession(),
                // Readiness only: /status serializes this object, and the SDK session carries the
                // whole Pi profile (system prompt, tools, skills), several megabytes.
                sdkReady: sdkSession !== undefined,
            };
        },
        async handleClientCommand(command) {
            switch (command.type) {
                case 'new_session': {
                    cancelBrowserRequests();
                    aborted = false;
                    const resolvedCwd = resolveCwd(command.cwd);
                    const session = sessions.createSession({ cwd: resolvedCwd });
                    // Clear chat history for the new session
                    clients.broadcast({ type: 'session_history', messages: [], cwd: resolvedCwd });
                    ready = sdkHost.create({ cwd: resolvedCwd }).then(async (created) => {
                        sdkSession = created;
                        setupSdkSubscription(created);
                        await bindSessionExtensions(created);
                        void broadcastModelList(created);
                    }).catch((error) => {
                        const errorMessage = error instanceof Error ? error.message : String(error);
                        console.error('Failed to create SDK session:', error);
                        clients.broadcast({ type: 'bridge_error', error: `SDK initialization failed: ${errorMessage}` });
                    });
                    return session;
                }
                case 'resume_session': {
                    cancelBrowserRequests();
                    aborted = false;
                    // 1. Build and broadcast session history (async, fires in background)
                    buildSessionHistory(command.sessionPath)
                        .then(({ messages, cwd: sessionCwd }) => {
                        const event = { type: 'session_history', messages };
                        if (sessionCwd)
                            event.cwd = sessionCwd;
                        clients.broadcast(event);
                    })
                        .catch((error) => {
                        const errorMessage = error instanceof Error ? error.message : String(error);
                        clients.broadcast({ type: 'session_error', error: `Failed to load session history: ${errorMessage}` });
                    });
                    // 2. Extract cwd from session file header (synchronous)
                    const sessionCwd = extractSessionCwdSync(command.sessionPath);
                    const resolvedCwd = sessionCwd ?? options.context.cwd;
                    console.log(`[Bridge] Resuming session from ${command.sessionPath}, cwd=${resolvedCwd}`);
                    // 3. Create session in registry with the session's own cwd
                    const session = sessions.resumeSession(command.sessionPath, { cwd: resolvedCwd });
                    // 4. Create SDK session with the session's own cwd so it operates in the correct directory
                    ready = sdkHost.create({ cwd: resolvedCwd, sessionPath: command.sessionPath }).then(async (created) => {
                        sdkSession = created;
                        setupSdkSubscription(created);
                        await bindSessionExtensions(created);
                        void broadcastModelList(created);
                    }).catch((error) => {
                        const errorMessage = error instanceof Error ? error.message : String(error);
                        console.error('Failed to create SDK session:', error);
                        clients.broadcast({ type: 'bridge_error', error: `SDK initialization failed: ${errorMessage}` });
                    });
                    return session;
                }
                case 'list_sessions': {
                    const resolvedCwd = resolveCwd(command.cwd);
                    listSessionsForCwd(resolvedCwd)
                        .then((sessionList) => {
                        clients.broadcast({ type: 'sessions_list', sessions: sessionList });
                    })
                        .catch((error) => {
                        const errorMessage = error instanceof Error ? error.message : String(error);
                        clients.broadcast({ type: 'session_error', error: `Failed to list sessions: ${errorMessage}` });
                    });
                    // Return the full current session so session_state doesn't overwrite sessionPath
                    return sessions.getCurrentSession();
                }
                case 'set_cookie_access':
                    return sessions.setCookieAccess(command.enabled);
                case 'set_storage_access':
                    return sessions.setStorageAccess(command.enabled);
                case 'set_auto_approve_scripts':
                    return sessions.setAutoApproveScripts(command.enabled);
                case 'prompt':
                    // Reset abort flag so the new prompt's response is allowed through
                    aborted = false;
                    console.log('[Bridge] Prompt received, sdkSession exists:', !!sdkSession, 'has prompt method:', typeof sdkSession?.prompt);
                    // Check for built-in slash commands and handle them directly (fire-and-forget)
                    const slashHandled = handleSlashCommand(command.message, sdkSession, ready, clients, webUiContext);
                    if (slashHandled) {
                        clients.broadcast({ type: 'prompt_received', message: command.message });
                        clients.broadcast({ type: 'prompt_sent', message: command.message });
                        return sessions.getCurrentSession();
                    }
                    // Queue prompt if SDK session isn't ready yet — retry once it becomes available
                    if (!sdkSession) {
                        console.log('[Bridge] SDK not ready, queuing prompt');
                        ready.then(() => {
                            console.log('[Bridge] SDK ready after queue, sdkSession exists:', !!sdkSession);
                            if (sdkSession && typeof sdkSession.prompt === 'function') {
                                console.log('[Bridge] Forwarding queued prompt to SDK');
                                sdkSession.prompt(command.message).then(() => {
                                    console.log('[Bridge] SDK prompt resolved, broadcasting prompt_sent');
                                    clients.broadcast({ type: 'prompt_sent', message: command.message });
                                }).catch((error) => {
                                    const errorMessage = error instanceof Error ? error.message : String(error);
                                    console.error('[Bridge] Failed to send prompt to Pi:', error);
                                    clients.broadcast({ type: 'prompt_error', message: command.message, error: errorMessage });
                                });
                            }
                            else {
                                const errorMsg = 'SDK session initialization failed — prompt not forwarded to model';
                                console.error('[Bridge]', errorMsg);
                                clients.broadcast({ type: 'prompt_error', message: command.message, error: errorMsg });
                            }
                        });
                    }
                    else if (typeof sdkSession.prompt === 'function') {
                        console.log('[Bridge] Sending prompt to SDK immediately');
                        sdkSession.prompt(command.message).then(() => {
                            console.log('[Bridge] SDK prompt resolved, broadcasting prompt_sent');
                            clients.broadcast({ type: 'prompt_sent', message: command.message });
                        }).catch((error) => {
                            const errorMessage = error instanceof Error ? error.message : String(error);
                            console.error('[Bridge] Failed to send prompt to Pi:', error);
                            clients.broadcast({ type: 'prompt_error', message: command.message, error: errorMessage });
                        });
                    }
                    else {
                        console.error('[Bridge] SDK session exists but has no prompt method');
                        clients.broadcast({ type: 'prompt_error', message: command.message, error: 'SDK session has no prompt method' });
                    }
                    // Also broadcast to clients for immediate UI feedback
                    console.log('[Bridge] Broadcasting prompt_received');
                    clients.broadcast({ type: 'prompt_received', message: command.message });
                    return sessions.getCurrentSession();
                case 'abort':
                    cancelBrowserRequests();
                    aborted = true;
                    console.log('[Bridge] Abort received, sdkSession exists:', !!sdkSession);
                    if (sdkSession) {
                        const abortMethod = sdkSession.abort;
                        console.log('[Bridge] sdkSession.abort type:', typeof abortMethod, 'is function:', typeof abortMethod === 'function');
                        console.log('[Bridge] sdkSession keys:', Object.keys(sdkSession));
                        if (typeof abortMethod === 'function') {
                            console.log('[Bridge] Calling sdkSession.abort() immediately');
                            const abortPromise = sdkSession.abort();
                            console.log('[Bridge] sdkSession.abort() returned promise:', !!abortPromise);
                            abortPromise.catch((error) => {
                                const errorMessage = error instanceof Error ? error.message : String(error);
                                console.error('[Bridge] sdkSession.abort() failed:', errorMessage);
                                clients.broadcast({ type: 'bridge_error', error: `Abort failed: ${errorMessage}` });
                            });
                        }
                        else {
                            console.log('[Bridge] Skipping sdkSession.abort() — no abort method on session');
                            console.log('[Bridge] Available methods on sdkSession:', Object.getOwnPropertyNames(Object.getPrototypeOf(sdkSession)));
                        }
                    }
                    else {
                        console.log('[Bridge] Skipping sdkSession.abort() — session not ready');
                    }
                    clients.broadcast({ type: 'abort_received' });
                    return sessions.getCurrentSession();
                case 'extension_ui_response':
                    const handledByUi = options.ui?.respond({ id: command.id, value: command.value });
                    const handledByWeb = webUiContext.respond({ id: command.id, value: command.value });
                    const handledByAdapter = uiAdapter.respond({ id: command.id, value: command.value });
                    return { handled: Boolean(handledByUi || handledByWeb || handledByAdapter) };
                case 'list_resources': {
                    // If SDK session isn't ready yet, wait for it
                    if (!sdkSession) {
                        console.log('[Bridge] list_resources: SDK not ready, waiting...');
                        ready.then(() => {
                            console.log('[Bridge] list_resources: SDK ready, sending resources');
                            const resources = listResources();
                            clients.broadcast({ type: 'resources_list', ...resources });
                        });
                    }
                    else {
                        const resources = listResources();
                        clients.broadcast({ type: 'resources_list', ...resources });
                    }
                    return sessions.getCurrentSession();
                }
                case 'get_completions': {
                    getCompletions(command.command, command.args)
                        .then((items) => {
                        clients.broadcast({ type: 'command_completions', items });
                    })
                        .catch((error) => {
                        const errorMessage = error instanceof Error ? error.message : String(error);
                        clients.broadcast({ type: 'extension_command_error', command: command.command, error: errorMessage });
                    });
                    return sessions.getCurrentSession();
                }
                case 'set_model': {
                    // Set model directly on the SDK session
                    if (!sdkSession) {
                        clients.broadcast({ type: 'bridge_error', error: 'SDK session not ready' });
                        return sessions.getCurrentSession();
                    }
                    // Use the cached model list (same objects sent to the extension)
                    let model = cachedModels.find((m) => m.provider === command.provider && (m.id === command.modelId || m.name === command.modelId));
                    // Fallback: if not in cache, fetch from registry
                    if (!model) {
                        const registry = normalizeModelRegistry(sdkSession);
                        if (registry) {
                            const availableModels = await registry.getAvailable();
                            const found = availableModels.find((m) => m.provider === command.provider && (m.id === command.modelId || m.name === command.modelId));
                            if (found) {
                                model = { provider: found.provider, id: found.id, name: found.name || found.id, _ref: found };
                                cachedModels.push(model);
                            }
                        }
                    }
                    if (!model) {
                        clients.broadcast({ type: 'bridge_error', error: `Model not found: ${command.provider}/${command.modelId}` });
                        return sessions.getCurrentSession();
                    }
                    // Set the model using the cached reference
                    if (typeof sdkSession.setModel === 'function') {
                        sdkSession.setModel(model._ref).then(() => {
                            clients.broadcast({
                                type: 'model_changed',
                                provider: model.provider,
                                modelId: model.id,
                                modelName: model.name || model.id,
                            });
                        }).catch((error) => {
                            const errorMessage = error instanceof Error ? error.message : String(error);
                            clients.broadcast({ type: 'bridge_error', error: `Failed to set model: ${errorMessage}` });
                        });
                    }
                    else {
                        clients.broadcast({ type: 'bridge_error', error: 'Session does not support setModel' });
                    }
                    return sessions.getCurrentSession();
                }
            }
        },
        async executeBrowserTool(tool, params, requestOptions = {}) {
            return transport.requestBrowserTool(tool, params, requestOptions);
        },
        get ready() {
            return ready;
        },
    };
    return app;
}
// ===== Session Resume Helpers =====
/**
 * Lists session files for a given working directory.
 * Returns session metadata sorted by timestamp (most recent first).
 * Uses listAll() + client-side filtering since SessionManager.list(cwd)
 * requires exact cwd match (path hash) which is fragile.
 */
async function listSessionsForCwd(cwd) {
    const { SessionManager } = (await loadPiSdk());
    if (!SessionManager)
        return [];
    const allSessions = await SessionManager.listAll();
    // Normalize the target cwd for comparison
    const normalizedCwd = cwd.replace(/\/+$/, ''); // strip trailing slashes
    console.log(`[Bridge] listSessionsForCwd: cwd="${normalizedCwd}", total sessions found: ${allSessions.length}`);
    const results = [];
    for (const info of allSessions) {
        const sessionCwd = info.cwd.replace(/\/+$/, '');
        // Match by cwd — both absolute paths should match
        if (sessionCwd === normalizedCwd) {
            results.push({
                path: info.path,
                name: info.name || undefined,
                timestamp: info.modified.toISOString(),
                firstMessage: info.firstMessage || undefined,
            });
        }
    }
    console.log(`[Bridge] listSessionsForCwd: matched ${results.length} sessions for cwd="${normalizedCwd}"`);
    // Sort by timestamp descending (most recent first)
    results.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return results;
}
/**
 * Extract the cwd from a session file header (synchronous).
 * Session files are JSONL - the first line is the session header with cwd.
 * Returns undefined if the file doesn't exist or has no valid header.
 */
function extractSessionCwdSync(sessionPath) {
    try {
        if (!fs.existsSync(sessionPath))
            return undefined;
        const fd = fs.openSync(sessionPath, 'r');
        try {
            const buffer = Buffer.alloc(4096);
            const bytesRead = fs.readSync(fd, buffer, 0, buffer.length, 0);
            const firstLine = buffer.toString('utf8', 0, bytesRead).split('\n')[0].trim();
            if (!firstLine)
                return undefined;
            const header = JSON.parse(firstLine);
            if (header.type !== 'session')
                return undefined;
            return typeof header.cwd === 'string' && header.cwd ? header.cwd : undefined;
        }
        finally {
            fs.closeSync(fd);
        }
    }
    catch {
        return undefined;
    }
}
/**
 * Builds session history from a JSONL session file.
 * Returns an array of SessionHistoryMessage objects for UI display,
 * along with the cwd from the session header.
 */
async function buildSessionHistory(sessionPath) {
    const { SessionManager } = (await loadPiSdk());
    if (!SessionManager)
        throw new Error('SessionManager is not available in the host Pi SDK');
    const manager = SessionManager.open(sessionPath);
    const context = manager.buildSessionContext();
    const messages = [];
    for (const entry of context.messages) {
        try {
            if (entry.role === 'user') {
                messages.push(mapUserAgentMessage(entry));
            }
            else if (entry.role === 'assistant') {
                messages.push(mapAssistantAgentMessage(entry));
            }
            else if (entry.role === 'toolResult') {
                messages.push(mapToolResultAgentMessage(entry));
            }
            // Other roles (system, etc.) are skipped for UI display
        }
        catch (error) {
            console.warn(`[Bridge] Failed to map message entry:`, error);
        }
    }
    // Extract cwd from session header via SessionManager
    const cwd = manager.getCwd?.();
    return { messages, cwd };
}
function extractAgentText(content) {
    if (typeof content === 'string')
        return content;
    if (Array.isArray(content)) {
        return content
            .filter((c) => c && typeof c === 'object' && c.type === 'text')
            .map((c) => c.text || '')
            .join('\n');
    }
    return JSON.stringify(content);
}
function mapUserAgentMessage(entry) {
    const content = entry.content || '';
    const text = typeof content === 'string' ? content : extractAgentText(content);
    // Check for image attachments
    if (Array.isArray(content)) {
        const imageBlock = content.find((c) => c?.type === 'image');
        if (imageBlock) {
            return {
                role: 'user',
                text,
                image: {
                    data: imageBlock.data || imageBlock.url || '',
                    mimeType: imageBlock.mimeType || imageBlock.contentType || 'image/png',
                },
            };
        }
    }
    return { role: 'user', text };
}
function mapAssistantAgentMessage(entry) {
    const content = entry.content || '';
    const text = typeof content === 'string' ? content : extractAgentText(content);
    // Extract thinking block if present
    let thinking;
    if (Array.isArray(content)) {
        const thinkingBlock = content.find((c) => c?.type === 'thinking');
        if (thinkingBlock) {
            thinking = thinkingBlock.thinking || thinkingBlock.text || '';
        }
    }
    return { role: 'assistant', text, thinking: thinking || undefined };
}
function mapToolResultAgentMessage(entry) {
    const content = entry.content || '';
    const text = typeof content === 'string' ? content : extractAgentText(content);
    // Try to extract tool name from content or entry metadata
    const toolName = entry.toolName || entry.name || 'tool';
    return {
        role: 'tool',
        toolName,
        toolResult: text,
        isError: entry.isError || false,
    };
}
function sendJson(response, status, body) {
    response.writeHead(status, { 'content-type': 'application/json' });
    response.end(JSON.stringify(body));
}
async function readBody(request) {
    const chunks = [];
    for await (const chunk of request)
        chunks.push(Buffer.from(chunk));
    return Buffer.concat(chunks).toString('utf8');
}
export function createHttpServer(context, sdkHost) {
    const app = createBridgeApp({ context, sdkHost });
    const server = createServer(async (request, response) => {
        if (request.method === 'GET' && request.url === '/status')
            return sendJson(response, 200, app.status());
        if (request.method === 'GET' && request.url === '/open') {
            response.writeHead(200, { 'content-type': 'text/plain' });
            response.end('Pi Web UI bridge is running. Open the Chrome extension side panel to continue.');
            return;
        }
        if (request.method === 'POST' && request.url === '/stop') {
            sendJson(response, 200, { stopped: true });
            server.close(() => process.exit(0));
            return;
        }
        if (request.method === 'POST' && request.url === '/command') {
            const parsed = JSON.parse(await readBody(request));
            if (!isClientCommand(parsed))
                return sendJson(response, 400, { error: 'Invalid client command' });
            return sendJson(response, 200, await app.handleClientCommand(parsed));
        }
        if (request.method === 'POST' && request.url === '/browser-tool') {
            const controller = new AbortController();
            const onClose = () => {
                if (!response.writableEnded)
                    controller.abort(new Error('Browser tool client disconnected'));
            };
            response.once('close', onClose);
            const timer = setTimeout(() => controller.abort(new Error('Browser tool request expired')), 30_000);
            try {
                const { tool, params } = JSON.parse(await readBody(request));
                if (!tool)
                    return sendJson(response, 400, { error: 'Missing tool name' });
                const result = await app.executeBrowserTool(tool, params ?? {}, { signal: controller.signal });
                if (!response.destroyed)
                    return sendJson(response, 200, result);
            }
            catch (error) {
                if (!response.destroyed)
                    return sendJson(response, controller.signal.aborted ? 504 : 500, { error: error instanceof Error ? error.message : String(error) });
            }
            finally {
                clearTimeout(timer);
                response.removeListener('close', onClose);
            }
            return;
        }
        return sendJson(response, 404, { error: 'Not found' });
    });
    attachWebSocketServer(server, app);
    // Expose app for callers that need to wait for SDK readiness
    server._app = app;
    return server;
}
export async function main() {
    const context = parseStartContext(process.env.PI_WEB_UI_START_CONTEXT);
    const server = createHttpServer(context);
    // Wait for SDK session to be ready before accepting connections
    const app = server._app;
    await app.ready;
    // Loopback only: /browser-tool has no authentication, and the Chrome extension connects to 127.0.0.1.
    server.listen(context.port, '127.0.0.1');
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
    void main();
}
//# sourceMappingURL=server.js.map