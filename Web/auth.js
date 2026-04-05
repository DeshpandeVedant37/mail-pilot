import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  onAuthStateChanged,
  updateProfile,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  collection,
  query,
  orderBy,
  limit,
  getDocs,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ── REPLACE with your Firebase project config ──
const firebaseConfig = {
  apiKey: "AIzaSyB220c2BBFrK8ccB9nza-llhJHcvxHYXgk",
  authDomain: "mailpilot-ce86f.firebaseapp.com",
  projectId: "mailpilot-ce86f",
  storageBucket: "mailpilot-ce86f.firebasestorage.app",
  messagingSenderId: "843973006831",
  appId: "1:843973006831:web:c8608e8e9692c01a8a921a",
  measurementId: "G-WH9XR4F9LS"
};

const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);
const googleProvider = new GoogleAuthProvider();

// ── Auth actions ──
export async function signUp(name, email, password) {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  await updateProfile(cred.user, { displayName: name });
  return cred.user;
}

export async function logIn(email, password) {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  return cred.user;
}

export async function googleSignIn() {
  const cred = await signInWithPopup(auth, googleProvider);
  return cred.user;
}

export async function logOut() {
  await signOut(auth);
}

export function onAuthChange(callback) {
  return onAuthStateChanged(auth, callback);
}

// ── Firestore: get or init user dashboard doc ──
export async function getUserDashboard(uid) {
  const ref = doc(db, 'users', uid);
  const snap = await getDoc(ref);
  if (snap.exists()) return snap.data();
  // First time — seed with zeros
  const defaults = {
    emailsProcessed: 0,
    meetingsScheduled: 0,
    updatesSummarized: 0,
    errors: 0,
  };
  await setDoc(ref, defaults, { merge: true });
  return defaults;
}

// ── Firestore: get activity log (last 20 entries) ──
export async function getActivityLog(uid) {
  const ref = collection(db, 'users', uid, 'activityLog');
  const q   = query(ref, orderBy('timestamp', 'desc'), limit(20));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// ── Firestore: save extra profile fields (name, age, address) ──
export async function updateUserProfile(uid, { name, age, address }) {
  // Update Firebase Auth display name
  if (name) await updateProfile(auth.currentUser, { displayName: name });
  // Save extra fields to Firestore
  await setDoc(doc(db, 'users', uid), { name, age, address }, { merge: true });
}

// ── Firestore: get extra profile fields ──
export async function getUserProfile(uid) {
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.exists() ? snap.data() : {};
}

export { db, serverTimestamp, doc, collection };
