function latestScheduleSource(dtek, yasno) {
    if (!Array.isArray(dtek?.days)) return Array.isArray(yasno?.days) ? 'yasno' : null;
    if (!Array.isArray(yasno?.days)) return 'dtek';
    if (dtek.group === null && yasno.group !== null) return 'yasno';
    if (yasno.group === null && dtek.group !== null) return 'dtek';
    const yasnoTime = Date.parse(yasno?.lastUpdate);
    const dtekTime = Date.parse(dtek.lastUpdate);
    if (Number.isFinite(yasnoTime) && (!Number.isFinite(dtekTime) || yasnoTime > dtekTime)) {
        return 'yasno';
    }
    return 'dtek';
}

if (typeof module !== 'undefined') module.exports = { latestScheduleSource };
