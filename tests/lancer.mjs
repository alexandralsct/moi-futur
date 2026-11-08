// Suite de tests de « Moi dans 5 ans » — lance chaque test pour l'APP TÉLÉPHONE puis pour l'APP ORDINATEUR, séparément.
//   node tests/lancer.mjs            tout
//   node tests/lancer.mjs envoi      seulement les fichiers dont le nom contient « envoi »
// Voir tests/outils.mjs pour les variables d'environnement (PLAYWRIGHT, CHROMIUM, LIFE_SERVEUR_JS).
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
import { navigateur, serveurStatique, TEL, ORDI, suite } from './outils.mjs';

const ici = path.dirname(fileURLToPath(import.meta.url));
const filtre = process.argv[2] || '';
const fichiers = fs.readdirSync(ici).filter(f => /^t\d.*\.mjs$/.test(f) && f.includes(filtre)).sort();
const tests = [];
for (const f of fichiers) for (const t of (await import(path.join(ici, f))).tests) tests.push({ ...t, fichier: f });
const SANS_NAV = !!process.env.SANS_NAVIGATEUR;   // SANS_NAVIGATEUR=1 : seulement les tests du noyau (sansNavigateur: true), aucun navigateur lancé
const st = SANS_NAV ? null : await serveurStatique(); const nav = SANS_NAV ? null : await navigateur();
let ko = 0, n = 0;
for (const profil of SANS_NAV ? [{ nom: 'Noyau (sans navigateur)' }] : [TEL, ORDI]) {
  console.log('\n=== ' + profil.nom + ' ===');
  for (const t of tests) {
    if (t.profils && !t.profils.includes(profil.nom === TEL.nom ? 'tel' : 'ordi')) continue;
    if (SANS_NAV ? !t.sansNavigateur : t.sansNavigateur && profil !== TEL) continue;   // un test du noyau ne se rejoue pas par profil
    const { verif, R } = suite(); n++;
    const t0 = Date.now();
    try { await t.f({ nav, st, profil, tel: profil === TEL, verif }); console.log('  ✓ ' + t.nom + ' (' + R.length + ' vérif., ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s)'); }
    catch (e) { ko++; console.log('  ✗ ' + t.nom + ' [' + t.fichier + '] : ' + String(e && e.message || e).slice(0, 600)); }
  }
}
if (nav) await nav.close(); if (st) st.http.close();
console.log('\n' + (n - ko) + '/' + n + ' tests réussis' + (ko ? ' — ' + ko + ' ÉCHEC(S)' : ''));
process.exit(ko ? 1 : 0);
