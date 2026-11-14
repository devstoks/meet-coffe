# MeetCoffe — infra (para quando a VPS existir)

Nada aqui foi executado: não há VPS nem Nginx/Postgres neste ambiente. São arquivos prontos para copiar e testar.

## 1. Nginx (`nginx/meetcoffe.conf`)
- `/uploads/` é servido **direto do disco pelo Nginx** (sendfile), sem passar pelo Node → quase zero CPU.
- Cache do navegador/Cloudflare de 30 dias + `immutable` (nomes de arquivo são únicos).
- Vídeo `.mp4`: suporta Range (seek), módulo `mp4`, e limita a velocidade por conexão **depois dos 3 primeiros MB** (play instantâneo sem derrubar a banda).
- `/api` e `/socket.io` vão por proxy para `127.0.0.1:3333`; `/assets` com cache de 1 ano; SPA com fallback para `index.html`.
- Antes de ativar: trocar `server_name`, rodar `sudo nginx -t`, depois `sudo systemctl reload nginx`. Confirme que seu Nginx tem o módulo mp4: `nginx -V 2>&1 | grep mp4` (se não tiver, remova o bloco `location ~* \.mp4$`).

### Vídeo começa mais rápido: `faststart`
O MP4 só começa a tocar antes de baixar tudo se o índice (`moov`) estiver no início do arquivo. Hoje a API grava o vídeo como veio do celular. Ao ter ffmpeg no servidor, rode por vídeo (ou automatize no upload):
```bash
ffmpeg -i entrada.mp4 -c copy -movflags +faststart saida.mp4
```
**Já automatizado:** a API (`faststartMp4` em `server/src/lib/storage.ts`) roda isso no upload do vídeo se o `ffmpeg` estiver instalado (`sudo apt install ffmpeg` na VPS). Se não estiver, ou se falhar, o vídeo original é mantido, sem erro. Vídeos antigos podem ser convertidos com o comando acima.

### No front-end (já feito)
`Feed.tsx`: o vídeo do slide atual usa `preload="auto"`; os demais só `metadata`.

## 2. Backup (`backup/`)
- `backup.sh`: `pg_dump` (formato custom, validado com `pg_restore --list`) + snapshot incremental de `uploads/` com `rsync --link-dest` (só arquivos novos ocupam espaço). Retenção: 14 diários + 8 semanais. Trava contra execução dupla, roda com baixa prioridade (`nice`/`ionice`).
- Cópia externa opcional via `rclone` (`RCLONE_REMOTE="b2:meetcoffe-backup"` em `/etc/meetcoffe-backup.env`). **Sem isso o backup mora na mesma VPS** e não protege se ela for perdida — recomendo configurar (ex.: Backblaze B2 / Cloudflare R2, centavos por mês).
- `meetcoffe-backup.cron` → `/etc/cron.d/meetcoffe-backup` (todo dia 04:10).
- `restore.sh db|uploads <origem>`: restaura (o do banco pede confirmação "SIM").

Instalação na VPS:
```bash
sudo apt install postgresql-client rsync rclone
sudo cp infra/backup/meetcoffe-backup.cron /etc/cron.d/meetcoffe-backup
sudo /srv/meetcoffe/infra/backup/backup.sh     # rode 1x na mão e confira o log
```
**Teste a restauração** num banco de teste antes de confiar no backup.

## Premissas
Projeto em `/srv/meetcoffe` (uploads em `/srv/meetcoffe/uploads`, mesmo caminho que a API usa: `../uploads`); a versão do `pg_dump` deve ser igual ou maior que a do servidor Postgres.
