const SET_SIZE = 25;
const STORAGE_PREFIX = 'ssc-maths-practice:v3:';
const state = { chapters: [], chapter: null, mode: 'chapter', set: [], score: null, answered: false, answers: {} };
const MIXED_PROGRESS_ID = '__mixed__';
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

function storageKey() { return `${STORAGE_PREFIX}${state.mode === 'mixed' ? MIXED_PROGRESS_ID : state.chapter.id}`; }
function questionKey(q) {
  return state.mode === 'mixed' ? `${q._chapterId}:${q.id}` : String(q.id);
}
function totalQuestions() {
  return state.chapters.reduce((n, c) => n + (c.data.questions || []).length, 0);
}
function mixedSignature() {
  return state.chapters.map(c => `${c.id}:${c.data.questions.length}`).join('|');
}
function allMixedQuestions() {
  const maxId = Math.max(0, ...state.chapters.flatMap(c => c.data.questions.map(q => Number(q.id) || 0)));
  const queue = [];
  for (let id = 1; id <= maxId; id++) {
    const level = [];
    state.chapters.forEach(c => {
      const q = c.data.questions.find(x => Number(x.id) === id);
      if (q) level.push({ ...q, _chapterId: c.id, _chapterName: c.name });
    });
    shuffle(level);
    queue.push(...level);
  }
  return queue;
}
function ensureMixedQueue() {
  const p = getProgress();
  if (p.mixedSignature !== mixedSignature() || !Array.isArray(p.mixedQueue)) {
    p.mixedSignature = mixedSignature();
    p.mixedQueue = allMixedQuestions().map(q => questionKey(q));
    p.usedIds = [];
    p.currentSetIds = [];
    p.currentSetAnswered = false;
    p.currentAnswers = {};
    p.lastScore = null;
    saveProgress(p);
  }
  return p;
}
function mixedQuestionMap() {
  const map = new Map();
  state.chapters.forEach(c => c.data.questions.forEach(q => map.set(`${c.id}:${q.id}`, { ...q, _chapterId: c.id, _chapterName: c.name })));
  return map;
}
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
  const key = questionKey(q);
  const h = p.history && p.history[key];
  if (h?.status === 'correct') return 'correct';
  if (h?.status === 'wrong') return 'wrong';
  if (h?.status === 'unanswered') return 'unanswered';
  if (state.set.some(x => questionKey(x) === key) && state.answers[key]) return 'pending';
  if (getUsed().has(key)) return 'used';
  return 'new';
}


function saveCurrentSet() {
  const p = getProgress();
  p.currentSetIds = state.set.map(q => questionKey(q));
  p.currentSetAnswered = state.answered;
  p.currentAnswers = state.answers;
  p.lastScore = state.score;
  saveProgress(p);
}

function restoreCurrentSet() {
  const p = getProgress();
  if (!Array.isArray(p.currentSetIds) || !p.currentSetIds.length) return false;
  const byId = state.mode === 'mixed'
    ? mixedQuestionMap()
    : new Map(state.chapter.data.questions.map(q => [String(q.id), q]));
  const restored = p.currentSetIds.map(id => byId.get(String(id))).filter(Boolean);
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

let iconRefreshTimer = null;
function refreshIcons() {
  const run = () => {
    if (window.lucide?.createIcons) {
      try {
        window.lucide.createIcons({ attrs: { 'aria-hidden': 'true', focusable: 'false' } });
        document.querySelectorAll('[data-lucide]').forEach(el => {
          if (el.tagName.toLowerCase() === 'i') {
            el.setAttribute('aria-hidden', 'true');
          }
        });
        return true;
      } catch (err) {
        console.warn('Icon rendering failed:', err);
      }
    }
    return false;
  };
  if (run()) return;
  clearTimeout(iconRefreshTimer);
  iconRefreshTimer = setTimeout(run, 150);
}

window.addEventListener('load', refreshIcons);

function fillChapters() {
  const select = $('chapterSelect');
  select.innerHTML = state.chapters.map(c => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name)}</option>`).join('');
  select.disabled = state.chapters.length === 0;
  updateChapter();
}

function updateChapter() {
  state.mode = $('modeSelect').value;
  const c = state.chapters.find(x => x.id === $('chapterSelect').value);
  if (state.mode === 'mixed') {
    state.chapter = c || state.chapters[0] || null;
    $('chapterSelect').disabled = true;
    $('sectionSelect').disabled = true;
    $('chapterName').textContent = 'Mixed Practice';
    $('chapterCount').textContent = `${totalQuestions()} questions across ${state.chapters.length} chapters`;
    ensureMixedQueue();
  } else {
    if (!c) return;
    state.chapter = c;
    $('chapterSelect').disabled = false;
    $('sectionSelect').disabled = false;
    const sections = [...new Set((c.data.questions || []).map(q => q.section).filter(Boolean))];
    $('sectionSelect').innerHTML = '<option value="all">All sections</option>' + sections.map(s => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('');
    $('chapterName').textContent = c.name;
    $('chapterCount').textContent = `${c.data.questions.length} questions`;
  }
  updateProgress();
  $('quiz').classList.add('hidden');
  $('empty').classList.remove('hidden');
  $('result').classList.add('hidden');
  state.set = [];
  state.score = null;
  state.answered = false;
  state.answers = {};
  if (!restoreCurrentSet()) $('empty').classList.remove('hidden');
  updateScoreCard();
  refreshIcons();
}

function updateProgress() {
  if (!state.chapters.length) return;
  const used = getUsed();
  const total = state.mode === 'mixed' ? totalQuestions() : state.chapter.data.questions.length;
  const done = Math.min(used.size, total);
  const pct = total ? Math.round(done / total * 100) : 0;
  $('progressText').textContent = `${done} / ${total}`;
  $('progressPercent').textContent = `${pct}%`;
  $('progressBar').style.width = `${pct}%`;
  const label = $('progressPercent').nextElementSibling;
  if (label) label.textContent = state.mode === 'mixed' ? 'mixed progress' : 'chapter progress';
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function pickSet() {
  if (!state.chapters.length) return;
  let pool;
  const used = getUsed();
  if (state.mode === 'mixed') {
    const p = ensureMixedQueue();
    const map = mixedQuestionMap();
    pool = p.mixedQueue.filter(key => !used.has(key)).map(key => map.get(key)).filter(Boolean).slice(0, SET_SIZE);
  } else {
    const section = $('sectionSelect').value;
    pool = state.chapter.data.questions.filter(q => (section === 'all' || q.section === section) && !used.has(String(q.id)));
    pool = shuffle([...pool]).slice(0, SET_SIZE);
  }

  state.set = pool;
  state.score = null;
  state.answered = false;
  state.answers = {};

  state.set.forEach(q => used.add(questionKey(q)));
  const p = getProgress();
  p.usedIds = [...used];
  p.currentSetIds = state.set.map(q => questionKey(q));
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
  $('setLabel').textContent = `${state.mode === 'mixed' ? 'Mixed Practice · Easy → Hard' : state.chapter.name} · ${state.set.length}-question set`;
  updateAnsweredCount();
  $('result').classList.add('hidden');

  $('questionList').innerHTML = state.set.map((q, idx) => {
    const key = questionKey(q);
    const selected = state.answers[key];
    return `<article class="qcard${selected ? ' answered' : ''}" data-q="${escapeHtml(key)}">
      <div class="qtitle"><span class="num">${String(idx+1).padStart(2,'0')}</span><span>Question ${idx+1}</span>${state.mode === 'mixed' ? `<span class="source-chapter">${escapeHtml(q._chapterName)} · #${escapeHtml(q.id)}</span>` : ''}<span class="answered-badge"><i data-lucide="check"></i> Answered</span><span class="source-id">#${q.id}</span></div>
      <div class="question">${md(q.question_markdown)}</div>
      <div class="options">${Object.entries(q.options || {}).map(([k,v]) =>
        `<label class="option${selected === k ? ' selected' : ''}"><input type="radio" name="q${escapeHtml(key)}" value="${escapeHtml(k)}"${selected === k ? ' checked' : ''}><span><b>${escapeHtml(k)}.</b> ${md(v)}</span></label>`
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
  const answered = state.set.filter(q => state.answers[questionKey(q)]).length;
  $('answeredLabel').textContent = `${answered}/${state.set.length} answered`;
  return answered;
}

function handleAnswerChange(event) {
  const input = event.target.closest('input[type=\"radio\"]');
  if (!input || state.answered) return;
  const card = input.closest('.qcard');
  if (!card) return;
  const qKey = card.dataset.q;
  state.answers[qKey] = input.value;
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
    const key = questionKey(q);
    const value = state.answers[key];
    const input = value ? document.querySelector(`[data-q="${CSS.escape(key)}"] input[value="${CSS.escape(value)}"]`) : null;
    revealCard(q, input, true);
  });
  $('result').classList.remove('hidden');
  $('result').innerHTML = `<i data-lucide="trophy"></i><span>Score: <b>${p.lastScore}/${state.set.length}</b> · This set is already checked.</span>`;
  updateScoreCard();
  refreshIcons();
}

function revealCard(q, chosen, saved = false) {
  const card = document.querySelector(`[data-q="${CSS.escape(questionKey(q))}"]`);
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
    const card = document.querySelector(`[data-q="${CSS.escape(questionKey(q))}"]`);
    const chosen = card.querySelector(`input[name="q${CSS.escape(key)}"]:checked`);
    if (chosen) {
      answered++;
      state.answers[key] = chosen.value;
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
    const key = questionKey(q);
    const selected = state.answers[key] || null;
    p.history[key] = {
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
  if (!$('scoreSummary') || !state.chapters.length) return;
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

  const questions = state.mode === 'mixed'
    ? state.chapters.flatMap(c => c.data.questions.map(q => ({ ...q, _chapterId: c.id, _chapterName: c.name })))
    : state.chapter.data.questions;
  $('questionTracker').innerHTML = questions.map(q => {
    const st = getQuestionStatus(q);
    const icon = st === 'correct' ? 'circle-check' : st === 'wrong' ? 'circle-x' : st === 'unanswered' ? 'circle-minus' : st === 'pending' ? 'circle-dot' : st === 'used' ? 'circle' : '';
    const label = state.mode === 'mixed' ? `${q._chapterName} · Question ${q.id}: ${st}` : `Question ${q.id}: ${st}`;
    return `<span class="tracker ${st}" title="${escapeHtml(label)}">${state.mode === 'mixed' ? `${escapeHtml(q._chapterId.slice(0,2).toUpperCase())}-` : ''}${q.id}${icon ? ` <i data-lucide="${icon}"></i>` : ''}</span>`;
  }).join('');

  refreshIcons();
}

function resetProgress() {
  if (!state.chapters.length) return;
  const name = state.mode === 'mixed' ? 'Mixed Practice' : state.chapter.name;
  const ok = confirm(`Reset all progress for ${name}? Questions will become available again.`);
  if (!ok) return;
  localStorage.removeItem(storageKey());
  state.set = [];
  state.score = null;
  state.answered = false;
  state.answers = {};
  $('quiz').classList.add('hidden');
  $('empty').classList.remove('hidden');
  $('empty').innerHTML = `<div class="empty-icon"><i data-lucide="sparkles"></i></div><h2>Ready for a fresh start</h2><p>All ${state.mode === 'mixed' ? 'mixed-practice' : 'chapter'} questions are available again.</p>`;
  if (state.mode === 'mixed') ensureMixedQueue();
  updateProgress();
  updateScoreCard();
  refreshIcons();
}

function bindEvents() {
  $('startBtn').onclick = pickSet;
  $('modeSelect').onchange = updateChapter;
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
