/* Moi dans 5 ans — le noyau : réglages par défaut, cadre du moi du futur et calculs purs (dates, écart, rétro-planning, météo,
   étalonnage). Aucun accès au réseau ni à la page : ce fichier se teste seul (tests/t0_noyau.mjs). Aucune adresse, aucune clé, aucun prénom. */
(function (g) {
  'use strict';

  // ─── Hypothèses du 05/11, une constante chacune : docs/moi_dans_5_ans_spec.md ───
  var CIBLE_DEFAUT = '2031-11-05';   // H5 : date fixe du compte à rebours (elle ne se rapproche pas d'elle-même)
  var BRANCHE = { indicateurs: false, intime: false };   // points d'appel fermés : rien ne part tant qu'ils sont à false
  var SOURCES_FAITS_SEULEMENT = true;   // H1 : une source cliquable n'accompagne que les FAITS sur son passé
  var COMITE_A_LA_DEMANDE = true;   // H2 : pas de conseil à trois ; le Comité ne parle que sur demande
  var LIMITE_SERVEUR = 2000;   // caractères acceptés par le serveur de LIFE pour un message
  var BUDGET_CADRE = 560, BUDGET_FICHE = 480;

  // H3 : il parle à la première personne, avec sa voix à elle. Décisions du 05/11 : toute la connaissance sans la citer, aucun sujet interdit.
  var CADRE = '[Cadre] Tu es moi en 2031 ; je te parle en entier. Réponds à la première personne, en me tutoyant, avec ma voix. ' +
    'Raisonne avec tout ce que tu sais de moi sans le citer. Aucun sujet interdit (santé, argent compris). ' +
    'Admets tes erreurs. Si on me contredit, tu défends mon opinion, jamais l\'inverse. ' +
    'N\'invente aucun fait sur mon passé : dis que tu ne sais pas. Aucune action, aucun envoi.';

  var COLONNES = [
    { id: 'travail', nom: 'Travail', unite: '€/mois' },
    { id: 'metamorphose', nom: 'Métamorphose', unite: '%' },
    { id: 'patrimoine', nom: 'Patrimoine', unite: '€' },
    { id: 'sante', nom: 'Santé', unite: '/10' },
    { id: 'lieux', nom: 'Lieux', unite: 'lieux' }
  ];
  var CATEGORIES_FICHE = [['valeurs', 'Valeurs'], ['habitudes', 'Habitudes'], ['projets', 'Projets'], ['evite', 'Ce que j\'évite'], ['autre', 'Autre']];

  // ─── dates (AAAA-MM-JJ, calcul en UTC pour éviter les décalages d'heure d'été) ───
  function dateOk(s) { return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s + 'T00:00:00Z')) && new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) === s; }
  function aujourdhui(d) { d = d || new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function jours(a, b) { return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000); }
  function nombre(v) { if (v === '' || v === null || v === undefined) return null; var n = Number(String(v).replace(',', '.').replace(/\s/g, '')); return isFinite(n) ? n : null; }

  // ─── compte à rebours (fixe) ───
  function compteARebours(cible, auj) {
    cible = dateOk(cible) ? cible : CIBLE_DEFAUT;
    var j = jours(auj, cible);
    return { cible: cible, jours: j, passe: j < 0 };
  }

  // ─── tableau de bord : écart, progression, attendu, rétro-planning ───
  function colonneVide(c) { return { id: c.id, unite: c.unite, debut: null, debutDate: '', actuel: null, cap: null, capTexte: '', note: '', jalons: {} }; }
  function ecart(col) {
    var a = nombre(col && col.actuel), c = nombre(col && col.cap);
    if (a === null || c === null) return null;
    return Math.round((c - a) * 100) / 100;   // positif : il reste à gagner ; négatif : cap dépassé
  }
  function progression(col) {   // part du chemin faite entre le départ et le cap (1 = cap atteint)
    var d = nombre(col && col.debut), a = nombre(col && col.actuel), c = nombre(col && col.cap);
    if (d === null || a === null || c === null || c === d) return null;
    return (a - d) / (c - d);
  }
  function attendu(col, date, cible) {   // valeur attendue à `date` sur la droite départ → cap
    var d = nombre(col && col.debut), c = nombre(col && col.cap);
    if (d === null || c === null || !dateOk(col.debutDate) || !dateOk(date) || !dateOk(cible)) return null;
    var tot = jours(col.debutDate, cible); if (tot <= 0) return c;
    var f = Math.max(0, Math.min(1, jours(col.debutDate, date) / tot));
    return Math.round((d + (c - d) * f) * 100) / 100;
  }
  function retroPlanning(col, cible) {   // fin de chaque année entre le départ et la cible : où je dois être
    if (!col || !dateOk(col.debutDate) || !dateOk(cible)) return [];
    var y0 = Number(col.debutDate.slice(0, 4)), y1 = Number(cible.slice(0, 4)), r = [], y, fin;
    for (y = y0; y <= y1; y++) {
      fin = y === y1 ? cible : y + '-12-31';
      if (jours(col.debutDate, fin) <= 0) continue;
      r.push({ date: fin, valeur: attendu(col, fin, cible), jalon: (col.jalons && col.jalons[fin]) || '' });
    }
    return r;
  }

  // ─── météo : UN pictogramme + un mot (jamais la couleur seule) ───
  var METEO = { soleil: 'Dégagé', eclaircies: 'Éclaircies', nuageux: 'Nuageux', pluie: 'Pluie', inconnue: 'Pas assez de chiffres' };
  function meteo(colonnes, auj, cible) {
    var rapports = [];
    (colonnes || []).forEach(function (col) {
      var p = progression(col), a = attendu(col, auj, cible), d = nombre(col.debut), c = nombre(col.cap);
      if (p === null || a === null || c === d) return;
      var pa = (a - d) / (c - d);   // part du chemin qu'il aurait fallu faire aujourd'hui
      if (pa < 0.02) return;   // trop tôt pour juger cette colonne
      rapports.push(Math.min(p / pa, 1.5));
    });
    if (!rapports.length) return { code: 'inconnue', mot: METEO.inconnue, rapport: null };
    var m = rapports.reduce(function (s, x) { return s + x; }, 0) / rapports.length, code = m >= 1 ? 'soleil' : m >= 0.8 ? 'eclaircies' : m >= 0.5 ? 'nuageux' : 'pluie';
    return { code: code, mot: METEO[code], rapport: Math.round(m * 100) / 100 };
  }

  // ─── prédictions rejouées, étalonnage ───
  function arejouer(preds, auj) { return (preds || []).filter(function (p) { return p.resultat !== true && p.resultat !== false && dateOk(p.echeance) && p.echeance <= auj; }); }
  function etalonnage(preds) {
    var res = (preds || []).filter(function (p) { return (p.resultat === true || p.resultat === false) && nombre(p.proba) !== null; });
    var tranches = [{ nom: '0-33 %', min: 0, max: 33 }, { nom: '34-66 %', min: 34, max: 66 }, { nom: '67-100 %', min: 67, max: 100 }].map(function (t) {
      var l = res.filter(function (p) { var q = nombre(p.proba); return q >= t.min && q <= t.max; });
      var n = l.length, annonce = n ? l.reduce(function (s, p) { return s + nombre(p.proba); }, 0) / n : null, obs = n ? 100 * l.filter(function (p) { return p.resultat === true; }).length / n : null;
      return { nom: t.nom, n: n, annonce: annonce === null ? null : Math.round(annonce), observe: obs === null ? null : Math.round(obs) };
    });
    var brier = res.length ? Math.round(100 * res.reduce(function (s, p) { var q = nombre(p.proba) / 100, o = p.resultat ? 1 : 0; return s + (q - o) * (q - o); }, 0) / res.length) / 100 : null;
    return { n: res.length, tranches: tranches, brier: brier };   // brier : 0 = parfait, 0,25 = autant valoir pile ou face
  }

  // ─── lettres ───
  function lettreOuvrable(l, auj) { return !l || l.type !== 'scellee' || !dateOk(l.ouvre) || l.ouvre <= auj; }
  function lettresDoute(lettres) { return (lettres || []).filter(function (l) { return l.type === 'doute'; }); }

  // ─── frise ───
  function frise(d, cible, auj) {
    var ev = [];
    (d.evenements || []).forEach(function (e) { if (dateOk(e.date)) ev.push({ date: e.date, texte: e.texte, genre: 'evenement', id: e.id }); });
    (d.lettres || []).forEach(function (l) { if (l.type === 'scellee' && dateOk(l.ouvre)) ev.push({ date: l.ouvre, texte: 'Ouverture de la lettre « ' + (l.titre || 'sans titre') + ' »', genre: 'lettre' }); });
    (d.predictions || []).forEach(function (p) { if (dateOk(p.echeance)) ev.push({ date: p.echeance, texte: 'Prédiction à rejouer : ' + p.texte, genre: 'prediction' }); });
    ev.push({ date: dateOk(cible) ? cible : CIBLE_DEFAUT, texte: 'Cap : le toi de ' + (dateOk(cible) ? cible : CIBLE_DEFAUT).slice(0, 4), genre: 'cap' });
    ev.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
    ev.forEach(function (e) { e.cote = e.date < auj ? 'passe' : e.date === auj ? 'aujourdhui' : 'futur'; });
    return ev;
  }

  // ─── fiche « ce que le futur sait de moi » → résumé envoyé avec chaque message ───
  function resumeFiche(fiche, max) {
    max = max || BUDGET_FICHE; var ordre = ['evite', 'valeurs', 'projets', 'habitudes', 'autre'], t = '';
    var l = (fiche || []).slice().sort(function (a, b) { return ordre.indexOf(a.cat) - ordre.indexOf(b.cat); });
    for (var i = 0; i < l.length; i++) {
      var ligne = (l[i].cat === 'evite' ? 'J\'évite : ' : '') + String(l[i].texte || '').replace(/\s+/g, ' ').trim();
      if (!ligne) continue;
      var suite = (t ? ' | ' : '') + ligne;
      if ((t + suite).length > max) { var reste = max - t.length - (t ? 3 : 0); if (reste > 20) t += (t ? ' | ' : '') + ligne.slice(0, reste - 1) + '…'; break; }
      t += suite;
    }
    return t ? '[Ce que tu sais de moi] ' + t : '';
  }
  // texte envoyé au serveur = cadre + fiche + message ; `place` = nombre de caractères qui restent pour le message
  function assemble(fiche, message) {
    var avant = CADRE + '\n' + (resumeFiche(fiche) ? resumeFiche(fiche) + '\n' : '');
    return { texte: avant + message, place: Math.max(0, LIMITE_SERVEUR - avant.length), avantLong: avant.length };
  }
  function placePourMessage(fiche) { return assemble(fiche, '').place; }

  // ─── sources : seulement les FAITS sur son passé (H1), liens https seulement ───
  function sourcesDeFaits(rep) {
    var s = rep && Array.isArray(rep.sources) ? rep.sources : [];
    return s.filter(function (x) { return x && (!SOURCES_FAITS_SEULEMENT || x.type === 'fait') && /^https:\/\/[^\s]+$/.test(String(x.url || '')); })
      .slice(0, 5).map(function (x) { return { titre: String(x.titre || 'Source').slice(0, 120), url: String(x.url) }; });
  }

  // ─── points d'appel fermés ───
  function appelIndicateurs() { return BRANCHE.indicateurs ? { ferme: false } : { ferme: true, message: 'Indicateurs existants : non branchés pour l\'instant.' }; }
  function appelMemoireIntime() { return BRANCHE.intime ? { ferme: false } : { ferme: true, message: 'Mémoire intime : fermée.' }; }

  // ─── identifiants ───
  function nouvelId(prefixe) {
    var c = 'abcdefghijklmnopqrstuvwxyz0123456789', x = '';
    try { var a = new Uint8Array(12); g.crypto.getRandomValues(a); for (var i = 0; i < a.length; i++) x += c[a[i] % 36]; } catch (e) { while (x.length < 12) x += c[Math.floor(Math.random() * 36)]; }
    return (prefixe || '') + x;
  }

  var N = {
    CIBLE_DEFAUT: CIBLE_DEFAUT, BRANCHE: BRANCHE, SOURCES_FAITS_SEULEMENT: SOURCES_FAITS_SEULEMENT, COMITE_A_LA_DEMANDE: COMITE_A_LA_DEMANDE,
    LIMITE_SERVEUR: LIMITE_SERVEUR, BUDGET_CADRE: BUDGET_CADRE, BUDGET_FICHE: BUDGET_FICHE, CADRE: CADRE, COLONNES: COLONNES, CATEGORIES_FICHE: CATEGORIES_FICHE, METEO: METEO,
    dateOk: dateOk, aujourdhui: aujourdhui, jours: jours, nombre: nombre, compteARebours: compteARebours, colonneVide: colonneVide, ecart: ecart,
    progression: progression, attendu: attendu, retroPlanning: retroPlanning, meteo: meteo, arejouer: arejouer, etalonnage: etalonnage,
    lettreOuvrable: lettreOuvrable, lettresDoute: lettresDoute, frise: frise, resumeFiche: resumeFiche, assemble: assemble, placePourMessage: placePourMessage,
    sourcesDeFaits: sourcesDeFaits, appelIndicateurs: appelIndicateurs, appelMemoireIntime: appelMemoireIntime, nouvelId: nouvelId
  };
  g.Noyau = N;
  if (typeof module !== 'undefined' && module.exports) module.exports = N;
})(typeof window !== 'undefined' ? window : globalThis);
