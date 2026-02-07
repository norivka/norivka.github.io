const fs = require('fs');

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
    
    // Convert Unix timestamp to JS Date and adjust for Ukraine timezone (UTC+2)
    const date = new Date(timestamp * 1000);
    
    // DTEK timestamps represent start of day in Ukraine time, but are given as UTC
    // We need to format them correctly for Ukraine timezone
    const ukraineDateString = new Date(date.getTime() + 2 * 60 * 60 * 1000).toISOString().split('T')[0];
    
    return {
        date: ukraineDateString + 'T00:00:00+02:00',
        isToday: isToday,
        outages: mergedOutages
    };
}

function processData(data) {
    let factData;
    
    // First, check if we have a direct JSON file from Puppeteer
    try {
        const directData = fs.readFileSync('dtek-raw-data.json', 'utf8');
        factData = JSON.parse(directData);
        console.log('Using direct DisconSchedule data from Puppeteer');
    } catch (error) {
        console.log('No direct JSON data found, trying to extract from HTML...');
        
        // Look for the pattern that starts with DisconSchedule.fact = and ends with </script>
        const factMatch = data.match(/DisconSchedule\.fact\s*=\s*(\{[^}]+data[^}]+\}\s*\})/s);
        if (!factMatch) {
            console.error('Could not find DisconSchedule.fact data in the response');
            console.log('Content length:', data.length);
            console.log('First 500 chars:', data.substring(0, 500));
            throw new Error('Data parsing failed');
        }
        
        factData = JSON.parse(factMatch[1]);
    }
    
    // Get the GPV1.1 data
    const gpvData = factData.data;
    const todayTimestamp = factData.today;
    
    if (!gpvData || Object.keys(gpvData).length === 0) {
        console.error('No GPV data found');
        throw new Error('No data available');
    }
    
    // Get current date in Ukraine timezone for comparison
    const now = new Date();
    const ukraineNow = new Date(now.getTime() + 2 * 60 * 60 * 1000);
    const currentDateStr = ukraineNow.toISOString().split('T')[0];
    
    const processedDays = [];
    
    // Process available days (today and possibly tomorrow)
    Object.keys(gpvData).forEach((timestamp) => {
        const dayData = gpvData[timestamp];
        
        // Check if GPV1.1 exists for this day
        if (dayData && dayData['GPV1.1']) {
            // Calculate the actual date for this timestamp in Ukraine timezone
            const dayDate = new Date(parseInt(timestamp) * 1000);
            const ukraineDayDate = new Date(dayDate.getTime() + 2 * 60 * 60 * 1000);
            const dayDateStr = ukraineDayDate.toISOString().split('T')[0];
            
            const isToday = dayDateStr === currentDateStr;
            const processedDay = processDayData(dayData['GPV1.1'], parseInt(timestamp), isToday);
            processedDays.push(processedDay);
        }
    });
    
    const output = {
        source: 'DTEK',
        lastUpdate: new Date().toISOString(),
        days: processedDays
    };
    
    return output;
}

try {
    console.log('Processing DTEK data from Puppeteer fetch...');
    
    // Read the HTML file fetched by Puppeteer
    const data = fs.readFileSync('raw-dtek-data.html', 'utf8');
    
    // Process the data
    const output = processData(data);
    
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
    process.exit(1);
}