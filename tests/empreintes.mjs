// Recalcule les empreintes SHA-256 de la coquille de l'app inscrites dans sw.js (audit de sécurité LC3 : une copie
// gardée n'est servie que si elle est intacte). À lancer après chaque modification d'un fichier de la coquille :
//   node tests/empreintes.mjs          (écrit sw.js)
//   node tests/empreintes.mjs --verifier   (ne fait que vérifier ; code 1 si une empreinte est fausse)
// Le garde-fou (tests/garde-fou.sh) fait la même vérification avant chaque commit.
import fs from 'node:fs'; import path from 'node:path'; import crypto from 'node:crypto'; import { fileURLToPath } from 'node:url';
const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sw = fs.readFileSync(path.join(racine, 'sw.js'), 'utf8');
const coquille = JSON.parse(sw.match(/const COQUILLE = (\[[\s\S]*?\]);/)[1].replace(/'/g, '"')).filter(f => f !== './');
const lignes = coquille.map(f => "  '" + f + "': '" + crypto.createHash('sha256').update(fs.readFileSync(path.join(racine, f))).digest('hex') + "'");
const bloc = 'const EMPREINTES = {\n' + lignes.join(',\n') + '\n};';
const neuf = sw.replace(/const EMPREINTES = \{[\s\S]*?\};/, bloc);
if (process.argv.includes('--verifier')) {
  if (neuf !== sw) { console.error('sw.js : empreintes de la coquille à recalculer (node tests/empreintes.mjs)'); process.exit(1); }
  console.log('sw.js : ' + lignes.length + ' empreintes justes');
} else { fs.writeFileSync(path.join(racine, 'sw.js'), neuf); console.log('sw.js : ' + lignes.length + ' empreintes écrites'); }
