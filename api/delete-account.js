const { createClient } = require('@supabase/supabase-js');
const { wrap } = require('./_sentry');

module.exports = wrap(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', 'https://financeiadocasal.com.br');
  res.setHeader('Access-Control-Allow-Methods', 'DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'DELETE') return res.status(405).json({ error: 'Método não permitido' });

  const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
  if (!token) return res.status(401).json({ error: 'Token obrigatório' });

  const sb = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // Verify JWT and get user
  const { data: { user }, error: authErr } = await sb.auth.getUser(token);
  if (authErr || !user) return res.status(401).json({ error: 'Token inválido ou expirado' });

  const casalId = user.user_metadata?.casal_id;
  if (!casalId) return res.status(400).json({ error: 'Usuário sem casal associado' });

  // Cancel Stripe subscription if active
  const { data: ass } = await sb
    .from('assinaturas')
    .select('stripe_subscription_id')
    .eq('casal_id', casalId)
    .single();

  if (ass?.stripe_subscription_id) {
    try {
      await fetch(`https://api.stripe.com/v1/subscriptions/${ass.stripe_subscription_id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}` }
      });
    } catch (e) {
      console.error('[delete-account] Stripe cancel error:', e.message);
    }
  }

  // Delete all casal data
  await sb.from('transacoes').delete().eq('casal_id', casalId);
  await sb.from('configs').delete().eq('casal_id', casalId);
  await sb.from('telegram_grupos').delete().eq('casal_id', casalId);
  await sb.from('assinaturas').delete().eq('casal_id', casalId);

  // Delete auth user (must be last)
  const { error: deleteErr } = await sb.auth.admin.deleteUser(user.id);
  if (deleteErr) {
    console.error('[delete-account] deleteUser error:', deleteErr.message);
    return res.status(500).json({ error: 'Erro ao excluir conta. Contate suporte.' });
  }

  return res.status(200).json({ ok: true });
});
