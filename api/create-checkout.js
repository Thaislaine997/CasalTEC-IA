const Stripe = require('stripe');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });

  const { casalId, plano, nome } = req.body;
  if (!casalId) return res.status(400).json({ error: 'casalId obrigatório' });

  const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
  const priceId = plano === 'anual'
    ? process.env.STRIPE_PRICE_ANUAL
    : process.env.STRIPE_PRICE_MENSAL;

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      mode: 'subscription',
      success_url: `${process.env.SITE_URL}?sucesso=1&casal=${casalId}`,
      cancel_url: `${process.env.SITE_URL}?cancelado=1`,
      metadata: { casal_id: casalId },
      subscription_data: { metadata: { casal_id: casalId } },
      locale: 'pt-BR',
      allow_promotion_codes: true,
      customer_email: undefined,
      custom_text: {
        submit: { message: `Assinatura para o casal ${nome || ''}`.trim() }
      }
    });

    return res.status(200).json({ url: session.url });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
