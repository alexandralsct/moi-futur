/* Connexion — module commun à Ma carte de vie, LIFE et Coulisses (écran réduit à deux choses le 19/10 : un QR, et la saisie à la main).
   Un « code de connexion » unique regroupe : l'adresse du serveur, la clé des apps, le dépôt et le jeton de synchro de la carte,
   le dépôt et le jeton de lecture de Coulisses, la clé de pilotage. Il est rangé une fois (localStorage « connexion », même origine
   pour les trois apps) et recopié dans les anciens rangements (carte-de-vie-sync, carte-de-vie-lien, life.adresse, life.cle,
   coulisses-config, coulisses-pilote) : chaque app continue de lire les siens, et un appareil déjà connecté ne perd rien.
   Aucune clé n'est écrite dans ce fichier. Un secret n'est jamais affiché ; les textes reçus sont posés avec textContent.
   Ce fichier est copié à l'identique dans les trois apps (l'octet près, vérifié par tests/connexion_copies) ; seule option propre à l'app : nomApp. */
(function (g) {
  'use strict';
  var RANGEMENT = 'connexion', PREFIXE = 'CV1.';
  var ERREUR = 'Cet appareil n\'est plus connecté → Réglages → Connexion';
  var CHAMPS = ['serveur', 'cle', 'depot', 'jeton', 'lectureDepot', 'lecture', 'pilote'];
  var CHEMIN_LIEN = '/crochets/app-lien', CHEMIN_PILOTE = '/crochets/pilote', CHEMIN_LIFE = '/crochets/life';
  // Le QR passe par la paire « life » / « life-transfert » du système (celle de LIFE, déjà en service) : « app-lien » n'a pas de route de retrait.
  var DUREE_QR = 120;

  function ls() { try { return g.localStorage; } catch (e) { return null; } }
  function lis(k) { var s = ls(); try { return s ? s.getItem(k) : null; } catch (e) { return null; } }
  function ecris(k, v) { var s = ls(); try { if (s) { s.setItem(k, v); return true; } } catch (e) { /* stockage indisponible */ } return false; }
  function retire(k) { var s = ls(); try { if (s) s.removeItem(k); } catch (e) { /* stockage indisponible */ } }
  function json(k) { try { var v = JSON.parse(lis(k) || 'null'); return v && typeof v === 'object' ? v : null; } catch (e) { return null; } }
  function texte(v) { return typeof v === 'string' ? v.trim() : ''; }

  // ─── formes acceptées ───
  function serveurPropre(v) {   // l'adresse du serveur, sans chemin : https://hôte[:port]
    v = texte(v); if (!/^https:\/\/[^\s/?#]+/.test(v)) return '';
    try { var u = new URL(v); return u.protocol === 'https:' ? u.origin : ''; } catch (e) { return ''; }
  }
  var FORMES = {
    serveur: serveurPropre,
    cle: function (v) { v = texte(v); return /^\S{12,400}$/.test(v) ? v : ''; },
    depot: function (v) { v = texte(v).replace(/^https?:\/\/github\.com\//, '').replace(/\/$/, ''); return /^[\w.-]+\/[\w.-]+$/.test(v) ? v : ''; },
    jeton: function (v) { v = texte(v); return /^\S{20,400}$/.test(v) ? v : ''; },
    lectureDepot: function (v) { return FORMES.depot(v); },
    lecture: function (v) { return FORMES.jeton(v); },
    pilote: function (v) { v = texte(v); return /^\S{12,400}$/.test(v) ? v : ''; }
  };
  function nettoie(o) {
    var r = {}; if (!o || typeof o !== 'object') return r;
    CHAMPS.forEach(function (f) { var v = FORMES[f](o[f]); if (v) r[f] = v; });
    return r;
  }

  // ─── anciens rangements (lecture) ───
  function lireAncien() {
    var r = {}, sync = json('carte-de-vie-sync'), cc = json('coulisses-config'), cp = json('coulisses-pilote');
    if (sync) { r.depot = sync.repo; r.jeton = sync.token; }
    var lien = texte(lis('carte-de-vie-lien'));
    var lifeCle = ''; try { lifeCle = JSON.parse(lis('life.cle') || '""'); } catch (e) { /* illisible */ }
    r.cle = lien || lifeCle;
    var lifeAdr = ''; try { lifeAdr = JSON.parse(lis('life.adresse') || '""'); } catch (e) { /* illisible */ }
    r.serveur = serveurPropre(lifeAdr) || serveurPropre(cp && cp.adresse);
    if (cc) { r.lectureDepot = cc.depot; r.lecture = cc.jeton; }
    if (cp) r.pilote = cp.cle;
    return nettoie(r);
  }
  function lireRange() { return nettoie(json(RANGEMENT)); }
  // L'état vrai de l'appareil : ce que les anciens rangements disent (une saisie à l'ancienne reste prioritaire), complété par « connexion ».
  function etat() {
    var a = lireAncien(), c = lireRange(), r = {};
    CHAMPS.forEach(function (f) { var v = a[f] || c[f]; if (v) r[f] = v; });
    return r;
  }
  // ─── rangement ───
  function ecrireRange(o, attente) {
    var r = nettoie(o); r.v = 1; r.maj = Date.now(); if (attente) r.attente = attente; return ecris(RANGEMENT, JSON.stringify(r));
  }
  // Dépôt et jeton de synchro reçus mais pas encore liés dans la carte (les anciens rangements n'ont pas changé).
  function enAttente() {
    var c = json(RANGEMENT), a = lireAncien(), t = c && c.attente, d = FORMES.depot(t && t.depot), j = FORMES.jeton(t && t.jeton);
    return d && j && (a.depot !== d || a.jeton !== j) ? { depot: d, jeton: j } : null;
  }
  function ecrireAncien(o) {   // recopie sans rien effacer : les champs absents ne touchent à rien
    // La synchro de la carte n'est jamais écrite d'ici : sa liaison (premier échange, fusion) se fait par le bouton de la carte (voir « attente »).
    var ok = true, cc, cp;
    if (o.cle) { ok = ecris('carte-de-vie-lien', o.cle) && ok; ok = ecris('life.cle', JSON.stringify(o.cle)) && ok; }
    if (o.serveur) {
      var la = ''; try { la = serveurPropre(JSON.parse(lis('life.adresse') || '""')); } catch (e) { /* illisible */ }
      if (la !== o.serveur) ok = ecris('life.adresse', JSON.stringify(o.serveur + CHEMIN_LIFE)) && ok;
    }
    if (o.lectureDepot && o.lecture) { cc = json('coulisses-config') || {}; cc.depot = o.lectureDepot; cc.jeton = o.lecture; ok = ecris('coulisses-config', JSON.stringify(cc)) && ok; }
    if (o.pilote && o.serveur) { cp = json('coulisses-pilote') || {}; cp.adresse = o.serveur; cp.cle = o.pilote; ok = ecris('coulisses-pilote', JSON.stringify(cp)) && ok; }
    return ok;
  }
  // Au démarrage d'une app : « connexion » reprend ce que les anciens rangements savent (rien n'est perdu, rien n'est effacé).
  function adopter() {
    var e = etat(), c = lireRange(), diff = CHAMPS.some(function (f) { return (e[f] || '') !== (c[f] || ''); });
    if ((diff || (json(RANGEMENT) || {}).attente) && Object.keys(e).length) ecrireRange(e, enAttente());
    return e;
  }

  // ─── le code ───
  function b64u(u8) { var s = ''; for (var i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
  function deb64u(t) { var s = atob(String(t).replace(/-/g, '+').replace(/_/g, '/')), u = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; }
  function composer(o) {
    var r = nettoie(o || etat()); if (!Object.keys(r).length) return '';
    r.v = 1; return PREFIXE + b64u(new TextEncoder().encode(JSON.stringify(r)));
  }
  function lireCode(t) {
    t = String(t || '').replace(/\s+/g, ''); var i = t.indexOf(PREFIXE); if (i < 0) throw new Error('code'); t = t.slice(i + PREFIXE.length);
    if (!/^[A-Za-z0-9_-]{16,6000}$/.test(t)) throw new Error('code');
    var o; try { o = JSON.parse(new TextDecoder().decode(deb64u(t))); } catch (e) { throw new Error('code'); }
    var propre = nettoie(o), n = Object.keys(propre).length;
    // un champ présent mais de forme fausse (serveur en http, clé trop courte…) : tout le code est refusé, rien n'est appliqué à moitié
    if (!n || CHAMPS.some(function (f) { return o[f] != null && o[f] !== '' && !propre[f]; })) throw new Error('code');
    return propre;
  }
  // Applique un code (ou un objet déjà propre). Ajoute et remplace, n'efface jamais un lien que le code ne mentionne pas
  // — sauf si le serveur change : les clés de l'ancien serveur ne doivent jamais partir vers le nouveau.
  function appliquer(entree) {
    var o = typeof entree === 'string' ? lireCode(entree) : nettoie(entree), cur = etat(), res = {}, att = null;
    if (o.serveur && cur.serveur && o.serveur !== cur.serveur) {
      delete cur.cle; delete cur.pilote;
      if (!o.cle) { retire('carte-de-vie-lien'); retire('life.cle'); }
      if (!o.pilote) retire('coulisses-pilote');
    }
    CHAMPS.forEach(function (f) { var v = o[f] || cur[f]; if (v) res[f] = v; });
    if (o.depot && o.jeton && (o.depot !== cur.depot || o.jeton !== cur.jeton)) { att = { depot: o.depot, jeton: o.jeton }; if (cur.depot && cur.jeton) { res.depot = cur.depot; res.jeton = cur.jeton; } else { delete res.depot; delete res.jeton; } }
    if (!ecrireAncien(res) || !ecrireRange(res, att || enAttente())) throw new Error('stockage');
    return res;
  }
  function oublier() {
    ['carte-de-vie-lien', 'life.cle', 'coulisses-pilote', 'coulisses-config', RANGEMENT].forEach(retire);
    var s = json('carte-de-vie-sync'); if (s) { delete s.token; ecris('carte-de-vie-sync', JSON.stringify(s)); }
  }

  // ─── les liens, et leur test ───
  var LIENS = [
    { id: 'synchro', nom: 'Synchro de la carte', champs: ['depot', 'jeton'], manque: 'pas encore reliée' },
    { id: 'assistants', nom: 'Assistants (carte et LIFE)', champs: ['serveur', 'cle'], manque: 'pas encore reliés' },
    { id: 'coulisses', nom: 'Coulisses : état du système', champs: ['lectureDepot', 'lecture'], manque: 'pas encore reliées' },
    { id: 'pilotage', nom: 'Coulisses : pilotage', champs: ['serveur', 'pilote'], manque: 'pas encore relié' }
  ];
  function lignes() {
    var e = etat();
    return LIENS.map(function (l) {
      var ok = l.champs.every(function (f) { return !!e[f]; });
      if (l.id === 'synchro' && !ok && enAttente()) return { id: l.id, nom: l.nom, ok: false, detail: 'reçue : à terminer dans Ma carte de vie (Connexion)' };
      return { id: l.id, nom: l.nom, ok: ok, detail: ok ? 'enregistré sur cet appareil' : l.manque };
    });
  }
  function dedans(prom, ms) {
    return Promise.race([prom, new Promise(function (_, ko) { setTimeout(function () { ko(new Error('delai')); }, ms); })]);
  }
  function appelGithub(depot, jeton, chemin) {
    return dedans(fetch('https://api.github.com/repos/' + depot + (chemin || ''), { headers: { Authorization: 'Bearer ' + jeton, Accept: 'application/vnd.github+json' }, cache: 'no-store' }), 10000);
  }
  function verdict(r, refus) {
    if (r.status === 401 || r.status === 403) return { ok: false, detail: refus };
    if (r.status === 404) return { ok: false, detail: 'introuvable (nom du dépôt, ou droits du jeton)' };
    if (r.status >= 500) return { ok: false, detail: 'le service a un souci (' + r.status + '), réessaie plus tard' };
    return { ok: true, detail: 'répond' };
  }
  var TESTS = {
    synchro: function (e, peut) {
      if (peut.github === false) return Promise.resolve({ ok: null, detail: 'enregistré — se teste dans Ma carte de vie' });
      return appelGithub(e.depot, e.jeton, '').then(function (r) { return verdict(r, 'refusé par GitHub (jeton à refaire)'); });
    },
    coulisses: function (e, peut) {
      if (peut.github === false) return Promise.resolve({ ok: null, detail: 'enregistré — se teste dans Coulisses' });
      return appelGithub(e.lectureDepot, e.lecture, '/contents/etat.json').then(function (r) { return verdict(r, 'refusé par GitHub (jeton à refaire)'); });
    },
    assistants: function (e) {
      return dedans(fetch(e.serveur + CHEMIN_LIEN, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Cle-App': e.cle }, body: JSON.stringify({ type: 'test_cle' }), cache: 'no-store' }), 10000)
        .then(function (r) { return verdict(r, 'clé refusée par le système'); });
    },
    pilotage: function (e) {
      return dedans(fetch(e.serveur + CHEMIN_PILOTE, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-cle-pilote': e.pilote }, body: JSON.stringify({ commande: 'etat' }), cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer' }), 10000)
        .then(function (r) { return verdict(r, 'clé de pilotage refusée'); });
    }
  };
  function tester(peut, quand) {
    var e = etat(); peut = peut || {};
    return Promise.all(LIENS.map(function (l) {
      var base = { id: l.id, nom: l.nom };
      if (!l.champs.every(function (f) { return !!e[f]; })) return Promise.resolve(Object.assign(base, { ok: false, detail: l.id === 'synchro' && enAttente() ? 'reçue : à terminer dans Ma carte de vie (Connexion)' : l.manque }));
      var p; try { p = TESTS[l.id](e, peut); } catch (x) { p = Promise.reject(x); }
      return p.then(function (v) { return Object.assign(base, v); },
        function (x) { return Object.assign(base, { ok: false, detail: x && x.message === 'delai' ? 'ne répond pas (réseau ?)' : 'injoignable (réseau, ou serveur arrêté)' }); })
        .then(function (v) { if (quand) quand(v); return v; });
    }));
  }

  // ─── QR à usage unique (protocole « transfert » : le paquet chiffré reste 120 s chez le système, ne sort qu'une fois) ───
  function carteUrl(o) { return (o && o.carteUrl) || (g.location ? g.location.origin + '/carte-de-vie/' : ''); }
  function deposer(o) {
    var e = etat();
    if (!e.serveur || !e.cle) return Promise.reject(new Error('manque'));
    if (!(g.crypto && g.crypto.subtle)) return Promise.reject(new Error('chiffrement'));
    var code = composer(e), k = g.crypto.getRandomValues(new Uint8Array(16)), iv = g.crypto.getRandomValues(new Uint8Array(12));
    var paquet = { c: code }; if (e.depot && e.jeton) { paquet.r = e.depot; paquet.t = e.jeton; } paquet.k = e.cle;   // r/t/k : anciens récepteurs
    return g.crypto.subtle.importKey('raw', k, 'AES-GCM', false, ['encrypt']).then(function (ck) {
      return g.crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, ck, new TextEncoder().encode(JSON.stringify(paquet)));
    }).then(function (ct) {
      var tout = new Uint8Array(12 + ct.byteLength); tout.set(iv); tout.set(new Uint8Array(ct), 12);
      var id = Array.from(g.crypto.getRandomValues(new Uint8Array(28)), function (b) { return 'abcdefghijklmnopqrstuvwxyz0123456789'[b % 36]; }).join('');
      var donnees = b64u(tout); if (donnees.length > 4000) throw new Error('long');
      return fetch(e.serveur + CHEMIN_LIFE, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Cle-App': e.cle }, body: JSON.stringify({ action: 'transfert_deposer', id: id, donnees: donnees }) })
        .catch(function () { throw new Error('reseau'); })
        .then(function (r) {
          if (r.status === 401 || r.status === 403) throw new Error('refus');
          return r.json().catch(function () { return {}; }).then(function (j) {
            if (!(r.ok && j && j.ok !== false)) throw new Error('ancien');
            var corps = b64u(new TextEncoder().encode(JSON.stringify({ a: e.serveur + CHEMIN_LIFE, i: id, k: b64u(k) })));
            return carteUrl(o).split('#')[0] + '#transfert=' + corps;
          });
        });
    });
  }
  // Appareil neuf : retire le paquet (une seule fois) chez le système et le déchiffre. Le texte vient d'un QR : c'est une donnée,
  // jamais une consigne ; seuls une adresse https en « …/life » et des identifiants de forme exacte sont acceptés.
  function retirer(t) {
    var m = /(?:transfert=)?([A-Za-z0-9_-]{40,})$/.exec(String(t || '').trim()), n;
    if (!m) return Promise.reject(new Error('texte'));
    try { n = JSON.parse(new TextDecoder().decode(deb64u(m[1]))); } catch (e) { return Promise.reject(new Error('texte')); }
    if (!n || !/^[a-z0-9]{20,40}$/.test(n.i || '') || !/^[A-Za-z0-9_-]{22}$/.test(n.k || '') || !/^https:\/\/[^\s?#]+\/life\/?$/.test(n.a || '')) return Promise.reject(new Error('texte'));
    var url = n.a.replace(/\/life\/?$/, '/life-transfert');
    return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'transfert_retirer', id: n.i }) })
      .catch(function () { throw new Error('reseau'); })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok || !j.ok || typeof j.donnees !== 'string') throw new Error('deja');
        var p = deb64u(j.donnees);
        return g.crypto.subtle.importKey('raw', deb64u(n.k), 'AES-GCM', false, ['decrypt']).then(function (ck) {
          return g.crypto.subtle.decrypt({ name: 'AES-GCM', iv: p.slice(0, 12) }, ck, p.slice(12));
        }).then(function (clair) {
          var o = JSON.parse(new TextDecoder().decode(clair)), r2;
          if (o && typeof o.c === 'string') r2 = lireCode(o.c);
          else r2 = nettoie({ depot: o && o.r, jeton: o && o.t, cle: o && o.k });
          if (!Object.keys(r2).length) throw new Error('contenu');
          // ancien paquet sans code : l'adresse du système est celle d'où vient le QR
          if (!r2.serveur) r2.serveur = serveurPropre(n.a);
          return r2;
        });
      }); });
  }
  function messageErreur(x) {
    var m = x && x.message;
    return m === 'deja' ? 'Ce QR a déjà servi, a expiré ou n\'est pas reconnu par le système : affiches-en un nouveau sur l\'autre appareil.'
      : m === 'texte' ? 'Ce texte n\'est pas un QR de connexion.' : m === 'code' ? 'Ce texte n\'est pas un code de connexion.'
      : m === 'refus' ? 'Le système refuse la clé de cet appareil. ' + ERREUR + '.'
      : m === 'manque' ? 'Pour afficher un QR, cet appareil doit d\'abord avoir l\'adresse du serveur et la clé des apps : saisis-les dans « Saisir les codes à la main », puis Enregistrer.'
      : m === 'ancien' ? 'Le système n\'est pas encore à jour pour un QR à usage unique : aucun QR n\'a été affiché.'
      : m === 'chiffrement' ? 'Le chiffrement n\'est pas disponible ici : aucun QR n\'a été affiché.'
      : m === 'stockage' ? 'Cet appareil ne peut pas enregistrer la connexion (stockage bloqué).'
      : m === 'reseau' ? 'Le système n\'a pas répondu (connexion ?). Tu peux aussi saisir les codes à la main : Réglages → Connexion.' : 'Impossible pour le moment. Réessaie.';
  }

  // ─── ce qui est connecté (une ligne) ───
  function resume() {
    var e = etat(), att = enAttente(), lien = !!(e.serveur && e.cle);
    var apps = [
      { nom: 'Ma carte de vie', ok: lien || !!(e.depot && e.jeton) },
      { nom: 'LIFE', ok: lien },
      { nom: 'Coulisses', ok: !!((e.lectureDepot && e.lecture) || (e.serveur && e.pilote)) }
    ];
    var oui = apps.filter(function (a) { return a.ok; }).map(function (a) { return a.nom; }), non = apps.filter(function (a) { return !a.ok; }).map(function (a) { return a.nom; });
    var t = !oui.length ? 'Aucune app n\'est connectée sur cet appareil.' : 'Connectées sur cet appareil : ' + oui.join(', ') + '.' + (non.length ? ' Pas encore : ' + non.join(', ') + '.' : '');
    return att ? t + ' La synchro de la carte se termine dans Ma carte de vie.' : t;
  }

  // ─── écran « Connexion » (identique dans les trois apps) ───
  function el(tag, cls, txt, attrs) {
    var n = document.createElement(tag); if (cls) n.className = cls; if (txt != null) n.textContent = txt;
    if (attrs) Object.keys(attrs).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    return n;
  }
  function bouton(txt, cls, fn) { var b = el('button', 'cx-btn' + (cls ? ' ' + cls : ''), txt, { type: 'button' }); b.addEventListener('click', fn); return b; }
  var SAISIE = [
    { titre: 'Synchro de la carte (GitHub)', champs: [
      { f: 'depot', label: 'Dépôt de synchro (compte/nom)', ph: 'compte/nom-du-depot' },
      { f: 'jeton', label: 'Jeton de synchro GitHub', secret: true } ] },
    { titre: 'Clé des apps (carte et LIFE)', champs: [
      { f: 'serveur', label: 'Adresse du serveur', ph: 'https://…' },
      { f: 'cle', label: 'Clé des apps', secret: true } ] },
    { titre: 'Coulisses', champs: [
      { f: 'lectureDepot', label: 'Dépôt de lecture de Coulisses (compte/nom)', ph: 'compte/nom-du-depot' },
      { f: 'lecture', label: 'Jeton de lecture de Coulisses', secret: true },
      { f: 'pilote', label: 'Clé de pilotage de Coulisses', secret: true } ] }
  ];
  var NOM_CHAMP = {}; SAISIE.forEach(function (s) { s.champs.forEach(function (c) { NOM_CHAMP[c.f] = c.label; }); });
  /* monter(zone, options) — options : nomApp (le seul texte qui change d'une app à l'autre), qr(texte) → Promise<chaîne « data:… » ou « <svg… »>,
     carteUrl (adresse de Ma carte de vie, que le QR ouvre), apres() (appelée quand un réglage vient de changer),
     synchro(depot, jeton) (seulement dans Ma carte de vie : lie la synchro par son propre bouton, avec sa fusion). */
  function monter(zone, o) {
    o = o || {}; zone.textContent = ''; zone.classList.add('cx');
    var titre = el('h3', 'cx-titre', 'Connexion' + (o.nomApp ? ' · ' + o.nomApp : ''));
    var etatL = el('p', 'cx-etat', '', { role: 'status', 'aria-live': 'polite' }), zonePlus = el('div', 'cx-plus');
    var champs = {};
    function dit(t) { etatL.textContent = t || ''; }
    function remplis() {
      var e = etat();
      SAISIE.forEach(function (s) { s.champs.forEach(function (c) {
        var n = champs[c.f]; if (!n) return;
        if (c.secret) { n.value = ''; n.placeholder = e[c.f] ? 'Enregistré — laisse vide pour le garder' : 'Colle ici'; }
        else n.value = e[c.f] || '';
      }); });
    }
    function connecteAutre() {
      zonePlus.textContent = ''; dit('Je prépare le QR…');
      deposer(o).then(function (lien) {
        var qr = o.qr ? o.qr(lien) : null;
        return Promise.resolve(qr).then(function (img) {
          if (!img) throw new Error('qr');
          var src = /^<svg/.test(img) ? 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(img) : img;
          var i = el('img', 'cx-qr', null, { src: src, alt: 'QR de connexion, valable une fois pendant 2 minutes', width: 248, height: 248 });
          var reste = el('p', 'cx-aide', '', { role: 'status' }); zonePlus.append(i, reste);
          var fin = Date.now() + DUREE_QR * 1000;
          var tm = setInterval(function () {
            var s = Math.max(0, Math.round((fin - Date.now()) / 1000));
            if (!zonePlus.isConnected || s <= 0) { clearInterval(tm); if (zonePlus.isConnected) { zonePlus.textContent = ''; dit('QR expiré : il n\'est plus valable. Génère-en un nouveau si besoin.'); } return; }
            reste.textContent = 'Vise ce QR avec l\'appareil photo du téléphone. Valable encore ' + s + ' s, une seule fois.';
          }, 1000);
          dit('');
        });
      }).catch(function (x) { dit(x && x.message === 'qr' ? 'Le QR n\'a pas pu être fabriqué sur cet appareil.' : messageErreur(x)); });
    }
    function applique(t) {
      var avant = JSON.stringify(etat()), cur = etat().serveur, neuf;
      try { neuf = (typeof t === 'string' ? lireCode(t) : nettoie(t)).serveur; } catch (x) { dit(messageErreur(x)); return false; }
      if (cur && neuf && neuf !== cur && g.confirm && !g.confirm('Cette adresse est celle d\'un autre serveur que celui de cet appareil. La remplacer ?')) { dit('Rien n\'a été changé.'); return false; }
      try { appliquer(t); } catch (x) { dit(messageErreur(x)); return false; }
      remplis(); dit('Enregistré ✓ ' + resume());
      var att = enAttente(); if (att && o.synchro) { o.synchro(att.depot, att.jeton); }
      if (JSON.stringify(etat()) !== avant && o.apres) o.apres();
      return true;
    }
    function enregistre() {
      var e = etat(), saisi = {}, faux = [];
      SAISIE.forEach(function (s) { s.champs.forEach(function (c) {
        var v = texte(champs[c.f].value); if (!v) return;
        if (!FORMES[c.f](v)) { faux.push(c.label); return; }
        if (FORMES[c.f](v) !== e[c.f]) saisi[c.f] = FORMES[c.f](v);
      }); });
      if (faux.length) { dit('Forme incorrecte : ' + faux.join(' ; ') + '. Rien n\'a été enregistré.'); return; }
      if (!Object.keys(saisi).length) { dit('Rien à enregistrer : remplis ou change un champ.'); return; }
      // dépôt et jeton vont ensemble (synchro, lecture de Coulisses) : un seul des deux saisi, l'autre est repris de cet appareil
      [['depot', 'jeton'], ['lectureDepot', 'lecture']].forEach(function (p) {
        if ((saisi[p[0]] || saisi[p[1]]) && e[p[0]] && e[p[1]]) { saisi[p[0]] = saisi[p[0]] || e[p[0]]; saisi[p[1]] = saisi[p[1]] || e[p[1]]; }
      });
      applique(saisi);
    }
    var blocQr = el('section', 'cx-bloc', null, { 'aria-labelledby': 'cx-t-qr' });
    var tQr = el('h4', 'cx-sous', 'Un QR pour tout connecter'); tQr.id = 'cx-t-qr';
    blocQr.append(tQr,
      el('p', 'cx-aide', 'Génère le QR, puis scanne-le avec l\'appareil photo du téléphone (Android, Chrome) : la carte, LIFE et Coulisses sont connectées d\'un coup. Il ne sert qu\'une fois, pendant 2 minutes, et ne contient aucune clé.'),
      bouton('Générer un QR', '', connecteAutre), zonePlus);
    var blocMain = el('form', 'cx-bloc', null, { 'aria-labelledby': 'cx-t-main', novalidate: '' });
    var tMain = el('h4', 'cx-sous', 'Saisir les codes à la main'); tMain.id = 'cx-t-main';
    blocMain.append(tMain, el('p', 'cx-aide', 'Le jeton de synchro (GitHub) et la clé des apps sont deux choses différentes : l\'une ne remplace jamais l\'autre. Rien de secret n\'est affiché.'));
    SAISIE.forEach(function (s, si) {
      var fs = el('fieldset', 'cx-groupe'), lg = el('legend', 'cx-legende', s.titre); fs.appendChild(lg);
      s.champs.forEach(function (c) {
        var id = 'cx-champ-' + c.f, lab = el('label', 'cx-label', c.label, { 'for': id });
        var inp = el('input', 'cx-champ', null, { id: id, name: c.f, type: c.secret ? 'password' : 'text', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false' });
        if (c.ph) inp.placeholder = c.ph;
        champs[c.f] = inp; fs.append(lab, inp);
      });
      blocMain.appendChild(fs);
    });
    blocMain.append(bouton('Enregistrer', '', enregistre));
    blocMain.addEventListener('submit', function (ev) { ev.preventDefault(); enregistre(); });
    zone.append(titre, blocQr, blocMain, etatL); remplis();
    // codes reçus d'une autre app mais pas encore liés dans la carte : la carte termine la liaison quand son écran s'ouvre
    if (o.synchro) { var att0 = enAttente(); if (att0) setTimeout(function () { o.synchro(att0.depot, att0.jeton); }, 0); }
    return { dit: dit, applique: applique, recevoir: function (t) { dit('Je vérifie…'); return retirer(t).then(function (r) { applique(r); }, function (x) { dit(messageErreur(x)); }); } };
  }

  g.Connexion = {
    ERREUR: ERREUR, CHAMPS: CHAMPS, etat: etat, enAttente: enAttente, adopter: adopter, composer: composer, lireCode: lireCode, appliquer: appliquer, oublier: oublier,
    lignes: lignes, tester: tester, deposer: deposer, retirer: retirer, resume: resume, monter: monter, messageErreur: messageErreur
  };
  try { adopter(); } catch (e) { /* stockage indisponible : l'écran le dira */ }
  if (typeof module !== 'undefined' && module.exports) module.exports = g.Connexion;
})(typeof window !== 'undefined' ? window : globalThis);
