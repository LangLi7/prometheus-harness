/** Mount the local React renderer before Electron reveals the welcome window. */
import '@deepseek-ai/dsh-client-ui-theme/src/styles/design-platform.css';
import '@deepseek-ai/dsh-client-ui-theme/src/styles/gradient-shadow-text.css';
import type { WelcomeApi } from '../welcome-api.ts';
declare global {
    interface Window {
        dshWelcome: WelcomeApi;
    }
}
//# sourceMappingURL=welcome.d.ts.map