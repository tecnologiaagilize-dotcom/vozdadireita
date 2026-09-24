# Voz da Direita — primeira entrega

## O que foi implementado

- `supabase/migrations/20260924_integrated_political_core.sql`: eleições por ano, catálogo de candidaturas TSE sem selo de apoio, equipes, estudos, fila de contato e eventos de chamada. Tabelas protegidas por RLS; nesta etapa apenas o administrador do MFB acessa os novos dados.
- `/admin/integracao`: painel administrativo com contagem do novo catálogo, equipes e estudos, formulário para abrir estudo **em rascunho**, lista de estudos. Link incluído no menu do administrador.
- Ano 2026 geral e 2028 municipal criados como metadados após a migração. Águas Lindas tem código IBGE 5200258. O formulário recusa cargos incompatíveis com o ano/UF.

## Instalação em homologação

1. Fazer backup e confirmar que `supabase/schema.sql` e demais migrações existentes do MFB estão aplicadas.
2. Aplicar apenas `supabase/migrations/20260924_integrated_political_core.sql`, uma vez, no banco de homologação.
3. Abrir `/admin/integracao` com usuário de `admin_profiles.role = 'admin'`; conferir painel e criar um rascunho de teste.
4. Verificar no banco que usuários anônimos não leem as tabelas novas e que dados pessoais da fila não aparecem no portal.
5. Planejar migração incremental no banco de produção; não reaplicar o schema completo do MFB em produção.

## Dados existentes aproveitados e limites reais

O arquivo MFB recebido contém fichas de candidatos, links de fontes públicas, sincronização individual TSE/Câmara/Senado e módulos de comunidade. A sincronização atual NÃO importa todo o Brasil; o novo catálogo fica vazio até construirmos a ingestão nacional por lotes e reconciliação. Os candidatos antigos com selo MFB permanecem no módulo antigo até a revisão do portal para catálogo sem indicação institucional.

O ZIP chamado `vozdadireita-main.zip` contém, nesta versão, a **fundação de RH Eleitoral**: autenticação, perfis, pessoas, equipes e trilha de auditoria. Seu README classifica Operações como tela-reserva de fase futura. Não contém discador, URA, PABX, contrato de API ou fluxo funcional de atendimento; o novo esquema reserva fila e eventos para a implementação posterior. Não importar diretamente o schema RH no MFB, pois há perfis e políticas diferentes.

## Próximos incrementos concretos

1. Importação completa e versionada do TSE, com ano/UF/cargo, foto oficial, situação, atualização em lotes, auditoria e retomada após falha.
2. Portal de consulta a **todas** as candidaturas, separado das fichas indicadas antigas, com filtros e origem oficial visível.
3. Interface de equipes e distribuição de tarefas; mapear usuários autenticados e equipes da base RH, sem copiar automaticamente CPF e dados bancários.
4. Integrar provedor de telefonia mediante API/webhooks documentados, gestão de supressão e eventos idempotentes.
5. Questionário e coleta controlada pelo plano amostral aprovado, revisão de privacidade e estatístico responsável; sem votação aberta de preferência eleitoral em 2026.
6. Gerar registros, comprovantes e relatórios por estudo; bloquear divulgação até requisitos técnicos e legais conferidos.

## Revisão de canais em 24/09/2026

O CRM passa a ser o motor externo de automação, mediante integração por API. A primeira interface conversacional automatizada será no **portal web do sistema**, com atendimento humano quando necessário. O CRM poderá receber somente os eventos previstos em contrato/API e com base de tratamento adequada. A interface administrativa de estudos e o catálogo permanecem no mesmo sistema integrado.

**WhatsApp Business Platform / BSP / API:** não configurar bot eleitoral nem usar conta da Tr@de para contornar a restrição. A Política de Mensagens do WhatsApp Business, em sua seção de uso político, proíbe acesso à Plataforma por políticos, campanhas e prestadores não governamentais de serviços políticos, inclusive empresas privadas que forneçam soluções para eleições. A escolha de um intermediário, como Blip, não elimina a restrição. Endereço: https://business.whatsapp.com/policy/preview?lang=pt_BR . A política também exige consentimento explícito e respeito a descadastro, mas consentimento não afasta a proibição para essa categoria de uso.

**VoIP posterior:** estruturar atendimento humano e pesquisas conforme o plano amostral. Separar finalidade de pesquisa de propaganda: o TSE veda propaganda por telemarketing; revisar roteiro, provedor, chamadas e supervisão antes de ativar. Fonte: https://www.tse.jus.br/comunicacao/noticias/2026/Julho/por-dentro-das-eleicoes-conheca-as-regras-estabelecidas-para-a-propaganda-eleitoral .

**Contrato mínimo CRM ↔ portal (a definir quando houver especificação da API):** criação/atualização de contato por identificador interno, evento de início/fim de conversa, finalidade informada, prova de consentimento com origem e data, solicitação de contato humano, revogação/descadastro, auditoria e idempotência. Segredos apenas no servidor; nenhum dado de preferência eleitoral é exportado automaticamente para relacionamento ou mobilização.

**Validação realizada:** checagem TypeScript `tsc --noEmit` concluída sem erros no código da primeira entrega, usando as dependências locais compatíveis já presentes no workspace. Migração SQL não foi aplicada a banco remoto; sem teste de runtime/autenticação.
