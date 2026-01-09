const STORAGE_KEY = "memes";

const feedEl = document.getElementById("feed");
const emptyEl = document.getElementById("emptyState");

const btnCreate = document.getElementById("btnCreate");
btnCreate.addEventListener("click", () => {
  // Create страница у тебя index.html
  window.location.href = "index.html";
});

function readMemes() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) ?? [];
  } catch {
    return [];
  }
}

function formatTime(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleString();
  } catch {
    return "";
  }
}

function render() {
  const memes = readMemes();

  feedEl.innerHTML = "";
  if (!memes.length) {
    emptyEl.style.display = "block";
    return;
  }
  emptyEl.style.display = "none";

  // Непрерывная лента: выводим все, по порядку (новые сверху)
  for (const meme of memes) {
    const post = document.createElement("article");
    post.className = "post";

    const text = document.createElement("p");
    text.className = "postText";
    text.textContent = meme.text ?? "";

    const imgWrap = document.createElement("div");
    imgWrap.className = "imgWrap";

    const img = document.createElement("img");
    img.className = "postImg";
    img.alt = "Meme image";
    img.src = meme.imageDataUrl ?? "";

    imgWrap.appendChild(img);

    const meta = document.createElement("div");
    meta.className = "meta";
    meta.textContent = meme.createdAt ? formatTime(meme.createdAt) : "";

    post.appendChild(text);
    post.appendChild(imgWrap);
    post.appendChild(meta);

    feedEl.appendChild(post);
  }
}

render();

// Чтобы лента обновлялась, если ты вернулся со страницы Create (без перезагрузки)
window.addEventListener("focus", render);
