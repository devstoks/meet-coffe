# Migração de categorias (não destrutiva)

O que muda no banco (só adições):
- Nova tabela `Category` (id, businessId, name, createdAt; único por negócio + nome).
- Nova coluna **nullable** `Product.categoryId` (FK para `Category`, `onDelete: Restrict`).
- `Product.category` (texto) é MANTIDA como espelho do nome da categoria. Nada é removido.

Como aplicar (pasta `server`):
1. Backup:  `pg_dump "$DATABASE_URL" > backup_antes_categorias.sql`
2. `npx prisma db push`   (o projeto não tem `prisma/migrations`; o comando só adiciona tabela/coluna e não pede reset)
3. Opcional: `npm run db:backfill-categories`  (a API também vincula produtos antigos sozinha na primeira chamada de
   `/api/products` ou `/api/admin/categories`; o script apenas faz tudo de uma vez e é idempotente)
4. Reinicie o servidor.

Regras do backfill: cada `Product.category` distinto (sem diferenciar maiúsculas/minúsculas e ignorando espaços extras)
vira uma `Category` do mesmo negócio; texto vazio vira "Sem categoria". Preços, pedidos e pagamentos não são tocados.

Exclusão: categoria com produtos só é excluída com `?reassignTo=<id>` (produtos são movidos na mesma transação);
sem isso a API responde 409. Há ainda a FK `Restrict` no banco como segunda trava.

Rollback: ignore/remova `Category` e `categoryId`; o texto `Product.category` continua válido.
