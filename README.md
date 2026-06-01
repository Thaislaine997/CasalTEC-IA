# FinanciadoCasal

[![Deploy with Vercel](https://img.shields.io/badge/Deploy-Vercel-000000?style=flat&logo=vercel)](https://vercel.com)
[![Powered by Supabase](https://img.shields.io/badge/Database-Supabase-3ECF8E?style=flat&logo=supabase)](https://supabase.com)
[![Payments by Stripe](https://img.shields.io/badge/Payments-Stripe-6772E5?style=flat&logo=stripe)](https://stripe.com)
[![IA by Anthropic](https://img.shields.io/badge/IA-Anthropic%20Claude-D4A27F?style=flat)](https://anthropic.com)
[![Email by Resend](https://img.shields.io/badge/Email-Resend-000000?style=flat)](https://resend.com)
[![PWA Ready](https://img.shields.io/badge/PWA-Ready-5A0FC8?style=flat)](https://web.dev/progressive-web-apps/)
[![Made in Brazil](https://img.shields.io/badge/Made%20in-Brazil%20%F0%9F%87%A7%F0%9F%87%B7-009C3B?style=flat)](https://github.com/Thaislaine997)

**O app de finanças feito exclusivamente para casais.** Sincronização em tempo real entre dois celulares, IA que extrai dados de comprovantes via foto ou Telegram, controle de orçamentos por categoria, plano Pro com Stripe e muito mais — sem instalar nada.

**Produto ao vivo:** [financeiadocasal.com.br](https://financeiadocasal.com.br)

---

## Por que o FinanciadoCasal?

Gerenciar finanças com o parceiro é difícil. Planilhas não sincronizam, apps genéricos ignoram o contexto de casal, e sempre surge a dúvida "quem pagou o quê?". Com o FinanciadoCasal os dois têm visão em tempo real de tudo: receitas, despesas, orçamentos e contas fixas. Um registra o mercado no celular e o outro vê na hora. A IA lê o comprovante do WhatsApp e preenche tudo automaticamente — inclusive via bot no Telegram do grupo do casal.

---

## Funcionalidades implementadas

| Área | Funcionalidade |
|------|---------------|
| **Lançamentos** | Receitas e despesas com categoria, pessoa (Ele / Ela / Os dois) e data |
| **IA** | Leitura automática de comprovantes via foto (Claude Vision, proxy server-side) |
| **Telegram** | Bot no grupo do casal: envie foto ou texto e o bot registra o lançamento |
| **Orçamentos** | Definir limite por categoria, acompanhar gasto real vs planejado |
| **Contas fixas** | Cadastre uma vez, o app controla vencimentos mensais |
| **Histórico** | Busca e filtros por mês, categoria, pessoa e tipo |
| **Gráficos** | Pizza por categoria, receita vs despesa, divisão Ele/Ela |
| **Metas** | Metas de economia com acompanhamento de progresso |
| **Saldo por cônjuge** | Controle individual de quem gastou quanto |
| **Modo offline** | Funciona sem conexão para uso individual |
| **PWA** | Instala na tela inicial, funciona como app nativo (manifest + service worker) |
| **Export PDF** | Exporta relatório mensal em PDF |
| **Importação OFX/CSV** | Importa extratos bancários client-side: Itaú/Bradesco/BB/Santander (OFX) e Nubank/Inter/C6/BB (CSV), com preview, seleção e deduplicação visual |
| **Plano Pro** | Lançamentos e IA ilimitados via Stripe (mensal + anual) |
| **Auth** | Login, Registro, Recuperação de senha — Supabase Auth |
| **Onboarding** | Wizard 2 passos: criar ou entrar em um casal existente |
| **Sync Realtime** | WebSocket Supabase — sem precisar recarregar |
| **Emails automáticos** | Boas-vindas, resumo mensal e lembrete de contas vencendo (Resend) |
| **LGPD** | Consentimento, página de privacidade, exclusão de conta (Art. 18) |
| **Segurança** | Rate limiting em todas as rotas críticas, CORS restrito, chave IA nunca exposta |

---

## Tech Stack

| Camada | Tecnologia | Função |
|--------|-----------|--------|
| Frontend | HTML5 + CSS3 + JavaScript Vanilla | App e Landing Page (sem framework) |
| Auth | Supabase Auth | Login, sessão, JWT, recuperação de senha |
| Database | Supabase (PostgreSQL) | Armazenamento com RLS por `casal_id` |
| Realtime | Supabase Realtime (WebSockets) | Sincronização ao vivo entre dispositivos |
| IA | Anthropic Claude Haiku Vision | Leitura de comprovantes (server-side) |
| Pagamentos | Stripe Checkout + Webhooks + Portal | Plano Pro mensal e anual |
| Email | Resend | Boas-vindas, relatório mensal, lembretes |
| Mensageria | Telegram Bot API | Bot de lançamento via grupo do casal |
| Deploy / CDN | Vercel | Hosting estático + Serverless Functions |
| Crons | Vercel Cron Jobs | Emails automáticos agendados |
| PWA | Web App Manifest + Service Worker | Instalação e cache offline |

---

## Estrutura de arquivos

```
/
├── index.html                  # Landing page pública
├── app.html                    # Dashboard do app (autenticado)
├── login.html                  # Login via Supabase Auth
├── register.html               # Registro + wizard criar/entrar em casal
├── reset-password.html         # Recuperação de senha
├── privacidade.html            # Política de privacidade (LGPD)
├── termos.html                 # Termos de uso
├── manifest.json               # PWA manifest
├── sw.js                       # Service worker (cache-first / network-first)
│
├── css/
│   ├── landing.css             # Estilos da landing page
│   └── style.css               # Estilos do dashboard / app
│
├── js/
│   └── app.js                  # Lógica principal do app
│
├── icons/
│   ├── icon.svg                # Ícone fonte (vetorial)
│   ├── icon-192.png            # PWA — splash / home screen
│   └── icon-512.png            # PWA — maskable / Play Store
│
├── api/
│   ├── _rateLimit.js           # Helper sliding-window rate limit (Upstash Redis + fallback in-memory)
│   ├── _sentry.js              # Wrapper lazy Sentry — no-op sem SENTRY_DSN
│   ├── add-transaction.js      # Inserção server-side + email boas-vindas no 1º lançamento
│   ├── read-comprovante.js     # Proxy IA (Anthropic key nunca chega ao cliente)
│   ├── delete-account.js       # LGPD Art. 18: apaga dados + cancela Stripe + deleta Auth
│   ├── create-checkout.js      # Cria sessão Stripe Checkout (rate limit 5/IP/60s)
│   ├── stripe-webhook.js       # Webhook Stripe com deduplicação por event.id
│   ├── customer-portal.js      # Portal Stripe (rate limit 10/IP/60s)
│   ├── check-subscription.js   # Verifica plano Pro (rate limit 30/IP/60s)
│   ├── telegram-webhook.js     # Bot Telegram + Claude Vision (rate limit 30/IP/60s)
│   ├── setup-telegram.js       # One-time: registra webhook no Telegram
│   ├── send-welcome.js         # Módulo de email de boas-vindas (Resend)
│   ├── monthly-report.js       # Vercel Cron: resumo mensal (dia 1 às 8h BRT)
│   └── bill-reminder.js        # Vercel Cron: lembrete contas vencendo (diário às 8h BRT)
│
├── vercel.json                 # Rotas, crons e configuração de deploy
└── package.json                # Dependências Node.js
```

---

## Arquitetura

```
┌──────────────────────────────────────────────────────────┐
│                        Vercel CDN                         │
│                                                           │
│   /              → index.html     (Landing Page)          │
│   /app           → app.html       (Dashboard)             │
│   /login         → login.html     (Auth)                  │
│   /register      → register.html  (Onboarding)            │
│   /api/*         → Serverless Functions (Node.js)         │
└───────────────────────┬──────────────────────────────────┘
                        │
          ┌─────────────┼──────────────┬──────────────┐
          │             │              │              │
  ┌───────▼──────┐ ┌────▼────┐ ┌──────▼─────┐ ┌─────▼──────┐
  │   Supabase   │ │ Stripe  │ │ Anthropic  │ │   Resend   │
  │              │ │         │ │            │ │            │
  │  PostgreSQL  │ │Checkout │ │Claude Haiku│ │  Emails    │
  │  Auth        │ │Webhooks │ │  Vision    │ │transacionais│
  │  Realtime WS │ │Portal   │ └────────────┘ └────────────┘
  └───────┬──────┘ └─────────┘
          │ WebSocket (Realtime)
          │
  ┌───────▼──────────────┐     ┌───────────────────────┐
  │   Celular A (Ela)    │     │    Celular B (Ele)     │
  │  app.html            │◄────►  app.html              │
  │  (mesmo casal_id)    │     │  (mesmo casal_id)      │
  └──────────────────────┘     └───────────────────────┘

  ┌──────────────────────────────────────────────────────┐
  │            Telegram (grupo do casal)                  │
  │  /conectar CASAL_ID → foto/texto → bot registra      │
  └──────────────────────────────────────────────────────┘
```

---

## Setup — Primeiros passos

### 1. Clone e dependências

```bash
git clone https://github.com/Thaislaine997/CasalTEC-IA.git
cd CasalTEC-IA
npm install
```

---

### 2. Supabase — Banco de dados

1. Crie uma conta em [supabase.com](https://supabase.com)
2. Crie um novo projeto
3. No **SQL Editor**, execute o SQL abaixo para criar todas as tabelas:

```sql
-- ─── Lançamentos (receitas e despesas) ───────────────────────────────────
CREATE TABLE transacoes (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  casal_id    TEXT NOT NULL,
  tipo        TEXT NOT NULL CHECK (tipo IN ('receita', 'despesa')),
  descricao   TEXT NOT NULL,
  valor       NUMERIC(12, 2) NOT NULL,
  data        DATE NOT NULL,
  categoria   TEXT NOT NULL,
  pessoa      TEXT NOT NULL DEFAULT 'Os dois',
  via_ia      BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_transacoes_casal ON transacoes(casal_id);
CREATE INDEX idx_transacoes_data  ON transacoes(data);

-- ─── Configurações do casal (orçamentos, metas, etc.) ────────────────────
CREATE TABLE configs (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  casal_id   TEXT NOT NULL UNIQUE,
  dados      JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Assinaturas Pro (Stripe) ─────────────────────────────────────────────
CREATE TABLE assinaturas (
  id                      UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  casal_id                TEXT NOT NULL UNIQUE,
  stripe_customer_id      TEXT,
  stripe_subscription_id  TEXT,
  plano                   TEXT,        -- 'mensal' | 'anual'
  status                  TEXT,        -- 'active' | 'canceled' | 'past_due'
  periodo_fim             TIMESTAMPTZ,
  email                   TEXT,
  created_at              TIMESTAMPTZ DEFAULT NOW(),
  updated_at              TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_assinaturas_casal ON assinaturas(casal_id);

-- ─── Bot Telegram ─────────────────────────────────────────────────────────
CREATE TABLE telegram_grupos (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  casal_id    TEXT NOT NULL,
  chat_id     TEXT NOT NULL UNIQUE,
  chat_title  TEXT,
  ativo       BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─── RLS (Row Level Security) ─────────────────────────────────────────────
ALTER TABLE transacoes      ENABLE ROW LEVEL SECURITY;
ALTER TABLE configs         ENABLE ROW LEVEL SECURITY;
ALTER TABLE assinaturas     ENABLE ROW LEVEL SECURITY;
ALTER TABLE telegram_grupos ENABLE ROW LEVEL SECURITY;

-- Policies: service_role tem acesso total (usado pelo backend)
CREATE POLICY "service_role_transacoes"  ON transacoes
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_configs"     ON configs
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_assinaturas" ON assinaturas
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_telegram"    ON telegram_grupos
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Habilitar Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE transacoes;
ALTER PUBLICATION supabase_realtime ADD TABLE configs;
```

4. Em **Settings → API**, copie:
   - **Project URL** (ex: `https://xxxxx.supabase.co`)
   - **anon public key** (começa com `eyJ...`)
   - **service_role key** (para o backend — nunca expor no frontend)

5. Em **Authentication → Settings**:
   - **Site URL:** `https://financeiadocasal.com.br`
   - **Redirect URLs:** adicione `/login` e `/reset-password`

---

### 3. Stripe — Plano Pro

1. Crie uma conta em [stripe.com](https://stripe.com)
2. Crie dois produtos:
   - **Pro Mensal** — recorrente mensal
   - **Pro Anual** — recorrente anual
3. Copie os `price_*` IDs gerados
4. Em **Webhooks**, adicione:
   - **URL:** `https://financeiadocasal.com.br/api/stripe-webhook`
   - **Eventos:** `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`
5. Copie o `whsec_*` do webhook

---

### 4. Resend — Emails transacionais

1. Crie uma conta em [resend.com](https://resend.com)
2. Adicione e verifique o domínio `financeiadocasal.com.br`
3. Gere uma API key
4. Configure o endereço de envio: `noreply@financeiadocasal.com.br`

---

### 5. Variáveis de ambiente no Vercel

Configure em **Settings → Environment Variables**:

```env
# Supabase
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# Stripe
STRIPE_SECRET_KEY=sk_live_...
STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_MENSAL=price_...
STRIPE_PRICE_ANUAL=price_...

# Anthropic (IA Vision)
ANTHROPIC_API_KEY=sk-ant-...

# Resend (email)
RESEND_API_KEY=re_...
EMAIL_FROM=noreply@financeiadocasal.com.br

# Vercel Crons (gerar string forte aleatória)
CRON_SECRET=...

# URL base
SITE_URL=https://financeiadocasal.com.br

# Telegram Bot (opcional)
TELEGRAM_BOT_TOKEN=...
ADMIN_SECRET=...

# Upstash Redis — rate limiting distribuído (opcional, fallback in-memory)
UPSTASH_REDIS_REST_URL=https://...
UPSTASH_REDIS_REST_TOKEN=...

# Sentry — monitoramento de erros (opcional, no-op sem a variável)
SENTRY_DSN=https://...@sentry.io/...
```

---

### 6. Bot Telegram (opcional)

1. No Telegram, fale com **@BotFather** → `/newbot` → copie o TOKEN
2. Adicione `TELEGRAM_BOT_TOKEN` e `ADMIN_SECRET` nas vars do Vercel
3. Faça deploy e acesse uma vez:
   ```
   GET https://financeiadocasal.com.br/api/setup-telegram?secret=SUA_ADMIN_SECRET
   ```
4. No Telegram: crie ou use um grupo do casal → adicione o bot → envie `/conectar SEU_CASAL_ID`

A partir daí, qualquer foto de comprovante ou texto no grupo é processado pela IA e lançado automaticamente.

---

### 7. Deploy

```bash
# Instale a CLI do Vercel
npm install -g vercel

# Deploy de produção
vercel --prod
```

Ou conecte o repositório no painel do Vercel para CI/CD automático a cada push na `main`.

---

## Endpoints da API

Todas as rotas retornam JSON. CORS restrito a `https://financeiadocasal.com.br`.

### `POST /api/add-transaction`

Insere um lançamento com validação server-side de limites (Free: 30 transações / 5 IA). No primeiro lançamento do casal dispara o email de boas-vindas.

**Request:**
```json
{
  "casalId": "uuid",
  "tipo": "despesa",
  "val": 89.90,
  "descricao": "Mercado Extra",
  "data": "2026-06-01",
  "cat": "Mercado",
  "pessoa": "Os dois",
  "aiImport": false,
  "userEmail": "email@exemplo.com"
}
```

**Response `201`:**
```json
{ "ok": true, "id": "uuid-inserido" }
```

---

### `POST /api/read-comprovante`

Proxy para Claude Haiku Vision. Recebe imagem em base64 e retorna os dados extraídos do comprovante. A `ANTHROPIC_API_KEY` nunca chega ao cliente.

**Request:**
```json
{
  "imageBase64": "...",
  "mediaType": "image/jpeg",
  "today": "2026-06-01"
}
```

**Response `200`:**
```json
{
  "descricao": "Mercado Extra",
  "valor": 89.90,
  "data": "2026-06-01",
  "categoria": "Mercado"
}
```

---

### `POST /api/create-checkout`

Cria sessão Stripe Checkout para upgrade Pro. **Rate limit: 5 req/IP/60s.**

**Request:**
```json
{
  "plan": "mensal",
  "casalId": "uuid",
  "email": "email@exemplo.com",
  "successUrl": "https://financeiadocasal.com.br/app?upgraded=1",
  "cancelUrl": "https://financeiadocasal.com.br/app"
}
```

**Response `200`:**
```json
{ "url": "https://checkout.stripe.com/pay/cs_..." }
```

---

### `POST /api/check-subscription`

Verifica se o casal tem assinatura Pro ativa. **Rate limit: 30 req/IP/60s.**

**Request:**
```json
{ "casalId": "uuid" }
```

**Response `200`:**
```json
{ "pro": true, "plano": "anual", "periodoFim": "2027-06-01T00:00:00Z" }
```

---

### `POST /api/customer-portal`

Gera URL do portal Stripe para gerenciar ou cancelar assinatura. **Rate limit: 10 req/IP/60s.**

**Request:**
```json
{ "casalId": "uuid", "returnUrl": "https://financeiadocasal.com.br/app" }
```

**Response `200`:**
```json
{ "url": "https://billing.stripe.com/p/session/..." }
```

---

### `POST /api/stripe-webhook`

Recebe eventos do Stripe com verificação de assinatura (`STRIPE_WEBHOOK_SECRET`). Deduplicação por `event.id` para idempotência.

Eventos processados:
- `checkout.session.completed` → ativa assinatura
- `customer.subscription.updated` → atualiza status
- `customer.subscription.deleted` → cancela
- `invoice.payment_failed` → marca `past_due`

---

### `DELETE /api/delete-account`

LGPD Art. 18: apaga todos os dados do usuário. Requer `Authorization: Bearer <jwt>`.

Fluxo:
1. Valida JWT Supabase
2. Cancela assinatura Stripe ativa (se houver)
3. Apaga `transacoes`, `configs`, `assinaturas`, `telegram_grupos` do casal
4. Deleta usuário no Supabase Auth

**Response `200`:**
```json
{ "ok": true }
```

---

### `POST /api/telegram-webhook`

Recebe updates do Telegram. **Rate limit: 30 req/IP/60s. Idempotência por `message_id`.**

Comandos suportados:
- `/conectar CASAL_ID` — vincula o grupo a um casal
- Texto livre → tenta interpretar como lançamento
- Foto / imagem → envia para Claude Vision e registra automaticamente

---

### `GET /api/setup-telegram`

One-time: registra o webhook do bot no Telegram. Protegido por `?secret=ADMIN_SECRET`.

---

## Vercel Crons

| Cron | Agendamento | Função |
|------|-------------|--------|
| `/api/monthly-report` | `0 11 1 * *` (dia 1 às 8h BRT) | Envia resumo financeiro mensal por email para todos os casais |
| `/api/bill-reminder` | `0 11 * * *` (diário às 8h BRT) | Envia lembrete de contas fixas vencendo hoje, amanhã ou em 3 dias |

Ambos os crons exigem o header `Authorization: Bearer CRON_SECRET` (injetado automaticamente pelo Vercel).

---

## PWA — Progressive Web App

O app pode ser instalado na tela inicial de qualquer dispositivo:

- **[manifest.json](manifest.json)** — nome, cores, ícones, `display: standalone`
- **[sw.js](sw.js)** — service worker com estratégia cache-first para assets e network-first para API
- **[icons/](icons/)** — `icon-192.png` e `icon-512.png` já gerados a partir de `icon.svg`

Para regenerar os ícones:
```bash
npx svgexport icons/icon.svg icons/icon-192.png 192:192
npx svgexport icons/icon.svg icons/icon-512.png 512:512
```

---

## Limites do plano Free vs Pro

| Recurso | Free | Pro |
|---------|------|-----|
| Lançamentos | 30 total | Ilimitados |
| Leitura de comprovantes por IA | 5 total | Ilimitados |
| Sync Realtime | ✅ | ✅ |
| Gráficos e relatórios | ✅ | ✅ |
| Export PDF | ✅ | ✅ |
| Bot Telegram | ✅ | ✅ |
| Emails automáticos | ✅ | ✅ |

---

## Segurança

| Medida | Onde | Detalhe |
|--------|------|---------|
| Rate limiting | `_rateLimit.js` | Sliding window — Upstash Redis com fallback in-memory por IP |
| CORS restrito | Todos os endpoints | `Access-Control-Allow-Origin: https://financeiadocasal.com.br` |
| Chave IA server-side | `read-comprovante.js` | `ANTHROPIC_API_KEY` nunca vai ao browser |
| JWT validation | `delete-account.js` | Verifica token antes de qualquer operação destrutiva |
| Webhook signature | `stripe-webhook.js` | `stripe.webhooks.constructEvent` com `STRIPE_WEBHOOK_SECRET` |
| Deduplicação Stripe | `stripe-webhook.js` | Checagem por `event.id` antes de processar |
| Idempotência Telegram | `telegram-webhook.js` | Registra `message_id` processados |
| RLS Supabase | Todas as tabelas | `service_role` somente no backend, cliente usa `anon` |
| Monitoramento de erros | `_sentry.js` | Lazy-init Sentry em todos os handlers (no-op sem `SENTRY_DSN`) |

---

## Desenvolvimento local

```bash
# Instale a CLI do Vercel
npm install -g vercel

# Crie o arquivo de vars locais
cp .env.example .env.local
# Edite .env.local com suas credenciais de desenvolvimento

# Suba o servidor local (inclui serverless functions)
vercel dev
# Disponível em http://localhost:3000
```

---

## Critérios de qualidade

Antes de cada PR ou deploy:

1. `node --check api/<arquivo>.js` — valida sintaxe JS sem executar
2. Testar em viewport 375px (mobile first)
3. Novas variáveis de ambiente documentadas neste README e no CLAUDE.md
4. Novas rotas adicionadas em `vercel.json`
5. Qualquer nova tabela Supabase com RLS + policy `service_role`

---

## Roadmap

### Open Finance — Pluggy (P4)
> MVP de importação já entregue: OFX/CSV client-side (custo zero). Pluggy (~R$500/mês) só vale após ~50 casais Pro.
Integração com bancos brasileiros via [pluggy.ai](https://pluggy.ai) (~R$500/mês, 500 conexões).

```sql
CREATE TABLE conexoes_bancarias (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  casal_id        TEXT NOT NULL,
  pluggy_item_id  TEXT NOT NULL,
  banco           TEXT,
  last_sync       TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
```

Variáveis necessárias: `PLUGGY_CLIENT_ID`, `PLUGGY_CLIENT_SECRET`
Cron: `/api/pluggy-sync-all` todo dia às 6h.

### App nativo (P6, quando MRR > R$2k)
- React Native + Expo + push notifications

### Growth (P7)
- SEO: `og:image`, `sitemap.xml`, `robots.txt`
- Programa de indicação: `?ref=CASAL_ID` → coupon Stripe
- `@financiadocasal` Instagram e TikTok

---

## Rotas

| Rota | Arquivo | Descrição |
|------|---------|-----------|
| `/` | `index.html` | Landing page pública |
| `/app` | `app.html` | Dashboard (redireciona para `/` se não autenticado) |
| `/login` | `login.html` | Página de login |
| `/register` | `register.html` | Cadastro + onboarding |
| `/reset-password` | `reset-password.html` | Recuperação de senha |
| `/privacidade` | `privacidade.html` | Política de privacidade (LGPD) |
| `/termos` | `termos.html` | Termos de uso |
| `/api/*` | `api/*.js` | Serverless Functions |

---

## Contribuindo

1. Fork o repositório
2. Crie uma branch: `git checkout -b feat/minha-feature`
3. Commit seguindo as convenções: `feat:`, `fix:`, `style:`, `refactor:`, `docs:`, `chore:`
4. Push: `git push origin feat/minha-feature`
5. Abra um Pull Request descrevendo o que muda e por quê

---

## Licença

MIT © 2026 [Thaislaine](https://github.com/Thaislaine997)

Feito com amor no Brasil 🇧🇷
