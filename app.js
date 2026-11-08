// Moi dans 5 ans — le script de l'app (aucun script en ligne : la règle de sécurité CSP de la page ne l'accepte pas).
// Le noyau (noyau.js) porte les calculs ; ici : la page, le stockage sur l'appareil et les appels à la passerelle.
// L'adresse du serveur et la clé ne sont PAS dans ce code public : elles se saisissent dans « Moi » (écran Connexion commun)
// et restent sur l'appareil. Tests : tests/lancer.mjs (app téléphone puis app ordinateur).
const VERSION = 'V.0.0.0.1';   // un chiffre par position ; à augmenter à chaque mise en ligne, avec CACHE dans sw.js
const N = Noyau;
const CHEMIN_LIFE = '/crochets/life', CHEMIN_LIEN = '/crochets/app-lien';
const $ = id => document.getElementById(id);

// ───────── Sécurité (même démarche que LIFE) ─────────
if (window.top !== window) { document.body.textContent = 'Cette app ne s\'ouvre pas dans le cadre d\'un autre site.'; throw new Error('cadre refusé'); }
const etatConnexion = () => { try { return Connexion.etat(); } catch (e) { return {}; } };
{ // la règle de la page autorise https en général ; ici on la resserre au seul serveur enregistré (les deux règles se cumulent)
  let hote = ''; try { hote = new URL(etatConnexion().serveur).host; } catch (e) { hote = ''; }
  const m = document.createElement('meta'); m.httpEquiv = 'Content-Security-Policy';
  m.content = "connect-src 'self'" + (/^[a-z0-9.-]+(:\d+)?$/i.test(hote) ? ' https://' + hote : ''); document.head.appendChild(m);
}
const POLITIQUE = (() => {
  const regle = { createHTML: () => { throw new TypeError('HTML refusé'); }, createScriptURL: u => { if (u !== 'qr.js' && u !== 'sw.js') throw new TypeError('script refusé'); return u; } };
  try { return window.trustedTypes && window.trustedTypes.createPolicy ? window.trustedTypes.createPolicy('futur', regle) : regle; } catch (e) { return regle; }
})();

// ───────── Construction de la page sans innerHTML ─────────
const NS = 'http://www.w3.org/2000/svg';
function h(tag, attrs, ...enfants) {
  const e = document.createElement(tag);
  for (const k in (attrs || {})) {
    const v = attrs[k]; if (v === false || v === null || v === undefined) continue;
    if (k === 'class') e.className = v; else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), v); else e.setAttribute(k, v === true ? '' : v);
  }
  enfants.flat(2).forEach(c => { if (c !== null && c !== undefined && c !== false) e.append(c.nodeType ? c : document.createTextNode(String(c))); });
  return e;
}
function icone(chemins, taille) {
  const s = document.createElementNS(NS, 'svg'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('width', taille || 22); s.setAttribute('height', taille || 22);
  s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor'); s.setAttribute('stroke-width', '1.75'); s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round'); s.setAttribute('aria-hidden', 'true');
  chemins.forEach(d => { const p = document.createElementNS(NS, 'path'); p.setAttribute('d', d); s.appendChild(p); }); return s;
}
const NUAGE = 'M7 18a4 4 0 0 1-.6-7.96A5.5 5.5 0 0 1 17 9.5a4.2 4.2 0 0 1 .5 8.5z';
const ICONES = {
  parler: ['M4 5h16v11H9l-5 4z'], lettres: ['M3 6h18v12H3z', 'M3 7l9 6 9-6'], tableau: ['M4 20V10M10 20V4M16 20v-7M22 20H2'], frise: ['M3 12h18', 'M7 8v8M12 6v12M17 9v6'],
  moi: ['M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z', 'M4 21c0-4 3.6-7 8-7s8 3 8 7'],
  soleil: ['M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z', 'M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5'],
  eclaircies: ['M8 4v1.5M3.5 8.5H5M5 5.5l1 1M11 6.5a3 3 0 0 0-4.5 3', 'M9 20a3.5 3.5 0 0 1-.4-7A5 5 0 0 1 18 14a3 3 0 0 1 0 6z'],
  nuageux: [NUAGE], pluie: [NUAGE, 'M8 20l-1 2M12 20l-1 2M16 20l-1 2'], inconnue: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .9-1 1.7M12 17h.01'],
  micro: ['M12 3a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3z', 'M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21'], envoyer: ['M4 12l16-8-6 16-2.5-6.5z', 'M11.5 13.5L20 4'],
  doute: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M12 8v5M12 16h.01'], haut: ['M11 5L6 9H3v6h3l5 4z', 'M15 9a4 4 0 0 1 0 6M18 6.5a8 8 0 0 1 0 11']
};

// ───────── Données sur l'appareil ─────────
const CLE = 'futur.donnees';
const vide = () => ({ v: 1, conv: [], fiche: [], lettres: [], arreter: [], colonnes: N.COLONNES.map(N.colonneVide), predictions: [], evenements: [], notes: [], reglages: { cible: N.CIBLE_DEFAUT, voix: false } });
function normalise(o) {   // tolère un objet ancien, partiel ou venu d'un import : ne garde que les formes connues
  const d = vide(); if (!o || typeof o !== 'object') return d;
  ['conv', 'fiche', 'lettres', 'arreter', 'predictions', 'evenements', 'notes'].forEach(k => { if (Array.isArray(o[k])) d[k] = o[k].filter(x => x && typeof x === 'object'); });
  if (Array.isArray(o.colonnes)) d.colonnes = N.COLONNES.map(c => Object.assign(N.colonneVide(c), (o.colonnes.find(x => x && x.id === c.id) || {}), { id: c.id }));
  if (o.reglages && typeof o.reglages === 'object') { if (N.dateOk(o.reglages.cible)) d.reglages.cible = o.reglages.cible; d.reglages.voix = !!o.reglages.voix; }
  d.conv = d.conv.slice(-100); return d;
}
let D = (() => { try { return normalise(JSON.parse(localStorage.getItem(CLE) || 'null')); } catch (e) { return vide(); } })();
let stockageOk = true;
function sauver() { try { localStorage.setItem(CLE, JSON.stringify(D)); stockageOk = true; } catch (e) { stockageOk = false; annonce('Cet appareil ne peut pas garder tes données : espace plein ou stockage bloqué.'); } }

// ───────── Aides ─────────
function annonce(t) { const a = $('annonce'); a.textContent = ''; setTimeout(() => { a.textContent = t; }, 30); }
const aujourdhui = () => N.aujourdhui();
const dateLongue = s => N.dateOk(s) ? new Date(s + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
const nb = v => { const x = N.nombre(v); return x === null ? '' : x.toLocaleString('fr-FR'); };
const connecte = () => { const e = etatConnexion(); return !!(e.serveur && e.cle); };
const pause = ms => new Promise(r => setTimeout(r, ms));
function champ(label, attrs, aide) {
  const id = 'c' + Math.random().toString(36).slice(2, 9), inp = attrs.tag === 'textarea' ? h('textarea', Object.assign({ id, rows: 3 }, attrs.a)) : h(attrs.tag || 'input', Object.assign({ id }, attrs.a));
  if (attrs.valeur !== undefined) inp.value = attrs.valeur;
  const bloc = h('div', { class: 'champ' }, h('label', { for: inp.id }, label), inp, aide ? h('small', {}, aide) : null);
  bloc.entree = inp; return bloc;
}
const largeur = pc => { const i = document.createElement('i'); i.style.width = pc + '%'; return i; };   // CSSOM : la règle de la page refuse l'attribut style
const bouton = (texte, f, classe, attrs) => h('button', Object.assign({ type: 'button', class: classe || '', onclick: f }, attrs || {}), texte);
const ouvrirDlg = (titre, corps, boutons) => {
  const d = $('dlg'); d.textContent = '';
  d.append(h('h2', {}, titre), h('div', { class: 'dlg-corps' }, corps), h('menu', {}, (boutons || [bouton('Fermer', () => d.close())])));
  if (!d.open) d.showModal(); return d;
};
$('dlg').addEventListener('close', () => { $('dlg').textContent = ''; });

// ───────── Passerelle Cocon ─────────
async function poster(chemin, corps, delai) {
  const e = etatConnexion(); if (!e.serveur || !e.cle) throw new Error('pas connecté');
  const ac = new AbortController(), t = setTimeout(() => ac.abort(), delai || 30000);
  try {
    const r = await fetch(e.serveur + chemin, { method: 'POST', headers: { 'content-type': 'application/json', 'x-cle-app': e.cle }, body: JSON.stringify(corps),
      signal: ac.signal, cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer' });
    if (r.status === 401 || r.status === 403) throw new Error('clé refusée');
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.ok === false) throw Object.assign(new Error(j.erreur || ('erreur ' + r.status)), { reponse: j });
    return j;
  } catch (x) { if (ac.signal.aborted) throw new Error('délai dépassé'); throw x; } finally { clearTimeout(t); }
}
const messageErreur = x => {
  const m = String((x && x.message) || x);
  if (/pas connecté/.test(m)) return 'Pas connecté : ouvre « Moi » → Connexion.';
  if (/clé refusée/.test(m)) return 'Le serveur refuse la clé : ' + Connexion.ERREUR;
  if (/délai/.test(m)) return 'Le serveur met trop de temps. Réessaie dans un moment.';
  if (/Failed to fetch|NetworkError|Load failed|network|abort/i.test(m)) return 'Le serveur ne répond pas (le flux « futur » n\'est peut-être pas encore activé, ou tu es hors ligne).';
  return 'Le serveur dit : ' + m.slice(0, 160);
};
// Conversation : /crochets/life, fil « futur » (ou « comite » sur demande). La réponse peut tarder (20 à 90 s) : on la guette.
async function questionner(fil, texte, mode) {
  const cid = N.nouvelId('').slice(0, 14);
  const corps = { action: 'envoyer', fil, texte, cid }; if (mode) corps.mode = mode;
  let j = await poster(CHEMIN_LIFE, corps, 60000);
  const cherche = r => (r && Array.isArray(r.messages) ? r.messages : []).find(m => m && m.auteur === 'life' && m.id === 'L-' + cid + '-b');
  let rep = cherche(j), essais = 0;
  while (!rep && essais < 40) {
    essais++; await pause(window.__pauseGuet === undefined ? 4000 : window.__pauseGuet);
    const c = typeof j.curseur === 'number' && j.curseur >= 0 ? { curseur: j.curseur } : {};
    const p = await poster(CHEMIN_LIFE, Object.assign({ action: 'fil', fil }, c), 30000).catch(() => null);
    if (p) { rep = cherche(p); if (!rep && p.curseur !== undefined && c.curseur === undefined) j = Object.assign({}, j, { curseur: p.curseur }); }
  }
  if (!rep) throw new Error('pas de réponse encore');
  return { texte: String(rep.texte || ''), sources: N.sourcesDeFaits(rep), json: j };
}
function ajouterConv(de, texte, extra) { const m = Object.assign({ id: N.nouvelId('m'), de, texte, t: Date.now() }, extra || {}); D.conv.push(m); D.conv = D.conv.slice(-100); sauver(); return m; }

// ───────── Coque : onglets, en-tête ─────────
const ONGLETS = [['parler', 'Parler'], ['lettres', 'Lettres'], ['tableau', 'Tableau'], ['frise', 'Frise'], ['moi', 'Moi']];
let onglet = 'parler';
function monterCoque() {
  const nav = $('onglets'); nav.textContent = '';
  ONGLETS.forEach(([id, nom]) => nav.append(h('button', { type: 'button', id: 'onglet-' + id, role: 'tab', 'aria-selected': 'false', 'aria-controls': 'vue', onclick: () => aller(id) }, icone(ICONES[id], 22), h('span', {}, nom))));
}
function aller(nom) {
  onglet = nom;
  ONGLETS.forEach(([id]) => { const b = $('onglet-' + id); b.setAttribute('aria-selected', id === nom ? 'true' : 'false'); if (id === nom) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
  const v = $('vue'); v.textContent = ''; v.dataset.vue = nom; VUES[nom](v); v.scrollTop = 0; enTete();
}
function enTete() {
  const c = N.compteARebours(D.reglages.cible, aujourdhui()), m = N.meteo(D.colonnes, aujourdhui(), D.reglages.cible);
  const cd = $('compte'); cd.textContent = c.passe ? 'Date cible passée' : 'J-' + c.jours.toLocaleString('fr-FR');
  cd.title = 'Jusqu\'au ' + dateLongue(c.cible) + ' (date fixe)';
  const mt = $('meteo'); mt.textContent = ''; mt.append(icone(ICONES[m.code], 22), h('span', { class: 'lecteur' }, 'Météo de la trajectoire : ' + m.mot)); mt.title = m.mot; mt.dataset.meteo = m.code;
}

// ───────── Vue : Parler ─────────
let enCours = false;
function bulleConv(m) {
  const b = h('div', { class: 'bulle ' + (m.de === 'moi' ? 'moi' : m.de === 'systeme' ? 'systeme' : 'futur'), 'data-de': m.de },
    m.de === 'futur' ? h('span', { class: 'qui' }, 'Toi de ' + D.reglages.cible.slice(0, 4)) : m.de === 'comite' ? h('span', { class: 'qui' }, 'Comité') : null,
    h('p', {}, m.texte));
  if (m.sources && m.sources.length) b.append(h('p', { class: 'sources' }, 'Faits, d\'après : ', m.sources.map((s, i) => [i ? ' · ' : '', h('a', { href: s.url, target: '_blank', rel: 'noopener noreferrer' }, s.titre)])));
  if (m.de === 'futur' && D.reglages.voix && 'speechSynthesis' in window) b.append(bouton(icone(ICONES.haut, 18), () => lireHaut(m.texte), 'petit', { 'aria-label': 'Lire à voix haute', title: 'Lire à voix haute' }));
  return b;
}
function lireHaut(t) { try { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(t); u.lang = 'fr-FR'; speechSynthesis.speak(u); } catch (e) { /* voix indisponible */ } }
function rafraichirConv() {
  const z = $('flux'); if (!z) return; z.textContent = '';
  if (!D.conv.length) z.append(h('p', { class: 'vide' }, connecte() ? 'Dis-lui ce qui te traverse. Il te répond comme toi, plus tard, sans filtre.' : 'Pas encore connecté : ouvre « Moi » → Connexion pour lui parler. Le reste de l\'app marche sans.'));
  D.conv.forEach(m => z.append(bulleConv(m)));
  if (enCours) z.append(h('div', { class: 'bulle futur attente', role: 'status' }, h('p', {}, 'Il réfléchit… (jusqu\'à une minute ou deux)')));
  z.scrollTop = z.scrollHeight;
}
async function parler(vu, message, o) {   // vu : ce qui s'affiche ; message : ce qui part (hors cadre) ; o : { fil, mode }
  o = o || {}; const fil = o.fil || 'futur';
  if (enCours) { annonce('Une réponse est déjà attendue.'); return false; }
  if (!connecte()) { ajouterConv('systeme', 'Pas connecté : ouvre « Moi » → Connexion.'); rafraichirConv(); return false; }
  const a = N.assemble(D.fiche, message);
  if (fil === 'futur' && message.length > a.place) { annonce('Message trop long de ' + (message.length - a.place) + ' caractères.'); return false; }
  ajouterConv('moi', vu); enCours = true; rafraichirConv();
  try {
    const r = await questionner(fil, fil === 'futur' ? a.texte : message.slice(0, N.LIMITE_SERVEUR), o.mode);
    ajouterConv(fil === 'comite' ? 'comite' : 'futur', r.texte, { sources: r.sources });
  } catch (x) { ajouterConv('systeme', messageErreur(x)); }
  enCours = false; rafraichirConv(); return true;
}
function vueParler(v) {
  const place = N.placePourMessage(D.fiche);
  const saisie = h('textarea', { id: 'saisie', rows: 2, placeholder: 'Parle au toi de ' + D.reglages.cible.slice(0, 4) + '…', 'aria-label': 'Message', maxlength: place });
  const envoyer = bouton(icone(ICONES.envoyer, 22), () => { const t = saisie.value.trim(); if (!t) return; saisie.value = ''; compter(); parler(t, t); }, 'rond principal', { id: 'envoyer', 'aria-label': 'Envoyer', title: 'Envoyer' });
  const compteur = h('small', { id: 'compteur', class: 'compteur' });
  const compter = () => { compteur.textContent = saisie.value.length + ' / ' + place; envoyer.disabled = !saisie.value.trim(); };
  saisie.addEventListener('input', compter);
  saisie.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); envoyer.click(); } });
  const micro = bouton(icone(ICONES.micro, 22), () => dicter(saisie, compter), 'rond', { id: 'micro', 'aria-label': 'Dicter', title: 'Dicter' });
  const outils = h('div', { class: 'outils', role: 'group', 'aria-label': 'Façons de lui parler' },
    bouton('Avant de décider', formulaireAvantDecider, 'puce', { id: 'avant-decider' }),
    bouton('Où t\'es-tu trompé ?', () => parler('Où t\'es-tu trompé ?', 'Dis-moi une erreur que tu as faite et ce que tu en retiens. Admets-la sans te justifier.'), 'puce', { id: 'erreurs' }),
    bouton('Ce que j\'évite', () => parler('Pose-moi la question que j\'évite.', 'Pose-moi une seule question, la plus directe, sur ce que j\'évite de regarder. N\'ajoute rien avant.'), 'puce', { id: 'evite' }),
    bouton('Appeler le Comité', appelerComite, 'puce', { id: 'comite' }),
    bouton('Note à moi 2031', noteRapide, 'puce', { id: 'note' }),
    bouton('J\'ai un doute', ouvrirDoute, 'puce doute', { id: 'doute' }));
  v.append(outils, h('div', { id: 'flux', 'aria-live': 'polite', 'aria-label': 'Conversation' }), h('div', { class: 'saisie' }, micro, saisie, envoyer), compteur);
  rafraichirConv(); compter();
}
function formulaireAvantDecider() {
  const dec = champ('La décision que je m\'apprête à prendre', { tag: 'textarea', a: { rows: 3, maxlength: 400 } });
  const avis = champ('Mon avis (il le défendra si on me contredit)', { tag: 'textarea', a: { rows: 2, maxlength: 300 } });
  ouvrirDlg('Avant de décider', [dec, avis], [bouton('Annuler', () => $('dlg').close()), bouton('Demander au toi de 2031', () => {
    const t = dec.entree.value.trim(); if (!t) { dec.entree.focus(); return; }
    const a = avis.entree.value.trim(); $('dlg').close(); onglet !== 'parler' && aller('parler');
    parler('Avant de décider : ' + t + (a ? ' — mon avis : ' + a : ''), 'AVANT DE DÉCIDER. Décision : ' + t + (a ? ' Mon avis : ' + a + '.' : '') +
      ' Réponds en 4 courtes parties : ce que tu ferais ; ce que tu as regretté ou salué ; ce que je dois vérifier ; la question à me poser.');
  }, 'principal')]);
}
function appelerComite() {
  const dernier = [...D.conv].reverse().find(m => m.de === 'moi');
  const q = champ('Ce que je demande au Comité', { tag: 'textarea', valeur: dernier ? dernier.texte.slice(0, 500) : '', a: { rows: 3, maxlength: 600 } }, 'Le Comité ne parle que quand tu l\'appelles ; il répond à part, le toi de 2031 reste le seul interlocuteur.');
  ouvrirDlg('Appeler le Comité', [q], [bouton('Annuler', () => $('dlg').close()), bouton('Demander', () => {
    const t = q.entree.value.trim(); if (!t) return; $('dlg').close(); parler('Au Comité : ' + t, t, { fil: 'comite', mode: 'voix' });
  }, 'principal')]);
}
function noteRapide() {
  const q = champ('Note à moi 2031', { tag: 'textarea', a: { rows: 3, maxlength: 600 } }, 'Gardée sur cet appareil, dans « Lettres ». Elle ne part nulle part.');
  ouvrirDlg('Note à moi 2031', [q], [bouton('Annuler', () => $('dlg').close()), bouton('Garder', () => {
    const t = q.entree.value.trim(); if (!t) return; D.notes.push({ id: N.nouvelId('n'), date: aujourdhui(), texte: t }); sauver(); $('dlg').close(); annonce('Note gardée.');
  }, 'principal')]);
}
function ouvrirDoute() {
  const l = N.lettresDoute(D.lettres);
  if (!l.length) { ouvrirDlg('J\'ai un doute', [h('p', {}, 'Aucune lettre « à rouvrir en cas de doute » pour l\'instant. Écris-en une dans « Lettres », quand ça va, pour la toi qui doutera.')], [bouton('Aller à Lettres', () => { $('dlg').close(); aller('lettres'); }), bouton('Fermer', () => $('dlg').close())]); return; }
  const x = l[Math.floor(Math.random() * l.length)]; x.lue = (x.lue || 0) + 1; sauver();
  ouvrirDlg(x.titre || 'Une lettre pour toi', [h('p', { class: 'lettre' }, x.texte), h('small', {}, 'Écrite le ' + dateLongue(x.cree))]);
}
function dicter(saisie, compter) {
  const R = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!R) { annonce('La dictée n\'est pas disponible dans ce navigateur : utilise le clavier.'); return; }
  try { const r = new R(); r.lang = 'fr-FR'; r.interimResults = false;
    r.onresult = e => { saisie.value = (saisie.value + ' ' + e.results[0][0].transcript).trim().slice(0, +saisie.maxLength || 2000); compter(); };
    r.onerror = () => annonce('La dictée a échoué.'); r.start(); annonce('Je t\'écoute.'); } catch (e) { annonce('La dictée n\'a pas pu démarrer.'); }
}

// ───────── Vue : Lettres ─────────
function formulaireLettre(type, titre0) {
  const titre = champ('Titre', { valeur: titre0 || '', a: { maxlength: 80 } });
  const texte = champ('Lettre', { tag: 'textarea', a: { rows: 8, maxlength: 4000 } });
  const ouvre = type === 'scellee' ? champ('Ne s\'ouvre pas avant le', { a: { type: 'date', min: aujourdhui() } }, 'Le sceau est une règle de l\'app : il n\'est pas un chiffrement.') : null;
  ouvrirDlg(type === 'scellee' ? 'Lettre scellée' : type === 'doute' ? 'Lettre à rouvrir en cas de doute' : 'Nouvelle lettre', [titre, texte, ouvre], [bouton('Annuler', () => $('dlg').close()), bouton('Garder', () => {
    const t = texte.entree.value.trim(); if (!t) { texte.entree.focus(); return; }
    if (ouvre && !(N.dateOk(ouvre.entree.value) && ouvre.entree.value > aujourdhui())) { ouvre.entree.focus(); annonce('Choisis une date à venir.'); return; }
    D.lettres.push({ id: N.nouvelId('l'), type, titre: titre.entree.value.trim(), texte: t, cree: aujourdhui(), ouvre: ouvre ? ouvre.entree.value : '' }); sauver(); $('dlg').close(); aller('lettres');
  }, 'principal')]);
}
function lireLettre(l) {
  if (!N.lettreOuvrable(l, aujourdhui())) { annonce('Cette lettre est scellée jusqu\'au ' + dateLongue(l.ouvre) + '.'); return; }
  l.lue = (l.lue || 0) + 1; sauver();
  ouvrirDlg(l.titre || 'Lettre', [l.type === 'reconstituee' ? h('p', { class: 'avert' }, 'Lettre reconstituée : l\'IA joue la toi de 2021 à partir de ce que le système sait. Ce n\'est pas un souvenir retrouvé.') : null, h('p', { class: 'lettre' }, l.texte), h('small', {}, 'Écrite le ' + dateLongue(l.cree))],
    [bouton('Supprimer', () => { if (confirm('Supprimer cette lettre ?')) { D.lettres = D.lettres.filter(x => x.id !== l.id); sauver(); $('dlg').close(); aller('lettres'); } }), bouton('Fermer', () => $('dlg').close())]);
}
async function reconstituer2021(btn) {
  if (!connecte()) { annonce('Pas connecté : ouvre « Moi » → Connexion.'); return; }
  btn.disabled = true; annonce('Je la reconstitue…');
  try {
    const j = await poster(CHEMIN_LIEN, { type: 'futur', futur: { texte: 'Écris-moi la lettre que moi d\'il y a cinq ans m\'écrirait aujourd\'hui : ce qu\'elle espérait, ce qu\'elle craignait, ce qu\'elle me demanderait. Une lettre, à la première personne.', horizon: -5, scenario: 'passe', historique: [] } }, 90000);
    const t = String(j.reponse || '').trim(); if (!t) throw new Error('réponse vide');
    D.lettres.push({ id: N.nouvelId('l'), type: 'reconstituee', titre: 'Lettre du toi de 2021 (reconstituée)', texte: t.slice(0, 4000), cree: aujourdhui(), ouvre: '' }); sauver(); aller('lettres'); annonce('Lettre reconstituée ajoutée.');
  } catch (x) { btn.disabled = false; annonce(messageErreur(x)); const e = $('etat-lettres'); if (e) e.textContent = messageErreur(x); }
}
const NOMS_TYPE = { libre: 'Lettre', scellee: 'Scellée', doute: 'En cas de doute', reconstituee: 'Reconstituée' };
function vueLettres(v) {
  const auj = aujourdhui();
  const liste = h('ul', { class: 'liste', id: 'liste-lettres' });
  D.lettres.slice().reverse().forEach(l => {
    const ouvrable = N.lettreOuvrable(l, auj);
    liste.append(h('li', {}, bouton([h('strong', {}, l.titre || 'Sans titre'), h('span', { class: 'etiq' }, NOMS_TYPE[l.type] || 'Lettre'), h('small', {}, ouvrable ? 'Écrite le ' + dateLongue(l.cree) : '🔒 Scellée jusqu\'au ' + dateLongue(l.ouvre))], () => lireLettre(l), 'ligne', { 'data-id': l.id, 'data-scellee': ouvrable ? 'non' : 'oui' })));
  });
  if (!D.lettres.length) liste.append(h('li', { class: 'vide' }, 'Aucune lettre pour l\'instant.'));
  const etat = h('p', { id: 'etat-lettres', role: 'status' });
  const btn2021 = bouton('Reconstituer la lettre du toi de 2021', () => reconstituer2021(btn2021), '', { id: 'lettre-2021' });
  v.append(h('h2', {}, 'Lettres'), h('div', { class: 'outils' }, bouton('Écrire une lettre', () => formulaireLettre('libre'), 'puce', { id: 'nl-libre' }), bouton('La sceller jusqu\'à une date', () => formulaireLettre('scellee'), 'puce', { id: 'nl-scellee' }),
    bouton('À rouvrir en cas de doute', () => formulaireLettre('doute', 'Pour quand je doute'), 'puce', { id: 'nl-doute' }), btn2021), etat, liste,
    h('h3', {}, 'À arrêter'), vueArreter(), h('h3', {}, 'Notes à moi ' + D.reglages.cible.slice(0, 4)), vueNotes());
}
function vueArreter() {
  const zone = h('div', { id: 'arreter' }), ul = h('ul', { class: 'liste' });
  D.arreter.forEach(a => ul.append(h('li', { class: a.arrete ? 'fait' : '' }, h('label', {}, h('input', { type: 'checkbox', checked: !!a.arrete, onchange: e => { a.arrete = e.target.checked ? aujourdhui() : ''; sauver(); aller('lettres'); } }), ' ', a.texte, a.arrete ? h('small', {}, ' — arrêté le ' + dateLongue(a.arrete)) : null),
    bouton('×', () => { D.arreter = D.arreter.filter(x => x.id !== a.id); sauver(); aller('lettres'); }, 'petit', { 'aria-label': 'Retirer : ' + a.texte }))));
  if (!D.arreter.length) ul.append(h('li', { class: 'vide' }, 'Rien pour l\'instant : une chose que tu veux arrêter de faire.'));
  const c = champ('Une chose à arrêter', { a: { maxlength: 120 } });
  zone.append(ul, h('div', { class: 'rang' }, c, bouton('Ajouter', () => { const t = c.entree.value.trim(); if (!t) return; D.arreter.push({ id: N.nouvelId('a'), texte: t, cree: aujourdhui(), arrete: '' }); sauver(); aller('lettres'); }, 'principal', { id: 'ajout-arreter' })));
  return zone;
}
function vueNotes() {
  const ul = h('ul', { class: 'liste', id: 'notes' });
  D.notes.slice().reverse().forEach(n => ul.append(h('li', {}, h('p', {}, n.texte), h('small', {}, dateLongue(n.date)), h('span', { class: 'rang' },
    bouton('Lui dire', () => { aller('parler'); parler(n.texte, 'Voici une note que je t\'écris : ' + n.texte); }, 'petit'), bouton('Supprimer', () => { D.notes = D.notes.filter(x => x.id !== n.id); sauver(); aller('lettres'); }, 'petit')))));
  if (!D.notes.length) ul.append(h('li', { class: 'vide' }, 'Aucune note. Le bouton « Note à moi 2031 » est dans « Parler ».'));
  return ul;
}

// ───────── Vue : Tableau ─────────
function carteColonne(col, def) {
  const calc = h('div', { class: 'calc', 'aria-live': 'polite' });
  const maj = () => {
    const e = N.ecart(col), p = N.progression(col), cible = D.reglages.cible; calc.textContent = '';
    calc.append(h('p', { class: 'ecart', 'data-ecart': e === null ? '' : String(e) }, e === null ? 'Renseigne l\'actuel et le cap : l\'écart apparaît.' : e > 0 ? 'Écart au cap : il reste ' + nb(e) + ' ' + (col.unite || '') : e < 0 ? 'Cap dépassé de ' + nb(-e) + ' ' + (col.unite || '') : 'Cap atteint'));
    if (p !== null) calc.append(h('div', { class: 'jauge', role: 'img', 'aria-label': 'Chemin fait : ' + Math.round(p * 100) + ' %' }, largeur(Math.max(0, Math.min(100, p * 100)))), h('small', {}, 'Chemin fait : ' + Math.round(p * 100) + ' %'));
    const rp = N.retroPlanning(col, cible);
    if (rp.length) {
      const tb = h('table', { class: 'retro' }, h('caption', {}, 'Rétro-planning : où je dois être'), h('thead', {}, h('tr', {}, h('th', {}, 'À la date'), h('th', {}, 'Valeur'), h('th', {}, 'Jalon'))));
      const corps = h('tbody', {}); rp.forEach(r => { const j = h('input', { type: 'text', maxlength: 100, value: r.jalon, 'aria-label': 'Jalon au ' + dateLongue(r.date), onchange: ev => { col.jalons[r.date] = ev.target.value.trim(); sauver(); } });
        corps.append(h('tr', {}, h('td', {}, dateLongue(r.date)), h('td', {}, nb(r.valeur) + ' ' + (col.unite || '')), h('td', {}, j))); });
      tb.append(corps); calc.append(h('details', {}, h('summary', {}, 'Rétro-planning'), tb));
    }
  };
  const f = (nom, label, type) => { const c = champ(label, { valeur: col[nom] === null ? '' : col[nom], a: { type: type || 'text', inputmode: type === 'date' ? null : 'decimal', 'data-champ': nom, 'data-col': col.id } });
    c.entree.addEventListener('change', () => {
      if (type === 'date') col[nom] = N.dateOk(c.entree.value) ? c.entree.value : ''; else if (nom === 'unite' || nom === 'capTexte' || nom === 'note') col[nom] = c.entree.value.trim(); else col[nom] = N.nombre(c.entree.value);
      if (nom === 'debut' && col.debut !== null && !col.debutDate) { col.debutDate = aujourdhui(); const d = carte.querySelector('[data-champ="debutDate"]'); if (d) d.value = col.debutDate; }
      sauver(); maj(); enTete(); }); return c; };
  const carte = h('section', { class: 'carte', 'data-col': col.id, 'aria-labelledby': 'h-' + col.id }, h('h3', { id: 'h-' + col.id }, def.nom),
    h('div', { class: 'grille' }, f('debut', 'Départ'), f('actuel', 'Actuel'), f('cap', 'Cap ' + D.reglages.cible.slice(0, 4)), f('unite', 'Unité'), f('debutDate', 'Date du départ', 'date')),
    f('capTexte', 'Le cap, en mots'), calc);
  maj(); return carte;
}
function vuePredictions() {
  const auj = aujourdhui(), zone = h('section', { id: 'predictions', 'aria-labelledby': 'h-pred' }, h('h3', { id: 'h-pred' }, 'Prédictions rejouées'));
  const dues = N.arejouer(D.predictions, auj);
  if (dues.length) {
    const ul = h('ul', { class: 'liste', id: 'a-rejouer' });
    dues.forEach(p => ul.append(h('li', {}, h('p', {}, p.texte, h('small', {}, ' · annoncé ' + p.proba + ' % · échéance ' + dateLongue(p.echeance))),
      h('span', { class: 'rang' }, bouton('Arrivé', () => { p.resultat = true; sauver(); aller('tableau'); }, 'petit', { 'data-res': 'oui' }),
        bouton('Pas arrivé', () => { p.resultat = false; sauver(); aller('tableau'); }, 'petit', { 'data-res': 'non' })))));
    zone.append(h('p', { class: 'avert' }, dues.length + ' à rejouer : est-ce arrivé ?'), ul);
  }
  const ul2 = h('ul', { class: 'liste', id: 'liste-pred' }); D.predictions.forEach(p => ul2.append(h('li', {}, p.texte, h('small', {}, ' · ' + p.proba + ' % · ' + dateLongue(p.echeance) + ' · ' + (p.resultat === true ? 'arrivé' : p.resultat === false ? 'pas arrivé' : 'en attente')),
    bouton('×', () => { D.predictions = D.predictions.filter(x => x.id !== p.id); sauver(); aller('tableau'); }, 'petit', { 'aria-label': 'Retirer cette prédiction' }))));
  if (!D.predictions.length) ul2.append(h('li', { class: 'vide' }, 'Aucune prédiction. Écris ce que tu crois qui arrivera, avec ta probabilité : l\'app te dira si tu vois juste.'));
  const t = champ('Je pense que…', { a: { maxlength: 160 } }), pr = champ('Probabilité (0 à 100 %)', { a: { type: 'number', min: 0, max: 100, inputmode: 'numeric' } }), ec = champ('À rejouer le', { a: { type: 'date' } });
  const e = N.etalonnage(D.predictions);
  const tab = h('table', { class: 'etalon', id: 'etalonnage' }, h('caption', {}, e.n ? 'Étalonnage : ' + e.n + ' prédiction(s) jouée(s)' + (e.brier !== null ? ' · score de Brier ' + e.brier.toString().replace('.', ',') + ' (0 = parfait ; 0,25 = pile ou face)' : '') : 'Étalonnage : rien de rejoué pour l\'instant'),
    h('thead', {}, h('tr', {}, h('th', {}, 'Tranche'), h('th', {}, 'Annoncé'), h('th', {}, 'Arrivé en vrai'), h('th', {}, 'Nombre'))));
  const tb = h('tbody', {}); e.tranches.forEach(x => tb.append(h('tr', {}, h('td', {}, x.nom), h('td', {}, x.annonce === null ? '—' : x.annonce + ' %'), h('td', {}, x.observe === null ? '—' : x.observe + ' %'), h('td', {}, x.n)))); tab.append(tb);
  zone.append(ul2, h('div', { class: 'grille' }, t, pr, ec), bouton('Ajouter la prédiction', () => {
    const q = N.nombre(pr.entree.value), txt = t.entree.value.trim();
    if (!txt || q === null || q < 0 || q > 100 || !N.dateOk(ec.entree.value)) { annonce('Il faut un texte, une probabilité de 0 à 100 et une date.'); return; }
    D.predictions.push({ id: N.nouvelId('p'), texte: txt, proba: Math.round(q), echeance: ec.entree.value, cree: aujourdhui(), resultat: null }); sauver(); aller('tableau');
  }, 'principal', { id: 'ajout-pred' }), tab);
  return zone;
}
function vueTableau(v) {
  const m = N.meteo(D.colonnes, aujourdhui(), D.reglages.cible);
  v.append(h('h2', {}, 'Tableau de bord'), h('div', { class: 'meteo-grande', id: 'meteo-grande', 'data-meteo': m.code }, icone(ICONES[m.code], 40), h('div', {}, h('strong', {}, m.mot), h('small', {}, m.rapport === null ? 'Renseigne départ, actuel et cap sur au moins une colonne.' : 'Moyenne des cinq colonnes, comparée à la droite départ → cap.'))));
  N.COLONNES.forEach(def => v.append(carteColonne(D.colonnes.find(c => c.id === def.id), def)));
  v.append(vuePredictions());
  const ind = h('section', { id: 'indicateurs', 'aria-labelledby': 'h-ind' }, h('h3', { id: 'h-ind' }, 'Indicateurs existants'), h('p', { id: 'etat-ind' }, N.appelIndicateurs().message), bouton('Actualiser', () => { $('etat-ind').textContent = N.appelIndicateurs().message; }, 'petit'));
  v.append(ind);
}

// ───────── Vue : Frise ─────────
function vueFrise(v) {
  const auj = aujourdhui(), ev = N.frise(D, D.reglages.cible, auj), ul = h('ol', { class: 'frise', id: 'frise' });
  let marque = false;
  const aujLi = () => h('li', { class: 'auj', 'data-cote': 'aujourdhui' }, h('strong', {}, 'Aujourd\'hui'), h('small', {}, dateLongue(auj)));
  ev.forEach(e => { if (!marque && e.date > auj) { ul.append(aujLi()); marque = true; }
    ul.append(h('li', { class: e.genre + ' ' + e.cote, 'data-cote': e.cote, 'data-genre': e.genre }, h('span', { class: 'date' }, dateLongue(e.date)), h('span', {}, e.texte), e.genre === 'evenement' ? bouton('×', () => { D.evenements = D.evenements.filter(x => x.id !== e.id); sauver(); aller('frise'); }, 'petit', { 'aria-label': 'Retirer : ' + e.texte }) : null)); });
  if (!marque) ul.append(aujLi());
  const d = champ('Date', { a: { type: 'date' } }), t = champ('Ce qui s\'est passé, ou ce qui viendra', { a: { maxlength: 140 } });
  v.append(h('h2', {}, 'Frise'), h('p', { class: 'aide' }, 'Du passé vers le futur : tes événements, les lettres scellées, les prédictions à rejouer et le cap.'), ul,
    h('div', { class: 'grille' }, d, t), bouton('Ajouter à la frise', () => { if (!N.dateOk(d.entree.value) || !t.entree.value.trim()) { annonce('Il faut une date et un texte.'); return; }
      D.evenements.push({ id: N.nouvelId('e'), date: d.entree.value, texte: t.entree.value.trim() }); sauver(); aller('frise'); }, 'principal', { id: 'ajout-evt' }));
}

// ───────── Vue : Moi ─────────
let qrCharge = null;
const chargerQr = () => (qrCharge = qrCharge || new Promise((ok, ko) => { const s = document.createElement('script'); s.src = POLITIQUE.createScriptURL('qr.js'); s.onload = ok; s.onerror = ko; document.head.appendChild(s); }));
let invitation = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); invitation = e; const b = $('installer'); if (b) b.hidden = false; });
function vueFiche() {
  const zone = h('section', { id: 'fiche', 'aria-labelledby': 'h-fiche' }, h('h3', { id: 'h-fiche' }, 'Ce que le futur sait de moi'),
    h('p', { class: 'aide' }, 'Une ligne = une chose vraie sur toi. Elle part, résumée, avec chacun de tes messages. Tu peux tout modifier ou retirer.'));
  const ul = h('ul', { class: 'liste' });
  D.fiche.forEach(l => { const t = h('textarea', { rows: 2, maxlength: 240, 'aria-label': 'Ligne de la fiche', onchange: e => { l.texte = e.target.value.trim(); if (!l.texte) D.fiche = D.fiche.filter(x => x.id !== l.id); sauver(); aller('moi'); } }); t.value = l.texte;
    const cat = h('select', { 'aria-label': 'Catégorie', onchange: e => { l.cat = e.target.value; sauver(); aller('moi'); } }, N.CATEGORIES_FICHE.map(([id, nom]) => h('option', { value: id, selected: id === l.cat }, nom)));
    ul.append(h('li', { class: 'fiche-l', 'data-cat': l.cat }, cat, t, bouton('Retirer', () => { D.fiche = D.fiche.filter(x => x.id !== l.id); sauver(); aller('moi'); }, 'petit'))); });
  if (!D.fiche.length) ul.append(h('li', { class: 'vide' }, 'Rien pour l\'instant.'));
  const nc = h('select', { id: 'nc', 'aria-label': 'Catégorie' }, N.CATEGORIES_FICHE.map(([id, nom]) => h('option', { value: id }, nom))), nt = champ('Ajouter une ligne', { a: { maxlength: 240 } });
  const util = N.resumeFiche(D.fiche).length;
  zone.append(ul, h('div', { class: 'rang' }, nc, nt, bouton('Ajouter', () => { const t = nt.entree.value.trim(); if (!t) return; D.fiche.push({ id: N.nouvelId('f'), cat: nc.value, texte: t }); sauver(); aller('moi'); }, 'principal', { id: 'ajout-fiche' })),
    h('small', { id: 'budget-fiche' }, 'Envoyé avec chaque message : ' + util + ' / ' + N.BUDGET_FICHE + ' caractères (le reste est tronqué, en commençant par ce que tu évites, puis tes valeurs).'));
  return zone;
}
function exporter() {
  const blob = new Blob([JSON.stringify(D, null, 1)], { type: 'application/json' }), a = h('a', { href: URL.createObjectURL(blob), download: 'moi-dans-5-ans-' + aujourdhui() + '.json' });
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
function importer(fichier) {
  const r = new FileReader(); r.onload = () => { try { const o = JSON.parse(String(r.result)); if (!o || typeof o !== 'object' || Array.isArray(o)) throw new Error('forme'); D = normalise(o); sauver(); aller('moi'); annonce('Données importées.'); } catch (e) { annonce('Ce fichier n\'est pas une sauvegarde de l\'app.'); } };
  r.onerror = () => annonce('Lecture du fichier impossible.'); r.readAsText(fichier);
}
function effacerAppareil() {
  const s = champ('Pour confirmer, tape EFFACER', { a: { autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false' } });
  const ok = bouton('Effacer', () => { Object.keys(localStorage).filter(k => k.indexOf('futur.') === 0).forEach(k => { try { localStorage.removeItem(k); } catch (e) { /* stockage indisponible */ } }); D = vide(); $('dlg').close(); aller('moi'); annonce('Cet appareil est effacé.'); }, 'principal', { id: 'effacer-ok', disabled: true });
  s.entree.addEventListener('input', () => { ok.disabled = s.entree.value.trim() !== 'EFFACER'; });
  ouvrirDlg('Effacer cet appareil ?', [h('p', {}, 'Tes lettres, ta fiche, ton tableau, ta frise et la conversation gardés ici seront perdus. Le serveur et Ma carte de vie ne changent pas. La connexion (partagée avec les autres apps) reste : elle s\'oublie dans l\'écran Connexion.'), s], [bouton('Annuler', () => $('dlg').close()), ok]);
}
function vueMoi(v) {
  const c = N.compteARebours(D.reglages.cible, aujourdhui());
  const cible = champ('Date cible (fixe, elle ne se rapproche pas d\'elle-même)', { valeur: D.reglages.cible, a: { type: 'date', id: 'cible' } });
  cible.entree.addEventListener('change', () => { if (N.dateOk(cible.entree.value)) { D.reglages.cible = cible.entree.value; sauver(); enTete(); aller('moi'); } });
  const voix = h('label', { class: 'case' }, h('input', { type: 'checkbox', id: 'voix', checked: D.reglages.voix, onchange: e => { D.reglages.voix = e.target.checked; sauver(); } }), ' Lire ses réponses à voix haute (bouton sur chaque réponse)');
  const zq = h('div', { id: 'zone-qr', class: 'cx-plus' }), inst = bouton('Installer l\'app sur cet appareil', async () => { if (invitation) { invitation.prompt(); invitation = null; inst.hidden = true; } }, '', { id: 'installer', hidden: !invitation });
  const qr = bouton('Installer sur le téléphone : afficher un QR', async () => {
    zq.textContent = ''; try { await chargerQr(); const q = qrcode(0, 'M'); q.addData(location.href.split('#')[0].split('?')[0]); q.make();
      zq.append(h('img', { class: 'cx-qr', src: q.createDataURL(6, 2), alt: 'QR de l\'adresse de l\'app', width: 248, height: 248 }), h('p', { class: 'aide' }, 'Vise-le avec l\'appareil photo du téléphone, ouvre le lien, puis « Ajouter à l\'écran d\'accueil ». Ce QR ne contient que l\'adresse de l\'app, aucune clé.')); }
    catch (e) { zq.append(h('p', {}, 'Le QR n\'a pas pu être fabriqué sur cet appareil.')); } }, '', { id: 'qr-installer' });
  const imp = h('input', { type: 'file', accept: 'application/json,.json', id: 'import', class: 'lecteur', 'aria-label': 'Importer une sauvegarde', onchange: e => { if (e.target.files[0]) importer(e.target.files[0]); } });
  v.append(h('h2', {}, 'Moi'), h('p', { id: 'rebours', class: 'rebours' }, c.passe ? 'La date cible est passée.' : 'Il reste ' + c.jours.toLocaleString('fr-FR') + ' jours jusqu\'au ' + dateLongue(c.cible) + '.'), cible, vueFiche(),
    h('section', { 'aria-labelledby': 'h-voix' }, h('h3', { id: 'h-voix' }, 'Voix'), voix),
    h('section', { 'aria-labelledby': 'h-inst' }, h('h3', { id: 'h-inst' }, 'Installation'), qr, inst, zq),
    h('section', { 'aria-labelledby': 'h-cx' }, h('h3', { id: 'h-cx' }, 'Connexion'), h('div', { id: 'connexion-ecran' })),
    h('section', { 'aria-labelledby': 'h-app' }, h('h3', { id: 'h-app' }, 'Cet appareil'), h('p', {}, 'Tout ce que tu écris ici reste sur cet appareil (sauf tes messages à la conversation). L\'app n\'écrit jamais dans Ma carte de vie.'),
      h('div', { class: 'rang' }, bouton('Exporter mes données', exporter, '', { id: 'exporter' }), h('label', { class: 'bouton', for: 'import' }, 'Importer'), imp, bouton('Effacer cet appareil…', effacerAppareil, '', { id: 'effacer' })),
      h('p', { class: 'version' }, 'Version ' + VERSION + ' · mise à jour automatique')));
  Connexion.monter($('connexion-ecran'), { nomApp: 'Moi dans 5 ans', github: false, qr: async t => { await chargerQr(); const q = qrcode(0, 'M'); q.addData(t); q.make(); return q.createDataURL(6, 2); }, apres: () => setTimeout(() => location.reload(), 1500) });
}
const VUES = { parler: vueParler, lettres: vueLettres, tableau: vueTableau, frise: vueFrise, moi: vueMoi };

// ───────── Démarrage ─────────
$('ver-haut').textContent = VERSION;
monterCoque();
aller(/^#(parler|lettres|tableau|frise|moi)$/.test(location.hash) ? location.hash.slice(1) : 'parler');
$('meteo').addEventListener('click', () => aller('tableau'));
$('maj').addEventListener('click', () => location.reload());
if ('serviceWorker' in navigator) {
  const avecSW = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (avecSW) $('maj').hidden = false; });
  navigator.serviceWorker.register(POLITIQUE.createScriptURL('sw.js'), { updateViaCache: 'none' }).catch(() => { /* hors ligne non disponible : l'app marche quand même */ });
}
window.addEventListener('storage', e => { if (e.key === CLE) { try { D = normalise(JSON.parse(e.newValue || 'null')); } catch (x) { /* ignoré */ } if (onglet !== 'moi' && !$('dlg').open) aller(onglet); } });
