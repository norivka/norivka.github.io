import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export async function fetchDtekBrowser() {
    // Install only when HTTP failed. Setup failure is caught by collectData,
    // so it cannot prevent publication of other successful sources.
    const cwd = fileURLToPath(new URL('..', import.meta.url));
    console.log('DTEK HTTP failed; preparing Chromium fallback');
    execFileSync(process.execPath, ['node_modules/playwright/cli.js', 'install', '--with-deps', 'chromium'], {
        cwd, timeout: 180000, stdio: 'inherit',
    });
    const result = spawnSync(process.execPath, [
        fileURLToPath(new URL('./diagnose-dtek-browser.mjs', import.meta.url)), '--machine',
    ], { timeout: 150000, killSignal: 'SIGKILL', encoding: 'utf8', maxBuffer: 2 * 1024 * 1024 });
    if (result.error || result.signal) throw new Error('Browser fallback timed out or could not start');
    // A nonzero status can still contain one successful source; preserve it.
    const line = result.stdout?.split('\n').find(line => line.startsWith('DTEK_BROWSER_RESULT='));
    if (!line) throw new Error(`Browser fallback produced no report (exit ${result.status})`);
    return JSON.parse(line.slice('DTEK_BROWSER_RESULT='.length));
}
