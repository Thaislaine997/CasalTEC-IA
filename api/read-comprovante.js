const Anthropic = require('@anthropic-ai/sdk');
const { wrap } = require('./_sentry');

module.exports = wrap(async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });

  const { imageBase64, mediaType, today } = req.body;
  if (!imageBase64 || !mediaType) return res.status(400).json({ error: 'imageBase64 e mediaType são obrigatórios' });

  if (!process.env.ANTHROPIC_API_KEY) return res.status(503).json({ error: 'IA não configurada' });

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  try {
    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 800,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } },
          {
            type: 'text',
            text: `Analise este comprovante/recibo financeiro brasileiro e extraia as informações. Responda APENAS com JSON puro sem markdown: {"descricao":"nome do estabelecimento ou tipo (ex: Mercado Extra, PIX para João, Farmácia)","valor":numero_sem_formatacao,"data":"YYYY-MM-DD","categoria":"exatamente uma de: Moradia, Mercado, Alimentação, Transporte, Saúde, Lazer, Educação, Serviços, Outros"}. Se não encontrar a data, use ${today || new Date().toISOString().split('T')[0]}. Se não encontrar o valor, use 0.`
          }
        ]
      }]
    });

    const txt = (message.content || []).map(c => c.text || '').join('');
    const clean = txt.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);
    return res.status(200).json(parsed);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});
