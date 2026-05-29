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
  let db = { txs: {}, orcamentos: [], contas_fixas: [] };
  let sbClient = null;
  let realtimeChannel = null;

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
        if (c.chave === 'orcamentos' || c.chave === 'contas_fixas') {
          db[c.chave] = c.valor || [];
        }
      });
      setSyncStatus('synced');
    } catch { setSyncStatus('offline'); }
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
    db.txs[tx.id] = tx;
    if (!sbClient || !cfg.casalId) { saveLocalDB('txs', db.txs); return; }
    setSyncStatus('syncing');
    const { error } = await sbClient.from('transacoes').upsert({
      id: tx.id, casal_id: cfg.casalId,
      tipo: tx.tipo, val: tx.val,
      descricao: tx.desc, data: tx.data,
      cat: tx.cat, pessoa: tx.pessoa,
      ai_import: tx.aiImport || false
    });
    setSyncStatus(error ? 'offline' : 'synced');
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

  function setup() {
    const url = document.getElementById('setup-supabase-url').value.trim();
    const key = document.getElementById('setup-supabase-key').value.trim();
    const casalId = document.getElementById('setup-casal-id').value.trim();
    const apiKey = document.getElementById('setup-api-key').value.trim();
    const nome = document.getElementById('setup-nome').value.trim();

    if (!url) { alert('Informe a URL do projeto Supabase.'); return; }
    if (!url.startsWith('https://')) { alert('URL deve começar com https://'); return; }
    if (!key) { alert('Informe a chave anon do Supabase.'); return; }
    if (!casalId) { alert('Gere ou cole o ID do casal.'); return; }

    cfg = { supabaseUrl: url, supabaseKey: key, casalId, apiKey, nome: nome || 'Finanças do Casal' };
    saveCfg();
    initApp();
  }

  function setupLocal() {
    cfg = { nome: 'Finanças do Casal', local: true };
    saveCfg();
    db.txs = localDB('txs', {});
    db.orcamentos = localDB('orcamentos', []);
    db.contas_fixas = localDB('contas_fixas', []);
    initApp();
  }

  function initApp() {
    document.getElementById('setup-screen').style.display = 'none';
    document.getElementById('app').style.display = 'flex';
    document.getElementById('header-nome').textContent = cfg.nome || 'Finanças do Casal';
    document.getElementById('f-data').value = today();

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
    await pushTx(tx);
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

    if (!cfg.apiKey) {
      document.getElementById('no-ai-key').style.display = 'flex';
      return;
    }

    document.getElementById('ai-loading').style.display = 'flex';
    document.getElementById('ai-result').style.display = 'none';
    document.getElementById('no-ai-key').style.display = 'none';

    const reader = new FileReader();
    reader.onload = async (e) => {
      const b64 = e.target.result.split(',')[1];
      const mt = file.type || 'image/jpeg';
      try {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': cfg.apiKey,
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true'
          },
          body: JSON.stringify({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 800,
            messages: [{
              role: 'user',
              content: [
                { type: 'image', source: { type: 'base64', media_type: mt, data: b64 } },
                {
                  type: 'text',
                  text: `Analise este comprovante/recibo financeiro brasileiro e extraia as informações. Responda APENAS com JSON puro sem markdown: {"descricao":"nome do estabelecimento ou tipo (ex: Mercado Extra, PIX para João, Farmácia)","valor":numero_sem_formatacao,"data":"YYYY-MM-DD","categoria":"exatamente uma de: Moradia, Mercado, Alimentação, Transporte, Saúde, Lazer, Educação, Serviços, Outros"}. Se não encontrar a data, use ${today()}. Se não encontrar o valor, use 0.`
                }
              ]
            }]
          })
        });
        const data = await res.json();
        const txt = (data.content || []).map(c => c.text || '').join('');
        const clean = txt.replace(/```json|```/g, '').trim();
        const parsed = JSON.parse(clean);
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
    await pushTx(tx);
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
    document.getElementById('cfg-api-key').value = cfg.apiKey || '';
    document.getElementById('cfg-nome').value = cfg.nome || '';
    document.getElementById('settings-modal').style.display = 'flex';
  }

  function closeSettings() {
    document.getElementById('settings-modal').style.display = 'none';
  }

  async function saveSettings() {
    cfg.supabaseUrl = document.getElementById('cfg-supabase-url').value.trim();
    cfg.supabaseKey = document.getElementById('cfg-supabase-key').value.trim();
    cfg.casalId = document.getElementById('cfg-casal-id').value.trim();
    cfg.apiKey = document.getElementById('cfg-api-key').value.trim();
    cfg.nome = document.getElementById('cfg-nome').value.trim() || 'Finanças do Casal';
    cfg.local = !cfg.supabaseUrl;
    saveCfg();
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

    renderCharts(txs, despTxs, rec, desp);
    renderHistorico();
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
      const pessoas = ['Ele', 'Ela', 'Os dois'];
      const mk = mkey(curDate);
      const totais = pessoas.map(p => ({
        nome: p,
        val: Object.values(db.txs)
          .filter(t => t.tipo === 'despesa' && t.pessoa === p && t.data && t.data.startsWith(mk))
          .reduce((s, t) => s + t.val, 0)
      }));
      const max = Math.max(...totais.map(t => t.val), 1);
      splitEl.innerHTML = totais.map(p => `
        <div class="split-row">
          <div class="split-name">${p.nome}</div>
          <div class="split-bar-wrap">
            <div class="split-bar" style="width:${Math.round(p.val / max * 100)}%;background:${p.nome === 'Ele' ? '#7eb8f5' : p.nome === 'Ela' ? '#ec4899' : '#5ee7b0'}"></div>
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

  /* ───── BOOT ───── */
  function boot() {
    loadCfg();
    document.getElementById('f-data') && (document.getElementById('f-data').value = today());

    if (cfg.supabaseUrl || cfg.local) {
      if (cfg.local) {
        db.txs = localDB('txs', {});
        db.orcamentos = localDB('orcamentos', []);
        db.contas_fixas = localDB('contas_fixas', []);
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
    gerarCasalId, copiarCasalId,
    abrirUpgrade, fecharUpgrade, selecionarPlano, assinar,
    renderHistorico
  };

})();
