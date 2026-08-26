importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js');

// Metti le stesse API keys che hai nel tuo index.html
firebase.initializeApp({
    apiKey: "AIzaSy...",
    projectId: "prenotazionilocanda-7808c",
    messagingSenderId: "407224446329",
    appId: "1:407224446329:web:..."
});

const messaging = firebase.messaging();

// Gestisce la notifica quando l'app è in background
messaging.onBackgroundMessage((payload) => {
    const notificationTitle = payload.notification.title;
    const notificationOptions = {
        body: payload.notification.body,
        icon: 'image.png'
    };
    self.registration.showNotification(notificationTitle, notificationOptions);
});
