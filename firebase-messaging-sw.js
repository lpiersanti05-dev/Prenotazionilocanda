// firebase-messaging-sw.js
// Questo file DEVE stare nella cartella radice del sito (stessa cartella di
// app.html/index.html), non in una sottocartella, altrimenti il browser non
// riesce a registrarlo con lo scope corretto per ricevere i push.

const SW_VERSION = 'v3-dedup';
console.log('[firebase-messaging-sw.js] versione caricata:', SW_VERSION);

// Forza l'attivazione immediata di questa versione, senza aspettare che
// TUTTE le schede/istanze dell'app vengano chiuse manualmente — altrimenti
// un aggiornamento del file può restare "in coda" per ore, facendo credere
// che il fix non funzioni quando in realtà il browser sta ancora eseguendo
// la versione precedente.
self.skipWaiting();
self.addEventListener('activate', (event) => {
    event.waitUntil(clients.claim());
});

importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js');

// Stessa configurazione usata in app.html
firebase.initializeApp({
    apiKey: "AIzaSyAwGEErUuII0YGO9b59xmhfpog_52a26MI",
    authDomain: "prenotazionilocanda-7808c.firebaseapp.com",
    projectId: "prenotazionilocanda-7808c",
    storageBucket: "prenotazionilocanda-7808c.firebasestorage.app",
    messagingSenderId: "407224446329",
    appId: "1:407224446329:web:e213fbaf5aaef702af53a8"
});

const messaging = firebase.messaging();

// Log diagnostico scritto direttamente su Firestore via REST (niente SDK
// completo necessario in questo file), per verificare con certezza quante
// volte il gestore del push scatta davvero — la Console remota via cavo si
// è dimostrata inaffidabile nel catturare eventi quando l'app iOS è sospesa
// in background.
function debugLog(event, tag) {
    const url = 'https://firestore.googleapis.com/v1/projects/prenotazionilocanda-7808c/databases/(default)/documents/debug_logs';
    const body = {
        fields: {
            event: { stringValue: String(event) },
            tag: { stringValue: String(tag || '') },
            ts: { stringValue: new Date().toISOString() }
        }
    };
    // "fire and forget": non blocchiamo mai la normale gestione del push
    // per un log diagnostico, e ignoriamo silenziosamente eventuali errori.
    fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    }).catch(() => {});
}

const DEDUP_CACHE_NAME = 'notif-dedup-v1';
const DEDUP_WINDOW_MS = 30000; // 30 secondi: FCM/APNs possono ri-consegnare
                                 // lo stesso messaggio più di una volta (è un
                                 // comportamento documentato e normale dei
                                 // sistemi push, "almeno una consegna", non
                                 // "esattamente una"). Se il banner precedente
                                 // si è già chiuso da solo (stile "Temporary"
                                 // su iOS), il tag/renotify non basta a evitare
                                 // un secondo banner identico: lo filtriamo qui.

// Ha già mostrato questo identico tag negli ultimi DEDUP_WINDOW_MS?
// Usa la Cache Storage API (non una semplice variabile) perché sopravvive
// anche se il Service Worker viene terminato e risvegliato tra un push e
// l'altro, cosa comune quando l'app è in background da tempo.
async function wasRecentlyShown(tag) {
    if (!tag) return false;

    const cache = await caches.open(DEDUP_CACHE_NAME);
    const cacheKey = new Request('https://dedup.local/' + encodeURIComponent(tag));
    const match = await cache.match(cacheKey);

    if (!match) return false;

    const shownAt = parseInt(await match.text(), 10);
    return (Date.now() - shownAt) < DEDUP_WINDOW_MS;
}

async function markAsShown(tag) {
    if (!tag) return;

    const cache = await caches.open(DEDUP_CACHE_NAME);
    const cacheKey = new Request('https://dedup.local/' + encodeURIComponent(tag));
    await cache.put(cacheKey, new Response(String(Date.now())));
}

// Gestisce i messaggi push ricevuti quando l'app NON è in primo piano
// (scheda in background, app chiusa, telefono bloccato ma app installata).
messaging.onBackgroundMessage(async (payload) => {

    const notif = payload.notification || {};
    const data = payload.data || {};

    const title = notif.title || "Locanda del Convento";

    debugLog('push_ricevuto', data.tag);

    // Se lo stesso identico evento (stesso tag) è già stato mostrato pochi
    // secondi fa, ignora: è una ri-consegna duplicata dello stesso push,
    // non un evento nuovo.
    if (await wasRecentlyShown(data.tag)) {
        console.log('Notifica duplicata ignorata (stesso tag entro la finestra anti-doppione):', data.tag);
        debugLog('duplicato_ignorato', data.tag);
        return;
    }

    await markAsShown(data.tag);

    const options = {
        body: notif.body || "",
        icon: 'image.png',
        badge: 'image.png',
        tag: data.tag || undefined,
        renotify: true,
        vibrate: [120, 60, 120],
        data
    };

    debugLog('notifica_mostrata', data.tag);

    self.registration.showNotification(title, options);

});

// Al tocco della notifica: porta in primo piano una scheda già aperta,
// altrimenti ne apre una nuova.
self.addEventListener('notificationclick', (event) => {

    event.notification.close();

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            for (const client of clientList) {
                if ('focus' in client) return client.focus();
            }
            if (clients.openWindow) return clients.openWindow('/');
        })
    );

});
