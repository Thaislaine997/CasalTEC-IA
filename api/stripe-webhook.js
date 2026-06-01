const Stripe = require('stripe');
const { createClient } = require('@supabase/supabase-js');
const { wrap } = require('./_sentry');

// In-memory dedup: Stripe may redeliver events on non-200 or timeouts
const processedEvents = new Set();
const MAX_EVENTS = 1000;

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

const handler = wrap(async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const rawBody = await getRawBody(req);
  const sig = req.headers['stripe-signature'];

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook inválido:', err.message);
    return res.status(400).json({ error: `Webhook error: ${err.message}` });
  }

  // Deduplicate: Stripe retries events on non-200 or timeouts
  if (processedEvents.has(event.id)) {
    return res.status(200).json({ received: true, duplicate: true });
  }
  processedEvents.add(event.id);
  if (processedEvents.size > MAX_EVENTS) {
    processedEvents.delete(processedEvents.values().next().value);
  }

  const obj = event.data.object;
  const casalId = obj.metadata?.casal_id
    || obj.subscription_details?.metadata?.casal_id;

  console.log(`Evento: ${event.type} | casal_id: ${casalId}`);

  if (!casalId) return res.status(200).json({ received: true, aviso: 'sem casal_id' });

  try {
    switch (event.type) {

      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const sub = obj;
        await supabase.from('assinaturas').upsert({
          casal_id: casalId,
          stripe_customer_id: sub.customer,
          stripe_subscription_id: sub.id,
          plano: 'pro',
          status: sub.status,
          periodo_fim: new Date(sub.current_period_end * 1000).toISOString(),
          updated_at: new Date().toISOString()
        }, { onConflict: 'casal_id' });
        break;
      }

      case 'customer.subscription.deleted': {
        await supabase.from('assinaturas').upsert({
          casal_id: casalId,
          stripe_subscription_id: obj.id,
          plano: 'free',
          status: 'canceled',
          periodo_fim: null,
          updated_at: new Date().toISOString()
        }, { onConflict: 'casal_id' });
        break;
      }

      case 'invoice.payment_succeeded': {
        await supabase.from('assinaturas')
          .update({ status: 'active', updated_at: new Date().toISOString() })
          .eq('casal_id', casalId);
        break;
      }

      case 'invoice.payment_failed': {
        await supabase.from('assinaturas')
          .update({ status: 'past_due', updated_at: new Date().toISOString() })
          .eq('casal_id', casalId);
        break;
      }
    }
  } catch (err) {
    console.error('Erro ao atualizar Supabase:', err.message);
  }

  return res.status(200).json({ received: true });
}, { api: { bodyParser: false } });
module.exports = handler;
