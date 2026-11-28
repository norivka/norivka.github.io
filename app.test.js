const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const warning = {
    sub_type: 'Аварійні ремонтні роботи',
    start_date: '23:16 31.10.2026', end_date: '10:50 01.11.2026',
    lastUpdate: '2026-11-01T06:40:00Z', sourceUpdate: '08:31 01.11.2026'
};
const schedule = { days: [], lastUpdate: '2026-11-01T06:00:00Z' };

function element() {
    return {
        hidden: true, children: [], innerHTML: '', textContent: '',
        replaceChildren() { this.children = []; },
        append(child) { this.children.push(child); }
    };
}

function createApp(fetch, dataBaseUrl = '', search = '') {
    const content = element();
    const notice = element();
    const freshness = element();
    const indicator = element();
    const emergency = element();
    const context = vm.createContext({
        AbortSignal, URLSearchParams,
        window: { location: { search }, OUTAGE_DATA_BASE_URL: dataBaseUrl },
        fetch, console: { error() {} }, setInterval() {}, clearInterval() {},
        document: {
            hidden: true,
            getElementById: id => ({ content, 'dtek-notice': notice, 'data-freshness': freshness,
                'schedule-update': indicator, 'yasno-emergency': emergency }[id]),
            createElement: element,
            addEventListener() {}, querySelectorAll: () => []
        }
    });
    for (const script of ['schedule-source.js', 'app.js']) {
        vm.runInContext(fs.readFileSync(path.join(__dirname, script), 'utf8'), context);
    }
    return { context, content, notice, freshness, indicator, emergency };
}

const response = data => ({ ok: true, json: async () => data });
const settle = () => new Promise(resolve => setImmediate(resolve));
const noticeText = notice => notice.children.map(line => line.textContent).join('\n');

test('schedule download failure still displays the independent address warning', async () => {
    const { content, notice } = createApp(async url => {
        if (url.startsWith('data/dtek-address.json')) return response(warning);
        throw new Error('schedule unavailable');
    });
    await settle();
    assert.match(content.innerHTML, /Помилка завантаження/);
    assert.equal(notice.hidden, false);
    const text = noticeText(notice);
    assert.equal(notice.children[0].textContent, `⚠️ ${warning.sub_type}`);
    assert.equal(text.split(warning.sub_type).length - 1, 1);
    assert.equal(notice.children[1].textContent, 'Початок: 31.10 23:16');
    assert.equal(notice.children[2].textContent, 'Завершення: орієнтовно 01.11 10:50');
    assert.match(text, /Інформацію оновлено:.*08:31/);
});

test('address download failure still renders the schedule', async () => {
    const { content, notice } = createApp(async url => {
        if (url.startsWith('data/dtek-address.json')) throw new Error('address unavailable');
        return response(schedule);
    });
    await settle();
    assert.match(content.innerHTML, /Інформація щодо графіків відсутня/);
    assert.equal(notice.hidden, true);
});

test('empty address fields remove a prior warning, including its update time', async () => {
    const { context, notice } = createApp(async url => response(
        url.startsWith('data/dtek-address.json') ? warning : schedule
    ));
    await settle();
    assert.equal(notice.hidden, false);
    context.emptyAddress = { sub_type: '', start_date: '', end_date: '', lastUpdate: warning.lastUpdate };
    vm.runInContext('renderDtekNotice(emptyAddress)', context);
    assert.equal(notice.hidden, true);
    assert.equal(notice.children.length, 0);
});

test('upstream message markup is rendered as literal text', async () => {
    const sub_type = '<img src=x onerror=alert(1)> Аварійні роботи';
    const { notice } = createApp(async url => response(
        url.startsWith('data/dtek-address.json') ? { ...warning, sub_type } : schedule
    ));
    await settle();
    assert.equal(notice.children[0].textContent, `⚠️ ${sub_type}`);
    assert.equal(notice.innerHTML, '');
});

test('compares both timestamps on every refresh, including ties and legacy source links', async () => {
    const dtek = { ...schedule, group: 'GPV2.1',
        days: [{ isToday: true, date: '2026-11-01', outages: [{ start: 60, end: 120 }] }] };
    const yasno = { ...schedule, group: '2.1',
        days: [{ isToday: true, date: '2026-11-01', outages: [{ start: 300, end: 360 }] }] };
    const { context, content, indicator, notice } = createApp(async url => response(
        url.includes('dtek-address') ? warning : url.includes('dtek-outages') ? dtek : yasno
    ), '', '?source=yasno');
    await settle();
    assert.match(indicator.textContent, /Останнє оновлення: .* \(ДТЕК\)$/);
    assert.match(content.innerHTML, /01:00 — 02:00/);
    yasno.lastUpdate = '2026-11-01T08:00:01+02:00';
    await vm.runInContext('loadSchedule()', context);
    assert.match(indicator.textContent, /Останнє оновлення: .* \(ЯСНО\)$/);
    assert.match(content.innerHTML, /05:00 — 06:00/);
    assert.equal(notice.hidden, false);
    dtek.lastUpdate = '2026-11-01T06:00:02Z';
    await vm.runInContext('loadSchedule()', context);
    assert.match(indicator.textContent, /Останнє оновлення: .* \(ДТЕК\)$/);
});

test('uses the available schedule if one source fails', async () => {
    for (const [missingFile, expected] of [['dtek-outages.json', 'ЯСНО'], ['data/outages.json', 'ДТЕК']]) {
        const { indicator, content } = createApp(async url => {
            if (url.includes(missingFile)) throw new Error('offline');
            return response(url.includes('dtek-address') ? warning : schedule);
        });
        await settle();
        assert.ok(indicator.textContent.endsWith(`(${expected})`));
        assert.doesNotMatch(content.innerHTML, /Помилка завантаження/);
    }
});

test('address warning is positioned before all schedule content in the page', () => {
    const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
    assert.ok(html.indexOf('id="dtek-notice"') < html.indexOf('id="content"'));
});


test('loads both schedules and the address from the configured data host', async () => {
    const urls = [];
    createApp(async url => {
        urls.push(url.split('?')[0]);
        return response(url.includes('dtek-address') ? warning : schedule);
    }, 'https://norivka-outages.example.workers.dev/');
    await settle();
    const base = 'https://norivka-outages.example.workers.dev/data/';
    assert.deepEqual(urls.sort(), ['dtek-address.json', 'dtek-outages.json', 'outages.json'].map(file => base + file));
});

for (const todayStatus of ['EmergencyShutdowns', 'ScheduleApplies', undefined]) {
    test(`selected Yasno schedule renders today's emergency: ${todayStatus}`, async () => {
        const data = { ...schedule, lastUpdate: '2026-11-01T06:01:00Z',
            today: { status: todayStatus }, tomorrow: { status: 'EmergencyShutdowns' } };
        const { context, notice, emergency } = createApp(async url => response(
            url.includes('dtek-address') ? warning : url.includes('dtek-outages') ? schedule : data));
        await settle();
        assert.equal(emergency.hidden, todayStatus !== 'EmergencyShutdowns');
        assert.equal(notice.hidden, false);
        data.lastUpdate = schedule.lastUpdate;
        await vm.runInContext('loadSchedule()', context);
        assert.equal(emergency.hidden, true);
    });
}

test('staleness warns only for the active schedule at the 15-minute boundary without a prefix', async () => {
    const timestamp = '2026-11-05T00:00:00Z';
    const { context, freshness, notice } = createApp(async url => response(url.includes('dtek-address')
        ? { ...warning, lastUpdate: timestamp } : { ...schedule, lastUpdate: timestamp }));
    await settle();
    vm.runInContext(`renderFreshness(Date.parse('${timestamp}') + 15 * 60000)`, context);
    assert.equal(freshness.hidden, true);
    vm.runInContext(`renderFreshness(Date.parse('${timestamp}') + 15 * 60000 + 1)`, context);
    assert.equal(freshness.textContent, 'Дані не оновлювалися понад 15 хвилин і можуть бути застарілими.');
    assert.doesNotMatch(noticeText(notice), /Дані не оновлювалися/);
    vm.runInContext(`savedSchedules.dtek.lastUpdate = '2026-11-05T00:15:00Z'; renderFreshness(Date.parse('${timestamp}') + 16 * 60000)`, context);
    assert.equal(freshness.hidden, true);
    assert.doesNotMatch(noticeText(notice), /Дані не оновлювалися/);

});

test('temporary download failures retain the last schedule and show its actual age', async () => {
    let failing = false;
    const { context, content, freshness } = createApp(async url => {
        if (failing) throw new Error('offline');
        return response(url.includes('dtek-address') ? warning : {
            ...schedule, days: [{ date: '2026-11-01', isToday: true, outages: [{ start: 60, end: 120 }] }]
        });
    });
    await settle();
    assert.match(content.innerHTML, /01:00 — 02:00/);
    failing = true;
    await vm.runInContext('loadSchedule()', context);
    assert.match(content.innerHTML, /01:00 — 02:00/);
    assert.equal(freshness.hidden, false);
    assert.match(freshness.textContent, /понад 15 хвилин/);
});

test('a fresh schedule warns when the address assignment is stale, and an unresolved group hides intervals', async () => {
    const now = '2026-11-05T00:16:00Z';
    const data = { ...schedule, group: 'GPV13.1', groupCheckedAt: '2026-11-05T00:00:00Z', lastUpdate: now };
    const { context, content, freshness } = createApp(async url => response(url.includes('dtek-address') ? warning : data));
    await settle();
    vm.runInContext(`renderFreshness(Date.parse('${now}'))`, context);
    assert.match(freshness.textContent, /Чергу для цієї адреси/);
    data.group = null;
    await vm.runInContext('loadSchedule()', context);
    assert.match(content.innerHTML, /Не вдалося визначити графік/);
});
