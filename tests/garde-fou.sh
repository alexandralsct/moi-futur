#!/usr/bin/env bash
# Garde-fou du dépôt public : seulement du code. Utilisé par le contrôle GitHub (garde-fou.yml) et par le hook local .githooks/pre-commit.
#   tests/garde-fou.sh               contenu indexé (fichiers suivis / prêts à être commités)
#   tests/garde-fou.sh --historique  tout l'historique (git log -p), commits et messages
# Liste des mots privés : variable MOTS (mots séparés par |) ou fichier MOTS_FICHIER (un mot par ligne, # pour un commentaire).
# Sans liste, le contrôle échoue : il ne passe jamais « en silence ». Seuls les fichiers ou commits fautifs sont nommés, jamais les mots.
# Recherche (audit de sécurité H3, 13/10) : en mot entier ET en sous-chaîne (un mot collé à d'autres lettres, ou écrit
# dans un motif, est trouvé aussi). Exceptions facultatives, hors du dépôt public : EXCEPTIONS (expressions de mots entiers
# autorisés, séparées par |) ou EXCEPTIONS_FICHIER. L'empreinte SHA-256 de la liste utilisée est imprimée : comparer celle
# du contrôle GitHub (secret) à celle du fichier local montre si les deux listes sont les mêmes.
# HISTO_CONNUS : commits déjà signalés (empreintes séparées par des espaces), antérieurs au garde-fou ; l'historique public
# ne se réécrit qu'avec l'accord de la propriétaire.
set -uo pipefail
cd "$(git rev-parse --show-toplevel)" || exit 1
MOTS=${MOTS:-}
if [ -z "$MOTS" ] && [ -n "${MOTS_FICHIER:-}" ] && [ -f "$MOTS_FICHIER" ]; then
  MOTS=$(grep -v '^\s*#' "$MOTS_FICHIER" | sed '/^\s*$/d' | paste -sd'|' -)
fi
if [ -z "$MOTS" ]; then echo "::error::Liste des mots privés absente (secret MOTS_INTERDITS, ou MOTS_FICHIER en local) : contrôle impossible."; exit 1; fi
EXCEPTIONS=${EXCEPTIONS:-}
if [ -z "$EXCEPTIONS" ] && [ -n "${EXCEPTIONS_FICHIER:-}" ] && [ -f "$EXCEPTIONS_FICHIER" ]; then
  EXCEPTIONS=$(grep -v '^\s*#' "$EXCEPTIONS_FICHIER" | sed '/^\s*$/d' | paste -sd'|' -)
fi
liste_norm=$(printf '%s' "$MOTS" | tr '|' '\n' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//' | sed '/^$/d' | tr '[:upper:]' '[:lower:]' | LC_ALL=C sort -u)
echo "Liste des mots : $(printf '%s\n' "$liste_norm" | wc -l | tr -d ' ') mots, empreinte sha256 $(printf '%s\n' "$liste_norm" | sha256sum | cut -c1-16)"
# sous-chaînes : chaque « mot » (lettres, chiffres, _ et -) qui CONTIENT un mot de la liste, moins les exceptions
sous_chaines() { grep -oiE -- "[[:alnum:]_-]*($MOTS)[[:alnum:]_-]*" | { if [ -n "$EXCEPTIONS" ]; then grep -viwE -- "^($EXCEPTIONS)$"; else cat; fi; } | head -1; }
OK=${GF_OK:-'^(\.nojekyll|\.github/workflows/[^/]+\.yml|CLAUDE\.md|README\.md|index\.html|sw\.js|noyau\.js|manifest\.webmanifest|icon\.svg|icon-(192|512|maskable-512)\.png|qr\.js|connexion\.(js|css)|app\.js|app\.css|fonts/[a-z0-9-]+\.woff2|fonts/OFL-[A-Za-z]+\.txt|tests/[^/]+\.sh|tests/[^/]+\.mjs)$'}
SECRETS='sk-ant-[A-Za-z0-9_-]{10,}|ghp_[A-Za-z0-9]{20,}|gh[ousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{20,}|AIza[0-9A-Za-z_-]{30,}|xox[abp]-[A-Za-z0-9-]{10,}|-----BEGIN [A-Z ]*PRIVATE KEY'
EMAIL='[A-Z0-9._%+-]+@[A-Z0-9.-]+\.(fr|com|net|org|archi|io)\b'
ko=0; err(){ echo "::error::$1"; ko=1; }

if [ "${1:-}" = "--historique" ]; then
  connus=" ${HISTO_CONNUS:-} "
  # lignes ajoutées de chaque commit, étiquetées « commit fichier » ; on n'affiche que l'étiquette
  git log -p --all --no-color --format='@@commit %H' | awk '/^@@commit /{c=$2; next} /^\+\+\+ /{f=substr($0,7); next} /^\+/{print c" "f"\t"substr($0,2)}' > "${TMPDIR:-/tmp}/gf-hist.$$"
  git log --all --format='%H message%x09%s %b%x00' | tr '\n' ' ' | tr '\0' '\n' >> "${TMPDIR:-/tmp}/gf-hist.$$"
  # auteurs et validateurs de chaque commit (adresse et nom) : une adresse personnelle ne doit pas être publiée
  git log --all --format='%H auteurs%x09%ae %ce %an %cn' >> "${TMPDIR:-/tmp}/gf-hist.$$"
  filtre_connus() { while read -r c f; do case "$connus" in *" ${c:0:7}"*) ;; *) echo "$c $f";; esac; done; }
  for quoi in secrets mots sous-chaines e-mails; do
    case $quoi in
      secrets) trouve=$(grep -E -- "$SECRETS" "${TMPDIR:-/tmp}/gf-hist.$$" | cut -f1 | sort -u | filtre_connus) ;;
      mots) trouve=$(grep -iwE -- "$MOTS" "${TMPDIR:-/tmp}/gf-hist.$$" | cut -f1 | sort -u | filtre_connus); entiers=$trouve ;;
      sous-chaines) trouve=$(while IFS=$'\t' read -r e l; do [ -n "$(printf '%s' "$l" | sous_chaines)" ] && echo "$e"; done < <(grep -iE -- "$MOTS" "${TMPDIR:-/tmp}/gf-hist.$$") | sort -u | filtre_connus | grep -vxF -- "${entiers:-@@aucun@@}") ;;
      e-mails) trouve=$(while IFS=$'\t' read -r e l; do printf '%s\n' "$l" | grep -oiE -- "$EMAIL" | grep -viE 'noreply|@(example|exemple)\.' | grep -q . && echo "$e"; done < <(grep -iE -- "$EMAIL" "${TMPDIR:-/tmp}/gf-hist.$$") | sort -u | filtre_connus) ;;
    esac
    if [ -n "$trouve" ]; then err "Historique : $quoi trouvé(s) dans :"; echo "$trouve"; fi
  done
  # fichiers jamais autorisés ajoutés un jour (images retirées depuis, notes…) : ils restent lisibles dans l'historique
  ajoutes=$(git log --all --diff-filter=A --name-only --format='@@%H' | awk '/^@@/{c=substr($0,3); next} NF{print c" "$0}' | while read -r c f; do
    echo "$f" | grep -qE "$OK" || echo "$c $f"; done | filtre_connus)
  [ -n "$ajoutes" ] && { err "Historique : fichiers non autorisés ajoutés par :"; echo "$ajoutes"; }
  rm -f "${TMPDIR:-/tmp}/gf-hist.$$"
  [ $ko = 0 ] && echo "Historique : rien à signaler."; exit $ko
fi

interdits=$(git ls-files | grep -Ev "$OK" || true)
[ -n "$interdits" ] && { err "Fichiers non autorisés dans le dépôt public :"; echo "$interdits"; }
# polices hébergées avec l'app (OFL, 13/10) : seuls ces fichiers-là, à l'octet près (empreintes SHA-256)
POLICES="6219bc4bfdfc5d9b2201dcdf046218b122a758f932e25ed5f168f929b7ca2311 2665f5fbbb334780fa135c7f1dc6e2459061a2d6d44c32b7c1fdbc34cde65ede c36f509c0a8f9f85f29cb44bc8701d8a9e0b14c499e77a884f789ead7093a7ac a76f53ca6612e7b3828eec2311098675b7f9849ae4169a8bcef6302aec02a6c0 ad4580d8cb4b5f627c2d18457656732f7f7b070f7837fbc380e08054157e6f6c 9e1455e6e9c5866f607e464fffb7855486dcf575b7e69b83a3d234e587fce41b"
for f in $(git ls-files 'fonts/*.woff2'); do
  h=$(git cat-file -p ":$f" 2>/dev/null | sha256sum | cut -d' ' -f1)
  case " $POLICES " in *" $h "*) ;; *) err "Police inconnue (empreinte non reconnue) : $f";; esac
done
s=$(git grep --cached -lIE -- "$SECRETS" || true)
[ -n "$s" ] && { err "Un secret (clé, jeton) semble présent dans :"; echo "$s"; }
e=$(git grep --cached -nIiE -- "$EMAIL" | grep -viE 'noreply|example\.|exemple\.' | cut -d: -f1,2 || true)
[ -n "$e" ] && { err "Adresse e-mail trouvée :"; echo "$e"; }
m=$(git grep --cached -lIiwE -- "$MOTS" || true)
[ -n "$m" ] && { err "Mot privé trouvé dans :"; echo "$m"; }
# en sous-chaîne aussi (mot collé à d'autres lettres, ou dans un motif d'expression régulière)
ms=$(for f in $(git grep --cached -lIiE -- "$MOTS" || true); do [ -n "$(git cat-file -p ":$f" | sous_chaines)" ] && echo "$f"; done)
[ -n "$ms" ] && { err "Mot privé trouvé (dans un mot plus long) dans :"; echo "$ms"; }
# auteur du prochain commit (nom et adresse configurés ici) : ni adresse personnelle, ni mot de la liste
auteur="$(git config user.email) $(git config user.name)"
if printf '%s' "$auteur" | grep -qiE -- "$EMAIL" && ! printf '%s' "$auteur" | grep -qiE 'noreply'; then err "Adresse e-mail personnelle comme auteur des commits (git config user.email) : utiliser l'adresse noreply de GitHub"; fi
printf '%s' "$auteur" | grep -qiE -- "$MOTS" && err "Le nom ou l'adresse de l'auteur des commits contient un mot de la liste"

# la version affichée (app.js) et celle du cache (sw.js) vont ensemble : sinon les appareils ne se mettent pas à jour
v=$(git show :app.js 2>/dev/null | grep -oE "const VERSION = 'V[.0-9]+'" | grep -oE "V[.0-9]+")
c=$(git show :sw.js 2>/dev/null | grep -oE "const CACHE = 'futur-V[.0-9]+'" | grep -oE "V[.0-9]+")
[ -n "$v" ] && [ "$v" != "$c" ] && err "Version de app.js ($v) différente de celle du cache de sw.js ($c)"
# empreintes de la coquille inscrites dans sw.js (une copie gardée n'est servie que si elle est intacte) : à jour ?
while read -r f h; do
  [ -z "$f" ] && continue
  a=$(git cat-file -p ":$f" 2>/dev/null | sha256sum | cut -d' ' -f1)
  [ "$a" = "$h" ] || err "sw.js : empreinte fausse pour $f (lancer : node tests/empreintes.mjs)"
done < <(git show :sw.js 2>/dev/null | grep -oE "'[^']+': '[0-9a-f]{64}'" | tr -d "':")
[ $ko = 0 ] && echo "Garde-fou : rien à signaler."
exit $ko
