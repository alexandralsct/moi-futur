// Outils de la suite de tests de « Moi dans 5 ans » (Playwright) : serveur statique local, faux serveur de la passerelle Cocon
// (intercepté par page.route : aucune donnée réelle, aucun vrai serveur), profils « app téléphone » et « app ordinateur ».
// Variables d'environnement facultatives :
//   PLAYWRIGHT   chemin du module Playwright (index.mjs) ; sinon « playwright »
//   CHROMIUM     exécutable Chromium / Chrome à utiliser
//   SANS_PORT=1  ne pas ouvrir de port local : la page est servie par interception (http://localhost:8080/, origine sûre) ;
//                automatique quand l'ouverture d'un port est refusée (EPERM, cas d'un bac à sable)
//   RACINE       dossier servi (par défaut : le dossier de l'app)
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';

const { chromium } = await import(process.env.PLAYWRIGHT || 'playwright');
export const RACINE = process.env.RACINE || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const SERVEUR = 'https://essai.exemple.cloud';
export const CLE = 'cle-de-test-123456';
export const TEL = { nom: 'App téléphone', viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, locale: 'fr-FR', timezoneId: 'Europe/Paris' };
export const ORDI = { nom: 'App ordinateur', viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false, locale: 'fr-FR', timezoneId: 'Europe/Paris' };
export const pause = ms => new Promise(r => setTimeout(r, ms));
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };

// ---------- serveur statique (port libre, ou interception si aucun port n'est permis) ----------
export async function serveurStatique(racine = RACINE) {
  const S = { port: 0, mode: 'port' };
  const lire = (chemin) => { let p = path.join(racine, decodeURIComponent(chemin)); if (!p.startsWith(racine)) return null; if (p.endsWith('/') || p === racine) p = path.join(p, 'index.html');
    try { return { corps: fs.readFileSync(p), type: TYPES[path.extname(p)] || 'application/octet-stream' }; } catch (e) { return null; } };
  S.lire = lire;
  if (!process.env.SANS_PORT) {
    S.http = http.createServer((q, r) => { const f = lire(new URL(q.url, 'http://x').pathname); if (!f) { r.writeHead(404, { 'content-type': 'text/plain' }); r.end('absent'); return; } r.writeHead(200, { 'content-type': f.type }); r.end(f.corps); });
    const ok = await new Promise(res => { S.http.once('error', () => res(false)); S.http.listen(0, '127.0.0.1', () => res(true)); });
    if (ok) { S.port = S.http.address().port; S.base = 'http://127.0.0.1:' + S.port + '/'; return S; }
  }
  S.mode = 'interception'; S.base = 'http://localhost:8080/'; S.http = { close() {} };
  S.installer = ctx => ctx.route(/^http:\/\/localhost:8080\//, route => { const f = lire(new URL(route.request().url()).pathname); route.fulfill(f ? { status: 200, contentType: f.type, body: f.corps } : { status: 404, body: 'absent' }); });
  return S;
}

// ---------- faux serveur de la passerelle ----------
// /crochets/life : { action: 'envoyer', fil, texte, cid, mode } → { ok, messages: [-a (moi), -b (life)], statut }
//   o.asynchrone : la première réponse ne porte que « -a » (en_cours) ; « -b » arrive après `guets` lectures du fil.
// /crochets/app-lien : { type: 'futur', futur: {...} } → { ok, type, reponse }
export function fauxServeur(o = {}) {
  const S = { appels: [], envois: [], liens: [], statut: 200, coupe: false, guets: 0, o, reponses: {} };
  S.gerer = async route => {
    const req = route.request(); const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type,x-cle-app', 'access-control-allow-methods': 'POST' };
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    let corps = {}; try { corps = JSON.parse(req.postData() || '{}'); } catch (e) { /* illisible */ }
    const appel = { url: req.url(), chemin: new URL(req.url()).pathname, corps, cle: req.headers()['x-cle-app'] }; S.appels.push(appel);
    if (S.coupe) return route.abort('internetdisconnected').catch(() => {});
    if (S.statut !== 200) return route.fulfill({ status: S.statut, headers: cors, body: '{}' }).catch(() => {});
    if (appel.cle !== CLE) return route.fulfill({ status: 403, headers: cors, body: '{}' }).catch(() => {});
    if (o.retard) await pause(o.retard);
    let rep;
    if (appel.chemin === '/crochets/app-lien') { S.liens.push(corps); rep = o.lien ? o.lien(corps) : { ok: true, type: 'futur', statut: 'SUCCES', reponse: 'Moi d\'il y a cinq ans : je voulais surtout que tu sois à ta place.' }; }
    else if (appel.chemin === '/crochets/life' && corps.action === 'envoyer') {
      S.envois.push(corps);
      const texteRep = (o.reponse ? o.reponse(corps) : 'Je suis toi plus tard. Réponse à : ' + String(corps.texte).slice(-40));
      const a = { id: 'L-' + corps.cid + '-a', auteur: 'moi', fil: corps.fil, texte: corps.texte }, b = { id: 'L-' + corps.cid + '-b', auteur: 'life', fil: corps.fil, texte: texteRep };
      if (o.sources) b.sources = o.sources;
      S.reponses[corps.cid] = b; S.guets = 0;
      rep = o.asynchrone ? { ok: true, en_cours: true, statut: 'EN_COURS', messages: [a], curseur: 5 } : { ok: true, statut: 'SUCCÈS', messages: [a, b], curseur: 6 };
    } else if (appel.chemin === '/crochets/life' && corps.action === 'fil') {
      S.guets++; const prets = S.guets >= (o.guetsAvant || 2);
      rep = { ok: true, messages: prets ? Object.values(S.reponses) : [], curseur: 6 };
    } else rep = { ok: false, erreur: 'action inconnue' };
    return route.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify(rep) }).catch(() => {});
  };
  return S;
}

// ---------- navigateur et pages ----------
export async function navigateur() { return chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}); }
// Ouvre l'app déjà connectée au faux serveur. o.donnees : objet posé dans futur.donnees avant le chargement ; o.sansConnexion ;
// o.hash ; o.avantChargement(ctx, page) ; o.contexte (options du contexte) ; o.dateFixe (AAAA-MM-JJ : horloge de la page figée à midi ce jour-là).
export async function ouvrir(nav, st, profil, S, o = {}) {
  const { nom, ...options } = profil;
  const ctx = await nav.newContext({ ...options, serviceWorkers: 'block', permissions: [], ...(o.contexte || {}) });
  if (st.installer) await st.installer(ctx);
  if (S) await ctx.route(/^https:\/\/[a-z0-9.-]*exemple\.cloud\//, S.gerer);
  await ctx.addInitScript(([donnees, sans, serveur, cle, date]) => {
    if (date) { const Reel = Date, base = new Reel(date + 'T12:00:00').getTime(), t0 = Reel.now();
      globalThis.Date = class extends Reel { constructor(...a) { if (a.length) super(...a); else super(base + (Reel.now() - t0)); } static now() { return base + (Reel.now() - t0); } }; }
    if (sessionStorage.getItem('__essai')) return; sessionStorage.setItem('__essai', '1');
    if (!sans) { localStorage.setItem('life.adresse', JSON.stringify(serveur + '/crochets/life')); localStorage.setItem('life.cle', JSON.stringify(cle)); }
    if (donnees) localStorage.setItem('futur.donnees', JSON.stringify(donnees));
  }, [o.donnees || null, !!o.sansConnexion, SERVEUR, CLE, o.dateFixe || '']);
  const page = await ctx.newPage(); const erreurs = [], csp = [];
  page.on('pageerror', e => erreurs.push(String(e)));
  page.on('console', m => { if (/Content Security Policy|Refused to|Trusted Type/i.test(m.text())) csp.push(m.text()); });
  if (o.avantChargement) await o.avantChargement(ctx, page);
  await page.goto(st.base + (o.hash ? '#' + o.hash : ''), { waitUntil: 'load' });
  await page.waitForTimeout(o.attente ?? 300);
  return { ctx, page, erreurs, csp };
}
export const donnees = page => page.evaluate(() => JSON.parse(localStorage.getItem('futur.donnees') || 'null'));
export const attendre = async (f, ms = 5000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await f()) return true; await pause(50); } return false; };
export const onglet = async (page, nom) => { await page.click('#onglet-' + nom); await page.waitForTimeout(80); };

// ---------- mini-cadre de test ----------
export function suite() {
  const R = [];
  const verif = (ok, quoi, detail) => { R.push({ ok: !!ok, quoi, detail }); if (!ok) throw new Error(quoi + (detail !== undefined ? ' — obtenu : ' + JSON.stringify(detail).slice(0, 300) : '')); };
  return { R, verif };
}
