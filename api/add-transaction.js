const { createClient } = require('@supabase/supabase-js');
const { sendWelcomeEmail } = require('./send-welcome');
const { wrap } = require('./_sentry');

const FREE_TX_LIMIT = 30;
const FREE_AI_LIMIT = 5;

module.exports = wrap(async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://financeiadocasal.com.br');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });

  const { casalId, tipo, val, descricao, data, cat, pessoa, aiImport, id, userEmail, userNomeEla, userNomeEle, userNome } = req.body || {};

  if (!casalId) return res.status(400).json({ error: 'casalId obrigatório' });
  if (!tipo || !val || !descricao || !data) return res.status(400).json({ error: 'Campos obrigatórios: tipo, val, descricao, data' });
  if (!['receita', 'despesa'].includes(tipo)) return res.status(400).json({ error: 'tipo inválido' });
  if (typeof val !== 'number' || val <= 0 || val > 1_000_000) return res.status(400).json({ error: 'valor inválido' });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return res.status(400).json({ error: 'data inválida' });

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // Check subscription
  const { data: ass } = await supabase
    .from('assinaturas')
    .select('plano, status, periodo_fim')
    .eq('casal_id', casalId)
    .single();

  const isPro = ass
    && ass.plano === 'pro'
    && ['active', 'trialing'].includes(ass.status)
    && (ass.periodo_fim ? new Date(ass.periodo_fim) > new Date() : true);

  if (!isPro) {
    // Count transactions this month
    const monthStart = data.substring(0, 7) + '-01';
    const monthEnd = data.substring(0, 7) + '-31';

    const { count: txCount } = await supabase
      .from('transacoes')
      .select('id', { count: 'exact', head: true })
      .eq('casal_id', casalId)
      .gte('data', monthStart)
      .lte('data', monthEnd);

    if (txCount >= FREE_TX_LIMIT) {
      return res.status(403).json({
        error: 'limite_plano',
        message: `Plano Free: limite de ${FREE_TX_LIMIT} lançamentos por mês atingido. Assine o Pro para lançamentos ilimitados.`
      });
    }

    if (aiImport) {
      const { count: aiCount } = await supabase
        .from('transacoes')
        .select('id', { count: 'exact', head: true })
        .eq('casal_id', casalId)
        .eq('ai_import', true)
        .gte('data', monthStart)
        .lte('data', monthEnd);

      if (aiCount >= FREE_AI_LIMIT) {
        return res.status(403).json({
          error: 'limite_plano',
          message: `Plano Free: limite de ${FREE_AI_LIMIT} comprovantes por IA por mês atingido. Assine o Pro para uso ilimitado.`
        });
      }
    }
  }

  const txId = id || Date.now();
  const { error } = await supabase.from('transacoes').upsert({
    id: txId,
    casal_id: casalId,
    tipo,
    val,
    descricao,
    data,
    cat: cat || 'Outros',
    pessoa: pessoa || '',
    ai_import: aiImport || false
  });

  if (error) {
    console.error('add-transaction error:', error);
    return res.status(500).json({ error: 'Erro ao salvar lançamento' });
  }

  // Dispara welcome email no 1º lançamento do casal (fire-and-forget)
  if (userEmail) {
    supabase
      .from('transacoes')
      .select('id', { count: 'exact', head: true })
      .eq('casal_id', casalId)
      .then(({ count }) => {
        if (count === 1) {
          sendWelcomeEmail({ email: userEmail, nomeEla: userNomeEla, nomeEle: userNomeEle, nome: userNome })
            .catch(e => console.error('[add-transaction] welcome email error:', e.message));
        }
      })
      .catch(() => {});
  }

  return res.status(200).json({ ok: true, id: txId });
});
