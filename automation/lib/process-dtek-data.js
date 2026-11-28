const { readAddressGroup, selectGroup } = require('./group-schedule');

function extractFactData(html) {
    const assignment = /\bDisconSchedule\.fact\s*=\s*/.exec(html);
    if (!assignment) {
        const title = /<title\b[^>]*>([\s\S]*?)<\/title\s*>/i.exec(html)?.[1]
            .replace(/\s+/g, ' ').trim().slice(0, 160);
        const protectionPage = /incapsula|cf-chl-|challenge-platform/i.test(html);
        const details = [
            `${Buffer.byteLength(html, 'utf8')} bytes`,
            title && `title: ${title}`,
            protectionPage && 'possible bot-protection page'
        ].filter(Boolean).join('; ');
        throw new Error(`Could not find DisconSchedule.fact in the DTEK response (${details})`);
    }

    const start = assignment.index + assignment[0].length;
    if (html[start] !== '{') {
        throw new Error('Invalid DisconSchedule.fact JSON');
    }

    // Match the complete JSON object, including nested schedules and quoted braces.
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = start; i < html.length; i++) {
        const char = html[i];
        if (inString) {
            if (escaped) escaped = false;
            else if (char === '\\') escaped = true;
            else if (char === '"') inString = false;
        } else if (char === '"') {
            inString = true;
        } else if (char === '{') {
            depth++;
        } else if (char === '}' && --depth === 0) {
            return JSON.parse(html.slice(start, i + 1));
        }
    }
    throw new Error('Incomplete DisconSchedule.fact JSON');
}

function processData(data, now = new Date(), group = null) {
    const factData = extractFactData(data);

    const gpvData = factData.data;
    const todayTimestamp = factData.today;

    // DTEK legitimately publishes data: [] when no schedule is available.
    // Reject malformed payloads, but publish an empty days list for that case.
    if (!gpvData || typeof gpvData !== 'object' ||
        (Array.isArray(gpvData) && gpvData.length > 0) ||
        !Number.isFinite(todayTimestamp) || todayTimestamp <= 0) {
        throw new Error('Invalid DTEK schedule response');
    }

    for (const [timestamp, groups] of Object.entries(gpvData)) {
        if (!Number.isFinite(new Date(Number(timestamp) * 1000).getTime()) ||
            !groups || typeof groups !== 'object' || Array.isArray(groups) ||
            Object.values(groups).some(hours => !hours || typeof hours !== 'object')) {
            throw new Error('Invalid DTEK schedule day');
        }
    }

    return selectGroup('dtek', { source: 'DTEK', lastUpdate: now.toISOString(), schedules: gpvData }, group);
}

if (require.main === module) {
    const fs = require('node:fs');
    try {
        console.log('Processing DTEK data from downloaded HTML...');

        // Read the HTML file fetched directly from DTEK.
        const data = fs.readFileSync('raw-dtek-data.html', 'utf8');

        // Process the data
        const output = processData(data, new Date(), readAddressGroup('data/dtek-address.json'));

        // Ensure data directory exists
        if (!fs.existsSync('data')) {
            fs.mkdirSync('data', { recursive: true });
        }

        fs.writeFileSync('data/dtek-outages.json', JSON.stringify(output, null, 2));
        console.log('Successfully processed DTEK outages data');
        console.log(`Days processed: ${output.days.length}`);
        output.days.forEach(day => {
            console.log(`  ${day.date}: ${day.outages.length} outages`);
        });

    } catch (error) {
        console.error('Error processing DTEK data:', error.message);
        process.exitCode = 1;
    }
}

module.exports = { extractFactData, processData };
