const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

function runProcessor(fact) {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'dtek-test-'));
    try {
        fs.mkdirSync(path.join(cwd, 'data'));
        fs.writeFileSync(path.join(cwd, 'data/dtek-outages.json'), 'previous data');
        fs.writeFileSync(path.join(cwd, 'raw-dtek-data.html'), '<html></html>');
        fs.writeFileSync(path.join(cwd, 'dtek-raw-data.json'), JSON.stringify(fact));
        const result = spawnSync(process.execPath, [path.join(__dirname, 'process-dtek-data.js')], {
            cwd, encoding: 'utf8'
        });
        return { ...result, output: fs.readFileSync(path.join(cwd, 'data/dtek-outages.json'), 'utf8') };
    } finally {
        fs.rmSync(cwd, { recursive: true, force: true });
    }
}

test('empty DTEK schedules successfully replace stale data', () => {
    for (const data of [[], {}]) {
        const result = runProcessor({ data, today: 1790802000, update: '24.07.2026 08:30' });
        assert.equal(result.status, 0, result.stderr);
        const output = JSON.parse(result.output);
        assert.equal(output.source, 'DTEK');
        assert.deepEqual(output.days, []);
        assert.ok(Number.isFinite(Date.parse(output.lastUpdate)));
    }
});

test('malformed responses fail and preserve previous data', () => {
    for (const fact of [{}, { data: null }, { data: 'invalid', today: 1790802000 },
        { data: [1], today: 1790802000 }, { data: [] }]) {
        const result = runProcessor(fact);
        assert.notEqual(result.status, 0);
        assert.equal(result.output, 'previous data');
    }
});

test('existing populated schedule conversion still works', () => {
    const hours = Object.fromEntries(Array.from({ length: 24 }, (_, i) => [i + 1, 'yes']));
    Object.assign(hours, { 2: 'second', 3: 'no', 4: 'first' });
    const result = runProcessor({
        data: { 1770415200: { 'GPV1.1': hours } }, today: 1770415200
    });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.output).days[0].outages, [{ start: 90, end: 210 }]);
});
