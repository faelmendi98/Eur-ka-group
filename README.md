# Eurêka Group — V1 privée

Première version serveur du MVP Documents, construite dans le projet existant sans refonte de l’interface.

## Architecture

- Interface : React 19, TypeScript, Next.js/Vinext et CSS existants.
- Identité et sessions : connexion ChatGPT gérée par l’hébergement.
- Données persistantes : Cloudflare D1, migration dans `drizzle/0000_eureka_v1.sql`.
- Documents privés : Cloudflare R2, téléchargements contrôlés par le serveur.
- API et autorisations : `worker/v1-api.ts`.
- Tests de sécurité et de workflow : `tests/`.

Les comptes, métiers, demandes, devis, missions, candidatures, projets, jalons, documents, notifications, factures et journaux ne sont plus stockés dans le navigateur. `localStorage` reste réservé à des préférences visuelles non sensibles.

## Connexion et rôles

La version publiée utilise « Se connecter avec ChatGPT ». Eurêka ne reçoit ni ne conserve le mot de passe. Les rôles disponibles sont : Freelance, Mandataire, Spécialiste métier, Admin Métier et Admin Eurêka.

Un utilisateur public ne peut pas s’attribuer un rôle administrateur. Les invitations administratives sont liées à une adresse e-mail précise.

## Développement et vérification

Prérequis : Node.js 22.13 ou plus récent.

```bash
npm install
npm test
npm run lint
npm run build
```

Pour créer les trois comptes Admin Eurêka dans une base D1 locale, lance d’abord l’application avec `npm run dev`, puis exécute `npm run setup:local-admins`. Les mots de passe sont générés localement et affichés une seule fois pour les comptes sans identifiants ; les mots de passe existants ne sont pas modifiés. Chaque collaborateur doit exécuter cette commande sur sa propre base locale. Cela ne crée pas de comptes en production et aucun mot de passe n’est partagé par Git.

La migration est reproductible et crée les contraintes, index et déclencheurs empêchant les relations entre métiers différents.

## Limites avant ouverture commerciale

- Les textes juridiques sont des projets à faire valider.
- L’adresse d’Isiane Mendi doit être fournie avant l’activation de son compte Admin Eurêka.
- Le paiement automatique et le reversement aux freelances sont volontairement absents. La V1 utilise un suivi manuel des virements.
- Aucun antivirus externe n’est intégré : les formats et tailles sont strictement limités, les fichiers sont privés et stockés sans exécution.
- Les e-mails transactionnels externes ne sont pas activés ; les notifications internes sont persistantes.
- Un audit de sécurité indépendant reste nécessaire avant de déposer de vrais plans industriels confidentiels.

La version complète originale reste séparée de ce projet V1.
