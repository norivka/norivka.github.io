const { selectGroup, yasnoDays } = require('../../schedule-source');

function normalizeGroup(value) {
    if (typeof value !== 'string') return null;
    const match = /^(?:GPV)?(\d+(?:\.\d+)?)$/i.exec(value.trim());
    return match ? `GPV${match[1]}` : null;
}

function readAddressGroup(file) {
    const fs = require('node:fs');
    return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')).group ?? null : null;
}

module.exports = { normalizeGroup, readAddressGroup, selectGroup, yasnoDays };
