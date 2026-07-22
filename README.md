# Diagnóstico de Marketing por Loja — Rede Pop (versão online)

Painel para a equipe de marketing da franqueadora: sobe os CSVs do PDV de cada loja,
gera indicadores com semáforo, roteiro de entrevista, padrão operacional, prestação
de serviço mensal e plano de ação por unidade. Fichas ficam salvas em banco de dados
online (Supabase), acessíveis por toda a equipe com login.

## Passo 1 — Criar o banco (Supabase, gratuito)

1. Acesse https://supabase.com e crie uma conta (plano Free).
2. Crie um projeto (ex.: `rede-pop-marketing`). Guarde a senha do banco.
3. No menu lateral, abra **SQL Editor** e execute o script abaixo:

```sql
create table public.fichas (
  loja text primary key,
  dados jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.fichas enable row level security;

create policy "equipe autenticada le" on public.fichas
  for select to authenticated using (true);

create policy "equipe autenticada grava" on public.fichas
  for insert to authenticated with check (true);

create policy "equipe autenticada atualiza" on public.fichas
  for update to authenticated using (true);
```

4. Em **Authentication → Providers**, deixe apenas **Email** habilitado
   e DESATIVE "Allow new users to sign up" (assim só o admin cria usuários).
5. Em **Authentication → Users → Add user**, crie os logins da equipe
   (e-mail + senha). Ex.: gerente de marketing, direção.
6. Em **Project Settings → API**, copie:
   - `Project URL`
   - `anon public key`

## Passo 2 — Configurar o projeto

1. Copie `.env.example` para `.env` e preencha com a URL e a chave anon.
2. Para editar os nomes das lojas no seletor, abra `src/lojas.js`
   (o código FR é fixo; o nome é livre — ex.: FR02 — Nova Esperança).

## Passo 3 — Rodar localmente (opcional)

```bash
npm install
npm run dev
```

Abra http://localhost:5173 e entre com um dos usuários criados.

## Passo 4 — Publicar na Vercel (gratuito)

1. Suba esta pasta para um repositório no GitHub (pode ser privado).
2. Acesse https://vercel.com, conecte o GitHub e importe o repositório.
3. Em **Environment Variables**, adicione:
   - `VITE_SUPABASE_URL` = a URL do projeto Supabase
   - `VITE_SUPABASE_ANON_KEY` = a chave anon
4. Deploy. A Vercel gera um endereço https fixo — esse é o link da equipe.

## Rotina de uso

1. Entrar com o login da equipe.
2. Selecionar a loja (FR) no topo — o campo é um seletor, sem digitação.
3. Subir os CSVs mensais do PDV, preencher as abas na reunião.
4. Salvar ficha (grava no banco, com histórico de quem preencheu, horário
   e participantes) e Baixar .txt para arquivar no Drive da loja.

## Segurança

- O acesso exige login; sem usuário criado pelo admin, ninguém entra.
- A chave `anon` pode ficar no front-end: com RLS ativado, ela só permite
  o que as políticas acima autorizam, e apenas para usuários autenticados.
- As gravações das reuniões continuam no Drive restrito — este painel
  guarda somente as fichas.
