/** Electron Node-mode child lifecycle for the shared Web application. */
import type { PlatformSession } from '@deepseek-ai/dsh-deepseek-account';
/** What quitting now would affect, as reported by the Host. */
export interface DesktopQuitInspection {
    readonly activeTasks: boolean;
    readonly scheduledTasks: boolean;
}
/** Quit inspection deadline; a slower Host counts as unknown work and the shell asks before quitting. */
export declare const QUIT_INSPECTION_DEADLINE_MS = 2000;
/** Browser authentication URL reported by the running Web application. */
export interface DesktopHostReady {
    readonly url: string;
    readonly injections?: readonly unknown[] | undefined;
}
/** The child has exited, but task teardown did not finish successfully. */
export declare class DesktopHostUncleanExitError extends Error {
}
/**
 * A Host failure reported over IPC before the process exited. `message` is what
 * the Host chose to show; `diagnostic` is its complete inspected error, kept
 * separately so a crash report can print it verbatim instead of a string escaped
 * inside another error's properties.
 */
export declare class DesktopHostFatalError extends Error {
    #private;
    /**
     * @param message - The Host's failure message.
     * @param diagnostic - The Host's inspected error, when the Host supplied one.
     */
    constructor(message: string, diagnostic: string | undefined);
    /** The Host's inspected error; a getter so `util.inspect` of this error does not repeat it as an escaped property. */
    get diagnostic(): string | undefined;
}
/** One Web backend running under the Electron executable in Node mode. */
export declare class DesktopHostProcess {
    private readonly node;
    private readonly runtimeDir;
    private readonly projectDir;
    private readonly inspectPort?;
    private readonly environment;
    private readonly onFailure?;
    private readonly primaryRuntime?;
    private readonly packageManager?;
    private readonly onPlatformSession?;
    private child;
    private readyResolve;
    private readyReject;
    private readonly readyPromise;
    private exitPromise;
    private stderr;
    private failureReported;
    private stopping;
    private shutdownCompleted;
    private nextControlId;
    private readonly controlRequests;
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
    constructor(node: string, runtimeDir: string, projectDir: string, inspectPort?: number | undefined, environment?: NodeJS.ProcessEnv, onFailure?: ((error: Error) => void) | undefined, primaryRuntime?: string | undefined, packageManager?: {
        readonly pnpm: string;
        readonly nodeBin: string;
    } | undefined, onPlatformSession?: ((session: PlatformSession | null) => void) | undefined);
    /**
     * Start this child once and await its Web application URL.
     * @returns Ready facts supplied by the child after application startup.
     */
    start(): Promise<DesktopHostReady>;
    /**
     * Inspect active work or lock request admission for update handoff.
     * @param action - Read-only inspection, admission lock, or recovery unlock.
     * @returns Whether live tasks would be affected. Locking drains admitted API requests before inspecting tasks;
     * an unanswered drain fails at the control-request deadline without authorizing installation.
     */
    updateTasks(action: 'inspect' | 'lock' | 'unlock'): Promise<boolean>;
    /**
     * Ask the Host what quitting now would interrupt.
     * @returns Active tasks and armed scheduled reminders; rejects when the Host is unavailable or misses
     * {@link QUIT_INSPECTION_DEADLINE_MS}, and the shell then asks before quitting.
     */
    inspectQuit(): Promise<DesktopQuitInspection>;
    private control;
    /**
     * Request teardown and await child exit, escalating termination when needed.
     * @param requireGraceful - Reject update handoff after forced termination or unsuccessful child exit.
     * @returns Completion of owned process teardown. DesktopHostUncleanExitError confirms exit but refuses installation;
     * other failures do not confirm exit.
     */
    stop(requireGraceful?: boolean): Promise<void>;
    private fail;
}
//# sourceMappingURL=host-process.d.ts.map