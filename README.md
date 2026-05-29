# Finanças do Casal

App web para controle financeiro do casal — funciona no celular direto pelo navegador, com sincronização via Firebase e leitura de comprovantes por IA.

## Funcionalidades

- **Resumo mensal** — receitas, despesas, saldo, orçamento vs gasto e contas fixas
- **Lançar** — registra receitas e despesas com categoria, data e quem pagou
- **Comprovante IA** — foto ou print do comprovante; a IA extrai os dados automaticamente
- **Previsão** — orçamento por categoria e contas fixas com controle de pagamento
- **Gráficos** — pizza por categoria, barras de orçamento vs real, divisão por pessoa
- **Histórico** — lista completa com busca por descrição ou categoria
- **Sync** — Firebase Realtime Database para sincronizar os dois celulares em tempo real

## Como usar

### 1. Fork e ative o GitHub Pages

1. Faça um **fork** deste repositório
2. Vá em **Settings → Pages**
3. Em *Source*, selecione `main` branch e pasta `/ (root)`
4. Aguarde alguns segundos — o link do app aparecerá no topo da página

### 2. Configure o Firebase (sincronização gratuita)

1. Acesse [console.firebase.google.com](https://console.firebase.google.com) e crie um projeto
2. Ative o **Realtime Database** (plano Spark — gratuito)
3. Nas regras do banco, coloque temporariamente:
   ```json
   {
     "rules": {
       ".read": true,
       ".write": true
     }
   }
   ```
4. Copie a URL do banco (ex: `https://seu-projeto-default-rtdb.firebaseio.com`)

### 3. Configure a IA para leitura de comprovantes (opcional)

1. Acesse [console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys)
2. Crie uma chave de API
3. Cole na configuração do app

### 4. Primeiro acesso

Abra o app no celular, cole a URL do Firebase e a chave da Anthropic — pronto. Compartilhe o link do GitHub Pages com o casal e os dois usam o mesmo banco de dados.

## Estrutura

```
financas-casal/
├── index.html       # App completo (HTML)
├── css/
│   └── style.css    # Estilos
└── js/
    └── app.js       # Lógica do app
```

## Tecnologias

- HTML/CSS/JS puro — sem framework, roda em qualquer navegador
- [Chart.js](https://www.chartjs.org/) — gráficos
- Firebase Realtime Database — sincronização em tempo real
- Anthropic Claude API — leitura de comprovantes por visão computacional
