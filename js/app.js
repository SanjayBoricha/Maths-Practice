const SET_SIZE = 25;
const STORAGE_PREFIX = 'ssc-maths-practice:v3:';
const state = { chapters: [], chapter: null, set: [], score: null, answered: false };
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

function saveCurrentSet() {
  const p = getProgress();
  p.currentSetIds = state.set.map(q => q.id);
  p.currentSetAnswered = state.answered;
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
  renderSet();
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

  state.set.forEach(q => used.add(q.id));
  const p = getProgress();
  p.usedIds = [...used];
  p.currentSetIds = state.set.map(q => q.id);
  p.currentSetAnswered = false;
  p.lastScore = null;
  saveProgress(p);

  renderSet();
  updateProgress();
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
  $('answeredLabel').textContent = state.answered ? `${state.set.length} answered` : '0 answered';
  $('result').classList.add('hidden');

  $('questionList').innerHTML = state.set.map((q, idx) => {
    const opts = Object.entries(q.options || {}).map(([k,v]) =>
      `<label class="option"><input type="radio" name="q${q.id}" value="${escapeHtml(k)}"><span><b>${escapeHtml(k)}.</b> ${md(v)}</span></label>`
    ).join('');
    return `<article class="qcard" data-q="${q.id}">
      <div class="qtitle"><span class="num">${String(idx+1).padStart(2,'0')}</span><span>Question ${idx+1}</span><span class="source-id">#${q.id}</span></div>
      <div class="question">${md(q.question_markdown)}</div>
      <div class="options">${opts}</div>
      <div class="explain hidden"></div>
    </article>`;
  }).join('');

  if (state.answered) revealSavedResult();
  renderMath();
  refreshIcons();
  window.scrollTo({ top: 0, behavior: 'smooth' });
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
  state.set.forEach(q => revealCard(q, null, true));
  $('result').classList.remove('hidden');
  $('result').innerHTML = `<i data-lucide="trophy"></i><span>Score: <b>${p.lastScore}/${state.set.length}</b> · This set is already checked.</span>`;
  refreshIcons();
}

function revealCard(q, chosen, saved = false) {
  const card = document.querySelector(`[data-q="${q.id}"]`);
  if (!card) return;
  const labels = [...card.querySelectorAll('.option')];
  labels.forEach(l => l.classList.remove('correct','wrong'));
  if (chosen && chosen.value !== q.answer.option) chosen.closest('.option')?.classList.add('wrong');
  labels.find(l => l.querySelector('input')?.value === q.answer.option)?.classList.add('correct');
  const exp = card.querySelector('.explain');
  exp.classList.remove('hidden');
  exp.innerHTML = `<i data-lucide="badge-check"></i> Correct answer: <b>${escapeHtml(q.answer.option)}. ${md(q.answer.text)}</b>${q.pdf_page ? ` <span>· PDF page ${q.pdf_page}</span>` : ''}`;
  if (saved) card.querySelectorAll('input').forEach(i => i.disabled = true);
}

function check() {
  if (!state.set.length || state.answered) return;
  let score = 0, answered = 0;
  state.set.forEach(q => {
    const card = document.querySelector(`[data-q="${q.id}"]`);
    const chosen = card.querySelector(`input[name="q${q.id}"]:checked`);
    if (chosen) { answered++; if (chosen.value === q.answer.option) score++; }
    revealCard(q, chosen);
    card.querySelectorAll('input').forEach(i => i.disabled = true);
  });
  state.score = score;
  state.answered = true;
  const p = getProgress();
  p.lastScore = score;
  p.currentSetAnswered = true;
  saveProgress(p);
  $('answeredLabel').textContent = `${answered}/${state.set.length} answered`;
  $('result').classList.remove('hidden');
  $('result').innerHTML = `<i data-lucide="trophy"></i><span>Score: <b>${score}/${state.set.length}</b> · Answered: <b>${answered}/${state.set.length}</b></span>`;
  renderMath();
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
  $('quiz').classList.add('hidden');
  $('empty').classList.remove('hidden');
  $('empty').innerHTML = `<div class="empty-icon"><i data-lucide="sparkles"></i></div><h2>Ready for a fresh start</h2><p>All questions in ${escapeHtml(state.chapter.name)} are available again.</p>`;
  updateProgress();
  refreshIcons();
}

$('startBtn').onclick = pickSet;
$('submitBtn').onclick = check;
$('resetBtn').onclick = pickSet;
$('resetProgressBtn').onclick = resetProgress;
$('chapterSelect').onchange = updateChapter;
$('themeBtn').onclick = () => {
  document.body.classList.toggle('dark');
  localStorage.setItem('ssc-theme', document.body.classList.contains('dark') ? 'dark' : 'light');
};

if (localStorage.getItem('ssc-theme') === 'dark') document.body.classList.add('dark');

async function boot() {
  const fallback = window.SSC_EMBEDDED_CHAPTERS || [];
  try {
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
    refreshIcons();
  } catch (e) {
    console.error('SSC Maths Practice boot error:', e);
    $('empty').innerHTML = `<div class="empty-icon"><i data-lucide="triangle-alert"></i></div><h2>Could not load the chapter data</h2><p>The site loaded, but no chapter data was available. Try refreshing the page.</p><small>${escapeHtml(e.message)}</small>`;
    $('empty').classList.remove('hidden');
    refreshIcons();
  }
}

boot();
