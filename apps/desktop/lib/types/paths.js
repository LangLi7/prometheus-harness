/** Filesystem ownership for the Electron-managed desktop installation. */
import { join } from 'node:path';
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths';
/**
 * Resolve every Electron-owned path without changing the shared data roots.
 * @param dshHome - Harness home shared with npm-installed dsh.
 * @returns immutable desktop path set.
 */
export function resolveDesktopPaths(dshHome = resolveDshHome()) {
    return {
        profile: join(dshHome, 'profiles', 'desktop'),
        lock: join(dshHome, 'profiles', 'desktop', 'lock'),
    };
}
//# sourceMappingURL=paths.js.map