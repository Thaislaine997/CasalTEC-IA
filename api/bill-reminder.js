const { createClient } = require('@supabase/supabase-js');
const { wrap } = require('./_sentry');

const FROM = `FinanciadoCasal <${process.env.EMAIL_FROM || 'noreply@financeiadocasal.com.br'}>`;

function brl(val) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
}

function pad(n) { return String(n).padStart(2, '0'); }

// Mesma lógica do app.js: mkey = "YYYY-MM"
function mkey(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

function buildHtml({ casal, contas }) {
  const rows = contas.map(({ nome, val, dia, diffDias }) => {
    const quando = diffDias === 0 ? 'hoje' : diffDias === 1 ? 'amanhã' : `em ${diffDias} dias`;
    const urgencia = diffDias === 0 ? '#ef4444' : diffDias === 1 ? '#f97316' : '#f59e0b';
    return `
      <tr>
        <td style="padding:12px 0;border-bottom:1px solid #f1f5f9;">
          <p style="margin:0;font-size:15px;font-weight:600;color:#0d1424;">${nome}</p>
          <p style="margin:2px 0 0;font-size:13px;color:#64748b;">Vence dia ${dia} — <span style="color:${urgencia};font-weight:600;">${quando}</span></p>
        </td>
        <td style="padding:12px 0;border-bottom:1px solid #f1f5f9;text-align:right;vertical-align:top;">
          <p style="margin:0;font-size:15px;font-weight:700;color:#334155;">${brl(val)}</p>
        </td>
      </tr>`;
  }).join('');

  const total = contas.reduce((s, c) => s + c.val, 0);

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="font-family:Inter,Arial,sans-serif;background:#f1f5f9;margin:0;padding:0;">
<table width="100%" cellpadding="0" cellspacing="0">
  <tr><td align="center" style="padding:40px 16px;">
    <table width="580" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08);max-width:100%;">
      <tr><td style="background:#0d1424;padding:28px 40px;">
        <p style="margin:0;font-size:13px;color:#f97316;font-weight:600;text-transform:uppercase;letter-spacing:.8px;">⚠️ Atenção</p>
        <h1 style="margin:6px 0 0;font-size:22px;color:#f1f5f9;font-family:Inter,Arial,sans-serif;">
          Contas a vencer — ${casal}
        </h1>
      </td></tr>
      <tr><td style="padding:32px 40px;">
        <p style="margin:0 0 24px;color:#475569;line-height:1.7;font-size:15px;">
          ${contas.length === 1 ? 'A seguinte conta está' : 'As seguintes contas estão'} vencendo em breve e ainda não ${contas.length === 1 ? 'foi marcada' : 'foram marcadas'} como paga${contas.length === 1 ? '' : 's'}:
        </p>

        <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
          ${rows}
          <tr>
            <td style="padding:12px 0;font-size:14px;font-weight:600;color:#64748b;">Total</td>
            <td style="padding:12px 0;font-size:16px;font-weight:700;color:#0d1424;text-align:right;">${brl(total)}</td>
          </tr>
        </table>

        <div style="text-align:center;margin-bottom:28px;">
          <a href="https://financeiadocasal.com.br/app"
             style="display:inline-block;background:#5ee7b0;color:#0d1424;font-weight:700;font-size:15px;padding:14px 36px;border-radius:10px;text-decoration:none;">
            Marcar como pago →
          </a>
        </div>
        <p style="margin:0;color:#94a3b8;font-size:12px;text-align:center;line-height:1.6;">
          Este lembrete é enviado automaticamente quando há contas vencendo em até 3 dias.
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
    console.error('[bill-reminder] Resend error:', res.status, body);
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

  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const mk = mkey(hoje);

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

  // Buscar configs (contas_fixas) em bulk
  const { data: cfgRows } = await sb
    .from('configs')
    .select('casal_id, valor')
    .eq('chave', 'contas_fixas')
    .in('casal_id', casalIds);

  let sent = 0;

  for (const row of cfgRows || []) {
    const casalId = row.casal_id;
    const contasFixas = Array.isArray(row.valor) ? row.valor : [];

    // Filtrar contas vencendo em até 3 dias e não pagas neste mês
    const vencendo = contasFixas.filter(cf => {
      if ((cf.pago || []).includes(mk)) return false;
      const diaVenc = parseInt(cf.dia) || 1;
      const venc = new Date(hoje.getFullYear(), hoje.getMonth(), diaVenc);
      if (venc < hoje) return false;
      const diffDias = Math.ceil((venc - hoje) / 86400000);
      return diffDias <= 3;
    }).map(cf => {
      const diaVenc = parseInt(cf.dia) || 1;
      const venc = new Date(hoje.getFullYear(), hoje.getMonth(), diaVenc);
      return {
        nome: cf.nome,
        val: parseFloat(cf.val) || 0,
        dia: diaVenc,
        diffDias: Math.ceil((venc - hoje) / 86400000)
      };
    }).sort((a, b) => a.diffDias - b.diffDias);

    if (!vencendo.length) continue;

    const info = casalEmails[casalId];
    if (!info) continue;

    const casal = (info.nomeEla && info.nomeEle)
      ? `${info.nomeEla} & ${info.nomeEle}`
      : (info.nome || 'Casal');

    const subject = vencendo.length === 1
      ? `⚠️ "${vencendo[0].nome}" vence ${vencendo[0].diffDias === 0 ? 'hoje' : vencendo[0].diffDias === 1 ? 'amanhã' : `em ${vencendo[0].diffDias} dias`}`
      : `⚠️ ${vencendo.length} contas vencendo em breve — FinanciadoCasal`;

    const html = buildHtml({ casal, contas: vencendo });

    for (const email of info.emails) {
      const ok = await sendEmail({ to: email, subject, html });
      if (ok) sent++;
    }
  }

  console.log(`[bill-reminder] ${hoje.toISOString().slice(0, 10)}: ${sent} emails enviados`);
  return res.status(200).json({ ok: true, sent });
});
