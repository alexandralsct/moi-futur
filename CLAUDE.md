# Pour Claude : dépôt PUBLIC, code seulement

« Moi dans 5 ans » est une page statique installable (GitHub Pages) : une conversation avec un moi du futur, des lettres,
un tableau de bord et une frise. Ce dépôt ne contient que le code : `index.html`, `app.js`, `noyau.js`, `app.css`,
`connexion.js`/`connexion.css`, `qr.js`, `sw.js`, manifeste, icônes abstraites, polices `fonts/` (OFL), `tests/`.

Interdit ici, même temporairement : données, textes de conversations ou de lettres, noms de personnes (prénom compris),
comptes, adresses de serveur ou de webhook, adresses e-mail, captures d'écran, clés ou jetons. L'adresse du serveur et la
clé se saisissent sur l'appareil (écran « Moi » → Connexion) et restent sur l'appareil ; elles ne sont jamais écrites dans
le code. Les données de la personne (fiche, lettres, tableau) restent dans le stockage local de l'appareil.

Règles de code : aucun script en ligne, Trusted Types, tout texte reçu affiché avec `textContent` (jamais `innerHTML`),
la règle de sécurité (CSP) de la page est resserrée au lancement sur le serveur enregistré. La version de `app.js`
(`VERSION`) et celle du cache de `sw.js` (`CACHE`, préfixe `futur-`) vont toujours ensemble ; les empreintes de la
coquille inscrites dans `sw.js` se recalculent avec `node tests/empreintes.mjs`.

Contrôle : `tests/garde-fou.sh` (liste de fichiers autorisés, secrets, adresses, mots privés fournis hors du dépôt par le
secret `MOTS_INTERDITS`). Il tourne à chaque envoi (onglet Actions) ; s'il refuse, on corrige, on ne le contourne pas.

La source de travail est dans un dépôt privé ; elle est recopiée ici telle quelle, par un script lancé par la propriétaire.
Aucune écriture dans l'historique n'est faite sans son accord.
