const crypto = require('crypto');
const { kv, createClient } = require('@vercel/kv');
const { put, del } = require('@vercel/blob');

const DEAL_SIZE = 15;
const PICK_SIZE = 9;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'moldsoft';
const IS_VERCEL = !!process.env.VERCEL;

// Aceita tanto as variáveis do KV clássico quanto as do Upstash (marketplace).
const kvClient = (() => {
  if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) return kv;
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    return createClient({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN
    });
  }
  return null;
})();

const EMPTY_DB = () => ({ stickers: [], participants: [], drawn: [], winners: [] });
let db = EMPTY_DB(); // sem KV (dev local), vive só em memória

// Em serverless cada requisição pode cair numa instância diferente:
// SEMPRE recarrega do KV para nunca servir (nem gravar) estado obsoleto.
async function loadDb() {
  if (!kvClient) {
    if (IS_VERCEL) {
      throw new Error(
        'Banco de dados não configurado: no painel da Vercel, abra a aba Storage, ' +
        'crie um banco Redis (Upstash for Redis / KV), conecte a este projeto e faça um novo deploy.'
      );
    }
    return; // dev local sem KV: usa memória
  }
  const data = await kvClient.get('copa_db');
  db = Object.assign(EMPTY_DB(), data || {});
}

async function saveDb() {
  if (kvClient) await kvClient.set('copa_db', db);
}

const uid = () => crypto.randomBytes(6).toString('hex');

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function cardProgress(p) {
  if (!p.chosen) return null;
  return p.chosen.filter((id) => db.drawn.includes(id)).length;
}

function publicState() {
  return {
    dealSize: DEAL_SIZE,
    pickSize: PICK_SIZE,
    stickers: db.stickers,
    drawn: db.drawn,
    drawStarted: db.drawn.length > 0,
    winners: db.winners,
    participants: db.participants.map((p) => ({
      id: p.id,
      name: p.name,
      hasCard: !!p.chosen,
      chosen: p.chosen || null,
      progress: cardProgress(p),
      completedAt: p.completedAt || null
    }))
  };
}

function json(res, code, body) {
  const data = JSON.stringify(body);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(data);
}

function readBody(req) {
  // Na Vercel o corpo JSON pode chegar já interpretado em req.body.
  if (req.body && typeof req.body === 'object') return Promise.resolve(req.body);
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > 20 * 1024 * 1024) {
        reject(new Error('payload muito grande'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks)) : {});
      } catch {
        reject(new Error('JSON inválido'));
      }
    });
    req.on('error', reject);
  });
}

async function savePhoto(id, dataUrl) {
  const m = /^data:image\/(png|jpe?g|webp);base64,(.+)$/s.exec(dataUrl || '');
  if (!m) return null;
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    if (IS_VERCEL) {
      throw new Error(
        'Upload de fotos não configurado: no painel da Vercel, abra a aba Storage, ' +
        'crie um Blob store, conecte a este projeto e faça um novo deploy.'
      );
    }
    // Dev local sem Blob: guarda a imagem inline (data URL). O banco vive em
    // memória mesmo, então dá para testar o painel por completo sem credenciais.
    return dataUrl;
  }
  const ext = m[1] === 'jpeg' ? 'jpg' : m[1];
  const file = `uploads/${id}.${ext}`;
  const buffer = Buffer.from(m[2], 'base64');
  // Sufixo aleatório: permite trocar a foto sem conflito de nome no Blob.
  const blob = await put(file, buffer, { access: 'public', addRandomSuffix: true });
  return blob.url;
}

async function deletePhoto(sticker) {
  if (!sticker.photo || !sticker.photo.includes('public.blob.vercel-storage.com')) return;
  try {
    await del(sticker.photo);
  } catch (e) {
    console.error('Erro ao deletar Blob:', e);
  }
}

function recomputeWinners() {
  const newlyCompleted = [];
  for (const p of db.participants) {
    if (!p.chosen || p.completedAt) continue;
    if (p.chosen.every((id) => db.drawn.includes(id))) {
      p.completedAt = Date.now();
      db.winners.push({ participantId: p.id, order: db.winners.length + 1, at: db.drawn.length });
      newlyCompleted.push({ id: p.id, name: p.name, order: db.winners.length });
    }
  }
  return newlyCompleted;
}

function isAdmin(req) {
  const key = req.headers['x-admin-key'];
  if (!key) return false;
  const a = Buffer.from(String(key));
  const b = Buffer.from(ADMIN_PASSWORD);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const handleRequest = async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  // Diagnóstico do ambiente (não expõe segredos) — abra /api/health no navegador.
  if (url.pathname === '/api/health') {
    const out = {
      vercel: IS_VERCEL,
      kvConfigurado: !!kvClient,
      blobConfigurado: !!process.env.BLOB_READ_WRITE_TOKEN,
      kvOk: false
    };
    try {
      if (kvClient) {
        await kvClient.set('copa_health', Date.now());
        out.kvOk = true;
      }
    } catch (e) {
      out.kvErro = e.message;
    }
    return json(res, 200, out);
  }

  try {
    await loadDb();
  } catch (e) {
    return json(res, 503, { error: e.message });
  }

  const seg = url.pathname.split('/').filter(Boolean);
  const method = req.method;

  const adminRoutes =
    (seg[1] === 'stickers' && method !== 'GET') ||
    (seg[1] === 'participants' && seg[2] && method === 'DELETE') ||
    seg[1] === 'draw' ||
    url.pathname === '/api/reset-all' ||
    url.pathname === '/api/admin/check';
  if (adminRoutes && !isAdmin(req)) {
    return json(res, 401, { error: 'Senha de administrador inválida.' });
  }

  if (url.pathname === '/api/admin/check') {
    return json(res, 200, { ok: true });
  }

  if (method === 'GET' && url.pathname === '/api/events') {
    return json(res, 400, { error: 'SSE desativado no Vercel. Use Polling.' });
  }

  if (method === 'GET' && url.pathname === '/api/state') {
    return json(res, 200, publicState());
  }

  if (url.pathname === '/api/stickers' && method === 'POST') {
    const body = await readBody(req);
    const name = String(body.name || '').trim();
    const hasPhoto = typeof body.photoData === 'string' && body.photoData.startsWith('data:image');
    if (!name && !hasPhoto) return json(res, 400, { error: 'Informe ao menos um título ou uma foto.' });
    const id = uid();
    const photoUrl = await savePhoto(id, body.photoData);
    const sticker = {
      id,
      num: db.stickers.length ? Math.max(...db.stickers.map((s) => s.num)) + 1 : 1,
      name,
      role: String(body.role || '').trim(),
      photo: photoUrl
    };
    db.stickers.push(sticker);
    await saveDb();
    return json(res, 201, sticker);
  }

  if (seg[1] === 'stickers' && seg[2] && method === 'PUT') {
    const sticker = db.stickers.find((s) => s.id === seg[2]);
    if (!sticker) return json(res, 404, { error: 'Figurinha não encontrada.' });
    const body = await readBody(req);
    if (body.name !== undefined) sticker.name = String(body.name).trim();
    if (body.role !== undefined) sticker.role = String(body.role).trim();
    if (body.photoData) {
      await deletePhoto(sticker);
      sticker.photo = await savePhoto(sticker.id, body.photoData);
    }
    await saveDb();
    return json(res, 200, sticker);
  }

  if (seg[1] === 'stickers' && seg[2] && method === 'DELETE') {
    const idx = db.stickers.findIndex((s) => s.id === seg[2]);
    if (idx === -1) return json(res, 404, { error: 'Figurinha não encontrada.' });
    if (db.participants.length) {
      return json(res, 409, { error: 'Já há participantes com figurinhas distribuídas. Zere o jogo antes de excluir.' });
    }
    await deletePhoto(db.stickers[idx]);
    db.stickers.splice(idx, 1);
    await saveDb();
    return json(res, 200, { ok: true });
  }

  if (url.pathname === '/api/participants' && method === 'POST') {
    const body = await readBody(req);
    const name = String(body.name || '').trim();
    if (!name) return json(res, 400, { error: 'Informe seu nome.' });
    const existing = db.participants.find(
      (p) => p.name.toLowerCase() === name.toLowerCase()
    );
    if (existing) return json(res, 200, existing);
    if (db.stickers.length < PICK_SIZE) {
      return json(res, 409, { error: 'O álbum ainda não está pronto.' });
    }
    if (db.drawn.length > 0) {
      return json(res, 409, { error: 'O sorteio já começou.' });
    }
    const p = {
      id: uid(),
      name,
      dealt: shuffle(db.stickers.map((s) => s.id)).slice(0, Math.min(DEAL_SIZE, db.stickers.length)),
      chosen: null,
      createdAt: Date.now(),
      completedAt: null
    };
    db.participants.push(p);
    await saveDb();
    return json(res, 201, p);
  }

  if (seg[1] === 'participants' && seg[2] && !seg[3] && method === 'GET') {
    const p = db.participants.find((x) => x.id === seg[2]);
    if (!p) return json(res, 404, { error: 'Participante não encontrado.' });
    return json(res, 200, p);
  }

  if (seg[1] === 'participants' && seg[2] && method === 'DELETE') {
    const idx = db.participants.findIndex((x) => x.id === seg[2]);
    if (idx === -1) return json(res, 404, { error: 'Participante não encontrado.' });
    db.participants.splice(idx, 1);
    db.winners = db.winners.filter((w) => w.participantId !== seg[2]);
    await saveDb();
    return json(res, 200, { ok: true });
  }

  if (seg[1] === 'participants' && seg[3] === 'card' && method === 'POST') {
    const p = db.participants.find((x) => x.id === seg[2]);
    if (!p) return json(res, 404, { error: 'Participante não encontrado.' });
    if (p.chosen) return json(res, 409, { error: 'Sua cartela já foi registrada.' });
    if (db.drawn.length > 0) {
      return json(res, 409, { error: 'O sorteio já começou.' });
    }
    const body = await readBody(req);
    const chosen = Array.isArray(body.chosen) ? [...new Set(body.chosen)] : [];
    const need = Math.min(PICK_SIZE, p.dealt.length);
    if (chosen.length !== need || !chosen.every((id) => p.dealt.includes(id))) {
      return json(res, 400, { error: `Escolha exatamente ${need} figurinhas.` });
    }
    p.chosen = chosen;
    await saveDb();
    return json(res, 200, p);
  }

  if (url.pathname === '/api/draw/next' && method === 'POST') {
    const undrawn = db.stickers.filter((s) => !db.drawn.includes(s.id));
    if (!undrawn.length) return json(res, 409, { error: 'Todas as figurinhas já foram sorteadas.' });
    const sticker = undrawn[crypto.randomInt(undrawn.length)];
    db.drawn.push(sticker.id);
    const newWinners = recomputeWinners();
    await saveDb();
    return json(res, 200, { sticker, newWinners });
  }

  if (url.pathname === '/api/draw/reset' && method === 'POST') {
    db.drawn = [];
    db.winners = [];
    db.participants.forEach((p) => (p.completedAt = null));
    await saveDb();
    return json(res, 200, { ok: true });
  }

  if (url.pathname === '/api/reset-all' && method === 'POST') {
    db.drawn = [];
    db.winners = [];
    db.participants = [];
    await saveDb();
    return json(res, 200, { ok: true });
  }

  json(res, 404, { error: 'Rota não encontrada (API).' });
};

// Toda falha vira uma resposta JSON legível em vez de um 500 genérico da Vercel.
const serverHandler = async (req, res) => {
  try {
    await handleRequest(req, res);
  } catch (e) {
    console.error('Erro na API:', e);
    if (!res.headersSent) json(res, 500, { error: e.message || 'Erro interno.' });
  }
};

module.exports = serverHandler;
