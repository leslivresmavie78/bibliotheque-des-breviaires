# Couvertures du catalogue

Les 1 440 couvertures récupérées dans la sauvegarde Book Catalogue du 27-11-2026 sont conservées dans une archive découpée en segments de deux millions d’octets maximum à la racine du dépôt. Les 1 439 images distinctes sont identiques aux originaux triés ; deux fiches du même livre utilisent le même fichier. Les extensions reflètent le format réel : 1 431 JPEG, sept WebP et un PNG. Les quatre images du premier essai 2026 sont conservées. La recherche par années ajoute ensuite 206 couvertures vérifiées, pour 1 650 livres illustrés.

`python3 scripts/build_covers.py` vérifie chaque segment, reconstitue l’archive, contrôle les noms, les empreintes, les tailles, les formats et les dimensions, puis prépare `dist/book-covers/`. Ce dossier est généré et n’est pas versionné. La publication GitHub Pages exécute cette préparation avant les contrôles et n’expose que `dist/`. Les segments respectent la limite observée lors du transfert des gros fichiers par l’interface GitHub ; ils ne sont pas téléchargés par les visiteurs du site.

`dist/book-covers.json` associe chaque image à l’identifiant, au titre, à l’auteur, à l’ISBN et à la série du livre. Les couvertures récupérées ne dépendent pas de l’année de parution. Les images de l’essai restent réservées aux quatre parutions 2026 documentées. Les illustrations carrées et horizontales conservent leurs proportions dans le cadre compact existant.

Les 1 771 fiches restantes restent sans image récupérée. L’archive de tri et sa liste à compléter sont conservées dans le suivi du projet, hors du dépôt public. Les nouveaux lots pourront suivre le même format ; ne pas réimporter un ancien catalogue pour ajouter une image.

Cette intégration corrige aussi le titre public de la fiche 2388 en **Le Silence des étoiles**, déjà corrigé dans Export (26).csv et visible sur la couverture du livre. Les résumés, notes, avis, années et données de gestion ne sont pas réimportés pendant cette intervention.

## Recherche 2025 puis 2024 — 27-11-2026

Le lot 02 ajoute **61 couvertures** : 29 dans le repérage 2025 et 32 dans celui de 2024. L’identification part de la première parution lorsqu’elle est déjà documentée, sinon de la date d’édition de la source. Ce repérage ne crée ni ne modifie les années affichées sur le site. Sept ouvrages dont une parution antérieure est confirmée sont gardés pour leur année ; deux ISBN numériques redirigent vers une autre édition papier et restent à confirmer. Le détail des identités, sources et cas différés est dans `scripts/cover-research-2025-2024.json`.

Les images sont fournies par les pages des éditeurs ou des libraires, puis contrôlées visuellement pour le titre, l’auteur et le tome. Les couvertures de Jacaranda en poche et en gros caractères restent différentes. Pour le carnet Accueillir la biodiversité dans son jardin, la vignette de l’éditeur et le PDF portant l’ISBN sont associés. Une source tierce d’image reste consignée séparément pour la BD Quelle Histoire.

Le lot conserve les octets JPEG, PNG et WebP téléchargés, sans retouche. Ses quatre segments `book-covers-02-001.part` à `book-covers-02-004.part` suivent la même vérification que le lot récupéré. Les nouveaux types de provenance `publisher` et `bookseller` exigent une image locale nommée par son empreinte, les identités et la série complètes, un ISBN à treize chiffres et deux sources HTTPS. Une image distante ou une provenance incomplète ne s’affiche pas.

L’ajout ne réimporte aucun CSV : les notes, avis, résumés, 895 premières parutions, 54 communications et le club de lecture sont conservés. Les deux sources complètes du projet restent intactes. La liste personnelle des visiteurs ne change pas.

## Recherche 2023 puis 2022 — 27-11-2026

Le lot 03 ajoute **81 couvertures** sur 87 fiches examinées. Le détail par année de repérage, l’identité exacte de chaque livre, les pages sources, les dimensions et les six cas différés sont dans `scripts/cover-research-2023-2022.json`. Les cinq livres de 2023/2022 mis de côté lors du lot précédent sont repris. Les ISBN numériques qui redirigent vers une autre édition, l’ISBN à confirmer et le titre sans correspondance ISBN vérifiable ne reçoivent pas d’image approximative ; deux ouvrages sont réservés à leur année antérieure.

Le contrôle visuel vérifie les titres, les auteurs et les tomes, notamment les tomes 8 et 9 de Mission Yozakura Family, Fourth Wing et Iron Flame, et les tomes 2 et 3 du Sang et la Cendre. Pour Veiller sur elle, la couverture de face fournie par le libraire remplace le visuel de présentation trop petit de l’éditeur. Le Mage du Kremlin est identifié par son ISBN exact chez le libraire ; le manuel CE2 conserve son édition 2023 fournie par Hachette. Les images carrées, les bandeaux imprimés de prix et les présentations originales des livres conservent leurs proportions.

Les images de ce lot restent identiques aux octets téléchargés, sans retouche. Les segments `book-covers-03-*.part` sont contrôlés et reconstruits par le même script. L’inventaire d’images déjà chargé avec `cache: no-cache` suffit à cet ajout de données : aucun changement d’interface ou de cache du programme n’est nécessaire. Les sources CSV et sauvegarde, les notes et avis, les 895 premières parutions documentées, les 54 communications et le club de lecture restent inchangés.

## Recherche 2021 puis 2020 et autres éditions — 27-11-2026

Le lot 04 ajoute **56 couvertures** : 25 dans le repérage 2021, 27 dans celui de 2020, plus les quatre fiches des lots précédents dont l’édition restait à confirmer. Il porte le site à **1 642 livres illustrés sur 3 421**. Détail et sources : `scripts/cover-research-2021-2020.json`. Les premières parutions affichées ne sont pas modifiées.

Titia autorise désormais la couverture d’une autre édition lorsque l’édition exacte n’est pas retrouvée. Le titre, l’auteur et le tome doivent toujours correspondre. L’ISBN de la fiche reste inchangé ; `cover_isbn` consigne séparément l’ISBN de l’édition illustrée lorsqu’il est disponible, avec `alternate_edition` pour un recours explicite à une autre édition. La Joie de vivre utilise une édition Livre de poche ; La fin de l’été et Au nom du cœur reçoivent des couvertures papier du même roman ; Le bal des inutiles utilise l’image présentée par l’agence régionale Normandie Livre et Lecture. Pour ce dernier, la source institutionnelle identifie directement l’auteur et le livre sans publier l’ISBN de l’image. L’Appel de la forêt est illustré par l’édition Gallmeister/Totem 2026. Les deux manuels Odyssée restent bien des livres du professeur aux niveaux A1 et A2.

Les couvertures recherchées acceptent maintenant les ISBN à dix caractères comme ceux à treize chiffres, ainsi qu’une source institutionnelle documentée. Les contrôles exacts de la fiche, du titre, de l’auteur et de la série, les dimensions minimales, les deux sources HTTPS et le fichier local nommé par son empreinte restent requis. Les anciennes couvertures et les formats JPEG, PNG et WebP sont préservés. La version du programme est actualisée pour que les images avec ISBN-10 ou source institutionnelle se chargent aussi dans un navigateur ayant déjà consulté le site.

Une seule fiche reste sans couverture dans cette passe : Le Plan Noé, sans ISBN, dont le titre et le résumé ne correspondent pas au livre Négo / Le plan Noah trouvé chez Calmann-Lévy. C’est une question d’identité à clarifier dans le travail du catalogue ; une autre édition ne résout pas cette contradiction. Aucun CSV, résumé, avis, note, année, communication, élément du club ou liste personnelle n’est modifié par ce lot.

## Première page du catalogue — 27-11-2026

Le lot 05 complète **les huit couvertures manquantes de la première page** : Aller simple pour la joie, Les wonderwomen aussi mettent une culotte gainante, Cher monstre, La Chambre des merveilles, The Deal, Dans le ventre de Cornebidouille, Mon fils est Jeffrey Dahmer et Gatsby le magnifique. Les 24 livres affichés à l’ouverture sans filtre, dans l’ordre Dernières arrivées, sont désormais tous illustrés ; D’autres printemps reste en première position. Le site compte **1 650 livres illustrés sur 3 421**. Le relevé des identifiants et des sources est dans `scripts/cover-research-homepage.json`.

Les sept JPEG et le WebP natif de Cher monstre conservent leurs octets d’origine. Ce dernier vient directement d’Albin Michel dans une définition de 798 × 800 pixels, plus nette que la petite vignette de libraire disponible et plus légère que l’image originale de très grande taille. Les couvertures carrées et horizontales gardent leurs proportions. Les deux ISBN à dix caractères d’Aller simple pour la joie et de Gatsby restent inchangés dans leurs fiches ; leur équivalent à treize chiffres identifie la couverture. The Deal conserve le tome 1 d’Off-Campus.

Cet ajout porte uniquement sur les images : aucune modification du CSV public ou des sources, des notes, avis, résumés, premières parutions, communications, du club ou des listes personnelles. Aucun changement de présentation ou de programme n’est nécessaire ; l’inventaire des couvertures se charge déjà sans cache. Les contrôles existants sont étendus à ce lot de priorité accueil en plus des lots annuels.
