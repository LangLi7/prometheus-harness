/** Electron Node-mode child lifecycle for the shared Web application. */
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { desktopNodeEnvironment } from "./node-environment.js";
/** Quit inspection deadline; a slower Host counts as unknown work and the shell asks before quitting. */
export const QUIT_INSPECTION_DEADLINE_MS = 2_000;
const MAX_HOST_DIAGNOSTIC_CHARS = 64 * 1024;
function isDesktopHostEvent(message) {
    if (typeof message !== 'object' || message === null || !('type' in message))
        return false;
    const candidate = message;
    switch (candidate.type) {
        case 'shutdown-complete':
            return true;
        case 'ready':
            return typeof candidate.url === 'string';
        case 'platform-session': {
            const session = candidate.session;
            if (session === null)
                return true;
            if (typeof session !== 'object' || !('origin' in session) || !('token' in session)
                || typeof session.origin !== 'string' || typeof session.token !== 'string' || session.token.length === 0)
                return false;
            if (!('userId' in session) || (session.userId !== null
                && (typeof session.userId !== 'string' || session.userId.length === 0)))
                return false;
            if ('embeddedPageDist' in session && typeof session.embeddedPageDist !== 'string')
                return false;
            if ('requestHeaders' in session && (typeof session.requestHeaders !== 'object' || session.requestHeaders === null
                || Array.isArray(session.requestHeaders)
                || Object.entries(session.requestHeaders).some(([name, value]) => typeof value !== 'string'
                    || name !== name.toLowerCase() || /[\r\n]/.test(value)
                    || ['authorization', 'x-dsh-auth-token', 'host', 'content-length', 'transfer-encoding', 'connection', 'content-type'].includes(name))))
                return false;
            try {
                const url = new URL(session.origin);
                return url.origin === session.origin && !url.username && !url.password
                    && (url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)));
            }
            catch {
                return false;
            }
        }
        case 'fatal':
            return typeof candidate.message === 'string' && (candidate.diagnostic === undefined || typeof candidate.diagnostic === 'string');
        case 'update-tasks':
            return Number.isSafeInteger(candidate.requestId) && typeof candidate.active === 'boolean'
                && (candidate.error === undefined || typeof candidate.error === 'string');
        case 'quit-inspection':
            return Number.isSafeInteger(candidate.requestId) && typeof candidate.activeTasks === 'boolean'
                && typeof candidate.scheduledTasks === 'boolean' && (candidate.error === undefined || typeof candidate.error === 'string');
        default:
            return false;
    }
}
async function exitsWithin(exit, milliseconds) {
    let timer;
    const timeout = new Promise((resolve) => {
        timer = setTimeout(() => { resolve(false); }, milliseconds);
        timer.unref();
    });
    try {
        return await Promise.race([exit.then(() => true), timeout]);
    }
    finally {
        if (timer !== undefined)
            clearTimeout(timer);
    }
}
/** The child has exited, but task teardown did not finish successfully. */
export class DesktopHostUncleanExitError extends Error {
}
/**
 * A Host failure reported over IPC before the process exited. `message` is what
 * the Host chose to show; `diagnostic` is its complete inspected error, kept
 * separately so a crash report can print it verbatim instead of a string escaped
 * inside another error's properties.
 */
export class DesktopHostFatalError extends Error {
    #diagnostic;
    /**
     * @param message - The Host's failure message.
     * @param diagnostic - The Host's inspected error, when the Host supplied one.
     */
    constructor(message, diagnostic) {
        super(message);
        this.#diagnostic = diagnostic;
    }
    /** The Host's inspected error; a getter so `util.inspect` of this error does not repeat it as an escaped property. */
    get diagnostic() { return this.#diagnostic; }
}
/** One Web backend running under the Electron executable in Node mode. */
export class DesktopHostProcess {
    node;
    runtimeDir;
    projectDir;
    inspectPort;
    environment;
    onFailure;
    primaryRuntime;
    packageManager;
    onPlatformSession;
    child;
    readyResolve;
    readyReject;
    readyPromise = new Promise((resolve, reject) => {
        this.readyResolve = resolve;
        this.readyReject = reject;
    });
    exitPromise;
    stderr = '';
    failureReported = false;
    stopping = false;
    shutdownCompleted = false;
    nextControlId = 1;
    controlRequests = new Map();
    /**
     * @param node - Absolute Electron executable in Node mode.
     * @param runtimeDir - Immutable packages carried by the current application.
     * @param projectDir - Desktop plugin profile and child working directory.
     * @param inspectPort - Optional loopback inspector port for workspace development.
     * @param environment - Environment inherited by the Host and its plugin subprocesses.
     * @param onFailure - Receives the first unexpected child failure, including after readiness.
     * @param primaryRuntime - Optional bundled dependency payload; when supplied, missing sibling
     *   `office-skills` resources fail Host startup.
     * @param packageManager - Bundled pnpm entry and Node launcher directory, scoped to package operations.
     * @param onPlatformSession - Private credential updates for embedded Platform views.
     */
    constructor(node, runtimeDir, projectDir, inspectPort, environment = process.env, onFailure, primaryRuntime, packageManager, onPlatformSession) {
        this.node = node;
        this.runtimeDir = runtimeDir;
        this.projectDir = projectDir;
        this.inspectPort = inspectPort;
        this.environment = environment;
        this.onFailure = onFailure;
        this.primaryRuntime = primaryRuntime;
        this.packageManager = packageManager;
        this.onPlatformSession = onPlatformSession;
    }
    /**
     * Start this child once and await its Web application URL.
     * @returns Ready facts supplied by the child after application startup.
     */
    async start() {
        if (this.child !== undefined)
            return this.readyPromise;
        const entry = join(this.runtimeDir, 'node_modules', '@deepseek-ai', 'dsh-desktop-host', 'lib', 'index.js');
        const child = spawn(this.node, [
            '--expose-internals',
            ...(this.inspectPort === undefined ? [] : [`--inspect=127.0.0.1:${String(this.inspectPort)}`]),
            entry,
            this.runtimeDir,
            this.projectDir,
            this.primaryRuntime ?? join(this.runtimeDir, '..', 'runtime', 'primary-runtime'),
            ...this.packageManager === undefined ? [] : [this.packageManager.pnpm, this.packageManager.nodeBin],
        ], {
            cwd: this.projectDir,
            env: desktopNodeEnvironment(this.node, undefined, this.environment),
            stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
        });
        this.child = child;
        child.stderr?.setEncoding('utf8');
        child.stderr?.on('data', (chunk) => { this.stderr = (this.stderr + chunk).slice(-MAX_HOST_DIAGNOSTIC_CHARS); });
        child.stdout?.pipe(process.stdout);
        child.on('message', (message) => {
            if (!isDesktopHostEvent(message)) {
                this.fail(new Error('dsh desktop host sent an invalid IPC event'));
                child.kill('SIGTERM');
                return;
            }
            if (message.type === 'ready')
                this.readyResolve({ url: message.url, injections: message.injections });
            else if (message.type === 'platform-session')
                this.onPlatformSession?.(message.session);
            else if (message.type === 'shutdown-complete') {
                if (this.stopping)
                    this.shutdownCompleted = true;
                else
                    this.fail(new Error('dsh desktop host acknowledged an unrequested shutdown'));
            }
            else if (message.type === 'fatal')
                this.fail(new DesktopHostFatalError(message.message, message.diagnostic));
            else {
                const request = this.controlRequests.get(message.requestId);
                if (message.error === undefined)
                    request?.resolve(message);
                else
                    request?.reject(new Error(message.error));
            }
        });
        child.once('error', (error) => { this.fail(error); });
        this.exitPromise = new Promise((resolve) => {
            child.once('close', (code) => {
                const suffix = this.stderr.trim() === '' ? '' : `: ${this.stderr.trim()}`;
                if (code !== 0 && code !== null)
                    this.fail(new Error(`dsh desktop host exited with ${String(code)}${suffix}`));
                else
                    this.fail(new Error(`dsh desktop host stopped${suffix}`));
                resolve();
            });
        });
        return this.readyPromise;
    }
    /**
     * Inspect active work or lock request admission for update handoff.
     * @param action - Read-only inspection, admission lock, or recovery unlock.
     * @returns Whether live tasks would be affected. Locking drains admitted API requests before inspecting tasks;
     * an unanswered drain fails at the control-request deadline without authorizing installation.
     */
    async updateTasks(action) {
        const response = await this.control({ type: 'update-tasks', action }, 10_000, 'desktop update: task inspection timed out');
        if (response.type !== 'update-tasks')
            throw new Error('desktop update: Host answered with a different control response');
        return response.active;
    }
    /**
     * Ask the Host what quitting now would interrupt.
     * @returns Active tasks and armed scheduled reminders; rejects when the Host is unavailable or misses
     * {@link QUIT_INSPECTION_DEADLINE_MS}, and the shell then asks before quitting.
     */
    async inspectQuit() {
        const response = await this.control({ type: 'quit-inspection' }, QUIT_INSPECTION_DEADLINE_MS, 'desktop quit: inspection timed out');
        if (response.type !== 'quit-inspection')
            throw new Error('desktop quit: Host answered with a different control response');
        return { activeTasks: response.activeTasks, scheduledTasks: response.scheduledTasks };
    }
    async control(request, deadlineMs, deadlineMessage) {
        const child = this.child;
        if (child === undefined || !child.connected || this.failureReported || this.stopping) {
            throw new Error(`${request.type === 'update-tasks' ? 'desktop update' : 'desktop quit'}: Host is unavailable`);
        }
        const requestId = this.nextControlId++;
        let timer;
        try {
            return await new Promise((resolve, reject) => {
                this.controlRequests.set(requestId, { resolve, reject });
                timer = setTimeout(() => { reject(new Error(deadlineMessage)); }, deadlineMs);
                child.send({ ...request, requestId }, (error) => { if (error !== null)
                    reject(error); });
            });
        }
        finally {
            clearTimeout(timer);
            this.controlRequests.delete(requestId);
        }
    }
    /**
     * Request teardown and await child exit, escalating termination when needed.
     * @param requireGraceful - Reject update handoff after forced termination or unsuccessful child exit.
     * @returns Completion of owned process teardown. DesktopHostUncleanExitError confirms exit but refuses installation;
     * other failures do not confirm exit.
     */
    async stop(requireGraceful = false) {
        const child = this.child;
        if (child === undefined)
            return;
        this.stopping = true;
        this.onPlatformSession?.(null);
        if (child.connected)
            child.send({ type: 'shutdown' }, (error) => { if (error !== null)
                this.fail(error); });
        const exited = this.exitPromise ?? Promise.resolve();
        const graceful = await exitsWithin(exited, 10_000);
        if (!graceful)
            child.kill('SIGTERM');
        if (!await exitsWithin(exited, 5_000)) {
            child.kill('SIGKILL');
            if (!await exitsWithin(exited, 5_000)) {
                throw new Error('dsh desktop host did not exit after SIGKILL');
            }
        }
        this.child = undefined;
        if (requireGraceful && (!graceful || child.exitCode !== 0 || !this.shutdownCompleted)) {
            // This diagnostic reaches expandable UI; arbitrary plugin stderr can contain credentials.
            throw new DesktopHostUncleanExitError(`desktop update: Host did not complete graceful task teardown (exit ${String(child.exitCode)}, signal ${String(child.signalCode)}, shutdown acknowledged ${String(this.shutdownCompleted)}, graceful deadline exceeded ${String(!graceful)})`);
        }
    }
    fail(error) {
        this.onPlatformSession?.(null);
        this.readyReject(error);
        for (const request of this.controlRequests.values())
            request.reject(error);
        this.controlRequests.clear();
        if (!this.failureReported && !this.stopping) {
            this.failureReported = true;
            try {
                this.onFailure?.(error);
            }
            catch (listenerError) {
                console.error('desktop host failure listener failed', listenerError);
            }
        }
    }
}
//# sourceMappingURL=host-process.js.map