const { readAddressGroup, selectGroup, yasnoDays } = require('./group-schedule');
const { scheduleSnapshot } = require('./schedule-changes');

function processYasnoData(schedules, now = new Date(), group = null) {
    if (!schedules || typeof schedules !== 'object' || Array.isArray(schedules) || !Object.keys(schedules).length) {
        throw new Error('Invalid Yasno schedule response');
    }
    for (const entry of Object.values(schedules)) {
        if (!entry?.today && !entry?.tomorrow) throw new Error('Missing Yasno schedule days');
        scheduleSnapshot({ days: yasnoDays(entry) });
    }
    return selectGroup('yasno', { lastUpdate: now.toISOString(), schedules }, group);
}

if (require.main === module) {
    const fs = require('node:fs');
    try {
        const schedules = JSON.parse(fs.readFileSync('raw-data.json', 'utf8'));
        const output = processYasnoData(schedules, new Date(), readAddressGroup('data/yasno-group.json'));
        fs.mkdirSync('data', { recursive: true });
        fs.writeFileSync('data/outages.json', JSON.stringify(output, null, 2));
        console.log('Successfully processed outages data');
    } catch (error) {
        console.error('Error processing data:', error);
        process.exitCode = 1;
    }
}

module.exports = { processYasnoData };
