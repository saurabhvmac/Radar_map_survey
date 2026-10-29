/**
 * The whole REST API as one request handler. It is storage-agnostic: `store` needs
 * get(key, {type:'json'}), setJSON(key, value), delete(key) and list({prefix}) – which is exactly
 * what Netlify Blobs provides. Same endpoints and JSON shapes as the Node/Express version.
 */
import { SCALE_LABELS, questionsFor, validateAnswers, computeScores, compare, round } from './scoring.mjs';
import { sign, verify, safeEqual, studentIdFor } from './auth.mjs';
import { seedSurvey } from './seed.mjs';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const TYPES = ['scale', 'short', 'long', 'choice'];
const SURVEYS = ['both', 'entry', 'exit'];

const json = (status, body) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});
const err = (status, error, extra = {}) => json(status, { error, ...extra });

export async function handle(req, store) {
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/(\.netlify\/functions\/api|api)/, '').replace(/\/+$/, '') || '/';
  const method = req.method;
  let body = {};
  if (method !== 'GET' && method !== 'DELETE') {
    try { body = await req.json(); } catch { return err(400, 'Request body must be valid JSON.'); }
  }

  /* ---------- storage helpers ---------- */
  async function getSurvey() {
    let s = await store.get('survey', { type: 'json' });
    if (!s) { s = seedSurvey(); await store.setJSON('survey', s); }
    return s;
  }
  const saveSurvey = s => store.setJSON('survey', s);
  const getStudent = id => store.get(`students/${id}`, { type: 'json' });
  const saveStudent = st => store.setJSON(`students/${st.id}`, st);
  async function allStudents() {
    const { blobs } = await store.list({ prefix: 'students/' });
    const rows = await Promise.all(blobs.map(b => store.get(b.key, { type: 'json' })));
    return rows.filter(Boolean);
  }
  const bearer = () => verify((req.headers.get('authorization') || '').replace(/^Bearer /, ''));

  const publicStudent = s => ({ id: s.id, name: s.name, email: s.email, createdAt: s.createdAt });
  function results(st, settings, { withAnswers = false } = {}) {
    const strip = sub => sub && (withAnswers ? sub : { versionId: sub.versionId, completedAt: sub.completedAt, scores: sub.scores });
    return {
      student: publicStudent(st),
      status: { entryCompleted: !!st.entry, exitCompleted: !!st.exit, exitOpen: !!settings.exitOpen },
      entry: strip(st.entry) || null,
      exit: strip(st.exit) || null,
      comparison: st.entry ? compare(st.entry.scores, st.exit?.scores) : null,
    };
  }
  function submission(pub, kind, clean) {
    return {
      versionId: pub.versionId, completedAt: new Date().toISOString(), answers: clean, scores: computeScores(pub, clean),
      responses: questionsFor(pub, kind).map(q => ({
        id: q.id, type: q.type, text: q.text,
        competency: pub.competencies.find(c => c.id === q.competencyId)?.name || null, answer: clean[q.id] ?? null,
      })),
    };
  }

  /* ---------- public survey endpoints ---------- */
  if (path === '/health') return json(200, { ok: true });

  if (path === '/surveys' && method === 'GET') {
    const s = await getSurvey();
    const kind = ['entry', 'exit'].includes(url.searchParams.get('kind')) ? url.searchParams.get('kind') : null;
    const pub = s.published;
    if (!pub) return err(404, 'No survey has been published yet.');
    return json(200, { settings: s.settings, scale: SCALE_LABELS, survey: { ...pub, questions: kind ? questionsFor(pub, kind) : pub.questions } });
  }

  if ((path === '/surveys/entry' || path === '/surveys/exit') && method === 'POST') {
    const kind = path.endsWith('entry') ? 'entry' : 'exit';
    const s = await getSurvey();
    const pub = s.published;
    if (!pub) return err(404, 'No survey has been published yet.');
    if (body.versionId !== undefined && Number(body.versionId) !== pub.versionId) {
      return err(409, 'The survey was updated while you were answering. Reload the page; your answers are kept.', { code: 'VERSION_CHANGED' });
    }
    const email = String(body.email || '').trim().toLowerCase().slice(0, 254);
    const name = String(body.name || '').trim().slice(0, 120);
    const fieldErrors = {};
    if (kind === 'entry' && !name) fieldErrors.name = 'Enter your name.';
    if (!EMAIL_RE.test(email)) fieldErrors.email = kind === 'entry' ? 'Enter a valid email address.' : 'Enter the email you used for the Entry Survey.';
    if (Object.keys(fieldErrors).length) return err(422, 'Check the highlighted fields.', { fieldErrors });

    const id = studentIdFor(email);
    const existing = await getStudent(id);
    if (kind === 'entry' && existing?.entry) {
      return err(409, 'This email has already been used for the Entry Survey.', { code: 'ALREADY_SUBMITTED', fieldErrors: { email: 'Already used for an Entry Survey.' } });
    }
    if (kind === 'exit') {
      if (!s.settings.exitOpen) return err(403, 'The Exit Survey isn’t open yet.', { code: 'EXIT_CLOSED' });
      if (!existing?.entry) return err(404, 'We couldn’t find an Entry Survey for that email. Use the same email you entered last time.', { code: 'NO_ENTRY', fieldErrors: { email: 'No Entry Survey found for this email.' } });
      if (existing.exit) return err(409, 'You’ve already completed the Exit Survey.', { code: 'ALREADY_SUBMITTED' });
    }

    const { clean, errors } = validateAnswers(pub, kind, body.answers);
    if (Object.keys(errors).length) return err(422, 'Some answers need attention.', { questionErrors: errors });

    const st = kind === 'entry'
      ? { id, name, email, createdAt: new Date().toISOString(), entry: submission(pub, 'entry', clean) }
      : { ...existing, exit: submission(pub, 'exit', clean) };
    await saveStudent(st);
    return json(201, { token: sign({ sub: id, role: 'student' }, 60 * 60 * 24 * 30), ...results(st, s.settings) });
  }

  if (path === '/students/me/results' && method === 'GET') {
    const t = bearer();
    if (!t || t.role !== 'student') return err(401, 'Not signed in.');
    const st = await getStudent(t.sub);
    if (!st) return err(404, 'Student not found.');
    return json(200, results(st, (await getSurvey()).settings, { withAnswers: true }));
  }

  /* ---------- admin ---------- */
  if (path === '/admin/login' && method === 'POST') {
    const pw = process.env.ADMIN_PASSWORD;
    if (!pw) return err(500, 'ADMIN_PASSWORD is not set on the server. Add it in Netlify → Site configuration → Environment variables.');
    if (!safeEqual(body.password || '', pw)) return err(401, 'Incorrect password.');
    return json(200, { token: sign({ sub: 'admin', role: 'admin' }, 60 * 60 * 8) });
  }

  if (path.startsWith('/admin/')) {
    const t = bearer();
    if (!t || t.role !== 'admin') return err(401, 'Admin sign-in required.');
    const s = await getSurvey();

    const draftPayload = () => {
      const pub = s.published;
      const snap = JSON.stringify({ competencies: s.competencies, questions: s.questions });
      return {
        competencies: s.competencies.map((c, i) => ({ ...c, position: i })),
        questions: s.questions.map((q, i) => ({ ...q, position: i })),
        settings: s.settings, scale: SCALE_LABELS,
        published: pub ? { versionId: pub.versionId, publishedAt: pub.publishedAt } : null,
        unpublishedChanges: !pub || snap !== JSON.stringify({ competencies: pub.competencies, questions: pub.questions }),
      };
    };
    const saveAndReturn = async (status = 200, extra = {}) => { await saveSurvey(s); return json(status, { ...draftPayload(), ...extra }); };
    const reorder = (arr, ids) => {
      if (!Array.isArray(ids)) return null;
      const pos = new Map(ids.map((id, i) => [Number(id), i]));
      return [...arr].sort((a, b) => (pos.get(a.id) ?? 1e9) - (pos.get(b.id) ?? 1e9));
    };
    const m = path.match(/^\/admin\/(competencies|questions|results|students)(?:\/([^/]+))?(?:\/([^/]+))?$/);

    if (path === '/admin/survey' && method === 'GET') return json(200, draftPayload());

    // Competencies
    if (m?.[1] === 'competencies') {
      const id = Number(m[2]);
      if (method === 'DELETE') {
        if (!s.competencies.some(c => c.id === id)) return err(404, 'Competency not found.');
        s.competencies = s.competencies.filter(c => c.id !== id);
        s.questions = s.questions.filter(q => q.competencyId !== id);
        return saveAndReturn();
      }
      const name = String(body.name || '').trim().slice(0, 80);
      if (!name) return err(422, 'Give the competency a name.');
      const description = String(body.description || '').trim().slice(0, 240);
      if (method === 'POST') { s.competencies.push({ id: s.nextId++, name, description }); return saveAndReturn(201); }
      if (method === 'PUT') {
        const c = s.competencies.find(x => x.id === id);
        if (!c) return err(404, 'Competency not found.');
        Object.assign(c, { name, description });
        return saveAndReturn();
      }
    }
    if (path === '/admin/competencies-order' && method === 'PUT') {
      const r = reorder(s.competencies, body.ids); if (!r) return err(422, 'ids must be an array.');
      s.competencies = r; return saveAndReturn();
    }

    // Questions
    if (m?.[1] === 'questions') {
      const id = Number(m[2]);
      if (method === 'DELETE') {
        if (!s.questions.some(q => q.id === id)) return err(404, 'Question not found.');
        s.questions = s.questions.filter(q => q.id !== id);
        return saveAndReturn();
      }
      const type = body.type;
      if (!TYPES.includes(type)) return err(422, 'Choose a question type.');
      const text = String(body.text || '').trim().slice(0, 400);
      if (!text) return err(422, 'Write the question text.');
      const competencyId = body.competencyId ? Number(body.competencyId) : null;
      if (competencyId && !s.competencies.some(c => c.id === competencyId)) return err(422, 'That competency no longer exists.');
      if (type === 'scale' && !competencyId) return err(422, 'Confidence Scale questions must belong to a competency so they can be charted.');
      let options = [];
      if (type === 'choice') {
        options = [...new Set((Array.isArray(body.options) ? body.options : []).map(o => String(o).trim().slice(0, 120)).filter(Boolean))];
        if (options.length < 2) return err(422, 'Multiple choice questions need at least two options.');
      }
      const q = {
        competencyId, type, text,
        survey: type === 'scale' ? 'both' : (SURVEYS.includes(body.survey) ? body.survey : 'both'),
        help: String(body.help || '').trim().slice(0, 300),
        required: body.required !== false, multiple: type === 'choice' && !!body.multiple, options,
      };
      if (method === 'POST') { s.questions.push({ id: s.nextId++, ...q }); return saveAndReturn(201); }
      if (method === 'PUT') {
        const i = s.questions.findIndex(x => x.id === id);
        if (i < 0) return err(404, 'Question not found.');
        s.questions[i] = { id, ...q };
        return saveAndReturn();
      }
    }
    if (path === '/admin/questions-order' && method === 'PUT') {
      const r = reorder(s.questions, body.ids); if (!r) return err(422, 'ids must be an array.');
      s.questions = r; return saveAndReturn();
    }

    if (path === '/admin/publish' && method === 'POST') {
      if (!s.questions.some(q => q.type === 'scale')) return err(422, 'Add at least one Confidence Scale question before publishing.');
      s.published = JSON.parse(JSON.stringify({ versionId: (s.published?.versionId || 0) + 1, publishedAt: new Date().toISOString(), competencies: s.competencies, questions: s.questions }));
      const empty = s.competencies.filter(c => !s.questions.some(q => q.competencyId === c.id));
      return saveAndReturn(200, { warnings: empty.length ? [`These competencies have no questions and won’t appear: ${empty.map(c => c.name).join(', ')}`] : [] });
    }

    if (path === '/admin/settings' && method === 'PUT') {
      const st = s.settings;
      if (body.programName !== undefined) st.programName = String(body.programName).trim().slice(0, 120) || 'Career Ready Fellowship';
      if (body.exitOpen !== undefined) st.exitOpen = !!body.exitOpen;
      if (body.entryIntro !== undefined) st.entryIntro = String(body.entryIntro).slice(0, 1000);
      if (body.exitIntro !== undefined) st.exitIntro = String(body.exitIntro).slice(0, 1000);
      return saveAndReturn();
    }

    // Results
    if (path === '/admin/results' && method === 'GET') {
      const all = await allStudents();
      const q = String(url.searchParams.get('q') || '').toLowerCase();
      return json(200, { summary: cohortSummary(all, s), students: all
        .filter(st => !q || [st.name, st.email, st.id].some(v => String(v).toLowerCase().includes(q)))
        .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
        .map(st => ({
          ...publicStudent(st),
          entry: st.entry ? { overall: st.entry.scores.overall, completedAt: st.entry.completedAt } : null,
          exit: st.exit ? { overall: st.exit.scores.overall, completedAt: st.exit.completedAt } : null,
          change: st.entry && st.exit ? round(st.exit.scores.overall - st.entry.scores.overall) : null,
        })) });
    }
    if (m?.[1] === 'results' && m[2] && method === 'GET') {
      const st = await getStudent(decodeURIComponent(m[2]));
      if (!st) return err(404, 'Student not found.');
      return json(200, results(st, s.settings, { withAnswers: true }));
    }
    if (m?.[1] === 'students' && m[2] && method === 'DELETE') {
      await store.delete(`students/${decodeURIComponent(m[2])}`);
      return json(200, { deleted: true });
    }
    if (path === '/admin/export.csv' && method === 'GET') {
      const all = (await allStudents()).sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
      const comps = cohortSummary(all, s).competencies;
      const cell = v => { if (v == null) return ''; let x = String(v); if (/^[=+\-@]/.test(x)) x = `'${x}`; return /[",\n]/.test(x) ? `"${x.replace(/"/g, '""')}"` : x; };
      const score = (sub, id) => sub?.scores.competencies.find(c => c.id === id)?.score ?? null;
      const lines = [['student_id', 'name', 'email', 'entry_completed', 'exit_completed', 'entry_overall', 'exit_overall', 'overall_change', ...comps.flatMap(c => [`${c.name} (entry)`, `${c.name} (exit)`])].map(cell).join(',')];
      for (const st of all) lines.push([st.id, st.name, st.email, st.entry?.completedAt, st.exit?.completedAt, st.entry?.scores.overall, st.exit?.scores.overall,
        st.entry && st.exit ? round(st.exit.scores.overall - st.entry.scores.overall) : null, ...comps.flatMap(c => [score(st.entry, c.id), score(st.exit, c.id)])].map(cell).join(','));
      return new Response('\ufeff' + lines.join('\n'), { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="career-readiness-results.csv"', 'Cache-Control': 'no-store' } });
    }
  }

  return err(404, 'Not found.');
}

function cohortSummary(all, s) {
  const avg = a => (a.length ? round(a.reduce((x, y) => x + y, 0) / a.length) : null);
  const agg = new Map();
  const overall = { entry: [], exit: [] };
  for (const st of all) for (const k of ['entry', 'exit']) {
    const sc = st[k]?.scores; if (!sc) continue;
    if (sc.overall != null) overall[k].push(sc.overall);
    for (const c of sc.competencies) {
      if (!agg.has(c.id)) agg.set(c.id, { name: c.name, entry: [], exit: [] });
      agg.get(c.id)[k].push(c.score);
    }
  }
  const order = (s.published?.competencies || []).map(c => c.id);
  const competencies = [...agg.entries()]
    .sort((a, b) => (order.indexOf(a[0]) + 1 || 999) - (order.indexOf(b[0]) + 1 || 999))
    .map(([id, c]) => {
      const e = avg(c.entry), x = avg(c.exit);
      return { id, name: s.published?.competencies.find(p => p.id === id)?.name || c.name, entry: e, exit: x, change: e != null && x != null ? round(x - e) : null };
    });
  const oe = avg(overall.entry), ox = avg(overall.exit);
  return {
    counts: { students: all.length, entry: overall.entry.length, exit: overall.exit.length },
    overall: { entry: oe, exit: ox, change: oe != null && ox != null ? round(ox - oe) : null },
    competencies,
  };
}
