// Server-side port of the .dat parser that used to live only in
// js/choral-library.js, so the one-time seed (see librarySeed.mjs) can reuse
// it exactly instead of re-transcribing scores by hand.
export function parseDat(text) {
  const scores = [], sessMap = {}, sessOrder = [];
  text.split('\n').forEach(raw => {
    const line = raw.trim();
    if (!line || line.startsWith('#')) return;
    const p = line.split('|').map(x => x.trim());
    const type = p[0].toUpperCase();
    if (type === 'SCORE') {
      const [, title, cf, cl, year, voicing, instr, tags_raw, url] = p;
      scores.push({
        title: title || '', composer_first: cf || '', composer_last: cl || '',
        year: year || '', voicing: voicing || '', instrumentation: instr || '',
        tags: (tags_raw || '').split(';').map(t => t.trim()).filter(Boolean), url: url || '',
      });
    } else if (type === 'SESSION') {
      const [, num, name] = p;
      const s = { num, name, scoreUrls: [] };
      sessMap[num] = s; sessOrder.push(s);
    } else if (type === 'SET') {
      const [, num, ...rest] = p;
      const url = rest.join('|').trim();
      if (sessMap[num] && url) sessMap[num].scoreUrls.push(url);
    }
  });
  return { scores, sessions: sessOrder };
}
