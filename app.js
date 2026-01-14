// app.js (CREATE + FEED)

import { db, storage, auth } from "./firebase.js";

import {
  collection,
  addDoc,
  serverTimestamp,
  query,
  orderBy,
  deleteDoc,
  doc,
  updateDoc,
  increment,

  // add these:
  getDocs,
  limit,
  startAfter,
  where,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

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

const provider = new GoogleAuthProvider();

function initAuthUI() {
  const btnLogin = $("btnLogin");
  const btnLogout = $("btnLogout");
  const authName = $("authName");

  async function doPopup() {
    await signInWithPopup(auth, provider);
  }

  async function doRedirect() {
    await signInWithRedirect(auth, provider);
  }

  btnLogin?.addEventListener("click", async () => {
    try {
      // Popup usually works on GitHub Pages, but some browsers block it:
      await doPopup();
    } catch (e) {
      console.warn("Popup failed, trying redirect:", e);
      await doRedirect();
    }
  });

  btnLogout?.addEventListener("click", async () => {
    await signOut(auth);
  });

  // for redirect flow
  getRedirectResult(auth).catch(() => {});

  onAuthStateChanged(auth, (user) => {
    if (user) {
      if (btnLogin) btnLogin.style.display = "none";
      if (btnLogout) btnLogout.style.display = "inline-flex";
      if (authName) {
        authName.style.display = "inline-flex";
        authName.textContent = user.displayName || "User";
      }
    } else {
      if (btnLogin) btnLogin.style.display = "inline-flex";
      if (btnLogout) btnLogout.style.display = "none";
      if (authName) {
        authName.style.display = "none";
        authName.textContent = "";
      }
    }
  });
}
function formatSmartDateDA(d) {
  const now = new Date();

  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  );

  const startOfYesterday = new Date(startOfToday);
  startOfYesterday.setDate(startOfYesterday.getDate() - 1);

  const time = d.toLocaleTimeString("da-DK", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  if (d >= startOfToday) {
    return `I dag ${time}`;
  }

  if (d >= startOfYesterday) {
    return `I går ${time}`;
  }

  const date = d.toLocaleDateString("da-DK");
  return `${date} ${time}`;
}
// ---------- FEED ----------
function initFeed() {
  const feedEl = $("feed");
  const emptyEl = $("emptyState");
  const btnCreate = $("btnCreate");
  const sortSelect = $("sortSelect");

  if (btnCreate) btnCreate.addEventListener("click", () => (location.href = "index.html"));

  const PAGE_SIZE = 15;

  let lastDoc = null;
  let loading = false;
  let done = false;

  // Create Load More button (no HTML changes needed)
  const loadMoreBtn = document.createElement("button");
  loadMoreBtn.className = "pill";
  loadMoreBtn.type = "button";
  loadMoreBtn.textContent = "LOAD MORE";
  loadMoreBtn.style.display = "none";
  loadMoreBtn.addEventListener("click", () => loadNextPage(false));
  // put under feed
  feedEl.parentElement.appendChild(loadMoreBtn);

  function currentMode() {
    return sortSelect?.value || "mine";
  }

  function buildQuery() {
    const mode = currentMode();

    // My posts requires login
    if (mode === "mine") {
      if (!auth.currentUser) return null;
      // NOTE: may require Firestore composite index (Firebase will show link)
      return query(
        collection(db, MEMES_COL),
        where("ownerUid", "==", auth.currentUser.uid),
        orderBy("createdAt", "desc"),
        limit(PAGE_SIZE),
        ...(lastDoc ? [startAfter(lastDoc)] : [])
      );
    }
    // newest
    if (mode === "newest") {
  return query(
    collection(db, MEMES_COL),
    orderBy("createdAt", "desc"),
    limit(PAGE_SIZE),
    ...(lastDoc ? [startAfter(lastDoc)] : [])
    );
    }
    // liked
    if (mode === "liked") {
      return query(
        collection(db, MEMES_COL),
        orderBy("likes", "desc"),
        orderBy("createdAt", "desc"),
        limit(PAGE_SIZE),
        ...(lastDoc ? [startAfter(lastDoc)] : [])
      );
    }

    // disliked
    return query(
      collection(db, MEMES_COL),
      orderBy("dislikes", "desc"),
      orderBy("createdAt", "desc"),
      limit(PAGE_SIZE),
      ...(lastDoc ? [startAfter(lastDoc)] : [])
    );
  }

  function clearFeed() {
    feedEl.innerHTML = "";
    lastDoc = null;
    done = false;
    loadMoreBtn.style.display = "none";
  }

  async function loadNextPage(reset = false) {
    if (loading || done) return;
    if (reset) clearFeed();

    const q = buildQuery();

    // For "My posts" when not logged in
    if (!q) {
      emptyEl.style.display = "block";
      emptyEl.textContent = "Login to see your posts.";
      return;
    }

    loading = true;
    loadMoreBtn.disabled = true;

    try {
      const snap = await getDocs(q);

      if (!lastDoc && snap.empty) {
        emptyEl.style.display = "block";
        emptyEl.textContent = "No posts.";
        loadMoreBtn.style.display = "none";
        return;
      }

      emptyEl.style.display = "none";

      snap.forEach((docSnap) => {
        const meme = docSnap.data();
        const postId = docSnap.id;

        const post = document.createElement("article");
        post.className = "post";

        // header: meta + delete
        const header = document.createElement("div");
        header.className = "postHeader";

        const meta = document.createElement("div");
        meta.className = "meta";
        try {
          const ts = meme.createdAt;
          const d = ts?.toDate ? ts.toDate() : null;
          const author = meme.ownerName ? `af ${meme.ownerName}` : "";

        if (d) {
          meta.textContent = `${formatSmartDateDA(d)} ${author}`;
        } else {
          meta.textContent = author;
                }
        } catch {
          meta.textContent = meme.ownerName ? `af ${meme.ownerName}` : "";
        }


        const delBtn = document.createElement("button");
        delBtn.className = "deleteBtn";
        delBtn.type = "button";
        delBtn.textContent = "Delete";

        const isOwner =
          !!auth.currentUser &&
          !!meme.ownerUid &&
          meme.ownerUid === auth.currentUser.uid;

        delBtn.style.display = isOwner ? "inline-flex" : "none";

        delBtn.addEventListener("click", async () => {
          if (!confirm("Delete this post?")) return;
          try {
            delBtn.disabled = true;
            await deleteDoc(doc(db, MEMES_COL, postId));
            if (meme.imagePath && String(meme.imagePath).trim()) {
              await deleteObject(ref(storage, meme.imagePath));
            }
            // Remove from UI immediately
            post.remove();
          } catch (e) {
            console.error("Delete error:", e);
            alert("Delete error. Check console + rules.");
          } finally {
            delBtn.disabled = false;
          }
        });

        header.appendChild(meta);
        header.appendChild(delBtn);
        post.appendChild(header);

        // text
        if (meme.text && String(meme.text).trim()) {
          const text = document.createElement("p");
          text.className = "postText";
          text.textContent = meme.text;
          post.appendChild(text);
        }

        // image
        if (meme.imageUrl && String(meme.imageUrl).trim()) {
          const imgWrap = document.createElement("div");
          imgWrap.className = "imgWrap";

          const img = document.createElement("img");
          img.className = "postImg";
          img.alt = "Meme image";
          img.loading = "lazy";
          img.decoding = "async";
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

const likeCountEl = likeBtn.querySelector(".count");
const dislikeCountEl = dislikeBtn.querySelector(".count");

async function applyReaction(next /* "like" | "dislike" | null */) {
  const refDoc = doc(db, MEMES_COL, postId);

  const current = getMyReaction(postId);

  let likeDelta = 0;
  let dislikeDelta = 0;

  if (current === "like") likeDelta -= 1;
  if (current === "dislike") dislikeDelta -= 1;

  if (next === "like") likeDelta += 1;
  if (next === "dislike") dislikeDelta += 1;

  if (likeDelta === 0 && dislikeDelta === 0) return;

  try {
    likeBtn.disabled = true;
    dislikeBtn.disabled = true;

    const update = {};
    if (likeDelta !== 0) update.likes = increment(likeDelta);
    if (dislikeDelta !== 0) update.dislikes = increment(dislikeDelta);

    await updateDoc(refDoc, update);

    // update local reaction
    setMyReaction(postId, next);

    // update UI counts immediately (because paging feed is not realtime)
    likeCountEl.textContent = String(Number(likeCountEl.textContent || 0) + likeDelta);
    dislikeCountEl.textContent = String(Number(dislikeCountEl.textContent || 0) + dislikeDelta);

    // update active state
    likeBtn.classList.toggle("active", next === "like");
    dislikeBtn.classList.toggle("active", next === "dislike");
  } catch (e) {
    console.error("Reaction error:", e);
    alert("Reaction error. Check Firebase rules.");
  } finally {
    likeBtn.disabled = false;
    dislikeBtn.disabled = false;
  }
}

likeBtn.addEventListener("click", () => {
  const current = getMyReaction(postId);
  const next = current === "like" ? null : "like";
  applyReaction(next);
});

dislikeBtn.addEventListener("click", () => {
  const current = getMyReaction(postId);
  const next = current === "dislike" ? null : "dislike";
  applyReaction(next);
});

reactions.appendChild(likeBtn);
reactions.appendChild(dislikeBtn);
post.appendChild(reactions);


        // reactions UI (keep your existing logic if you want)
        // (Optional) If you want likes/dislikes here too, tell me and I’ll paste the exact block adapted for paging.

        feedEl.appendChild(post);
      });

      lastDoc = snap.docs[snap.docs.length - 1] || lastDoc;

      if (snap.size < PAGE_SIZE) {
        done = true;
        loadMoreBtn.style.display = "none";
      } else {
        loadMoreBtn.style.display = "inline-flex";
      }
    } catch (e) {
      console.error("Feed load error:", e);
      emptyEl.style.display = "block";
      emptyEl.textContent = "Feed error. Check console (index may be required).";
    } finally {
      loading = false;
      loadMoreBtn.disabled = false;
    }
  }

  // react to sort changes
  sortSelect?.addEventListener("change", () => loadNextPage(true));

  // also reload when auth changes (important for "My posts")
  onAuthStateChanged(auth, () => loadNextPage(true));

  // initial
  loadNextPage(true);
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
    if (!auth.currentUser) {
    alert("Please login first");
    return;
  }

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

        ownerUid: auth.currentUser.uid,
        ownerName: auth.currentUser.displayName || "User"
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
initAuthUI();

onAuthStateChanged(auth, () => {
  // run page logic after auth state is known
  if (isFeedPage()) initFeed();
  if (isCreatePage()) initCreate();
});
