# Catalogue de la Bibliothèque des Bréviaires

Une application de consultation en français, adaptée au téléphone et à l’ordinateur, sans compte lecteur et sans dépendance à installer. Elle permet de rechercher par titre, auteur ou thème, filtrer les genres, consulter les résumés et avis, trier les notes et conserver une sélection sur son appareil. Une liste peut être copiée ou imprimée.

**Dépôt du projet :** https://github.com/leslivresmavie78/bibliotheque-des-breviaires

**Site actuellement accessible :** https://bibliotheque-des-breviaires.basicmyrtle2.chatgpt.site

Le code reprend la version 8 du site existant (commit `c68d27a1f91d9ea775c4e69a00f407c7174c7e2c`). La présentation Rubik — Océan et le fonctionnement de la liste personnelle sont conservés. La préparation sur GitHub ne change pas l’adresse du site actuel.

## Où sont les données ?

Le site lit **`dist/catalogue.csv`** : c’est le fichier qui alimente l’application. Il est stocké et publié avec le site. Il ne contient que les informations bibliographiques utiles aux lecteurs. Les données de prêt, de lecture personnelle, de rangement, l’édition et la langue sont exclues.

Le fichier complet d’origine reste le fichier de gestion Book Catalogue fourni dans les sources du projet ChatGPT. Il n’est pas déposé sur GitHub. La version préparée le 23-11-2026 utilise `Export (22).csv` : **3 420 fiches**, dont 951 avec un champ avis et 308 avec au moins un prix. Les 3 420 identifiants existants sont conservés. Aucun livre, résumé, avis ou note n’a été inventé pour l’application. Les notes à zéro dans l’export sont présentées comme une absence de note. Les avis ne sont pas réécrits : seules les balises de mise en forme sont transformées en texte et retours à la ligne.

La mention **🏆 Prix littéraire** apparaît sur les cartes des livres dont le champ `location` du fichier source comporte un prix marqué 🏆. La fiche affiche les noms et les années tels qu’ils sont renseignés, un prix par ligne. Seules ces lignes sont exportées dans la colonne publique `literary_awards` ; l’emplacement de rangement reste exclu. Les sélections, nominations, finalistes et mentions de best-seller ne déclenchent pas ce badge. La recherche permet aussi de saisir un nom de prix. L’application n’ajoute aucun prix absent de la source.

Les genres détaillés restent visibles dans chaque fiche. Les filtres les rassemblent par mots présents dans leur catégorie ; un livre peut apparaître dans plusieurs familles. Les catégories d’origine ne sont pas modifiées. Les livres restent distincts, y compris lorsqu’ils ont le même titre.

L’accueil comporte quatre grands boutons, dans cet ordre : **Tous les livres**, **Adultes**, **Ado**, **Enfants**. Le titre est plus court et plus petit sur téléphone. Les boutons sont colorés et portent du texte. « Voir le livre » ouvre une fiche ; « Garder » ajoute un livre à « Ma liste ». Les critères secondaires sont regroupés dans « Plus de choix ».

La présentation finale reprend la proposition **Rubik — Océan**, choisie par l’utilisatrice : police Rubik, bleu océan dominant, Adultes en bleu brume, Ado en turquoise clair et Enfants en corail doux. Les contours sont fins et les grands boutons restent lisibles. La police est fournie avec le site, sans appel externe depuis le navigateur. Le sous-ensemble latin conserve les accents français ; les autres écritures utilisent la police de remplacement du système. Source : https://github.com/google/fonts/tree/main/ofl/rubik ; licence SIL Open Font License dans `dist/fonts/OFL-Rubik.txt`.

Les publics sont distincts des genres. Enfants et Ado reposent sur les mentions explicites de la catégorie et l’âge minimum déjà renseigné : 12–17 ans rejoint Ado, 18 ans et plus est exclu des deux sections. Une mention explicite « ado » dès 11 ans reste dans Ado. Un simple thème comme l’adoption ou l’adolescence et la forme album ne suffisent pas à attribuer un public.

Pour la navigation, Adultes regroupe les catégories explicitement adultes, même lorsqu’un âge conseillé de 15 ou 16 ans est documenté. Les rayons généraux (romans, polars, biographies, récits, documentaires, essais, etc.) sans public ni âge plus précis rejoignent également Adultes. Ce classement de rayon ne crée aucun seuil « Dès 18 ans » : un âge conseillé exige une source vérifiée dans le journal du catalogue. Une fiche ambiguë, par exemple un album sans public ni âge, reste uniquement dans Tous les livres.

Le filtre **Âge conseillé**, dans « Plus de choix », regroupe les âges minimums renseignés par tranches (0–5, 6–8, 9–11, 12–14, 15–17, 18 ans et plus). Les mentions « Dès la naissance », « Dès 18 mois », « Dès 1 an » et les intervalles sont reconnues en conservant le libellé source. Il n’attribue aucun âge aux fiches qui en sont dépourvues. L’option « Âge non renseigné » permet de les retrouver. Les genres se combinent avec ces sections : par exemple, Enfants + Documentaires, ou Adultes + 15–17 ans pour un roman adulte accessible aux adolescents selon une recommandation documentée.

Les documentaires destinés aux enfants restent accessibles dans Enfants, avec le filtre Documentaires. Les âges affichés proviennent uniquement du dernier export importé.

L’accueil présente les **dernières arrivées** selon la colonne `date_added` de l’export, de la plus récente à la plus ancienne. La date de correction d’une fiche ne change pas cet ordre. Une date absente ou invalide place la fiche après les dates connues. Les autres tris restent disponibles dans « Plus de choix ».

La recherche ignore les accents, la casse et la ponctuation, accepte de petites fautes et fait remonter les titres les plus proches avant les simples correspondances de thèmes. Par exemple, « l’homme dé », « lhomme de » ou « rhineart » retrouvent L’Homme-dé. Si une recherche saisie ne trouve rien dans les filtres actifs, ou qu’un titre exact est masqué par un filtre, elle s’élargit à tous les livres avec un message visible. Un filtre choisi ensuite s’applique strictement ; la recherche dans « Ma liste » reste limitée aux livres enregistrés.

## Mettre le catalogue à jour

Le plus simple : transmettre le nouvel export CSV dans la conversation du projet Site Web Bibliothèque. Après contrôle, l’assistant prépare les deux fichiers publics, vérifie les identifiants et les tests, puis enregistre les modifications dans ce dépôt. Une fois GitHub Pages activé, la mise en ligne part automatiquement après les contrôles.

Pour une mise à jour autonome, depuis un ordinateur avec Python 3 :

```bash
python3 scripts/import_catalogue.py "/chemin/vers/le/nouvel-export.csv"
```

Cette commande régénère `dist/catalogue.csv` et `dist/catalogue-meta.json`. Elle ne modifie pas l’export original et n’a besoin d’aucune connexion. Elle refuse les identifiants absents ou en double. Publier ensuite les deux fichiers régénérés sur l’hébergement choisi. Garder les identifiants Book Catalogue permet aux listes personnelles des lecteurs de retrouver les mêmes livres après une mise à jour.

Ne pas déposer le fichier complet de gestion dans le dossier public : utiliser le fichier allégé produit par le script.

## Publication sur GitHub Pages

Le fichier `.github/workflows/site.yml` vérifie chaque modification de `main`. Il prépare un livrable contenant uniquement `dist/`. Le job de publication est ignoré tant que le dépôt reste privé.

Première activation, après décision de Titia :

1. Pour GitHub Free, rendre ce dépôt public. GitHub Pages depuis un dépôt privé exige une offre payante compatible. Aucun changement de visibilité ni achat n’est effectué par les fichiers de ce dépôt.
2. Dans **Settings > Pages > Build and deployment > Source**, sélectionner **GitHub Actions**.
3. Dans **Actions > Contrôles et publication du catalogue**, lancer **Run workflow**, ou enregistrer une nouvelle modification de `main`.
4. Attendre la réussite des vérifications et de la publication, puis prendre l’adresse affichée dans **Settings > Pages**. Les mises à jour suivantes utilisent la même adresse.

Le workflow n’exige aucun mot de passe ni jeton personnel. La lecture du dépôt et les droits de publication Pages sont limités aux jobs qui en ont besoin. Seul le dossier `dist/` devient le site ; l’export complet, les informations de prêt et les emplacements de rangement en sont exclus.

Documentation officielle : https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages

Une adresse GitHub Pages est différente de celle du site actuel. Les listes restent enregistrées sur l’appareil pour l’adresse où elles ont été créées ; changer d’adresse ne les transfère pas automatiquement. Préparer la transition avant de diffuser le nouveau lien et conserver l’ancien site accessible pendant cette étape.

## Fonctionnement et limites

- La liste personnelle est enregistrée dans le navigateur de chaque lecteur. Elle n’est pas partagée entre appareils et peut disparaître si le stockage du navigateur est effacé.
- La sélection ne constitue pas une réservation. Le catalogue ne renseigne pas la disponibilité en temps réel.
- L’application affiche les informations déjà présentes dans l’export. Elle n’effectue aucune nouvelle vérification des notes, avis, résumés ou auteurs.
- Aucun outil d’analyse d’audience, image externe ou police externe n’est ajouté.
- Il faut servir les fichiers par HTTP(S), par exemple via Pages. Pour un essai local : `python3 -m http.server --directory dist 8080`, puis ouvrir `http://localhost:8080`.
- Tests sans installation : `node --test scripts/catalogue.test.mjs`.
- Contrôle de l’extraction des prix : `python3 scripts/test_import_catalogue.py`.

## Fichiers

| Fichier | Rôle |
| --- | --- |
| `dist/index.html` | Page de l’application |
| `dist/style.css` | Apparence et adaptation au téléphone |
| `dist/simple.css` | Présentation simplifiée, gros boutons et lecture plus facile |
| `dist/fonts/` | Police Rubik fournie avec sa licence |
| `dist/app.js` | Recherche, fiches, sélection, copie et impression |
| `dist/catalogue-core.js` | Lecture du CSV, filtres et tris |
| `dist/catalogue.csv` | Catalogue public utilisé par le site |
| `dist/catalogue-meta.json` | Date d’import et décompte |
| `scripts/import_catalogue.py` | Préparer un nouvel export pour le site |
| `scripts/catalogue.test.mjs` | Vérifications des données et de la recherche |
| `.github/workflows/site.yml` | Vérifications automatiques et publication sur GitHub Pages après activation |
