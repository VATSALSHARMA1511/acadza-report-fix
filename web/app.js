/* Acadza Report → Fix · faculty console. Vanilla JS, no build step, works from file:// or any static host.
   Data comes from data.js (precomputed engine output). State + audit log live in localStorage. */
(function () {
'use strict';
const D = window.DATA;
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode: keep in memory only */ } },
};

/* ------------------------------------------------------------------ text helpers */
const VOID = new Set(['br', 'hr', 'img', 'mspace', 'input', 'meta', 'link']);
function sanitize(html) {
  const doc = new DOMParser().parseFromString('<body>' + (html || '') + '</body>', 'text/html');
  doc.querySelectorAll('script,iframe,object,embed,style,link,meta').forEach(n => n.remove());
  doc.querySelectorAll('*').forEach(n => [...n.attributes].forEach(a => {
    if (/^on/i.test(a.name) || /^\s*javascript:/i.test(a.value)) n.removeAttribute(a.name);
  }));
  return doc.body.innerHTML;
}
function mathText(n) {
  if (n.nodeType === 3) return n.nodeValue;
  if (n.nodeType !== 1) return '';
  const k = [...n.childNodes].map(mathText);
  switch (n.localName) {
    case 'msup': return k[0] + '^' + (k[1].length > 1 ? '(' + k[1] + ')' : k[1]);
    case 'msub': return k[0] + '_' + (k[1].length > 1 ? '(' + k[1] + ')' : k[1]);
    case 'mfrac': return '(' + k[0] + ')/(' + k[1] + ')';
    case 'msqrt': return '√(' + k.join('') + ')';
    case 'br': return '\n';
    case 'h3': case 'p': case 'div': return k.join('') + '\n';
    default: return k.join('');
  }
}
function toText(html) {
  const doc = new DOMParser().parseFromString('<body>' + (html || '') + '</body>', 'text/html');
  return mathText(doc.body).replace(/[ \t ​]+/g, ' ').replace(/\n\s*\n+/g, '\n').replace(/ ?\n ?/g, '\n').trim();
}
function labelPositions(t) {
  const ms = [...t.matchAll(/\(([A-D])\)/g)].map(m => [m[1], m.index, m.index + m[0].length]);
  let la = -1; ms.forEach((m, i) => { if (m[0] === 'A') la = i; });
  if (la < 0) return [];
  const seq = []; let want = 'A';
  for (const m of ms.slice(la)) if (m[0] === want) { seq.push(m); want = String.fromCharCode(want.charCodeAt(0) + 1); }
  return seq;
}
function parseOptions(html) {
  const t = toText(html), pos = labelPositions(t), o = {};
  pos.forEach((p, i) => { o[p[0]] = t.slice(p[2], i + 1 < pos.length ? pos[i + 1][1] : t.length).trim(); });
  return o;
}
const body = q => q[q.questionType];

/* ------------------------------------------------------------------ edit application (mirror of engine/apply.py) */
function applyEdit(q, e) {
  q = structuredClone(q);
  if (e.field === 'questionType') { const old = q.questionType; q[e.replace] = q[old]; delete q[old]; q.questionType = e.replace; return q; }
  const b = body(q);
  if (e.field === 'answer') { b.answer = e.replace; return q; }
  const cur = b[e.field];
  const i = cur.indexOf(e.find);
  if (i < 0 || cur.indexOf(e.find, i + 1) >= 0) throw new Error('edit does not apply cleanly');
  b[e.field] = cur.slice(0, i) + e.replace + cur.slice(i + e.find.length);
  return q;
}
const applyAll = (q, es) => es.reduce((a, e) => applyEdit(a, e), q);

/* ------------------------------------------------------------------ cases, urgency */
const SEV = { answer_key: 100, unsound: 92, wrong_question: 90, type_mismatch: 78, stem_data: 72, option_repair: 72, identical_options: 70, diagram: 66,
  solution_fix: 55, solution_missing: 50, markup_leak: 36, notation: 36, answer_form: 30, wrong_chapter: 30, syllabus: 24, spelling: 16, noise: 10, exam_reference: 10 };
const REPAIR_NAME = { answer_key: 'Answer key', unsound: 'No valid answer', wrong_question: 'Wrong question', type_mismatch: 'Wrong question type', stem_data: 'Missing value in stem',
  option_repair: 'Option missing / blank', identical_options: 'Identical options', diagram: 'Missing figure', solution_fix: 'Solution error', solution_missing: 'Solution missing',
  markup_leak: 'Raw code visible', notation: 'Symbol lost', answer_form: 'Unit not stated', wrong_chapter: 'Wrong chapter', syllabus: 'Out of syllabus?', spelling: 'Spelling', noise: 'Stray text', exam_reference: 'Exam tag in stem' };
const VERDICT_NAME = { no_error: 'Question is correct', already_fixed: 'Already fixed', display_issue: 'Display issue', app_issue: 'App issue', language_mode: 'Language request', not_actionable: 'Not actionable' };
const qmap = Object.fromEntries(D.questions.map(q => [q._id, q]));

const cases = D.cases.map(c => {
  const edits = [c.edit, ...(c.extra_edits || [])].filter(Boolean);
  const n = c.reports.length;
  const base = c.verdict === 'defect' ? (SEV[c.repair] ?? 40) : 4;
  const score = base * (1 + 0.35 * (n - 1)) + (c.route === 'faculty_review' ? 20 : 0) + (c.flags && c.flags.abuse ? 6 : 0);
  return { ...c, id: c.questionId, q: qmap[c.questionId], edits, score, n };
});
const byId = Object.fromEntries(cases.map(c => [c.id, c]));

/* ------------------------------------------------------------------ state */
const S = store.get('acadza.state.v3', { status: {}, edits: {}, replies: {}, reviewer: '', theme: '', collapsed: { done: true, none: false } });
const AUDIT = store.get('acadza.audit.v3', []);
const save = () => store.set('acadza.state.v3', S);
const defaultStatus = c => c.route === 'auto_apply' ? 'applied' : c.route === 'faculty_review' ? 'pending' : 'ai-closed';
const status = c => S.status[c.id] || defaultStatus(c);
const OPEN = new Set(['pending', 'flagged', 'applied', 'ai-closed']);
const isOpen = c => OPEN.has(status(c));
const section = c => !isOpen(c) ? 'done' : (status(c) === 'pending' || status(c) === 'flagged') ? 'needs' : status(c) === 'applied' ? 'auto' : 'none';
const effEdits = c => {                       // faculty's overrides win
  const o = S.edits[c.id];
  return c.edits.map((e, i) => (o && o[i] !== undefined) ? { ...e, replace: o[i] } : e);
};
const isLive = c => ['applied', 'kept', 'approved', 'approved_edited'].includes(status(c)) && c.edits.length > 0;
const replyOf = (c, r) => (S.replies[r.reportId] ?? c.replies[r.reportId]);
let sel = null, editing = false;

/* ------------------------------------------------------------------ audit */
function audit(c, action, extra = {}) {
  const ents = effEdits(c);
  AUDIT.unshift({ ts: new Date().toISOString(), reviewer: S.reviewer || 'Faculty', questionId: c.id, action, verdict: c.verdict, repair: c.repair, route: c.route,
    edits: ents, reportIds: c.reports.map(r => r.reportId), ...extra });
  store.set('acadza.audit.v3', AUDIT);
}

/* ------------------------------------------------------------------ headlines */
function optLabel(q, letter) { const o = parseOptions(body(q).question)[letter]; return o ? `${letter} · ${o}` : letter; }
function headline(c) {
  const q = c.q;
  if (c.verdict !== 'defect') return { t: VERDICT_NAME[c.verdict] || c.verdict, sub: { no_error: 'Checked independently. The student is mistaken, nothing to change.', already_fixed: 'The reported problem is no longer in the live record.', display_issue: 'Stored content is fine. This is about rendering or load.', app_issue: 'Platform behaviour, not this question.', language_mode: 'Student wants a language this question is not available in.', not_actionable: 'The comment gives nothing to act on and the checks found nothing.' }[c.verdict] };
  const a = c.edits.find(e => e.field === 'answer');
  switch (c.repair) {
    case 'answer_key': { const o = a ? fmtKey(a.find) : '', n = a ? fmtKey(a.replace) : ''; return { t: `Answer key is wrong: ${o} → ${n}`, sub: 'An independent solve disagrees with the stored key.' }; }
    case 'type_mismatch': return { t: 'Stored as multiple-correct, but only one option is correct', sub: 'Convert to single-correct (mcq → scq) with key B so partial picks stop being penalised.' };
    case 'solution_fix': return { t: 'The solution is wrong, the key is right', sub: 'Students who read it are shown a wrong step or another question.' };
    case 'stem_data': return { t: 'A value the question needs is missing', sub: 'The stored solution uses it, so it is safe to add to the stem.' };
    case 'option_repair': return { t: c.route === 'faculty_review' ? 'An option is missing and I can’t recover it from the record' : 'A blank option is restored from key + solution', sub: c.route === 'faculty_review' ? 'The key is fine. The wording of the missing option must come from the source.' : 'Key and solution together fix its content without doubt.' };
    case 'identical_options': return { t: 'Two options are identical', sub: 'Replacement distractor is authored content: needs a human.' };
    case 'diagram': return { t: 'The figure is missing', sub: 'The AI cannot draw it. Upload the original figure.' };
    case 'unsound': return { t: 'No option is correct as written', sub: 'Assertion and Reason are both false and no option covers that.' };
    case 'wrong_chapter': return { t: 'Filed under the wrong chapter', sub: 'Content is correct; only its place in the syllabus tree is wrong.' };
    case 'syllabus': return { t: 'Is this inside the syllabus?', sub: 'A judgement call. The question stays live until you decide.' };
    default: return { t: REPAIR_NAME[c.repair] || c.repair, sub: '' };
  }
}
const fmtKey = k => Array.isArray(k) ? (k.length ? k.map(x => x === '' ? '∅' : x).join(', ') : '∅') : String(k);

/* ------------------------------------------------------------------ token diff (plain text) */
function tokenDiff(a, b) {
  const ta = a.split(/(\s+)/).filter(Boolean), tb = b.split(/(\s+)/).filter(Boolean);
  const n = ta.length, m = tb.length;
  if (n * m > 600000) return `<del>${esc(a)}</del> <ins>${esc(b)}</ins>`;
  const L = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = ta[i] === tb[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  let i = 0, j = 0, out = '', del = '', ins = '';
  const flush = () => { if (del) out += `<del>${esc(del)}</del>`; if (ins) out += `<ins>${esc(ins)}</ins>`; del = ins = ''; };
  while (i < n || j < m) {
    if (i < n && j < m && ta[i] === tb[j]) { flush(); out += esc(ta[i]); i++; j++; }
    else if (j < m && (i === n || L[i][j + 1] >= L[i + 1][j])) { ins += tb[j++]; }
    else { del += ta[i++]; }
  }
  flush();
  return out;
}

/* ------------------------------------------------------------------ rendered diff (highlight inside real HTML) */
function balanced(h) {
  const st = [];
  for (const m of h.matchAll(/<(\/?)([a-zA-Z][a-zA-Z0-9]*)[^>]*?(\/?)>/g)) {
    const [, close, name, self] = m; const n = name.toLowerCase();
    if (self || VOID.has(n)) continue;
    if (!close) st.push(n); else if (st.pop() !== n) return false;
  }
  return st.length === 0;
}
function trimCommon(find, rep) {
  let p = 0; const max = Math.min(find.length, rep.length);
  while (p < max && find[p] === rep[p]) p++;
  while (p > 0 && (find.slice(0, p).split('<').length !== find.slice(0, p).split('>').length)) p--; // do not cut inside a tag
  let s = 0;
  while (s < max - p && find[find.length - 1 - s] === rep[rep.length - 1 - s]) s++;
  while (s > 0 && (find.slice(find.length - s).split('<').length !== find.slice(find.length - s).split('>').length)) s--;
  return { pre: find.slice(0, p), f: find.slice(p, find.length - s), r: rep.slice(p, rep.length - s), post: find.slice(find.length - s) };
}
function marked(field, e, which) {                 // returns sanitized HTML with the changed region highlighted
  const t = trimCommon(e.find, e.replace);
  const piece = which === 'before' ? t.f : t.r, tag = which === 'before' ? 'del' : 'ins', cls = which === 'before' ? 'd' : 'a';
  if (!piece) return null;
  if (!balanced(piece)) return null;
  const wrapped = which === 'before' ? `${t.pre}<${tag} class="${cls}">${piece}</${tag}>${t.post}` : `${t.pre}<${tag} class="${cls}">${piece}</${tag}>${t.post}`;
  return wrapped;
}
function paneHTML(c, field, which) {
  // Render field after applying edits on the non-highlight side
  const q = c.q; const es = effEdits(c).filter(e => e.field === field && typeof e.find === 'string');
  let h = body(q)[field] || '';
  if (which === 'before') {
    for (const e of es) { const w = marked(field, e, 'before'); if (w && h.includes(e.find)) h = h.replace(e.find, () => w); }
  } else {
    for (const e of es) { const w = marked(field, e, 'after'); const r = w ?? e.replace; h = h.replace(e.find, () => r); }
  }
  return sanitize(h);
}

/* ------------------------------------------------------------------ question rendering */
function optionsList(q, hl) {
  const o = parseOptions(body(q).question); const keys = Object.keys(o); if (!keys.length) return '';
  const key = body(q).answer; const ks = Array.isArray(key) ? key : [key];
  const seen = {};
  keys.forEach(k => { const n = o[k].replace(/\s+/g, '').toLowerCase(); if (n) (seen[n] = seen[n] || []).push(k); });
  return `<ul class="opts" aria-label="Options as parsed">` + 'ABCD'.split('').map(k => {
    if (!(k in o)) return `<li class="blank"><b>${k}</b><span>(option missing)</span></li>`;
    const blank = !o[k].trim(), dup = !blank && seen[o[k].replace(/\s+/g, '').toLowerCase()].length > 1;
    return `<li class="${ks.includes(k) ? 'key' : ''} ${blank ? 'blank' : ''} ${dup ? 'dup' : ''}"><b>${k}</b><span>${blank ? '(blank)' : esc(o[k])}</span></li>`;
  }).join('') + `</ul>`;
}
function optionsIssues(q) {                    // only show the parsed options when something is wrong with them
  const o = parseOptions(body(q).question), t = q.questionType;
  if (t === 'integerQuestion') return '';
  const norm = x => x.replace(/\s+/g, '').toLowerCase(), vals = Object.values(o).filter(v => v.trim()).map(norm);
  const bad = 'ABCD'.split('').some(k => !(k in o) || !o[k].trim()) || new Set(vals).size !== vals.length;
  return bad ? `<div style="margin-top:10px;font:600 11px var(--ui);color:var(--red);text-transform:uppercase;letter-spacing:.06em">Option check · problems found</div>` + optionsList(q) : '';
}
function qBlock(html) { return `<div class="qbody">${sanitize(html)}</div>`; }

/* ------------------------------------------------------------------ queue */
function shortTitle(c) {
  if (c.verdict !== 'defect') return VERDICT_NAME[c.verdict] || c.verdict;
  const k = c.edits.find(e => e.field === 'answer');
  if (c.repair === 'answer_key' && k) return `Answer key: ${fmtKey(k.find)} → ${fmtKey(k.replace)}`;
  return REPAIR_NAME[c.repair] || c.repair;
}
function itemHTML(c) {
  const st = status(c);
  const sevCls = c.verdict !== 'defect' ? 's-ok' : c.score >= 90 ? 's-hi' : c.score >= 45 ? 's-md' : 's-lo';
  const chips = [];
  if (c.n > 1) chips.push(`<span class="chip amber">${c.n} reports</span>`);
  else chips.push(`<span class="chip">1 report</span>`);
  if (c.flags && c.flags.abuse) chips.push(`<span class="chip red">injection attempt</span>`);
  if (c.route === 'faculty_review' && isOpen(c)) chips.push(`<span class="chip red">${c.edits.length ? 'proposal to approve' : 'needs your wording'}</span>`);
  else if (c.route === 'auto_apply' && isOpen(c)) chips.push(`<span class="chip green">live</span>`);
  if (!isOpen(c)) chips.push(`<span class="chip blue">${esc(st.replace(/_/g, ' '))}</span>`);
  return `<div class="qi ${sevCls} ${sel === c.id ? 'sel' : ''} ${!isOpen(c) ? 'done' : ''}" role="button" tabindex="0" data-id="${c.id}">
    <div class="bar"></div><div class="in">
      <div class="l1">${esc(shortTitle(c))}</div>
      <div class="l2">${esc(c.q.subject)} · ${esc(c.q.chapter)} · ${c.q.questionType}</div>
      <div class="l3">${chips.join('')}</div></div></div>`;
}
const GROUPS = [
  ['needs', 'Needs your decision', 'The AI is not allowed to change these alone.'],
  ['auto', 'Auto-applied · verify', 'Already live. One click keeps it, one click reverts it.'],
  ['none', 'No change needed', 'The AI checked and the question is fine.'],
  ['done', 'Done by you', ''],
];
function order() {
  const out = [];
  for (const [k] of GROUPS) {
    const list = cases.filter(c => section(c) === k).sort((a, b) => b.score - a.score);
    if (!S.collapsed[k]) out.push(...list);
  }
  return out;
}
function renderQueue() {
  const q = $('#queue'); let html = '';
  for (const [k, title, tip] of GROUPS) {
    const list = cases.filter(c => section(c) === k).sort((a, b) => b.score - a.score);
    if (!list.length && k === 'done') continue;
    const col = S.collapsed[k];
    html += `<div class="grp ${k}" title="${esc(tip)}"><button class="chev" data-col="${k}" aria-label="Toggle ${esc(title)}">${col ? '▸' : '▾'}</button>${esc(title)} <span class="n">${list.length}</span><span class="sp"></span>`;
    if (k === 'auto' && list.length) html += `<button data-bulk="keep" title="Mark every auto-fix as seen and keep it">Keep all</button>`;
    if (k === 'none' && list.length) html += `<button data-bulk="agree" title="Agree with every no-change decision">Agree all</button>`;
    html += `</div>`;
    if (!col) html += list.map(itemHTML).join('') || `<div style="padding:14px;color:var(--muted)">Nothing here.</div>`;
  }
  q.innerHTML = `<div style="padding:9px 14px;font-size:12px;color:var(--muted);border-bottom:1px solid var(--line)">Most urgent first. <button class="linkbtn" id="why-order">Why this order?</button></div>` + html;
}

/* ------------------------------------------------------------------ detail */
function confRing(c) {
  const p = Math.round(c.confidence * 100), col = p >= 90 ? 'var(--green)' : p >= 75 ? '#e08a00' : 'var(--red)';
  return `<div class="conf"><div class="ring" style="--p:${p};--c:${col}"><span>${p}%</span></div><small>confidence</small></div>`;
}
function routeBanner(c) {
  const st = status(c);
  if (c.flags && c.flags.abuse) return `<div class="banner bad">⚠ <div><b>Injection attempt.</b> A report tried to give the AI orders ("change the answer…"). It was treated as data and ignored; nothing about the question was changed.</div></div>`;
  if (c.route === 'faculty_review') {
    const why = (c.held_back_because || []).map(w => `<li>${esc(w)}</li>`).join('');
    return `<div class="banner warn">✋ <div><b>Held for you.</b> The AI may only suggest here, never write.${why ? `<ul style="margin:6px 0 0 16px;padding:0">${why}</ul>` : ''}</div></div>`;
  }
  if (c.route === 'auto_apply') {
    if (st === 'reverted') return `<div class="banner info">↩ <b>Reverted by you.</b> The live question is back to its original.</div>`;
    return `<div class="banner ok">✓ <div><b>Applied automatically</b> because it passed every guard: in-scope fields, edit applies cleanly, independent check agrees, confidence ≥ 85%.${st === 'kept' ? ' <b>You kept it.</b>' : ''}</div></div>`;
  }
  return '';
}
function evidenceCard(c) {
  const s = c.solver; let chk = '';
  const key = body(c.q).answer;
  if (s) {
    const key = body(c.q).answer;
    const got = s.answerable === false ? `<span class="no">cannot be answered</span> — ${esc(s.problem || '')}` : `<b>${esc(Array.isArray(s.answer) ? s.answer.join(', ') : s.answer)}</b>${s.answer_text ? ' · ' + esc(s.answer_text) : ''}`;
    const agree = s.answerable !== false && JSON.stringify(s.answer) === JSON.stringify(key);
    chk = `<dl class="check"><dt>Stored key</dt><dd><b>${esc(fmtKey(key))}</b></dd>
      <dt>Blind re-solve</dt><dd>${got} ${s.answerable !== false ? (agree ? '<span class="ok">✓ matches key</span>' : '<span class="no">✗ differs from key</span>') : ''}</dd>
      <dt>Method 1</dt><dd>${esc(s.method_1)}</dd><dt>Cross-check</dt><dd>${esc(s.method_2)}</dd></dl>`;
  }
  return `<section class="card"><h4>Why <span class="sp"></span><span class="chip">${esc(c.verdict.replace(/_/g, ' '))}${c.repair ? ' · ' + esc(c.repair) : ''}</span></h4><div class="pad why">${esc(c.evidence)}${chk}</div></section>`;
}
function changeCard(c) {
  const es = effEdits(c);
  if (c.verdict !== 'defect') return '';
  let h = '';
  const a = es.find(e => e.field === 'answer'), t = es.find(e => e.field === 'questionType');
  if (a || t) {
    const q = c.q;
    const ob = a ? (Array.isArray(a.find) ? a.find : [a.find]) : [], nb = a ? (Array.isArray(a.replace) ? a.replace : [a.replace]) : [];
    const opts = parseOptions(body(q).question);
    const lab = arr => arr.filter(x => x !== '').map(x => `${esc(x)}${opts[x] ? ' · ' + esc(opts[x]) : ''}`).join('<br>') || '∅';
    h += `<div class="keychg">`;
    if (t) h += `<div class="keybox old"><small>Type</small><b>${esc(t.find)}</b></div><span class="arrow">→</span><div class="keybox new"><small>Type</small><b>${esc(t.replace)}</b></div><span style="width:18px"></span>`;
    if (a) h += `<div class="keybox old"><small>Key before</small><b>${esc(fmtKey(a.find))}</b><span>${lab(ob)}</span></div><span class="arrow">→</span><div class="keybox new"><small>Key after</small><b>${esc(fmtKey(a.replace))}</b><span>${lab(nb)}</span></div>`;
    h += `</div>`;
  }
  for (const f of ['question', 'solution']) {
    const fe = es.filter(e => e.field === f && typeof e.find === 'string');
    if (!fe.length) continue;
    const before = toText(body(c.q)[f]), after = toText(body(applyAll(c.q, fe))[f]);
    h += `<div class="textdiff" aria-label="Text diff of ${f}">${tokenDiff(before, after)}</div>
      <div class="cols"><div class="pane"><small>Before · ${f}</small><div class="qbody">${paneHTML(c, f, 'before')}</div></div>
      <div class="pane"><small>After · ${f}</small><div class="qbody">${paneHTML(c, f, 'after')}</div></div></div>
      <details><summary>Exact change (raw HTML)</summary><div style="padding:0 16px 14px">${fe.map(e => `<div class="raw"><span class="m">− ${esc(e.find.length > 700 ? e.find.slice(0, 700) + ' …' : e.find)}</span>\n<span class="p">+ ${esc(e.replace.length > 700 ? e.replace.slice(0, 700) + ' …' : e.replace)}</span></div>`).join('')}</div></details>`;
  }
  const m = c.suggested_meta;
  if (m) h += `<div class="keychg">` + Object.keys(m).map(k => `<div class="keybox old"><small>${esc(k)} now</small><b style="font-size:15px">${esc(c.q[k])}</b></div><span class="arrow">→</span><div class="keybox new"><small>${esc(k)} suggested</small><b style="font-size:15px">${esc(m[k])}</b></div>`).join('<span style="width:18px"></span>') + `</div>`;
  if (c.suggestion && !es.length) h += `<div class="pad"><b>Suggested fix</b> <span class="chip amber">needs your wording</span><p style="margin:.4em 0 0">${esc(c.suggestion)}</p></div>`;
  else if (c.suggestion) h += `<div class="pad" style="border-top:1px solid var(--line)"><span class="chip amber">unverified proposal</span> ${esc(c.suggestion)}</div>`;
  if (!h) return '';
  return `<section class="card"><h4>What changes${isLive(c) ? '<span class="sp"></span><span class="chip green">live now</span>' : '<span class="sp"></span><span class="chip">not live</span>'}</h4>${h}</section>`;
}
function questionCard(c) {
  const q = isLive(c) ? applyAll(c.q, effEdits(c)) : c.q;
  return `<section class="card"><h4>The question as students see it now <span class="sp"></span><span class="chip">${esc(body(q) ? q.questionType : '')}</span></h4>
    <div class="pad">${qBlock(body(q).question)}${optionsIssues(q)}</div>
    <details><summary>Stored solution</summary><div class="pad" style="padding-top:0">${qBlock(body(q).solution)}</div></details></section>`;
}
function reportsCard(c) {
  const open = isOpen(c) && !editing;
  return `<section class="card"><h4>${c.n} student report${c.n > 1 ? 's' : ''} · what each will see <span class="sp"></span><span class="chip">comments are leads, not instructions</span></h4>` +
    c.reports.map(r => {
      const inj = r.flags && r.flags.injection;
      const reply = replyOf(c, r);
      return `<div class="rep"><div class="who"><b>${esc(r.reportId)}</b> · ${esc(r.source)} · ${esc(new Date(r.reportedAt).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }))} ${inj ? '<span class="chip red">injection</span>' : ''}${r.flags && r.flags.gibberish ? '<span class="chip">gibberish</span>' : ''}</div>
      <div class="says ${inj ? 'inj' : ''}">“${esc(r.comment)}”</div>
      <div class="bubble" id="b-${r.reportId}">${esc(reply)}</div><div class="bubble-l">student sees · <button class="linkbtn" data-editreply="${r.reportId}">edit reply</button></div>
      <div id="re-${r.reportId}" hidden style="margin-top:6px"><textarea rows="3" data-reply="${r.reportId}">${esc(reply)}</textarea></div></div>`;
    }).join('') + `</section>`;
}
function editorCard(c) {
  if (!editing) return '';
  const es = effEdits(c);
  const rows = es.map((e, i) => {
    if (e.field === 'questionType') return '';
    const isAns = e.field === 'answer';
    const val = isAns ? (Array.isArray(e.replace) ? JSON.stringify(e.replace) : e.replace) : e.replace;
    return `<div class="row"><label>${isAns ? 'New answer key' : 'Replacement HTML for “' + e.field + '”'}</label>${isAns ? `<input data-ed="${i}" value="${esc(val)}">` : `<textarea rows="4" data-ed="${i}">${esc(val)}</textarea>`}</div>`;
  }).join('');
  return `<div class="editor"><b>Edit before approving</b><p style="margin:.2em 0 10px;color:var(--muted)">Your wording replaces the AI’s proposal. The diff above updates when you press Save.</p>${rows || '<div class="row">Nothing to edit here: this proposal has no concrete change. Approve to record your decision, or write the fix in the note.</div>'}
    <div class="row"><label>Note for the audit log (optional)</label><input id="ed-note" placeholder="e.g. checked against NCERT p.142"></div>
    <button class="btn primary" id="ed-save">Save &amp; approve</button> <button class="btn" id="ed-cancel">Cancel</button></div>`;
}
function actionBar(c) {
  const st = status(c); let msg = '', btns = '';
  const next = `<button class="btn" data-act="next">Next <kbd>J</kbd></button>`;
  if (section(c) === 'needs') {
    msg = c.edits.length ? 'Approving applies the change to the live question and logs it.' : 'Approving records your decision and the suggested fix in the audit log.';
    btns = `<button class="btn danger" data-act="reject">Reject <kbd>R</kbd></button><button class="btn" data-act="edit">Edit <kbd>E</kbd></button><button class="btn primary" data-act="approve">${c.edits.length ? 'Approve &amp; apply' : 'Accept suggestion'} <kbd>A</kbd></button>`;
  } else if (section(c) === 'auto') {
    msg = 'This is already live. Keeping it just confirms you looked.';
    btns = `<button class="btn danger" data-act="revert">Revert <kbd>R</kbd></button><button class="btn primary" data-act="keep">Keep <kbd>A</kbd></button>`;
  } else if (section(c) === 'none') {
    msg = 'The AI found nothing to change. Disagree? Send it back to the review lane.';
    btns = `<button class="btn" data-act="flag">Not convinced — review <kbd>R</kbd></button><button class="btn primary" data-act="agree">Agree <kbd>A</kbd></button>`;
  } else {
    msg = `Status: ${st.replace(/_/g, ' ')}.`;
    btns = `<button class="btn" data-act="reopen">Reopen</button>`;
  }
  return `<div class="actions"><div class="msg">${msg}</div>${btns}${next}</div>`;
}
function renderDetail() {
  const el = $('#detail');
  document.body.classList.toggle('has-sel', !!sel);
  if (!sel) {
    const open = cases.filter(isOpen).length;
    el.innerHTML = `<div class="empty"><div><b>${open ? 'Pick a case on the left' : 'Queue clear 🎉'}</b>${open ? 'Most urgent is at the top. Press <kbd>J</kbd> to start.' : 'Every case is decided. Your audit log has the full record.'}</div></div>`;
    return;
  }
  const c = byId[sel]; const h = headline(c);
  const live = isLive(c);
  el.innerHTML = `<button class="ghost back" id="back">← Queue</button>
  <section class="card"><div class="hero"><div><div class="meta">${esc(c.q.subject)} · ${esc(c.q.chapter)} · ${esc(c.q.questionType)} · ${c.n} report${c.n > 1 ? 's' : ''} · <span title="${esc(c.id)}">…${esc(c.id.slice(-6))}</span></div>
    <h2>${esc(h.t)}</h2><div class="sub">${esc(h.sub)}</div></div>${confRing(c)}</div></section>
    ${routeBanner(c)}
    ${evidenceCard(c)}
    <section class="card" id="chg-wrap">${''}</section>
    ${questionCard(c)}
    ${reportsCard(c)}
    ${actionBar(c)}`;
  // the change card (with editor) goes in its own slot so the editor stays inside the card
  const chg = changeCard(c);
  const wrap = $('#chg-wrap');
  if (chg) { wrap.outerHTML = chg.replace('</section>', editorCard(c) + '</section>'); } else wrap.remove();
}

/* ------------------------------------------------------------------ actions */
function toast(msg, undo) {
  const t = $('#toast'); t.innerHTML = `<span>${esc(msg)}</span>${undo ? '<button id="undo">Undo</button>' : ''}`; t.hidden = false;
  clearTimeout(toast.h); toast.h = setTimeout(() => { t.hidden = true; }, 6000);
  if (undo) $('#undo').onclick = () => { undo(); t.hidden = true; };
}
function setStatus(c, st, act, extra) {
  const prev = S.status[c.id], prevEdit = S.edits[c.id];
  S.status[c.id] = st; save(); audit(c, act, extra);
  refresh();
  return () => { if (prev === undefined) delete S.status[c.id]; else S.status[c.id] = prev; S.edits[c.id] = prevEdit; if (prevEdit === undefined) delete S.edits[c.id]; AUDIT.shift(); store.set('acadza.audit.v3', AUDIT); save(); refresh(); };
}
function advance(prevOrder) {
  const ord = order(); const nextOpen = ord.find(c => isOpen(c) && c.id !== sel);
  const idx = prevOrder.findIndex(x => x.id === sel);
  const after = prevOrder.slice(idx + 1).find(c => isOpen(c) && c.id !== sel);
  sel = (after || nextOpen || {}).id || null;
}
function act(kind) {
  if (!sel) return; const c = byId[sel]; const before = order();
  let undo;
  const note = ($('#ed-note') || {}).value;
  if (kind === 'approve') undo = setStatus(c, 'approved', 'approved', { note });
  else if (kind === 'reject') undo = setStatus(c, 'rejected', 'rejected', { note });
  else if (kind === 'keep') undo = setStatus(c, 'kept', 'kept');
  else if (kind === 'revert') undo = setStatus(c, 'reverted', 'reverted');
  else if (kind === 'agree') undo = setStatus(c, 'agreed', 'agreed');
  else if (kind === 'flag') undo = setStatus(c, 'flagged', 'sent back for review');
  else if (kind === 'reopen') { undo = setStatus(c, defaultStatus(c) === 'ai-closed' ? 'flagged' : defaultStatus(c), 'reopened'); }
  else if (kind === 'edit') { editing = true; renderDetail(); const f = $('[data-ed]'); if (f) f.focus(); return; }
  else if (kind === 'next') { advanceKeep(before, 1); return; }
  if (kind !== 'reopen') { editing = false; advance(before); }
  refresh();
  toast(`${kind === 'approve' ? 'Approved and applied' : kind === 'reject' ? 'Rejected' : kind === 'keep' ? 'Kept' : kind === 'revert' ? 'Reverted' : kind === 'agree' ? 'Agreed' : kind === 'flag' ? 'Sent back for review' : 'Reopened'} · logged to audit`, undo);
}
function advanceKeep(ord, d) {
  if (!ord.length) return; const i = ord.findIndex(c => c.id === sel);
  sel = ord[Math.max(0, Math.min(ord.length - 1, (i < 0 ? (d > 0 ? 0 : ord.length - 1) : i + d)))].id; editing = false; refresh();
  const it = $(`.qi[data-id="${sel}"]`); if (it) it.scrollIntoView({ block: 'nearest' });
}
function bulk(kind) {
  const list = cases.filter(c => section(c) === (kind === 'keep' ? 'auto' : 'none'));
  if (!list.length) return;
  if (!confirm(`${kind === 'keep' ? 'Keep' : 'Agree with'} all ${list.length}? Each is recorded separately in the audit log.`)) return;
  const snap = JSON.stringify(S.status), n = AUDIT.length;
  list.forEach(c => { S.status[c.id] = kind === 'keep' ? 'kept' : 'agreed'; audit(c, (kind === 'keep' ? 'kept' : 'agreed') + ' (bulk)'); });
  save(); refresh();
  toast(`${list.length} cases ${kind === 'keep' ? 'kept' : 'agreed'}`, () => { S.status = JSON.parse(snap); AUDIT.splice(0, AUDIT.length - n); store.set('acadza.audit.v3', AUDIT); save(); refresh(); });
}

/* ------------------------------------------------------------------ drawers */
function drawer(html) { const d = $('#drawer'); d.innerHTML = html; d.hidden = false; $('#close-drawer', d).onclick = () => { d.hidden = true; }; }
function showAudit() {
  if (!$('#drawer').hidden && $('#drawer').dataset.k === 'audit') { $('#drawer').hidden = true; return; }
  const rows = AUDIT.map(a => `<div class="aud"><div class="t">${esc(new Date(a.ts).toLocaleString())} · ${esc(a.reviewer)}</div><b>${esc(a.action)}</b> — ${esc((byId[a.questionId] ? headline(byId[a.questionId]).t : a.questionId))}${a.note ? `<div style="color:var(--muted)">“${esc(a.note)}”</div>` : ''}
    <div style="margin-top:3px"><code>${esc(a.repair || a.verdict)}</code> <code>${esc(a.route)}</code> <code>${a.reportIds.join(', ')}</code></div></div>`).join('') || `<div class="aud" style="color:var(--muted)">No actions yet. Every approve, edit, reject, keep or revert is recorded here with who, when and what changed.</div>`;
  drawer(`<header><h3>Audit log</h3><button class="ghost" id="exp-json">Export JSON</button><button class="ghost" id="exp-csv">CSV</button><button class="ghost" id="close-drawer">✕</button></header>${rows}`);
  $('#drawer').dataset.k = 'audit';
  $('#exp-json').onclick = () => dl('audit.json', JSON.stringify(AUDIT, null, 2), 'application/json');
  $('#exp-csv').onclick = () => dl('audit.csv', 'ts,reviewer,questionId,action,repair,route,reports\n' + AUDIT.map(a => [a.ts, a.reviewer, a.questionId, a.action, a.repair || a.verdict, a.route, a.reportIds.join('|')].map(x => `"${String(x).replace(/"/g, '""')}"`).join(',')).join('\n'), 'text/csv');
}
function dl(name, text, type) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 500); }
function showSweep() {
  if (!$('#drawer').hidden && $('#drawer').dataset.k === 'sweep') { $('#drawer').hidden = true; return; }
  const sevCls = { high: 'red', medium: 'amber', low: '' };
  const ticketed = new Set(AUDIT.filter(a => a.action === 'ticketed').map(a => a.questionId + a.text));
  drawer(`<header><h3>Defects nobody reported</h3><button class="ghost" id="close-drawer">✕</button></header>
    <div class="aud" style="color:var(--muted)">Found by sweeping every question the same way the engine checks reported ones. None of these has a student report yet.</div>` +
    D.findings.map((f, i) => `<div class="aud"><span class="chip ${sevCls[f.severity] || ''}">${esc(f.severity)}</span> <span class="chip">${esc(f.kind)}</span> <b>${esc(f.subject)} · ${esc(f.chapter)}</b>
      <div style="margin:4px 0">${esc(f.text)}</div><button class="ghost" data-ticket="${i}">${ticketed.has(f.questionId + f.text) ? '✓ Ticket created' : 'Create fix ticket'}</button></div>`).join(''));
  $('#drawer').dataset.k = 'sweep';
}
function showHelp() {
  drawer(`<header><h3>Keyboard</h3><button class="ghost" id="close-drawer">✕</button></header><div class="aud"><code>J</code> / <code>K</code> next / previous case<br><code>A</code> approve · keep · agree (the primary action)<br><code>R</code> reject · revert · send back<br><code>E</code> edit the proposed change<br><code>Esc</code> close panels<br><br><b>Where the data comes from.</b> The console loads <code>results</code> precomputed by the engine (see README). Your actions and the audit log are kept in this browser's local storage and can be exported.</div>`);
  $('#drawer').dataset.k = 'help';
}
function whyOrder() {
  drawer(`<header><h3>Why this order</h3><button class="ghost" id="close-drawer">✕</button></header><div class="aud"><p><b>Urgency = harm × reach.</b></p>
    <p><b>Harm</b>: a wrong answer key or a question with no valid answer scores highest, because every attempt is marked wrong (or teaches the wrong thing) silently. Missing data/options next, then solution errors, then cosmetic issues (spelling, tags) last.</p>
    <p><b>Reach</b>: each extra student report adds ~35% (more students have already hit it).</p>
    <p><b>Needs-a-human</b> items get a +20 bump over things the AI already applied, because only you can unblock them.</p>
    <p>The bar on each row: red = fix soon, amber = soon, grey = cosmetic, green = no defect.</p></div>`);
}

/* ------------------------------------------------------------------ stats / refresh */
function renderStats() {
  const open = cases.filter(isOpen), needs = cases.filter(c => section(c) === 'needs').length;
  const done = cases.length - open.length;
  const reportsFixed = cases.filter(c => isLive(c)).reduce((a, c) => a + c.n, 0);
  $('#stats').innerHTML = `<span><b>${needs}</b> need you</span><span class="hide-sm"><b>${cases.filter(c => section(c) === 'auto').length}</b> auto-fixed to glance at</span><span class="hide-sm"><b>${reportsFixed}</b> reports resolved live</span><div class="meter" title="${done} of ${cases.length} cases cleared"><i style="width:${Math.round(100 * done / cases.length)}%"></i></div><span>${done}/${cases.length} cleared</span>`;
  $('#audit-n').textContent = AUDIT.length; $('#sweep-n').textContent = D.findings.length;
}
function refresh() { renderQueue(); renderDetail(); renderStats(); }

/* ------------------------------------------------------------------ events */
document.addEventListener('click', e => {
  const t = e.target;
  const qi = t.closest('.qi'); if (qi) { sel = qi.dataset.id; editing = false; refresh(); $('#detail').scrollTop = 0; return; }
  const col = t.closest('[data-col]'); if (col) { S.collapsed[col.dataset.col] = !S.collapsed[col.dataset.col]; save(); renderQueue(); return; }
  const bk = t.closest('[data-bulk]'); if (bk) { bulk(bk.dataset.bulk); return; }
  const a = t.closest('[data-act]'); if (a) { act(a.dataset.act); return; }
  if (t.id === 'back') { sel = null; refresh(); return; }
  if (t.id === 'ed-cancel') { editing = false; renderDetail(); return; }
  if (t.id === 'ed-save') {
    const c = byId[sel]; const o = S.edits[c.id] || {};
    document.querySelectorAll('[data-ed]').forEach(f => {
      const i = +f.dataset.ed; const orig = c.edits[i]; let v = f.value;
      if (orig.field === 'answer' && Array.isArray(orig.replace)) { try { v = JSON.parse(v); } catch (er) { v = v.split(/[,\s]+/).filter(Boolean); } }
      if (JSON.stringify(v) !== JSON.stringify(orig.replace)) o[i] = v;
    });
    S.edits[c.id] = o; save();
    const before = order(); const note = ($('#ed-note') || {}).value;
    const undo = setStatus(c, 'approved_edited', 'edited and approved', { note, edited: o });
    editing = false; advance(before); refresh(); toast('Edited, approved and applied · logged to audit', undo); return;
  }
  const er = t.closest('[data-editreply]'); if (er) { const el = $('#re-' + er.dataset.editreply); el.hidden = !el.hidden; return; }
  const tk = t.closest('[data-ticket]'); if (tk) { const f = D.findings[+tk.dataset.ticket]; AUDIT.unshift({ ts: new Date().toISOString(), reviewer: S.reviewer || 'Faculty', questionId: f.questionId, action: 'ticketed', text: f.text, verdict: 'defect', repair: f.kind, route: 'faculty_review', reportIds: [] }); store.set('acadza.audit.v3', AUDIT); tk.textContent = '✓ Ticket created'; renderStats(); return; }
  if (t.id === 'why-order') { whyOrder(); return; }
});
document.addEventListener('input', e => {
  const t = e.target;
  if (t.dataset && t.dataset.reply) { S.replies[t.dataset.reply] = t.value; save(); const b = $('#b-' + t.dataset.reply); if (b) b.textContent = t.value; }
  if (t.id === 'reviewer') { S.reviewer = t.value; save(); }
});
document.addEventListener('keydown', e => {
  if (/input|textarea/i.test(e.target.tagName)) { if (e.key === 'Escape') e.target.blur(); return; }
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const k = e.key.toLowerCase();
  if (e.target.closest('.qi') && (k === 'enter' || k === ' ')) { e.preventDefault(); e.target.click(); return; }
  if ('jkaer?'.includes(k) && k.length === 1) e.preventDefault();   // never let a shortcut keystroke leak into a field it focuses
  if (k === 'j') advanceKeep(order(), 1);
  else if (k === 'k') advanceKeep(order(), -1);
  else if (k === 'a' && sel) { const c = byId[sel], s = section(c); act(s === 'needs' ? 'approve' : s === 'auto' ? 'keep' : s === 'none' ? 'agree' : 'reopen'); }
  else if (k === 'r' && sel) { const c = byId[sel], s = section(c); act(s === 'needs' ? 'reject' : s === 'auto' ? 'revert' : s === 'none' ? 'flag' : 'reopen'); }
  else if (k === 'e' && sel && section(byId[sel]) === 'needs') act('edit');
  else if (k === '?') showHelp();
  else if (k === 'escape') { $('#drawer').hidden = true; if (editing) { editing = false; renderDetail(); } }
});
$('#btn-audit').onclick = showAudit; $('#btn-sweep').onclick = showSweep; $('#btn-help').onclick = showHelp;
$('#btn-theme').onclick = () => { const cur = document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'); const n = cur === 'dark' ? 'light' : 'dark'; document.documentElement.dataset.theme = n; S.theme = n; save(); };
if (S.theme) document.documentElement.dataset.theme = S.theme;
$('#reviewer').value = S.reviewer || '';

// open the most urgent case that needs a human
const first = order().find(isOpen); if (first && matchMedia('(min-width:901px)').matches) sel = first.id;
refresh();
})();
