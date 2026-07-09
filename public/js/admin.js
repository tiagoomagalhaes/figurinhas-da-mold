/* Painel do administrador: cadastro de figurinhas, participantes e resets */

const msgBox = document.getElementById('msg');
let state = null;

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

/* ---------------------------------------------------- edição individual */
/* Reaproveitada só para editar uma figurinha já cadastrada no álbum
   (clique em "Editar" na lista "Figurinhas do álbum"). A criação de
   figurinhas novas passou a ser feita em lote — ver seção abaixo. */

const form = document.getElementById('sticker-form');
const fId = document.getElementById('f-id');
const fName = document.getElementById('f-name');
const fRole = document.getElementById('f-role');
const fPhotoEdit = document.getElementById('f-photo-edit');
const fPreview = document.getElementById('f-preview');
let editPhotoData = null; // dataURL da nova foto, se trocada

fPhotoEdit.addEventListener('change', async () => {
  const file = fPhotoEdit.files[0];
  editPhotoData = file ? await resizeImage(file) : null;
  fPreview.src = editPhotoData || '';
  fPreview.style.display = editPhotoData ? 'block' : 'none';
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const body = { name: fName.value, role: fRole.value };
  if (editPhotoData) body.photoData = editPhotoData;
  try {
    await api(`/api/stickers/${fId.value}`, { method: 'PUT', body });
    showMsg(msgBox, 'Figurinha atualizada!', 'ok');
    resetForm();
  } catch (err) {
    showMsg(msgBox, err.message, 'err');
  }
});

document.getElementById('f-cancel').addEventListener('click', resetForm);

function showBatchMode() {
  document.getElementById('batch-create').hidden = false;
  form.hidden = true;
  document.getElementById('form-title').textContent = 'Nova figurinha';
}

function showEditMode() {
  document.getElementById('batch-create').hidden = true;
  form.hidden = false;
}

function resetForm() {
  form.reset();
  fId.value = '';
  editPhotoData = null;
  fPreview.style.display = 'none';
  showBatchMode();
}

function editSticker(s) {
  fId.value = s.id;
  fName.value = s.name;
  fRole.value = s.role || '';
  editPhotoData = null;
  fPreview.src = s.photo || '';
  fPreview.style.display = s.photo ? 'block' : 'none';
  document.getElementById('form-title').textContent = `Editar #${String(s.num).padStart(2, '0')}`;
  showEditMode();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ---------------------------------------------------------- cadastro em lote */

let batch = []; // { localId, dataUrl, title, subtitle, customized, error }
let nextLocalId = 1;

const batchPhotoInput = document.getElementById('f-photo');
const batchTextmodeBox = document.getElementById('batch-textmode');
const batchBulkFields = document.getElementById('batch-bulk-fields');
const batchSubtitleField = document.getElementById('batch-subtitle-field');
const batchTitleInput = document.getElementById('batch-title');
const batchSubtitleInput = document.getElementById('batch-subtitle');
const batchGrid = document.getElementById('batch-grid');
const batchSummary = document.getElementById('batch-summary');
const batchActions = document.getElementById('batch-actions');
const batchSubmitBtn = document.getElementById('batch-submit');
const batchClearBtn = document.getElementById('batch-clear');
const batchProgress = document.getElementById('batch-progress');

batchPhotoInput.addEventListener('change', async () => {
  const files = [...batchPhotoInput.files];
  batchPhotoInput.value = ''; // permite selecionar mais depois, inclusive os mesmos arquivos
  for (const file of files) {
    const dataUrl = await resizeImage(file);
    batch.push({ localId: 'b' + nextLocalId++, dataUrl, title: '', subtitle: '', customized: false, error: null });
  }
  applyBulkText();
});

function currentTextMode() {
  return document.querySelector('input[name="textmode"]:checked')?.value || 'none';
}

document.querySelectorAll('input[name="textmode"]').forEach((r) => r.addEventListener('change', applyBulkText));
batchTitleInput.addEventListener('input', applyBulkText);
batchSubtitleInput.addEventListener('input', applyBulkText);

/* Aplica o modo de texto escolhido a todas as figurinhas que ainda não
   foram personalizadas individualmente (ver openBatchItemEditor). */
function applyBulkText() {
  const mode = currentTextMode();
  batchBulkFields.hidden = mode === 'none' || mode === 'custom';
  batchSubtitleField.hidden = mode !== 'title-subtitle';

  const title = batchTitleInput.value.trim();
  const subtitle = batchSubtitleInput.value.trim();

  batch.forEach((item) => {
    if (item.customized) return; // preserva edição individual (mistura de modos)
    if (mode === 'none') { item.title = ''; item.subtitle = ''; }
    else if (mode === 'title') { item.title = title; item.subtitle = ''; }
    else if (mode === 'title-subtitle') { item.title = title; item.subtitle = subtitle; }
    // mode === 'custom': não mexe, fica como o usuário deixou
  });
  renderBatch();
}

function removeBatchItem(localId) {
  batch = batch.filter((b) => b.localId !== localId);
  renderBatch();
}

function openBatchItemEditor(localId) {
  const item = batch.find((b) => b.localId === localId);
  if (!item) return;
  const modal = document.createElement('div');
  modal.className = 'winner-overlay';
  modal.innerHTML = `
    <div class="album-page batch-item-modal" style="max-width:360px;text-align:center">
      <img src="${item.dataUrl}" alt="">
      <div class="field"><label>Título</label><input type="text" id="bi-title" maxlength="60"></div>
      <div class="field"><label>Subtítulo</label><input type="text" id="bi-subtitle" maxlength="60"></div>
      <div class="actions">
        <button class="btn sm" id="bi-save">Salvar</button>
        <button class="btn sm ghost" id="bi-cancel" style="color:#5b4a28;box-shadow:inset 0 0 0 2px #5b4a28">Cancelar</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  modal.querySelector('#bi-title').value = item.title;
  modal.querySelector('#bi-subtitle').value = item.subtitle;
  modal.querySelector('#bi-save').onclick = () => {
    item.title = modal.querySelector('#bi-title').value.trim();
    item.subtitle = modal.querySelector('#bi-subtitle').value.trim();
    item.customized = true;
    modal.remove();
    renderBatch();
  };
  modal.querySelector('#bi-cancel').onclick = () => modal.remove();
}

batchClearBtn.addEventListener('click', () => {
  if (!batch.length) return;
  if (!confirm(`Remover todas as ${batch.length} imagens carregadas?`)) return;
  batch = [];
  renderBatch();
});

function renderProgressBar(done, total, ok, errCount) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return `<div class="bar-outer"><div class="bar-inner" style="width:${pct}%"></div></div>
    <div class="status-text">${done}/${total} processadas — ${ok} cadastrada${ok === 1 ? '' : 's'}${errCount ? `, ${errCount} com erro` : ''}</div>`;
}

batchSubmitBtn.addEventListener('click', async () => {
  if (!batch.length) return;
  batchSubmitBtn.disabled = true;
  batchClearBtn.disabled = true;
  batchProgress.hidden = false;

  let ok = 0;
  const remaining = [];
  for (let i = 0; i < batch.length; i++) {
    const item = batch[i];
    batchProgress.innerHTML = renderProgressBar(i, batch.length, ok, remaining.length);
    try {
      await api('/api/stickers', {
        method: 'POST',
        body: { name: item.title, role: item.subtitle, photoData: item.dataUrl }
      });
      ok++;
    } catch (err) {
      item.error = err.message;
      remaining.push(item);
    }
  }
  batch = remaining;
  batchProgress.innerHTML = renderProgressBar(ok + batch.length, ok + batch.length, ok, batch.length);
  showMsg(
    msgBox,
    `${ok} figurinha${ok === 1 ? '' : 's'} cadastrada${ok === 1 ? '' : 's'} com sucesso${batch.length ? ` — ${batch.length} com erro (veja abaixo)` : '!'}`,
    batch.length ? 'err' : 'ok'
  );
  batchSubmitBtn.disabled = false;
  batchClearBtn.disabled = false;
  renderBatch();
});

function renderBatch() {
  const hasItems = batch.length > 0;
  batchTextmodeBox.hidden = !hasItems;
  batchGrid.hidden = !hasItems;
  batchActions.hidden = !hasItems;
  batchSummary.hidden = !hasItems;
  if (!hasItems) {
    batchGrid.innerHTML = '';
    batchProgress.hidden = true;
    return;
  }

  const baseNum = state ? Math.max(0, ...state.stickers.map((s) => s.num), 0) : 0;
  batchGrid.innerHTML = '';
  batch.forEach((item, i) => {
    const fake = { id: item.localId, num: baseNum + i + 1, name: item.title, role: item.subtitle, photo: item.dataUrl };
    const el = stickerEl(fake, {});
    el.classList.add('sticker-preview');
    const tools = document.createElement('div');
    tools.className = 'tools';
    tools.innerHTML = `<button class="edit">Editar</button><button class="del">Remover</button>`;
    tools.querySelector('.edit').onclick = () => openBatchItemEditor(item.localId);
    tools.querySelector('.del').onclick = () => removeBatchItem(item.localId);
    el.appendChild(tools);
    if (item.error) {
      const errEl = document.createElement('div');
      errEl.className = 'item-error';
      errEl.textContent = `⚠ ${item.error}`;
      el.appendChild(errEl);
    }
    batchGrid.appendChild(el);
  });

  const mode = currentTextMode();
  const customCount = batch.filter((b) => b.customized).length;
  let extra = '';
  if (mode !== 'none' && customCount > 0) {
    extra = ` <span class="muted">— ${customCount} personalizada${customCount === 1 ? '' : 's'} individualmente</span>`;
  } else if (mode === 'custom') {
    const withoutText = batch.filter((b) => !b.title && !b.subtitle).length;
    if (withoutText > 0) extra = ` <span class="muted">— ${withoutText} ainda sem texto</span>`;
  }
  batchSummary.innerHTML = `${batch.length} ${batch.length === 1 ? 'imagem carregada' : 'imagens carregadas'}${extra}`;
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
