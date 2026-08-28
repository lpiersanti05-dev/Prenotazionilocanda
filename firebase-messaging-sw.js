// firebase-messaging-sw.js
// Questo file DEVE stare nella cartella radice del sito (stessa cartella di
// app.html/index.html), non in una sottocartella, altrimenti il browser non
// riesce a registrarlo con lo scope corretto per ricevere i push.

const SW_VERSION = 'v4-raw-push';
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

// NOTA: non importiamo più firebase-app-compat.js / firebase-messaging-compat.js
// qui. Non servono: la registrazione del token avviene dal thread principale
// (app.html) passando semplicemente questo Service Worker come
// "serviceWorkerRegistration" — non serve che anche il Service Worker stesso
// inizializzi l'SDK Firebase. Tenerlo fuori elimina ogni possibilità che sia
// l'SDK, internamente, a intercettare l'evento push prima del nostro codice.

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
//
// NOTA: qui NON usiamo più messaging.onBackgroundMessage() dell'SDK
// Firebase. Gestiamo l'evento "push" nativo del browser a mano, per
// escludere del tutto la possibilità che sia l'SDK stesso, internamente,
// a mostrare una notifica automatica in aggiunta alla nostra — un
// comportamento "a scatola nera" che i nostri log non potrebbero vedere,
// dato che avverrebbe dentro l'SDK, prima ancora di raggiungere il nostro
// codice. Con l'API nativa, l'unica chiamata a showNotification() possibile
// è quella scritta qui sotto, punto.
self.addEventListener('push', (event) => {
    event.waitUntil(handlePush(event));
});

async function handlePush(event) {

    let raw = {};
    try {
        raw = event.data ? event.data.json() : {};
    } catch (e) {
        console.warn('Payload push non in formato JSON atteso:', e);
        return;
    }

    // A seconda di come FCM serializza il messaggio "solo data" sul canale
    // push nativo, i nostri campi possono comparire come oggetto piatto o
    // annidati sotto "data": gestiamo entrambi i casi.
    const data = raw.data || raw;

    const title = data.title || "Locanda del Convento";

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
        body: data.body || "",
        icon: 'image.png',
        badge: 'image.png',
        tag: data.tag || undefined,
        vibrate: [120, 60, 120],
        data
    };

    debugLog('notifica_mostrata', data.tag);

    await self.registration.showNotification(title, options);

}

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
