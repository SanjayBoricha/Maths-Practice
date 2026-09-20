const state={chapters:[],questions:[],set:[],chapter:null,score:null,answered:false};
const $=id=>document.getElementById(id);
function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function md(s){
  s=escapeHtml(s);
  // Render a small Markdown subset plus LaTeX delimiters as readable math text.
  s=s.replace(/\$([^$]+)\$/g,'<span class="math">$1</span>');
  s=s.replace(/`([^`]+)`/g,'<code>$1</code>');
  s=s.replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>');
  s=s.replace(/\*([^*]+)\*/g,'<em>$1</em>');
  return s.replace(/\n/g,'<br>');
}
async function loadChapter(meta){const r=await fetch('data/'+meta.file,{cache:'no-cache'});return await r.json();}
function fillChapters(){
 $('chapterSelect').innerHTML=state.chapters.map(c=>`<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
 updateChapter();
}
function updateChapter(){
 const c=state.chapters.find(x=>x.id===$('chapterSelect').value); state.chapter=c;
 const sec=[...new Set((c.data.questions||[]).map(q=>q.section).filter(Boolean))];
 $('sectionSelect').innerHTML='<option value="all">All sections</option>'+sec.map(s=>`<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('');
 $('chapterName').textContent=c.name; $('chapterCount').textContent=`${c.data.questions.length} questions`;
 updateProgress();
}
function key(){return `ssc-practice:${state.chapter.id}:used`;}
function getUsed(){try{return new Set(JSON.parse(localStorage.getItem(key())||'[]'));}catch{return new Set();}}
function updateProgress(){if(!state.chapter)return;const used=getUsed();const n=state.chapter.data.questions.length;const done=Math.min(used.size,n);$('progressText').textContent=`${done} / ${n}`;}
function pickSet(){
 const n=+$('sizeSelect').value, mode=$('modeSelect').value, sec=$('sectionSelect').value;
 let pool=state.chapter.data.questions.filter(q=>sec==='all'||q.section===sec);
 const used=getUsed();
 if(mode==='continue') pool=pool.filter(q=>!used.has(q.id));
 if(mode==='random') pool=pool.filter(q=>!used.has(q.id));
 pool=[...pool];
 for(let i=pool.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[pool[i],pool[j]]=[pool[j],pool[i]];}
 if(mode==='continue') pool.sort((a,b)=>a.id-b.id);
 if(mode==='random') pool=pool.slice(0,n);
 if(mode==='continue') pool=pool.slice(0,n);
 if(mode==='all') pool=pool.slice(0,n);
 state.set=pool; state.score=null; state.answered=false;
 renderSet();
}
function renderSet(){
 $('empty').classList.add('hidden');$('quiz').classList.remove('hidden');
 $('setLabel').textContent=`${state.chapter.name} · ${state.set.length}-question set`;
 $('scoreText').textContent='—';
 $('questionList').innerHTML=state.set.map((q,idx)=>{
   const opts=Object.entries(q.options).map(([k,v])=>`<label class="option"><input type="radio" name="q${q.id}" value="${k}"><span><b>${k}.</b> ${md(v)}</span></label>`).join('');
   return `<article class="qcard" data-q="${q.id}"><div class="qtitle"><span class="num">Q${q.id}</span></div><div class="question">${md(q.question_markdown)}</div><div class="options">${opts}</div><div class="explain hidden"></div></article>`;
 }).join('');
 window.scrollTo({top:0,behavior:'smooth'});
}
function check(){
 if(!state.set.length)return; let score=0,answered=0;const used=getUsed();
 state.set.forEach(q=>{const card=document.querySelector(`[data-q="${q.id}"]`);const chosen=card.querySelector(`input[name="q${q.id}"]:checked`);const labels=[...card.querySelectorAll('.option')];labels.forEach(l=>l.classList.remove('correct','wrong'));const exp=card.querySelector('.explain');
   if(chosen){answered++; if(chosen.value===q.answer.option){score++;labels.find(l=>l.querySelector('input').value===q.answer.option)?.classList.add('correct');}else{chosen.closest('.option').classList.add('wrong');labels.find(l=>l.querySelector('input').value===q.answer.option)?.classList.add('correct');}}
   else labels.find(l=>l.querySelector('input').value===q.answer.option)?.classList.add('correct');
   exp.classList.remove('hidden');exp.innerHTML=`Correct answer: <b>${q.answer.option}. ${md(q.answer.text)}</b>${q.pdf_page?` · PDF page ${q.pdf_page}`:''}`;
   used.add(q.id);
 });
 localStorage.setItem(key(),JSON.stringify([...used]));state.score=score;state.answered=true;$('scoreText').textContent=`${score} / ${state.set.length}`;$('result').classList.remove('hidden');$('result').textContent=`Score: ${score}/${state.set.length} · Answered: ${answered}/${state.set.length}`;updateProgress();
}
$('startBtn').onclick=pickSet;$('submitBtn').onclick=check;$('resetBtn').onclick=pickSet;$('chapterSelect').onchange=updateChapter;
$('themeBtn').onclick=()=>document.body.classList.toggle('dark');
$('fileInput').onchange=async e=>{for(const file of e.target.files){try{const data=JSON.parse(await file.text());if(!data.questions)continue;const id=data.chapter_id||file.name.replace(/\.json$/i,'').toLowerCase().replace(/[^a-z0-9]+/g,'-');state.chapters.push({id,name:data.chapter_name||file.name,data});}catch(err){alert(`Could not import ${file.name}: ${err.message}`);}}fillChapters();};
(async()=>{try{const m=await (await fetch('data/manifest.json')).json();state.chapters=await Promise.all(m.chapters.map(async x=>({id:x.id,name:x.name,data:await loadChapter(x)})));fillChapters();}catch(e){$('empty').classList.remove('hidden');$('empty').innerHTML='<h2>Could not load the static chapter manifest</h2><p>Run this site from a local web server rather than file://, or import JSON files above.</p>';}})();