const { createClient } = require('@supabase/supabase-js');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método não permitido' });

  const { casalId } = req.query;
  if (!casalId) return res.status(400).json({ error: 'casalId obrigatório' });

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { data, error } = await supabase
    .from('assinaturas')
    .select('plano, status, periodo_fim')
    .eq('casal_id', casalId)
    .single();

  if (error || !data) {
    return res.status(200).json({ plano: 'free', status: 'none', ativo: false });
  }

  const ativo = data.plano === 'pro'
    && ['active', 'trialing'].includes(data.status)
    && (data.periodo_fim ? new Date(data.periodo_fim) > new Date() : true);

  return res.status(200).json({
    plano: data.plano,
    status: data.status,
    periodo_fim: data.periodo_fim,
    ativo
  });
};
