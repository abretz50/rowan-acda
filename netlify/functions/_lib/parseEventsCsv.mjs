// Parses the events CSV shape (title,date,start_time,end_time,location,tags,
// description,details,signin_link,image_url) into the portal's event
// schema, converting date+time into unambiguous ISO strings with an
// explicit America/New_York UTC offset (DST-aware) rather than relying on
// whatever timezone happens to run the parsing code.

function parseCSV(text) {
  const rows = [];
  let i = 0, field = '', row = [], inQuotes = false;
  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n') { row.push(field); field = ''; rows.push(row); row = []; }
      else if (c === '\r') { /* ignore */ }
      else field += c;
    }
    i++;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function toRecords(rows) {
  if (!rows.length) return [];
  const header = rows.shift().map(h => h.trim().toLowerCase());
  return rows
    .filter(r => r.some(v => v.trim()))
    .map(r => {
      const o = {};
      header.forEach((h, i) => { o[h] = (r[i] || '').trim(); });
      return o;
    });
}

function parseDateParts(dStr) {
  const m = (dStr || '').trim().match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/);
  if (!m) return null;
  let [, mm, dd, yy] = m.map(Number);
  if (yy < 100) yy += 2000;
  return { year: yy, month: mm, day: dd };
}

function parseTimeParts(tStr) {
  if (!tStr) return null;
  const m = tStr.trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*([AP]M)?$/i);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  const ap = (m[3] || '').toUpperCase();
  if (ap === 'PM' && h < 12) h += 12;
  if (ap === 'AM' && h === 12) h = 0;
  return { h, min };
}

// US DST rule (since 2007): starts 2nd Sunday in March, ends 1st Sunday in November.
function nthSundayOfMonth(year, month, n) {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const firstSunday = 1 + ((7 - first.getUTCDay()) % 7);
  return firstSunday + (n - 1) * 7;
}
function easternOffset(year, month, day) {
  if (month < 3 || month > 11) return '-05:00';
  if (month > 3 && month < 11) return '-04:00';
  const marchSecondSunday = nthSundayOfMonth(year, 3, 2);
  const novFirstSunday = nthSundayOfMonth(year, 11, 1);
  if (month === 3) return day >= marchSecondSunday ? '-04:00' : '-05:00';
  return day < novFirstSunday ? '-04:00' : '-05:00';
}

function toISO(dateParts, timeParts) {
  if (!dateParts) return '';
  const { year, month, day } = dateParts;
  const { h, min } = timeParts || { h: 0, min: 0 };
  const pad = (n) => String(n).padStart(2, '0');
  const offset = easternOffset(year, month, day);
  return `${year}-${pad(month)}-${pad(day)}T${pad(h)}:${pad(min)}:00${offset}`;
}

function tagList(s) {
  if (!s) return [];
  return s.split(/[|,;/]+/).map(v => v.trim()).filter(Boolean);
}

export function parseEventsCsv(csvText) {
  const records = toRecords(parseCSV(csvText));
  return records
    .map(r => {
      const dateParts = parseDateParts(r.date);
      const startParts = parseTimeParts(r.start_time) || { h: 0, min: 0 };
      const endParts = parseTimeParts(r.end_time) || startParts;
      const start = toISO(dateParts, startParts);
      let end = toISO(dateParts, endParts);
      if (start && end && end <= start) {
        // end time earlier than start (e.g. crosses midnight) — push end to next day
        const d = new Date(start);
        d.setUTCDate(d.getUTCDate() + 1);
        end = toISO({ year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() }, endParts);
      }
      return {
        title: (r.title || '').trim(),
        description: (r.description || '').trim(),
        location: (r.location || '').trim(),
        start, end: end || start,
        tags: tagList(r.tags),
        signinLink: (r.signin_link || '').trim(),
        imageUrl: (r.image_url || '').trim(),
      };
    })
    .filter(ev => ev.title && ev.start);
}
