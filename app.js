const views = document.querySelectorAll('.view');
const navItems = document.querySelectorAll('[data-view]');
const pageTitle = document.querySelector('#page-title');
const titles = { dashboard: 'Overview', live: 'Live scores', predictor: 'EPF predictor', performance: 'Performance tracker', fixtures: 'Fixtures', teams: 'Teams & players' };

function showView(viewName) {
  const target = document.querySelector(`#${viewName}-view`) || document.querySelector('#dashboard-view');
  views.forEach((view) => view.classList.toggle('active', view === target));
  document.querySelectorAll('.nav-item[data-view]').forEach((item) => item.classList.toggle('active', item.dataset.view === viewName));
  pageTitle.textContent = titles[viewName] || titles.dashboard;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

navItems.forEach((item) => item.addEventListener('click', () => showView(item.dataset.view)));
document.querySelectorAll('[data-view-link]').forEach((item) => item.addEventListener('click', (event) => { event.preventDefault(); showView(item.dataset.viewLink); }));

const inputs = ['home-form', 'away-form', 'home-advantage'];
inputs.forEach((inputId) => document.querySelector(`#${inputId}`).addEventListener('input', (event) => {
  document.querySelector(`#${inputId}-value`).textContent = event.target.value;
}));

function runPrediction() {
  const homeForm = Number(document.querySelector('#home-form').value);
  const awayForm = Number(document.querySelector('#away-form').value);
  const advantage = Number(document.querySelector('#home-advantage').value);
  const homeTeam = document.querySelector('#home-team').value;
  const awayTeam = document.querySelector('#away-team').value;
  const rawHome = homeForm * 0.56 + advantage * 0.44;
  const rawAway = awayForm;
  const homeProbability = Math.round(38 + (rawHome - rawAway) * 0.45);
  const drawProbability = Math.round(26 - Math.abs(homeForm - awayForm) * 0.08);
  const awayProbability = Math.max(8, 100 - homeProbability - drawProbability);
  document.querySelector('#home-probability').textContent = `${homeProbability}%`;
  document.querySelector('#draw-probability').textContent = `${drawProbability}%`;
  document.querySelector('#away-probability').textContent = `${awayProbability}%`;
  const homeWins = homeProbability >= awayProbability;
  document.querySelector('#prediction-title').textContent = homeWins ? `${homeTeam} to edge it` : `${awayTeam} to take the points`;
  document.querySelector('#prediction-copy').textContent = homeWins ? `Strong home form and a consistent attacking profile give ${homeTeam} the advantage.` : `The away side's current form profile creates a narrow but meaningful edge in this fixture.`;
  document.querySelector('#expected-score').textContent = homeWins ? `${Math.max(1.1, homeProbability / 25).toFixed(1)} — ${Math.max(.7, awayProbability / 25).toFixed(1)}` : `${Math.max(.8, homeProbability / 28).toFixed(1)} — ${Math.max(1.2, awayProbability / 25).toFixed(1)}`;
  document.querySelector('#confidence').textContent = Math.abs(homeProbability - awayProbability) > 18 ? 'High' : 'Good';
  document.querySelector('#model-edge').textContent = `+${Math.abs(homeProbability - awayProbability).toFixed(1)}%`;
}

document.querySelector('#predict-button').addEventListener('click', runPrediction);
document.querySelectorAll('.tab').forEach((tab) => tab.addEventListener('click', () => { document.querySelectorAll('.tab').forEach((item) => item.classList.remove('active')); tab.classList.add('active'); }));
lucide.createIcons();