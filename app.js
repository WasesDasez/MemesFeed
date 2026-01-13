// app.js (CREATE + FEED)

import { db, storage } from "./firebase.js";

import {
  collection,
  addDoc,
  serverTimestamp,
  query,
  orderBy,
  onSnapshot,
  deleteDoc,
  doc,
  updateDoc,
  increment,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

import {
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

const MEMES_COL = "memes";
const MAX_FILE_MB = 15;

// --- Local reaction storage (no-auth) ---
const REACTIONS_KEY = "meme_reactions_v1"; // { [postId]: "like" | "dislike" }
function readReactions() {
  try {
    return JSON.parse(localStorage.getItem(REACTIONS_KEY) || "{}") || {};
  } catch {
    return {};
  }
}
function writeReactions(obj) {
  localStorage.setItem(REACTIONS_KEY, JSON.stringify(obj || {}));
}
function getMyReaction(postId) {
  const map = readReactions();
  return map[postId] || null;
}
function setMyReaction(postId, value /* "like" | "dislike" | null */) {
  const map = readReactions();
  if (!value) delete map[postId];
  else map[postId] = value;
  writeReactions(map);
}

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

  if (btnCreate)
    btnCreate.addEventListener("click", () => (location.href = "index.html"));

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

      snap.forEach((docSnap) => {
        const meme = docSnap.data();
        const postId = docSnap.id;

        const post = document.createElement("article");
        post.className = "post";

        // HEADER: meta left, delete right
        const header = document.createElement("div");
        header.className = "postHeader";

        const meta = document.createElement("div");
        meta.className = "meta";
        try {
          const ts = meme.createdAt;
          const d = ts?.toDate ? ts.toDate() : null;
          meta.textContent = d ? d.toLocaleString() : "";
        } catch {
          meta.textContent = "";
        }

        const delBtn = document.createElement("button");
        delBtn.className = "deleteBtn";
        delBtn.type = "button";
        delBtn.textContent = "Delete";

        delBtn.addEventListener("click", async () => {
          if (!confirm("Delete this post?")) return;

          try {
            delBtn.disabled = true;

            // delete doc
            await deleteDoc(doc(db, MEMES_COL, postId));

            // delete file if exists
            if (meme.imagePath && String(meme.imagePath).trim()) {
              await deleteObject(ref(storage, meme.imagePath));
            }

            // очистим локальную реакцию на удалённый пост (не обязательно, но приятно)
            setMyReaction(postId, null);
          } catch (e) {
            console.error("Delete error:", e);
            alert("Delete error. Check console + Firebase rules.");
          } finally {
            delBtn.disabled = false;
          }
        });

        header.appendChild(meta);
        header.appendChild(delBtn);
        post.appendChild(header);

        // TEXT
        const hasText = !!(meme.text && String(meme.text).trim());
        if (hasText) {
          const text = document.createElement("p");
          text.className = "postText";
          text.textContent = meme.text;
          post.appendChild(text);
        }

        // IMAGE
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

        // REACTIONS (numeric)
        const likesCount = Number(meme.likes || 0);
        const dislikesCount = Number(meme.dislikes || 0);
        const my = getMyReaction(postId); // "like" | "dislike" | null

        const reactions = document.createElement("div");
        reactions.className = "reactions";

        const likeBtn = document.createElement("button");
        likeBtn.className = "reactBtn" + (my === "like" ? " active" : "");
        likeBtn.type = "button";
        likeBtn.innerHTML = `👍 <span class="count">${likesCount}</span>`;

        const dislikeBtn = document.createElement("button");
        dislikeBtn.className = "reactBtn" + (my === "dislike" ? " active" : "");
        dislikeBtn.type = "button";
        dislikeBtn.innerHTML = `👎 <span class="count">${dislikesCount}</span>`;

        async function applyReaction(next /* "like" | "dislike" | null */) {
          const refDoc = doc(db, MEMES_COL, postId);

          // current local reaction
          const current = getMyReaction(postId);

          // calc increments
          // current -> next
          let likeDelta = 0;
          let dislikeDelta = 0;

          if (current === "like") likeDelta -= 1;
          if (current === "dislike") dislikeDelta -= 1;

          if (next === "like") likeDelta += 1;
          if (next === "dislike") dislikeDelta += 1;

          // nothing changes
          if (likeDelta === 0 && dislikeDelta === 0) return;

          try {
            likeBtn.disabled = true;
            dislikeBtn.disabled = true;

            const update = {};
            if (likeDelta !== 0) update.likes = increment(likeDelta);
            if (dislikeDelta !== 0) update.dislikes = increment(dislikeDelta);

            await updateDoc(refDoc, update);

            // update local
            setMyReaction(postId, next);
          } catch (e) {
            console.error("Reaction error:", e);
            alert("Reaction error. Check Firebase rules.");
          } finally {
            likeBtn.disabled = false;
            dislikeBtn.disabled = false;
          }
        }

        // Toggle like: like -> null, null -> like, dislike -> like
        likeBtn.addEventListener("click", () => {
          const current = getMyReaction(postId);
          const next = current === "like" ? null : "like";
          applyReaction(next);
        });

        // Toggle dislike: dislike -> null, null -> dislike, like -> dislike
        dislikeBtn.addEventListener("click", () => {
          const current = getMyReaction(postId);
          const next = current === "dislike" ? null : "dislike";
          applyReaction(next);
        });

        reactions.appendChild(likeBtn);
        reactions.appendChild(dislikeBtn);
        post.appendChild(reactions);

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
  if (btnFeed)
    btnFeed.addEventListener("click", () => (location.href = "feed.html"));

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
    imageFile: null,
    text: "",
  };

  function setPublishEnabled() {
    const canPublish = !!state.imageFile || !!state.text.trim();
    if (publishPicture) publishPicture.disabled = !canPublish;
    if (publishText) publishText.disabled = !canPublish;
  }

  function renderCreate() {
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

    const hasText = !!state.text.trim();
    if (hasText) {
      textPreview.textContent = state.text;
      textPreview.style.display = "block";
      if (textHint) textHint.style.display = "none";
    } else {
      textPreview.textContent = "";
      textPreview.style.display = "block";
      if (textHint) textHint.style.display = "block";
    }

    setPublishEnabled();
  }

  function openTextModal() {
    textError.textContent = "";
    textArea.value = state.text || "";
    textModal.classList.add("open");
    textModal.setAttribute("aria-hidden", "false");
    setTimeout(() => textArea.focus(), 0);
  }

  function closeTextModal() {
    textModal.classList.remove("open");
    textModal.setAttribute("aria-hidden", "true");
  }

  // 10 lines + 500 chars
  function validateText(txt) {
    const s = String(txt || "");
    const lines = s.split(/\r?\n/);
    if (lines.length > 10) return "Max: 10 lines";
    if (s.length > 500) return "Max: 500 characters";
    return "";
  }

  async function uploadImageIfAny() {
    if (!state.imageFile) return null;

    const file = state.imageFile;
    const safeName = file.name.replace(/[^\w.\-]+/g, "_");
    const path = `memes/${Date.now()}_${safeName}`;

    const storageRef = ref(storage, path);
    await uploadBytes(storageRef, file);
    const url = await getDownloadURL(storageRef);

    return { url, path };
  }

  async function publishMeme() {
    const txt = state.text || "";
    const err = validateText(txt);
    if (err) {
      textError.textContent = err;
      openTextModal();
      return;
    }

    try {
      if (publishPicture) publishPicture.disabled = true;
      if (publishText) publishText.disabled = true;

      const uploaded = await uploadImageIfAny();
      const imageUrl = uploaded?.url || "";
      const imagePath = uploaded?.path || "";

      if (!imageUrl && !txt.trim()) return;

      await addDoc(collection(db, MEMES_COL), {
        text: txt.trim() ? txt : "",
        imageUrl,
        imagePath,
        likes: 0,
        dislikes: 0,
        createdAt: serverTimestamp(),
      });

      state.imageFile = null;
      state.text = "";
      renderCreate();
    } catch (e) {
      console.error("Publish error:", e);
      alert("Publish error. Check console + Firebase rules/bucket.");
    } finally {
      setPublishEnabled();
    }
  }

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
    if (e.key === "Escape" && textModal.classList.contains("open"))
      closeTextModal();
  });

  publishPicture.addEventListener("click", publishMeme);
  publishText.addEventListener("click", publishMeme);

  renderCreate();
}

// ---------- boot ----------
if (isFeedPage()) initFeed();
if (isCreatePage()) initCreate();
