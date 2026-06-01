const FROM = `FinanciadoCasal <${process.env.EMAIL_FROM || 'noreply@financeiadocasal.com.br'}>`;

function buildHtml({ casal }) {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="font-family:Inter,Arial,sans-serif;background:#f1f5f9;margin:0;padding:0;">
<table width="100%" cellpadding="0" cellspacing="0">
  <tr><td align="center" style="padding:40px 16px;">
    <table width="580" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08);max-width:100%;">
      <tr><td style="background:#0d1424;padding:28px 40px;text-align:center;">
        <p style="margin:0;font-size:22px;font-weight:700;color:#5ee7b0;font-family:Inter,Arial,sans-serif;">
          FinanciadoCasal
        </p>
      </td></tr>
      <tr><td style="padding:36px 40px;">
        <h1 style="margin:0 0 12px;font-size:24px;color:#0d1424;font-family:Inter,Arial,sans-serif;">
          Bem-vindos, ${casal}! 🎉
        </h1>
        <p style="margin:0 0 20px;color:#475569;line-height:1.7;font-size:15px;">
          Vocês acabaram de registrar o primeiro lançamento juntos. Isso é o começo de uma vida financeira mais organizada!
        </p>
        <p style="margin:0 0 24px;color:#475569;line-height:1.7;font-size:15px;">Com o <strong>FinanciadoCasal</strong> vocês podem:</p>
        <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:32px;">
          <tr><td style="padding:7px 0;color:#334155;font-size:14px;">💸 &nbsp;Lançar receitas e despesas do casal em segundos</td></tr>
          <tr><td style="padding:7px 0;color:#334155;font-size:14px;">📊 &nbsp;Ver gráficos e relatórios mensais detalhados</td></tr>
          <tr><td style="padding:7px 0;color:#334155;font-size:14px;">🔔 &nbsp;Receber alertas de contas a vencer</td></tr>
          <tr><td style="padding:7px 0;color:#334155;font-size:14px;">🎯 &nbsp;Criar e acompanhar metas de economia</td></tr>
          <tr><td style="padding:7px 0;color:#334155;font-size:14px;">🧾 &nbsp;Ler comprovantes automaticamente com IA</td></tr>
        </table>
        <div style="text-align:center;margin-bottom:32px;">
          <a href="https://financeiadocasal.com.br/app"
             style="display:inline-block;background:#5ee7b0;color:#0d1424;font-weight:700;font-size:15px;padding:14px 36px;border-radius:10px;text-decoration:none;">
            Abrir o app →
          </a>
        </div>
        <p style="margin:0;color:#94a3b8;font-size:12px;text-align:center;line-height:1.6;">
          Dúvidas? Responda este e-mail ou escreva para
          <a href="mailto:suporte@financeiadocasal.com.br" style="color:#5ee7b0;text-decoration:none;">suporte@financeiadocasal.com.br</a>
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

async function sendWelcomeEmail({ email, nomeEla, nomeEle, nome }) {
  if (!process.env.RESEND_API_KEY || !email) return false;

  const casal = (nomeEla && nomeEle)
    ? `${nomeEla} & ${nomeEle}`
    : (nome || 'vocês');

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: FROM,
      to: email,
      subject: `Bem-vindos ao FinanciadoCasal, ${casal}!`,
      html: buildHtml({ casal })
    })
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.error('[send-welcome] Resend error:', res.status, body);
    return false;
  }
  return true;
}

// HTTP handler — protected by CRON_SECRET, useful para testes manuais
async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const secret = (req.headers.authorization || '').replace('Bearer ', '').trim();
  if (!secret || secret !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { email, nomeEla, nomeEle, nome } = req.body || {};
  if (!email) return res.status(400).json({ error: 'email obrigatório' });

  const ok = await sendWelcomeEmail({ email, nomeEla, nomeEle, nome });
  return res.status(ok ? 200 : 500).json({ ok });
}

handler.sendWelcomeEmail = sendWelcomeEmail;
module.exports = handler;
