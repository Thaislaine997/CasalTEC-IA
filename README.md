# FinanciadoCasal

[![Deploy with Vercel](https://img.shields.io/badge/Deploy-Vercel-000000?style=flat&logo=vercel)](https://vercel.com)
[![Powered by Supabase](https://img.shields.io/badge/Database-Supabase-3ECF8E?style=flat&logo=supabase)](https://supabase.com)
[![Payments by Stripe](https://img.shields.io/badge/Payments-Stripe-6772E5?style=flat&logo=stripe)](https://stripe.com)
[![IA by Anthropic](https://img.shields.io/badge/IA-Anthropic-D4A27F?style=flat)](https://anthropic.com)
[![Made in Brazil](https://img.shields.io/badge/Made%20in-Brazil%20%F0%9F%87%A7%F0%9F%87%B7-009C3B?style=flat)](https://github.com/Thaislaine997)

**O app de finanças feito exclusivamente para casais.** Sincronização em tempo real entre dois celulares, IA que extrai dados de comprovantes, controle de orçamentos por categoria e muito mais — sem instalar nada.

---

## Descrição

O FinanciadoCasal resolve um problema real: gerenciar finanças com o parceiro é difícil. Planilhas não sincronizam, apps genéricos não têm contexto de casal, e sempre surge a dúvida "quem pagou o quê?".

Com o FinanciadoCasal, os dois têm visão em tempo real de tudo: receitas, despesas, orçamentos e contas fixas. Um registra o mercado no celular e o outro vê na hora. A IA lê o comprovante do WhatsApp e preenche tudo automaticamente.

---

## Funcionalidades

- **Sync em tempo real** — via Supabase Realtime, sem delays
- **IA para comprovantes** — foto ou print do comprovante, a IA extrai tudo
- **Contas fixas** — cadastre uma vez, o app controla sempre
- **Orçamentos por categoria** — preveja e acompanhe o gasto real
- **Gráficos detalhados** — pizza por categoria, receita vs despesa, divisão por pessoa
- **Divisão por pessoa** — Ele, Ela ou Os dois
- **Modo offline** — funciona sem sync para uso individual
- **PWA ready** — adicione na tela inicial, funciona como app nativo
- **Plano Pro** — lançamentos ilimitados + IA ilimitada via Stripe
- **Histórico com busca** — encontre qualquer lançamento em segundos

---

## Tech Stack

| Camada | Tecnologia | Função |
|--------|-----------|--------|
| Frontend | HTML5 + CSS3 + JavaScript Vanilla | App + Landing Page |
| Database | Supabase (PostgreSQL) | Armazenamento e sync |
| Realtime | Supabase Realtime (WebSockets) | Sincronização ao vivo |
| IA | Anthropic Claude (Vision) | Leitura de comprovantes |
| Pagamentos | Stripe | Plano Pro — checkout e webhooks |
| Deploy | Vercel | Hosting + Serverless Functions |
| Fontes | Google Fonts (Inter, DM Sans) | Tipografia |

---

## Estrutura do projeto

```
financiadocasal/
├── index.html              # Landing page (público)
├── app.html                # Dashboard do app (usuários)
├── css/
│   ├── landing.css         # Estilos da landing page
│   └── style.css           # Estilos do app dashboard
├── js/
│   └── app.js              # Lógica principal do app
├── api/
│   ├── check-subscription.js   # Verifica status Pro no Stripe
│   ├── create-checkout.js      # Cria sessão de checkout Stripe
│   ├── customer-portal.js      # Portal do cliente Stripe
│   └── stripe-webhook.js       # Webhook de eventos Stripe
├── vercel.json             # Configuração de rotas e deploy
└── package.json            # Dependências Node.js (Stripe SDK)
```

### Diagrama de arquitetura

```
┌─────────────────────────────────────────────────────────┐
│                      Vercel CDN                          │
│                                                          │
│   /              → index.html  (Landing Page)            │
│   /app           → app.html    (Dashboard)               │
│   /api/*         → Serverless Functions                  │
└──────────────────┬──────────────────────────────────────┘
                   │
        ┌──────────┴──────────┐
        │                     │
┌───────▼──────┐    ┌─────────▼────────┐
│   Supabase   │    │   Stripe API     │
│              │    │                  │
│  PostgreSQL  │    │  Checkout        │
│  Auth        │    │  Webhooks        │
│  Realtime    │    │  Portal          │
│  Storage     │    └──────────────────┘
└───────┬──────┘
        │
        │  WebSocket (Realtime)
        │
┌───────▼──────────────────────────────┐
│           Celular A (Ela)            │
│    FinanciadoCasal → app.html        │
└──────────────────────────────────────┘
        │  (mesmo casal_id)
┌───────▼──────────────────────────────┐
│           Celular B (Ele)            │
│    FinanciadoCasal → app.html        │
└──────────────────────────────────────┘
```

---

## Setup — Primeiros passos

### 1. Supabase — Banco de dados

1. Crie uma conta em [supabase.com](https://supabase.com) (gratuito)
2. Crie um novo projeto
3. Vá em **SQL Editor** e execute o SQL abaixo:

```sql
-- Tabela de lançamentos (receitas e despesas)
CREATE TABLE lancamentos (
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

-- Tabela de orçamentos por categoria
CREATE TABLE orcamentos (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  casal_id    TEXT NOT NULL,
  categoria   TEXT NOT NULL,
  valor       NUMERIC(12, 2) NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (casal_id, categoria)
);

-- Tabela de contas fixas
CREATE TABLE contas_fixas (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  casal_id    TEXT NOT NULL,
  nome        TEXT NOT NULL,
  valor       NUMERIC(12, 2) NOT NULL,
  dia_venc    INTEGER NOT NULL CHECK (dia_venc BETWEEN 1 AND 31),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela de pagamentos de contas fixas por mês
CREATE TABLE contas_pagas (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  casal_id    TEXT NOT NULL,
  conta_id    UUID REFERENCES contas_fixas(id) ON DELETE CASCADE,
  mes         TEXT NOT NULL,
  pago        BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (casal_id, conta_id, mes)
);

-- Índices para performance
CREATE INDEX idx_lancamentos_casal_id ON lancamentos(casal_id);
CREATE INDEX idx_lancamentos_data ON lancamentos(data);
CREATE INDEX idx_orcamentos_casal_id ON orcamentos(casal_id);
CREATE INDEX idx_contas_fixas_casal_id ON contas_fixas(casal_id);
CREATE INDEX idx_contas_pagas_casal_id ON contas_pagas(casal_id);

-- RLS (Row Level Security)
ALTER TABLE lancamentos   ENABLE ROW LEVEL SECURITY;
ALTER TABLE orcamentos    ENABLE ROW LEVEL SECURITY;
ALTER TABLE contas_fixas  ENABLE ROW LEVEL SECURITY;
ALTER TABLE contas_pagas  ENABLE ROW LEVEL SECURITY;

-- Policies: acesso público por casal_id
CREATE POLICY "casal_lancamentos" ON lancamentos   FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "casal_orcamentos"  ON orcamentos    FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "casal_fixas"       ON contas_fixas  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "casal_pagas"       ON contas_pagas  FOR ALL USING (true) WITH CHECK (true);

-- Habilitar Realtime nas tabelas
ALTER PUBLICATION supabase_realtime ADD TABLE lancamentos;
ALTER PUBLICATION supabase_realtime ADD TABLE contas_pagas;
```

4. Vá em **Settings → API** e copie:
   - **Project URL** (ex: `https://xxxxx.supabase.co`)
   - **anon public key** (começa com `eyJ...`)

---

### 2. Variáveis de ambiente no Vercel

Configure no painel do Vercel em Settings → Environment Variables:

```env
# Stripe (necessário para Plano Pro)
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_ID_MONTHLY=price_...
STRIPE_PRICE_ID_YEARLY=price_...

# Supabase admin (para operações server-side)
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

> As credenciais Supabase do usuário (URL + anon key) ficam no `localStorage` do navegador, configuradas pelo próprio usuário no app.

---

### 3. Deploy no Vercel

```bash
# 1. Clone o repositório
git clone https://github.com/Thaislaine997/CasalTEC-IA.git
cd CasalTEC-IA

# 2. Instale dependências
npm install

# 3. Deploy
npx vercel --prod
```

Ou conecte o repositório diretamente no painel do Vercel para CI/CD automático.

---

## Endpoints da API

### `POST /api/create-checkout`

Cria uma sessão de checkout no Stripe para upgrade Pro.

**Request:**
```json
{ "plan": "mensal", "casal_id": "uuid-do-casal", "success_url": "...", "cancel_url": "..." }
```

**Response:**
```json
{ "url": "https://checkout.stripe.com/pay/cs_..." }
```

---

### `POST /api/check-subscription`

Verifica se o casal tem assinatura Pro ativa.

**Request:**
```json
{ "casal_id": "uuid-do-casal" }
```

**Response:**
```json
{ "pro": true, "plan": "yearly", "expires_at": "2027-05-29T00:00:00Z" }
```

---

### `POST /api/customer-portal`

Gera URL do portal do cliente Stripe para gerenciar/cancelar assinatura.

**Request:**
```json
{ "casal_id": "uuid-do-casal", "return_url": "https://financiadocasal.com.br/app" }
```

**Response:**
```json
{ "url": "https://billing.stripe.com/p/session/..." }
```

---

### `POST /api/stripe-webhook`

Webhook do Stripe. Configurar no Stripe Dashboard:
`https://financiadocasal.com.br/api/stripe-webhook`

Eventos processados:
- `checkout.session.completed`
- `customer.subscription.deleted`
- `customer.subscription.updated`

---

## Rotas

| Rota | Destino | Descrição |
|------|---------|-----------|
| `/` | `index.html` | Landing page pública |
| `/app` | `app.html` | Dashboard (redireciona para `/` se não configurado) |
| `/api/*` | `api/*.js` | Serverless Functions |
| `/*` | `index.html` | Fallback |

---

## Desenvolvimento local

```bash
npm install -g vercel
vercel dev
# Disponível em http://localhost:3000
```

---

## Contribuindo

1. Fork o repositório
2. Crie uma branch: `git checkout -b feat/minha-feature`
3. Commit: `git commit -m 'feat: adiciona minha feature'`
4. Push: `git push origin feat/minha-feature`
5. Abra um Pull Request

**Convenções de commit:** `feat:`, `fix:`, `style:`, `refactor:`, `docs:`, `chore:`

---

## Licença

MIT © 2026 [Thaislaine](https://github.com/Thaislaine997)

Feito com amor no Brasil 🇧🇷
