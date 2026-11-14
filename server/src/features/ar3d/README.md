# Feature 3D / Realidade Aumentada (isolada)

**Liga/desliga:** `FEATURE_3D=true` em `server/.env` (padrão: desligada). Desligada = nenhum botão no Feed, nenhuma aba no admin, rotas `/api/admin/3d/*` respondem 404.
`AR3D_PROVIDER=mock` (padrão) usa o provedor de **teste**: não chama IA nem cobra; gera um prato de exemplo em ~6s com saldo fictício de 1000 créditos.

## O que existe
- Server: `server/src/features/ar3d/` (config, provedor plugável, store em arquivos, rotas).
- Client: `client/src/features/ar3d/` (visualizador AR, botão do Feed, página do admin).
- Dados: `uploads/models3d/<produtoId>/{model.glb,meta.json}` — sem tabela nova; entra no backup de `uploads`.
- Dependência nova: `@google/model-viewer` (client), carregada só quando alguém abre o 3D.

## Como remover por completo
1. Apague `server/src/features/ar3d/` e `client/src/features/ar3d/` (e `uploads/models3d/`).
2. Apague as linhas com o comentário `ar3d` em: `server/src/index.ts`, `client/src/App.tsx`, `client/src/components/AdminLayout.tsx`, `client/src/pages/Feed.tsx`.
3. `npm uninstall @google/model-viewer` no client.
Para só ocultar: deixe `FEATURE_3D=false`.

## Plugar uma IA real (ex.: Meshy)
Crie `providers/meshy.ts` implementando `Ar3dProvider` (`types.ts`): `createTask` (imagem -> tarefa), `getTask` (progresso/baixar GLB), `getBalance`, `estimateCost`. Registre em `providers/index.ts` e use `AR3D_PROVIDER=meshy` + chave no `.env`.
Para o padrão leve peça à IA baixa contagem de polígonos (ex.: ~10–20 mil), textura 2K e só GLB; o servidor ainda recusa modelo acima de 8 MB (`MAX_GLB_BYTES`).
Pela documentação pública da Meshy, o custo de image-to-3D com textura 2K é de 30 créditos por geração (modelo meshy-6/7.1); confira antes de ligar.

## Limitações
- Nada foi testado em navegador/aparelho real; o GLB de teste foi validado estruturalmente.
- AR usa o motor nativo: Android (ARCore/Scene Viewer) e iPhone (Quick Look, que abre a tela do sistema). Que a mão "passe na frente" do prato (oclusão) depende do aparelho; não é controlável por nós.
- iPhone: o `model-viewer` gera o USDZ automaticamente ao abrir o AR.
- O saldo vem do provedor; no teste é fictício.
