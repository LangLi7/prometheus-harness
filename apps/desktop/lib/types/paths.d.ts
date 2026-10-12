/** Filesystem ownership for the Electron-managed desktop installation. */
/** Stable desktop installation paths under the shared Harness home. */
export interface DesktopPaths {
    readonly profile: string;
    readonly lock: string;
}
/**
 * Resolve every Electron-owned path without changing the shared data roots.
 * @param dshHome - Harness home shared with npm-installed dsh.
 * @returns immutable desktop path set.
 */
export declare function resolveDesktopPaths(dshHome?: string): DesktopPaths;
//# sourceMappingURL=paths.d.ts.map