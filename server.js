const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 4000;
const HOST = '0.0.0.0';
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DB_FILE = process.env.DB_FILE || path.join(DATA_DIR, 'db.json');
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '123456';
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '*').split(',').map(v => v.trim()).filter(Boolean);

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

app.set('trust proxy', true);

app.use(cors({
  origin(origin, callback) {
    if (!origin || ALLOWED_ORIGINS.includes('*') || ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    return callback(null, false);
  }
}));

// 🔥 ÚNICA ALTERAÇÃO (resolve CORS)
app.options("*", cors());

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

function readDB() {
  try {
    if (!fs.existsSync(DB_FILE)) {
      return { sites: [], events: [], sessions: [], live: [], settings: { adminPassword: ADMIN_PASSWORD } };
    }
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch (err) {
    console.error('Erro lendo DB:', err.message);
    return { sites: [], events: [], sessions: [], live: [], settings: { adminPassword: ADMIN_PASSWORD } };
  }
}

function writeDB(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

function cleanOldLive(db) {
  const now = Date.now();
  db.live = db.live.filter(v => now - new Date(v.lastSeen).getTime() < 45000);
}

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.socket.remoteAddress || '';
}

function hashIp(ip) {
  return crypto.createHash('sha256').update(ip + 'ztr-salt').digest('hex').slice(0, 16);
}

function todayStart() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function msToSeconds(ms) {
  return Math.max(0, Math.round(ms / 1000));
}

function auth(req, res, next) {
  const pass = req.headers['x-admin-password'] || req.query.password;
  const db = readDB();
  const currentPassword = process.env.ADMIN_PASSWORD || db.settings.adminPassword || '123456';
  if (pass !== currentPassword) {
    return res.status(401).json({ error: 'Senha admin incorreta' });
  }
  next();
}

app.get('/tracker.js', (req, res) => {
  res.type('application/javascript');
  res.send(`
(function(){
  var script = document.currentScript;
  var siteId = script && script.getAttribute('data-site-id');
  var api = script && script.getAttribute('data-api');
  if(!api){ api = window.location.origin; }
  if(!siteId){ console.warn('ZTR Analytics: data-site-id faltando'); return; }

  var sessionKey = 'ztr_analytics_session_' + siteId;
  var sessionId = localStorage.getItem(sessionKey);
  if(!sessionId){
    sessionId = (crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now()) + Math.random();
    localStorage.setItem(sessionKey, sessionId);
  }

  var startedAt = Date.now();
  var lastPing = Date.now();
  var maxScroll = 0;

  function send(type, extra){
    try{
      var payload = Object.assign({
        siteId: siteId,
        sessionId: sessionId,
        type: type,
        url: location.href,
        path: location.pathname,
        title: document.title,
        referrer: document.referrer,
        userAgent: navigator.userAgent,
        language: navigator.language,
        screen: window.screen ? (screen.width + 'x' + screen.height) : '',
        duration: Math.round((Date.now() - startedAt) / 1000),
        maxScroll: maxScroll,
        timestamp: new Date().toISOString()
      }, extra || {});

      if(navigator.sendBeacon && type === 'leave'){
        var blob = new Blob([JSON.stringify(payload)], {type: 'application/json'});
        navigator.sendBeacon(api + '/api/track', blob);
      } else {
        fetch(api + '/api/track', {
          method: 'POST',
          headers: {'Content-Type':'application/json'},
          body: JSON.stringify(payload),
          keepalive: true
        }).catch(function(){});
      }
    }catch(e){}
  }

  function ping(){
    lastPing = Date.now();
    send('ping');
  }

  window.addEventListener('scroll', function(){
    var doc = document.documentElement;
    var height = Math.max(doc.scrollHeight - window.innerHeight, 1);
    var scrolled = Math.round((window.scrollY / height) * 100);
    if(scrolled > maxScroll) maxScroll = Math.min(scrolled, 100);
  }, {passive:true});

  send('pageview');
  setInterval(ping, 15000);
  window.addEventListener('beforeunload', function(){ send('leave'); });
})();`);
});

app.post('/api/track', (req, res) => {
  const db = readDB();
  const event = req.body || {};
  if (!event.siteId || !event.sessionId) return res.status(400).json({ error: 'siteId/sessionId faltando' });

  const site = db.sites.find(s => s.id === event.siteId);
  if (!site) return res.status(404).json({ error: 'Site nao encontrado' });

  const ipHash = hashIp(getClientIp(req));
  const now = new Date().toISOString();
  const saved = {
    id: uuidv4(),
    siteId: event.siteId,
    sessionId: event.sessionId,
    type: event.type || 'event',
    url: event.url || '',
    path: event.path || '/',
    title: event.title || '',
    referrer: event.referrer || '',
    userAgent: event.userAgent || '',
    language: event.language || '',
    screen: event.screen || '',
    duration: Number(event.duration || 0),
    maxScroll: Number(event.maxScroll || 0),
    ipHash,
    timestamp: now
  };

  db.events.push(saved);

  let session = db.sessions.find(s => s.siteId === event.siteId && s.sessionId === event.sessionId);
  if (!session) {
    session = {
      id: uuidv4(), siteId: event.siteId, sessionId: event.sessionId, ipHash,
      firstSeen: now, lastSeen: now, pages: [], duration: 0, referrer: event.referrer || '', userAgent: event.userAgent || ''
    };
    db.sessions.push(session);
  }
  session.lastSeen = now;
  session.duration = Math.max(session.duration || 0, Number(event.duration || 0));
  if (event.type === 'pageview' && !session.pages.includes(saved.path)) session.pages.push(saved.path);

  cleanOldLive(db);
  let live = db.live.find(v => v.siteId === event.siteId && v.sessionId === event.sessionId);
  if (!live) {
    live = { siteId: event.siteId, sessionId: event.sessionId, ipHash, currentPage: saved.path, title: saved.title, lastSeen: now };
    db.live.push(live);
  }
  live.currentPage = saved.path;
  live.title = saved.title;
  live.lastSeen = now;

  if (db.events.length > 10000) db.events = db.events.slice(-10000);
  writeDB(db);
  res.json({ ok: true });
});

app.get('/api/summary', auth, (req, res) => {
  const db = readDB();
  cleanOldLive(db);
  writeDB(db);
  const siteId = req.query.siteId || 'all';
  const since = req.query.period === '7d' ? Date.now() - 7*24*60*60*1000 : Date.now() - 24*60*60*1000;
  const events = db.events.filter(e => (siteId === 'all' || e.siteId === siteId) && new Date(e.timestamp).getTime() >= since);
  const pageviews = events.filter(e => e.type === 'pageview');
  const sessions = db.sessions.filter(s => (siteId === 'all' || s.siteId === siteId) && new Date(s.lastSeen).getTime() >= since);
  const uniqueVisitors = new Set(sessions.map(s => s.ipHash)).size;
  const avgDuration = sessions.length ? Math.round(sessions.reduce((a,s)=>a+(s.duration||0),0)/sessions.length) : 0;
  const liveNow = db.live.filter(v => siteId === 'all' || v.siteId === siteId).length;

  const pageMap = {};
  for (const e of pageviews) {
    pageMap[e.path] = (pageMap[e.path] || 0) + 1;
  }
  const topPages = Object.entries(pageMap).map(([path, views]) => ({ path, views })).sort((a,b)=>b.views-a.views).slice(0,10);

  const refMap = {};
  for (const e of pageviews) {
    const ref = e.referrer ? new URLSafeHost(e.referrer) : 'Direto';
    refMap[ref] = (refMap[ref] || 0) + 1;
  }
  const referrers = Object.entries(refMap).map(([source, views]) => ({ source, views })).sort((a,b)=>b.views-a.views).slice(0,10);

  const timeline = [];
  const buckets = req.query.period === '7d' ? 7 : 24;
  for (let i = buckets - 1; i >= 0; i--) {
    const d = new Date(Date.now() - (req.query.period === '7d' ? i*24*60*60*1000 : i*60*60*1000));
    const label = req.query.period === '7d' ? d.toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit' }) : d.getHours().toString().padStart(2,'0') + 'h';
    const start = req.query.period === '7d' ? new Date(d.setHours(0,0,0,0)).getTime() : new Date(d.setMinutes(0,0,0)).getTime();
    const end = start + (req.query.period === '7d' ? 24*60*60*1000 : 60*60*1000);
    const count = pageviews.filter(e => {
      const t = new Date(e.timestamp).getTime();
      return t >= start && t < end;
    }).length;
    timeline.push({ label, views: count });
  }

  res.json({
    sites: db.sites,
    totals: { pageviews: pageviews.length, sessions: sessions.length, uniqueVisitors, avgDuration, liveNow },
    topPages,
    referrers,
    timeline,
    live: db.live.filter(v => siteId === 'all' || v.siteId === siteId).slice(-30).reverse()
  });
});

function URLSafeHost(url) {
  try { return new URL(url).hostname; } catch { return url.slice(0, 40); }
}

app.get('/api/sites', auth, (req, res) => {
  const db = readDB();
  res.json(db.sites);
});

app.post('/api/sites', auth, (req, res) => {
  const db = readDB();
  const { name, domain } = req.body;
  if (!name || !domain) return res.status(400).json({ error: 'Nome e dominio sao obrigatorios' });
  const site = { id: uuidv4(), name, domain, createdAt: new Date().toISOString() };
  db.sites.push(site);
  writeDB(db);
  res.json(site);
});

app.delete('/api/sites/:id', auth, (req, res) => {
  const db = readDB();
  db.sites = db.sites.filter(s => s.id !== req.params.id);
  db.events = db.events.filter(e => e.siteId !== req.params.id);
  db.sessions = db.sessions.filter(s => s.siteId !== req.params.id);
  db.live = db.live.filter(v => v.siteId !== req.params.id);
  writeDB(db);
  res.json({ ok: true });
});

app.post('/api/clear', auth, (req, res) => {
  const db = readDB();
  db.events = [];
  db.sessions = [];
  db.live = [];
  writeDB(db);
  res.json({ ok: true });
});

app.get('/api/export', auth, (req, res) => {
  const db = readDB();
  res.setHeader('Content-Disposition', 'attachment; filename=ztr-analytics-export.json');
  res.json(db);
});

app.get('/health', (req, res) => {
  res.json({ ok: true, service: 'ZTR Analytics', time: new Date().toISOString() });
});

app.listen(PORT, HOST, () => {
  console.log('ZTR Analytics rodando na porta ' + PORT);
  console.log('Local: http://localhost:' + PORT);
  if (process.env.RENDER_EXTERNAL_URL) console.log('Render: ' + process.env.RENDER_EXTERNAL_URL);
});