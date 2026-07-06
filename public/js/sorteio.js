/* Telão do sorteio: revela figurinhas uma a uma e acompanha as cartelas */

let state = null;
let drawing = false;

const btnDraw = document.getElementById('btn-draw');
const revealSlot = document.getElementById('reveal-slot');

async function draw() {
  if (drawing) return;
  drawing = true;
  btnDraw.disabled = true;
  try {
    const res = await api('/api/draw/next', { method: 'POST' });
    reveal(res.sticker);
    if (res.newWinners?.length) {
      const first = res.newWinners[0].order === 1;
      setTimeout(() => {
        showWinnerOverlay(
          res.newWinners.map((w) => w.name),
          first ? 'Temos um campeão!' : `${res.newWinners[0].order}º a completar!`
        );
      }, 1200);
    }
  } catch (err) {
    alert(err.message);
  } finally {
    setTimeout(() => {
      drawing = false;
      btnDraw.disabled = !state || state.drawn.length >= state.stickers.length;
    }, 900);
  }
}

btnDraw.addEventListener('click', draw);
document.addEventListener('keydown', (e) => {
  if (e.code === 'Space' && !e.repeat) {
    e.preventDefault();
    draw();
  }
});

function reveal(sticker) {
  revealSlot.innerHTML = '';
  const el = stickerEl(sticker, {});
  el.classList.add('flip-in');
  revealSlot.appendChild(el);
}

function render() {
  if (!state) return;

  const total = state.stickers.length;
  const done = state.drawn.length;
  document.getElementById('drawn-count').textContent = `${done} / ${total} sorteadas`;
  btnDraw.disabled = drawing || done >= total;
  if (done >= total && total > 0) {
    btnDraw.textContent = 'Todas sorteadas! 🎉';
  }

  // mantém a última sorteada em destaque (ex.: ao recarregar a página)
  if (done > 0 && !revealSlot.querySelector('.sticker')) {
    const last = state.stickers.find((s) => s.id === state.drawn[done - 1]);
    if (last) reveal(last);
  }

  // mural
  const board = document.getElementById('board-grid');
  board.innerHTML = '';
  state.stickers.forEach((s) => {
    const isDrawn = state.drawn.includes(s.id);
    board.appendChild(stickerEl(s, { pending: !isDrawn, drawn: isDrawn }));
  });

  // placar
  const rank = document.getElementById('rank');
  const withCard = state.participants.filter((p) => p.hasCard);
  const winnerIds = state.winners.map((w) => w.participantId);
  rank.innerHTML = withCard.length
    ? ''
    : '<p style="text-align:center;color:#6d5b36;font-size:13px">Nenhuma cartela registrada ainda.</p>';
  withCard
    .slice()
    .sort((a, b) => {
      const wa = winnerIds.indexOf(a.id); const wb = winnerIds.indexOf(b.id);
      if (wa !== wb) return (wa === -1 ? 99 : wa) - (wb === -1 ? 99 : wb);
      return b.progress - a.progress || a.name.localeCompare(b.name);
    })
    .forEach((p) => {
      const total9 = p.chosen.length;
      const winIdx = winnerIds.indexOf(p.id);
      const row = document.createElement('div');
      row.className = 'rank-row' + (winIdx >= 0 ? ' done' : '');
      row.innerHTML = `
        <span class="nm">${winIdx >= 0 ? '🏆 ' : ''}${escapeHtml(p.name)}</span>
        <span class="bar"><i style="width:${(p.progress / total9) * 100}%"></i></span>
        <span class="pc">${p.progress}/${total9}</span>`;
      rank.appendChild(row);
    });
}

requireAdminGate().then(startTelao);

function startTelao() {
  connectEvents((ev) => {
    if (ev.state) state = ev.state;
    if (ev.reset) revealSlot.innerHTML = `
      <div class="reveal-placeholder">
        <img src="/assets/bimold.png" alt="bimold">
        <span>Clique em “Sortear” para revelar<br>a primeira figurinha!</span>
      </div>`;
    render();
  });
}
