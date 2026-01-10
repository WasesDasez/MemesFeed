import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

  const firebaseConfig = {
    apiKey: "AIzaSyCAiH-LnEysMV_-kUlPY_JSPNI7idBu8iA",
    authDomain: "memeproekt.firebaseapp.com",
    projectId: "memeproekt",
    storageBucket: "memeproekt.firebasestorage.app",
    messagingSenderId: "177554883760",
    appId: "1:177554883760:web:82db8b366b75de56082775",
    measurementId: "G-4CMQRRGB72"
  };

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const storage = getStorage(app);