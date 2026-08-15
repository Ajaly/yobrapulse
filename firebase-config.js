// Firebase web config for YobraPulse's real account system (Google
// sign-in + Firestore profile storage). This object is meant to be
// public - Firebase's client config isn't a secret, real security
// comes from Firestore security rules and Firebase Auth, not from
// hiding these values. Safe to commit.
//
// Replace every value below with your real project's config, found in
// the Firebase Console under: Project settings > General > Your apps
// > Web app > SDK setup and configuration > Config.
export const firebaseConfig = {
  apiKey: "REPLACE_ME",
  authDomain: "REPLACE_ME.firebaseapp.com",
  projectId: "REPLACE_ME",
  storageBucket: "REPLACE_ME.appspot.com",
  messagingSenderId: "REPLACE_ME",
  appId: "REPLACE_ME",
};
