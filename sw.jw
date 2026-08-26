// sw.js
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js');

firebase.initializeApp({
    apiKey: "AIzaSyAwGEErUuII0YGO9b59xmhfpog_52a26MI",
    authDomain: "prenotazionilocanda-7808c.firebaseapp.com",
    projectId: "prenotazionilocanda-7808c",
    storageBucket: "prenotazionilocanda-7808c.firebasestorage.app",
    messagingSenderId: "407224446329",
    appId: "1:407224446329:web:e213fbaf5aaef702af53a8"
});

const messaging = firebase.messaging();

// Gestisce l'arrivo della notifica Push a schermo spento / background
messaging.onBackgroundMessage((payload) => {
    const notificationTitle = payload.notification ? payload.notification.title : "Locanda del Convento";
    const notificationBody = payload.notification ? payload.notification.body : "Nuovo aggiornamento tavolo!";

    const notificationOptions = {
        body: notificationBody,
        icon: 'image.png',
        badge: 'image.png',
        vibrate: [200, 100, 200],
        tag: 'locanda-notification',
        renotify: true
    };

    self.registration.showNotification(notificationTitle, notificationOptions);
});

self.addEventListener('notificationclick', (e) => {
    e.notification.close();
    e.waitUntil(
        clients.matchAll({ type: 'window' }).then((clientList) => {
            for (const client of clientList) {
                if (client.url && 'focus' in client) return client.focus();
            }
            if (clients.openWindow) return clients.openWindow('/');
        })
    );
});
