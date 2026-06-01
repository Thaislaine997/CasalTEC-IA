const { createClient } = require('@supabase/supabase-js');
const rateLimit = require('./_rateLimit');
const { wrap } = require('./_sentry');

const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const BOT_TOKEN    = process.env.TELEGRAM_BOT_TOKEN;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

module.exports = wrap(async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();
  if (await rateLimit(req, res, { key: 'telegram-webhook', limit: 30, windowMs: 60_000 })) return;

  let update;
  try { update = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; }
  catch { return res.status(400).end(); }

  const msg = update.message || update.channel_post;
  if (!msg) return res.status(200).json({ ok: true });

  const chatId   = String(msg.chat.id);
  const text     = (msg.text || msg.caption || '').trim();
  const photo    = msg.photo || (msg.document?.mime_type?.startsWith('image/') ? [msg.document] : null);

  /* ── /conectar CASAL_ID ── */
  if (text.startsWith('/conectar')) {
    const casalId = text.split(/\s+/)[1]?.trim();
    if (!casalId || casalId.length < 8) {
      await send(chatId, '❌ Use: /conectar SEU_CASAL_ID\n\nEncontre o ID do casal em: app → Configurações → ID do casal.');
      return res.status(200).json({ ok: true });
    }
    await sb.from('telegram_grupos').upsert(
      { casal_id: casalId, chat_id: chatId, chat_title: msg.chat.title || msg.chat.first_name || 'Grupo', ativo: true },
      { onConflict: 'chat_id' }
    );
    await send(chatId, `✅ Grupo conectado!\n\nAgora toda foto de comprovante enviada aqui será lida pela IA e adicionada automaticamente ao FinanciadoCasal.\n\nTente encaminhar um comprovante agora! 📸`);
    return res.status(200).json({ ok: true });
  }

  /* ── /desconectar ── */
  if (text.startsWith('/desconectar')) {
    await sb.from('telegram_grupos').update({ ativo: false }).eq('chat_id', chatId);
    await send(chatId, '🔌 Grupo desconectado do FinanciadoCasal.');
    return res.status(200).json({ ok: true });
  }

  /* ── /status ── */
  if (text.startsWith('/status')) {
    const { data } = await sb.from('telegram_grupos').select('casal_id, ativo').eq('chat_id', chatId).single();
    if (data?.ativo) await send(chatId, `✅ Conectado ao casal: ${data.casal_id}`);
    else await send(chatId, '❌ Este grupo não está conectado. Use /conectar SEU_CASAL_ID');
    return res.status(200).json({ ok: true });
  }

  /* ── Fotos / comprovantes ── */
  if (!photo) return res.status(200).json({ ok: true });

  const { data: grupo } = await sb
    .from('telegram_grupos')
    .select('casal_id')
    .eq('chat_id', chatId)
    .eq('ativo', true)
    .single();

  if (!grupo) return res.status(200).json({ ok: true }); // grupo não conectado, ignora

  // Deduplicate: check if this message_id was already processed
  const msgKey = `tg_${msg.message_id}`;
  const { data: existing } = await sb.from('transacoes')
    .select('id').eq('casal_id', grupo.casal_id).eq('descricao', msgKey).limit(1);
  if (existing?.length) return res.status(200).json({ ok: true });

  try {
    // Highest resolution photo
    const fileId = Array.isArray(photo)
      ? photo[photo.length - 1].file_id
      : photo.file_id;

    // Get file download path from Telegram
    const fileInfoRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${fileId}`);
    const fileInfo = await fileInfoRes.json();
    if (!fileInfo.ok) throw new Error('Telegram getFile failed');

    // Download image buffer
    const imgRes = await fetch(`https://api.telegram.org/file/bot${BOT_TOKEN}/${fileInfo.result.file_path}`);
    const imgBuffer = await imgRes.arrayBuffer();
    const base64 = Buffer.from(imgBuffer).toString('base64');
    const mediaType = fileInfo.result.file_path.endsWith('.png') ? 'image/png' : 'image/jpeg';

    // Claude Vision: extract receipt data
    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 300,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
            {
              type: 'text',
              text: 'Este é um comprovante de pagamento ou nota fiscal brasileiro. Extraia APENAS: valor total pago (número), descrição do estabelecimento ou produto (texto curto, máx 40 chars), data (YYYY-MM-DD, use hoje se não visível), categoria mais provável entre: Moradia, Mercado, Alimentação, Transporte, Saúde, Lazer, Educação, Serviços, Outros. Responda SOMENTE JSON válido, sem markdown: {"valor": 0.00, "descricao": "", "data": "YYYY-MM-DD", "categoria": ""}'
            }
          ]
        }]
      })
    });

    const claudeData = await claudeRes.json();
    const raw = claudeData.content?.[0]?.text || '';
    const jsonStr = raw.match(/\{[\s\S]*?\}/)?.[0];
    if (!jsonStr) throw new Error('Claude returned no JSON');

    const parsed = JSON.parse(jsonStr);
    const valor = Math.abs(parseFloat(parsed.valor) || 0);
    if (valor === 0) throw new Error('Valor zero ou inválido');

    const today = new Date().toISOString().split('T')[0];

    await sb.from('transacoes').insert({
      casal_id: grupo.casal_id,
      tipo:      'despesa',
      descricao: parsed.descricao || 'Comprovante',
      valor,
      data:      parsed.data || today,
      cat:       parsed.categoria || 'Outros',
      pessoa:    'Os dois',
      via_ia:    true
    });

    const dataFormatada = (parsed.data || today).split('-').reverse().join('/');
    await send(chatId,
      `✅ *${parsed.descricao}*\n` +
      `💰 R$ ${valor.toFixed(2).replace('.', ',')}\n` +
      `📅 ${dataFormatada}\n` +
      `🏷️ ${parsed.categoria}\n\n` +
      `_Adicionado ao FinanciadoCasal!_`
    );
  } catch (e) {
    console.error('[telegram-webhook] erro:', e.message);
    await send(chatId, '⚠️ Não consegui ler este comprovante. Tente uma foto mais nítida, sem reflexos e com o valor visível.');
  }

  res.status(200).json({ ok: true });
});

async function send(chatId, text) {
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' })
  });
}
