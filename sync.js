// Cloud sync with Firebase: Google sign-in + Firestore.
// The app keeps working from localStorage; this module mirrors that data to the
// signed-in person's Firestore documents and pulls changes made on other devices.
import { split, join, diff, merge, isCloudEmpty, MAIN } from './sync-core.js';
import { firebaseConfig } from './firebase-config.js';

const CDN = 'https://www.gstatic.com/firebasejs/10.14.1';
const LINK_KEY = 'budgetWithElias.syncedUid'; // which account this device's data already belongs to
const PUSH_DELAY = 800;

const App = window.BudgetApp;
const info = { status: 'loading', user: null, error: '' };

let fb, auth, db;
let user = null;
let mainRef, monthsCol;
let unsubs = [];
let cloudMain = null, cloudMonths = {};
let mainFromServer = false, monthsFromServer = false;
let initialized = false;
let lastSynced = { main: null, months: {} }; // what we believe the cloud holds
let pushTimer = null;
let pending = 0;

function setStatus(status, extra = {}) {
  Object.assign(info, { status, error: '' }, extra);
  App.onSyncChange();
}

function refreshStatus() {
  if (!user) return setStatus('signedout', { user: null });
  if (!initialized) return setStatus(navigator.onLine ? 'connecting' : 'waiting');
  if (pending > 0 || pushTimer) return setStatus(navigator.onLine ? 'syncing' : 'offline');
  setStatus(navigator.onLine ? 'synced' : 'offline');
}

function friendly(e) {
  const code = e?.code || '';
  if (code === 'auth/unauthorized-domain') return `This website (${location.hostname}) is not allowed yet. In Firebase: Authentication → Settings → Authorized domains → add it.`;
  if (code === 'auth/operation-not-allowed' || code === 'auth/configuration-not-found') return 'Google sign-in is not turned on yet. In Firebase: Authentication → Sign-in method → enable Google.';
  if (code === 'permission-denied') return 'Firestore is blocking access. Publish the security rules from firestore.rules (Firestore → Rules).';
  if (code === 'not-found' || code === 'failed-precondition') return 'The Firestore database has not been created yet. In Firebase: Firestore Database → Create database.';
  if (code === 'auth/network-request-failed') return 'No internet connection. Try again when you are online.';
  return e?.message || 'Something went wrong with sync.';
}

async function boot() {
  try {
    const [appM, authM, fsM] = await Promise.all([
      import(`${CDN}/firebase-app.js`),
      import(`${CDN}/firebase-auth.js`),
      import(`${CDN}/firebase-firestore.js`),
    ]);
    fb = { ...appM, ...authM, ...fsM };
  } catch (e) {
    setStatus('unavailable', { error: 'Cloud sync could not load (are you offline?). Your data is still saved on this device.' });
    return;
  }
  const app = fb.initializeApp(firebaseConfig);
  auth = fb.getAuth(app);
  try {
    db = fb.initializeFirestore(app, { localCache: fb.persistentLocalCache({ tabManager: fb.persistentMultipleTabManager() }) });
  } catch {
    db = fb.getFirestore(app);
  }
  fb.getRedirectResult(auth).catch((e) => setStatus('error', { error: friendly(e) }));
  fb.onAuthStateChanged(auth, (u) => (u ? start(u) : stop(true)));
}

function start(u) {
  stop(false);
  user = u;
  setStatus('connecting', { user: { name: u.displayName || '', email: u.email || '', photo: u.photoURL || '' } });
  mainRef = fb.doc(db, 'users', u.uid, 'data', MAIN);
  monthsCol = fb.collection(db, 'users', u.uid, 'months');
  unsubs.push(fb.onSnapshot(mainRef, { includeMetadataChanges: true }, (snap) => {
    cloudMain = snap.exists() ? snap.data().json : null;
    mainFromServer = !snap.metadata.fromCache;
    onCloud();
  }, onError));
  unsubs.push(fb.onSnapshot(monthsCol, { includeMetadataChanges: true }, (qs) => {
    cloudMonths = {};
    qs.forEach((d) => { cloudMonths[d.id] = d.data().json; });
    monthsFromServer = !qs.metadata.fromCache;
    onCloud();
  }, onError));
}

function stop(announce) {
  unsubs.forEach((fn) => fn());
  unsubs = [];
  clearTimeout(pushTimer);
  pushTimer = null;
  user = null;
  initialized = false;
  cloudMain = null; cloudMonths = {};
  mainFromServer = monthsFromServer = false;
  lastSynced = { main: null, months: {} };
  pending = 0;
  if (announce) refreshStatus();
}

function onError(e) {
  setStatus('error', { error: friendly(e) });
}

function onCloud() {
  if (!user) return;
  if (!initialized) {
    // Wait for the server's answer so a stale or empty cache never overwrites real data.
    if (!(mainFromServer && monthsFromServer)) return refreshStatus();
    initialized = true;
    const local = App.getState();
    const linked = localStorage.getItem(LINK_KEY) === user.uid;
    let next;
    if (isCloudEmpty(cloudMain, cloudMonths)) next = local;               // first device: upload
    else if (linked) next = join(cloudMain, cloudMonths);                 // returning device: cloud is the truth
    else next = merge(join(cloudMain, cloudMonths), local);               // new device: keep both
    lastSynced = { main: cloudMain, months: { ...cloudMonths } };
    try { localStorage.setItem(LINK_KEY, user.uid); } catch { /* storage blocked */ }
    App.replaceState(next);
    pushNow();
    if (!isCloudEmpty(cloudMain, cloudMonths) && !linked) App.toast('☁️ Synced. Data from this device was added to your account.');
    return;
  }
  if (pushTimer) return; // local edits waiting to be sent win; the snapshot after they're sent will catch up
  lastSynced = { main: cloudMain, months: { ...cloudMonths } };
  if (cloudMain !== null) {
    const remote = { main: cloudMain, months: cloudMonths };
    if (!diff(split(App.getState()), remote).empty) App.replaceState(join(cloudMain, cloudMonths));
  }
  refreshStatus();
}

function pushNow() {
  clearTimeout(pushTimer);
  pushTimer = null;
  if (!user || !initialized) return;
  const next = split(App.getState());
  const d = diff(lastSynced, next);
  if (d.empty) return refreshStatus();
  const batch = fb.writeBatch(db);
  for (const [k, json] of Object.entries(d.writes)) {
    batch.set(k === MAIN ? mainRef : fb.doc(monthsCol, k), { json, updatedAt: fb.serverTimestamp() });
  }
  for (const k of d.deletes) batch.delete(fb.doc(monthsCol, k));
  lastSynced = next;
  pending++;
  refreshStatus();
  batch.commit()
    .then(() => { pending--; refreshStatus(); })
    .catch((e) => { pending--; onError(e); });
}

function push() {
  if (!user || !initialized) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(pushNow, PUSH_DELAY);
  refreshStatus();
}

async function signIn() {
  if (!auth) return;
  const provider = new fb.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  try {
    await fb.signInWithPopup(auth, provider);
  } catch (e) {
    if (['auth/popup-blocked', 'auth/operation-not-supported-in-this-environment'].includes(e.code)) {
      return fb.signInWithRedirect(auth, provider);
    }
    if (e.code === 'auth/popup-closed-by-user' || e.code === 'auth/cancelled-popup-request') return refreshStatus();
    setStatus('error', { error: friendly(e) });
  }
}

async function signOut(removeLocal) {
  if (!auth) return;
  pushNow();
  try { localStorage.removeItem(LINK_KEY); } catch { /* storage blocked */ }
  stop(false);
  await fb.signOut(auth);
  if (removeLocal) App.resetLocal();
}

// Send pending edits before the page is hidden or closed.
addEventListener('pagehide', () => pushTimer && pushNow());
document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && pushTimer && pushNow());
addEventListener('online', refreshStatus);
addEventListener('offline', refreshStatus);

window.BudgetSync = { info, push, signIn, signOut };
boot();
