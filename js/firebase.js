
import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import { getAuth, browserLocalPersistence, setPersistence } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyBfVMPxDUSK6zmzDEOR733rNliC32ehXus",
  authDomain: "tacosorientales2026-ef7ab.firebaseapp.com",
  databaseURL: "https://tacosorientales2026-ef7ab-default-rtdb.firebaseio.com",
  projectId: "tacosorientales2026-ef7ab",
  storageBucket: "tacosorientales2026-ef7ab.firebasestorage.app",
  messagingSenderId: "341276997712",
  appId: "1:341276997712:web:993c7af867386c01ddf955"
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

const auth = getAuth(app);
const db = getFirestore(app);
const rtdb = getDatabase(app);

const persistenciaLista = setPersistence(auth, browserLocalPersistence);

export {
  app,
  auth,
  db,
  rtdb,
  persistenciaLista
};
