# Bootstrap do primeiro super_admin

A área `/admin` só é acessível a utilizadores com `role = super_admin` ou `support_admin` na tabela `public.user_roles`. Nenhum utilizador pode promover-se a si próprio, nem pela app nem por API pública — o único caminho é executar SQL com a chave de serviço.

## Passos (executar uma vez, por um responsável técnico)

1. Criar uma conta normal na app via `/auth` (email + palavra-passe ou Google). Guardar o email.
2. Ligar ao Supabase do projeto com um cliente com privilégios (service role). Isto não é feito pela app.
3. Executar em SQL, substituindo o email:

```sql
insert into public.user_roles (user_id, role, created_by)
select id, 'super_admin', id
from auth.users
where email = 'responsavel@exemplo.pt'
on conflict (user_id, role) do nothing;
```

4. Registar a ação manualmente para auditoria:

```sql
insert into public.admin_audit_logs (admin_user_id, action, target_user_id, reason, metadata)
select id, 'role.bootstrap', id, 'Bootstrap manual do primeiro super_admin', '{}'::jsonb
from auth.users where email = 'responsavel@exemplo.pt';
```

5. Fazer login na app e abrir `/admin`. A partir daqui, novos `support_admin` ou `super_admin` são criados dentro da área de administração por um `super_admin` existente.

## Regras não negociáveis

- Nunca guardar palavras-passe, tokens ou a chave `service_role` no repositório.
- Nunca expor `service_role` no frontend nem em variáveis `VITE_*`.
- Um `super_admin` não pode alterar a sua própria função — a operação é rejeitada no backend.
- Toda a atribuição, remoção ou alteração de função gera um registo em `admin_audit_logs`.
- Administradores não têm acesso, por defeito, a conversas, contactos, oportunidades, despesas, comissões ou documentos dos consultores. O mecanismo de "acesso de suporte temporário" (autorização do utilizador, motivo, duração) será implementado antes de qualquer leitura desses dados.
- MFA para administradores deve ser tornado obrigatório assim que o Supabase MFA estiver ativado no projeto.