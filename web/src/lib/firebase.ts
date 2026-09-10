import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getFunctions } from "firebase/functions";

/**
 * Firebase's client-side web config (apiKey, authDomain, etc.) is not a
 * secret — it's safe to commit. Security is enforced by Firestore/Storage
 * rules and Cloud Functions auth checks, not by hiding this object.
 *
 * Get these values with: `firebase apps:sdkconfig WEB` (after registering a
 * web app once via `firebase apps:create WEB "WBK Homeschool Web"`), or from
 * the Firebase Console: Project settings -> General -> Your apps -> Web app
 * -> SDK setup and configuration -> Config.
 */
const firebaseConfig = {
  apiKey: "AIzaSyAw3YN6VtXZ4u3W12-MrF_nG-I4rwsmuH8",
  authDomain: "wbk-curriculum-8163d.firebaseapp.com",
  projectId: "wbk-curriculum-8163d",
  storageBucket: "wbk-curriculum-8163d.firebasestorage.app",
  messagingSenderId: "6852483904",
  appId: "1:6852483904:web:f1e31ff976111892ca78a5",
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const functions = getFunctions(app);
