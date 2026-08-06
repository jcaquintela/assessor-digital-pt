# Auditoria do Afonso — estado a 6 ago 2026

## Saúde geral

O produto está sólido no essencial: 611 testes passam (97 ficheiros), a verificação de tipos está limpa, e nos últimos 14 dias houve 1.110 mensagens de 6 consultores ativos (9 contas), 624 envios WhatsApp em 30 dias, 303 seguimentos e 353 avaliações de qualidade registadas. Não há ações pendentes presas.

O que preocupa não é o que falta — é o que existe e não está a produzir o valor prometido.

## Problemas encontrados (por prioridade)

### 1. A medição de custo por consultor está a zero (crítico)
A instrumentação de modalidade e modelo faturado está correta no código, mas **não existe um único registo com esses campos preenchidos** — 517 chamadas nos últimos 14 dias, todas sem modalidade. O último registo é de hoje às 21:26 (Lisboa), ou seja o tráfego real corre numa versão publicada anterior à alteração. Os painéis de Custos e a coluna "Créditos (30d)" mostram hoje números incompletos, com aparência de fiáveis.

Ação: publicar e validar com uma mensagem de texto, uma foto e um áudio reais que as três modalidades aparecem separadas.

### 2. O router semântico falha em ~7% das mensagens
36 das 517 chamadas falharam com "resposta do modelo ilegível" (JSON inválido), mais 3 recusas do gateway (403). Nessas mensagens o consultor cai no caminho de recurso — funciona, mas com pior compreensão, e ninguém é alertado.

Ação: forçar formato JSON na resposta do modelo, uma nova tentativa imediata em caso de leitura falhada, e um indicador no admin quando a taxa de falha passar de 2% num dia.

### 3. Três motores em paralelo (dívida técnica pesada)
Coexistem o motor v1 (2.231 linhas), o v2 (~2.600 linhas) e o v3 (1.541 linhas). Em 14 dias o v2 foi usado 2 vezes — e uma delas falhou por excesso de iterações. O v1 continua a servir todos os consultores fora da flag do v3. Três caminhos significa corrigir tudo três vezes e testar um só.

Ação: definir a data em que o v3 passa a caminho único, apagar o v2 e reduzir o v1 a recurso mínimo.

### 4. Tarifas de custo praticamente vazias
Existe apenas 1 modelo com tarifa registada e 1 definição de preço. Qualquer modelo diferente cai numa tarifa de reserva — os euros no admin são estimativas, não medições.

Ação: preencher as tarifas dos modelos realmente usados e datar a origem de cada valor.

### 5. Proatividade fora da janela continua por validar
618 dos 624 envios não têm custo associado — esperado, por serem respostas dentro da janela de 24h (gratuitas). Mas confirma que **ainda não houve um envio de template fora da janela em produção**: a promessa central de proatividade continua sem prova.

Ação: executar o teste controlado já implementado e registar entrega/leitura/resposta.

### 6. Segurança — dois pontos a arrumar
Sete tabelas têm segurança ativa mas sem regras (bloqueio total, intencional para tabelas só de servidor, mas não documentado), e duas funções privilegiadas são executáveis por qualquer utilizador autenticado.

Ação: revogar execução onde não é precisa e registar na memória de segurança quais das sete tabelas são deliberadamente inacessíveis.

### 7. Ficheiros demasiado grandes
Seis ficheiros passam das mil linhas (o maior tem 2.231) e são precisamente os que concentram a lógica conversacional — onde um erro custa mais caro e a revisão é mais difícil.

## O que sugiro fazer a seguir

Por ordem, sem misturar:
1. Publicar e validar a medição de custos (sem isto, decisões de preço são adivinhação).
2. Corrigir a leitura do router e adicionar o alerta de falhas.
3. Executar o teste real de proatividade fora da janela.
4. Preencher tarifas e fechar os dois pontos de segurança.
5. Só depois: aposentar o v2 e simplificar o v1.

## Notas técnicas

- Falhas por rota (14d): `router_semantic` 36 (JSON inválido), `v3` 16, `v2` 1 (`max_iterations_reached`), `v3-deterministic` 1 (`financial_movements:simulacao_falha_rls`).
- 83 registos de IA sem rota atribuída — instrumentação anterior à normalização.
- Tabelas com RLS sem políticas: `admin_cost_settings`, `ai_model_rates`, `app_user_connections`, `app_user_connection_aliases`, `dashboard_login_tokens`, `support_sessions`, `telegram_pairings`.
- Um caso registado de simulação de falha de RLS em movimentos financeiros — confirmar se foi teste ou incidente.