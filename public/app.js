let charts = {};

function pass(){ return document.getElementById('adminPassword').value || '123456'; }
async function api(url, options={}){
  const res = await fetch(url, { ...options, headers: { 'Content-Type':'application/json', 'x-admin-password': pass(), ...(options.headers||{}) }});
  if(!res.ok) throw new Error((await res.json()).error || 'Erro');
  return res.json();
}

function seconds(s){
  s = Number(s||0);
  if(s < 60) return s+'s';
  const m = Math.floor(s/60); const sec = s%60;
  return `${m}m ${sec}s`;
}

document.querySelectorAll('.nav').forEach(btn=>{
  btn.onclick=()=>{
    document.querySelectorAll('.nav').forEach(b=>b.classList.remove('active'));
    document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(btn.dataset.tab).classList.add('active');
  };
});

document.getElementById('siteFilter').onchange = () => { updateTrackerCode(); loadDashboard(); };
document.getElementById('periodFilter').onchange = loadDashboard;

async function loadSites(){
  const sites = await api('/api/sites');
  const select = document.getElementById('siteFilter');
  const current = select.value;
  select.innerHTML = '<option value="all">Todos os sites</option>' + sites.map(s=>`<option value="${s.id}">${s.name}</option>`).join('');
  if([...select.options].some(o=>o.value===current)) select.value=current;
  const list = document.getElementById('sitesList');
  list.innerHTML = sites.length ? sites.map(s=>`
    <div class="row">
      <div><strong>${s.name}</strong><div class="muted">${s.domain}</div></div>
      <div><span class="badge">ID: ${s.id.slice(0,8)}</span></div>
      <div class="muted">${new Date(s.createdAt).toLocaleString('pt-BR')}</div>
      <button onclick="deleteSite('${s.id}')">Excluir</button>
    </div>`).join('') : '<div class="muted">Nenhum site cadastrado ainda.</div>';
  updateTrackerCode();
}

async function addSite(){
  const name = document.getElementById('siteName').value.trim();
  const domain = document.getElementById('siteDomain').value.trim();
  if(!name || !domain) return alert('Preencha nome e domínio.');
  await api('/api/sites', { method:'POST', body: JSON.stringify({ name, domain }) });
  document.getElementById('siteName').value=''; document.getElementById('siteDomain').value='';
  await loadSites(); await loadDashboard();
}

async function deleteSite(id){
  if(!confirm('Excluir site e dados dele?')) return;
  await api('/api/sites/'+id, { method:'DELETE' });
  await loadSites(); await loadDashboard();
}

function updateTrackerCode(){
  const siteId = document.getElementById('siteFilter').value;
  const origin = location.origin;
  const code = siteId === 'all' ? 'Selecione um site específico no filtro para gerar o código.' : `<script src="${origin}/tracker.js" data-site-id="${siteId}" data-api="${origin}"></script>`;
  document.getElementById('trackerCode').value = code;
}

async function loadDashboard(){
  const siteId = document.getElementById('siteFilter').value || 'all';
  const period = document.getElementById('periodFilter').value || '24h';
  const data = await api(`/api/summary?siteId=${siteId}&period=${period}`);
  document.getElementById('mPageviews').textContent = data.totals.pageviews;
  document.getElementById('mSessions').textContent = data.totals.sessions;
  document.getElementById('mVisitors').textContent = data.totals.uniqueVisitors;
  document.getElementById('mDuration').textContent = seconds(data.totals.avgDuration);
  document.getElementById('mLive').textContent = data.totals.liveNow;

  renderLine('visitsChart', data.timeline.map(x=>x.label), data.timeline.map(x=>x.views), 'Pageviews');
  renderBar('refsChart', data.referrers.map(x=>x.source), data.referrers.map(x=>x.views), 'Visitas');

  document.getElementById('topPages').innerHTML = data.topPages.length ? data.topPages.map(p=>`
    <div class="row simple"><div><strong>${p.path}</strong></div><div><span class="badge">${p.views} views</span></div></div>`).join('') : '<div class="muted">Sem dados ainda.</div>';
  document.getElementById('liveList').innerHTML = data.live.length ? data.live.map(v=>`
    <div class="row liveRow"><div><strong>${v.currentPage}</strong><div class="muted">${v.title || 'Sem título'}</div></div><div>Visitante: ${v.ipHash}</div><div class="muted">${new Date(v.lastSeen).toLocaleTimeString('pt-BR')}</div></div>`).join('') : '<div class="muted">Nenhum visitante online agora.</div>';
}

function renderLine(id, labels, values, label){
  if(charts[id]) charts[id].destroy();
  charts[id] = new Chart(document.getElementById(id), { type:'line', data:{ labels, datasets:[{ label, data: values, tension:.35, fill:true }] }, options:{ responsive:true, plugins:{legend:{display:false}}, scales:{ y:{ beginAtZero:true } } } });
}
function renderBar(id, labels, values, label){
  if(charts[id]) charts[id].destroy();
  charts[id] = new Chart(document.getElementById(id), { type:'bar', data:{ labels, datasets:[{ label, data: values }] }, options:{ responsive:true, plugins:{legend:{display:false}}, scales:{ y:{ beginAtZero:true } } } });
}

async function clearData(){
  if(!confirm('Limpar todos os dados de visitas?')) return;
  await api('/api/clear', { method:'POST' });
  await loadDashboard();
}

function copyTracker(){
  navigator.clipboard.writeText(document.getElementById('trackerCode').value);
  alert('Código copiado!');
}

function exportData(e){
  e.preventDefault();
  window.open('/api/export?password=' + encodeURIComponent(pass()), '_blank');
}

(async function init(){
  try{ await loadSites(); await loadDashboard(); setInterval(loadDashboard, 5000); }catch(e){ alert(e.message); }
})();
