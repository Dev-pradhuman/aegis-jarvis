function matchSegment(val, expr) {
  if (expr === '*') return true;
  if (expr.startsWith('*/')) return val % parseInt(expr.slice(2), 10) === 0;
  return expr.split(',').some(part => {
    if (part.includes('-')) {
      const [start, end] = part.split('-').map(Number);
      return val >= start && val <= end;
    }
    return val === parseInt(part, 10);
  });
}

function matchCron(cronStr, timeMs, timezone = 'UTC') {
  const d = new Date(timeMs);
  const parts = cronStr.trim().split(/\s+/);
  if (parts.length !== 5) return false;
  
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric', month: 'numeric', day: 'numeric',
    hour: 'numeric', minute: 'numeric',
    hourCycle: 'h23'
  });
  
  const formatted = formatter.formatToParts(d).reduce((acc, p) => { acc[p.type] = p.value; return acc; }, {});
  
  const min = parseInt(formatted.minute, 10);
  const hr = parseInt(formatted.hour, 10);
  const dom = parseInt(formatted.day, 10);
  const mon = parseInt(formatted.month, 10);
  
  const tzDate = new Date(Date.UTC(parseInt(formatted.year, 10), mon - 1, dom));
  let dow = tzDate.getUTCDay();
  // some cron parsers treat 7 as Sunday too. We'll support 0-6.
  
  return matchSegment(min, parts[0]) &&
         matchSegment(hr, parts[1]) &&
         matchSegment(dom, parts[2]) &&
         matchSegment(mon, parts[3]) &&
         (parts[4] === '*' || matchSegment(dow, parts[4]) || (dow === 0 && matchSegment(7, parts[4])));
}

console.log(matchCron('0 9 * * 1', new Date('2024-04-01T07:00:00Z').getTime(), 'Europe/Paris')); // should be true
