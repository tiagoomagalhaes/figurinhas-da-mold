# ⚽ Copa Moldsoft — Álbum de Figurinhas

Dinâmica de integração inspirada no álbum de figurinhas da Copa do Mundo, com a
identidade visual da Moldsoft e o mascote **bimold**.

## Como rodar

Não há dependências para instalar — só é preciso Node.js 18+:

```bash
node server.js
```

| Página | URL | Para quem |
| --- | --- | --- |
| Álbum do participante | `http://localhost:3000/` | Colaboradores |
| Painel do administrador | `http://localhost:3000/admin.html` | Organização |
| Telão do sorteio | `http://localhost:3000/sorteio.html` | Projetor do evento |

Para os participantes acessarem de seus celulares, use o IP da máquina na rede
local (ex.: `http://192.168.0.10:3000`).

## Fluxo da dinâmica

1. **Antes do evento** — no painel admin, cadastre as ~28 figurinhas
   (nome, posição/cargo e foto de cada colaborador).
2. **Participantes** — cada um acessa a página, digita o nome e recebe
   **15 figurinhas aleatórias**; escolhe **9** para montar sua seleção.
   A cartela é registrada automaticamente para o sorteio.
3. **Sorteio** — no telão, clique em **Sortear figurinha** (ou barra de
   espaço). Cada figurinha é revelada com animação — momento de comentar
   sobre o colaborador sorteado. Todas as cartelas se atualizam em tempo
   real nos celulares dos participantes.
4. **Vencedor** — quando alguém completa as 9 figurinhas, o sistema anuncia
   o campeão com festa no telão (e continua indicando 2º, 3º… se o sorteio
   prosseguir).

## Regras e detalhes

- Depois que a **primeira figurinha é sorteada**, novas entradas e registros
  de cartela são bloqueados (garante justiça no bingo).
- O participante pode fechar e reabrir a página: a cartela fica salva no
  navegador e no servidor. Entrar com o mesmo nome recupera a cartela.
- **Zerar sorteio** (admin) recomeça o bingo mantendo as cartelas.
  **Zerar tudo** remove participantes e sorteio, mantendo as figurinhas.
- Os dados ficam em `data/db.json` e as fotos em `data/uploads/` — para
  backup, basta copiar a pasta `data`.
- Ajustes rápidos: as constantes `DEAL_SIZE` (15) e `PICK_SIZE` (9) ficam no
  topo de `server.js`.

## Senha do administrador

O painel (`/admin.html`) e o telão (`/sorteio.html`) pedem senha. Ela é definida
pela variável de ambiente `ADMIN_PASSWORD`. Se não for definida, o padrão é
`moldsoft` (apenas para testes locais — **troque antes de publicar**).

```bash
ADMIN_PASSWORD="minha-senha-forte" node server.js
```

A página do participante (`/`) permanece aberta, sem senha.

## Publicar online (Vercel)

O projeto foi adaptado para a arquitetura Serverless do **Vercel** usando **Vercel KV** para o banco de dados e **Vercel Blob** para salvar as fotos das figurinhas.

1. Suba o código para um repositório no GitHub.
2. Em <https://vercel.com> → **Add New Project** → conecte o repositório.
3. Vá na aba **Storage** do seu projeto no Vercel:
   - Crie um banco **KV** e conecte ao projeto.
   - Crie um **Blob** e conecte ao projeto.
4. Em **Settings → Environment Variables**, adicione a variável `ADMIN_PASSWORD` com a sua senha secreta.
5. Faça o Deploy.

Os dados agora ficam persistentes nos serviços em nuvem do Vercel e não se perdem a cada reinício das funções.

## Variáveis de ambiente

| Variável | Padrão | Para quê |
| --- | --- | --- |
| `PORT` | `3000` | Porta do servidor (usada apenas no modo Local). |
| `ADMIN_PASSWORD` | `moldsoft` | Senha do admin e do telão. |
| `KV_REST_API_URL` | - | Gerado automaticamente ao conectar Vercel KV. |
| `KV_REST_API_TOKEN` | - | Gerado automaticamente ao conectar Vercel KV. |
| `BLOB_READ_WRITE_TOKEN` | - | Gerado automaticamente ao conectar Vercel Blob. |
