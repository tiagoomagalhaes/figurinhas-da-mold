/* Painel do administrador: cadastro de figurinhas, participantes e resets */

const msgBox = document.getElementById('msg');
let state = null;
let photoData = null; // dataURL da foto escolhida no formulário

/* ------------------------------------------------------------ formulário */

const form = document.getElementById('sticker-form');
const fId = document.getElementById('f-id');
const fName = document.getElementById('f-name');
const fRole = document.getElementById('f-role');
const fPhoto = document.getElementById('f-photo');
const fPreview = document.getElementById('f-preview');

fPhoto.addEventListener('change', async () => {
  const file = fPhoto.files[0];
  photoData = file ? await resizeImage(file) : null;
  fPreview.src = photoData || '';
  fPreview.style.display = photoData ? 'block' : 'none';
});

/* Redimensiona a foto no navegador para não inflar o banco. */
function resizeImage(file, max = 700) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', 0.86));
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const body = { name: fName.value, role: fRole.value };
  if (photoData) body.photoData = photoData;
  try {
    if (fId.value) {
      await api(`/api/stickers/${fId.value}`, { method: 'PUT', body });
      showMsg(msgBox, 'Figurinha atualizada!', 'ok');
    } else {
      await api('/api/stickers', { method: 'POST', body });
      showMsg(msgBox, `Figurinha de ${fName.value.trim()} cadastrada!`, 'ok');
    }
    resetForm();
  } catch (err) {
    showMsg(msgBox, err.message, 'err');
  }
});

document.getElementById('f-cancel').addEventListener('click', resetForm);

function resetForm() {
  form.reset();
  fId.value = '';
  photoData = null;
  fPreview.style.display = 'none';
  document.getElementById('form-title').textContent = 'Nova figurinha';
  document.getElementById('f-submit').textContent = 'Cadastrar';
  document.getElementById('f-cancel').style.display = 'none';
}

function editSticker(s) {
  fId.value = s.id;
  fName.value = s.name;
  fRole.value = s.role || '';
  photoData = null;
  fPreview.src = s.photo || '';
  fPreview.style.display = s.photo ? 'block' : 'none';
  document.getElementById('form-title').textContent = `Editar #${String(s.num).padStart(2, '0')}`;
  document.getElementById('f-submit').textContent = 'Salvar';
  document.getElementById('f-cancel').style.display = 'inline-block';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* --------------------------------------------------------------- listas */

function render() {
  if (!state) return;

  // figurinhas
  const list = document.getElementById('sticker-list');
  document.getElementById('sticker-count').textContent = state.stickers.length;
  list.innerHTML = '';
  state.stickers.forEach((s) => {
    const el = stickerEl(s, { drawn: state.drawn.includes(s.id) });
    const tools = document.createElement('div');
    tools.className = 'tools';
    tools.innerHTML = `<button class="edit">Editar</button><button class="del">Excluir</button>`;
    tools.querySelector('.edit').onclick = () => editSticker(s);
    tools.querySelector('.del').onclick = async () => {
      if (!confirm(`Excluir a figurinha de ${s.name}?`)) return;
      try { await api(`/api/stickers/${s.id}`, { method: 'DELETE' }); }
      catch (err) { showMsg(msgBox, err.message, 'err'); }
    };
    el.appendChild(tools);
    list.appendChild(el);
  });

  // participantes
  const tbody = document.getElementById('participant-list');
  document.getElementById('participant-count').textContent = state.participants.length;
  const winnerIds = state.winners.map((w) => w.participantId);
  tbody.innerHTML = '';
  state.participants
    .slice()
    .sort((a, b) => (b.progress ?? -1) - (a.progress ?? -1))
    .forEach((p) => {
      const tr = document.createElement('tr');
      const winIdx = winnerIds.indexOf(p.id);
      const status = winIdx >= 0
        ? `<span class="pill win">🏆 ${winIdx + 1}º a completar</span>`
        : p.hasCard
          ? `<span class="pill ok">Registrada</span>`
          : `<span class="pill wait">Escolhendo…</span>`;
      tr.innerHTML = `
        <td><strong>${escapeHtml(p.name)}</strong></td>
        <td>${status}</td>
        <td>${p.hasCard ? `${p.progress} / ${p.chosen.length}` : '—'}</td>
        <td style="text-align:right"><button class="del" style="border:none;border-radius:6px;padding:4px 10px;cursor:pointer;background:#fbdede;color:#8f1f1f;font-weight:700;font-size:12px">Remover</button></td>`;
      tr.querySelector('.del').onclick = async () => {
        if (!confirm(`Remover ${p.name} da dinâmica?`)) return;
        try { await api(`/api/participants/${p.id}`, { method: 'DELETE' }); }
        catch (err) { showMsg(msgBox, err.message, 'err'); }
      };
      tbody.appendChild(tr);
    });
}

/* ---------------------------------------------------------------- resets */

document.getElementById('btn-reset-draw').onclick = async () => {
  if (!confirm('Zerar o sorteio? As cartelas dos participantes são mantidas.')) return;
  await api('/api/draw/reset', { method: 'POST' });
  showMsg(msgBox, 'Sorteio zerado.', 'ok');
};

document.getElementById('btn-reset-all').onclick = async () => {
  if (!confirm('Zerar TUDO? Isso remove todos os participantes, cartelas e o sorteio. As figurinhas cadastradas são mantidas.')) return;
  await api('/api/reset-all', { method: 'POST' });
  showMsg(msgBox, 'Dinâmica zerada — pronta para recomeçar.', 'ok');
};

/* ----------------------------------------------------------------- start */

requireAdminGate().then(() => {
  connectEvents((ev) => {
    if (ev.state) state = ev.state;
    render();
  });
});
