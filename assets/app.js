'use strict';
(async () => {
const $ = id => document.getElementById(id);
const annotationText = text => String(text).replace(/マヽ／ママ|ママ／マヽ|マヽ/g,'ママ');
const el = (tag, cls, tx) => { const n = document.createElement(tag); if (cls) n.className = cls; if (tx !== undefined) n.textContent = tag === 'pre' ? tx : annotationText(tx); return n; };
if (typeof KIDO === 'undefined' || typeof KidoSearch === 'undefined') { $('status').textContent = '読み込めませんでした。時間をおいて再読み込みしてください。'; $('reader').setAttribute('aria-busy','false'); return; }
const volumeNames = {1:'第1巻',2:'第2巻',3:'第3巻'}, pageSize = 50;
let catalog, units, pages, byId, pageById, selected = null, volume = 1, kind = 'unit';
let generation = 0, searchGeneration = 0, list = [], listOffset = 0, searching = false, query = '', pendingChoice = null, controlsKey = '';
const rowsCache = new Map();
const norm = KidoSearch.norm;
function setStatus(t, error = false) { $('status').textContent = t; $('status').classList.toggle('error', error); }
function storageWarning() { $('storage-notice').hidden = false; }
function remember(k, v) { try { localStorage.setItem('kido-v01-' + k, JSON.stringify(v)); } catch { storageWarning(); } }
function recall(k) { try { const raw = localStorage.getItem('kido-v01-' + k); if (!raw) return null; try { return JSON.parse(raw); } catch { storageWarning(); return null; } } catch { storageWarning(); return null; } }
// Reading presentation only; stored translations and source references are untouched.
// Match the second volume's reading convention without changing stored text.
function headnotePresentation(value) {
  let text = String(value).replace(/〔(?:傍注|原注|割注)：[（(]?[鼇鰲]頭[）)]?〕/g,'〔原注：鼇頭〕');
  // The outer delimiters mark the original headnote; retain nested annotations.
  let from=0;
  while (true) {
    const start=text.indexOf('〔原頭注訳：',from);if(start<0)break;
    let depth=1,end=start+'〔原頭注訳：'.length;
    for(;end<text.length;end++){if(text[end]==='〔')depth++;else if(text[end]==='〕'&&--depth===0)break;}
    if(end===text.length)break;
    const content=text.slice(start+'〔原頭注訳：'.length,end);
    const replacement='\n〔原注：鼇頭〕'+content;
    text=text.slice(0,start)+replacement+text.slice(end+1);from=start+replacement.length;
  }
  return text.replace(/(?:欄外)?頭注(?:には|では|に)[、]?/g,'\n〔原注：鼇頭〕').replace(/([^\n])〔原注：鼇頭〕/g,'$1\n〔原注：鼇頭〕');
}
function readingText(text) {
  const notes = [];
  const display = headnotePresentation(text).replace(/〔[^〔〕]*〕/g, annotation => {
    if (!/校訂注\s*[A-Z]\d+|保留|未確定|HOLD/.test(annotation)) return annotation;
    const note = annotation.slice(1,-1)
      .replace(/(?:別解は)?校訂注\s*[A-Z]\d+参照[。]?/g,'')
      .replace(/HOLD(?:を)?継続[。]?/g,'')
      .replace(/歌の現代語訳は保留/g,'この歌は原文を掲載しています。意味の解釈は確定していません')
      .replace(/読解保留/g,'この箇所の読みは確定していません')
      .replace(/語義未確定/g,'この語句の意味は確定していません')
      .replace(/保留/g,'未確定');
    notes.push({original:annotation,note});
    return `〔注${notes.length}〕`;
  });
  return {text:display,notes};
}
function label(meta) { return meta.label ? readingText(meta.label).text : (meta.id === 'V1-T026-001' || meta.id === 'V1-T082-013' ? '原注独立単位・原注訳あり' : meta.id); }
function focusAt(node) {
  if (!node) return;
  // Keep native controls and explicit tab order intact. Only non-focusable
  // containers need a programmatic focus target outside the Tab sequence.
  if (node.tabIndex < 0 && !node.hasAttribute('tabindex')) node.setAttribute('tabindex', '-1');
  node.focus({preventScroll:true}); node.scrollIntoView({block:'start',behavior:'instant'});
}
function button(text, fn, cls = '') { const b = el('button', cls, text); b.type = 'button'; b.onclick = fn; return b; }
function rowsFor(k = kind, v = volume) { const key = k + v; if (!rowsCache.has(key)) rowsCache.set(key, (k === 'unit' ? units : pages).filter(x => x.volume === v)); return rowsCache.get(key); }
function canonicalHash(id = selected, k = kind) { return '#' + (k === 'unit' ? 'u' : 'p') + '=' + encodeURIComponent(id); }
function restoreURL() { if (selected) try { history.replaceState(null, '', canonicalHash()); } catch { /* URL cannot be restored; status still identifies the displayed record. */ } }

function addNotes(box, title, items) {
  if (!items.length) return;
  box.append(el('h4', '', title));
  for (const text of items) box.append(el('p', 'note-record', text));
}
function disclosure(title, build, open = false, heading = true) {
  const d = el('details'), summary = el('summary'), content = el('div', 'note-content');
  summary.append(el(heading ? 'h3' : 'span', 'disclosure-title', title)); d.append(summary, content);
  let built = false, inFlight = null;
  d.ensureBuilt = () => {
    if (built) return Promise.resolve(true);
    if (inFlight) return inFlight;
    content.replaceChildren();
    inFlight = Promise.resolve().then(() => build(content)).then(() => { built = true; return true; }).catch(e => {
      content.replaceChildren(el('p', 'error', e.message), button('この欄を再読み込み', () => d.ensureBuilt())); return false;
    }).finally(() => { inFlight = null; });
    return inFlight;
  };
  d.openAndFocus = async targetId => {
    d.open = true; const ok = await d.ensureBuilt();
    if (d.isConnected) focusAt(ok && targetId ? $(targetId) || summary : summary);
  };
  d.addEventListener('toggle', () => { if (d.open) d.ensureBuilt(); });
  if (open) { d.open = true; d.ensureBuilt(); }
  return d;
}
function showAbout(targetId = 'about-title') { if (!$('about').open) $('about').showModal(); focusAt($(targetId)); }
function linkPage(ref, text) { const a = el('a', '', text || ref); a.href = '#p=' + encodeURIComponent(ref); a.addEventListener('click', e => { e.preventDefault(); choose(ref,'page',true); }); return a; }
function unitButton(id) { return button(label(byId.get(id) || {id}), () => choose(id,'unit',true)); }
function updateControls() {
  document.querySelectorAll('[data-volume]').forEach(b => { const on = +b.dataset.volume === volume; b.classList.toggle('active', on); b.setAttribute('aria-pressed', String(on)); });
  $('browse-kind').value = kind;
  const rows = rowsFor(), key = kind + volume;
  if (controlsKey !== key) {
    $('toc').replaceChildren(...rows.map((x,i) => { const o = el('option', '', `${i+1}｜${label(x)}`); o.value = x.id; return o; })); controlsKey = key;
  }
  $('toc').value = selected;
  const pos = rows.findIndex(x => x.id === selected);
  $('position').textContent = `${pos+1} / ${rows.length}`;
  $('breadcrumb').textContent = volumeNames[volume] + ' ／ ' + (kind === 'unit' ? '原文・現代語訳' : '原文半頁');
  for (const n of ['previous','previous-bottom']) $(n).disabled = pos <= 0;
  for (const n of ['next','next-bottom']) $(n).disabled = pos < 0 || pos >= rows.length-1;
}
function renderList() {
  const box = $('results'); box.replaceChildren();
  for (const r of list.slice(listOffset, listOffset + pageSize)) {
    const b = button('', () => choose(r.id,r.kind,true,true,r.words || []), 'result' + (r.id === selected ? ' active' : ''));
    if (r.id === selected) b.setAttribute('aria-current','true');
    b.append(el('span','result-meta',`${volumeNames[r.volume]} · ${r.kind === 'page' ? '原文半頁' : '記事'}`));
    if (r.searchRecord) {
      const result = KidoSearch.excerpts(r.kind === 'unit' ? {...r.searchRecord,text:readingText(r.searchRecord.text).text} : r.searchRecord,volumeNames[r.volume],r.words);
      if (result.fields.length) b.append(el('span','result-fields',result.fields.join(' ／ ')));
      for (const snip of result.snippets) {
        const line = el('span','result-text'); if (snip.before) line.append(el('span','','…'));
        for (const run of snip.runs) line.append(el(run.match ? 'mark' : 'span','',run.text));
        if (snip.after) line.append(el('span','','…')); b.append(line);
      }
      if (!result.snippets.length) b.append(el('span','result-text',label(r)),el('span','result-fields','本文内の一致はありません。ID・参照情報の一致です。'));
      if (result.remainingWords) b.append(el('span','result-fields',`本文にはこのほか${result.remainingWords}語も一致します。`));
    } else b.append(el('span','result-text',label(r)));
    box.append(b);
  }
  $('previous-results').hidden = listOffset === 0;
  $('more-results').hidden = listOffset + pageSize >= list.length;
  $('more-results').textContent = `次の${Math.min(pageSize,Math.max(0,list.length-listOffset-pageSize))}件`;
  $('list-page').textContent = list.length ? `${listOffset+1}–${Math.min(listOffset+pageSize,list.length)} / ${list.length.toLocaleString()}件を表示` : '';
}
function tocList() {
  ++searchGeneration; searching = false; query = ''; $('query').value = ''; $('clear-search').hidden = true;
  $('list-title').textContent = volumeNames[volume] + 'の目次'; list = rowsFor().map(x => ({...x,kind}));
  const i = list.findIndex(x => x.id === selected); listOffset = Math.max(0,Math.floor(i/pageSize)*pageSize);
  $('result-count').textContent = `${list.length.toLocaleString()}${kind === 'unit' ? '記事' : '半頁'} · 既存の収録順`; renderList();
}
function textBody(text, cls = 'body-text', words = [], tag = 'p') {
  text = annotationText(text);
  const p = el(tag,cls);
  if (!words.length) { p.textContent = text; return p; }
  const hits = KidoSearch.ranges(text,words), merged = [];
  for (const h of hits) { const last = merged[merged.length-1]; if (last && h.start <= last.end) last.end = Math.max(last.end,h.end); else merged.push({...h}); }
  let pos = 0;
  for (const h of merged) { if (pos < h.start) p.append(el('span','',text.slice(pos,h.start))); p.append(el('mark','search-hit',text.slice(h.start,h.end))); pos = h.end; }
  if (pos < text.length) p.append(el('span','',text.slice(pos)));
  return p;
}
function modernText(text, cls, words, notes) {
  if (!notes) return textBody(text, cls, words);
  const body = el('span',cls), terms = Object.keys(notes).sort((a,b) => b.length-a.length);
  let pos = 0;
  while (pos < text.length) {
    let chosen, start = text.length;
    for (const term of terms) {
      const match = text.indexOf(term,pos);
      if (match >= 0 && match < start) { chosen = term; start = match; }
    }
    if (start > pos) body.append(textBody(text.slice(pos,start),'',words,'span'));
    if (!chosen) break;
    body.append(textBody(chosen,'',words,'span'));
    const note = el('span','name-note');
    note.textContent = notes[chosen];
    note.hidden = true;
    const toggle = button('注', () => {
      note.hidden = !note.hidden;
      toggle.setAttribute('aria-expanded',String(!note.hidden));
    }, 'name-toggle');
    toggle.setAttribute('aria-label',chosen+'の表記について');
    toggle.setAttribute('aria-expanded','false');
    body.append(toggle,note);
    pos = start + chosen.length;
  }
  return body;
}
function sourceBlock(s, words) {
  const b = el('section','span-block'), p = el('div','source-location'), meta = pageById.get(s.ref);
  p.append(linkPage(s.ref,`${meta.koma}コマ ${meta.side === 'right' ? '右' : '左'} の原文全文を開く ↗`));
  b.append(p,textBody(s.quote,'body-text',words)); return b;
}
function checkpointBlock(p, words, inline, nameNotes) {
  const part = el('section', 'cp-reading'); part.id = 'cp-' + p.id; part.tabIndex = -1;
  if (p.title) part.append(el('h4', '', p.title));
  if (p.verse) {
    const verse = el('blockquote', 'cp-verse'); verse.textContent = p.verse;
    part.append(el('div','cp-label','詩歌の原文'), verse, el('div','cp-label','訳'));
  } else if (!inline) {
    const quote = el('details', 'cp-quote'), original = el('p'); original.textContent = p.source;
    quote.append(el('summary','','対応する原文'),original); part.append(quote);
  }
  part.append(modernText(p.text, 'cp-text', words, nameNotes));
  if (p.note) {
    const note = el('details', 'cp-note'), toggle = el('summary', '', '注');
    toggle.setAttribute('aria-label','この訳の注を開閉'); note.append(toggle,el('p','',p.note)); part.append(note);
  }
  return part;
}
function buildUnit(u,meta,words,checkpoint) {
  const view = el('div'), head = el('header','article-head'), title = label(meta), reading = readingText(u.current_context ?? u.translation);
  head.append(el('div','article-kicker',`${volumeNames[u.volume]}`),el('h2','',Array.from(title).length > 38 ? Array.from(title).slice(0,38).join('')+'…' : title));
  view.append(head);
  const notes = el('section','notes-area');
  let readingNotes;
  if (reading.notes.length) {
    readingNotes = disclosure('本文の注記', box => {
      reading.notes.forEach((n,i) => { const item=el('section'); item.id='reading-note-'+(i+1); item.append(el('h4','',`注${i+1}`),el('p','',n.note)); box.append(item); });
    });
    notes.append(readingNotes);
  }
  const originalNotes = u.source_notes.map(note => [note.source_quote || note.text, note.translation].filter(Boolean).join('　')).filter(Boolean);
  const translatorNotes = (u.translator_notes || []).filter(note => !note.startsWith('〔原割注訳〕〔原注訳〕〔原頭注訳〕は'));
  if (originalNotes.length || translatorNotes.length) {
    notes.append(disclosure('原注・訳注', box => {
      addNotes(box, '原注', originalNotes);
      addNotes(box, '訳注', translatorNotes);
    }));
  }
  if (u.hold || u.flags?.date_open || u.limits?.length) {
    notes.append(disclosure('この記事の未確定事項', box => {
      if (u.flags?.date_open) box.append(el('p', '', '日付は未確定です。'));
      const issues = (u.hold_issues || []).filter(item => typeof item === 'string' && /[ぁ-龯]/.test(item));
      if (u.hold && !issues.length && !u.limits?.length) issues.push('判読・解釈に未確定の箇所があります。');
      for (const item of new Set([...issues, ...(u.limits || [])])) box.append(el('p', '', item));
    }));
  }
  const cols = el('div','columns'), left = el('section','pane source-pane'), right = el('section','pane modern-pane');
  const ll = el('h3','pane-label','原 文'); left.append(ll); u.spans.forEach(s => left.append(sourceBlock(s,words)));
  const rl = el('h3','pane-label','現代語訳'); right.append(rl);
  const edition = u.edition;
  if (edition?.sequence) {
    for (const entry of edition.sequence) {
      right.append(typeof entry === 'string'
        ? modernText(entry, 'body-text cp-continuation', words, u.name_notes)
        : checkpointBlock(edition.passages[entry], words, true, u.name_notes));
    }
  } else {
    const translated=el('div','body-text translation-body');
    let offset=0;
    for (const match of reading.text.matchAll(/〔注(\d+)〕/g)) {
      translated.append(modernText(reading.text.slice(offset,match.index),'translation-run',words,u.name_notes));
      const n=Number(match[1]);
      const marker=button(`注${n}`,()=>readingNotes.openAndFocus('reading-note-'+n),'reading-note-link');
      marker.setAttribute('aria-label',`注${n}：読みや意味の注記を確認`); translated.append(marker);offset=match.index+match[0].length;
    }
    translated.append(modernText(reading.text.slice(offset),'translation-run',words,u.name_notes));right.append(translated);
    // Original marginal/headnote translations are reading content, not editor metadata.
    const normalizeNote = text => String(text).replace(/\s+/g,'');
    const inlineNotes = u.source_notes.filter(n => !(u.id === 'V1-T080-007' && n.source_quote?.includes('品川彌二郞ニユーヨルク')) && typeof n.translation === 'string' && n.translation.trim() && !/^(?:ママ|鼇頭|鰲頭|原文空白[、・]?ママ|原文空白)$/.test(n.translation.trim()) && !normalizeNote(u.translation).includes(normalizeNote(n.translation)));
    for (const n of inlineNotes) {
      if (translated.textContent) translated.append(el('span','','\n'));
      translated.append(modernText((/[鼇鰲]頭/.test(n.source_quote || '') ? '〔原注：鼇頭〕' : '')+headnotePresentation(n.translation),'translation-run',words,u.name_notes));
    }
    if (u.translation === '' && !inlineNotes.length) right.append(el('p','empty-text','〔訳本文はありません。原注・訳注を確認してください。〕'));
    const linkedPassage = checkpoint && edition?.passages.find(p => p.id === checkpoint);
    if (linkedPassage) notes.append(checkpointBlock(linkedPassage, words, false, u.name_notes));
  }
  for (const text of edition?.annotation_notes || []) {
    const note = el('details', 'cp-note');
    note.append(el('summary', '', '字形の注'), el('p', '', text));
    notes.append(note);
  }
  cols.append(left,right); view.append(cols,notes); return view;
}
function buildPage(p,meta,words) {
  const view = el('div'), head = el('header','article-head');
  head.append(el('div','article-kicker',`${volumeNames[p.volume]}`),el('h2','',label(meta)));
  view.append(head);
  if (p.image_reference?.ndl_public_url) { const a=el('a','','NDLデジタルコレクションで原資料を開く ↗'); a.href=p.image_reference.ndl_public_url; a.target='_blank'; a.rel='noopener noreferrer'; head.append(a); }
  const body = el('section','whole-page'); body.append(textBody(p.text,'body-text',words));
  if (p.empty_text) body.append(el('p','empty-text','〔この半頁には原文の文字データがありません。原資料が白紙・欠文であることを示すものではありません。〕'));
  const related = el('div','related'), links = el('div','unit-links'); related.append(el('h3','','この半頁に接続する現代語訳'));
  for (const id of p.translation_ids) links.append(unitButton(id)); related.append(links);
  if (!p.translation_ids.length) related.append(el('p','hint','この半頁を参照する訳単位はありません。架空の訳は補っていません。'));
  body.append(related); view.append(body);
  if (p.hold_unit_ids.length || p.date_OPEN_unit_ids?.length) {
    view.append(el('p', 'hint', 'この半頁に対応する記事には未確定の箇所があります。各記事の末尾で確認できます。'));
  }
  return view;
}
async function choose(id,newKind,scroll = false,write = true,words = [],checkpoint = null) {
  const token = ++generation, meta = (newKind === 'unit' ? byId : pageById).get(id);
  if (!meta) { pendingChoice = null; $('reader').setAttribute('aria-busy','false'); $('load-notice').hidden = true; restoreURL(); setStatus('指定された記事が見つかりません。現在の本文を表示しています。',true); return; }
  pendingChoice = {id,kind:newKind,volume:meta.volume};
  if (selected) updateControls();
  $('reader').setAttribute('aria-busy','true'); $('load-notice').hidden = false;
  $('load-notice').replaceChildren(el('p','',`本文を読み込んでいます。${selected ? '本文・位置欄は直前に開けた資料を表示中です。' : ''}`));
  setStatus('資料を読み込んでいます…');
  try {
    const records = await KIDO.load(meta.chunk); if (token !== generation) return;
    const item = records.find(x => (newKind === 'unit' ? x.id : x.source_ref) === id);
    if (!item) throw Error('資料内に指定されたIDがありません：'+id);
    const view = newKind === 'unit' ? buildUnit(item,meta,words,checkpoint) : buildPage(item,meta,words);
    if (token !== generation) return;
    $('reader').replaceChildren(...Array.from(view.children));
    delete $('reader').dataset.unit; delete $('reader').dataset.page; $('reader').dataset[newKind] = id;
    selected = id; kind = newKind; volume = meta.volume; pendingChoice = null;
    updateControls(); if (!searching) tocList(); else renderList();
    const target = checkpoint && item.edition?.passages.some(p => p.id === checkpoint) ? document.getElementById('cp-' + checkpoint) : null;
    const hash = canonicalHash() + (target ? '&cp=' + checkpoint : '');
    if (location.hash !== hash) {
      try { if (write) history.pushState(null,'',hash); else history.replaceState(null,'',hash); }
      catch { if (write) location.hash = hash; }
    }
    remember('position',{id,kind});
    $('reader').setAttribute('aria-busy','false'); $('load-notice').hidden = true;
    setStatus(`${volumeNames[volume]}の本文を表示しました。`);
    if (target) { if (document.body.dataset.display === 'source') { $('display-mode').value = 'parallel'; document.body.dataset.display = 'parallel'; } focusAt(target); }
    else if (scroll) focusAt($('reader'));
  } catch (e) {
    if (token !== generation) return;
    pendingChoice = null; $('reader').setAttribute('aria-busy','false'); if (selected) { updateControls(); restoreURL(); }
    const message = '本文を読み込めませんでした。再読み込みしてください。' + (selected ? ' 直前の本文を表示しています。' : '');
    $('load-notice').replaceChildren(el('p','error',message),button('この資料を再読み込み',() => choose(id,newKind,scroll,true,words,checkpoint)));
    $('load-notice').hidden = false; setStatus(message,true);
  }
}
function step(delta) { const current = pendingChoice || {id:selected,kind,volume}; const rows = rowsFor(current.kind,current.volume), i = rows.findIndex(x => x.id === current.id); if (rows[i+delta]) choose(rows[i+delta].id,current.kind,true); }
async function search() {
  const token = ++searchGeneration, q = $('query').value.trim(); if (!q) { tocList(); return; }
  query = q; searching = true; listOffset = 0; list = []; renderList();
  $('list-title').textContent = '検索結果'; $('clear-search').hidden = false; $('result-count').textContent = '検索資料を読み込んでいます…';
  const vol = +$('search-volume').value, filter = $('search-kind').value, words = norm(q).split(/\s+/).filter(Boolean);
  try {
    const sources = await Promise.all((vol ? [vol] : [1,2,3]).map(v => KIDO.load('search-v'+v))); if (token !== searchGeneration) return;
    const matched = [];
    for (const x of sources.flat()) {
      if (filter !== 'all' && x.kind !== filter) continue;
      const meta = (x.kind === 'unit' ? byId : pageById).get(x.id);
      if (KidoSearch.matches(x,volumeNames[meta.volume],words)) matched.push({...meta,kind:x.kind,searchRecord:x,words});
    }
    list = matched; const un = matched.filter(x => x.kind === 'unit').length, pn = matched.length-un;
    $('result-count').textContent = `${matched.length.toLocaleString()}件（記事 ${un.toLocaleString()}・原文半頁 ${pn.toLocaleString()}）` + (vol ? ' · '+volumeNames[vol] : ' · 全3巻');
    renderList(); if (!list.length) $('results').append(el('p','hint','一致する本文・ID・参照情報はありません。表記や検索対象を変更してください。'));
    setStatus(`「${q}」の検索が完了しました。検索結果を選ぶと本文へ移動します。`);
  } catch (e) { if (token !== searchGeneration) return; $('result-count').textContent = e.message; $('results').replaceChildren(button('この条件で再検索',search)); setStatus(e.message,true); }
}
function applySettings() {
  const size = Math.max(16,Math.min(28,Number($('font-size').value)||19));
  const line = ['1.8','2.1','2.5'].includes($('line-height').value) ? $('line-height').value : '2.1';
  const theme = $('theme').value === 'dark' ? 'dark' : 'light';
  const display = ['parallel','source','modern'].includes($('display-mode').value) ? $('display-mode').value : 'parallel';
  const width = ['960','1200','1600'].includes($('reading-width').value) ? $('reading-width').value : '1200';
  document.documentElement.style.setProperty('--font-size',size+'px'); document.documentElement.style.setProperty('--leading',line); document.documentElement.style.setProperty('--reader-max',width+'px');
  document.body.dataset.theme = theme; document.body.dataset.display = display; $('font-value').textContent = size+'px';
  remember('settings',{size,line,theme,display,width});
}
function route() {
  const m = location.hash.match(/^#([up])=([^&]+)(?:&cp=(v[123]-[0-9]{3}))?$/); if (!m) return false;
  let id; try { id = decodeURIComponent(m[2]); } catch { ++generation; pendingChoice = null; $('reader').setAttribute('aria-busy','false'); $('load-notice').hidden = true; restoreURL(); setStatus('URLのID形式が不正です。',true); return true; }
  choose(id,m[1] === 'u' ? 'unit' : 'page',false,false,[],m[3]); return true;
}
try {
  catalog = await KIDO.load('catalog'); units = catalog.units; pages = catalog.pages; byId = new Map(units.map(x => [x.id,x])); pageById = new Map(pages.map(x => [x.id,x]));
  const settings = recall('settings'); if (settings) { $('font-size').value = settings.size || 19; $('line-height').value = settings.line || '2.1'; $('theme').value = settings.theme || 'light'; $('display-mode').value = settings.display || 'parallel'; $('reading-width').value = settings.width || '1200'; } applySettings();
  $('date-form').onsubmit = e => { e.preventDefault(); $('query').value=$('date-query').value; $('search-kind').value='all'; search(); };
  $('search-form').onsubmit = e => { e.preventDefault(); search(); };
  $('search-volume').onchange = $('search-kind').onchange = () => { if (searching) search(); };
  $('clear-search').onclick = () => { tocList(); setStatus('検索を解除しました。'); };
  $('query').oninput = () => { if (!$('query').value) tocList(); };
  for (const [id,delta] of [['more-results',pageSize],['previous-results',-pageSize]]) $(id).onclick = () => { listOffset = Math.max(0,Math.min(Math.floor(Math.max(0,list.length-1)/pageSize)*pageSize,listOffset+delta)); renderList(); focusAt($('results')); };
  $('toc').onchange = () => choose($('toc').value,kind,true);
  $('browse-kind').onchange = () => { const k = $('browse-kind').value; tocList(); choose(rowsFor(k)[0].id,k,true); };
  document.querySelectorAll('[data-volume]').forEach(b => b.onclick = () => { const v = +b.dataset.volume; tocList(); choose(rowsFor(kind,v)[0].id,kind,true); });
  for (const id of ['previous','previous-bottom']) $(id).onclick = () => step(-1);
  for (const id of ['next','next-bottom']) $(id).onclick = () => step(1);
  $('settings-btn').onclick = () => { const hide = !$('settings').hidden; $('settings').hidden = hide; $('settings-btn').setAttribute('aria-expanded',String(!hide)); if (!hide) focusAt($('font-size')); };
  for (const id of ['font-size','line-height','theme','display-mode','reading-width']) $(id).addEventListener('input',applySettings);
  $('about-btn').onclick = () => showAbout(); $('close-about').onclick = () => $('about').close();
  for (const id of ['skip-reader','jump-reader','back-reader']) $(id).onclick = e => { e.preventDefault(); focusAt($('reader')); };
  window.addEventListener('hashchange',() => { if (!route()) restoreURL(); });
  if (!route()) { const saved = recall('position'); if (saved && ['unit','page'].includes(saved.kind) && (saved.kind === 'unit' ? byId : pageById).has(saved.id)) choose(saved.id,saved.kind,false,false); else choose('V1-T002-002','unit',false,false); }
} catch (e) { $('reader').setAttribute('aria-busy','false'); setStatus(e.message,true); $('load-notice').hidden = false; $('load-notice').replaceChildren(el('p','error',e.message),el('p','','時間をおいて再読み込みしてください。')); }
})();
