const { createClient } = require('@supabase/supabase-js');
const { wrap } = require('./_sentry');

const FROM = `FinanciadoCasal <${process.env.EMAIL_FROM || 'noreply@financeiadocasal.com.br'}>`;

const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

function brl(val) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
}

function pad(n) { return String(n).padStart(2, '0'); }

function buildHtml({ casal, mesNome, ano, receitas, despesas, topCats }) {
  const saldo = receitas - despesas;
  const saldoCor = saldo >= 0 ? '#22c55e' : '#ef4444';
  const saldoLabel = saldo >= 0 ? `+${brl(saldo)}` : brl(saldo);

  const catsHtml = topCats.length
    ? topCats.map(([cat, val]) => `
        <tr>
          <td style="padding:8px 0;color:#334155;font-size:14px;border-bottom:1px solid #f1f5f9;">${cat}</td>
          <td style="padding:8px 0;color:#ef4444;font-size:14px;font-weight:600;text-align:right;border-bottom:1px solid #f1f5f9;">${brl(val)}</td>
        </tr>`).join('')
    : `<tr><td colspan="2" style="color:#94a3b8;font-size:13px;padding:8px 0;">Nenhum gasto no mês.</td></tr>`;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="font-family:Inter,Arial,sans-serif;background:#f1f5f9;margin:0;padding:0;">
<table width="100%" cellpadding="0" cellspacing="0">
  <tr><td align="center" style="padding:40px 16px;">
    <table width="580" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08);max-width:100%;">
      <tr><td style="background:#0d1424;padding:28px 40px;">
        <p style="margin:0;font-size:13px;color:#5ee7b0;font-weight:600;text-transform:uppercase;letter-spacing:.8px;">Resumo Mensal</p>
        <h1 style="margin:6px 0 0;font-size:22px;color:#f1f5f9;font-family:Inter,Arial,sans-serif;">
          ${mesNome} ${ano} — ${casal}
        </h1>
      </td></tr>
      <tr><td style="padding:32px 40px;">

        <!-- Cards de resumo -->
        <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
          <tr>
            <td width="33%" style="padding-right:8px;">
              <div style="background:#f0fdf4;border-radius:12px;padding:16px;text-align:center;">
                <p style="margin:0 0 4px;font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.6px;">Receitas</p>
                <p style="margin:0;font-size:18px;font-weight:700;color:#22c55e;">${brl(receitas)}</p>
              </div>
            </td>
            <td width="33%" style="padding:0 4px;">
              <div style="background:#fff5f5;border-radius:12px;padding:16px;text-align:center;">
                <p style="margin:0 0 4px;font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.6px;">Despesas</p>
                <p style="margin:0;font-size:18px;font-weight:700;color:#ef4444;">${brl(despesas)}</p>
              </div>
            </td>
            <td width="33%" style="padding-left:8px;">
              <div style="background:#f8fafc;border-radius:12px;padding:16px;text-align:center;">
                <p style="margin:0 0 4px;font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.6px;">Saldo</p>
                <p style="margin:0;font-size:18px;font-weight:700;color:${saldoCor};">${saldoLabel}</p>
              </div>
            </td>
          </tr>
        </table>

        <!-- Top categorias -->
        <h2 style="margin:0 0 12px;font-size:16px;color:#0d1424;font-family:Inter,Arial,sans-serif;">
          Top categorias de despesa
        </h2>
        <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:32px;">
          ${catsHtml}
        </table>

        <div style="text-align:center;margin-bottom:28px;">
          <a href="https://financeiadocasal.com.br/app"
             style="display:inline-block;background:#5ee7b0;color:#0d1424;font-weight:700;font-size:15px;padding:14px 36px;border-radius:10px;text-decoration:none;">
            Ver relatório completo →
          </a>
        </div>
        <p style="margin:0;color:#94a3b8;font-size:12px;text-align:center;line-height:1.6;">
          Este resumo é enviado automaticamente todo dia 1º.
          <a href="https://financeiadocasal.com.br/app" style="color:#5ee7b0;text-decoration:none;">Acesse o app</a> para ver gráficos detalhados.
        </p>
      </td></tr>
      <tr><td style="background:#f8fafc;padding:18px 40px;text-align:center;border-top:1px solid #e2e8f0;">
        <p style="margin:0;font-size:11px;color:#94a3b8;">
          © 2026 FinanciadoCasal &nbsp;·&nbsp;
          <a href="https://financeiadocasal.com.br/privacidade" style="color:#94a3b8;text-decoration:none;">Privacidade</a>
          &nbsp;·&nbsp;
          <a href="https://financeiadocasal.com.br/termos" style="color:#94a3b8;text-decoration:none;">Termos</a>
        </p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}

async function sendEmail({ to, subject, html }) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ from: FROM, to, subject, html })
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.error('[monthly-report] Resend error:', res.status, body);
  }
  return res.ok;
}

module.exports = wrap(async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const secret = (req.headers.authorization || '').replace('Bearer ', '').trim();
  if (!secret || secret !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!process.env.RESEND_API_KEY) {
    return res.status(500).json({ error: 'RESEND_API_KEY não configurada' });
  }

  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  // Mês anterior
  const now = new Date();
  const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const ano = prevMonth.getFullYear();
  const mes = prevMonth.getMonth(); // 0-indexed
  const mesStr = `${ano}-${pad(mes + 1)}`;
  const mesInicio = `${mesStr}-01`;
  const mesFim = `${mesStr}-31`;
  const mesNome = MONTH_NAMES[mes];

  // Buscar todos os usuários (paginado)
  const users = [];
  let page = 1;
  while (true) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 1000 });
    if (error || !data?.users?.length) break;
    users.push(...data.users);
    if (data.users.length < 1000) break;
    page++;
  }

  if (!users.length) return res.status(200).json({ ok: true, sent: 0 });

  // Agrupar emails por casalId
  const casalEmails = {};
  for (const u of users) {
    const casalId = u.user_metadata?.casal_id;
    if (!casalId || !u.email) continue;
    if (!casalEmails[casalId]) {
      casalEmails[casalId] = {
        emails: [],
        nomeEla: u.user_metadata?.nomeEla || '',
        nomeEle: u.user_metadata?.nomeEle || '',
        nome: u.user_metadata?.nome || ''
      };
    }
    casalEmails[casalId].emails.push(u.email);
  }

  const casalIds = Object.keys(casalEmails);
  if (!casalIds.length) return res.status(200).json({ ok: true, sent: 0 });

  // Buscar transações do mês anterior em bulk
  const { data: txs } = await sb
    .from('transacoes')
    .select('casal_id, tipo, val, cat')
    .in('casal_id', casalIds)
    .gte('data', mesInicio)
    .lte('data', mesFim);

  // Agregar por casalId
  const stats = {};
  for (const tx of txs || []) {
    if (!stats[tx.casal_id]) stats[tx.casal_id] = { receitas: 0, despesas: 0, cats: {} };
    const v = parseFloat(tx.val) || 0;
    if (tx.tipo === 'receita') {
      stats[tx.casal_id].receitas += v;
    } else {
      stats[tx.casal_id].despesas += v;
      stats[tx.casal_id].cats[tx.cat] = (stats[tx.casal_id].cats[tx.cat] || 0) + v;
    }
  }

  let sent = 0;
  const subject = `Resumo de ${mesNome} ${ano} — FinanciadoCasal`;

  for (const casalId of casalIds) {
    const st = stats[casalId];
    if (!st) continue; // casal sem transações no mês, não envia

    const topCats = Object.entries(st.cats)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    const { emails, nomeEla, nomeEle, nome } = casalEmails[casalId];
    const casal = (nomeEla && nomeEle) ? `${nomeEla} & ${nomeEle}` : (nome || 'Casal');

    const html = buildHtml({
      casal, mesNome, ano,
      receitas: st.receitas,
      despesas: st.despesas,
      topCats
    });

    for (const email of emails) {
      const ok = await sendEmail({ to: email, subject, html });
      if (ok) sent++;
    }
  }

  console.log(`[monthly-report] ${mesNome} ${ano}: ${sent} emails enviados`);
  return res.status(200).json({ ok: true, sent });
});
