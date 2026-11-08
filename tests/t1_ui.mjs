// L'app vue du navigateur (téléphone, puis ordinateur) : conversation, lettres, tableau, frise, « Moi », sécurité, mise en page.
// Mêmes scénarios que ceux vérifiés dans la page le 05/11 (le Chrome de Playwright ne démarrait pas dans le bac à sable de la session).
import { fauxServeur, ouvrir, donnees, attendre, onglet, pause } from './outils.mjs';

const J = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const envoyer = async (page, t) => { await page.fill('#saisie', t); await page.click('#envoyer'); };
const reponse = page => page.waitForSelector('.bulle.futur:not(.attente)', { timeout: 4000 });
const dlgBouton = (page, re) => page.evaluate(r => { const b = [...document.querySelectorAll('#dlg button')].find(x => new RegExp(r).test(x.textContent)); b.click(); }, re);

export const tests = [
  { nom: 'Parler : le message part avec le cadre et la fiche, la réponse s\'affiche, tout reste sur l\'appareil', f: async ({ nav, st, profil, verif }) => {
    const S = fauxServeur(); const { page, ctx, erreurs, csp } = await ouvrir(nav, st, profil, S, { donnees: { fiche: [{ id: 'f1', cat: 'evite', texte: 'les comptes' }, { id: 'f2', cat: 'valeurs', texte: 'liberté' }] } });
    await envoyer(page, 'Je pense quitter mon poste.'); await reponse(page);
    const e = S.envois[0];
    verif(e.action === 'envoyer' && e.fil === 'futur' && /^[a-z0-9]{6,32}$/i.test(e.cid), 'corps : action, fil futur, cid', e);
    verif(e.texte.startsWith('[Cadre]') && e.texte.endsWith('Je pense quitter mon poste.') && e.texte.length <= 2000, 'cadre + message ≤ 2 000', e.texte.length);
    verif(/\[Ce que tu sais de moi\] J'évite : les comptes \| liberté/.test(e.texte), 'fiche résumée, « évite » d\'abord');
    verif(S.appels[0].cle === 'cle-de-test-123456' && S.appels[0].chemin === '/crochets/life', 'clé en en-tête, route /crochets/life');
    verif((await donnees(page)).conv.length === 2, 'conversation gardée sur l\'appareil');
    verif(erreurs.length === 0 && csp.length === 0, 'aucune erreur ni violation de la règle de sécurité', { erreurs, csp }); await ctx.close();
  } },
  { nom: 'Parler : réponse longue guettée sur le fil ; sans connexion, serveur coupé, clé refusée : messages clairs', f: async ({ nav, st, profil, verif }) => {
    const S = fauxServeur({ asynchrone: true }); let o = await ouvrir(nav, st, profil, S, { avantChargement: (c, p) => p.addInitScript(() => { window.__pauseGuet = 20; }) });
    await envoyer(o.page, 'long'); verif(await o.page.$('.bulle.attente'), 'indicateur « il réfléchit »'); await reponse(o.page);
    verif(S.appels.filter(a => a.corps.action === 'fil').length >= 2, 'a guetté le fil'); await o.ctx.close();
    const S2 = fauxServeur(); o = await ouvrir(nav, st, profil, S2, { sansConnexion: true }); await envoyer(o.page, 'salut'); await pause(200);
    verif(S2.appels.length === 0 && /Pas connecté/.test(await o.page.textContent('.bulle.systeme')), 'sans connexion : rien envoyé, message clair'); await o.ctx.close();
    const S3 = fauxServeur(); S3.coupe = true; o = await ouvrir(nav, st, profil, S3); await envoyer(o.page, 'a'); await o.page.waitForSelector('.bulle.systeme');
    verif(/ne répond pas/.test(await o.page.textContent('.bulle.systeme')), 'serveur coupé : message lisible'); await o.ctx.close();
    const S4 = fauxServeur(); S4.statut = 403; o = await ouvrir(nav, st, profil, S4); await envoyer(o.page, 'a'); await o.page.waitForSelector('.bulle.systeme');
    verif(/refuse la clé/.test(await o.page.textContent('.bulle.systeme')), 'clé refusée : message lisible'); await o.ctx.close();
  } },
  { nom: 'Parler : Avant de décider, erreurs, ce que j\'évite, Comité à la demande, sources de faits seulement, message trop long', f: async ({ nav, st, profil, verif }) => {
    const S = fauxServeur({ sources: [{ type: 'fait', titre: 'Contrat 2021', url: 'https://exemple.test/a' }, { type: 'analyse', titre: 'Mon analyse', url: 'https://exemple.test/b' }, { type: 'fait', titre: 'http', url: 'http://exemple.test/c' }] });
    const { page, ctx } = await ouvrir(nav, st, profil, S);
    await page.click('#avant-decider'); const ch = await page.$$('#dlg textarea'); await ch[0].fill('Accepter la mission à Lyon'); await ch[1].fill('Je préfère rester'); await dlgBouton(page, 'Demander'); await reponse(page);
    verif(/AVANT DE DÉCIDER\. Décision : Accepter la mission à Lyon Mon avis : Je préfère rester\./.test(S.envois[0].texte) && /4 courtes parties/.test(S.envois[0].texte), 'Avant de décider : décision, avis et consigne en 4 parties');
    const liens = await page.$$eval('.bulle.futur .sources a', l => l.map(a => [a.textContent, a.href, a.rel])); verif(liens.length === 1 && liens[0][0] === 'Contrat 2021' && /noopener/.test(liens[0][2]), 'seul le fait en https est cliquable (H1)', liens);
    await page.click('#erreurs'); await attendre(() => S.envois.length > 1); verif(/Admets-la/.test(S.envois[1].texte), 'Où t\'es-tu trompé ? : consigne d\'admettre');
    await attendre(async () => !(await page.$('.bulle.attente'))); await page.click('#evite'); await attendre(() => S.envois.length > 2); verif(/une seule question/.test(S.envois[2].texte), 'Ce que j\'évite : une seule question directe');
    await attendre(async () => !(await page.$('.bulle.attente'))); S.envois.length = 0; await page.click('#comite'); await dlgBouton(page, 'Demander'); await attendre(() => S.envois.length);
    verif(S.envois[0].fil === 'comite' && S.envois[0].mode === 'voix' && !S.envois[0].texte.startsWith('[Cadre]'), 'Comité : fil comite, mode voix, sans le cadre du moi du futur (H2)');
    await page.waitForSelector('.bulle[data-de="comite"]');
    const place = await page.$eval('#saisie', x => x.maxLength); verif(place > 800 && place < 2000, 'plafond du champ = place restante', place);
    await ctx.close();
  } },
  { nom: 'Lettres : scellée jusqu\'à une date, « en cas de doute », lettre du toi de 2021 reconstituée, choses à arrêter, notes', f: async ({ nav, st, profil, verif }) => {
    const S = fauxServeur(); const { page, ctx } = await ouvrir(nav, st, profil, S);
    await onglet(page, 'lettres'); await page.click('#nl-scellee'); const ch = await page.$$('#dlg input, #dlg textarea'); await ch[0].fill('Pour plus tard'); await ch[1].fill('Texte secret'); await ch[2].fill(J(10)); await dlgBouton(page, 'Garder'); await pause(80);
    verif((await donnees(page)).lettres[0].type === 'scellee', 'lettre scellée gardée'); verif(/Scellée jusqu'au/.test(await page.textContent('#liste-lettres')), 'liste : scellée jusqu\'au…');
    await page.click('#liste-lettres button'); verif(!(await page.$eval('#dlg', d => d.open)), 'scellée : ne s\'ouvre pas');
    await page.evaluate(j => { D.lettres[0].ouvre = j; aller('lettres'); }, J(-1)); await page.click('#liste-lettres button'); verif((await page.textContent('#dlg')).includes('Texte secret'), 'date passée : elle s\'ouvre'); await page.evaluate(() => $('dlg').close());
    await page.click('#nl-doute'); const c2 = await page.$$('#dlg input, #dlg textarea'); await c2[1].fill('Tu as déjà tenu bon.'); await dlgBouton(page, 'Garder'); await onglet(page, 'parler'); await page.click('#doute');
    verif((await page.textContent('#dlg')).includes('Tu as déjà tenu bon.'), 'J\'ai un doute → rouvre la lettre'); await page.evaluate(() => $('dlg').close());
    await onglet(page, 'lettres'); await page.click('#lettre-2021'); await attendre(async () => (await donnees(page)).lettres.some(l => l.type === 'reconstituee'));
    verif(S.liens[0].type === 'futur' && S.liens[0].futur.horizon === -5 && S.liens[0].futur.scenario === 'passe', 'appel app-lien : horizon -5, scénario passé'); verif(S.appels.some(a => a.chemin === '/crochets/app-lien'), 'route app-lien');
    await page.fill('#arreter input:not([type="checkbox"])', 'Dire oui trop vite'); await page.click('#ajout-arreter'); await page.click('#arreter input[type="checkbox"]'); verif((await donnees(page)).arreter[0].arrete === J(0), 'chose à arrêter cochée aujourd\'hui');
    await ctx.close();
  } },
  { nom: 'Tableau : cinq colonnes, écart chiffré, rétro-planning, météo, prédictions rejouées et étalonnage, indicateurs fermés', f: async ({ nav, st, profil, verif }) => {
    const S = fauxServeur(); const { page, ctx } = await ouvrir(nav, st, profil, S, { donnees: { colonnes: [{ id: 'patrimoine', debut: 100000, debutDate: J(-365), actuel: 130000, cap: 300000 }],
      reglages: { cible: J(365 * 4), voix: false }, predictions: [{ id: 'p1', texte: 'Je change de poste', proba: 80, echeance: J(-5), cree: J(-100), resultat: null }] } });
    await onglet(page, 'tableau'); verif(JSON.stringify(await page.$$eval('.carte h3', l => l.map(x => x.textContent))) === JSON.stringify(['Travail', 'Métamorphose', 'Patrimoine', 'Santé', 'Lieux']), 'cinq colonnes dans l\'ordre');
    verif(/il reste 170/.test((await page.textContent('[data-col="patrimoine"] .ecart')).replace(/[\s  ]/g, ' ').replace(/ /g, '')) || /170/.test(await page.textContent('[data-col="patrimoine"] .ecart')), 'écart chiffré');
    verif((await page.$$('[data-col="patrimoine"] .retro tbody tr')).length >= 4, 'rétro-planning'); await page.fill('[data-col="patrimoine"] [data-champ="actuel"]', '320000'); await page.dispatchEvent('[data-col="patrimoine"] [data-champ="actuel"]', 'change');
    verif(/Cap dépassé/.test(await page.textContent('[data-col="patrimoine"] .ecart')), 'saisie → écart recalculé');
    verif(['soleil', 'eclaircies', 'nuageux', 'pluie', 'inconnue'].includes(await page.getAttribute('#meteo', 'data-meteo')) && await page.$('#meteo svg'), 'météo : un pictogramme');
    verif((await page.$$('#a-rejouer li')).length === 1, 'prédiction échue à rejouer'); await page.click('#a-rejouer [data-res="oui"]'); verif(/1 prédiction\(s\) jouée\(s\)/.test(await page.textContent('#etalonnage caption')) && /0,04/.test(await page.textContent('#etalonnage caption')), 'étalonnage et score de Brier');
    verif(/non branchés/.test(await page.textContent('#etat-ind')) && !S.appels.length, 'indicateurs existants : fermés, aucun appel réseau'); await ctx.close();
  } },
  { nom: 'Frise, « Moi » : passé → aujourd\'hui → futur, compte à rebours fixe, fiche modifiable, QR d\'installation, effacement confirmé', f: async ({ nav, st, profil, verif }) => {
    const S = fauxServeur(); const { page, ctx } = await ouvrir(nav, st, profil, S, { dateFixe: '2026-11-05' });
    await onglet(page, 'frise'); const f = await page.$$('#vue .champ input'); await f[0].fill('2025-03-01'); await f[1].fill('Départ du cabinet'); await page.click('#ajout-evt');
    const cotes = await page.$$eval('#frise li', l => l.map(x => x.dataset.cote)); verif(cotes[0] === 'passe' && cotes.includes('aujourdhui') && cotes[cotes.length - 1] === 'futur', 'frise : passé, aujourd\'hui, futur', cotes);
    await onglet(page, 'moi'); verif(/1[\s  ]826 jours/.test(await page.textContent('#rebours')), 'compte à rebours vers la date fixe');
    await page.selectOption('#nc', 'valeurs'); await page.fill('#fiche .champ input', 'Je veux être libre'); await page.click('#ajout-fiche'); verif((await donnees(page)).fiche[0].texte === 'Je veux être libre', 'fiche : ligne ajoutée');
    verif(await page.$('.cx .cx-titre'), 'écran Connexion commun monté'); await page.click('#qr-installer'); await page.waitForSelector('#zone-qr img.cx-qr', { timeout: 4000 });
    verif(/^data:image\//.test(await page.$eval('#zone-qr img', i => i.src)), 'QR d\'installation fabriqué sur l\'appareil');
    await page.click('#effacer'); verif(await page.$eval('#effacer-ok', b => b.disabled), 'effacer : désactivé'); await page.fill('#dlg input', 'EFFACER'); verif(!(await page.$eval('#effacer-ok', b => b.disabled)), 'effacer : activé après EFFACER'); await page.click('#effacer-ok');
    verif((await donnees(page)) === null || (await donnees(page)).fiche.length === 0, 'appareil effacé'); await ctx.close();
  } },
  { nom: 'Mise en page et sécurité : pas de défilement horizontal, cibles ≥ 44 px, onglets en bas (téléphone) ou à gauche (ordinateur), seulement le serveur enregistré', f: async ({ nav, st, profil, tel, verif }) => {
    const S = fauxServeur(); const { page, ctx, erreurs, csp } = await ouvrir(nav, st, profil, S);
    for (const o of ['parler', 'lettres', 'tableau', 'frise', 'moi']) {
      await onglet(page, o); const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
      verif(m.sw <= m.cw, 'onglet ' + o + ' : pas de défilement horizontal', m);
    }
    const nav2 = await page.$eval('#onglets', n => { const r = n.getBoundingClientRect(); return { bas: r.top > innerHeight / 2, gauche: r.left < 5 && r.width < innerWidth / 3 }; });
    verif(tel ? nav2.bas : nav2.gauche, tel ? 'téléphone : onglets en bas' : 'ordinateur : onglets à gauche', nav2);
    const petits = await page.$$eval('#onglets button, header button, #vue button.puce', l => l.filter(b => { const r = b.getBoundingClientRect(); return (r.height < 40 || r.width < 40) && r.width > 0; }).map(b => b.id || b.textContent));
    verif(petits.length === 0, 'cibles tactiles assez grandes', petits);
    const sansNom = await page.$$eval('button, input, select, textarea', l => l.filter(e => !(e.getAttribute('aria-label') || e.labels && e.labels.length || e.textContent.trim() || e.getAttribute('title'))).map(e => e.outerHTML.slice(0, 80)));
    verif(sansNom.length === 0, 'tout bouton et champ a un nom', sansNom);
    const meta = await page.$$eval('meta[http-equiv="Content-Security-Policy"]', l => l.map(x => x.content)); verif(meta.length === 2 && /connect-src 'self' https:\/\/essai\.exemple\.cloud$/.test(meta[1]), 'règle resserrée au seul serveur enregistré', meta);
    verif(erreurs.length === 0 && csp.length === 0, 'aucune erreur ni violation', { erreurs, csp }); await ctx.close();
  } }
];
