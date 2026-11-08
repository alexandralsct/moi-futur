// Le noyau (noyau.js) : calculs purs et règles de la propriétaire. Aucun navigateur : « SANS_NAVIGATEUR=1 node tests/lancer.mjs t0 ».
import { createRequire } from 'node:module'; import fs from 'node:fs'; import path from 'node:path';
import { RACINE } from './outils.mjs';
const N = createRequire(import.meta.url)('../noyau.js');
const PRENOM = new RegExp(['Alex', 'andra'].join(''), 'i');   // jamais écrit en clair : le dépôt public ne contient pas le prénom
const col = (o) => Object.assign(N.colonneVide({ id: 'x', unite: 'u' }), o);

export const tests = [
  { nom: 'Noyau : compte à rebours vers une date FIXE (il ne se rapproche pas d\'un horizon qui glisse)', sansNavigateur: true, f: async ({ verif }) => {
    const a = N.compteARebours('2031-11-05', '2026-11-05'), b = N.compteARebours('2031-11-05', '2026-11-06');
    verif(a.jours === 1826 && b.jours === 1825 && a.cible === b.cible, 'jours décroissants, cible inchangée', [a, b]);
    verif(N.compteARebours('pas une date', '2026-11-05').cible === N.CIBLE_DEFAUT, 'date invalide : cible par défaut');
    verif(N.compteARebours('2031-11-05', '2032-01-01').passe === true, 'cible passée signalée');
    verif(N.CIBLE_DEFAUT === '2031-11-05', 'H5 : date cible par défaut');
  } },
  { nom: 'Noyau : écart, progression, valeur attendue, rétro-planning (chiffres exacts)', sansNavigateur: true, f: async ({ verif }) => {
    const c = col({ debut: 100, debutDate: '2026-01-01', actuel: 130, cap: 300 });
    verif(N.ecart(c) === 170, 'écart = cap − actuel', N.ecart(c)); verif(Math.abs(N.progression(c) - 0.15) < 1e-9, 'progression 15 %', N.progression(c));
    verif(N.ecart(col({ actuel: 5, cap: 3 })) === -2, 'cap dépassé : écart négatif'); verif(N.ecart(col({ actuel: 5 })) === null && N.progression(col({ debut: 1, cap: 1, actuel: 1 })) === null, 'données manquantes : null, jamais 0');
    verif(N.attendu(c, '2026-01-01', '2031-01-01') === 100 && N.attendu(c, '2031-01-01', '2031-01-01') === 300 && N.attendu(c, '2040-01-01', '2031-01-01') === 300, 'valeur attendue : départ, cap, au-delà bornée');
    const r = N.retroPlanning(c, '2031-01-01'); verif(r.length === 6 && r[0].date === '2026-12-31' && r[r.length - 1].date === '2031-01-01' && r[r.length - 1].valeur === 300, 'rétro-planning : une ligne par fin d\'année, jusqu\'au cap', r);
    verif(r.every((x, i) => i === 0 || x.valeur > r[i - 1].valeur), 'valeurs croissantes sur la droite');
    verif(N.nombre('1 234,5') === 1234.5 && N.nombre('') === null && N.nombre('abc') === null, 'nombre : virgule française, vide et texte → null');
  } },
  { nom: 'Noyau : météo en un pictogramme (soleil, éclaircies, nuageux, pluie, inconnue)', sansNavigateur: true, f: async ({ verif }) => {
    const m = (actuel) => N.meteo([col({ debut: 0, debutDate: '2026-01-01', actuel, cap: 100 })], '2028-07-02', '2031-01-01').code;   // ~50 % du temps écoulé
    verif(m(60) === 'soleil' && m(45) === 'eclaircies' && m(30) === 'nuageux' && m(10) === 'pluie', 'quatre états', [m(60), m(45), m(30), m(10)]);
    verif(N.meteo([], '2028-07-02', '2031-01-01').code === 'inconnue' && N.meteo([col({})], '2028-07-02', '2031-01-01').mot === 'Pas assez de chiffres', 'sans chiffres : « inconnue », jamais un beau temps inventé');
    verif(N.meteo([col({ debut: 0, debutDate: '2026-11-04', actuel: 0, cap: 100 })], '2026-11-05', '2031-11-05').code === 'inconnue', 'trop tôt pour juger');
    verif(Object.values(N.METEO).every(x => x.length > 3), 'chaque pictogramme a un mot (jamais la couleur seule)');
  } },
  { nom: 'Noyau : prédictions rejouées, étalonnage et score de Brier', sansNavigateur: true, f: async ({ verif }) => {
    const P = [{ proba: 80, resultat: true, echeance: '2026-01-01' }, { proba: 80, resultat: false, echeance: '2026-01-01' }, { proba: 20, resultat: false, echeance: '2026-01-01' }, { proba: 50, resultat: null, echeance: '2026-02-01' }, { proba: 60, resultat: null, echeance: '2027-02-01' }];
    verif(N.arejouer(P, '2026-06-01').length === 1 && N.arejouer(P, '2026-06-01')[0].proba === 50, 'à rejouer : échues et sans verdict seulement');
    const e = N.etalonnage(P); verif(e.n === 3 && e.tranches[2].n === 2 && e.tranches[2].annonce === 80 && e.tranches[2].observe === 50 && e.tranches[0].observe === 0, 'tranches annoncé / observé', e);
    verif(e.brier === 0.24, 'Brier = moyenne des (p − o)² : (0,04 + 0,64 + 0,04) / 3', e.brier); verif(N.etalonnage([]).brier === null, 'rien de rejoué : pas de score');
  } },
  { nom: 'Noyau : cadre du moi du futur (H3), fiche résumée et budget des 2 000 caractères du serveur', sansNavigateur: true, f: async ({ verif }) => {
    verif(N.CADRE.length <= N.BUDGET_CADRE, 'cadre ≤ ' + N.BUDGET_CADRE + ' caractères', N.CADRE.length);
    for (const [re, quoi] of [[/première personne/, 'première personne (H3)'], [/sans le citer/, 'sans citer la connaissance'], [/Aucun sujet interdit/, 'aucun sujet interdit'], [/Admets tes erreurs/, 'admet ses erreurs (I52)'], [/défends mon opinion, jamais l'inverse/, 'défend l\'opinion de la propriétaire'], [/N'invente aucun fait/, 'aucun fait inventé sur le passé'], [/Aucune action, aucun envoi/, 'aucune action']]) verif(re.test(N.CADRE), quoi);
    verif(!PRENOM.test(N.CADRE) && !/@|https?:/.test(N.CADRE), 'ni prénom, ni adresse dans le code public');
    const longue = Array.from({ length: 30 }, (_, i) => ({ id: 'f' + i, cat: i % 2 ? 'valeurs' : 'evite', texte: 'ligne numéro ' + i + ' assez longue pour remplir le budget de la fiche' }));
    const r = N.resumeFiche(longue); verif(r.length <= N.BUDGET_FICHE + 30 && r.startsWith('[Ce que tu sais de moi] J\'évite :'), 'résumé borné, « évite » d\'abord', r.length);
    const a = N.assemble(longue, 'm'.repeat(10)); verif(a.texte.length <= N.LIMITE_SERVEUR && a.place + a.avantLong === N.LIMITE_SERVEUR, 'cadre + fiche + message ≤ 2 000', [a.texte.length, a.place]);
    verif(N.resumeFiche([]) === '' && N.placePourMessage([]) === N.LIMITE_SERVEUR - N.CADRE.length - 1, 'sans fiche : seulement le cadre');
  } },
  { nom: 'Noyau : sources = FAITS seulement (H1), liens https seulement ; Comité à la demande (H2)', sansNavigateur: true, f: async ({ verif }) => {
    const s = N.sourcesDeFaits({ sources: [{ type: 'fait', titre: 'A', url: 'https://x.test/a' }, { type: 'analyse', titre: 'B', url: 'https://x.test/b' }, { type: 'fait', url: 'http://x.test/c' }, { type: 'fait', url: 'javascript:alert(1)' }, { titre: 'sans type', url: 'https://x.test/d' }] });
    verif(s.length === 1 && s[0].titre === 'A', 'une seule source : le fait en https', s); verif(N.sourcesDeFaits({}).length === 0 && N.sourcesDeFaits(null).length === 0, 'sans champ sources : rien');
    verif(N.SOURCES_FAITS_SEULEMENT === true && N.COMITE_A_LA_DEMANDE === true, 'H1 et H2 : constantes explicites, faciles à changer');
  } },
  { nom: 'Noyau : points d\'appel fermés (indicateurs existants, mémoire intime) ; frise ; lettres scellées', sansNavigateur: true, f: async ({ verif }) => {
    verif(N.BRANCHE.intime === false && N.appelMemoireIntime().ferme === true && /fermée/.test(N.appelMemoireIntime().message), 'mémoire intime : fermée tant que l\'exception n\'existe pas');
    verif(N.BRANCHE.indicateurs === false && N.appelIndicateurs().ferme === true, 'indicateurs existants : fermés');
    verif(N.lettreOuvrable({ type: 'scellee', ouvre: '2027-01-01' }, '2026-12-31') === false && N.lettreOuvrable({ type: 'scellee', ouvre: '2027-01-01' }, '2027-01-01') === true && N.lettreOuvrable({ type: 'libre' }, '2020-01-01') === true, 'sceau : jusqu\'à la date, jamais pour une lettre libre');
    const f = N.frise({ evenements: [{ id: 'e', date: '2021-05-01', texte: 'passé' }], lettres: [{ type: 'scellee', ouvre: '2028-01-01', titre: 'T' }], predictions: [{ echeance: '2027-02-02', texte: 'P' }] }, '2031-11-05', '2026-11-05');
    verif(f.map(x => x.cote).join() === 'passe,futur,futur,futur' && f[f.length - 1].genre === 'cap' && f[0].date < f[1].date, 'frise triée, passé puis futur, cap en dernier', f.map(x => x.date + x.cote));
    verif(N.dateOk('2026-02-29') === false && N.dateOk('2028-02-29') === true && N.dateOk('2026-13-01') === false, 'dates : jours et mois réels');
  } },
  { nom: 'Code public : aucun prénom, aucune adresse de serveur, aucune clé, aucun innerHTML, aucun script en ligne', sansNavigateur: true, f: async ({ verif }) => {
    const lire = f => fs.readFileSync(path.join(RACINE, f), 'utf8');
    for (const f of ['app.js', 'noyau.js', 'index.html', 'app.css', 'sw.js', 'manifest.webmanifest']) {
      const t = lire(f);
      verif(!PRENOM.test(t), f + ' : pas de prénom'); verif(!/@[a-z0-9.-]+\.(fr|com|net|org|io)\b/i.test(t), f + ' : pas d\'adresse e-mail');
      verif(!/sk-ant-|ghp_|github_pat_|AIza|-----BEGIN|webhook/i.test(t), f + ' : pas de clé ni d\'adresse de webhook');
      verif(!/https?:\/\/(?!www\.w3\.org)[a-z0-9.-]+/i.test(t.replace(/'https:\/\/'|"https:\/\/"|https:\/\/\[\^\\s\]\+|'https:\/\/' \+|https:\/\/essai/g, '')) || f === 'index.html', f + ' : aucune adresse réseau en dur', (t.match(/https?:\/\/[a-z0-9.-]+/gi) || []).slice(0, 5));
    }
    verif(!/innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(|new Function/.test((lire('app.js') + lire('noyau.js')).replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')), 'aucun HTML injecté, aucun eval');
    const idx = lire('index.html'); verif(!/<script(?![^>]*\ssrc=)[^>]*>/i.test(idx) && !/\son[a-z]+\s*=/i.test(idx) && !/style=/i.test(idx), 'index.html : aucun script ni style en ligne');
    verif(/require-trusted-types-for 'script'/.test(idx) && /default-src 'none'/.test(idx) && /connect-src 'self' https:/.test(idx), 'règle de sécurité de la page : Trusted Types, tout fermé par défaut');
    verif(lire('app.js').match(/const VERSION = '(V[.0-9]+)'/)[1] === lire('sw.js').match(/const CACHE = 'futur-(V[.0-9]+)'/)[1], 'version de app.js = cache de sw.js');
    verif(!/fetch\([^)]*(carte|github)/i.test(lire('app.js')), 'aucun appel d\'écriture vers la carte (H4)');
  } }
];
