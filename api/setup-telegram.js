// One-time setup: registers the Telegram webhook URL with the Bot API
// Call once: GET /api/setup-telegram?secret=YOUR_ADMIN_TOKEN
module.exports = async (req, res) => {
  if (req.query.secret !== process.env.ADMIN_SECRET) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const webhookUrl = `${process.env.SITE_URL}/api/telegram-webhook`;
  const result = await fetch(
    `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/setWebhook`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url: webhookUrl, allowed_updates: ['message', 'channel_post'] })
    }
  );
  const data = await result.json();
  res.json({ webhookUrl, telegram: data });
};
