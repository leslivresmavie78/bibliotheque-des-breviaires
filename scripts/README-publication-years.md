# Années de première parution

Le CSV public reste inchangé. Le site charge aussi `dist/publication-years.json` : une année de première parution connue de l’œuvre, langue originale comprise, avec sa source. La date de l’édition détenue dans `date_published` n’est jamais utilisée comme année de première parution.

Une entrée n’est utilisée que si l’identifiant, l’ISBN, le titre et les auteurs correspondent exactement à la fiche actuelle. Après une correction de ces champs, une ancienne entrée ne sera donc pas appliquée à un autre livre. Une année absente reste absente et peut être retrouvée par le filtre « Année non renseignée ».

## Actualisation facultative

Après la préparation normale du catalogue public :

```sh
python3 scripts/update_publication_years.py dist/catalogue.csv /chemin/Export.csv dist/publication-years.json --cache /chemin/cache-bibliographique
```

Cette commande ne modifie pas l’export de gestion ni le catalogue CSV. Elle interroge Open Library par lots d’ISBN valides, à moins d’une requête par seconde, et conserve les réponses dans le dossier de cache choisi. Les champs récupérés sont ceux de l’œuvre, dont `first_publish_year` ; aucune requête externe n’est effectuée par le navigateur des lecteurs.

Le rapprochement exige un ISBN rattaché à une œuvre unique, un titre normalisé identique et un auteur compatible. Une année absente, future, postérieure à l’édition du catalogue ou à un prix enregistré n’est pas retenue. Les notices anciennes (jusqu’à 1960) et les écarts d’au moins trente ans exigent une revue manuelle : les données bibliographiques peuvent être erronées ou incomplètes. Ces seuils sont prudents et peuvent laisser sans année une œuvre dont la date est pourtant connue.

Les contrôles et compléments validés auprès des éditeurs ou de notices bibliographiques sont conservés dans `scripts/publication-year-overrides.json`, avec les mêmes champs d’identité et une source HTTPS. Ils sont appliqués en priorité. Pour compléter une fiche, vérifier la première parution de l’œuvre et son tome, pas simplement la date d’une édition poche. Ajouter l’entrée validée puis régénérer le fichier public.

Publier le fichier des années avec les scripts et l’interface correspondants. Les autres champs et les enrichissements du CSV font l’objet de leur propre passe de mise à jour.
