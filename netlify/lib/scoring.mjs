export const SCALE_LABELS = {
  1: 'Not at all confident',
  2: 'Slightly confident',
  3: 'Moderately confident',
  4: 'Very confident',
  5: 'Extremely confident',
};

export const round = n => (n == null ? null : Math.round(n * 100) / 100);

/** Questions a given survey kind should show. Scale questions always appear in both. */
export function questionsFor(survey, kind) {
  return survey.questions.filter(q => q.type === 'scale' || q.survey === 'both' || q.survey === kind);
}

/** Validate answers against the published survey. Returns { clean, errors }. */
export function validateAnswers(survey, kind, answers) {
  const errors = {};
  const clean = {};
  if (!answers || typeof answers !== 'object' || Array.isArray(answers)) {
    return { clean, errors: { _: 'Answers must be an object keyed by question id.' } };
  }
  const qs = questionsFor(survey, kind);
  const allowed = new Set(qs.map(q => String(q.id)));
  for (const key of Object.keys(answers)) {
    if (!allowed.has(String(key))) errors[key] = 'This question is not part of the survey.';
  }

  for (const q of qs) {
    const raw = answers[q.id] ?? answers[String(q.id)];
    const empty = raw === undefined || raw === null || raw === '' || (Array.isArray(raw) && raw.length === 0);
    if (empty) {
      if (q.required) errors[q.id] = 'This question is required.';
      continue;
    }
    switch (q.type) {
      case 'scale': {
        const n = Number(raw);
        if (!Number.isInteger(n) || n < 1 || n > 5) errors[q.id] = 'Choose a value from 1 to 5.';
        else clean[q.id] = n;
        break;
      }
      case 'short':
      case 'long': {
        if (typeof raw !== 'string') { errors[q.id] = 'Answer must be text.'; break; }
        const max = q.type === 'short' ? 300 : 5000;
        const v = raw.trim();
        if (!v && q.required) errors[q.id] = 'This question is required.';
        else if (v.length > max) errors[q.id] = `Keep your answer under ${max} characters.`;
        else if (v) clean[q.id] = v;
        break;
      }
      case 'choice': {
        const vals = Array.isArray(raw) ? raw : [raw];
        if (!q.multiple && vals.length > 1) { errors[q.id] = 'Choose one option.'; break; }
        if (vals.some(v => !q.options.includes(v))) { errors[q.id] = 'Choose from the listed options.'; break; }
        clean[q.id] = q.multiple ? [...new Set(vals)] : vals[0];
        break;
      }
      default:
        errors[q.id] = 'Unknown question type.';
    }
  }
  return { clean, errors };
}

/** Average scale answers per competency. Only Confidence Scale questions count. */
export function computeScores(survey, answers) {
  const byComp = new Map(survey.competencies.map(c => [c.id, { id: c.id, name: c.name, values: [] }]));
  for (const q of survey.questions) {
    if (q.type !== 'scale' || !byComp.has(q.competencyId)) continue;
    const v = answers[q.id];
    if (Number.isInteger(v)) byComp.get(q.competencyId).values.push(v);
  }
  const competencies = [...byComp.values()]
    .filter(c => c.values.length > 0)
    .map(c => ({ id: c.id, name: c.name, score: round(c.values.reduce((a, b) => a + b, 0) / c.values.length), answered: c.values.length }));
  const overall = competencies.length ? round(competencies.reduce((a, c) => a + c.score, 0) / competencies.length) : null;
  return { competencies, overall };
}

/** Build the comparison payload the frontend turns into the radar chart. */
export function compare(entry, exit) {
  const exitById = new Map((exit?.competencies || []).map(c => [c.id, c]));
  const rows = (entry?.competencies || []).map(c => {
    const e = exitById.get(c.id);
    return {
      id: c.id,
      name: e?.name || c.name,
      entry: c.score,
      exit: e ? e.score : null,
      change: e ? round(e.score - c.score) : null,
    };
  });
  // Competencies that exist only in the exit (added mid-programme)
  for (const c of exit?.competencies || []) {
    if (!rows.find(r => r.id === c.id)) rows.push({ id: c.id, name: c.name, entry: null, exit: c.score, change: null });
  }
  const comparable = rows.filter(r => r.change !== null);
  const strongestGrowth = [...comparable].filter(r => r.change > 0).sort((a, b) => b.change - a.change).slice(0, 3);
  return {
    labels: rows.map(r => r.name),
    competencies: rows,
    overall: {
      entry: entry?.overall ?? null,
      exit: exit?.overall ?? null,
      change: entry?.overall != null && exit?.overall != null ? round(exit.overall - entry.overall) : null,
    },
    strongestGrowth,
  };
}

