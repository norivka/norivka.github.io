import { chromium } from 'playwright';
import dtek from '../lib/process-dtek-data.js';
import address from '../lib/process-dtek-address.js';
import { scheduleSnapshot } from '../lib/schedule-changes.js';

// Read-only probe: no storage, publication, notifications or session export.
const browser = await chromium.launch({ headless: process.env.HEADED !== 'true' });
const report = { checkedAt: new Date().toISOString(), steps: [] };
try {
    const context = await browser.newContext({ locale: 'uk-UA', timezoneId: 'Europe/Kyiv' });
    const page = await context.newPage();
    page.setDefaultTimeout(45000);
    const response = await page.goto('https://www.dtek-dnem.com.ua/ua/shutdowns/', {
        waitUntil: 'domcontentloaded', timeout: 45000,
    });
    report.httpStatus = response?.status();
    try {
        await page.waitForFunction(() => [...document.scripts].some(script =>
            /DisconSchedule\.fact\s*=/.test(script.textContent)) &&
            Boolean(document.querySelector('meta[name="csrf-token"]')), null, { timeout: 45000 });
    } catch { /* Record the resulting page even if the challenge never clears. */ }
    const html = await page.content();
    report.page = {
        title: await page.title(), bytes: Buffer.byteLength(html),
        hasProtectionScript: /_Incapsula_Resource/.test(html),
        hasSchedule: /DisconSchedule\.fact\s*=/.test(html),
        hasCsrf: await page.locator('meta[name="csrf-token"]').count() > 0,
        requestUnsuccessful: /Request unsuccessful/i.test(html),
    };
    try {
        const data = dtek.processData(html);
        scheduleSnapshot(data);
        report.steps.push({ name: 'schedule', ok: true, data });
    } catch (error) { report.steps.push({ name: 'schedule', ok: false, error: error.message }); }
    try {
        const result = await page.evaluate(async updateFact => {
            const csrf = document.querySelector('meta[name="csrf-token"]')?.content;
            if (!csrf) throw new Error('No CSRF token in browser session');
            const response = await fetch('/ua/ajax', {
                method: 'POST', credentials: 'same-origin', signal: AbortSignal.timeout(30000),
                headers: { 'X-CSRF-Token': csrf, 'X-Requested-With': 'XMLHttpRequest', Accept: 'application/json' },
                body: new URLSearchParams({ method: 'getHomeNum',
                    'data[0][name]': 'city', 'data[0][value]': 'с. Любимівка',
                    'data[1][name]': 'street', 'data[1][value]': 'вул. Центральна',
                    'data[2][name]': 'updateFact', 'data[2][value]': updateFact }),
            });
            if (!response.ok) throw new Error(`Address HTTP ${response.status}`);
            return response.json();
        }, address.formatUpdateFact());
        report.steps.push({ name: 'address', ok: true, data: address.processAddressData(result) });
    } catch (error) { report.steps.push({ name: 'address', ok: false, error: error.message }); }
} catch (error) {
    report.steps.push({ name: 'browser', ok: false, error: error.message });
} finally {
    await browser.close();
}
console.log(process.argv.includes('--machine')
    ? `DTEK_BROWSER_RESULT=${JSON.stringify(report)}` : JSON.stringify(report, null, 2));
if (report.steps.some(step => !step.ok)) process.exitCode = 1;
