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

function ukraineDate(date) {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Europe/Kyiv', year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(date);
}

function convertHourValueToOutage(hourValue, hourIndex) {
    // Convert hour-based values to minute-based outage intervals
    // hourIndex is 1-based (1-24 representing hours of the day)

    const hourStartMinutes = (hourIndex - 1) * 60;
    const hourEndMinutes = hourIndex * 60;
    const hourMidpoint = hourStartMinutes + 30;

    switch (hourValue) {
        case 'yes':
            return []; // No outages
        case 'no':
            return [{ start: hourStartMinutes, end: hourEndMinutes }]; // Outage for entire hour
        case 'first':
            return [{ start: hourStartMinutes, end: hourMidpoint }]; // Outage for first half hour
        case 'second':
            return [{ start: hourMidpoint, end: hourEndMinutes }]; // Outage for second half hour
        default:
            return []; // Default to no outages for unknown values
    }
}

function processDayData(gpvData, timestamp, isToday) {
    const outages = [];

    // Process each hour (1-24)
    for (let hour = 1; hour <= 24; hour++) {
        const hourValue = gpvData[hour.toString()];
        if (hourValue && hourValue !== 'yes') {
            const hourOutages = convertHourValueToOutage(hourValue, hour);
            outages.push(...hourOutages);
        }
    }

    // Merge consecutive outages
    const mergedOutages = [];
    if (outages.length > 0) {
        let current = { ...outages[0] };

        for (let i = 1; i < outages.length; i++) {
            if (outages[i].start === current.end) {
                // Consecutive outage, extend current
                current.end = outages[i].end;
            } else {
                // Non-consecutive, save current and start new
                mergedOutages.push(current);
                current = { ...outages[i] };
            }
        }
        mergedOutages.push(current); // Add the last outage
    }

    return {
        // Preserve the actual instant: Kyiv uses UTC+3 during daylight saving time.
        date: new Date(timestamp * 1000).toISOString(),
        isToday: isToday,
        outages: mergedOutages
    };
}

function yasnoDays(group) {
    return [group?.today && { ...group.today, isToday: true },
        group?.tomorrow && { ...group.tomorrow, isToday: false }]
        .filter(day => day?.status === 'ScheduleApplies')
        .map(day => ({
            date: day.date, isToday: day.isToday,
            outages: (day.slots || []).filter(slot => slot.type === 'Definite')
                .map(({ start, end }) => ({ start, end })).sort((a, b) => a.start - b.start),
        }));
}

// Keep the complete upstream schedules alongside the address-specific view used by the site and push.
function selectGroup(source, schedule, group) {
    const { schedules } = schedule;
    if (source === 'yasno') {
        const entry = group ? schedules[group] : null;
        return { ...schedule, group: entry ? group : null, days: yasnoDays(entry),
            today: entry?.today ? { date: entry.today.date, status: entry.today.status } : null };
    }

    const days = [];
    if (group) {
        const today = ukraineDate(new Date(schedule.lastUpdate));
        for (const [timestamp, groups] of Object.entries(schedules)) {
            if (Object.hasOwn(groups, group)) {
                const date = new Date(Number(timestamp) * 1000);
                days.push(processDayData(groups[group], Number(timestamp), ukraineDate(date) === today));
            }
        }
    }
    // An empty feed applies to all groups. A populated feed lacking this group is unresolved.
    return { ...schedule, group: days.length || !Object.keys(schedules).length ? group : null, days };
}

const DISPLAY_GROUPS = ['13.1', '1.1'];

function scheduleForGroup(source, feed, group) {
    if (!feed) return null;
    const key = source === 'dtek' ? 'GPV' + group : group;
    if (!feed.schedules) return feed.group === key ? feed : null;
    const schedule = selectGroup(source, feed, key);
    return schedule.group === key ? schedule : null;
}

function displayedSchedules(dtek, yasno) {
    const dtekGroups = DISPLAY_GROUPS.map(group => scheduleForGroup('dtek', dtek, group));
    const yasnoGroups = DISPLAY_GROUPS.map(group => scheduleForGroup('yasno', yasno, group));
    const availableDtek = dtekGroups.filter(Boolean);
    const availableYasno = yasnoGroups.filter(Boolean);
    let source;
    if (availableDtek.length === availableYasno.length) {
        source = latestScheduleSource(availableDtek[0], availableYasno[0]);
    } else {
        source = availableDtek.length > availableYasno.length ? 'dtek' : 'yasno';
    }
    const selected = source === 'dtek' ? dtekGroups : yasnoGroups;
    return { source, groups: DISPLAY_GROUPS.map((group, i) => ({ group, schedule: selected[i] })) };
}

if (typeof module !== 'undefined') module.exports = { latestScheduleSource, selectGroup, yasnoDays, displayedSchedules };
