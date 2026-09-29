# Cahier de reprise — Eurêka Group

## 1. Objectif du produit

Eurêka Group est une plateforme d'intermédiation et de suivi de projets entre des **mandataires** qui déposent des besoins, des **admins métier** qui configurent le domaine, chiffrent les demandes et encadrent les projets, et des **freelances** qui consultent les missions accessibles et réalisent les projets attribués.

La première spécialité présentée dans la maquette est **R&D Horlogerie**, mais la plateforme doit pouvoir accueillir d'autres métiers avec leurs propres paramètres.

## 2. Rôles et espaces

### Admin métier

L'admin métier gère uniquement son domaine. Son espace comprend : accueil, projets, demandes de devis, freelances, mandataires, partage freelance, matériel, messagerie, calendrier, statistiques métier, paramétrage et support IT.

Fonctions principales :

- recevoir les demandes de devis des mandataires ;
- lire le résumé des paramètres choisis par le mandataire ;
- fixer ou modifier prix, classe, crédits, durée et facturation ;
- renvoyer une proposition révisée et conserver les versions ;
- créer, attribuer et suivre les projets ;
- définir les classes D à S et leurs seuils ;
- régler gains/pertes de crédits et règles d'évaluation ;
- activer et modifier les modes de facturation selon le métier ;
- gérer les documents, normes, matériels et utilisateurs du domaine.

### Freelance

Le freelance voit uniquement ses projets attribués : projet en cours, projet en validation et historique clôturé. Le tableau de missions reste séparé et verrouille les missions selon la classe et les crédits.

Son espace comprend également : statistiques, profil, documents, normes, forum métier, salles de réunion, messagerie, calendrier et support.

### Mandataire

Le mandataire dépose et suit ses demandes de devis, consulte ses projets et documents, échange avec les intervenants et gère son profil entreprise.

Le futur configurateur mandataire devra produire un résumé structuré transmis avec chaque demande de devis.

## 3. Parcours principal à développer en priorité

1. Le mandataire crée une demande et sélectionne ses paramètres.
2. L'admin métier reçoit la demande.
3. L'admin fixe prix, classe, crédits, durée et mode de facturation.
4. Le mandataire accepte ou demande une révision.
5. L'admin peut modifier les paramètres afin de proposer un prix différent.
6. Après acceptation, le projet est créé et attribué à un freelance.
7. Les participants suivent le calendrier, les jalons, réunions, PV et documents.
8. Le mandataire valide le résultat final.
9. Le projet est clôturé, évalué et archivé ; les crédits du freelance sont mis à jour.

## 4. Règles fonctionnelles importantes

- Un freelance ne peut candidater qu'aux missions compatibles avec sa classe et son nombre de crédits.
- L'onglet Projets du freelance ne contient jamais les missions disponibles.
- Un projet clôturé affiche une chronologie terminée à 100 % et devient principalement consultable en lecture seule.
- Les salles projet sont créées automatiquement depuis le calendrier et limitées aux participants autorisés.
- Les salles d'entraide freelance ne permettent pas le partage de données confidentielles liées aux projets.
- Dans le forum, tout freelance peut indiquer qu'une réponse l'a aidé, puis doit obligatoirement la noter.
- Les réponses sont classées selon le nombre d'utilisateurs aidés, puis selon leur note moyenne.
- Pour fermer sa question, l'auteur doit sélectionner une ou plusieurs réponses qui l'ont résolue.
- Après fermeture, la question reste consultable mais ne reçoit plus de réponses ni d'évaluations.
- Les PV de séance suivent un délai de rédaction/validation et deviennent ensuite non modifiables.
- Les droits sur les plans et fichiers confidentiels doivent être contrôlés projet par projet.

## 5. Facturation configurable

Chaque admin métier doit pouvoir activer, désactiver ou modifier les modes proposés dans son domaine : heure, demi-journée, journée, forfait, paiements échelonnés (par exemple 30 % / 40 % / 30 %) et modes personnalisés comme mensuel ou au livrable.

Les paramètres globaux du métier fournissent les valeurs par défaut, mais l'admin doit pouvoir les adapter sur un devis précis.

## 6. Données minimales à prévoir

Entités conseillées : utilisateurs, rôles, domaines métier, profils freelance, entreprises mandataires, classes, crédits, missions, demandes de devis, versions de devis, projets, affectations, jalons, séances, PV, fichiers, permissions, messages, conversations, tickets IT, questions de forum, réponses, évaluations, salles de réunion, notifications et journal d'audit.

Toutes les actions sensibles doivent conserver l'auteur, la date, l'ancienne valeur et la nouvelle valeur.

## 7. Sécurité et confidentialité

Les fichiers peuvent contenir des plans horlogers et des données industrielles confidentielles. La vraie application doit intégrer :

- contrôle d'accès serveur, pas seulement masquage visuel ;
- chiffrement des échanges et du stockage ;
- liens de téléchargement temporaires ;
- journal d'accès aux fichiers ;
- isolation des données entre mandataires et projets ;
- sauvegardes et restauration ;
- suppression ou conservation selon les contrats ;
- conformité à la législation suisse sur la protection des données.

Un audit de sécurité est recommandé avant l'utilisation avec de vrais clients ou documents confidentiels.

## 8. Limites de la livraison actuelle

La maquette permet de comprendre l'apparence et de tester les parcours principaux. Elle ne constitue pas encore un backend exploitable :

- les utilisateurs et projets sont fictifs ;
- les modifications sont généralement conservées uniquement dans l'état de la page ;
- les formulaires ne déclenchent pas de véritable workflow ;
- aucun paiement ni envoi d'e-mail réel n'est effectué ;
- les fichiers ne sont pas stockés dans un espace sécurisé ;
- les salles de réunion ne lancent pas de visioconférence réelle.

Le développeur doit conserver la maquette comme référence UX, puis remplacer progressivement les données simulées par des services et règles serveur testés.
