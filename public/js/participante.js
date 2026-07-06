/* Página do participante: entrar → escolher 9 → acompanhar cartela */

const msgBox = document.getElementById('msg');
const steps = {
  join: document.getElementById('step-join'),
  pick: document.getElementById('step-pick'),
  card: document.getElementById('step-card')
};

let me = null;          // participante {id, name, dealt, chosen}
let state = null;       // estado público
let selected = new Set();

function showStep(name) {
  Object.entries(steps).forEach(([k, el]) => (el.hidden = k !== name));
}

function stickerById(id) {
  return state?.stickers.find((s) => s.id === id);
}

/* ---------------------------------------------------------------- passos */

async function init() {
  state = await api('/api/state');
  const savedId = localStorage.getItem('copaMold.participantId');
  if (savedId) {
    try {
      me = await api(`/api/participants/${savedId}`);
    } catch {
      localStorage.removeItem('copaMold.participantId');
    }
  }
  render();
  connectEvents(onEvent);
}

let prevDrawn = null; // sorteadas conhecidas na última atualização

function onEvent(ev) {
  if (ev.state) state = ev.state;
  if (ev.reset === 'all') {
    localStorage.removeItem('copaMold.participantId');
    me = null;
    selected.clear();
    prevDrawn = null;
  }
  if (me?.chosen && state) {
    // com polling não há evento "draw": detectamos comparando com o estado anterior
    const newIds = prevDrawn ? state.drawn.filter((id) => !prevDrawn.includes(id)) : [];
    prevDrawn = state.drawn.slice();
    const mineDrawn = newIds.find((id) => me.chosen.includes(id));
    renderCard(mineDrawn);
    showStep('card');
    announceIfWon();
    return;
  }
  if (state) prevDrawn = state.drawn.slice();
  render();
}

/* Anuncia a vitória uma única vez (sobrevive a recargas da página). */
function announceIfWon() {
  const winnerIds = state.winners.map((w) => w.participantId);
  const idx = winnerIds.indexOf(me.id);
  const key = `copaMold.winAnnounced.${me.id}`;
  if (idx === -1) {
    localStorage.removeItem(key); // sorteio foi zerado: libera novo anúncio
    return;
  }
  if (localStorage.getItem(key)) return;
  localStorage.setItem(key, '1');
  showWinnerOverlay([me.name], idx === 0 ? 'Você venceu!' : `Cartela completa! (${idx + 1}º)`);
}

function render() {
  if (!me) {
    showStep('join');
  } else if (!me.chosen) {
    renderPick();
    showStep('pick');
  } else {
    renderCard();
    showStep('card');
  }
}

/* -------------------------------------------------------------- entrada */

document.getElementById('join-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = document.getElementById('join-name').value.trim();
  if (!name) return;
  try {
    me = await api('/api/participants', { method: 'POST', body: { name } });
    localStorage.setItem('copaMold.participantId', me.id);
    selected = new Set(me.chosen || []);
    render();
  } catch (err) {
    showMsg(msgBox, err.message, 'err');
  }
});

/* --------------------------------------------------------------- escolha */

function pickNeed() {
  return Math.min(state?.pickSize || 9, me?.dealt.length || 9);
}

function renderPick() {
  const grid = document.getElementById('pick-grid');
  document.getElementById('pick-title').textContent = `Monte sua seleção, ${me.name.split(' ')[0]}!`;
  document.getElementById('pick-need').textContent = pickNeed();
  grid.innerHTML = '';
  me.dealt.forEach((id, i) => {
    const s = stickerById(id);
    if (!s) return;
    const el = stickerEl(s, { selectable: true, selected: selected.has(id) });
    el.style.animation = `stamp .45s ${i * 0.06}s cubic-bezier(.2,2,.4,1) both`;
    el.addEventListener('click', () => togglePick(id, el));
    grid.appendChild(el);
  });
  updatePickCounter();
}

function togglePick(id, el) {
  if (selected.has(id)) {
    selected.delete(id);
    el.classList.remove('selected');
  } else if (selected.size < pickNeed()) {
    selected.add(id);
    el.classList.add('selected');
  }
  updatePickCounter();
}

function updatePickCounter() {
  document.getElementById('pick-count').textContent = selected.size;
  document.getElementById('pick-confirm').disabled = selected.size !== pickNeed();
}

document.getElementById('pick-confirm').addEventListener('click', async () => {
  try {
    me = await api(`/api/participants/${me.id}/card`, {
      method: 'POST',
      body: { chosen: [...selected] }
    });
    showMsg(msgBox, 'Cartela registrada! Boa sorte no sorteio. 🍀', 'ok');
    render();
  } catch (err) {
    showMsg(msgBox, err.message, 'err');
  }
});

/* --------------------------------------------------------------- cartela */

function renderCard(justDrawnId) {
  document.getElementById('card-title').textContent = `Seleção de ${me.name}`;
  const grid = document.getElementById('card-grid');
  grid.innerHTML = '';
  let done = 0;
  me.chosen.forEach((id) => {
    const s = stickerById(id);
    if (!s) return;
    const isDrawn = state.drawn.includes(id);
    if (isDrawn) done++;
    grid.appendChild(
      stickerEl(s, {
        pending: !isDrawn,
        drawn: isDrawn,
        stamped: id === justDrawnId
      })
    );
  });

  const band = document.getElementById('card-progress');
  band.innerHTML = me.chosen
    .map((id) => `<div class="dot ${state.drawn.includes(id) ? 'on' : ''}"></div>`)
    .join('');
  const label = document.getElementById('card-progress-label');
  label.textContent = done === me.chosen.length
    ? '🏆 Cartela completa!'
    : `${done} de ${me.chosen.length} figurinhas coladas — ${state.drawStarted ? 'sorteio em andamento!' : 'aguardando o sorteio começar…'}`;
}

init().catch((err) => showMsg(msgBox, err.message, 'err'));
