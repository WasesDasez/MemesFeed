// app.js  (один файл для CREATE и FEED)
// Подключи его и на index.html, и на feed.html как type="module" (ниже покажу)

import { db, storage } from "./firebase.js";
import {
  collection,
  addDoc,
  serverTimestamp,
  query,
  orderBy,
  onSnapshot,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import {
  ref,
  uploadBytes,
  getDownloadURL,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

const MEMES_COL = "memes";
const MAX_FILE_MB = 5;

function $(id) {
  return document.getElementById(id);
}

function isFeedPage() {
  return !!$("feed");
}

function isCreatePage() {
  return !!$("pictureZone") && !!$("publishPicture");
}

// ---------- FEED ----------
function initFeed() {
  const feedEl = $("feed");
  const emptyEl = $("emptyState");
  const btnCreate = $("btnCreate");

  if (btnCreate) btnCreate.addEventListener("click", () => (location.href = "index.html"));

  const q = query(collection(db, MEMES_COL), orderBy("createdAt", "desc"));

  onSnapshot(
    q,
    (snap) => {
      feedEl.innerHTML = "";

      if (snap.empty) {
        emptyEl.style.display = "block";
        return;
      }
      emptyEl.style.display = "none";

      snap.forEach((doc) => {
        const meme = doc.data();

        const post = document.createElement("article");
        post.className = "post";

        // Text
        const hasText = !!(meme.text && String(meme.text).trim());
        if (hasText) {
          const text = document.createElement("p");
          text.className = "postText";
          text.textContent = meme.text;
          post.appendChild(text);
        }

        // Image
        const hasImg = !!(meme.imageUrl && String(meme.imageUrl).trim());
        if (hasImg) {
          const imgWrap = document.createElement("div");
          imgWrap.className = "imgWrap";

          const img = document.createElement("img");
          img.className = "postImg";
          img.alt = "Meme image";
          img.src = meme.imageUrl;
          

          imgWrap.appendChild(img);
          post.appendChild(imgWrap);
        }

        // Meta time
        const meta = document.createElement("div");
        meta.className = "meta";
        try {
          const ts = meme.createdAt;
          // Firestore Timestamp -> Date
          const d = ts?.toDate ? ts.toDate() : null;
          meta.textContent = d ? d.toLocaleString() : "";
        } catch {
          meta.textContent = "";
        }
        post.appendChild(meta);

        feedEl.appendChild(post);
      });
    },
    (err) => {
      console.error("Feed load error:", err);
      emptyEl.style.display = "block";
      emptyEl.textContent = "Feed error. Check console + Firebase rules.";
    }
  );
}

// ---------- CREATE ----------
function initCreate() {
  const btnFeed = $("btnFeed");
  if (btnFeed) btnFeed.addEventListener("click", () => (location.href = "feed.html"));

  // Elements from your index.html
  const pictureZone = $("pictureZone");
  const pictureInput = $("pictureInput");
  const picturePreview = $("picturePreview");
  const pictureHint = $("pictureHint");
  const publishPicture = $("publishPicture");

  const textZone = $("textZone");
  const textHint = $("textHint");
  const textPreview = $("textPreview");
  const publishText = $("publishText");

  const textModal = $("textModal");
  const textArea = $("textArea");
  const cancelText = $("cancelText");
  const saveText = $("saveText");
  const textError = $("textError");

  const state = {
    imageFile: null, // File
    text: "",
  };

  function setPublishEnabled() {
    const canPublish = !!state.imageFile || !!state.text.trim();
    if (publishPicture) publishPicture.disabled = !canPublish;
    if (publishText) publishText.disabled = !canPublish;
  }

  function renderCreate() {
    // image preview
    if (state.imageFile) {
      const reader = new FileReader();
      reader.onload = () => {
        picturePreview.src = String(reader.result || "");
        picturePreview.style.display = "block";
        if (pictureHint) pictureHint.style.display = "none";
      };
      reader.readAsDataURL(state.imageFile);
    } else {
      picturePreview.removeAttribute("src");
      picturePreview.style.display = "none";
      if (pictureHint) pictureHint.style.display = "block";
    }

    // text preview
    const hasText = !!state.text.trim();
    if (hasText) {
      textPreview.textContent = state.text;
      textPreview.style.display = "block";
      if (textHint) textHint.style.display = "none";
    } else {
      textPreview.textContent = "";
      textPreview.style.display = "block"; // оставляем место как у тебя в визуале
      if (textHint) textHint.style.display = "block";
    }

    setPublishEnabled();
  }

  function openTextModal() {
    textError.textContent = "";
    textArea.value = state.text || "";
    textModal.classList.add("open"); // твой CSS ждёт .modal.open
    textModal.setAttribute("aria-hidden", "false");
    setTimeout(() => textArea.focus(), 0);
  }

  function closeTextModal() {
    textModal.classList.remove("open");
    textModal.setAttribute("aria-hidden", "true");
  }

  function validateText(txt) {
    const lines = String(txt || "").split(/\r?\n/);
    if (lines.length > 10) return "Max: 10 lines";
    return "";
  }

  async function uploadImageIfAny() {
    if (!state.imageFile) return null;

    const file = state.imageFile;
    const safeName = file.name.replace(/[^\w.\-]+/g, "_");
    const path = `memes/${Date.now()}_${safeName}`;

    const storageRef = ref(storage, path);
    await uploadBytes(storageRef, file);
    return await getDownloadURL(storageRef);
  }

  async function publishMeme() {
    // Валидации
    const txt = state.text || "";
    const err = validateText(txt);
    if (err) {
      textError.textContent = err;
      openTextModal();
      return;
    }

    // Publish
    try {
      if (publishPicture) publishPicture.disabled = true;
      if (publishText) publishText.disabled = true;

      const imageUrl = await uploadImageIfAny();

      // Если вообще пусто — не публикуем
      if (!imageUrl && !txt.trim()) return;

      await addDoc(collection(db, MEMES_COL), {
        text: txt.trim() ? txt : "",
        imageUrl: imageUrl || "",
        createdAt: serverTimestamp(),
      });

      // Очистка формы
      state.imageFile = null;
      state.text = "";
      renderCreate();
      // Можно отправлять на ленту сразу:
      // location.href = "feed.html";
    } catch (e) {
      console.error("Publish error:", e);
      alert("Publish error. Check console + Firebase rules/bucket.");
    } finally {
      setPublishEnabled();
    }
  }

  // Image pick
  function pickImage() {
    pictureInput.click();
  }

  pictureZone.addEventListener("click", pickImage);
  pictureZone.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") pickImage();
  });

  pictureInput.addEventListener("change", () => {
    const file = pictureInput.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      alert("Choose an image file (png/jpg/webp).");
      pictureInput.value = "";
      return;
    }

    const sizeMb = file.size / (1024 * 1024);
    if (sizeMb > MAX_FILE_MB) {
      alert(`Max file size: ${MAX_FILE_MB} MB`);
      pictureInput.value = "";
      return;
    }

    state.imageFile = file;
    renderCreate();
  });

  // Text modal
  textZone.addEventListener("click", openTextModal);
  textZone.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") openTextModal();
  });

  cancelText.addEventListener("click", closeTextModal);

  saveText.addEventListener("click", () => {
    const value = textArea.value || "";
    const err = validateText(value);
    if (err) {
      textError.textContent = err;
      return;
    }
    textError.textContent = "";
    state.text = value;
    closeTextModal();
    renderCreate();
  });

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && textModal.classList.contains("open")) closeTextModal();
  });

  // Publish buttons
  publishPicture.addEventListener("click", publishMeme);
  publishText.addEventListener("click", publishMeme);

  // Init
  renderCreate();
}

// ---------- boot ----------
if (isFeedPage()) initFeed();
if (isCreatePage()) initCreate();

