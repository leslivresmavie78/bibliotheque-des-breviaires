# Couvertures du catalogue

Les 1 440 couvertures récupérées dans la sauvegarde Book Catalogue du 27-11-2026 sont conservées dans une archive découpée en segments de deux millions d’octets maximum à la racine du dépôt. Les 1 439 images distinctes sont identiques aux originaux triés ; deux fiches du même livre utilisent le même fichier. Les extensions reflètent le format réel : 1 431 JPEG, sept WebP et un PNG. Les quatre images du premier essai 2026 sont conservées, pour 1 444 livres illustrés.

`python3 scripts/build_covers.py` vérifie chaque segment, reconstitue l’archive, contrôle les noms, les empreintes, les tailles, les formats et les dimensions, puis prépare `dist/book-covers/`. Ce dossier est généré et n’est pas versionné. La publication GitHub Pages exécute cette préparation avant les contrôles et n’expose que `dist/`. Les segments respectent la limite observée lors du transfert des gros fichiers par l’interface GitHub ; ils ne sont pas téléchargés par les visiteurs du site.

`dist/book-covers.json` associe chaque image à l’identifiant, au titre, à l’auteur, à l’ISBN et à la série du livre. Les couvertures récupérées ne dépendent pas de l’année de parution. Les images de l’essai restent réservées aux quatre parutions 2026 documentées. Les illustrations carrées et horizontales conservent leurs proportions dans le cadre compact existant.

Les 1 981 fiches restantes restent sans image récupérée. L’archive de tri et sa liste à compléter sont conservées dans le suivi du projet, hors du dépôt public. Les nouveaux lots pourront suivre le même format ; ne pas réimporter un ancien catalogue pour ajouter une image.

Cette intégration corrige aussi le titre public de la fiche 2388 en **Le Silence des étoiles**, déjà corrigé dans Export (26).csv et visible sur la couverture du livre. Les résumés, notes, avis, années et données de gestion ne sont pas réimportés pendant cette intervention.
