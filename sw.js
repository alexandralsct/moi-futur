// Moi dans 5 ans — service worker : l'app s'ouvre même hors ligne (coquille en cache). Les messages ne passent jamais par le cache.
const CACHE = 'futur-V.0.0.0.1';   // à changer à chaque version, avec VERSION dans app.js : les appareils se mettent à jour d'eux-mêmes
const COQUILLE = ['./', 'index.html', 'app.js', 'noyau.js', 'app.css', 'manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'qr.js', 'connexion.js', 'connexion.css',
  'fonts/instrument-sans.woff2', 'fonts/plex-mono-400.woff2', 'fonts/plex-mono-400-italique.woff2', 'fonts/plex-mono-500.woff2',
  'fonts/plex-mono-600.woff2', 'fonts/plex-mono-700.woff2'];
// Empreintes SHA-256 de la coquille (audit de sécurité LC3) : le Cache Storage est commun à tout le site, une autre page
// pourrait y glisser une copie piégée. Une copie n'est servie, et une réponse n'est gardée, que si son empreinte est
// celle-ci. Ce fichier-ci n'est jamais dans le Cache Storage : personne ne peut changer ces empreintes depuis une page.
// Recalculées par « node tests/empreintes.mjs » ; vérifiées par le garde-fou.
const EMPREINTES = {
  'index.html': '9399649fdf48d1bd94c8045eec37bdf667198a853558478c96c1047610ff0650',
  'app.js': '925e88472a551bf8198be0ef81859cd80ed11150625cecdba5bb30f768a833ed',
  'noyau.js': '3116921c60ff9db6894ffbf6ef9b9f99897f1906993a5f776aae623f1088b0f2',
  'app.css': '4fc0ab079e9c87d8b4176b8d9f18711f9c74483680901ddbcb2b89c92103fada',
  'manifest.webmanifest': 'a8403a0e4a1e4c3f935a034484cfc4b7dc60f758e07704c12f45519969496a4c',
  'icon.svg': 'b7af000935a305589c5ce3e15b9e3740f12cbc75fda13310650236becde24b46',
  'icon-192.png': '70cfee3fb9e1a3fb6368f80e81818f7f2a295b673abc582c49dc92310e27215e',
  'icon-512.png': 'f6ec9557598624b450b24a04c496b05581b1e046c31a269d15d320df1b85d349',
  'icon-maskable-512.png': 'da4155b7140530ef5a3f70a70833a75675f698c4c32450e784126a3faa858505',
  'qr.js': '14685aab1677fc1e530c7e761a28bd842ede7a18fcd3e804b3e7037ca0fb0444',
  'connexion.js': 'c25c5a9ca19236108606957edfcf7049d7c95327873f6b9f06ed4e0664e28b5d',
  'connexion.css': '01bf86c5c909a65f76fd2a55214ead405d8ce57ff1d2d394ab7eac950c8819ce',
  'fonts/instrument-sans.woff2': '6219bc4bfdfc5d9b2201dcdf046218b122a758f932e25ed5f168f929b7ca2311',
  'fonts/plex-mono-400.woff2': 'c36f509c0a8f9f85f29cb44bc8701d8a9e0b14c499e77a884f789ead7093a7ac',
  'fonts/plex-mono-400-italique.woff2': '2665f5fbbb334780fa135c7f1dc6e2459061a2d6d44c32b7c1fdbc34cde65ede',
  'fonts/plex-mono-500.woff2': 'a76f53ca6612e7b3828eec2311098675b7f9849ae4169a8bcef6302aec02a6c0',
  'fonts/plex-mono-600.woff2': 'ad4580d8cb4b5f627c2d18457656732f7f7b070f7837fbc380e08054157e6f6c',
  'fonts/plex-mono-700.woff2': '9e1455e6e9c5866f607e464fffb7855486dcf575b7e69b83a3d234e587fce41b'
};
const ATTENTE_RESEAU = 3000;   // réseau qui traîne : au-delà, la copie gardée (la nouvelle version sera prise au prochain lancement)
let lentJusqua = 0;            // après une attente dépassée, les fichiers suivants (styles, script, polices) partent de la copie
const nomDe = url => { const r = url.slice(self.registration.scope.length).split(/[?#]/)[0]; return r === '' ? 'index.html' : r; };
async function intacte(nom, reponse) {   // true si le fichier n'est pas de la coquille, ou si son empreinte est la bonne
  const attendue = EMPREINTES[nom]; if (!attendue || !reponse) return !!reponse;
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', await reponse.clone().arrayBuffer()));
  return [...h].map(b => b.toString(16).padStart(2, '0')).join('') === attendue;
}
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(COQUILLE.map(f => fetch(f, { cache: 'no-cache' })
    .then(async r => { if (r.ok && await intacte(nomDe(new URL(f, self.registration.scope).href), r)) await c.put(f, r); }).catch(() => {})))));
  self.skipWaiting();
});
// seulement SES anciennes copies (préfixe futur-) : les autres apps du même site (LIFE, carte, maintenance) gardent les leurs
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(k => Promise.all(k.filter(n => n.startsWith('futur-') && n !== CACHE).map(n => caches.delete(n)))));
  self.clients.claim();
});
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;   // serveur des messages : toujours le réseau
  const nom = nomDe(e.request.url);
  // en ligne : la dernière version publiée (sans le cache du navigateur), gardée seulement si la réponse est bonne (r.ok)
  // et intacte ; hors ligne, ou réseau sans réponse après 3 s : la copie gardée, si elle est intacte.
  const reseau = fetch(e.request, { cache: 'no-cache' }).then(async r => {
    if (r.ok && await intacte(nom, r)) { const c = r.clone(); await caches.open(CACHE).then(x => x.put(e.request, c)).catch(() => {}); }
    return r;
  });
  e.waitUntil(reseau.catch(() => {}));   // la mise en cache continue même si la copie a déjà été servie
  // seulement dans SON cache (jamais caches.match, qui cherche dans les caches de tout le site)
  const garde = caches.open(CACHE).then(c => c.match(e.request)).then(async copie => {
    if (copie && !(await intacte(nom, copie))) { await caches.open(CACHE).then(c => c.delete(e.request)); return null; }   // piégée : jetée
    return copie;
  });
  e.respondWith(garde.then(copie => {
    if (!copie) return reseau;
    if (Date.now() < lentJusqua) return copie;   // le réseau vient de traîner : la copie tout de suite (mise à jour en fond)
    return new Promise(ok => {
      const minuterie = setTimeout(() => { lentJusqua = Date.now() + 15000; ok(copie); }, ATTENTE_RESEAU);
      reseau.then(r => { clearTimeout(minuterie); ok(r.ok ? r : copie); }, () => { clearTimeout(minuterie); ok(copie); });
    });
  }));
});

