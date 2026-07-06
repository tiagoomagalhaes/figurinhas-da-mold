/* Copa Moldsoft — utilidades compartilhadas */

function adminKey() {
  return sessionStorage.getItem('copaMold.adminKey') || '';
}

async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  const key = adminKey();
  if (key) headers['x-admin-key'] = key;
  const res = await fetch(path, {
    ...options,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Erro ${res.status}`);
  return data;
}

/**
 * Garante que temos a senha de admin válida antes de liberar a página.
 * Mostra um portão de senha; resolve quando a senha confere.
 */
async function requireAdminGate() {
  // tenta a senha já guardada
  if (adminKey()) {
    try { await fetch('/api/admin/check', { headers: { 'x-admin-key': adminKey() } }).then((r) => { if (!r.ok) throw 0; }); return; }
    catch { sessionStorage.removeItem('copaMold.adminKey'); }
  }
  return new Promise((resolve) => {
    const gate = document.createElement('div');
    gate.className = 'winner-overlay';
    gate.innerHTML = `
      <div class="album-page" style="max-width:380px;text-align:center">
        <img src="/assets/bimold.png" style="height:80px" alt="">
        <h2 style="font-family:var(--font-display);color:var(--bordo);letter-spacing:2px;margin:8px 0 4px">Área restrita</h2>
        <p style="color:#6d5b36;font-size:14px;margin:0 0 16px">Digite a senha de administrador para continuar.</p>
        <div class="field"><input type="password" id="gate-pass" placeholder="Senha" autofocus></div>
        <div id="gate-err" style="color:#8f1f1f;font-size:13px;min-height:18px;margin-bottom:8px"></div>
        <button class="btn gold" id="gate-go">Entrar</button>
      </div>`;
    document.body.appendChild(gate);
    const input = gate.querySelector('#gate-pass');
    const err = gate.querySelector('#gate-err');
    const submit = async () => {
      const pass = input.value.trim();
      if (!pass) return;
      try {
        const r = await fetch('/api/admin/check', { headers: { 'x-admin-key': pass } });
        if (!r.ok) throw new Error('Senha incorreta.');
        sessionStorage.setItem('copaMold.adminKey', pass);
        gate.remove();
        resolve();
      } catch (e) {
        err.textContent = 'Senha incorreta. Tente novamente.';
        input.select();
      }
    };
    gate.querySelector('#gate-go').addEventListener('click', submit);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
    setTimeout(() => input.focus(), 50);
  });
}

/** Conecta via Polling (já que o Vercel não suporta SSE contínuo) */
function connectEvents(onEvent) {
  let interval;
  let lastState = null;
  async function poll() {
    try {
      const state = await api('/api/state');
      if (lastState && lastState.drawn.length > 0 && state.drawn.length === 0) {
        onEvent({ reset: 'all', state });
      } else {
        onEvent({ type: 'state', state });
      }
      lastState = state;
    } catch (e) {
      // Ignora falhas temporárias de rede
    }
  }
  poll();
  interval = setInterval(poll, 2500);
  return { close: () => clearInterval(interval) };
}

/**
 * Monta o HTML de uma figurinha estilo álbum de Copa.
 * opts: { drawn, pending, selectable, selected, stamped }
 */
function stickerEl(sticker, opts = {}) {
  const el = document.createElement('div');
  el.className = 'sticker';
  if (opts.selectable) el.classList.add('selectable');
  if (opts.selected) el.classList.add('selected');
  if (opts.pending) el.classList.add('pending');
  if (opts.stamped) el.classList.add('stamped');
  if (opts.drawn) el.classList.add('drawn-mark');
  el.dataset.id = sticker.id;

  const num = String(sticker.num).padStart(2, '0');
  const photo = sticker.photo
    ? `<img src="${sticker.photo}" alt="${escapeHtml(sticker.name)}" loading="lazy">`
    : `<div class="placeholder"><img src="/assets/bimold.png" alt=""></div>`;

  el.innerHTML = `
    <div class="row-top">
      <span class="badge-num">#${num}</span>
      <span class="badge-ed">Copa<br>Moldsoft</span>
    </div>
    <div class="photo">${photo}</div>
    <div class="banner">
      <div class="name">${escapeHtml(sticker.name)}</div>
      <div class="role">${escapeHtml(sticker.role || 'Craque da Moldsoft')}</div>
    </div>
    <div class="crest"><img src="/assets/bimold.png" alt=""></div>
  `;
  return el;
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function showMsg(container, text, kind = 'info') {
  container.innerHTML = `<div class="msg ${kind}">${escapeHtml(text)}</div>`;
  if (kind !== 'err') setTimeout(() => { container.innerHTML = ''; }, 5000);
}

/* Chuva de confete nas cores do evento. */
function confettiBurst(durationMs = 5000) {
  const colors = ['#d9ab3c', '#1b9cd8', '#7a1f3d', '#f6efdd', '#1f8a4c'];
  const end = Date.now() + durationMs;
  (function spawn() {
    for (let i = 0; i < 8; i++) {
      const c = document.createElement('div');
      c.className = 'confetti';
      c.style.left = Math.random() * 100 + 'vw';
      c.style.background = colors[Math.floor(Math.random() * colors.length)];
      c.style.animationDuration = 2.5 + Math.random() * 2.5 + 's';
      c.style.transform = `rotate(${Math.random() * 360}deg)`;
      document.body.appendChild(c);
      setTimeout(() => c.remove(), 6000);
    }
    if (Date.now() < end) setTimeout(spawn, 120);
  })();
}

/** Overlay de vencedor. names: array de strings. */
function showWinnerOverlay(names, orderLabel) {
  document.querySelector('.winner-overlay')?.remove();
  const ov = document.createElement('div');
  ov.className = 'winner-overlay';
  ov.innerHTML = `
    <div class="winner-card">
      <div class="trophy">🏆</div>
      <h2>${escapeHtml(orderLabel || 'Cartela completa!')}</h2>
      <div class="who">${names.map(escapeHtml).join(' & ')}</div>
      <div class="sub">Completou a seleção da Copa Moldsoft!</div>
      <div style="margin-top:26px"><button class="btn gold" onclick="this.closest('.winner-overlay').remove()">Continuar</button></div>
    </div>`;
  document.body.appendChild(ov);
  confettiBurst();
}
