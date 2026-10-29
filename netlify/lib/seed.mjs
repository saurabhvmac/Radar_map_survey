// Starting survey, created the first time the API runs. Edit everything later in the admin builder.
export function seedSurvey() {
  const comps = [
    ['Communication', 'Expressing ideas clearly in writing and in person', ['writing a professional email to someone you have never met', 'speaking up and sharing your ideas in a group or meeting']],
    ['Networking', 'Building and maintaining professional relationships', ['starting a conversation with a professional at an event', 'asking someone for an informational interview']],
    ['Personal Branding', 'Presenting who you are and what you offer', ['describing your strengths in a 30-second introduction', 'having a LinkedIn profile that represents you well']],
    ['Job Search', 'Finding and applying for the right opportunities', ['tailoring your CV to a specific role', 'finding opportunities that match your interests']],
    ['Interview Skills', 'Performing well in interviews and assessments', ['answering competency questions using clear examples', 'handling a question you did not expect']],
    ['Workplace Readiness', 'Thriving in a professional environment', ['managing your time across several deadlines', 'asking for and acting on feedback']],
  ];
  let id = 1;
  const competencies = [], questions = [];
  for (const [name, description, qs] of comps) {
    const cid = id++;
    competencies.push({ id: cid, name, description });
    for (const t of qs) questions.push({ id: id++, competencyId: cid, type: 'scale', survey: 'both', text: `How confident are you in: ${t}?`, help: '', required: true, multiple: false, options: [] });
  }
  const extra = (type, survey, text, o = {}) => questions.push({ id: id++, competencyId: null, type, survey, text, help: o.help || '', required: o.required !== false, multiple: !!o.multiple, options: o.options || [] });
  extra('choice', 'entry', 'Which year of study are you in?', { options: ['First year', 'Second year', 'Third year', 'Final year', 'Graduate'] });
  extra('choice', 'entry', 'Which sectors interest you most?', { help: 'Choose all that apply.', required: false, multiple: true, options: ['Business & finance', 'Technology', 'Creative industries', 'Public sector', 'Healthcare', 'Not sure yet'] });
  extra('long', 'entry', 'What do you most want to get out of the fellowship?');
  extra('long', 'exit', 'What was the most valuable thing you learned during the fellowship?');
  extra('short', 'exit', 'In one sentence, what is your next career step?', { required: false });
  return {
    nextId: id,
    competencies, questions,
    published: JSON.parse(JSON.stringify({ versionId: 1, publishedAt: new Date().toISOString(), competencies, questions })),
    settings: {
      programName: 'Career Ready Fellowship',
      exitOpen: true,
      entryIntro: 'Take about 10 minutes to reflect on where you are today. There are no right or wrong answers – be honest so you can see your real growth at the end of the fellowship.',
      exitIntro: 'You made it! Answer the same questions again so we can show you how far you’ve come since your Entry Survey.',
    },
  };
}
