import { esc, store } from './api.js';

const SCALE = { 1: 'Not at all confident', 2: 'Slightly confident', 3: 'Moderately confident', 4: 'Very confident', 5: 'Extremely confident' };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const $ = (s, el = document) => el.querySelector(s);

/**
 * One page of direct, numbered questions (no section titles), with 1–5 circles for confidence questions.
 * mountSurvey(container, { survey, identity: 'entry' | 'exit' | null, draftKey, submitLabel, onSubmit })
 * Entry asks for name + email; Exit asks for email only.
 */
export function mountSurvey(container, opts) {
  const { survey } = opts;
  // Scored questions in competency order, then the rest. No section titles.
  const ordered = [
    ...survey.competencies.flatMap(c => survey.questions.filter(q => q.competencyId === c.id)),
    ...survey.questions.filter(q => !q.competencyId || !survey.competencies.some(c => c.id === q.competencyId)),
  ];
  const hasScale = ordered.some(q => q.type === 'scale');
  let saved = null; try { saved = opts.draftKey ? JSON.parse(store.get(opts.draftKey)) : null; } catch {}
  const st = { answers: saved?.answers || {}, identity: saved?.identity || { name: '', email: '' }, errors: {}, busy: false };
  const persist = () => { if (opts.draftKey) store.set(opts.draftKey, JSON.stringify({ answers: st.answers, identity: st.identity })); };
  const isAnswered = q => { const v = st.answers[q.id]; return !(v == null || (typeof v === 'string' && !v.trim()) || (Array.isArray(v) && !v.length)); };

  container.innerHTML = `
    <div class="progress" aria-live="polite">
      <div class="progress-meta"><span id="pcount"></span></div>
      <div class="progress-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-label="Survey progress"><div class="progress-fill"></div></div>
    </div>
    <form class="panel" novalidate>
      <div class="alert hidden" id="form-err" role="alert"></div>
      ${opts.identity === 'entry' ? `
        <div class="field" data-wrap="name"><label for="f-name">Your full name</label>
          <input id="f-name" type="text" autocomplete="name" value="${esc(st.identity.name)}" data-identity="name"></div>` : ''}
      ${opts.identity ? `
        <div class="field" data-wrap="email"><label for="f-email">Email address</label>
          <span class="hint">${opts.identity === 'entry' ? 'Use the email you registered for the fellowship with. You’ll use it again for the Exit Survey.' : 'Use the same email you entered in your Entry Survey.'}</span>
          <input id="f-email" type="email" autocomplete="email" inputmode="email" value="${esc(st.identity.email)}" data-identity="email"></div>` : ''}
      ${hasScale ? `<p class="scale-key"><strong>Rate your confidence from 1 to 5:</strong> 1 Not at all confident, 2 Slightly confident, 3 Moderately confident, 4 Very confident, 5 Extremely confident.</p>` : ''}
      ${ordered.map((q, i) => questionHTML(q, i + 1)).join('')}
      <div class="survey-nav"><button type="submit" class="btn btn-accent" id="submit">${esc(opts.submitLabel)}</button></div>
    </form>`;

  function questionHTML(q, n) {
    const val = st.answers[q.id], id = 'q-' + q.id;
    const label = `<span class="q-text" id="${id}-label"><span class="q-num">${n}.</span> ${esc(q.text)} ${q.required ? '' : '<span class="q-opt">(optional)</span>'}</span>${q.help ? `<div class="q-help">${esc(q.help)}</div>` : ''}`;
    let input = '';
    if (q.type === 'scale') input = `
      <div class="dots" role="radiogroup" aria-labelledby="${id}-label">
        ${[1, 2, 3, 4, 5].map(v => `<label class="dot-opt" title="${SCALE[v]}"><input type="radio" name="${id}" data-q="${q.id}" value="${v}" ${val === v ? 'checked' : ''} aria-label="${v} – ${SCALE[v]}"><span class="dot-c" aria-hidden="true"></span><span class="dot-n" aria-hidden="true">${v}</span></label>`).join('')}
      </div>
      <div class="dots-ends" aria-hidden="true"><span>Not at all confident</span><span>Extremely confident</span></div>`;
    else if (q.type === 'short') input = `<input type="text" maxlength="300" aria-labelledby="${id}-label" data-q="${q.id}" value="${esc(val || '')}">`;
    else if (q.type === 'long') input = `<textarea maxlength="5000" aria-labelledby="${id}-label" data-q="${q.id}">${esc(val || '')}</textarea>`;
    else if (q.type === 'choice') {
      const vals = q.multiple ? (Array.isArray(val) ? val : []) : [val];
      input = `<div class="choice-list" role="${q.multiple ? 'group' : 'radiogroup'}" aria-labelledby="${id}-label">${q.options.map(o => `
        <label class="choice"><input type="${q.multiple ? 'checkbox' : 'radio'}" name="${id}" data-q="${q.id}" value="${esc(o)}" ${vals.includes(o) ? 'checked' : ''}><span>${esc(o)}</span></label>`).join('')}</div>`;
    }
    return `<div class="question" data-wrap="${q.id}">${label}${input}</div>`;
  }

  const form = $('form', container);
  function progress() {
    const done = ordered.filter(isAnswered).length, pct = ordered.length ? Math.round(done / ordered.length * 100) : 0;
    $('#pcount', container).innerHTML = `<strong>${done}</strong> of ${ordered.length} questions answered`;
    $('.progress-fill', container).style.width = Math.max(pct, 2) + '%';
    $('.progress-track', container).setAttribute('aria-valuenow', pct);
  }
  function setError(key, msg) {
    const w = form.querySelector(`[data-wrap="${key}"]`); if (!w) return;
    w.classList.toggle('has-error', !!msg);
    w.querySelector(':scope > .field-error')?.remove();
    if (msg) w.insertAdjacentHTML('beforeend', `<div class="field-error">${esc(msg)}</div>`);
  }
  function clearFormErr() { if (!Object.keys(st.errors).length) $('#form-err', form).classList.add('hidden'); }
  function showErrors(errors, message) {
    st.errors = errors;
    form.querySelectorAll('[data-wrap]').forEach(w => setError(w.dataset.wrap, errors[w.dataset.wrap]));
    const fe = $('#form-err', form);
    fe.textContent = message || ''; fe.classList.toggle('hidden', !message);
    const firstErr = form.querySelector('.has-error') || (message ? fe : null);
    firstErr?.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    firstErr?.querySelector('input, textarea')?.focus({ preventScroll: true });
  }

  form.querySelectorAll('[data-identity]').forEach(i => i.addEventListener('input', () => { st.identity[i.dataset.identity] = i.value; persist(); if (st.errors[i.dataset.identity]) { delete st.errors[i.dataset.identity]; setError(i.dataset.identity, ''); clearFormErr(); } }));
  form.querySelectorAll('input[data-q], textarea[data-q]').forEach(i => {
    i.addEventListener(i.type === 'checkbox' || i.type === 'radio' ? 'change' : 'input', () => {
      const qid = i.dataset.q;
      if (i.type === 'checkbox') st.answers[qid] = [...form.querySelectorAll(`input[data-q="${qid}"]:checked`)].map(x => x.value);
      else if (i.type === 'radio' && i.closest('.dots')) st.answers[qid] = Number(i.value);
      else st.answers[qid] = i.value;
      persist(); progress();
      if (st.errors[qid]) { delete st.errors[qid]; setError(qid, ''); clearFormErr(); }
    });
  });

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const errors = {};
    if (opts.identity) {
      if (opts.identity === 'entry' && !st.identity.name.trim()) errors.name = 'Enter your name.';
      if (!EMAIL_RE.test(st.identity.email.trim())) errors.email = 'Enter a valid email address.';
    }
    for (const q of ordered) if (q.required && !isAnswered(q)) errors[q.id] = q.type === 'scale' ? 'Choose a number from 1 to 5.' : 'This question is required.';
    if (Object.keys(errors).length) return showErrors(errors, `Answer the ${Object.keys(errors).length === 1 ? 'highlighted question' : `${Object.keys(errors).length} highlighted questions`} to submit.`);
    const btn = $('#submit', form); btn.disabled = true; btn.textContent = 'Saving…';
    try {
      await opts.onSubmit({ ...st.answers }, { name: st.identity.name.trim(), email: st.identity.email.trim() });
      if (opts.draftKey) store.del(opts.draftKey);
    } catch (err) {
      btn.disabled = false; btn.textContent = opts.submitLabel;
      showErrors({ ...(err?.body?.questionErrors || {}), ...(err?.body?.fieldErrors || {}), ...(err?.errors || {}) }, err?.message || 'Something went wrong.');
    }
  });
  progress();
}

