# Voz da Direita — contrato preliminar CRM → sistema

**Estado:** receptor implementado, sem ativação remota e sem dependência de fornecedor específico. O CRM controla envio e conversa. A Tr@de recebe eventos e os armazena para a equipe autorizada. Não confundir o webhook com o motor de envio: nenhuma mensagem sai do sistema nesta etapa.

## Configuração

1. Aplicar `supabase/migrations/20260924_integrated_political_core.sql` e depois `supabase/migrations/20260924_crm_integration_boundary.sql` em homologação.
2. Configurar no servidor `CRM_WEBHOOK_SECRET` com pelo menos 32 caracteres aleatórios e `SUPABASE_SERVICE_ROLE_KEY` já existente, sem prefixo `NEXT_PUBLIC_`.
3. No CRM, cadastrar `POST https://SEU_DOMINIO/api/integrations/crm` e implementar a assinatura abaixo. Adaptar o conector do CRM ao contrato real, sem colocar credenciais na interface pública.
4. Testar autenticação, idempotência, recebimento de opt-out e rejeição de evento malformado. Só depois configurar produção.

## Assinatura e formato

- Header `x-trade-timestamp`: segundos Unix com 10 algarismos, tolerância de 5 minutos.
- Header `x-trade-signature`: `sha256=` seguido do HMAC SHA-256 hexadecimal de `<timestamp>.<corpo JSON exato>`, usando `CRM_WEBHOOK_SECRET`.
- `Content-Type: application/json`; corpo máximo 16 KiB.
- Campos obrigatórios: `event_id` único por CRM, `contact_id` estável no CRM e `type`.
- Resposta `200 {"accepted":true,"duplicate":false}`; reenvio de mesmo `event_id` responde `duplicate:true`. Erro transitório devolve 503, permitindo retry com novo timestamp e a mesma identidade de evento.

```json
{
  "event_id": "evt_001",
  "contact_id": "crm_123",
  "type": "contact_updated",
  "details": {
    "name": "Pessoa Exemplo",
    "phone": "+5561999999999",
    "state_uf": "DF",
    "municipality": "Brasília"
  }
}
```

## Eventos aceitos

| Tipo | Campos extras | Resultado |
| --- | --- | --- |
| `contact_updated` | `details.name`, `phone`, `state_uf`, `municipality` opcionais | Atualiza registro do contato externo |
| `conversation_started` / `conversation_closed` | Nenhum | Atualiza estado da conversa |
| `conversation_message` | `details.message_id`, `direction` (`incoming`/`outgoing`), `content`, `occurred_at` ISO 8601 | Armazena mensagem no histórico restrito |
| `human_handoff` | Nenhum | Sinaliza necessidade de operador |
| `delivery_status` | `details.message_id`, `status` (`sent`/`delivered`/`read`/`failed`) | Armazena evento para futura projeção de entrega |
| `opt_in` | `purpose`, `source`, `recorded_at` ISO 8601 obrigatórios | Registra permissão declarada pelo CRM |
| `opt_out` | Nenhum | Revoga permissão; não reativar sem novo opt-in documentado |

Mensagens e contatos ficam sob RLS para administradores. A ingestão por servidor usa credencial privilegiada, protegida por HMAC; não aceitar eventos diretamente do navegador. O webhook ignora propriedades extras de `details` para reduzir coleta indevida. Respostas individuais a pesquisas, preferência eleitoral, CPF, dados bancários e segmentação política **não estão no contrato deste receptor**; cada finalidade requer um fluxo específico e acesso próprio.

## Mapeamento pendente do CRM real

O contrato acima é nosso lado da integração. Para ligar o CRM escolhido faltam: nomes e formato dos eventos reais, capacidade de webhooks, como o CRM comprova consentimento, identificador de mensagem/contato, autenticação e eventos de descadastro. Um conector traduzirá esses dados para o formato acima. Não foi configurado envio de mensagens ou uma conta de WhatsApp no aplicativo.
