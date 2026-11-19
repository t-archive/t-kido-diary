'use strict';
/* Search-only normalization. All returned ranges address the ORIGINAL UTF-16
   string, at grapheme boundaries where Intl.Segmenter is available. The fallback
   keeps combining marks and variation selectors with their base. No source
   text, historical CP coordinate, or data record is modified. */
(function (root) {
  const norm = s => String(s).normalize('NFKC').toLocaleLowerCase('ja');
  const segmenter = typeof Intl.Segmenter === 'function'
    ? new Intl.Segmenter('ja', {granularity: 'grapheme'}) : null;
  const records = new WeakMap();

  function segmentsOf(text) {
    if (segmenter) return Array.from(segmenter.segment(text));
    // Focused fallback for historical text, not a full UAX #29 implementation.
    // Mark includes BMP variation selectors and supplementary IVS selectors.
    const result = []; let index = 0;
    for (const c of text) {
      if (result.length && /\p{Mark}/u.test(c)) result[result.length - 1].segment += c;
      else result.push({segment:c,index});
      index += c.length;
    }
    return result;
  }

  function mapped(text) {
    const normalized = norm(text), starts = [], ends = [];
    let joined = '';
    const segments = segmentsOf(text);
    for (const s of segments) {
      const n = norm(s.segment);
      joined += n;
      for (let i = 0; i < n.length; i++) {
        starts.push(s.index); ends.push(s.index + s.segment.length);
      }
    }
    if (joined === normalized) return {normalized, starts, ends};

    // Rare cross-segment normalization (e.g. compatibility Hangul jamo),
    // contextual lowercasing: compare normalized prefixes by whole segments.
    // A changed suffix inherits the complete original range that produced it.
    starts.length = ends.length = 0;
    let prefix = '', previous = '', offset = 0;
    for (const {segment:c} of segments) {
      prefix += c;
      const current = norm(prefix);
      let common = 0;
      while (common < previous.length && common < current.length &&
             previous[common] === current[common]) common++;
      let start = offset;
      for (let i = common; i < starts.length; i++) start = Math.min(start, starts[i]);
      starts.length = ends.length = common;
      offset += c.length;
      for (let i = common; i < current.length; i++) {
        starts.push(start); ends.push(offset);
      }
      previous = current;
    }
    return {normalized, starts, ends};
  }

  function ranges(text, words, mapping = mapped(text)) {
    const found = [];
    for (const word of words) {
      if (!word) continue;
      let from = 0, at;
      while ((at = mapping.normalized.indexOf(word, from)) !== -1) {
        const start = mapping.starts[at], end = mapping.ends[at + word.length - 1];
        if (start !== undefined && end !== undefined) found.push({start, end, word});
        from = at + word.length;
      }
    }
    return found.sort((a, b) => a.start - b.start || a.end - b.end);
  }

  function prepared(record, volumeName) {
    let p = records.get(record);
    if (!p) {
      p = {hay: norm(record.id + ' ' + record.text + ' ' + record.extra + ' ' + volumeName),
        id: norm(record.id), extra: norm(record.extra + ' ' + volumeName),
        text: norm(record.text), mapping: null};
      records.set(record, p);
    }
    return p;
  }

  function matches(record, volumeName, words) {
    return words.every(w => prepared(record, volumeName).hay.includes(w));
  }

  function excerpts(record, volumeName, words) {
    const p = prepared(record, volumeName);
    const fields = [];
    if (words.some(w => p.id.includes(w))) fields.push('IDに一致');
    if (words.some(w => p.extra.includes(w))) fields.push('参照情報・巻名に一致');
    p.mapping ||= mapped(record.text);
    const hits = ranges(record.text, words, p.mapping);
    if (!hits.length) return {fields, snippets: [], remainingWords: 0};

    // Use up to three windows, prioritizing a different AND word per window.
    const boundaries = [0];
    let offset = 0;
    const parts = segmentsOf(record.text).map(x => x.segment);
    for (const part of parts) { offset += part.length; boundaries.push(offset); }
    const indexAt = pos => {
      let lo = 0, hi = boundaries.length - 1;
      while (lo < hi) { const mid = Math.ceil((lo + hi) / 2);
        if (boundaries[mid] <= pos) lo = mid; else hi = mid - 1; }
      return lo;
    };
    const windows = [], covered = new Set();
    for (const word of words) {
      if (covered.has(word)) continue;
      const hit = hits.find(h => h.word === word);
      if (!hit) continue;
      const first = Math.max(0, indexAt(hit.start) - 18);
      const last = Math.min(parts.length, Math.max(first + 90, indexAt(hit.end)));
      const window = {start: boundaries[first], end: boundaries[last]};
      // Merge every intersecting window, including a new window that bridges
      // two existing ones. Apply the limit AFTER merging, so a fourth word can
      // still extend an existing window without creating a fourth excerpt.
      const mergedWindows = [];
      for (const w of [...windows,window].sort((a,b) => a.start - b.start)) {
        const prev = mergedWindows[mergedWindows.length - 1];
        if (prev && w.start <= prev.end) prev.end = Math.max(prev.end,w.end);
        else mergedWindows.push({...w});
      }
      if (mergedWindows.length > 3) continue;
      windows.splice(0,windows.length,...mergedWindows);
      covered.clear();
      for (const h of hits) if (windows.some(w => h.start >= w.start && h.end <= w.end)) covered.add(h.word);
    }
    const snippets = windows.sort((a, b) => a.start - b.start).map(w => {
      const merged = [];
      for (const h of hits.filter(h => h.start < w.end && h.end > w.start)) {
        const start = Math.max(h.start, w.start), end = Math.min(h.end, w.end);
        const prev = merged[merged.length - 1];
        if (prev && start <= prev.end) prev.end = Math.max(prev.end, end);
        else merged.push({start, end});
      }
      const runs = []; let cursor = w.start;
      for (const h of merged) {
        if (cursor < h.start) runs.push({text: record.text.slice(cursor, h.start), match: false});
        runs.push({text: record.text.slice(h.start, h.end), match: true}); cursor = h.end;
      }
      if (cursor < w.end) runs.push({text: record.text.slice(cursor, w.end), match: false});
      return {runs, before: w.start > 0, after: w.end < record.text.length};
    });
    return {fields, snippets, remainingWords: words.filter(w => p.text.includes(w) && !covered.has(w)).length};
  }

  const api = {norm, mapped, ranges, matches, excerpts};
  root.KidoSearch = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window === 'undefined' ? globalThis : window);
