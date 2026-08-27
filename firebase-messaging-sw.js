// firebase-messaging-sw.js
// Questo file DEVE stare nella cartella radice del sito (stessa cartella di
// app.html/index.html), non in una sottocartella, altrimenti il browser non
// riesce a registrarlo con lo scope corretto per ricevere i push.
 
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
 
// Gestisce i messaggi push ricevuti quando l'app NON è in primo piano
// (scheda in background, app chiusa, telefono bloccato ma app installata).
messaging.onBackgroundMessage((payload) => {
 
    const notif = payload.notification || {};
    const data = payload.data || {};
 
    const title = notif.title || "Locanda del Convento";
 
    const options = {
        body: notif.body || "",
        icon: 'image.png',
        badge: 'image.png',
        tag: data.tag || undefined,
        renotify: true,
        vibrate: [120, 60, 120],
        data
    };
 
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
