import { api, esc, store, toast } from './api.js';
import { mountSurvey } from './survey-form.js';
import { renderResults } from './results-view.js';

// Same page serves both public links: /entry and /exit
const KIND = location.pathname.replace(/\/+$/, '').endsWith('/exit') ? 'exit' : 'entry';
const app = document.getElementById('app');
document.title = `${KIND === 'entry' ? 'Entry' : 'Exit'} Survey – Your Big Year`;

const notice = (title, body) => { app.innerHTML = `<div class="panel"><h2>${title}</h2><p class="muted" style="margin:0">${body}</p></div>`; };

async function start() {
  let data;
  try { data = await api(`/surveys?kind=${KIND}`); }
  catch (err) { return notice('The survey isn’t available right now', esc(err.message)); }
  const { survey, settings } = data;
  if (KIND === 'exit' && !settings.exitOpen) return notice('The Exit Survey isn’t open yet', 'It opens near the end of the fellowship. We’ll let you know when it’s time.');

  const intro = KIND === 'entry' ? settings.entryIntro : settings.exitIntro;
  app.innerHTML = `
    <header class="survey-intro">
      <h1>${KIND === 'entry' ? 'Entry Survey' : 'Exit Survey'}</h1>
      ${intro ? `<p>${esc(intro)}</p>` : ''}
    </header>
    <div id="holder"></div>`;

  mountSurvey(document.getElementById('holder'), {
    survey, identity: KIND,
    draftKey: `yby.draft.${KIND}`,
    submitLabel: KIND === 'entry' ? 'Submit and see my results' : 'Submit and see my growth',
    onSubmit: async (answers, identity) => {
      const body = KIND === 'entry' ? { ...identity, answers, versionId: survey.versionId } : { email: identity.email, answers, versionId: survey.versionId };
      const r = await api(`/surveys/${KIND}`, { method: 'POST', body });
      store.set('yby.studentToken', r.token);
      renderResults(app, r, {});
      window.scrollTo(0, 0);
      toast(KIND === 'entry' ? 'Entry Survey saved' : 'Exit Survey saved');
    },
  });
}

start();
