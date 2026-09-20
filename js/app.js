const SET_SIZE = 25;
const STORAGE_PREFIX = 'ssc-maths-practice:v3:';
const state = { chapters: [], chapter: null, set: [], score: null, answered: false, answers: {} };
const $ = id => document.getElementById(id);

// GitHub Pages can host this project under /Maths-Practice/ (or another
// repository path). Always resolve assets against the actual page URL rather
// than assuming the site lives at the domain root.
const SITE_BASE = new URL('./', document.baseURI);
const assetUrl = path => new URL(path, SITE_BASE).href;

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function md(s) {
  s = escapeHtml(s);
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  return s.replace(/\n/g, '<br>');
}

function storageKey() { return `${STORAGE_PREFIX}${state.chapter.id}`; }
function getProgress() {
  try { return JSON.parse(localStorage.getItem(storageKey()) || '{}'); } catch { return {}; }
}
function saveProgress(data) { localStorage.setItem(storageKey(), JSON.stringify(data)); }
function getUsed() { return new Set(getProgress().usedIds || []); }
function getHistory() {
  const h = getProgress().history;
  return (h && typeof h === 'object') ? h : {};
}

function getQuestionStatus(q) {
  const p = getProgress();
  const h = p.history && p.history[String(q.id)];
  if (h?.status === 'correct') return 'correct';
  if (h?.status === 'wrong') return 'wrong';
  if (h?.status === 'unanswered') return 'unanswered';
  if (state.set.some(x => x.id === q.id) && state.answers[q.id]) return 'pending';
  if (getUsed().has(q.id)) return 'used';
  return 'new';
}


function saveCurrentSet() {
  const p = getProgress();
  p.currentSetIds = state.set.map(q => q.id);
  p.currentSetAnswered = state.answered;
  p.currentAnswers = state.answers;
  p.lastScore = state.score;
  saveProgress(p);
}

function restoreCurrentSet() {
  const p = getProgress();
  if (!Array.isArray(p.currentSetIds) || !p.currentSetIds.length) return false;
  const byId = new Map(state.chapter.data.questions.map(q => [q.id, q]));
  const restored = p.currentSetIds.map(id => byId.get(id)).filter(Boolean);
  if (!restored.length) return false;
  state.set = restored;
  state.score = typeof p.lastScore === 'number' ? p.lastScore : null;
  state.answered = !!p.currentSetAnswered;
  state.answers = (p.currentAnswers && typeof p.currentAnswers === 'object') ? p.currentAnswers : {};
  renderSet();
  updateScoreCard();
  return true;
}

async function fetchJson(path) {
  const url = assetUrl(path);
  const r = await fetch(url, { cache: 'no-cache' });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}: ${url}`);
  return r.json();
}

async function loadChapter(meta) {
  // Prefer the JSON asset so the site remains easy to extend. If a GitHub
  // Pages deployment doesn't expose the JSON correctly, use embedded data.
  try {
    return await fetchJson(`data/${meta.file}`);
  } catch (err) {
    const embedded = (window.SSC_EMBEDDED_CHAPTERS || []).find(c => c.id === meta.id);
    if (embedded?.data) return embedded.data;
    throw err;
  }
}

function refreshIcons() {
  if (window.lucide?.createIcons) window.lucide.createIcons();
}

function fillChapters() {
  const select = $('chapterSelect');
  select.innerHTML = state.chapters.map(c => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name)}</option>`).join('');
  select.disabled = state.chapters.length === 0;
  updateChapter();
}

function updateChapter() {
  const c = state.chapters.find(x => x.id === $('chapterSelect').value);
  if (!c) return;
  state.chapter = c;
  const sections = [...new Set((c.data.questions || []).map(q => q.section).filter(Boolean))];
  $('sectionSelect').innerHTML = '<option value="all">All sections</option>' + sections.map(s => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('');
  $('chapterName').textContent = c.name;
  $('chapterCount').textContent = `${c.data.questions.length} questions`;
  updateProgress();
  $('quiz').classList.add('hidden');
  $('empty').classList.remove('hidden');
  $('result').classList.add('hidden');
  state.set = [];
  state.score = null;
  state.answered = false;
  if (!restoreCurrentSet()) {
    $('empty').classList.remove('hidden');
  }
  updateScoreCard();
  refreshIcons();
}

function updateProgress() {
  if (!state.chapter) return;
  const used = getUsed();
  const total = state.chapter.data.questions.length;
  const done = Math.min(used.size, total);
  const pct = total ? Math.round(done / total * 100) : 0;
  $('progressText').textContent = `${done} / ${total}`;
  $('progressPercent').textContent = `${pct}%`;
  $('progressBar').style.width = `${pct}%`;
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function pickSet() {
  if (!state.chapter) return;
  const section = $('sectionSelect').value;
  const used = getUsed();
  const pool = state.chapter.data.questions.filter(q => (section === 'all' || q.section === section) && !used.has(q.id));

  state.set = shuffle([...pool]).slice(0, SET_SIZE);
  state.score = null;
  state.answered = false;
  state.answers = {};

  state.set.forEach(q => used.add(q.id));
  const p = getProgress();
  p.usedIds = [...used];
  p.currentSetIds = state.set.map(q => q.id);
  p.currentSetAnswered = false;
  p.currentAnswers = {};
  p.lastScore = null;
  saveProgress(p);

  renderSet();
  updateProgress();
  updateScoreCard();
}

function renderSet() {
  if (!state.set.length) {
    $('quiz').classList.add('hidden');
    $('empty').classList.remove('hidden');
    $('empty').innerHTML = `<div class="empty-icon"><i data-lucide="circle-check"></i></div><h2>No unused questions left</h2><p>Reset this chapter's progress to make all questions available again.</p>`;
    refreshIcons();
    return;
  }

  $('empty').classList.add('hidden');
  $('quiz').classList.remove('hidden');
  $('setLabel').textContent = `${state.chapter.name} · ${state.set.length}-question set`;
  updateAnsweredCount();
  $('result').classList.add('hidden');

  $('questionList').innerHTML = state.set.map((q, idx) => {
    const selected = state.answers[q.id];
    return `<article class="qcard${selected ? ' answered' : ''}" data-q="${q.id}">
      <div class="qtitle"><span class="num">${String(idx+1).padStart(2,'0')}</span><span>Question ${idx+1}</span><span class="answered-badge"><i data-lucide="check"></i> Answered</span><span class="source-id">#${q.id}</span></div>
      <div class="question">${md(q.question_markdown)}</div>
      <div class="options">${Object.entries(q.options || {}).map(([k,v]) =>
        `<label class="option${selected === k ? ' selected' : ''}"><input type="radio" name="q${q.id}" value="${escapeHtml(k)}"${selected === k ? ' checked' : ''}><span><b>${escapeHtml(k)}.</b> ${md(v)}</span></label>`
      ).join('')}</div>
      <div class="explain hidden"></div>
    </article>`;
  }).join('');

  if (state.answered) revealSavedResult();
  renderMath();
  refreshIcons();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function updateAnsweredCount() {
  const answered = state.set.filter(q => state.answers[q.id]).length;
  $('answeredLabel').textContent = `${answered}/${state.set.length} answered`;
  return answered;
}

function handleAnswerChange(event) {
  const input = event.target.closest('input[type=\"radio\"]');
  if (!input || state.answered) return;
  const card = input.closest('.qcard');
  if (!card) return;
  const qId = card.dataset.q;
  state.answers[qId] = input.value;
  card.classList.add('answered');
  card.querySelectorAll('.option').forEach(label => label.classList.toggle('selected', label.querySelector('input') === input));
  updateAnsweredCount();
  saveCurrentSet();
  updateScoreCard();
}

function renderMath() {
  if (!window.renderMathInElement) return;
  window.renderMathInElement(document.getElementById('questionList'), {
    delimiters: [
      {left: '$$', right: '$$', display: true},
      {left: '\\[', right: '\\]', display: true},
      {left: '$', right: '$', display: false},
      {left: '\\(', right: '\\)', display: false}
    ],
    throwOnError: false,
    strict: false
  });
}

function revealSavedResult() {
  const p = getProgress();
  if (typeof p.lastScore !== 'number') return;
  state.set.forEach(q => {
    const value = state.answers[q.id];
    const input = value ? document.querySelector(`[data-q="${q.id}"] input[value="${CSS.escape(value)}"]`) : null;
    revealCard(q, input, true);
  });
  $('result').classList.remove('hidden');
  $('result').innerHTML = `<i data-lucide="trophy"></i><span>Score: <b>${p.lastScore}/${state.set.length}</b> · This set is already checked.</span>`;
  updateScoreCard();
  refreshIcons();
}

function revealCard(q, chosen, saved = false) {
  const card = document.querySelector(`[data-q="${q.id}"]`);
  if (!card) return;
  const labels = [...card.querySelectorAll('.option')];
  const isAnswered = !!chosen;
  const isCorrect = isAnswered && chosen.value === q.answer.option;
  card.classList.add('checked');
  card.classList.toggle('correct-card', isCorrect);
  card.classList.toggle('wrong-card', isAnswered && !isCorrect);
  labels.forEach(l => l.classList.remove('correct','wrong'));
  if (isAnswered && !isCorrect) chosen.closest('.option')?.classList.add('wrong');
  labels.find(l => l.querySelector('input')?.value === q.answer.option)?.classList.add('correct');
  const exp = card.querySelector('.explain');
  exp.classList.remove('hidden');
  exp.innerHTML = isAnswered && !isCorrect
    ? `<i data-lucide="circle-x"></i><span>Your answer: <b class="bad-text">${escapeHtml(chosen.value)}. ${md(q.options[chosen.value] || '')}</b> · Correct answer: <b>${escapeHtml(q.answer.option)}. ${md(q.answer.text)}</b>${q.pdf_page ? ` <span>· PDF page ${q.pdf_page}</span>` : ''}</span>`
    : `<i data-lucide="badge-check"></i><span>Correct answer: <b>${escapeHtml(q.answer.option)}. ${md(q.answer.text)}</b>${q.pdf_page ? ` <span>· PDF page ${q.pdf_page}</span>` : ''}</span>`;
  if (saved) card.querySelectorAll('input').forEach(i => i.disabled = true);
}

function check() {
  if (!state.set.length || state.answered) return;
  let score = 0, answered = 0;
  state.set.forEach(q => {
    const card = document.querySelector(`[data-q="${q.id}"]`);
    const chosen = card.querySelector(`input[name="q${q.id}"]:checked`);
    if (chosen) {
      answered++;
      state.answers[q.id] = chosen.value;
      if (chosen.value === q.answer.option) score++;
      card.classList.add('answered');
    }
    revealCard(q, chosen);
    card.querySelectorAll('input').forEach(i => i.disabled = true);
  });
  state.score = score;
  state.answered = true;
  const p = getProgress();
  p.lastScore = score;
  p.currentSetAnswered = true;
  p.currentAnswers = state.answers;
  p.history = (p.history && typeof p.history === 'object') ? p.history : {};
  state.set.forEach(q => {
    const selected = state.answers[q.id] || null;
    p.history[String(q.id)] = {
      selected,
      correct: selected === q.answer.option,
      status: selected === q.answer.option ? 'correct' : (selected ? 'wrong' : 'unanswered'),
      section: q.section || 'Uncategorized'
    };
  });
  p.checkedSets = (p.checkedSets || 0) + 1;
  p.totalCorrect = Object.values(p.history).filter(x => x.status === 'correct').length;
  p.totalWrong = Object.values(p.history).filter(x => x.status === 'wrong').length;
  p.totalAnswered = Object.values(p.history).filter(x => x.status === 'correct' || x.status === 'wrong').length;
  saveProgress(p);
  $('answeredLabel').textContent = `${answered}/${state.set.length} answered`;
  $('result').classList.remove('hidden');
  $('result').innerHTML = `<i data-lucide="trophy"></i><span>Score: <b>${score}/${state.set.length}</b> · Answered: <b>${answered}/${state.set.length}</b></span>`;
  updateScoreCard();
  renderMath();
  refreshIcons();
}

function updateScoreCard() {
  if (!state.chapter || !$('scoreSummary')) return;
  const p = getProgress();
  const history = p.history && typeof p.history === 'object' ? p.history : {};
  const entries = Object.values(history);
  const correct = entries.filter(x => x.status === 'correct').length;
  const wrong = entries.filter(x => x.status === 'wrong').length;
  const answered = correct + wrong;
  const used = (p.usedIds || []).length;
  const accuracy = answered ? Math.round(correct / answered * 100) : 0;
  $('scoreSummary').innerHTML = [
    ['used', used, 'questions used'],
    ['answered', answered, 'checked'],
    ['correct', correct, 'correct'],
    ['wrong', wrong, 'wrong'],
    ['unanswered', entries.filter(x => x.status === 'unanswered').length, 'unanswered'],
    ['accuracy', `${accuracy}%`, 'accuracy'],
    ['sets', p.checkedSets || 0, 'sets checked']
  ].map(([icon,val,label]) => `<div class="score-stat"><span class="score-stat-icon"><i data-lucide="${icon === 'correct' ? 'circle-check' : icon === 'wrong' ? 'circle-x' : icon === 'accuracy' ? 'target' : icon === 'sets' ? 'layers-3' : icon === 'answered' ? 'check-check' : icon === 'unanswered' ? 'circle-minus' : 'book-copy'}"></i></span><div><b>${val}</b><span>${label}</span></div></div>`).join('');

  const questions = state.chapter.data.questions || [];
  $('questionTracker').innerHTML = questions.map(q => {
    const st = getQuestionStatus(q);
    const symbol = st === 'correct' ? '✓' : st === 'wrong' ? '✕' : st === 'unanswered' ? '—' : st === 'pending' ? '•' : st === 'used' ? '○' : '';
    return `<span class="tracker ${st}" title="Question ${q.id}: ${st}">${q.id}${symbol ? ` ${symbol}` : ''}</span>`;
  }).join('');

  const sectionMap = {};
  entries.forEach(e => {
    const sec = e.section || 'Uncategorized';
    sectionMap[sec] ||= {correct:0, wrong:0};
    if (e.status === 'correct') sectionMap[sec].correct++;
    if (e.status === 'wrong') sectionMap[sec].wrong++;
  });
  $('sectionScore').innerHTML = Object.entries(sectionMap).length ? Object.entries(sectionMap).map(([sec,v]) => {
    const n=v.correct+v.wrong, a=n?Math.round(v.correct/n*100):0;
    return `<div class="section-score"><div><span>${escapeHtml(sec)}</span><b>${v.correct}/${n} · ${a}%</b></div><div class="mini-bar"><i style="width:${a}%"></i></div></div>`;
  }).join('') : `<p class="score-empty">No checked questions yet.</p>`;
  refreshIcons();
}

function resetProgress() {
  if (!state.chapter) return;
  const ok = confirm(`Reset all progress for ${state.chapter.name}? Questions will become available again.`);
  if (!ok) return;
  localStorage.removeItem(storageKey());
  state.set = [];
  state.score = null;
  state.answered = false;
  state.answers = {};
  $('quiz').classList.add('hidden');
  $('empty').classList.remove('hidden');
  $('empty').innerHTML = `<div class="empty-icon"><i data-lucide="sparkles"></i></div><h2>Ready for a fresh start</h2><p>All questions in ${escapeHtml(state.chapter.name)} are available again.</p>`;
  updateProgress();
  updateScoreCard();
  refreshIcons();
}

function bindEvents() {
  $('startBtn').onclick = pickSet;
  $('submitBtn').onclick = check;
  $('resetBtn').onclick = pickSet;
  $('resetProgressBtn').onclick = resetProgress;
  $('chapterSelect').onchange = updateChapter;
  $('questionList').addEventListener('change', handleAnswerChange);
  $('themeBtn').onclick = () => {
    document.body.classList.toggle('dark');
    localStorage.setItem('ssc-theme', document.body.classList.contains('dark') ? 'dark' : 'light');
  };
}

function initTheme() {
  if (localStorage.getItem('ssc-theme') === 'dark') document.body.classList.add('dark');
}

async function init() {
  initTheme();
  bindEvents();
  refreshIcons();
  try {
    const fallback = window.SSC_EMBEDDED_CHAPTERS || [];
    let manifest;
    try {
      manifest = await fetchJson('data/manifest.json');
    } catch (_) {
      manifest = { chapters: fallback.map(c => ({ id: c.id, name: c.name, file: c.file })) };
    }

    state.chapters = await Promise.all((manifest.chapters || []).map(async meta => ({
      id: meta.id,
      name: meta.name,
      data: await loadChapter(meta)
    })));

    if (!state.chapters.length) throw new Error('No chapters found');
    fillChapters();
    updateScoreCard();
    refreshIcons();
  } catch (err) {
    console.error('SSC Maths Practice boot error:', err);
    $('empty').classList.remove('hidden');
    $('empty').innerHTML = `<div class="empty-icon"><i data-lucide="triangle-alert"></i></div><h2>Could not load chapter data</h2><p>Refresh the page or check the GitHub Pages deployment.</p><small>${escapeHtml(err.message)}</small>`;
    refreshIcons();
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
