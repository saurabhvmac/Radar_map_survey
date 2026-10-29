import { esc, toast } from './api.js';

const css = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const fmt = n => (n == null ? '–' : Number(n).toFixed(1));
const deltaHTML = d => {
  if (d == null) return '<span class="muted">–</span>';
  const cls = d > 0 ? '' : d < 0 ? 'neg' : 'zero';
  return `<span class="delta ${cls}">${d > 0 ? '+' : ''}${Number(d).toFixed(1)}</span>`;
};

/** Split long axis labels into lines so they fit around the radar. */
function wrapLabel(s, max = 14) {
  const words = String(s).split(' ');
  const lines = []; let line = '';
  for (const w of words) {
    if ((line + ' ' + w).trim().length > max && line) { lines.push(line); line = w; }
    else line = (line + ' ' + w).trim();
  }
  if (line) lines.push(line);
  return lines.length > 1 ? lines : s;
}

let chart;

/**
 * renderResults(container, results, { admin })
 * `results` is the payload from GET /api/students/me/results (or a submit response).
 */
export function renderResults(container, results, opts = {}) {
  const { student, status, comparison } = results;
  const hasExit = !!results.exit;
  const rows = comparison?.competencies || [];
  const first = (student?.name || '').split(' ')[0];

  container.innerHTML = `
    <div class="results-head">
      <div>
        <p class="muted" style="margin:0">${hasExit ? 'Entry vs Exit' : 'Entry Survey results'}</p>
        <h1>${opts.admin ? esc(student?.name) : hasExit ? `${esc(first)}, look how far you’ve come` : `${esc(first)}’s starting point`}</h1>
      </div>
      <div class="actions" data-html2canvas-ignore>
        <button type="button" class="btn btn-sm btn-ghost" data-act="png">Download image</button>
        <button type="button" class="btn btn-sm btn-ghost" data-act="pdf">Download PDF</button>
      </div>
    </div>

    <section class="report" id="report">
      <div class="report-grid">
        <div>
          <div class="chart-box"><canvas id="radar" role="img" aria-label="Radar chart of career readiness by competency"></canvas></div>
          <div class="legend">
            <span><i style="background:${css('--entry')}"></i>Entry</span>
            ${hasExit ? `<span><i style="background:${css('--exit')}"></i>Exit</span>` : ''}
          </div>
        </div>
        <div>
          <div class="overall">
            <div><span class="num">${fmt(comparison?.overall.entry)}<small> / 5</small></span><span class="lbl">Entry average</span></div>
            ${hasExit ? `
              <div><span class="num">${fmt(comparison.overall.exit)}<small> / 5</small></span><span class="lbl">Exit average</span></div>
              <div><span class="num">${deltaHTML(comparison.overall.change)}</span><span class="lbl">Overall growth</span></div>` : ''}
          </div>
          <h3>By competency</h3>
          <div>
            ${rows.map(r => `
              <div class="comp-row">
                <span class="comp-name">${esc(r.name)}</span>
                <span class="comp-vals">${hasExit ? `${fmt(r.entry)} → <strong>${fmt(r.exit)}</strong> ${deltaHTML(r.change)}` : `<strong>${fmt(r.entry)}</strong>`}</span>
                <div class="bar" aria-hidden="true">
                  ${r.entry != null ? `<b class="b-entry" style="width:${(r.entry / 5) * 100}%"></b>` : ''}
                  ${hasExit && r.exit != null ? `<b class="b-exit" style="width:${(r.exit / 5) * 100}%"></b>` : ''}
                </div>
              </div>`).join('')}
          </div>
          ${hasExit ? growthHTML(comparison.strongestGrowth) : `
            <p class="small muted" style="margin-top:1rem">Scores are the average of your Confidence Scale answers for each competency, from 1 (not at all confident) to 5 (extremely confident).</p>`}
        </div>
      </div>
      <p class="small muted" style="margin:1.25rem 0 0">
        ${esc(student?.name || '')}, student ID ${esc(student?.id || '')}.
        Entry completed ${results.entry ? new Date(results.entry.completedAt + 'Z').toLocaleDateString() : '–'}${hasExit ? `, Exit completed ${new Date(results.exit.completedAt + 'Z').toLocaleDateString()}` : ''}.
      </p>
    </section>

    ${opts.admin ? '' : nextStepHTML(status, hasExit)}
  `;

  drawChart(container.querySelector('#radar'), comparison, hasExit);

  container.querySelector('[data-act=png]').addEventListener('click', () => download('png', student));
  container.querySelector('[data-act=pdf]').addEventListener('click', () => download('pdf', student));
}

function growthHTML(list) {
  if (!list?.length) return `<div class="growth"><h3>Your growth</h3><p style="margin:0">Your scores held steady. Look at the competencies above to decide where to focus next.</p></div>`;
  return `<div class="growth"><h3>Strongest areas of growth</h3><ol>
    ${list.map(g => `<li><strong>${esc(g.name)}</strong>: ${fmt(g.entry)} → ${fmt(g.exit)} (${deltaHTML(g.change)})</li>`).join('')}
  </ol></div>`;
}

function nextStepHTML(_status, hasExit) {
  if (hasExit) return `<div class="next-step"><p class="muted" style="margin:0">Congratulations on completing the Career Ready Fellowship.</p></div>`;
  return `<div class="panel next-step"><div><h3 style="margin:0">What happens next</h3><p class="muted" style="margin:.25rem 0 0">Your answers are saved. In a few weeks, near the end of the fellowship, you’ll get a link to the Exit Survey. You’ll answer the same questions again and see how far you’ve come.</p></div></div>`;
}

function drawChart(canvas, comparison, hasExit) {
  if (!window.Chart || !canvas) return;
  chart?.destroy();
  const rows = comparison?.competencies || [];
  const entryColor = css('--entry'); const exitColor = css('--exit');
  const datasets = [{
    label: 'Entry',
    data: rows.map(r => r.entry),
    borderColor: entryColor, backgroundColor: css('--entry-soft'),
    pointBackgroundColor: entryColor, borderWidth: 2, pointRadius: 4,
  }];
  if (hasExit) datasets.push({
    label: 'Exit',
    data: rows.map(r => r.exit),
    borderColor: exitColor, backgroundColor: css('--exit-soft'),
    pointBackgroundColor: exitColor, borderWidth: 2.5, pointRadius: 5,
  });
  chart = new window.Chart(canvas, {
    type: 'radar',
    data: { labels: rows.map(r => wrapLabel(r.name)), datasets },
    options: {
      responsive: true, maintainAspectRatio: true,
      animation: matchMedia('(prefers-reduced-motion: reduce)').matches ? false : { duration: 700 },
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: c => `${c.dataset.label}: ${c.raw == null ? '–' : Number(c.raw).toFixed(1)} / 5` } },
      },
      scales: {
        r: {
          min: 0, max: 5, beginAtZero: true,
          ticks: { stepSize: 1, backdropColor: 'transparent', color: css('--muted'), font: { size: 11 } },
          grid: { color: css('--line') }, angleLines: { color: css('--line') },
          pointLabels: { color: css('--ink'), font: { size: window.innerWidth < 480 ? 11 : 13, weight: '700', family: css('--font-body') } },
        },
      },
    },
  });
}

async function download(kind, student) {
  const el = document.getElementById('report');
  if (!window.html2canvas) return toast('Download isn’t available right now. Try again in a moment.', 'error');
  try {
    const canvas = await window.html2canvas(el, { scale: 2, backgroundColor: '#ffffff', useCORS: true });
    const slug = (student?.name || 'results').toLowerCase().replace(/[^a-z0-9]+/g, '-');
    if (kind === 'png') {
      const a = document.createElement('a');
      a.href = canvas.toDataURL('image/png');
      a.download = `career-readiness-${slug}.png`;
      a.click();
    } else {
      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
      const pageW = 210, pageH = 297, margin = 12;
      pdf.setFont('helvetica', 'bold'); pdf.setFontSize(14);
      pdf.text('Your Big Year – Career Ready Fellowship', margin, margin + 4);
      const w = pageW - margin * 2;
      let h = (canvas.height / canvas.width) * w;
      let iw = w;
      const maxH = pageH - margin * 2 - 10;
      if (h > maxH) { iw = (maxH / h) * w; h = maxH; }
      pdf.addImage(canvas.toDataURL('image/png'), 'PNG', margin + (w - iw) / 2, margin + 10, iw, h);
      pdf.save(`career-readiness-${slug}.pdf`);
    }
  } catch (e) {
    console.error(e);
    toast('Couldn’t create the download. Try again.', 'error');
  }
}
