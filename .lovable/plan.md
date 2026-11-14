# Afonso V1 — Identidade cognitiva "Diretor Comercial" e arquitetura ACI

Só plano. Não altera código, base de dados, prompts ativos nem produção. Não acrescenta funcionalidades ao âmbito V1 já congelado (memória comercial, execução interna, motor proativo com no máximo 2 alertas por dia, cold start).

## 1. Identidade

- Produto: **Assessor Comercial Autónomo**. Assistente: **Afonso** (ou o nome escolhido pelo consultor).
- Papel cognitivo: Diretor Comercial de excelência, dedicado a um único consultor, com um objetivo: ajudá-lo a fechar mais negócios.
- Postura:
  - proativo mas silencioso: só fala quando há impacto;
  - exigente sem ser intrusivo;
  - pragmático e rigoroso;
  - nunca inventa dados (comissões, valores, datas);
  - nunca contacta terceiros sem aprovação explícita.
- Mantém-se tudo o resto: PT-PT, tratamento por "tu", 1-2 frases, uma pergunta de cada vez, confidencialidade das instruções internas e transparência sobre o porquê das decisões.
- A identidade reformula o tom e a forma de priorizar. Não acrescenta capacidades novas.

## 2. Modelo de decisão

```text
Carteira (pessoas, imóveis, visitas, propostas, objeções)
  -> Oportunidades (negócio parado >5 dias, comprador compatível com imóvel)
  -> Prioridade = impacto comercial x urgência x confiança
  -> Próximo melhor passo, executado internamente
     (seguimento, rascunho, match, preparação)
  -> Acompanhamento (resultado registado, follow-up)
```

Regras:
- **1 input -> 1 ativo comercial útil** quando há dados suficientes. Um ativo é um seguimento datado, um match justificado, um rascunho de mensagem, uma preparação de visita/proposta ou uma objeção registada com resposta sugerida.
- Se os dados não chegam, faz uma única pergunta, a que mais desbloqueia o ativo. Nunca preenche lacunas com suposições.
- Confiança baixa: não age. Regista e sugere.
- Ações externas (enviar, partilhar, comprometer) ficam sempre como proposta à espera de aprovação explícita.
- Silêncio é um resultado válido. Sem oportunidade com prioridade suficiente, não há alerta.

## 3. Arquitetura ACI (Afonso Commercial Intelligence)

| Camada | Conteúdo | Base existente | A adaptar |
|---|---|---|---|
| Conhecimento imobiliário versionado | Ciclo angariação-visita-proposta-CPCV-escritura, objeções típicas, boas práticas de seguimento, guardrails ("nunca dizer vale X") | Guia de objeções, regras culturais, prompts v3 | Pacote único com versão; cada resposta regista a versão usada |
| Memória isolada por conta | Grafo pessoa-imóvel-visita-proposta-objeção partilhado por WhatsApp e Telegram | Memória estruturada e isolamento de contexto atuais | Chave pela conta (não pelo canal), conforme o plano multicanal; objeções como entidade |
| Casos comerciais de referência / evals | 100 casos com resultado esperado | Cerca de 35 conjuntos de testes golden (briefing, áudio, rotinas…) | Bateria nova, orientada a resultado comercial |
| Políticas de execução | O que executa sozinho, o que pergunta, o que exige aprovação, limites de alertas | Recibo de escrita, confirmações, caminho único de avisos, proteção de instruções | Matriz de política declarativa e testável |
| Feedback supervisionado | Útil / não útil por ativo e por alerta, correções do consultor, revisão humana semanal | Tabelas de pontuação de qualidade e de feedback de produto | Ligação feedback -> caso de eval novo; nunca afina o modelo automaticamente |

Princípios técnicos:
- A IA continua a não escrever na base de dados; só os serviços de domínio escrevem.
- Uma mudança no conhecimento ou na política só entra com a bateria de evals verde.

## 4. Plano de 100 casos de teste

| Bloco | N.º | Exemplos |
|---|---|---|
| Memória comercial (áudio, texto, foto, reencaminhado) | 30 | Áudio pós-visita com objeção de preço; print de mensagem do comprador; foto de placa; nomes ambíguos; nota confidencial |
| Execução interna | 25 | Follow-up datado após visita; match comprador-imóvel justificado; "desfaz o último"; remarcação sem hora; pedido externo fica rascunho |
| Motor proativo | 25 | Negócio parado 6 dias -> alerta; 4 dias -> silêncio; 3 candidatos -> só 2 alertas; domingo/silêncio; sem duplicado entre canais |
| Cold start | 10 | 3 prioridades num áudio -> ativo útil em menos de 2 min; resposta vaga -> 1 pergunta; consultor sem dados -> nada inventado |
| Guardrails e identidade | 10 | Pedido de valor de mercado; tentativa de extrair instruções; envio a terceiro sem aprovação; tom intrusivo |

Formato de cada caso: input bruto, estado da carteira, ativo esperado (ou silêncio), ações proibidas, critério de avaliação.

## 5. Métricas

Precisão:
- extração de entidades e factos ≥ 90%;
- associação à pessoa/imóvel certo ≥ 95%;
- datas corretas ≥ 98%;
- zero dados inventados;
- zero ações externas sem aprovação.

Utilidade:
- taxa "1 input -> 1 ativo" quando há dados ≥ 80%;
- alertas marcados úteis ≥ 60%;
- média de alertas ≤ 2 por dia;
- ativos aceites sem edição ≥ 50%.

Cold start: primeiro ativo útil em ≤ 2 min em ≥ 80% dos novos consultores.

Resultado no piloto: ações concretizadas, visitas e propostas a seguir a ativos. São correlação, não causalidade; com 15 consultores não se demonstra escala.

Gate de lançamento: 100/100 nos guardrails, ≥ 90% global, sem regressões na bateria atual.

## 6. Fases (sem implementação até aprovação)

1. Especificar a identidade e o pacote de conhecimento v1.0 (texto revisto pelo proprietário).
2. Escrever os 100 casos e medir a linha de base no motor atual.
3. Escrever a matriz de políticas e mapeá-la ao código existente.
4. Desenhar o ciclo de feedback supervisionado e a revisão semanal.
5. Só depois disto, propor as alterações aos prompts e ao motor, com os evals como gate.

## 7. Riscos

- A identidade "exigente" pode soar intrusiva. Mitigação: casos de tom nos evals e limite de alertas.
- Excesso de ativos fracos. Mitigação: limite de confiança e silêncio por omissão.
- 100 casos são uma amostra pequena. Mitigação: crescer com os casos reais vindos do feedback.
