const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildNotification } = require('./notification-core');
const config = require('../push-config.json');
const empty = { days: [], addressNotificationVersion: 1, revision: 'initial' };

test('Yasno sends new planned outages regardless of tomorrow’s emergency status', () => {
    const change = buildNotification('yasno', empty, {
        days: [{ date: '2026-11-05', outages: [{ start: 60, end: 120 }] }],
        today: { status: 'ScheduleApplies' }, tomorrow: { status: 'EmergencyShutdowns' }
    }, config, null, new Date('2026-11-05T12:00:00Z'));
    assert.equal(change.payload.contents.uk, 'нові графіки відключень');
});

test('both emergency DTEK notice types send cancellation once', () => {
    for (const [sub_type, title] of [
        ['Аварійні ремонтні роботи', 'скасовано аварійні відключення'],
        ['Екстрені відключення', 'скасовано екстрені відключення'],
    ]) {
        const appeared = buildNotification('dtek', empty, { days: [] }, config,
            { sub_type, start_date: '', end_date: '' });
        const removed = buildNotification('dtek', appeared.state, { days: [] }, config);
        assert.equal(removed.payload.contents.uk, title);
        assert.equal(buildNotification('dtek', removed.state, { days: [] }, config), null);
    }
});

test('Yasno emergency status alone does not trigger a push', () => {
    for (const status of ['EmergencyShutdowns', 'ScheduleApplies', 'EmergencyShutdowns']) {
        const data = { days: [], today: { status } };
        assert.equal(buildNotification('yasno', empty, data, config), null);
    }
});
