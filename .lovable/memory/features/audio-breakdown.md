---
name: Processador de Áudio Imobiliário
description: Áudio longo separado em factos/seguimentos/notas com confirmação única; notas confidenciais nunca saem para terceiros
type: feature
---
Um áudio informal e comprido (>180 chars e 3+ frases) é analisado e separado em itens distintos:
- `fact` → interactions (interaction_type "facto")
- `follow_up` → follow_ups via TOOL_REGISTRY.create_follow_up
- `note` → interactions (interaction_type "nota"), com `is_confidential`

Tudo é proposto numa só mensagem e confirmado de uma vez ("Guardo tudo assim?"), via um único `pending_actions` com intent `audio_breakdown`.

**Confidencialidade (regra dura):** `interactions.is_confidential` / `miscellaneous_items.is_confidential`. Uma nota confidencial pode aparecer ao consultor (com badge "Confidencial · só para ti"), mas NUNCA pode entrar em texto destinado a terceiros. Qualquer construtor de texto "para fora" tem de passar por `dropConfidential()` / `outwardInteractionFilter()` em `src/lib/assessor/culture/confidential.ts`.
