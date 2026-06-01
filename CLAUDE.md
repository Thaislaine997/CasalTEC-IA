# CLAUDE.md — FinanciadoCasal

## Stack

| Camada | Tecnologia |
|--------|-----------|
| Frontend | HTML5 + CSS3 + JS Vanilla + PWA |
| Backend | Vercel Serverless Functions (Node.js) |
| Banco | Supabase (PostgreSQL + Realtime WebSocket) |
| IA | Anthropic Claude Vision (claude-haiku-4-5-20251001) — server-side via proxy |
| Pagamentos | Stripe (Checkout + Webhooks + Portal) |
| Email | Resend (transacional + crons) |
| Domínio | financeiadocasal.com.br (Vercel DNS) |

---

## Arquitetura de arquivos

```
/
├── index.html              # Landing page pública
├── app.html                # Dashboard do app
├── login.html              # Login Supabase Auth
├── register.html           # Registro + criar/entrar em casal
├── reset-password.html     # Recuperação de senha
├── privacidade.html        # Política de privacidade (LGPD)
├── termos.html             # Termos de uso
├── manifest.json           # PWA manifest
├── sw.js                   # Service worker (cache-first / network-first)
├── icons/
│   ├── icon.svg            # Ícone fonte
│   ├── icon-192.png        # PWA — splash / home screen
│   └── icon-512.png        # PWA — maskable / Play Store
├── css/
│   ├── landing.css
│   └── style.css
├── js/
│   └── app.js
├── api/
│   ├── _rateLimit.js           # Helper sliding window — Upstash Redis com fallback in-memory
│   ├── _sentry.js              # Wrapper lazy Sentry — no-op sem SENTRY_DSN
│   ├── add-transaction.js      # Inserção server-side + disparo de welcome email no 1º lançamento
│   ├── delete-account.js       # LGPD Art.18: apaga dados + cancela Stripe + deleta Auth
│   ├── read-comprovante.js     # Proxy IA (Anthropic key nunca vai ao cliente)
│   ├── create-checkout.js      # Rate limited: 5 req/IP/60s
│   ├── stripe-webhook.js       # Deduplicação por event.id + upsert idempotente
│   ├── customer-portal.js      # Rate limited: 10 req/IP/60s
│   ├── check-subscription.js   # Rate limited: 30 req/IP/60s
│   ├── telegram-webhook.js     # Bot Telegram + Claude Vision + rate limit 30 req/IP/60s
│   ├── setup-telegram.js       # One-time: registra webhook no Telegram
│   ├── send-welcome.js         # Email de boas-vindas (exporta sendWelcomeEmail)
│   ├── monthly-report.js       # Vercel Cron: resumo mensal (dia 1 às 8h BRT)
│   └── bill-reminder.js        # Vercel Cron: lembrete de contas vencendo (diário às 8h BRT)
├── vercel.json
└── package.json
```

---

## Funcionalidades implementadas ✅

**Produto:** Lançamentos, Orçamentos, Contas fixas, Histórico, **Análise mensal** (taxa de poupança, evolução vs mês anterior, insights automáticos, situação de contas, metas + gráficos), Saldo por cônjuge, Export PDF, Metas de economia, Notificações de contas vencendo, Sync Realtime, Modo local, **Importador OFX/CSV** (Itaú/Bradesco/BB/Santander via OFX; Nubank/Inter/C6/BB via CSV — client-side, modal preview + deduplicação visual).

**Auth e segurança:** Login/Registro/Recuperação, Logout, Proxy IA server-side, Rate limiting Upstash Redis com fallback in-memory (create-checkout/customer-portal/check-subscription/telegram-webhook), CORS restrito, Limites Free server-side, Consentimento LGPD, Exclusão de conta (LGPD Art. 18), Telegram idempotência por message_id, Stripe webhook deduplicação por event.id, Sentry lazy-init (`_sentry.js` wrap em todos os handlers).

**Email:** Boas-vindas (1º lançamento), Resumo mensal (Cron dia 1), Lembrete contas vencendo (Cron diário).

**Infra e UX:** Bot Telegram + Claude Vision, PWA (manifest + service worker), Wizard de onboarding 2 passos, Stripe Pro (mensal + anual) + Webhook + Portal, Landing page, Páginas legais (LGPD), Tabela `assinaturas` com RLS, **Importador OFX/CSV client-side** (parseOFX + parseCSV em `js/app.js`, modal com preview + seleção + deduplicação visual, suporte Itaú/Bradesco/BB/Santander via OFX e Nubank/Inter/C6/BB via CSV).

---

## Ações manuais pendentes ⚠️

| Item | Onde | O que fazer |
|------|------|-------------|
| **Novos preços Stripe** | Stripe Dashboard → Products | Criar preços: R$29,90/mês e R$287,90/ano → atualizar `STRIPE_PRICE_MENSAL` e `STRIPE_PRICE_ANUAL` |
| Webhook Stripe | Stripe Dashboard → Webhooks | URL: `https://financeiadocasal.com.br/api/stripe-webhook`, eventos: subscription + invoice |
| Tabela `telegram_grupos` | Supabase SQL Editor | Ver SQL abaixo |
| Bot Telegram | @BotFather + Vercel | Ver seção abaixo |
| Auth redirect URLs | Supabase Auth → Settings | Site URL + Redirect URLs para `/login` e `/reset-password` |
| Email confirmação | Supabase Auth → Email Templates | Personalizar emails de confirmação e reset |
| **CRON_SECRET** | Vercel → Environment Variables | Gerar string aleatória forte |

---

## Roadmap — próximos itens

### PRIORIDADE 4 — Open Finance (Pluggy) — só após ~50 casais Pro
> MVP já entregue: importação OFX/CSV client-side (custo zero). Pluggy (~R$500/mês fixo) só vale após diluição em volume.
- **Serviço:** pluggy.ai — Open Finance homologado no Brasil (~$99/mês 500 conexões)
- **Variáveis:** `PLUGGY_CLIENT_ID`, `PLUGGY_CLIENT_SECRET`
- **Nova tabela Supabase:**
  ```sql
  create table conexoes_bancarias (
    id uuid default gen_random_uuid() primary key,
    casal_id text not null,
    pluggy_item_id text not null,
    banco text,
    last_sync timestamptz,
    created_at timestamptz default now()
  );
  ```
- **Cron:** `/api/pluggy-sync-all` todo dia às 6h

### PRIORIDADE 6 — App nativo (MRR > R$2k)
- React Native + Expo + push notifications

### PRIORIDADE 7 — Growth
- SEO: og:image, og:title, `sitemap.xml`, `robots.txt`
- Programa de indicação: `?ref=CASAL_ID` → coupon Stripe
- `@financiadocasal` Instagram e TikTok

---

## Configurar Bot Telegram

1. @BotFather → `/newbot` → copiar TOKEN
2. Vercel: adicionar `TELEGRAM_BOT_TOKEN=TOKEN` e `ADMIN_SECRET=senha_forte`
3. Deploy → `GET https://financeiadocasal.com.br/api/setup-telegram?secret=SUA_ADMIN_SECRET`
4. Telegram: criar grupo → adicionar bot → `/conectar SEU_CASAL_ID`

**SQL:**
```sql
create table telegram_grupos (
  id uuid default gen_random_uuid() primary key,
  casal_id text not null,
  chat_id text not null unique,
  chat_title text,
  ativo boolean default true,
  created_at timestamptz default now()
);
alter table telegram_grupos enable row level security;
drop policy if exists "service_role_telegram" on telegram_grupos;
create policy "service_role_telegram" on telegram_grupos
  for all to service_role using (true) with check (true);
```

---

## Variáveis de ambiente

```env
SUPABASE_URL=https://unvfylyfhbqnwdnuxyzq.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
STRIPE_SECRET_KEY=sk_live_...
STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_MENSAL=price_1TcYyMBVYqyjJhJLlS6inpTg
STRIPE_PRICE_ANUAL=price_1TcYyMBVYqyjJhJLhruEC1ad
RESEND_API_KEY=re_...
EMAIL_FROM=noreply@financeiadocasal.com.br
CRON_SECRET=...                # string aleatória forte
ANTHROPIC_API_KEY=sk-ant-...   # server-side only
SITE_URL=https://financeiadocasal.com.br
TELEGRAM_BOT_TOKEN=...
ADMIN_SECRET=...
UPSTASH_REDIS_REST_URL=https://...              # Upstash → Redis → REST API → Endpoint
UPSTASH_REDIS_REST_TOKEN=...                    # Upstash → Redis → REST API → Token
SENTRY_DSN=https://...@sentry.io/...           # Sentry → Project → Settings → DSN
# PLUGGY_CLIENT_ID=...         # P4
# PLUGGY_CLIENT_SECRET=...     # P4
```

---

## SQL — tabelas Supabase

```sql
-- Já criadas: transacoes, configs, assinaturas
-- Criar antes de usar o bot: telegram_grupos (SQL acima)
-- Futura (P4): conexoes_bancarias (SQL acima)
```

---

## Critérios de qualidade

1. `node --check` no JS modificado
2. Testar mobile viewport 375px
3. Variáveis novas documentadas aqui
4. Rotas novas adicionadas em `vercel.json`
