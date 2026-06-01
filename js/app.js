/* =============================================
   FINANÇAS DO CASAL — app.js
   Supabase Realtime + Anthropic Claude AI
   ============================================= */

const App = (() => {

  /* ───── CONFIG ───── */
  const CAT_COLORS = {
    Moradia: '#7eb8f5',
    Mercado: '#5ee7b0',
    Alimentação: '#fbbf24',
    Transporte: '#f97316',
    Saúde: '#ec4899',
    Lazer: '#a78bfa',
    Educação: '#34d399',
    Serviços: '#94a3b8',
    Salário: '#86efac',
    Outros: '#64748b'
  };

  /* ───── STATE ───── */
  let curDate = new Date();
  let tipo = 'despesa';
  let pieInst = null;
  let barInst = null;
  let cfg = {};
  let db = { txs: {}, orcamentos: [], contas_fixas: [], metas: [] };
  let sbClient = null;
  let realtimeChannel = null;
  let importState = { txns: [], selected: new Set() };

  /* ───── LOCAL STORAGE ───── */
  function loadCfg() {
    try { cfg = JSON.parse(localStorage.getItem('casal_cfg') || '{}'); } catch { cfg = {}; }
  }

  function saveCfg() {
    localStorage.setItem('casal_cfg', JSON.stringify(cfg));
  }

  function localDB(k, def) {
    try { const v = localStorage.getItem('casal_db_' + k); return v ? JSON.parse(v) : def; } catch { return def; }
  }

  function saveLocalDB(k, v) {
    localStorage.setItem('casal_db_' + k, JSON.stringify(v));
  }

  /* ───── SUPABASE ───── */
  function initSupabase() {
    if (!cfg.supabaseUrl || !cfg.supabaseKey) return false;
    try {
      sbClient = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey);
      return true;
    } catch { return false; }
  }

  /* ───── SYNC STATUS ───── */
  function setSyncStatus(st) {
    const el = document.getElementById('sync-status');
    if (!el) return;
    el.className = 'sync-dot ' + st;
    el.title = { synced: 'Sincronizado', syncing: 'Sincronizando...', offline: 'Sem conexão', local: 'Modo local' }[st] || '';
  }

  /* ───── LOAD DATA ───── */
  async function loadAllFromSupabase() {
    if (!sbClient || !cfg.casalId) return;
    setSyncStatus('syncing');
    try {
      const [txRes, cfgRes] = await Promise.all([
        sbClient.from('transacoes').select('*').eq('casal_id', cfg.casalId),
        sbClient.from('configs').select('*').eq('casal_id', cfg.casalId)
      ]);
      if (txRes.error || cfgRes.error) { setSyncStatus('offline'); return; }
      db.txs = {};
      (txRes.data || []).forEach(t => {
        db.txs[t.id] = {
          id: t.id, tipo: t.tipo, val: parseFloat(t.val),
          desc: t.descricao, data: t.data,
          cat: t.cat, pessoa: t.pessoa,
          aiImport: t.ai_import
        };
      });
      (cfgRes.data || []).forEach(c => {
        if (c.chave === 'orcamentos' || c.chave === 'contas_fixas' || c.chave === 'metas') {
          db[c.chave] = c.valor || [];
        }
      });
      setSyncStatus('synced');
    } catch { setSyncStatus('offline'); }
    checkContasVencendo();
    render();
  }

  /* ───── REALTIME ───── */
  function subscribeRealtime() {
    if (!sbClient || !cfg.casalId) return;
    if (realtimeChannel) { sbClient.removeChannel(realtimeChannel); realtimeChannel = null; }
    realtimeChannel = sbClient
      .channel('casal-' + cfg.casalId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transacoes', filter: 'casal_id=eq.' + cfg.casalId }, () => loadAllFromSupabase())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'configs', filter: 'casal_id=eq.' + cfg.casalId }, () => loadAllFromSupabase())
      .subscribe();
  }

  /* ───── PUSH / REMOVE ───── */
  async function pushTx(tx) {
    if (!sbClient || !cfg.casalId) {
      db.txs[tx.id] = tx;
      saveLocalDB('txs', db.txs);
      return true;
    }
    setSyncStatus('syncing');
    try {
      let userEmail;
      try {
        const { data: { session } } = await sbClient.auth.getSession();
        userEmail = session?.user?.email;
      } catch {}
      const res = await fetch('/api/add-transaction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: tx.id, casalId: cfg.casalId,
          tipo: tx.tipo, val: tx.val,
          descricao: tx.desc, data: tx.data,
          cat: tx.cat, pessoa: tx.pessoa,
          aiImport: tx.aiImport || false,
          userEmail,
          userNomeEla: cfg.nomeEla,
          userNomeEle: cfg.nomeEle,
          userNome: cfg.nome
        })
      });
      const result = await res.json();
      if (!res.ok) {
        setSyncStatus('offline');
        if (result.error === 'limite_plano') {
          mostrarToast(result.message);
          abrirUpgrade();
        } else {
          mostrarToast('Erro ao salvar lançamento. Tente novamente.');
        }
        return false;
      }
      db.txs[tx.id] = tx;
      setSyncStatus('synced');
      return true;
    } catch {
      setSyncStatus('offline');
      mostrarToast('Erro de conexão. Tente novamente.');
      return false;
    }
  }

  async function removeTx(id) {
    delete db.txs[id];
    if (!sbClient || !cfg.casalId) { saveLocalDB('txs', db.txs); return; }
    setSyncStatus('syncing');
    const { error } = await sbClient.from('transacoes').delete().eq('id', id).eq('casal_id', cfg.casalId);
    setSyncStatus(error ? 'offline' : 'synced');
  }

  async function pushConfig(key, value) {
    db[key] = value;
    if (!sbClient || !cfg.casalId) { saveLocalDB(key, value); return; }
    setSyncStatus('syncing');
    const { error } = await sbClient.from('configs').upsert({ casal_id: cfg.casalId, chave: key, valor: value });
    setSyncStatus(error ? 'offline' : 'synced');
  }

  /* ───── SETUP ───── */
  function generateId() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  }

  function gerarCasalId() {
    document.getElementById('setup-casal-id').value = generateId();
  }

  const SQL_SETUP = `-- Execute no SQL Editor do Supabase (supabase.com/dashboard → SQL Editor)

create table if not exists transacoes (
  id bigint primary key,
  casal_id text not null,
  tipo text not null,
  val numeric(12,2) not null,
  descricao text not null,
  data date not null,
  cat text not null,
  pessoa text not null,
  ai_import boolean default false,
  created_at timestamptz default now()
);

create table if not exists configs (
  casal_id text not null,
  chave text not null,
  valor jsonb,
  primary key (casal_id, chave)
);

alter table transacoes enable row level security;
alter table configs enable row level security;

create policy "anon_transacoes" on transacoes for all to anon using (true) with check (true);
create policy "anon_configs" on configs for all to anon using (true) with check (true);

alter publication supabase_realtime add table transacoes;
alter publication supabase_realtime add table configs;`;

  async function copiarSQL() {
    try {
      await navigator.clipboard.writeText(SQL_SETUP);
      const btn = document.querySelector('[onclick="App.copiarSQL()"]');
      if (btn) { const orig = btn.textContent; btn.textContent = 'Copiado!'; setTimeout(() => btn.textContent = orig, 2000); }
    } catch { alert(SQL_SETUP); }
  }

  async function copiarCasalId() {
    const val = document.getElementById('setup-casal-id').value;
    if (!val) { alert('Gere um ID primeiro'); return; }
    try {
      await navigator.clipboard.writeText(val);
      const btn = document.querySelector('[onclick="App.copiarCasalId()"]');
      if (btn) { const orig = btn.textContent; btn.textContent = 'Copiado!'; setTimeout(() => btn.textContent = orig, 1500); }
    } catch { alert('ID: ' + val); }
  }

  function getNomeEla() { return cfg.nomeEla || 'Ela'; }
  function getNomeEle() { return cfg.nomeEle || 'Ele'; }

  function updatePessoaSelects() {
    const opts = `<option>Os dois</option><option>${getNomeEla()}</option><option>${getNomeEle()}</option>`;
    ['f-pess', 'ai-pessoa'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = opts;
    });
  }

  function setup() {
    const url = document.getElementById('setup-supabase-url').value.trim();
    const key = document.getElementById('setup-supabase-key').value.trim();
    const casalId = document.getElementById('setup-casal-id').value.trim();
    const nome = document.getElementById('setup-nome').value.trim();
    const nomeEla = document.getElementById('setup-nome-ela').value.trim();
    const nomeEle = document.getElementById('setup-nome-ele').value.trim();

    if (!url) { alert('Informe a URL do projeto Supabase.'); return; }
    if (!url.startsWith('https://')) { alert('URL deve começar com https://'); return; }
    if (!key) { alert('Informe a chave anon do Supabase.'); return; }
    if (!casalId) { alert('Gere ou cole o ID do casal.'); return; }

    cfg = { supabaseUrl: url, supabaseKey: key, casalId, nome: nome || 'Finanças do Casal', nomeEla, nomeEle };
    saveCfg();
    initApp();
  }

  function setupLocal() {
    cfg = { nome: 'Finanças do Casal', local: true };
    saveCfg();
    db.txs = localDB('txs', {});
    db.orcamentos = localDB('orcamentos', []);
    db.contas_fixas = localDB('contas_fixas', []);
    db.metas = localDB('metas', []);
    initApp();
  }

  function initApp() {
    document.getElementById('setup-screen').style.display = 'none';
    document.getElementById('app').style.display = 'flex';
    document.getElementById('header-nome').textContent = cfg.nome || 'Finanças do Casal';
    document.getElementById('f-data').value = today();
    updatePessoaSelects();

    if (cfg.local) {
      setSyncStatus('local');
    } else if (initSupabase()) {
      setSyncStatus('syncing');
      loadAllFromSupabase().then(() => subscribeRealtime());
      checkAssinatura();
    } else {
      setSyncStatus('offline');
    }
    render();
  }

  function today() {
    return new Date().toISOString().split('T')[0];
  }

  /* ───── NAVIGATION ───── */
  function navTo(id) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('pg-' + id).classList.add('active');
    document.querySelector('[data-page="' + id + '"]').classList.add('active');
    render();
  }

  function setTipo(t) {
    tipo = t;
    document.getElementById('tbtn-d').className = 'type-btn' + (t === 'despesa' ? ' active despesa' : '');
    document.getElementById('tbtn-r').className = 'type-btn' + (t === 'receita' ? ' active receita' : '');
    const btn = document.getElementById('add-btn');
    btn.textContent = 'Adicionar ' + t;
    btn.style.background = t === 'receita' ? '#5ee7b0' : '';
  }

  function changeMonth(d) {
    curDate = new Date(curDate.getFullYear(), curDate.getMonth() + d, 1);
    render();
  }

  /* ───── HELPERS ───── */
  function mkey(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  }

  function mfmt(d) {
    const months = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
    return months[d.getMonth()] + ' ' + d.getFullYear();
  }

  function brl(v) {
    return 'R$ ' + parseFloat(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function monthTxs() {
    const mk = mkey(curDate);
    return Object.values(db.txs)
      .filter(t => t.data && t.data.startsWith(mk))
      .sort((a, b) => b.data.localeCompare(a.data));
  }

  /* ───── LANÇAMENTO ───── */
  async function addLancamento(data) {
    const tx = data || {
      tipo,
      val: parseFloat(document.getElementById('f-val').value),
      desc: document.getElementById('f-desc').value.trim(),
      data: document.getElementById('f-data').value,
      cat: document.getElementById('f-cat').value,
      pessoa: document.getElementById('f-pess').value
    };
    if (!tx.val || tx.val <= 0) { alert('Informe um valor válido'); return; }
    if (!tx.desc) { alert('Informe uma descrição'); return; }
    if (!tx.data) { alert('Informe a data'); return; }
    tx.id = Date.now();
    const ok = await pushTx(tx);
    if (!ok) return;
    document.getElementById('f-val').value = '';
    document.getElementById('f-desc').value = '';
    navTo('resumo');
  }

  async function deleteTx(id) {
    if (!confirm('Remover este lançamento?')) return;
    await removeTx(id);
    render();
  }

  /* ───── ORÇAMENTOS ───── */
  async function addOrcamento() {
    const cat = document.getElementById('orc-cat').value;
    const val = parseFloat(document.getElementById('orc-val').value);
    if (!val || val <= 0) { alert('Informe um valor'); return; }
    const arr = db.orcamentos.filter(o => o.cat !== cat);
    arr.push({ cat, val });
    await pushConfig('orcamentos', arr);
    document.getElementById('orc-val').value = '';
    render();
  }

  async function deleteOrcamento(cat) {
    await pushConfig('orcamentos', db.orcamentos.filter(o => o.cat !== cat));
    render();
  }

  /* ───── CONTAS FIXAS ───── */
  async function addContaFixa() {
    const nome = document.getElementById('cf-nome').value.trim();
    const val = parseFloat(document.getElementById('cf-val').value);
    const dia = parseInt(document.getElementById('cf-dia').value) || 1;
    if (!nome) { alert('Informe o nome da conta'); return; }
    if (!val || val <= 0) { alert('Informe o valor'); return; }
    const arr = db.contas_fixas || [];
    arr.push({ id: Date.now(), nome, val, dia, pago: [] });
    await pushConfig('contas_fixas', arr);
    document.getElementById('cf-nome').value = '';
    document.getElementById('cf-val').value = '';
    document.getElementById('cf-dia').value = '';
    render();
  }

  async function toggleContaFixa(id) {
    const mk = mkey(curDate);
    const arr = db.contas_fixas || [];
    const cf = arr.find(c => c.id === id);
    if (!cf) return;
    if (!cf.pago) cf.pago = [];
    if (cf.pago.includes(mk)) cf.pago = cf.pago.filter(m => m !== mk);
    else cf.pago.push(mk);
    await pushConfig('contas_fixas', arr);
    render();
  }

  async function deleteContaFixa(id) {
    if (!confirm('Remover esta conta fixa?')) return;
    await pushConfig('contas_fixas', (db.contas_fixas || []).filter(c => c.id !== id));
    render();
  }

  /* ───── COMPROVANTE / AI ───── */
  async function readComprovante(inp) {
    const file = inp.files[0];
    if (!file) return;

    document.getElementById('ai-loading').style.display = 'flex';
    document.getElementById('ai-result').style.display = 'none';
    document.getElementById('no-ai-key').style.display = 'none';

    const reader = new FileReader();
    reader.onload = async (e) => {
      const b64 = e.target.result.split(',')[1];
      const mt = file.type || 'image/jpeg';
      try {
        const res = await fetch('/api/read-comprovante', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageBase64: b64, mediaType: mt, today: today() })
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || res.statusText);
        }
        const parsed = await res.json();
        document.getElementById('ai-desc').value = parsed.descricao || '';
        document.getElementById('ai-val').value = parsed.valor || '';
        document.getElementById('ai-data').value = parsed.data || today();
        if (parsed.categoria) document.getElementById('ai-cat').value = parsed.categoria;
        document.getElementById('ai-loading').style.display = 'none';
        document.getElementById('ai-result').style.display = 'block';
      } catch {
        document.getElementById('ai-loading').style.display = 'none';
        alert('Erro ao processar imagem. Tente novamente ou lance manualmente na aba Lançar.');
      }
    };
    reader.readAsDataURL(file);
  }

  async function salvarAI() {
    const tx = {
      tipo: 'despesa',
      val: parseFloat(document.getElementById('ai-val').value),
      desc: document.getElementById('ai-desc').value.trim(),
      data: document.getElementById('ai-data').value,
      cat: document.getElementById('ai-cat').value,
      pessoa: document.getElementById('ai-pessoa').value,
      aiImport: true
    };
    if (!tx.val || !tx.desc || !tx.data) { alert('Preencha todos os campos'); return; }
    tx.id = Date.now();
    const ok = await pushTx(tx);
    if (!ok) return;
    resetComp();
    navTo('resumo');
  }

  function resetComp() {
    document.getElementById('ai-result').style.display = 'none';
    document.getElementById('ai-loading').style.display = 'none';
    document.getElementById('file-input').value = '';
    document.getElementById('no-ai-key').style.display = 'none';
  }

  /* ───── SETTINGS ───── */
  function openSettings() {
    document.getElementById('cfg-supabase-url').value = cfg.supabaseUrl || '';
    document.getElementById('cfg-supabase-key').value = cfg.supabaseKey || '';
    document.getElementById('cfg-casal-id').value = cfg.casalId || '';
    document.getElementById('cfg-nome').value = cfg.nome || '';
    document.getElementById('cfg-nome-ela').value = cfg.nomeEla || '';
    document.getElementById('cfg-nome-ele').value = cfg.nomeEle || '';
    const tgCmd = document.getElementById('tg-command-text');
    if (tgCmd) tgCmd.textContent = `/conectar ${cfg.casalId || '...'}`;
    document.getElementById('settings-modal').style.display = 'flex';
  }

  function closeSettings() {
    document.getElementById('settings-modal').style.display = 'none';
  }

  async function saveSettings() {
    cfg.supabaseUrl = document.getElementById('cfg-supabase-url').value.trim();
    cfg.supabaseKey = document.getElementById('cfg-supabase-key').value.trim();
    cfg.casalId = document.getElementById('cfg-casal-id').value.trim();
    cfg.nome = document.getElementById('cfg-nome').value.trim() || 'Finanças do Casal';
    cfg.nomeEla = document.getElementById('cfg-nome-ela').value.trim();
    cfg.nomeEle = document.getElementById('cfg-nome-ele').value.trim();
    cfg.local = !cfg.supabaseUrl;
    saveCfg();
    updatePessoaSelects();
    document.getElementById('header-nome').textContent = cfg.nome;
    closeSettings();
    if (cfg.supabaseUrl && initSupabase()) {
      loadAllFromSupabase().then(() => subscribeRealtime());
    } else {
      setSyncStatus('local');
    }
    render();
  }

  function resetAll() {
    if (!confirm('Apagar TODOS os dados? Esta ação não pode ser desfeita.')) return;
    localStorage.clear();
    location.reload();
  }

  async function logout() {
    if (!confirm('Sair da conta?')) return;
    // Sign out from Supabase Auth if SDK is available
    if (window.supabase && typeof window.supabase.createClient === 'function') {
      try {
        const sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey);
        await sb.auth.signOut();
      } catch {}
    }
    localStorage.removeItem('casal_cfg');
    window.location.replace('/login');
  }

  function copiarComandoTelegram() {
    const cmd = `/conectar ${cfg.casalId || '(configure o ID do casal primeiro)'}`;
    navigator.clipboard.writeText(cmd).then(() => {
      const box = document.getElementById('tg-command-text');
      if (box) { const orig = box.textContent; box.textContent = 'Copiado!'; setTimeout(() => box.textContent = orig, 1500); }
    }).catch(() => alert(cmd));
  }

  /* ───── RENDER HELPERS ───── */
  function txHTML(t, showDel = true) {
    const isRec = t.tipo === 'receita';
    const color = isRec ? '#5ee7b0' : (CAT_COLORS[t.cat] || '#64748b');
    const dt = new Date(t.data + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    const aiB = t.aiImport ? '<span class="badge-ai"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>IA</span>' : '';
    const del = showDel ? `<button class="tx-del" onclick="App.deleteTx(${t.id})" aria-label="Remover">×</button>` : '';
    return `<div class="tx-item">
      <div class="tx-dot" style="background:${color}"></div>
      <div class="tx-info">
        <div class="tx-desc">${t.desc}${aiB}</div>
        <div class="tx-meta">${t.cat} · ${dt} · ${t.pessoa}</div>
      </div>
      <div class="tx-val ${isRec ? 'credit' : 'debit'}">${isRec ? '+' : '-'}${brl(t.val)}</div>
      ${del}
    </div>`;
  }

  function progHTML(label, gasto, previsto, extraClass = '') {
    const pct = previsto > 0 ? Math.min(100, Math.round(gasto / previsto * 100)) : 0;
    const color = pct > 100 ? '#ff6b6b' : pct > 80 ? '#fbbf24' : '#5ee7b0';
    return `<div class="prog-item ${extraClass}">
      <div class="prog-label">
        <span>${label}</span>
        <span class="prog-pct" style="color:${color}">${brl(gasto)} / ${brl(previsto)} <span style="color:${color}">(${pct}%)</span></span>
      </div>
      <div class="prog-track">
        <div class="prog-fill" style="width:${pct}%;background:${color}"></div>
      </div>
    </div>`;
  }

  function contaHTML(c) {
    const mk = mkey(curDate);
    const pago = c.pago && c.pago.includes(mk);
    return `<div class="conta-item">
      <div class="conta-check ${pago ? 'pago' : ''}" onclick="App.toggleContaFixa(${c.id})">${pago ? '✓' : ''}</div>
      <div class="conta-info">
        <div class="conta-nome">${c.nome} <span class="${pago ? 'badge-ok' : 'badge-pend'}">${pago ? 'Pago' : 'Pendente'}</span></div>
        <div class="conta-meta">Vence dia ${c.dia}</div>
      </div>
      <div class="conta-val">${brl(c.val)}</div>
      <button class="conta-del" onclick="App.deleteContaFixa(${c.id})" aria-label="Remover">×</button>
    </div>`;
  }

  /* ───── RENDER HISTÓRICO ───── */
  function renderHistorico() {
    const query = (document.getElementById('search-input')?.value || '').toLowerCase();
    let txs = monthTxs();
    if (query) txs = txs.filter(t => t.desc.toLowerCase().includes(query) || t.cat.toLowerCase().includes(query));
    const el = document.getElementById('historico-lista');
    if (!el) return;
    if (!txs.length) {
      el.innerHTML = '<p class="empty-state">Nenhum lançamento encontrado</p>';
      return;
    }
    const grouped = {};
    txs.forEach(t => {
      const dk = new Date(t.data + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' });
      if (!grouped[dk]) grouped[dk] = [];
      grouped[dk].push(t);
    });
    el.innerHTML = Object.entries(grouped).map(([day, items]) =>
      `<div class="section-label" style="margin-top:12px">${day}</div>
       <div class="card">${items.map(t => txHTML(t)).join('')}</div>`
    ).join('');
  }

  /* ───── MAIN RENDER ───── */
  function render() {
    const lbl = mfmt(curDate);
    const mes = document.getElementById('header-mes');
    if (mes) mes.textContent = lbl;

    const txs = monthTxs();
    const rec = txs.filter(t => t.tipo === 'receita').reduce((s, t) => s + t.val, 0);
    const desp = txs.filter(t => t.tipo === 'despesa').reduce((s, t) => s + t.val, 0);
    const saldo = rec - desp;

    const mRec = document.getElementById('m-rec');
    const mDesp = document.getElementById('m-desp');
    const mSaldo = document.getElementById('m-saldo');
    if (mRec) mRec.textContent = brl(rec);
    if (mDesp) mDesp.textContent = brl(desp);
    if (mSaldo) {
      mSaldo.textContent = brl(saldo);
      const card = mSaldo.closest('.metric-card');
      if (card) card.className = 'metric-card full ' + (saldo >= 0 ? 'blue' : 'blue neg');
    }

    const orcs = db.orcamentos || [];
    const cfs = db.contas_fixas || [];
    const despTxs = txs.filter(t => t.tipo === 'despesa');

    const orcEl = document.getElementById('r-orcamentos');
    if (orcEl) orcEl.innerHTML = orcs.length
      ? orcs.map(o => {
        const gasto = despTxs.filter(t => t.cat === o.cat).reduce((s, t) => s + t.val, 0);
        return progHTML(o.cat, gasto, o.val, 'orc-resumo-item');
      }).join('')
      : '<p class="empty-state">Configure orçamentos na aba Previsão</p>';

    const cfResumo = document.getElementById('r-contas');
    if (cfResumo) cfResumo.innerHTML = cfs.length ? cfs.map(contaHTML).join('') : '<p class="empty-state">Nenhuma conta fixa cadastrada</p>';

    const rLanc = document.getElementById('r-lancamentos');
    if (rLanc) {
      const rec5 = txs.slice(0, 5);
      rLanc.innerHTML = rec5.length ? rec5.map(t => txHTML(t, false)).join('') : '<p class="empty-state">Nenhum lançamento neste mês</p>';
    }

    const orcLista = document.getElementById('orc-lista');
    if (orcLista) orcLista.innerHTML = orcs.length
      ? orcs.map(o => {
        const gasto = despTxs.filter(t => t.cat === o.cat).reduce((s, t) => s + t.val, 0);
        return `<div class="prog-item" style="margin-bottom:10px">
          ${progHTML(o.cat, gasto, o.val)}
          <div style="text-align:right;margin-top:4px">
            <button onclick="App.deleteOrcamento('${o.cat}')" style="background:none;border:none;color:var(--text3);font-size:11px;cursor:pointer;font-family:var(--font)">Remover</button>
          </div>
        </div>`;
      }).join('')
      : '<p class="empty-state">Nenhum orçamento definido</p>';

    const cfLista = document.getElementById('cf-lista');
    if (cfLista) cfLista.innerHTML = cfs.length ? cfs.map(contaHTML).join('') : '<p class="empty-state">Nenhuma conta fixa</p>';

    const orcProg = document.getElementById('orc-progress');
    if (orcProg) orcProg.innerHTML = orcs.length
      ? orcs.map(o => {
        const gasto = despTxs.filter(t => t.cat === o.cat).reduce((s, t) => s + t.val, 0);
        return progHTML(o.cat, gasto, o.val);
      }).join('')
      : '<p class="empty-state" style="font-size:13px;color:var(--text3)">Configure orçamentos na aba Previsão</p>';

    renderSaldoCasal(txs);
    renderCharts(txs, despTxs, rec, desp);
    renderHistorico();
    renderMetas();
    renderAnalise();
  }

  function renderSaldoCasal(txs) {
    const el = document.getElementById('saldo-casal');
    if (!el) return;
    const ela = getNomeEla(), ele = getNomeEle();
    const pessoas = [
      { nome: ela, cor: '#ec4899', corDim: 'rgba(236,72,153,0.12)' },
      { nome: ele, cor: '#7eb8f5', corDim: 'rgba(126,184,245,0.12)' }
    ];
    el.innerHTML = pessoas.map(p => {
      const rec = txs.filter(t => t.tipo === 'receita' && (t.pessoa === p.nome || t.pessoa === 'Os dois')).reduce((s, t) => s + t.val, 0);
      const desp = txs.filter(t => t.tipo === 'despesa' && (t.pessoa === p.nome || t.pessoa === 'Os dois')).reduce((s, t) => s + t.val, 0);
      const saldo = rec - desp;
      return `
        <div class="metric-card" style="border-color:${p.cor}22">
          <label style="color:${p.cor}">${p.nome}</label>
          <div style="display:flex;flex-direction:column;gap:4px;margin-top:4px">
            <div style="display:flex;justify-content:space-between;font-size:12px">
              <span style="color:var(--text3)">Receitas</span>
              <span style="color:var(--green);font-family:var(--font-mono)">${brl(rec)}</span>
            </div>
            <div style="display:flex;justify-content:space-between;font-size:12px">
              <span style="color:var(--text3)">Despesas</span>
              <span style="color:var(--red);font-family:var(--font-mono)">${brl(desp)}</span>
            </div>
            <div style="height:1px;background:var(--border);margin:4px 0"></div>
            <div style="display:flex;justify-content:space-between;font-size:13px;font-weight:500">
              <span style="color:var(--text2)">Saldo</span>
              <span style="color:${saldo >= 0 ? p.cor : 'var(--red)'};font-family:var(--font-mono)">${brl(saldo)}</span>
            </div>
          </div>
        </div>`;
    }).join('');
  }

  function renderCharts(txs, despTxs, rec, desp) {
    if (pieInst) { pieInst.destroy(); pieInst = null; }
    if (barInst) { barInst.destroy(); barInst = null; }

    const catTot = {};
    despTxs.forEach(t => { catTot[t.cat] = (catTot[t.cat] || 0) + t.val; });
    const cats = Object.entries(catTot).sort((a, b) => b[1] - a[1]);

    const pieEl = document.getElementById('pie-chart');
    const legEl = document.getElementById('pie-legend');

    if (pieEl && cats.length) {
      pieInst = new Chart(pieEl, {
        type: 'doughnut',
        data: {
          labels: cats.map(c => c[0]),
          datasets: [{
            data: cats.map(c => c[1]),
            backgroundColor: cats.map(c => CAT_COLORS[c[0]] || '#64748b'),
            borderWidth: 2,
            borderColor: '#161b27'
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: '65%',
          plugins: {
            legend: { display: false },
            tooltip: { callbacks: { label: ctx => ' ' + brl(ctx.raw) } }
          }
        }
      });
      if (legEl) {
        const total = cats.reduce((s, c) => s + c[1], 0);
        legEl.innerHTML = cats.map(([c, v]) =>
          `<span class="legend-item"><span class="legend-dot" style="background:${CAT_COLORS[c] || '#64748b'}"></span>${c} ${total > 0 ? Math.round(v / total * 100) + '%' : ''}</span>`
        ).join('');
      }
    } else if (legEl) legEl.innerHTML = '';

    const barEl = document.getElementById('bar-chart');
    if (barEl) {
      barInst = new Chart(barEl, {
        type: 'bar',
        data: {
          labels: ['Receitas', 'Despesas'],
          datasets: [{
            data: [rec, desp],
            backgroundColor: ['#5ee7b0', '#ff6b6b'],
            borderWidth: 0,
            borderRadius: 8
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            y: {
              beginAtZero: true,
              ticks: {
                color: '#555e78',
                font: { size: 10, family: 'DM Mono' },
                callback: v => 'R$' + (v >= 1000 ? Math.round(v / 1000) + 'k' : Math.round(v))
              },
              grid: { color: 'rgba(255,255,255,0.05)' }
            },
            x: { ticks: { color: '#8b93a8', font: { size: 12 } }, grid: { display: false } }
          }
        }
      });
    }

    const splitEl = document.getElementById('pessoa-split');
    if (splitEl) {
      const ela = getNomeEla(), ele = getNomeEle();
      const pessoasCfg = [
        { nome: ela, cor: '#ec4899' },
        { nome: ele, cor: '#7eb8f5' },
        { nome: 'Os dois', cor: '#5ee7b0' }
      ];
      const mk = mkey(curDate);
      const totais = pessoasCfg.map(p => ({
        ...p,
        val: Object.values(db.txs)
          .filter(t => t.tipo === 'despesa' && t.pessoa === p.nome && t.data && t.data.startsWith(mk))
          .reduce((s, t) => s + t.val, 0)
      }));
      const max = Math.max(...totais.map(t => t.val), 1);
      splitEl.innerHTML = totais.map(p => `
        <div class="split-row">
          <div class="split-name">${p.nome}</div>
          <div class="split-bar-wrap">
            <div class="split-bar" style="width:${Math.round(p.val / max * 100)}%;background:${p.cor}"></div>
          </div>
          <div class="split-val">${brl(p.val)}</div>
        </div>
      `).join('');
    }
  }

  /* ───── ASSINATURA / STRIPE ───── */
  let planoSelecionado = 'anual';
  let assinatura = { plano: 'free', ativo: false };

  async function checkAssinatura() {
    if (!cfg.casalId) return;
    try {
      const res = await fetch('/api/check-subscription?casalId=' + encodeURIComponent(cfg.casalId));
      if (res.ok) {
        assinatura = await res.json();
        atualizarUI();
      }
    } catch {}
  }

  function atualizarUI() {
    const badgePro = document.getElementById('badge-pro');
    const cfgAss = document.getElementById('cfg-assinatura');
    const labelEl = document.getElementById('cfg-plano-label');
    const detalheEl = document.getElementById('cfg-plano-detalhe');
    const btnEl = document.getElementById('cfg-plano-btn');

    if (badgePro) badgePro.style.display = assinatura.ativo ? 'inline-flex' : 'none';

    if (cfgAss) {
      cfgAss.style.display = 'block';
      if (labelEl) labelEl.textContent = assinatura.ativo ? 'Plano Pro ✓' : 'Plano Free';
      if (detalheEl) {
        detalheEl.textContent = assinatura.ativo
          ? 'Lançamentos ilimitados · tudo liberado'
          : '30 lançamentos/mês · 5 comprovantes IA';
      }
      if (btnEl) {
        btnEl.textContent = assinatura.ativo ? 'Gerenciar assinatura' : 'Assinar Pro';
        btnEl.className = assinatura.ativo ? 'btn-portal' : 'btn-upgrade';
      }
    }

    const sucesso = new URLSearchParams(location.search).get('sucesso');
    if (sucesso) {
      history.replaceState({}, '', location.pathname);
      mostrarToast('Assinatura ativada! Bem-vindos ao Pro 🎉');
    }
  }

  function mostrarToast(msg) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.classList.add('show'), 10);
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 4000);
  }

  function abrirUpgrade() {
    if (assinatura.ativo) {
      gerenciarAssinatura();
      return;
    }
    document.getElementById('upgrade-modal').style.display = 'flex';
    document.getElementById('settings-modal').style.display = 'none';
  }

  function fecharUpgrade() {
    document.getElementById('upgrade-modal').style.display = 'none';
  }

  function selecionarPlano(plano) {
    planoSelecionado = plano;
    document.getElementById('opt-mensal').classList.toggle('selected', plano === 'mensal');
    document.getElementById('opt-anual').classList.toggle('selected', plano === 'anual');
  }

  async function assinar() {
    const btn = document.getElementById('btn-assinar');
    btn.textContent = 'Aguarde...';
    btn.disabled = true;
    try {
      const res = await fetch('/api/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ casalId: cfg.casalId, plano: planoSelecionado, nome: cfg.nome })
      });
      const data = await res.json();
      if (data.url) {
        location.href = data.url;
      } else {
        alert('Erro ao iniciar pagamento: ' + (data.error || 'tente novamente'));
        btn.textContent = 'Assinar agora →';
        btn.disabled = false;
      }
    } catch {
      alert('Erro de conexão. Tente novamente.');
      btn.textContent = 'Assinar agora →';
      btn.disabled = false;
    }
  }

  async function gerenciarAssinatura() {
    try {
      const res = await fetch('/api/customer-portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ casalId: cfg.casalId })
      });
      const data = await res.json();
      if (data.url) location.href = data.url;
      else alert('Erro ao abrir portal: ' + (data.error || 'tente novamente'));
    } catch {
      alert('Erro de conexão. Tente novamente.');
    }
  }

  /* ───── EXPORT PDF ───── */
  function exportarPDF() {
    if (typeof window.jspdf === 'undefined') {
      showToast('jsPDF ainda carregando, tente novamente.'); return;
    }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });

    const mes = mfmt(curDate);
    const txs = monthTxs();
    const rec = txs.filter(t => t.tipo === 'receita').reduce((s, t) => s + t.val, 0);
    const desp = txs.filter(t => t.tipo === 'despesa').reduce((s, t) => s + t.val, 0);
    const saldo = rec - desp;

    const W = 210, pad = 14;
    let y = 20;

    // Cabeçalho
    doc.setFillColor(15, 17, 23);
    doc.rect(0, 0, W, 36, 'F');
    doc.setTextColor(94, 231, 176);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('FinanciadoCasal', pad, 16);
    doc.setTextColor(139, 147, 168);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('Relatório — ' + mes, pad, 26);
    doc.setTextColor(85, 94, 120);
    doc.text('Gerado em ' + new Date().toLocaleDateString('pt-BR'), W - pad, 26, { align: 'right' });

    y = 48;

    // Resumo
    doc.setFillColor(22, 27, 39);
    doc.roundedRect(pad, y, W - pad * 2, 28, 3, 3, 'F');
    doc.setFontSize(9);
    doc.setTextColor(85, 94, 120);
    doc.text('RECEITAS', pad + 6, y + 9);
    doc.text('DESPESAS', W / 2 - 10, y + 9);
    doc.text('SALDO', W - pad - 26, y + 9);
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(94, 231, 176);
    doc.text(brl(rec), pad + 6, y + 20);
    doc.setTextColor(255, 107, 107);
    doc.text(brl(desp), W / 2 - 10, y + 20);
    doc.setTextColor(saldo >= 0 ? 126 : 255, saldo >= 0 ? 184 : 107, saldo >= 0 ? 245 : 107);
    doc.text(brl(saldo), W - pad - 26, y + 20);

    y += 40;

    // Top categorias
    const catTot = {};
    txs.filter(t => t.tipo === 'despesa').forEach(t => { catTot[t.cat] = (catTot[t.cat] || 0) + t.val; });
    const top5 = Object.entries(catTot).sort((a, b) => b[1] - a[1]).slice(0, 5);

    if (top5.length) {
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(85, 94, 120);
      doc.text('TOP CATEGORIAS', pad, y);
      y += 6;
      doc.setFont('helvetica', 'normal');
      top5.forEach(([cat, val]) => {
        const pct = desp > 0 ? Math.round(val / desp * 100) : 0;
        doc.setTextColor(232, 234, 240);
        doc.setFontSize(10);
        doc.text(cat, pad, y + 4);
        doc.setTextColor(85, 94, 120);
        doc.setFontSize(9);
        doc.text(pct + '%', pad + 50, y + 4);
        doc.setTextColor(255, 107, 107);
        doc.text(brl(val), W - pad, y + 4, { align: 'right' });
        doc.setDrawColor(30, 37, 56);
        doc.line(pad, y + 7, W - pad, y + 7);
        y += 10;
      });
      y += 6;
    }

    // Lançamentos
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(85, 94, 120);
    doc.text('LANÇAMENTOS DO MÊS', pad, y);
    y += 6;
    doc.setFont('helvetica', 'normal');

    txs.forEach(t => {
      if (y > 270) { doc.addPage(); y = 20; }
      const dataFmt = t.data ? t.data.split('-').reverse().join('/') : '';
      doc.setFontSize(10);
      doc.setTextColor(232, 234, 240);
      doc.text(t.desc || '—', pad, y + 4, { maxWidth: 90 });
      doc.setTextColor(85, 94, 120);
      doc.setFontSize(9);
      doc.text(dataFmt, pad + 95, y + 4);
      doc.text(t.cat || '', pad + 115, y + 4);
      doc.setFontSize(10);
      doc.setTextColor(t.tipo === 'receita' ? 94 : 255, t.tipo === 'receita' ? 231 : 107, t.tipo === 'receita' ? 176 : 107);
      doc.text((t.tipo === 'receita' ? '+' : '-') + brl(t.val), W - pad, y + 4, { align: 'right' });
      doc.setDrawColor(30, 37, 56);
      doc.line(pad, y + 7, W - pad, y + 7);
      y += 10;
    });

    const nomeMes = mes.replace(/\s/g, '_').toLowerCase();
    doc.save(`financiadocasal_${nomeMes}.pdf`);
  }

  /* ───── NOTIFICAÇÕES DE CONTAS VENCENDO ───── */
  function checkContasVencendo() {
    const banner = document.getElementById('bill-banner');
    if (!banner) return;
    if (sessionStorage.getItem('bill_banner_dismissed')) return;

    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const mk = mkey(new Date());
    const vencendo = (db.contas_fixas || []).filter(cf => {
      if ((cf.pago || []).includes(mk)) return false;
      const diaVenc = parseInt(cf.dia) || 1;
      const venc = new Date(hoje.getFullYear(), hoje.getMonth(), diaVenc);
      if (venc < hoje) return false;
      const diffDias = Math.ceil((venc - hoje) / 86400000);
      return diffDias <= 3;
    });

    if (!vencendo.length) { banner.style.display = 'none'; return; }

    const list = document.getElementById('bill-banner-list');
    if (list) {
      list.innerHTML = '<ul>' + vencendo.map(cf => {
        const diffDias = Math.ceil((new Date(hoje.getFullYear(), hoje.getMonth(), cf.dia) - hoje) / 86400000);
        const quando = diffDias === 0 ? 'hoje' : diffDias === 1 ? 'amanhã' : `em ${diffDias} dias`;
        return `<li><strong>${cf.nome}</strong> — ${brl(cf.val)} vence <em>${quando}</em></li>`;
      }).join('') + '</ul>';
    }
    banner.style.display = 'flex';
  }

  function fecharBillBanner() {
    const banner = document.getElementById('bill-banner');
    if (banner) banner.style.display = 'none';
    sessionStorage.setItem('bill_banner_dismissed', '1');
  }

  /* ───── METAS DE ECONOMIA ───── */
  async function addMeta() {
    const nome = document.getElementById('meta-nome').value.trim();
    const alvo = parseFloat(document.getElementById('meta-alvo').value);
    const prazo = document.getElementById('meta-prazo').value;
    if (!nome) { mostrarToast('Informe o nome da meta.'); return; }
    if (!alvo || alvo <= 0) { mostrarToast('Informe o valor alvo.'); return; }

    const arr = [...(db.metas || [])];
    arr.push({ id: Date.now(), nome, valor_alvo: alvo, valor_atual: 0, prazo: prazo || null });
    await pushConfig('metas', arr);
    document.getElementById('meta-nome').value = '';
    document.getElementById('meta-alvo').value = '';
    document.getElementById('meta-prazo').value = '';
    renderMetas();
  }

  async function depositarMeta(id) {
    const valorStr = prompt('Quanto deseja adicionar à meta? (R$)');
    if (!valorStr) return;
    const valor = parseFloat(valorStr.replace(',', '.'));
    if (!valor || valor <= 0) { mostrarToast('Valor inválido.'); return; }

    const arr = (db.metas || []).map(m =>
      m.id === id ? { ...m, valor_atual: Math.min(m.valor_atual + valor, m.valor_alvo) } : m
    );
    await pushConfig('metas', arr);
    renderMetas();
  }

  async function deleteMeta(id) {
    if (!confirm('Remover esta meta?')) return;
    await pushConfig('metas', (db.metas || []).filter(m => m.id !== id));
    renderMetas();
  }

  function renderMetas() {
    const el = document.getElementById('metas-lista');
    if (!el) return;
    const metas = db.metas || [];
    if (!metas.length) { el.innerHTML = '<p class="empty-state">Nenhuma meta definida ainda</p>'; return; }

    el.innerHTML = metas.map(m => {
      const pct = m.valor_alvo > 0 ? Math.min(Math.round(m.valor_atual / m.valor_alvo * 100), 100) : 0;
      const fillClass = pct >= 100 ? 'done' : pct < 40 ? 'mid' : '';
      const prazoFmt = m.prazo ? new Date(m.prazo + 'T12:00:00').toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' }) : '';
      return `
        <div class="meta-card">
          <div class="meta-header">
            <div>
              <div class="meta-nome">${m.nome}</div>
              ${prazoFmt ? `<div class="meta-prazo">Prazo: ${prazoFmt}</div>` : ''}
            </div>
            <div style="font-size:12px;color:var(--text3);font-family:var(--font-mono)">${pct}%</div>
          </div>
          <div class="meta-valores">
            <span>Guardado: <span class="atual">${brl(m.valor_atual)}</span></span>
            <span class="alvo">Meta: ${brl(m.valor_alvo)}</span>
          </div>
          <div class="meta-progress-track">
            <div class="meta-progress-fill ${fillClass}" style="width:${pct}%"></div>
          </div>
          <div class="meta-actions">
            <button class="btn-dep" onclick="App.depositarMeta(${m.id})">+ Depositar</button>
            <button class="btn-del" onclick="App.deleteMeta(${m.id})">Remover</button>
          </div>
        </div>`;
    }).join('');
  }

  /* ───── WIZARD ONBOARDING ───── */
  let wizardStep = 1;

  function wizardGoTo(step) {
    wizardStep = step;
    document.querySelectorAll('.wizard-step').forEach((el, i) => {
      el.classList.toggle('active', i + 1 === step);
    });
    document.querySelectorAll('.wizard-dot').forEach((el, i) => {
      el.classList.remove('active', 'done');
      if (i + 1 === step) el.classList.add('active');
      else if (i + 1 < step) el.classList.add('done');
    });
  }

  function wizardNext() {
    wizardGoTo(wizardStep + 1);
  }

  function wizardBack() {
    if (wizardStep > 1) wizardGoTo(wizardStep - 1);
  }

  /* ───── EXCLUIR CONTA (LGPD Art. 18) ───── */
  async function deletarConta() {
    const ok = confirm(
      'ATENÇÃO: Esta ação é irreversível.\n\n' +
      'Serão excluídos permanentemente:\n' +
      '• Todos os lançamentos do casal\n' +
      '• Orçamentos e contas fixas\n' +
      '• Assinatura Stripe (cancelada imediatamente)\n' +
      '• Sua conta e login\n\n' +
      'Digite OK para confirmar.'
    );
    if (!ok) return;

    try {
      const { data: { session } } = await sbClient.auth.getSession();
      if (!session?.access_token) {
        alert('Você precisa estar logado para excluir a conta.');
        return;
      }

      const res = await fetch('/api/delete-account', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${session.access_token}` }
      });

      if (res.ok) {
        localStorage.removeItem('casal_cfg');
        alert('Conta excluída com sucesso. Obrigado por ter usado o FinanciadoCasal.');
        window.location.replace('/');
      } else {
        const data = await res.json();
        alert('Erro ao excluir conta: ' + (data.error || 'tente novamente ou contate suporte@financeiadocasal.com.br'));
      }
    } catch {
      alert('Erro de conexão. Tente novamente.');
    }
  }

  /* ───── ANÁLISE MENSAL ───── */
  function renderAnalise() {
    const saudeEl    = document.getElementById('analise-saude');
    const evolEl     = document.getElementById('analise-evolucao');
    const insEl      = document.getElementById('analise-insights');
    const contasEl   = document.getElementById('analise-contas');
    const metasEl    = document.getElementById('analise-metas');
    if (!saudeEl) return;

    const txs  = monthTxs();
    const rec  = txs.filter(t => t.tipo === 'receita').reduce((s, t) => s + t.val, 0);
    const desp = txs.filter(t => t.tipo === 'despesa').reduce((s, t) => s + t.val, 0);
    const saldo = rec - desp;
    const taxa = rec > 0 ? Math.round(saldo / rec * 100) : 0;

    // Mês anterior
    const prevDate = new Date(curDate.getFullYear(), curDate.getMonth() - 1, 1);
    const prevMk   = mkey(prevDate);
    const prevTxs  = Object.values(db.txs).filter(t => t.data && t.data.startsWith(prevMk));
    const prevRec  = prevTxs.filter(t => t.tipo === 'receita').reduce((s, t) => s + t.val, 0);
    const prevDesp = prevTxs.filter(t => t.tipo === 'despesa').reduce((s, t) => s + t.val, 0);

    // ── Saúde financeira ──
    const taxaColor = taxa >= 20 ? 'var(--green)' : taxa >= 10 ? 'var(--amber)' : taxa >= 0 ? '#f97316' : 'var(--red)';
    const taxaLabel = taxa >= 20 ? 'Excelente' : taxa >= 10 ? 'Bom' : taxa >= 0 ? 'Atenção' : 'Negativo';
    saudeEl.innerHTML = `
      <div class="analise-saude-card">
        <div class="analise-saude-left">
          <div class="analise-taxa-label">Taxa de poupança</div>
          <div class="analise-taxa-num" style="color:${taxaColor}">${taxa}%</div>
          <div class="analise-taxa-status" style="color:${taxaColor}">${taxaLabel}</div>
        </div>
        <div class="analise-saude-right">
          <div class="analise-mini-row">
            <span>Receita</span>
            <span style="color:var(--green)">${brl(rec)}</span>
          </div>
          <div class="analise-mini-row">
            <span>Gastos</span>
            <span style="color:var(--red)">${brl(desp)}</span>
          </div>
          <div class="analise-mini-divider"></div>
          <div class="analise-mini-row" style="font-weight:500">
            <span>Saldo</span>
            <span style="color:${saldo >= 0 ? 'var(--green)' : 'var(--red)'}">${brl(saldo)}</span>
          </div>
          ${rec > 0 ? `<div class="analise-saude-bar-wrap">
            <div class="analise-saude-bar" style="width:${Math.min(100, Math.round(desp / rec * 100))}%;background:${taxaColor}"></div>
          </div>
          <div style="font-size:10px;color:var(--text3);text-align:right">${Math.min(100, Math.round(desp / rec * 100))}% da receita gasto</div>` : ''}
        </div>
      </div>`;

    // ── Evolução vs mês anterior ──
    function pctDiff(now, prev) {
      if (prev === 0) return now > 0 ? '+∞' : '—';
      const p = Math.round((now - prev) / prev * 100);
      return (p >= 0 ? '+' : '') + p + '%';
    }
    function arrowColor(now, prev, inverse = false) {
      if (prev === 0) return 'var(--text3)';
      const up = now > prev;
      return (up !== inverse) ? 'var(--green)' : 'var(--red)';
    }
    evolEl.innerHTML = `
      <div class="analise-evolucao">
        <div class="analise-evol-item">
          <div class="analise-evol-label">Receitas</div>
          <div class="analise-evol-val" style="color:var(--text)">${brl(rec)}</div>
          <div class="analise-evol-delta" style="color:${arrowColor(rec, prevRec)}">${pctDiff(rec, prevRec)} vs mês anterior</div>
        </div>
        <div class="analise-evol-sep"></div>
        <div class="analise-evol-item">
          <div class="analise-evol-label">Gastos</div>
          <div class="analise-evol-val" style="color:var(--text)">${brl(desp)}</div>
          <div class="analise-evol-delta" style="color:${arrowColor(desp, prevDesp, true)}">${pctDiff(desp, prevDesp)} vs mês anterior</div>
        </div>
        <div class="analise-evol-sep"></div>
        <div class="analise-evol-item">
          <div class="analise-evol-label">Saldo anterior</div>
          <div class="analise-evol-val" style="color:${(prevRec - prevDesp) >= 0 ? 'var(--green)' : 'var(--red)'}">${brl(prevRec - prevDesp)}</div>
          <div class="analise-evol-delta" style="color:var(--text3)">${mfmt(prevDate)}</div>
        </div>
      </div>`;

    // ── Insights ──
    const catTot = {};
    txs.filter(t => t.tipo === 'despesa').forEach(t => { catTot[t.cat] = (catTot[t.cat] || 0) + t.val; });
    const topCat = Object.entries(catTot).sort((a, b) => b[1] - a[1])[0];
    const insights = [];

    if (rec === 0 && desp === 0) {
      insights.push({ icon: '📋', txt: 'Nenhum lançamento neste mês ainda. Registre receitas e despesas para ver a análise.' });
    } else {
      if (taxa >= 20) insights.push({ icon: '🏆', txt: `Ótimo! Vocês pouparam ${taxa}% da renda neste mês — acima da meta recomendada de 20%.` });
      else if (taxa >= 10) insights.push({ icon: '📈', txt: `Vocês pouparam ${taxa}% da renda. Aumentar para 20% ajudaria a construir uma reserva de emergência mais rápido.` });
      else if (taxa >= 0) insights.push({ icon: '⚠️', txt: `Taxa de poupança baixa (${taxa}%). Tente reduzir gastos em ${topCat ? topCat[0] : 'categorias variáveis'} para melhorar o saldo.` });
      else insights.push({ icon: '🚨', txt: `Atenção: vocês gastaram ${brl(Math.abs(saldo))} a mais do que ganharam. Revise os lançamentos e ajuste o orçamento.` });

      if (topCat) {
        const topPct = desp > 0 ? Math.round(topCat[1] / desp * 100) : 0;
        insights.push({ icon: '💸', txt: `Maior gasto: <strong>${topCat[0]}</strong> — ${brl(topCat[1])} (${topPct}% do total de despesas).` });
      }

      if (desp > prevDesp && prevDesp > 0) {
        const aumento = Math.round((desp - prevDesp) / prevDesp * 100);
        insights.push({ icon: '📊', txt: `Os gastos aumentaram ${aumento}% em relação ao mês anterior. Verifique o que mudou no orçamento.` });
      } else if (desp < prevDesp && prevDesp > 0) {
        const reducao = Math.round((prevDesp - desp) / prevDesp * 100);
        insights.push({ icon: '✅', txt: `Os gastos reduziram ${reducao}% em relação ao mês anterior. Continue assim!` });
      }

      const metas = db.metas || [];
      const totalMetas = metas.reduce((s, m) => s + m.valor_atual, 0);
      if (totalMetas > 0) {
        const reservaIdeal = desp * 6;
        if (totalMetas < reservaIdeal * 0.5) {
          insights.push({ icon: '🎯', txt: `Vocês têm ${brl(totalMetas)} em metas. Uma reserva de emergência ideal seria de ${brl(reservaIdeal)} (6× os gastos mensais).` });
        } else {
          insights.push({ icon: '💰', txt: `Excelente! ${brl(totalMetas)} acumulados em metas. Continuem depositando para atingir os objetivos.` });
        }
      } else if (taxa > 0 && saldo > 0) {
        insights.push({ icon: '🎯', txt: `Vocês têm saldo positivo de ${brl(saldo)}. Considere criar uma meta de economia para guardar parte desse valor.` });
      }
    }

    insEl.innerHTML = insights.map(i =>
      `<div class="analise-insight"><span class="analise-insight-icon">${i.icon}</span><span>${i.txt}</span></div>`
    ).join('');

    // ── Contas fixas ──
    const mk    = mkey(curDate);
    const cfs   = db.contas_fixas || [];
    const pagas = cfs.filter(c => (c.pago || []).includes(mk));
    const pend  = cfs.filter(c => !(c.pago || []).includes(mk));
    const totCF = cfs.reduce((s, c) => s + c.val, 0);
    const totPago = pagas.reduce((s, c) => s + c.val, 0);
    const totPend = pend.reduce((s, c) => s + c.val, 0);

    if (!cfs.length) {
      contasEl.innerHTML = '<p class="empty-state">Nenhuma conta fixa cadastrada</p>';
    } else {
      contasEl.innerHTML = `
        <div class="analise-contas-row">
          <div class="analise-conta-stat ok">
            <div class="analise-conta-num">${pagas.length}/${cfs.length}</div>
            <div class="analise-conta-lbl">Pagas</div>
            <div class="analise-conta-val" style="color:var(--green)">${brl(totPago)}</div>
          </div>
          <div class="analise-conta-stat pend">
            <div class="analise-conta-num">${pend.length}</div>
            <div class="analise-conta-lbl">Pendentes</div>
            <div class="analise-conta-val" style="color:${pend.length > 0 ? 'var(--amber)' : 'var(--text3)'}">${brl(totPend)}</div>
          </div>
          <div class="analise-conta-stat total">
            <div class="analise-conta-num">${brl(totCF)}</div>
            <div class="analise-conta-lbl">Total fixo/mês</div>
            ${rec > 0 ? `<div class="analise-conta-val" style="color:var(--text3)">${Math.round(totCF / rec * 100)}% da renda</div>` : ''}
          </div>
        </div>
        ${pend.length > 0 ? `<div style="margin-top:10px;font-size:12px;color:var(--text3)">Pendentes: ${pend.map(c => `<span style="color:var(--amber)">${c.nome}</span>`).join(', ')}</div>` : ''}`;
    }

    // ── Metas / Poupança ──
    const metas = db.metas || [];
    if (!metas.length) {
      metasEl.innerHTML = '<p class="empty-state">Nenhuma meta criada. Vá na aba Metas para criar.</p>';
    } else {
      const totalAtual = metas.reduce((s, m) => s + m.valor_atual, 0);
      const totalAlvo  = metas.reduce((s, m) => s + m.valor_alvo, 0);
      const pctGeral   = totalAlvo > 0 ? Math.round(totalAtual / totalAlvo * 100) : 0;
      metasEl.innerHTML = `
        <div class="analise-metas-header">
          <div>
            <div style="font-size:18px;font-weight:600;color:var(--green);font-family:var(--font-mono)">${brl(totalAtual)}</div>
            <div style="font-size:12px;color:var(--text3)">de ${brl(totalAlvo)} em ${metas.length} meta${metas.length > 1 ? 's' : ''}</div>
          </div>
          <div style="font-size:20px;font-weight:700;color:var(--text2)">${pctGeral}%</div>
        </div>
        <div class="meta-progress-track" style="margin-top:10px">
          <div class="meta-progress-fill" style="width:${pctGeral}%;background:var(--green)"></div>
        </div>
        <div style="margin-top:8px">
          ${metas.map(m => {
            const p = m.valor_alvo > 0 ? Math.min(100, Math.round(m.valor_atual / m.valor_alvo * 100)) : 0;
            return `<div style="display:flex;justify-content:space-between;font-size:12px;color:var(--text2);margin-top:6px">
              <span>${m.nome}</span>
              <span style="font-family:var(--font-mono);color:${p >= 100 ? 'var(--green)' : 'var(--text2)'}">${brl(m.valor_atual)} / ${brl(m.valor_alvo)} (${p}%)</span>
            </div>`;
          }).join('')}
        </div>`;
    }
  }

  /* ───── OFX/CSV IMPORT ───── */

  function guessCat(desc) {
    const d = (desc || '').toLowerCase();
    if (/mercado|supermercado|hortifruti|açougue|padaria|carrefour|extra|assai|atacad/i.test(d)) return 'Mercado';
    if (/restaurante|lanch|café|coffee|pizza|hamburguer|ifood|rappi|uber.?eat|delivery|sushi/i.test(d)) return 'Alimentação';
    if (/uber|99pop|táxi|taxi|combustiv|gasolina|estacion|metrô|metro|ônibus|onibus|combustível/i.test(d)) return 'Transporte';
    if (/aluguel|condomin|energia|eletric|\bágua\b|\bagua\b|\bgás\b|\bgas\b|internet|claro|vivo|tim |\btim\b|cpfl|sabesp/i.test(d)) return 'Moradia';
    if (/farmá|farma|médic|medic|hospit|clínic|clinic|plano.?saúde|unimed|amil|hapvida/i.test(d)) return 'Saúde';
    if (/cinema|teatro|netflix|spotify|amazon|apple|disney|hbo|show|ingress|lazer|viagem|hotel/i.test(d)) return 'Lazer';
    if (/escola|facul|curso|livro|mensalid|educaç|udemy|alura/i.test(d)) return 'Educação';
    if (/salário|salario|pagamento|remuner|recebimento|pró.?labore|freelance/i.test(d)) return 'Salário';
    return 'Outros';
  }

  function parseOFX(text) {
    const txns = [];
    const get = (block, tag) => {
      const m = new RegExp(`<${tag}>([^<\\r\\n]*)`, 'i').exec(block);
      return m ? m[1].trim() : '';
    };
    const parts = text.split(/<STMTTRN>/i);
    for (let i = 1; i < parts.length; i++) {
      const block = parts[i].split(/<\/STMTTRN>/i)[0];
      const dtRaw  = get(block, 'DTPOSTED') || get(block, 'DTUSER');
      const amtRaw = get(block, 'TRNAMT');
      const memo   = get(block, 'MEMO') || get(block, 'NAME') || '';
      const fitid  = get(block, 'FITID');
      const dm = /^(\d{4})(\d{2})(\d{2})/.exec(dtRaw);
      if (!dm) continue;
      const amt = parseFloat(amtRaw);
      if (isNaN(amt) || amt === 0) continue;
      txns.push({
        tipo: amt > 0 ? 'receita' : 'despesa',
        val: Math.abs(amt),
        desc: memo || 'Lançamento bancário',
        data: `${dm[1]}-${dm[2]}-${dm[3]}`,
        cat: guessCat(memo),
        fitid
      });
    }
    return txns;
  }

  function parseCSV(text) {
    const firstLine = text.split(/\n/)[0] || '';
    const cnt = c => (firstLine.match(new RegExp('\\' + c, 'g')) || []).length;
    const sep = cnt(';') >= cnt(',') && cnt(';') >= cnt('\t') ? ';' : cnt('\t') > cnt(',') ? '\t' : ',';

    const lines = text.replace(/\r\n?/g, '\n').trim().split('\n').filter(l => l.trim());
    if (lines.length < 2) return [];

    const splitLine = line => {
      const cols = []; let cur = ''; let q = false;
      for (const c of line) {
        if (c === '"') { q = !q; }
        else if (c === sep && !q) { cols.push(cur.trim()); cur = ''; }
        else { cur += c; }
      }
      return [...cols, cur.trim()];
    };

    const unq = s => s.replace(/^"|"$/g, '').trim();
    const headers = splitLine(lines[0]).map(h => unq(h).toLowerCase());

    const find = pats => {
      for (const p of pats) {
        const i = headers.findIndex(h => h.includes(p));
        if (i >= 0) return i;
      }
      return -1;
    };

    let dateCol  = find(['data', 'date', 'dt_']);
    let descCol  = find(['descri', 'histor', 'memo', 'lançamento', 'lancamento', 'nome', 'name']);
    let amtCol   = find(['valor', 'amount', 'value', 'vlr']);
    let creditCol = find(['crédito', 'credito', 'credit', 'entrada']);
    let debitCol  = find(['débito', 'debito', 'debit', 'saída', 'saida']);
    let tipoCol   = find(['tipo']);

    // Auto-detect date/amount by scanning first data row when headers unclear
    if (dateCol < 0 || (amtCol < 0 && creditCol < 0)) {
      const row = splitLine(lines[1]).map(unq);
      for (let i = 0; i < row.length; i++) {
        if (dateCol < 0 && /^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(row[i])) dateCol = i;
        if (amtCol < 0 && creditCol < 0 && /^-?[\d.]+,\d{2}$/.test(row[i])) amtCol = i;
      }
    }
    if (dateCol < 0) return null;

    const parseBRL = s => {
      const clean = unq(s).replace(/[^\d,.-]/g, '');
      if (/,\d{2}$/.test(clean)) return parseFloat(clean.replace(/\./g, '').replace(',', '.'));
      return parseFloat(clean.replace(',', '.'));
    };

    const parseDate = s => {
      const v = unq(s);
      const d1 = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(v);
      const d2 = /^(\d{2})\/(\d{2})\/(\d{2})$/.exec(v);
      const d3 = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
      if (d1) return `${d1[3]}-${d1[2]}-${d1[1]}`;
      if (d2) return `20${d2[3]}-${d2[2]}-${d2[1]}`;
      if (d3) return v;
      return '';
    };

    const txns = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = splitLine(lines[i]);
      const dateStr = parseDate(cols[dateCol] || '');
      if (!dateStr) continue;

      const desc = descCol >= 0 ? unq(cols[descCol] || '') : '';
      let val = 0, tipoTx = 'despesa';

      if (creditCol >= 0 && debitCol >= 0) {
        const cr = parseBRL(cols[creditCol] || '0');
        const db = parseBRL(cols[debitCol]  || '0');
        if (!isNaN(cr) && cr > 0) { val = cr; tipoTx = 'receita'; }
        else if (!isNaN(db) && db > 0) { val = db; tipoTx = 'despesa'; }
        else continue;
      } else if (amtCol >= 0) {
        const v = parseBRL(cols[amtCol] || '');
        if (isNaN(v) || v === 0) continue;
        tipoTx = v > 0 ? 'receita' : 'despesa';
        val = Math.abs(v);
      } else continue;

      // Override with explicit tipo column (Inter, Nubank conta)
      if (tipoCol >= 0) {
        const t = unq(cols[tipoCol] || '').toLowerCase();
        if (/saída|saida|pix env|ted|compra|deb|boleto|tarifa|pgto/.test(t)) tipoTx = 'despesa';
        else if (/entrada|pix rec|crédito|credito|receb|salário|salario/.test(t)) tipoTx = 'receita';
      }

      txns.push({ tipo: tipoTx, val, desc: desc || 'Lançamento importado', data: dateStr, cat: guessCat(desc) });
    }
    return txns;
  }

  function detectDupe(tx) {
    return Object.values(db.txs).some(
      t => t.data === tx.data && Math.abs(t.val - tx.val) < 0.01 && t.tipo === tx.tipo
    );
  }

  function abrirImport() {
    importState = { txns: [], selected: new Set() };
    ['import-step-upload','import-step-preview','import-step-done'].forEach((id, i) => {
      document.getElementById(id).style.display = i === 0 ? '' : 'none';
    });
    document.getElementById('import-file-input').value = '';
    document.getElementById('import-error').textContent = '';
    document.getElementById('import-modal').style.display = 'flex';

    const zone = document.getElementById('import-drop-zone');
    zone.ondragover = e => { e.preventDefault(); zone.classList.add('dragover'); };
    zone.ondragleave = () => zone.classList.remove('dragover');
    zone.ondrop = e => {
      e.preventDefault();
      zone.classList.remove('dragover');
      const f = e.dataTransfer.files[0];
      if (f) handleImportFile({ files: [f] });
    };
  }

  function fecharImport() {
    document.getElementById('import-modal').style.display = 'none';
    render();
  }

  function handleImportFile(input) {
    const file = input.files[0];
    if (!file) return;
    document.getElementById('import-error').textContent = '';
    const ext = file.name.split('.').pop().toLowerCase();
    const reader = new FileReader();
    reader.onload = e => {
      const text = e.target.result;
      let txns = null, err = '';
      try {
        if (ext === 'ofx' || /STMTTRN/i.test(text)) {
          txns = parseOFX(text);
        } else {
          txns = parseCSV(text);
          if (txns === null) err = 'Não foi possível detectar as colunas. O arquivo precisa ter cabeçalho com "Data" e "Valor" (ou "Crédito"/"Débito").';
        }
      } catch (ex) {
        err = 'Erro ao processar arquivo: ' + ex.message;
      }
      if (err) { document.getElementById('import-error').textContent = err; return; }
      if (!txns || txns.length === 0) {
        document.getElementById('import-error').textContent = 'Nenhum lançamento encontrado no arquivo.';
        return;
      }
      renderImportPreview(txns);
    };
    reader.readAsText(file);
  }

  function renderImportPreview(txns) {
    importState.txns = txns;
    importState.selected = new Set(txns.map((_, i) => i));

    const catOpts = Object.keys(CAT_COLORS).map(c => `<option value="${c}">${c}</option>`).join('');

    document.getElementById('import-total').textContent = txns.length;
    document.getElementById('import-preview-list').innerHTML = txns.map((tx, i) => {
      const dupe = detectDupe(tx);
      const catSel = catOpts.replace(`value="${tx.cat}"`, `value="${tx.cat}" selected`);
      return `<div class="import-row${dupe ? ' import-dupe' : ''}">
        <label class="import-row-check">
          <input type="checkbox" checked id="ichk-${i}" onchange="App.importToggleRow(${i})">
        </label>
        <div class="import-row-info">
          <div class="import-row-top">
            <span class="import-row-date">${tx.data}</span>
            <span class="import-row-desc">${tx.desc}</span>
            ${dupe ? '<span class="import-dupe-badge" title="Possível duplicata">!</span>' : ''}
          </div>
          <div class="import-row-bottom">
            <select class="import-tipo" onchange="App.importSetTipo(${i},this.value)">
              <option value="despesa"${tx.tipo==='despesa'?' selected':''}>Despesa</option>
              <option value="receita"${tx.tipo==='receita'?' selected':''}>Receita</option>
            </select>
            <select class="import-cat" onchange="App.importSetCat(${i},this.value)">${catSel}</select>
            <span class="import-row-val ${tx.tipo==='receita'?'green':'red'}">${brl(tx.val)}</span>
          </div>
        </div>
      </div>`;
    }).join('');

    document.getElementById('import-confirm-count').textContent = txns.length;
    document.getElementById('import-step-upload').style.display = 'none';
    document.getElementById('import-step-preview').style.display = '';
  }

  function importSetTipo(i, val) { if (importState.txns[i]) importState.txns[i].tipo = val; }
  function importSetCat(i, val)  { if (importState.txns[i]) importState.txns[i].cat  = val; }

  function importToggleRow(i) {
    if (importState.selected.has(i)) importState.selected.delete(i);
    else importState.selected.add(i);
    document.getElementById('import-confirm-count').textContent = importState.selected.size;
  }

  function importSelectAll(v) {
    importState.txns.forEach((_, i) => {
      const chk = document.getElementById('ichk-' + i);
      if (chk) chk.checked = v;
      v ? importState.selected.add(i) : importState.selected.delete(i);
    });
    document.getElementById('import-confirm-count').textContent = importState.selected.size;
  }

  async function confirmarImport() {
    const indices = [...importState.selected].sort((a, b) => a - b);
    if (!indices.length) { mostrarToast('Selecione pelo menos um lançamento'); return; }

    document.getElementById('import-step-preview').style.display = 'none';
    document.getElementById('import-step-done').style.display = '';
    document.getElementById('import-done-spinner').style.display = '';
    document.getElementById('import-done-result').style.display = 'none';

    const base = Date.now();
    let ok = 0;
    for (let j = 0; j < indices.length; j++) {
      const tx = importState.txns[indices[j]];
      const success = await pushTx({ ...tx, id: base + j });
      if (success) ok++;
    }

    document.getElementById('import-done-spinner').style.display = 'none';
    document.getElementById('import-done-result').style.display = '';
    document.getElementById('import-done-count').textContent = ok;
    document.getElementById('import-done-total').textContent = indices.length;
    if (sbClient && cfg.casalId) loadAllFromSupabase();
  }

  /* ───── BOOT ───── */
  function boot() {
    loadCfg();
    document.getElementById('f-data') && (document.getElementById('f-data').value = today());

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }

    if (cfg.supabaseUrl || cfg.local) {
      if (cfg.local) {
        db.txs = localDB('txs', {});
        db.orcamentos = localDB('orcamentos', []);
        db.contas_fixas = localDB('contas_fixas', []);
        db.metas = localDB('metas', []);
      }
      initApp();
    } else {
      document.getElementById('setup-screen').style.display = 'flex';
      document.getElementById('app').style.display = 'none';
    }
  }

  document.addEventListener('DOMContentLoaded', boot);

  return {
    setup, setupLocal, copiarSQL, navTo, changeMonth, setTipo,
    addLancamento, deleteTx,
    addOrcamento, deleteOrcamento,
    addContaFixa, toggleContaFixa, deleteContaFixa,
    readComprovante, salvarAI, resetComp,
    openSettings, closeSettings, saveSettings, resetAll,
    logout, copiarComandoTelegram,
    gerarCasalId, copiarCasalId,
    abrirUpgrade, fecharUpgrade, selecionarPlano, assinar,
    renderHistorico, exportarPDF, deletarConta,
    checkContasVencendo, fecharBillBanner,
    addMeta, depositarMeta, deleteMeta,
    renderAnalise,
    abrirImport, fecharImport, handleImportFile,
    importSelectAll, importToggleRow, importSetTipo, importSetCat, confirmarImport,
    wizardNext, wizardBack
  };

})();
