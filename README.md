# pwa-test: cloud-switch sender

A tiny static PWA that plays the POS in the cloud-switch flow: it creates a Cloud API transaction, then uses the Softpay JavaScript Client 1.6 to switch to `io.softpay.integrationtest` on the same phone.

No secrets live in the files. Type the Cloud API client id/secret (and merchant reference, app id) on the phone; they are kept in that browser's localStorage only.

Flow: token (client credentials) -> POST /transactions -> PUT /transactions/{id} with `suppressAppNotification: true` -> tap -> `processPending(id)` -> app opens -> switch back -> GET /transactions/{id}.

Host it on any static HTTPS host (GitHub Pages: serve this folder). Open it in Chrome on the phone, optionally "Add to Home screen".
