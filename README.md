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

Le démarrage local par défaut (`npm run dev`) lance Netlify Dev et le runtime Netlify/Supabase; `npm run dev:supabase` reste disponible comme alias. La version locale s’ouvre par défaut en mode normal. Depuis une session Admin Eurêka sur `localhost`, « Ouvrir le mode édition » affiche les outils de prévisualisation des interfaces Admin métier, Mandataire et Freelance sans créer de comptes. Le passage entre les deux modes reste sur la même page et conserve la session ; l’aperçu ne change pas l’identité authentifiée ni les permissions serveur. Le runtime local bloque toutes les écritures métier afin de protéger les données de production ; seules la connexion et la déconnexion sont autorisées. Les modifications de code locales ne sont publiées qu’après fusion d’une PR et déploiement.

## Limites avant ouverture commerciale

- Les textes juridiques sont des projets à faire valider.
- L’adresse d’Isiane Mendi doit être fournie avant l’activation de son compte Admin Eurêka.
- Le paiement automatique et le reversement aux freelances sont volontairement absents. La V1 utilise un suivi manuel des virements.
- Aucun antivirus externe n’est intégré : les formats et tailles sont strictement limités, les fichiers sont privés et stockés sans exécution.
- Les e-mails transactionnels externes ne sont pas activés ; les notifications internes sont persistantes.
- Un audit de sécurité indépendant reste nécessaire avant de déposer de vrais plans industriels confidentiels.

La version complète originale reste séparée de ce projet V1.

## POC Supabase / Netlify

La cible envisagée pour le POC est Netlify pour l’application et Supabase pour PostgreSQL, Auth et Storage. Le dépôt contient la première migration PostgreSQL, générée à partir des migrations D1 :

```bash
npm run db:supabase:generate
```

Elle crée les tables applicatives, les contraintes d’isolation, active RLS sans donner d’accès direct aux rôles `anon` et `authenticated`, et crée le bucket privé `eureka-documents`. Les anciennes tables de mots de passe et de sessions ne sont pas migrées : le script de copie crée des comptes Supabase Auth avec des mots de passe aléatoires non conservés ; les utilisateurs devront réinitialiser leur mot de passe.

Le transfert initial de données D1 vers PostgreSQL se lance après avoir copié `.env.example` en `.env.local` et renseigné les accès Supabase localement :

```bash
npm run db:supabase:migrate
npm run db:supabase:migrate -- --apply
```

La première commande effectue un pré-contrôle ; `--apply` importe les lignes et crée les comptes Auth. Le script lit D1 à distance avec Wrangler, n’écrit jamais dans Cloudflare et efface son export temporaire. Il refuse de continuer si la table `documents` contient des références de fichiers, car le compte Cloudflare actuel ne permet pas de vérifier/copier les objets R2. Le contrôle effectué pour ce POC a trouvé une base D1 de 569 Ko, un utilisateur, un métier et aucune ligne de document.

Le runtime Netlify est configuré dans `netlify.toml` et `netlify/functions/v1.mjs`. `npm run build:netlify` produit l’export statique Next.js ; la fonction serveur gère l’authentification Supabase (connexion, confirmation d’adresse, session, déconnexion et récupération du mot de passe), puis délègue les routes métier à `worker/v1-api.ts` via un adaptateur PostgreSQL/Storage. Les demandes d’adhésion freelance/mandataire créent le compte Supabase Auth, le profil, la demande et le document privé dans `eureka-documents`. Les clés Supabase restent côté serveur. Les mots de passe des comptes importés étant aléatoires, chaque utilisateur doit passer par « Mot de passe oublié » pour en définir un.

Avant un déploiement Netlify, renseigner dans les variables d’environnement **serveur** du site `SUPABASE_URL`, `SUPABASE_DB_URL` et `SUPABASE_SERVICE_ROLE_KEY` (ou la clé secrète Supabase utilisée comme clé de service). Ne pas les préfixer par `NEXT_PUBLIC_`. Ajouter également l’URL publique Netlify dans la configuration Auth de Supabase (**Site URL** et URL de redirection autorisée) pour les retours vers `/?auth=recovery` et `/?auth=verify`.

Le portage des routes métier réutilise les contrôles d’autorisation existants et une couche de compatibilité D1/PostgreSQL ; cette traduction SQL doit être validée sur les workflows réels avant usage commercial. L’activation d’une invitation administrateur n’est pas encore migrée. Le contenu R2 n’a pas été transféré ni inventorié indépendamment des lignes `documents`. Les tests ciblés du runtime passent et le build statique Netlify est vérifié, mais aucun déploiement Netlify ni test complet contre les services Supabase distants n’a été effectué. Valider les parcours métier et Storage sur le projet Supabase, puis déployer le POC. Les offres gratuites conviennent aux essais, pas à une mise en production commerciale.
