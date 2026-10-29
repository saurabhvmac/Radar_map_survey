import { api, esc, toast } from './api.js';
import { mountSurvey } from './survey-form.js';
import { renderResults } from './results-view.js';

const root = document.getElementById('admin');
const tabs = document.getElementById('tabs');
const dlg = document.getElementById('dlg');
const TOKEN_KEY = 'yby.adminToken';
const TYPE_LABEL = { scale: 'Confidence Scale (1–5)', short: 'Short text', long: 'Long text', choice: 'Multiple choice' };
const SURVEY_LABEL = { both: 'Entry and Exit', entry: 'Entry only', exit: 'Exit only' };

let token = sessionStorage.getItem(TOKEN_KEY);
let draft = null;
let current = 'builder';

const call = (path, opts = {}) => api('/admin' + path, { ...opts, token }).catch(err => {
  if (err.status === 401) { signOut('Your session has ended. Sign in again.'); }
  throw err;
});

function signOut(msg) {
  token = null; sessionStorage.removeItem(TOKEN_KEY);
  tabs.classList.add('hidden');
  showLogin(msg);
}
document.getElementById('signout').addEventListener('click', () => signOut());

tabs.addEventListener('click', e => {
  const t = e.target.closest('[data-tab]'); if (!t) return;
  show(t.dataset.tab);
});

function show(tab) {
  current = tab;
  tabs.querySelectorAll('[data-tab]').forEach(b => b.setAttribute('aria-selected', b.dataset.tab === tab));
  ({ builder: showBuilder, results: showResults, settings: showSettings })[tab]();
}

/* ---------------- Login ---------------- */

function showLogin(error = '') {
  root.innerHTML = `
    <div class="wrap" style="padding-top:2rem">
      <form class="panel" id="login" style="max-width:420px;margin:0 auto">
        <h1 style="font-size:1.8rem">Admin sign in</h1>
        ${error ? `<div class="alert" role="alert">${esc(error)}</div>` : ''}
        <div class="field"><label for="pw">Password</label><input id="pw" type="password" autocomplete="current-password" required></div>
        <button class="btn" style="width:100%">Sign in</button>
      </form>
    </div>`;
  root.querySelector('#pw').focus();
  root.querySelector('#login').addEventListener('submit', async e => {
    e.preventDefault();
    try {
      const r = await api('/admin/login', { method: 'POST', body: { password: root.querySelector('#pw').value } });
      token = r.token; sessionStorage.setItem(TOKEN_KEY, token);
      tabs.classList.remove('hidden');
      show('builder');
    } catch (err) { showLogin(err.message); }
  });
}

/* ---------------- Builder ---------------- */

async function showBuilder() {
  try { draft = await call('/survey'); } catch (err) { return fail(err); }
  renderBuilder();
}

function renderBuilder() {
  const { competencies, questions, published, unpublishedChanges } = draft;
  const loose = questions.filter(q => !q.competencyId);
  root.innerHTML = `
    <div class="toolbar">
      <div>
        <h1>Survey builder</h1>
        <span class="status"><i class="dot ${unpublishedChanges ? 'warn' : ''}"></i>
          ${unpublishedChanges ? 'You have unpublished changes. Students still see the last published version.' :
            `Published ${published ? new Date(published.publishedAt + 'Z').toLocaleString() : ''}. Students see this version.`}</span>
      </div>
      <div class="actions">
        <button class="btn btn-ghost btn-sm" data-act="preview" data-kind="entry">Preview Entry</button>
        <button class="btn btn-ghost btn-sm" data-act="preview" data-kind="exit">Preview Exit</button>
        <button class="btn btn-accent btn-sm" data-act="publish" ${unpublishedChanges ? '' : 'disabled'}>Publish changes</button>
      </div>
    </div>
    <p class="muted small" style="max-width:75ch">Students see questions as one numbered list, in the order below, without section titles. Confidence Scale questions build the radar chart and always appear in both surveys, so Entry and Exit scores can be compared. Other question types are collected as extra information and can be set to Entry, Exit or both.</p>

    ${competencies.map((c, i) => compHTML(c, i, competencies.length, questions.filter(q => q.competencyId === c.id))).join('')}

    <section class="comp loose">
      <div class="comp-head"><div><h3>Additional questions</h3><p>Not tied to a competency and not scored. Shown on the last page of the survey.</p></div></div>
      ${loose.length ? loose.map((q, i) => qHTML(q, i, loose.length)).join('') : '<div class="empty">No additional questions yet.</div>'}
      <div class="comp-foot"><button class="btn btn-ghost btn-sm" data-act="add-q" data-comp="">Add question</button></div>
    </section>

    <button class="btn" data-act="add-comp">Add competency</button>`;
}

function compHTML(c, i, n, qs) {
  const scored = qs.filter(q => q.type === 'scale').length;
  return `
    <section class="comp" data-comp="${c.id}">
      <div class="comp-head">
        <div><h3>${esc(c.name)}</h3><p>${esc(c.description || '')}${c.description ? '. ' : ''}${scored} scored question${scored === 1 ? '' : 's'}${scored ? '' : ' – won’t appear on the chart'}</p></div>
        <div class="row-actions">
          <button class="icon-btn" data-act="comp-up" data-id="${c.id}" ${i === 0 ? 'disabled' : ''} aria-label="Move ${esc(c.name)} up">↑</button>
          <button class="icon-btn" data-act="comp-down" data-id="${c.id}" ${i === n - 1 ? 'disabled' : ''} aria-label="Move ${esc(c.name)} down">↓</button>
          <button class="icon-btn" data-act="edit-comp" data-id="${c.id}">Rename</button>
          <button class="icon-btn danger" data-act="del-comp" data-id="${c.id}">Delete</button>
        </div>
      </div>
      ${qs.length ? qs.map((q, j) => qHTML(q, j, qs.length)).join('') : '<div class="empty">No questions yet. Add a Confidence Scale question so this competency appears on the chart.</div>'}
      <div class="comp-foot"><button class="btn btn-ghost btn-sm" data-act="add-q" data-comp="${c.id}">Add question</button></div>
    </section>`;
}

function qHTML(q, i, n) {
  return `
    <div class="q-row">
      <div>
        <div class="t">${esc(q.text)}</div>
        <div class="badges">
          <span class="badge ${q.type === 'scale' ? 'scale' : ''}">${TYPE_LABEL[q.type]}${q.type === 'choice' ? (q.multiple ? ', multi-select' : ', single') : ''}</span>
          <span class="badge ${q.survey === 'both' ? '' : q.survey}">${SURVEY_LABEL[q.survey]}</span>
          <span class="badge">${q.required ? 'Required' : 'Optional'}</span>
        </div>
      </div>
      <div class="row-actions">
        <button class="icon-btn" data-act="q-up" data-id="${q.id}" ${i === 0 ? 'disabled' : ''} aria-label="Move question up">↑</button>
        <button class="icon-btn" data-act="q-down" data-id="${q.id}" ${i === n - 1 ? 'disabled' : ''} aria-label="Move question down">↓</button>
        <button class="icon-btn" data-act="edit-q" data-id="${q.id}">Edit</button>
        <button class="icon-btn danger" data-act="del-q" data-id="${q.id}">Delete</button>
      </div>
    </div>`;
}

root.addEventListener('click', async e => {
  const b = e.target.closest('[data-act]'); if (!b || current !== 'builder') return;
  const id = Number(b.dataset.id);
  const act = b.dataset.act;
  try {
    if (act === 'add-comp') return compDialog();
    if (act === 'edit-comp') return compDialog(draft.competencies.find(c => c.id === id));
    if (act === 'del-comp') {
      const c = draft.competencies.find(x => x.id === id);
      const n = draft.questions.filter(q => q.competencyId === id).length;
      if (!confirm(`Delete “${c.name}”${n ? ` and its ${n} question${n === 1 ? '' : 's'}` : ''}? Saved student results are not affected.`)) return;
      return update(await call(`/competencies/${id}`, { method: 'DELETE' }), 'Competency deleted');
    }
    if (act === 'comp-up' || act === 'comp-down') {
      const ids = draft.competencies.map(c => c.id);
      move(ids, ids.indexOf(id), act === 'comp-up' ? -1 : 1);
      return update(await call('/competencies-order', { method: 'PUT', body: { ids } }));
    }
    if (act === 'add-q') return questionDialog(null, b.dataset.comp ? Number(b.dataset.comp) : null);
    if (act === 'edit-q') return questionDialog(draft.questions.find(q => q.id === id));
    if (act === 'del-q') {
      if (!confirm('Delete this question? Saved student answers are kept.')) return;
      return update(await call(`/questions/${id}`, { method: 'DELETE' }), 'Question deleted');
    }
    if (act === 'q-up' || act === 'q-down') {
      const q = draft.questions.find(x => x.id === id);
      const group = draft.questions.filter(x => (x.competencyId || null) === (q.competencyId || null)).map(x => x.id);
      const gi = group.indexOf(id), target = group[gi + (act === 'q-up' ? -1 : 1)];
      const ids = draft.questions.map(x => x.id);
      const a = ids.indexOf(id), t = ids.indexOf(target);
      [ids[a], ids[t]] = [ids[t], ids[a]];
      return update(await call('/questions-order', { method: 'PUT', body: { ids } }));
    }
    if (act === 'publish') {
      if (!confirm('Publish these changes? New survey takers will see them straight away.')) return;
      const r = await call('/publish', { method: 'POST' });
      update(r, 'Survey published');
      r.warnings?.forEach(w => toast(w));
      return;
    }
    if (act === 'preview') return previewDialog(b.dataset.kind);
  } catch (err) { toast(err.message, 'error'); }
});

const move = (arr, i, d) => { const j = i + d; if (j < 0 || j >= arr.length) return; [arr[i], arr[j]] = [arr[j], arr[i]]; };
function update(next, msg) { draft = next; renderBuilder(); if (msg) toast(msg); }

/* ---- Dialogs ---- */

function openDialog(html, { wide = false } = {}) {
  dlg.className = wide ? 'wide' : '';
  dlg.innerHTML = html;
  dlg.showModal();
  dlg.querySelector('[data-close]')?.addEventListener('click', () => dlg.close());
  return dlg;
}

function compDialog(c) {
  openDialog(`
    <form method="dialog" id="cf">
      <div class="dlg-head"><h2>${c ? 'Edit competency' : 'Add competency'}</h2><button type="button" class="icon-btn" data-close aria-label="Close">✕</button></div>
      <div class="dlg-body">
        <div class="alert hidden" id="cf-err" role="alert"></div>
        <div class="field"><label for="c-name">Name</label><input id="c-name" type="text" maxlength="80" value="${esc(c?.name || '')}" required></div>
        <div class="field"><label for="c-desc">Short description</label><span class="hint">Shown to students under the section title.</span>
          <input id="c-desc" type="text" maxlength="240" value="${esc(c?.description || '')}"></div>
      </div>
      <div class="dlg-foot"><button type="button" class="btn btn-ghost" data-close>Cancel</button><button class="btn">${c ? 'Save changes' : 'Add competency'}</button></div>
    </form>`);
  dlg.querySelectorAll('[data-close]').forEach(x => x.addEventListener('click', () => dlg.close()));
  dlg.querySelector('#cf').addEventListener('submit', async e => {
    e.preventDefault();
    const body = { name: dlg.querySelector('#c-name').value, description: dlg.querySelector('#c-desc').value };
    try {
      const r = await call(c ? `/competencies/${c.id}` : '/competencies', { method: c ? 'PUT' : 'POST', body });
      dlg.close(); update(r, c ? 'Competency saved' : 'Competency added');
    } catch (err) { const el = dlg.querySelector('#cf-err'); el.textContent = err.message; el.classList.remove('hidden'); }
  });
}

function questionDialog(q, compId = null) {
  const v = q || { type: compId ? 'scale' : 'short', competencyId: compId, survey: 'both', text: '', help: '', required: true, multiple: false, options: [] };
  openDialog(`
    <form id="qf">
      <div class="dlg-head"><h2>${q ? 'Edit question' : 'Add question'}</h2><button type="button" class="icon-btn" data-close aria-label="Close">✕</button></div>
      <div class="dlg-body">
        <div class="alert hidden" id="qf-err" role="alert"></div>
        <div class="field"><label for="q-text">Question</label><textarea id="q-text" maxlength="400" style="min-height:80px" required>${esc(v.text)}</textarea></div>
        <div class="field"><label for="q-help">Help text <span class="q-opt">(optional)</span></label><input id="q-help" type="text" maxlength="300" value="${esc(v.help)}"></div>
        <div class="two">
          <div class="field"><label for="q-type">Question type</label>
            <select id="q-type">${Object.entries(TYPE_LABEL).map(([k, l]) => `<option value="${k}" ${v.type === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
          <div class="field"><label for="q-comp">Competency</label>
            <select id="q-comp"><option value="">None (additional question)</option>
              ${draft.competencies.map(c => `<option value="${c.id}" ${v.competencyId === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div>
        </div>
        <div class="field"><label for="q-survey">Show in</label>
          <select id="q-survey">${Object.entries(SURVEY_LABEL).map(([k, l]) => `<option value="${k}" ${v.survey === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
          <span class="hint" id="q-survey-hint"></span></div>
        <div class="field" id="opts-wrap"><label for="q-opts">Options</label><span class="hint">One option per line.</span>
          <textarea id="q-opts" style="min-height:120px">${esc(v.options.join('\n'))}</textarea>
          <label class="check"><input type="checkbox" id="q-multi" ${v.multiple ? 'checked' : ''}> Allow more than one answer</label></div>
        <label class="check"><input type="checkbox" id="q-req" ${v.required ? 'checked' : ''}> Required</label>
      </div>
      <div class="dlg-foot"><button type="button" class="btn btn-ghost" data-close>Cancel</button><button class="btn">${q ? 'Save changes' : 'Add question'}</button></div>
    </form>`);
  dlg.querySelectorAll('[data-close]').forEach(x => x.addEventListener('click', () => dlg.close()));
  const typeSel = dlg.querySelector('#q-type'), surveySel = dlg.querySelector('#q-survey');
  const sync = () => {
    const t = typeSel.value;
    dlg.querySelector('#opts-wrap').classList.toggle('hidden', t !== 'choice');
    surveySel.disabled = t === 'scale';
    if (t === 'scale') surveySel.value = 'both';
    dlg.querySelector('#q-survey-hint').textContent = t === 'scale' ? 'Scored questions always appear in both surveys so Entry and Exit can be compared.' : '';
  };
  typeSel.addEventListener('change', sync); sync();
  dlg.querySelector('#qf').addEventListener('submit', async e => {
    e.preventDefault();
    const body = {
      text: dlg.querySelector('#q-text').value, help: dlg.querySelector('#q-help').value,
      type: typeSel.value, competencyId: dlg.querySelector('#q-comp').value || null, survey: surveySel.value,
      required: dlg.querySelector('#q-req').checked, multiple: dlg.querySelector('#q-multi').checked,
      options: dlg.querySelector('#q-opts').value.split('\n'),
    };
    try {
      const r = await call(q ? `/questions/${q.id}` : '/questions', { method: q ? 'PUT' : 'POST', body });
      dlg.close(); update(r, q ? 'Question saved' : 'Question added');
    } catch (err) { const el = dlg.querySelector('#qf-err'); el.textContent = err.message; el.classList.remove('hidden'); }
  });
}

function previewDialog(kind) {
  const questions = draft.questions.filter(q => q.type === 'scale' || q.survey === 'both' || q.survey === kind);
  const survey = { versionId: 0, competencies: draft.competencies, questions };
  openDialog(`
    <div class="dlg-head"><h2>Preview: ${kind === 'entry' ? 'Entry' : 'Exit'} Survey</h2><button type="button" class="icon-btn" data-close aria-label="Close preview">✕</button></div>
    <div class="dlg-body tinted"><p class="alert info">This is a preview of your unpublished draft. Nothing you enter is saved.</p><div id="pv"></div></div>`, { wide: true });
  mountSurvey(dlg.querySelector('#pv'), {
    survey, identity: kind,
    submitLabel: 'Finish preview',
    onSubmit: async () => {
      dlg.querySelector('#pv').innerHTML = `<div class="panel"><h2>End of preview</h2><p>Students would now see their results. Nothing was saved.</p>
        <button class="btn" type="button" id="pv-close">Close preview</button></div>`;
      dlg.querySelector('#pv-close').addEventListener('click', () => dlg.close());
    },
  });
}

/* ---------------- Results ---------------- */

let cohortChart;
async function showResults(q = '') {
  let data;
  try { data = await call('/results?q=' + encodeURIComponent(q)); } catch (err) { return fail(err); }
  const { summary, students } = data;
  const f = n => (n == null ? '–' : Number(n).toFixed(1));
  const d = n => (n == null ? '–' : `${n > 0 ? '+' : ''}${Number(n).toFixed(1)}`);
  root.innerHTML = `
    <div class="toolbar"><h1>Results</h1><button class="btn btn-ghost btn-sm" id="csv">Export CSV</button></div>
    <div class="stats">
      <div class="stat"><b>${summary.counts.students}</b><span>Students</span></div>
      <div class="stat"><b>${summary.counts.entry}</b><span>Entry surveys completed</span></div>
      <div class="stat"><b>${summary.counts.exit}</b><span>Exit surveys completed</span></div>
      <div class="stat"><b>${f(summary.overall.entry)}</b><span>Average Entry score</span></div>
      <div class="stat"><b>${f(summary.overall.exit)}</b><span>Average Exit score</span></div>
      <div class="stat"><b class="delta ${summary.overall.change < 0 ? 'neg' : ''}">${d(summary.overall.change)}</b><span>Average growth</span></div>
    </div>
    ${summary.competencies.length ? `
    <div class="panel" style="margin-bottom:1.25rem">
      <div class="report-grid">
        <div><div class="chart-box" style="max-width:440px"><canvas id="cohort" role="img" aria-label="Cohort average radar chart"></canvas></div>
          <div class="legend"><span><i style="background:var(--entry)"></i>Entry average</span><span><i style="background:var(--exit)"></i>Exit average</span></div></div>
        <div><h3>Cohort averages by competency</h3>
          ${summary.competencies.map(c => `<div class="comp-row"><span class="comp-name">${esc(c.name)}</span>
            <span class="comp-vals">${f(c.entry)} → <strong>${f(c.exit)}</strong> <span class="delta ${c.change < 0 ? 'neg' : c.change === 0 ? 'zero' : ''}">${c.change == null ? '' : d(c.change)}</span></span></div>`).join('')}
        </div>
      </div>
    </div>` : ''}
    <form id="search" class="toolbar" role="search">
      <input type="search" id="q" placeholder="Search by name, email or student ID" value="${esc(q)}" style="max-width:420px">
    </form>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Student</th><th>Email</th><th>ID</th><th class="num">Entry</th><th class="num">Exit</th><th class="num">Growth</th><th></th></tr></thead>
        <tbody>
          ${students.length ? students.map(s => `<tr>
            <td><strong>${esc(s.name)}</strong></td><td>${esc(s.email)}</td><td class="muted">${esc(s.id)}</td>
            <td class="num">${s.entry ? f(s.entry.overall) : '<span class="muted">Not started</span>'}</td>
            <td class="num">${s.exit ? f(s.exit.overall) : '<span class="muted">–</span>'}</td>
            <td class="num">${s.change == null ? '–' : `<span class="delta ${s.change < 0 ? 'neg' : ''}">${d(s.change)}</span>`}</td>
            <td><button class="btn btn-ghost btn-sm" data-student="${esc(s.id)}">View</button></td></tr>`).join('')
            : `<tr><td colspan="7" class="muted">${q ? 'No students match that search.' : 'No students have taken the survey yet. Share the survey link to get started.'}</td></tr>`}
        </tbody>
      </table>
    </div>`;

  if (summary.competencies.length && window.Chart) {
    cohortChart?.destroy();
    const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
    cohortChart = new window.Chart(root.querySelector('#cohort'), {
      type: 'radar',
      data: {
        labels: summary.competencies.map(c => c.name),
        datasets: [
          { label: 'Entry', data: summary.competencies.map(c => c.entry), borderColor: css('--entry'), backgroundColor: css('--entry-soft'), pointBackgroundColor: css('--entry'), borderWidth: 2 },
          { label: 'Exit', data: summary.competencies.map(c => c.exit), borderColor: css('--exit'), backgroundColor: css('--exit-soft'), pointBackgroundColor: css('--exit'), borderWidth: 2 },
        ],
      },
      options: { plugins: { legend: { display: false } }, scales: { r: { min: 0, max: 5, ticks: { stepSize: 1, backdropColor: 'transparent' }, pointLabels: { font: { weight: '700' } } } } },
    });
  }

  let t;
  root.querySelector('#q').addEventListener('input', e => { clearTimeout(t); t = setTimeout(() => showResults(e.target.value).then(() => { const i = root.querySelector('#q'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }), 300); });
  root.querySelector('#search').addEventListener('submit', e => e.preventDefault());
  root.querySelector('#csv').addEventListener('click', exportCsv);
  root.querySelectorAll('[data-student]').forEach(b => b.addEventListener('click', () => studentDialog(b.dataset.student)));
}

async function exportCsv() {
  try {
    const res = await fetch('/api/admin/export.csv', { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error('Export failed. Sign in again and retry.');
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement('a'); a.href = url; a.download = 'career-readiness-results.csv'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (err) { toast(err.message, 'error'); }
}

async function studentDialog(id) {
  let r;
  try { r = await call(`/results/${encodeURIComponent(id)}`); } catch (err) { return toast(err.message, 'error'); }
  const fmtAns = a => a == null ? '<span class="muted">No answer</span>' : Array.isArray(a) ? esc(a.join(', ')) : esc(a);
  const answers = (sub, label) => !sub ? '' : `
    <div class="panel"><h3>${label} answers</h3><dl class="answers">
      ${sub.responses.map(x => `<dt>${esc(x.text)} ${x.competency ? `<span class="comp-tag">(${esc(x.competency)})</span>` : ''}</dt>
        <dd>${x.type === 'scale' && x.answer ? `${x.answer} – ${esc(draftScale()[x.answer] || '')}` : fmtAns(x.answer)}</dd>`).join('')}
    </dl></div>`;
  openDialog(`
    <div class="dlg-head"><h2>Student results</h2><button type="button" class="icon-btn" data-close aria-label="Close">✕</button></div>
    <div class="dlg-body tinted">
      <div id="sr"></div>
      <div style="margin-top:1.25rem">${answers(r.entry, 'Entry')}${answers(r.exit, 'Exit')}</div>
    </div>
    <div class="dlg-foot">
      <button class="btn btn-danger" id="del">Delete student</button>
    </div>`, { wide: true });
  if (r.entry) renderResults(dlg.querySelector('#sr'), r, { admin: true });
  else dlg.querySelector('#sr').innerHTML = `<div class="panel"><h2>${esc(r.student.name)}</h2><p class="muted">${esc(r.student.email)}. Hasn’t completed the Entry Survey yet.</p></div>`;

  dlg.querySelector('#del').addEventListener('click', async () => {
    if (!confirm(`Permanently delete ${r.student.name} and all their survey responses? This can’t be undone.`)) return;
    try { await call(`/students/${encodeURIComponent(id)}`, { method: 'DELETE' }); dlg.close(); toast('Student deleted'); showResults(); }
    catch (err) { toast(err.message, 'error'); }
  });
}
const draftScale = () => draft?.scale || { 1: 'Not at all confident', 2: 'Slightly confident', 3: 'Moderately confident', 4: 'Very confident', 5: 'Extremely confident' };

/* ---------------- Settings ---------------- */

async function showSettings() {
  try { draft = await call('/survey'); } catch (err) { return fail(err); }
  const s = draft.settings;
  root.innerHTML = `
    <div class="toolbar"><h1>Settings</h1></div>
    <section class="panel" style="max-width:760px;margin-bottom:1.25rem">
      <h2>Survey links</h2>
      <p class="muted">Public links, no sign-in needed. Share the Entry link at the start of the fellowship and the Exit link a few weeks later.</p>
      ${[['Entry Survey', '/entry'], ['Exit Survey', '/exit'], ['Admin dashboard', '/admin']].map(([l, p]) => `
        <div class="field"><label for="lnk-${p.slice(1)}">${l}</label>
          <div class="link-row"><input id="lnk-${p.slice(1)}" type="text" readonly value="${location.origin}${p}"><button type="button" class="btn btn-ghost btn-sm" data-copy="lnk-${p.slice(1)}">Copy</button></div></div>`).join('')}
    </section>
    <form class="panel" id="sf" style="max-width:760px">
      <h2>Survey settings</h2>
      <div class="field"><label for="s-name">Programme name</label><input id="s-name" type="text" value="${esc(s.programName)}"></div>
      <label class="check" style="margin-bottom:.3rem"><input type="checkbox" id="s-exit" ${s.exitOpen ? 'checked' : ''}> Exit Survey is open</label>
      <p class="hint muted small" style="margin:0 0 1.2rem 1.9rem">When closed, the Exit link shows a message that it isn’t open yet. Open it when you send the Exit link.</p>
      <div class="field"><label for="s-ei">Entry Survey introduction</label><textarea id="s-ei">${esc(s.entryIntro)}</textarea></div>
      <div class="field"><label for="s-xi">Exit Survey introduction</label><textarea id="s-xi">${esc(s.exitIntro)}</textarea></div>
      <button class="btn">Save settings</button>
      <p class="small muted" style="margin:1rem 0 0">Settings apply immediately. They don’t need publishing.</p>
    </form>`;
  root.querySelectorAll('[data-copy]').forEach(b => b.addEventListener('click', async () => {
    const inp = root.querySelector('#' + b.dataset.copy); inp.select();
    try { await navigator.clipboard.writeText(inp.value); toast('Link copied'); } catch { toast('Link selected. Press Ctrl+C (or ⌘C) to copy.'); }
  }));
  root.querySelector('#sf').addEventListener('submit', async e => {
    e.preventDefault();
    try {
      draft = await call('/settings', { method: 'PUT', body: {
        programName: root.querySelector('#s-name').value, exitOpen: root.querySelector('#s-exit').checked,
        entryIntro: root.querySelector('#s-ei').value, exitIntro: root.querySelector('#s-xi').value,
      } });
      toast('Settings saved');
    } catch (err) { toast(err.message, 'error'); }
  });
}

function fail(err) {
  if (err.status !== 401) root.innerHTML = `<div class="alert" role="alert">${esc(err.message)}</div>`;
}

/* ---------------- Boot ---------------- */
if (token) { tabs.classList.remove('hidden'); show('builder'); } else showLogin();
