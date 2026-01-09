// Simple "Create" page logic: upload image + enter text + preview + save to localStorage
const els = {
  btnFeed: document.getElementById('btnFeed'),
  imageZone: document.getElementById('imageZone'),
  pickImageBtn: document.getElementById('pickImageBtn'),
  imageInput: document.getElementById('imageInput'),
  imagePreview: document.getElementById('imagePreview'),
  imagePlaceholder: document.getElementById('imagePlaceholder'),

  textZone: document.getElementById('textZone'),
  editTextBtn: document.getElementById('editTextBtn'),
  textPreview: document.getElementById('textPreview'),
  textPlaceholder: document.getElementById('textPlaceholder'),

  textModal: document.getElementById('textModal'),
  textInput: document.getElementById('textInput'),
  cancelTextBtn: document.getElementById('cancelTextBtn'),
  saveTextBtn: document.getElementById('saveTextBtn'),
};

const STORAGE_KEY = 'memes_v1';

let state = {
  imageDataUrl: null,
  text: '',
};

// ---------- helpers ----------
function loadDraft() {
  try {
    const draft = JSON.parse(localStorage.getItem('meme_draft_v1') || 'null');
    if (!draft) return;
    state = { ...state, ...draft };
  } catch (_) {}
}

function saveDraft() {
  try {
    localStorage.setItem('meme_draft_v1', JSON.stringify(state));
  } catch (_) {}
}

function addMemeToStorage(meme) {
  const list = readMemes();
  list.unshift(meme);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, 100))); // keep last 100
}

function readMemes() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch (_) {
    return [];
  }
}

function render() {
  // Image
  if (state.imageDataUrl) {
    els.imagePreview.src = state.imageDataUrl;
    els.imagePreview.style.display = 'block';
    els.imagePlaceholder.style.display = 'none';
  } else {
    els.imagePreview.removeAttribute('src');
    els.imagePreview.style.display = 'none';
    els.imagePlaceholder.style.display = 'block';
  }

  // Text
  const hasText = state.text && state.text.trim().length > 0;
  if (hasText) {
    els.textPreview.textContent = state.text;
    els.textPreview.style.display = 'block';
    els.textPlaceholder.style.display = 'none';
  } else {
    els.textPreview.textContent = '';
    els.textPreview.style.display = 'none';
    els.textPlaceholder.style.display = 'block';
  }
}

function openTextModal() {
  els.textInput.value = state.text || '';
  els.textModal.classList.add('is-open');
  els.textModal.setAttribute('aria-hidden', 'false');
  setTimeout(() => els.textInput.focus(), 0);
}

function closeTextModal() {
  els.textModal.classList.remove('is-open');
  els.textModal.setAttribute('aria-hidden', 'true');
}

function maybeAutosaveMeme() {
  // Save a meme when we have at least an image OR text.
  if (!state.imageDataUrl && (!state.text || !state.text.trim())) return;

  const meme = {
    id: crypto?.randomUUID?.() || String(Date.now()),
    createdAt: new Date().toISOString(),
    imageDataUrl: state.imageDataUrl,
    text: state.text,
  };

  // Prevent spamming storage: only save when user explicitly clicks "Save" text OR uploads image
  // We'll call this function from those actions.
  addMemeToStorage(meme);
}

// ---------- events ----------
els.btnFeed.addEventListener('click', () => {
  alert('Страница Feed пока не сделана. Сейчас это заглушка 🙂');
});

function pickImage() {
  els.imageInput.click();
}

els.pickImageBtn.addEventListener('click', pickImage);
els.imageZone.addEventListener('click', pickImage);
els.imageZone.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') pickImage();
});

els.imageInput.addEventListener('change', () => {
  const file = els.imageInput.files?.[0];
  if (!file) return;

  if (!file.type.startsWith('image/')) {
    alert('Пожалуйста, выбери файл-картинку (png/jpg/webp).');
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    state.imageDataUrl = String(reader.result || '');
    saveDraft();
    render();
    maybeAutosaveMeme();
  };
  reader.readAsDataURL(file);
});

els.editTextBtn.addEventListener('click', openTextModal);
els.textZone.addEventListener('click', openTextModal);
els.textZone.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') openTextModal();
});

// Clear text on double click (like a simple UX shortcut)
els.textZone.addEventListener('dblclick', () => {
  state.text = '';
  saveDraft();
  render();
});

els.cancelTextBtn.addEventListener('click', closeTextModal);
els.saveTextBtn.addEventListener('click', () => {
  state.text = els.textInput.value;
  saveDraft();
  render();
  closeTextModal();
  maybeAutosaveMeme();
});

els.textModal.addEventListener('click', (e) => {
  const target = e.target;
  if (target && target.getAttribute && target.getAttribute('data-close') === 'true') {
    closeTextModal();
  }
});

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && els.textModal.classList.contains('is-open')) closeTextModal();
});

// ---------- init ----------
loadDraft();
render();
