# Finanças do Casal

App web para controle financeiro do casal — funciona no celular direto pelo navegador, com sincronização em tempo real via Supabase e leitura de comprovantes por IA.

## Funcionalidades

- **Resumo mensal** — receitas, despesas, saldo, orçamento vs gasto e contas fixas
- **Lançar** — registra receitas e despesas com categoria, data e quem pagou
- **Comprovante IA** — foto ou print do comprovante; a IA extrai os dados automaticamente
- **Previsão** — orçamento por categoria e contas fixas com controle de pagamento
- **Gráficos** — pizza por categoria, barras de orçamento vs real, divisão por pessoa
- **Histórico** — lista completa com busca por descrição ou categoria
- **Sync em tempo real** — Supabase Realtime sincroniza os dois celulares instantaneamente

## Deploy no GitHub Pages

1. Fork este repositório
2. Vá em **Settings → Pages**
3. Source: `Deploy from a branch` → branch `main` → pasta `/ (root)`
4. Aguarde ~1 min → link em `https://<seu-usuario>.github.io/CasalTEC-IA/`

## Configuração do Supabase (sincronização gratuita)

### 1. Criar projeto

1. Acesse [supabase.com/dashboard](https://supabase.com/dashboard) e crie um projeto
2. Anote a **URL do projeto** e a **chave anon (public)** em **Settings → API**

### 2. Criar tabelas

No painel do Supabase, vá em **SQL Editor** e execute:

```sql
create table if not exists transacoes (
  id bigint primary key,
  casal_id text not null,
  tipo text not null,
  val numeric(12,2) not null,
  descricao text not null,
  data date not null,
  cat text not null,
  pessoa text not null,
  ai_import boolean default false,
  created_at timestamptz default now()
);

create table if not exists configs (
  casal_id text not null,
  chave text not null,
  valor jsonb,
  primary key (casal_id, chave)
);

alter table transacoes enable row level security;
alter table configs enable row level security;

create policy "anon_transacoes" on transacoes for all to anon using (true) with check (true);
create policy "anon_configs" on configs for all to anon using (true) with check (true);

alter publication supabase_realtime add table transacoes;
alter publication supabase_realtime add table configs;
```

> O botão **"Copiar SQL →"** na tela de setup do app já copia esse SQL pronto.

### 3. Primeiro acesso

1. Abra o app no **primeiro celular**
2. Preencha a URL e chave anon do Supabase
3. Clique em **⟳** para gerar um ID do casal e depois **⎘** para copiar
4. Cole o nome do casal e confirme

No **segundo celular**:
1. Abra o mesmo link
2. Preencha URL e chave anon do Supabase
3. Cole o mesmo ID do casal gerado no primeiro celular
4. Os dados sincronizam automaticamente em tempo real

## Leitura de comprovantes (opcional)

1. Acesse [console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys)
2. Crie uma chave de API
3. Cole no campo **Chave API Anthropic** durante o setup

## Estrutura

```
CasalTEC-IA/
├── index.html       # App completo
├── css/
│   └── style.css    # Estilos
└── js/
    └── app.js       # Lógica + Supabase + IA
```

## Tecnologias

- HTML/CSS/JS puro — sem framework
- [Supabase](https://supabase.com) — banco de dados + sync em tempo real
- [Chart.js](https://www.chartjs.org/) — gráficos
- [Anthropic Claude API](https://anthropic.com) — leitura de comprovantes por visão
