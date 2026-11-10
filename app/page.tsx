/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/set-state-in-effect */
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const navByRole: Record<string, string[][]> = {
  "Admin Eurêka": [
    ["Accueil", "⌂"],
    ["Métiers", "◇"],
    ["Utilisateurs", "♙"],
  ],
  "Admin métier": [
    ["Accueil", "⌂"],
    ["Projets", "◇"],
    ["Demandes de devis", "₣"],
    ["Facturation", "CHF"],
    ["Freelances", "♙"],
    ["Mandataires", "♜"],
    ["Partage freelance", "▤"],
    ["Partage Mandataire", "▤"],
    ["Demandes d’adhésion", "＋"],
    ["Paramètres métier", "⚙"],
  ],
  Freelance: [
    ["Accueil", "⌂"],
    ["Projets", "◇"],
    ["Tableau de missions", "☆"],
    ["Documents", "▤"],
  ],
  Mandataire: [
    ["Accueil", "⌂"],
    ["Projets", "◇"],
    ["Demandes de devis", "₣"],
    ["Devis", "✓"],
    ["Postulations", "♙"],
    ["Documents", "▤"],
  ],
};

type SharedFile = { id: string; name: string; description: string; fileName: string; url: string; sourceFile?: File };
type SharedFolder = { id: string; name: string; documents: SharedFile[] };
type QuoteRequest = {
  id: string;
  internalNumber: string;
  mandataireNumber: string;
  projectName: string;
  requestFile: SharedFile;
  status: "pending" | "sent" | "accepted";
  projectClass?: string;
  credits?: number;
  price?: number;
  eurekaQuoteNumber?: string;
  eurekaProjectName?: string;
  eurekaFile?: SharedFile;
  tradeId: string;
  mandataireId: string;
};
type AcceptedProject = { id: string; title: string; projectClass: string; credits: number; price: number; status: string; tradeId: string; mandataireId: string; freelancerId?: string };
type FreelancerState = { name: string; projectClass: string; credits: number; note: number };
type PlatformRole = "Freelance" | "Mandataire" | "Admin métier" | "Admin Eurêka" | "En attente";
type PlatformTrade = { id: string; name: string; adminName: string; adhesionDocument: SharedFile };
type PlatformUser = { id: string; membershipId?: string; email?: string; eurekaEmail?: string; name: string; role: PlatformRole; tradeId: string; tradeName: string; status?: string; projectClass?: string; credits?: number; reservedCredits?: number; note?: number };
type MissionApplication = { id: string; projectId: string; freelancerId: string; tradeId: string };
type MembershipRequest = { id: string; name: string; requestedRole: "Freelance" | "Mandataire"; tradeId: string; tradeName: string; document: SharedFile };
type AdminInvitation = { id:string; name:string; email?:string; role:"Admin Eurêka"|"Admin métier"; tradeId?:string; tradeName:string; status:string; accountUserId?:string };
type Invoice = { id:string; reference:string; projectTitle:string; amount:number; status:string; issueDate?:string; dueDate?:string };
type TradeSetting = { id:string; key:string; value:string; status:string };
type ProjectMilestone={id:string;projectId:string;title:string;dueAt?:string;status:string};

type MvpSharedProps = {
  quotes: QuoteRequest[];
  onCreateQuote: (quote: Pick<QuoteRequest, "mandataireNumber" | "projectName" | "requestFile">) => void;
  onTransmitQuote: (id: string, values: Partial<QuoteRequest>) => void;
  onAcceptQuote: (id: string) => void;
  onQuoteDecision: (id: string, decision:"revision"|"refuse", message?:string) => void;
  acceptedProjects: AcceptedProject[];
  freelancer: FreelancerState;
  onUpdateFreelancer: (next: FreelancerState) => void;
  freelanceFolders: SharedFolder[];
  mandataireFolders: SharedFolder[];
  onCreateFolder: (audience: "freelance" | "mandataire", name: string) => void;
  onAddSharedFile: (audience: "freelance" | "mandataire", folderId: string, file: SharedFile) => void;
  currentUser: PlatformUser;
  trades: PlatformTrade[];
  users: PlatformUser[];
  applications: MissionApplication[];
  membershipRequests: MembershipRequest[];
  adminInvitations:AdminInvitation[];
  onCreateTrade: (name: string) => void;
  onInviteAdmin:(values:{displayName:string;email:string;role:string;tradeId?:string})=>void;
  onDecideAdminInvitation:(id:string,decision:"accepted"|"rejected",userId?:string)=>void;
  onDeleteAdminInvitation:(id:string)=>void;
  onAssignAdmin:(userId:string,tradeId:string)=>void;
  onCreateMember:(values:{name:string;role:"freelance"|"mandataire";password:string})=>void;
  onUserStatus:(userId:string,status:"active"|"suspended")=>void;
  onDeleteUser:(userId:string)=>void;
  onDeleteTrade:(tradeId:string)=>void;
  onApplyToMission: (projectId: string, freelancerId: string) => void;
  onSelectFreelancer: (projectId: string, freelancerId: string) => void;
  onProjectAction: (projectId:string, action:"request-validation"|"correction"|"resubmit"|"close", values?:Record<string,unknown>)=>void;
  onCreateMembershipRequest: (request: Omit<MembershipRequest, "id">) => void;
  onConfirmMembership: (id: string) => void;
  onDecideMembership: (id: string, decision: "accepted"|"rejected"|"needs_information") => void;
  invoices:Invoice[];
  onInvoiceStatus:(id:string,status:string)=>void;
  tradeSettings:TradeSetting[];
  onSaveTradeSetting:(key:string,value:string,submit:boolean)=>void;
  onValidateTradeSetting:(id:string)=>void;
  milestones:ProjectMilestone[];
  onAddMilestone:(projectId:string,title:string,dueAt?:string)=>void;
  onMilestoneStatus:(id:string,status:string)=>void;
};

const métiers = ["R&D Horlogerie", "Génie civil", "Informatique", "Électronique", "Industrie", "Automobile"];
const projects = [
  {
    id: "EUR-024",
    title: "Calibre automatique 3 aiguilles",
    client: "Maison Aster",
    status: "En cours",
    progress: 68,
    due: "18 sept.",
    level: "Classe A",
  },
  {
    id: "EUR-027",
    title: "Module phase de lune",
    client: "Atelier Meridian",
    status: "À attribuer",
    progress: 12,
    due: "24 sept.",
    level: "Classe B",
  },
  {
    id: "EUR-019",
    title: "Mise en plans d’un tourbillon",
    client: "Nivalis Genève",
    status: "En validation",
    progress: 91,
    due: "29 août",
    level: "Classe S",
  },
  {
    id: "EUR-031",
    title: "Étude barillet longue réserve",
    client: "Orbe Manufacture",
    status: "Devis",
    progress: 4,
    due: "04 oct.",
    level: "Classe A",
  },
];

const getProjectClassification = (title: string) => {
  const name = title.toLowerCase();
  return name.includes("tourbillon") ? { level: "Classe S", credits: 100, price: "CHF 96’000" } : name.includes("phase de lune") ? { level: "Classe B", credits: 50, price: "CHF 28’500" } : name.includes("nomenclature") || name.includes("dossier de plans") ? { level: "Classe D", credits: 15, price: "CHF 4’800" } : name.includes("petite seconde") || name.includes("affichage simple") || name.includes("pont existant") ? { level: "Classe C", credits: 30, price: "CHF 12’500" } : name.includes("barillet") ? { level: "Classe A", credits: 80, price: "CHF 37’500" } : { level: "Classe A", credits: 75, price: "CHF 42’800" };
};

const getMissionReward = (rank: string) =>
  ({
    D: { max: 3, loss: -2 },
    C: { max: 6, loss: -3 },
    B: { max: 8, loss: -4 },
    A: { max: 10, loss: -6 },
    S: { max: 15, loss: -10 },
  })[rank] || { max: 6, loss: -3 };

const directoryProfiles: Record<
  string,
  Record<
    string,
    {
      initials: string;
      subtitle: string;
      status: string;
      facts: { label: string; value: string }[];
      metrics: { label: string; value: string }[];
    }
  >
> = {
  Freelances: {
    "Marc Lenoir": {
      initials: "ML",
      subtitle: "Constructeur mouvement · Classe A",
      status: "Disponible dans 12 jours",
      facts: [
        {
          label: "Spécialités",
          value: "Rouages, barillets et construction mouvement",
        },
        { label: "Logiciels", value: "Inventor · Creo · AutoCAD" },
        {
          label: "Projet actuel",
          value: "EUR-024 · Calibre automatique 3 aiguilles",
        },
        { label: "Localisation", value: "Neuchâtel, Suisse" },
      ],
      metrics: [
        { label: "Missions terminées", value: "18" },
        { label: "Respect des délais", value: "94 %" },
        { label: "Note moyenne", value: "4,8 / 5" },
        { label: "Crédits", value: "75 / 100" },
      ],
    },
    "Sophie Aubert": {
      initials: "SA",
      subtitle: "Ingénieure complications · Classe B",
      status: "Disponible",
      facts: [
        {
          label: "Spécialités",
          value: "Quantièmes, phase de lune et affichages",
        },
        { label: "Logiciels", value: "Creo · SolidWorks" },
        { label: "Dernier projet", value: "EUR-027 · Module phase de lune" },
        { label: "Localisation", value: "Genève, Suisse" },
      ],
      metrics: [
        { label: "Missions terminées", value: "11" },
        { label: "Respect des délais", value: "91 %" },
        { label: "Note moyenne", value: "4,6 / 5" },
        { label: "Crédits", value: "50 / 100" },
      ],
    },
    "Nicolas Rey": {
      initials: "NR",
      subtitle: "Spécialiste haute horlogerie · Classe S",
      status: "En mission",
      facts: [
        {
          label: "Spécialités",
          value: "Tourbillons, cages et organes réglants",
        },
        { label: "Logiciels", value: "Inventor · Catia" },
        {
          label: "Projet actuel",
          value: "EUR-019 · Mise en plans d’un tourbillon",
        },
        { label: "Localisation", value: "Vallée de Joux, Suisse" },
      ],
      metrics: [
        { label: "Missions terminées", value: "27" },
        { label: "Respect des délais", value: "97 %" },
        { label: "Note moyenne", value: "4,9 / 5" },
        { label: "Crédits", value: "100 / 100" },
      ],
    },
    "Élodie Marchand": {
      initials: "EM",
      subtitle: "Constructrice habillage · Classe C",
      status: "Disponible",
      facts: [
        {
          label: "Spécialités",
          value: "Boîtes, cadrans et interfaces mouvement-habillage",
        },
        { label: "Logiciels", value: "SolidWorks · Rhino" },
        { label: "Dernier projet", value: "Boîte sportive étanche 10 ATM" },
        { label: "Localisation", value: "Bienne, Suisse" },
      ],
      metrics: [
        { label: "Missions terminées", value: "7" },
        { label: "Respect des délais", value: "89 %" },
        { label: "Note moyenne", value: "4,5 / 5" },
        { label: "Crédits", value: "35 / 100" },
      ],
    },
    "Lucas Perrin": {
      initials: "LP",
      subtitle: "Dessinateur mise en plans · Classe D",
      status: "Disponible",
      facts: [
        {
          label: "Spécialités",
          value: "Mise en plans, cotation et dossiers techniques",
        },
        { label: "Logiciels", value: "Inventor · AutoCAD" },
        {
          label: "Dernier projet",
          value: "Dossier de plans d’un mécanisme de remontage",
        },
        { label: "Localisation", value: "Besançon, France" },
      ],
      metrics: [
        { label: "Missions terminées", value: "3" },
        { label: "Respect des délais", value: "100 %" },
        { label: "Note moyenne", value: "4,4 / 5" },
        { label: "Crédits", value: "15 / 100" },
      ],
    },
  },
  Mandataires: {
    "Maison Aster": {
      initials: "MA",
      subtitle: "Maison horlogère · Genève",
      status: "Client vérifié",
      facts: [
        {
          label: "Contact principal",
          value: "Julien Morel · Directeur technique",
        },
        { label: "E-mail", value: "j.morel@maison-aster.ch" },
        {
          label: "Projet actif",
          value: "EUR-024 · Calibre automatique 3 aiguilles",
        },
        { label: "Facturation", value: "Paiements et informations à jour" },
      ],
      metrics: [
        { label: "Projets confiés", value: "8" },
        { label: "Projets actifs", value: "2" },
        { label: "Validations moyennes", value: "2,1 jours" },
        { label: "Volume", value: "CHF 286’000" },
      ],
    },
    "Atelier Meridian": {
      initials: "AM",
      subtitle: "Atelier indépendant · La Chaux-de-Fonds",
      status: "Client vérifié",
      facts: [
        { label: "Contact principal", value: "Léa Favre · Cheffe de produit" },
        { label: "E-mail", value: "lea.favre@meridian.ch" },
        { label: "Projet actif", value: "EUR-027 · Module phase de lune" },
        { label: "Facturation", value: "Acompte reçu" },
      ],
      metrics: [
        { label: "Projets confiés", value: "4" },
        { label: "Projets actifs", value: "1" },
        { label: "Validations moyennes", value: "1,6 jour" },
        { label: "Volume", value: "CHF 118’500" },
      ],
    },
    "Nivalis Genève": {
      initials: "NG",
      subtitle: "Haute horlogerie · Genève",
      status: "Validation en attente",
      facts: [
        {
          label: "Contact principal",
          value: "Antoine Keller · Responsable R&D",
        },
        { label: "E-mail", value: "a.keller@nivalis-geneve.ch" },
        {
          label: "Projet actif",
          value: "EUR-019 · Mise en plans d’un tourbillon",
        },
        { label: "Facturation", value: "Solde à la validation finale" },
      ],
      metrics: [
        { label: "Projets confiés", value: "6" },
        { label: "Projets actifs", value: "1" },
        { label: "Validations moyennes", value: "2,8 jours" },
        { label: "Volume", value: "CHF 412’000" },
      ],
    },
    "Orbe Manufacture": {
      initials: "OM",
      subtitle: "Manufacture · Le Locle",
      status: "Nouveau mandataire",
      facts: [
        {
          label: "Contact principal",
          value: "Camille Robert · Responsable innovation",
        },
        { label: "E-mail", value: "c.robert@orbe-manufacture.ch" },
        {
          label: "Demande en cours",
          value: "EUR-031 · Étude barillet longue réserve",
        },
        { label: "Facturation", value: "Profil administratif validé" },
      ],
      metrics: [
        { label: "Projets confiés", value: "1" },
        { label: "Projets actifs", value: "0" },
        { label: "Devis en cours", value: "1" },
        { label: "Volume", value: "CHF 37’500" },
      ],
    },
  },
};

const sectionContent: Record<
  string,
  {
    intro: string;
    stats: string[];
    items: { title: string; meta: string; tag: string }[];
  }
> = {
  Accueil: {
    intro: "Administration du domaine R&D Horlogerie.",
    stats: [],
    items: [
      { title: "Projets", meta: "", tag: "18 actifs" },
      {
        title: "Partage freelance",
        meta: "Documents, normes et standards métier",
        tag: "107 éléments",
      },
      { title: "Paramètres du domaine", meta: "", tag: "Configurer" },
    ],
  },
  Projets: {
    intro: "Piloter tous les projets du pôle R&D Horlogerie, de la demande initiale à la validation finale.",
    stats: ["18 en cours", "4 à attribuer", "7 à valider"],
    items: projects.map((p) => ({
      title: p.title,
      meta: p.id + " · " + p.client + " · Échéance " + p.due,
      tag: p.status,
    })),
  },
  "Demandes de devis": {
    intro: "Réceptionner les demandes des mandataires, fixer le prix, la classe et les crédits, puis renvoyer une proposition ajustée.",
    stats: ["3 nouvelles demandes", "2 à chiffrer", "1 contre-proposition"],
    items: [],
  },
  Freelances: {
    intro: "Consulter les profils, compétences et performances des freelances du domaine.",
    stats: ["24 freelances actifs", "92 % dans les délais", "4,7 / 5 de moyenne"],
    items: [
      {
        title: "Marc Lenoir",
        meta: "Constructeur mouvement · Classe A",
        tag: "En mission",
      },
      {
        title: "Sophie Aubert",
        meta: "Ingénieure complications · Classe B",
        tag: "Disponible",
      },
      {
        title: "Nicolas Rey",
        meta: "Spécialiste haute horlogerie · Classe S",
        tag: "En mission",
      },
      {
        title: "Élodie Marchand",
        meta: "Constructrice habillage · Classe C",
        tag: "Disponible",
      },
      {
        title: "Lucas Perrin",
        meta: "Dessinateur mise en plans · Classe D",
        tag: "Disponible",
      },
    ],
  },
  Mandataires: {
    intro: "Retrouver les entreprises mandataires, leurs contacts et l’historique de leurs projets.",
    stats: ["18 mandataires actifs", "27 projets confiés", "CHF 854k de volume"],
    items: [
      {
        title: "Maison Aster",
        meta: "Maison horlogère · Genève",
        tag: "2 projets actifs",
      },
      {
        title: "Atelier Meridian",
        meta: "Atelier indépendant · La Chaux-de-Fonds",
        tag: "1 projet actif",
      },
      {
        title: "Nivalis Genève",
        meta: "Haute horlogerie · Genève",
        tag: "À valider",
      },
      {
        title: "Orbe Manufacture",
        meta: "Manufacture · Le Locle",
        tag: "Nouveau",
      },
    ],
  },
  Documents: {
    intro: "Centraliser les documents techniques rattachés au métier et aux projets.",
    stats: ["86 documents", "6 nouveaux", "4 dossiers"],
    items: [
      {
        title: "Dossier de plans — Calibre automatique",
        meta: "EUR-024 · 18 fichiers · Mis à jour aujourd’hui",
        tag: "Projet",
      },
      {
        title: "Cahier des charges — Phase de lune",
        meta: "EUR-027 · Version 2.3 · Hier",
        tag: "Projet",
      },
      {
        title: "Bibliothèque composants standards",
        meta: "R&D Horlogerie · 126 composants",
        tag: "Métier",
      },
      {
        title: "Guide de contrôle des plans",
        meta: "Qualité · Version 4.1",
        tag: "Référence",
      },
    ],
  },
  Normes: {
    intro: "Gérer les normes obligatoires applicables aux projets horlogers.",
    stats: ["9 actives", "2 à réviser", "1 nouvelle"],
    items: [
      {
        title: "NIHS 02-10 — Dimensions d’emboîtage",
        meta: "Applicable aux mouvements mécaniques",
        tag: "Active",
      },
      {
        title: "NIHS 91-10 — Étanchéité",
        meta: "Contrôle requis avant validation",
        tag: "Active",
      },
      {
        title: "ISO 3159 — Chronomètres-bracelets",
        meta: "Révision prévue en septembre",
        tag: "À réviser",
      },
      {
        title: "Normes internes Eureka R&D",
        meta: "12 exigences complémentaires",
        tag: "Interne",
      },
    ],
  },
  "Standards métier": {
    intro: "Définir les méthodes de travail que tous les projets R&D Horlogerie doivent reprendre.",
    stats: ["12 standards", "2 brouillons", "8 obligatoires"],
    items: [
      {
        title: "Standard de construction mouvement",
        meta: "Arborescence, références et règles CAO",
        tag: "Obligatoire",
      },
      {
        title: "Standard de mise en plan",
        meta: "Cartouche, cotation et tolérances",
        tag: "Obligatoire",
      },
      {
        title: "Nomenclature des composants",
        meta: "Codification commune Eureka Horlogerie",
        tag: "Actif",
      },
      {
        title: "Dossier de validation final",
        meta: "Structure des livrables de fin de projet",
        tag: "Brouillon",
      },
    ],
  },
  "Partage freelance": {
    intro: "Gérer les documents affichés aux freelances dans Documents de projets et Normes & standards.",
    stats: ["4 modèles de projets", "8 normes et standards"],
    items: [
      {
        title: "PV de séance",
        meta: "Word · DOCX · Modèle vierge",
        tag: "Documents de projets",
      },
      {
        title: "Fiche de livraison technique",
        meta: "Word · DOCX · Modèle vierge",
        tag: "Documents de projets",
      },
      {
        title: "Notes de séance",
        meta: "OneNote · ONE · Modèle vierge",
        tag: "Documents de projets",
      },
      {
        title: "Relevé de corrections",
        meta: "Excel · XLSX · Modèle vierge",
        tag: "Documents de projets",
      },
      {
        title: "NIHS 02-10 — Dimensions d’emboîtage",
        meta: "PDF · Norme en vigueur · Lecture seule",
        tag: "Normes & standards",
      },
      {
        title: "NIHS 91-10 — Étanchéité",
        meta: "PDF · Norme en vigueur · Lecture seule",
        tag: "Normes & standards",
      },
      {
        title: "ISO 3159 — Chronomètres-bracelets",
        meta: "PDF · Édition contrôlée · Lecture seule",
        tag: "Normes & standards",
      },
      {
        title: "Normes internes Eurêka R&D",
        meta: "Word · DOCX · Version 2.6",
        tag: "Normes & standards",
      },
      {
        title: "Standard de construction mouvement",
        meta: "PDF · Version 3.2 · Lecture seule",
        tag: "Normes & standards",
      },
      {
        title: "Standard de mise en plan",
        meta: "PDF · Version 4.1 · Lecture seule",
        tag: "Normes & standards",
      },
      {
        title: "Nomenclature des composants",
        meta: "Excel · XLSX · Version 3.0",
        tag: "Normes & standards",
      },
      {
        title: "Guide de contrôle des dossiers CAO",
        meta: "OneNote · ONE · Version 2.0",
        tag: "Normes & standards",
      },
    ],
  },
  Messagerie: {
    intro: "Échanger avec les membres du métier au sujet des projets et des règles techniques.",
    stats: ["5 non lus", "12 discussions", "3 projets"],
    items: [
      {
        title: "EUR-019 · Validation tourbillon",
        meta: "Claire : Le contrôle final est prêt.",
        tag: "2 non lus",
      },
      {
        title: "Mise à jour standard de cotation",
        meta: "Marc : J’ai ajouté les exemples demandés.",
        tag: "1 non lu",
      },
      {
        title: "EUR-027 · Attribution de la mission",
        meta: "Sophie : Je confirme ma disponibilité.",
        tag: "2 non lus",
      },
      {
        title: "Équipe R&D Horlogerie",
        meta: "Discussion générale du métier",
        tag: "Général",
      },
    ],
  },
  Calendrier: {
    intro: "Visualiser les échéances, validations et réunions du métier.",
    stats: ["6 échéances", "3 réunions", "2 validations"],
    items: [
      {
        title: "Contrôle intermédiaire EUR-024",
        meta: "Lundi 18 août · 09:30",
        tag: "Contrôle",
      },
      {
        title: "Réunion standards R&D",
        meta: "Mardi 19 août · 14:00",
        tag: "Réunion",
      },
      {
        title: "Validation finale EUR-019",
        meta: "Jeudi 21 août · 10:00",
        tag: "Validation",
      },
      {
        title: "Attribution EUR-027",
        meta: "Vendredi 22 août · 11:30",
        tag: "Projet",
      },
    ],
  },
  "Statistiques métier": {
    intro: "Analyser uniquement la performance du pôle R&D Horlogerie.",
    stats: ["486k CHF volume", "92% satisfaction", "68 jours moyens"],
    items: [
      {
        title: "Projets terminés ce trimestre",
        meta: "12 projets · +20% par rapport au trimestre précédent",
        tag: "12",
      },
      {
        title: "Respect des délais",
        meta: "21 projets sur 24 livrés à temps",
        tag: "87,5%",
      },
      {
        title: "Taux de validation au premier passage",
        meta: "Progression de 6 points",
        tag: "81%",
      },
      {
        title: "Charge moyenne des membres",
        meta: "Objectif conseillé : 75%",
        tag: "72%",
      },
    ],
  },
  Paramétrage: {
    intro: "Définir les règles de gestion propres au domaine R&D Horlogerie.",
    stats: [],
    items: [],
  },
};

const homeNotifications: Record<string, { title: string; meta: string; tag: string; level: string }[]> = {
  "Admin métier": [
    {
      title: "Deadline dans 3 jours",
      meta: "EUR-024 · Calibre automatique",
      tag: "18 août",
      level: "urgent",
    },
    {
      title: "Nouvelle demande de devis",
      meta: "DEV-034 · Petite seconde décentrée",
      tag: "À traiter",
      level: "new",
    },
  ],
  Freelance: [
    {
      title: "Deadline dans 3 jours",
      meta: "Livraison du rouage · EUR-024",
      tag: "18 août",
      level: "urgent",
    },
    {
      title: "Nouvelle proposition de mission",
      meta: "Module phase de lune · EUR-027",
      tag: "À répondre",
      level: "new",
    },
  ],
  Mandataire: [
    {
      title: "Nouveau devis disponible",
      meta: "DEV-031 · Barillet longue réserve",
      tag: "À valider",
      level: "new",
    },
    {
      title: "Validation avant le 21 août",
      meta: "Livrable final · EUR-019",
      tag: "Deadline",
      level: "urgent",
    },
  ],
};

function ProjectSessions({ projectTitle, role }: { projectTitle: string; role: string }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const nextRef = useRef<HTMLElement>(null);
  const [selectedIndex, setSelectedIndex] = useState(3);
  const [openedIndex, setOpenedIndex] = useState<number | null>(null);
  const [detailTab, setDetailTab] = useState("Documents");
  const [validatedSessions, setValidatedSessions] = useState<number[]>([0, 1]);
  const [documents, setDocuments] = useState<Record<number, { name: string; type: string; author: string }[]>>({
    0: [
      {
        name: "PV — Réunion de lancement.pdf",
        type: "PDF",
        author: "Mandataire",
      },
      { name: "Notes de lancement.one", type: "ONENOTE", author: "Freelance" },
    ],
    1: [
      {
        name: "Cahier des charges validé.pdf",
        type: "PDF",
        author: "Mandataire",
      },
    ],
    2: [{ name: "Rouage_intermediaire.step", type: "STEP", author: "Freelance" }],
  });
  const [summaries, setSummaries] = useState<Record<number, Record<string, string>>>({
    0: {
      objectives: "Lancer le projet et valider l’organisation générale.",
      subjects: "Organisation du projet, responsabilités et calendrier général.",
      conclusion: "L’équipe et le périmètre sont validés.",
      decisions: "Démarrer la construction sur la variante B.",
      actions: "Freelance : préparer la première maquette CAO.",
      openPoints: "Confirmer la tolérance du diamètre d’emboîtage.",
      nextStep: "Revue du cadrage technique.",
    },
    1: {
      objectives: "Valider le cadrage technique et le cahier des charges.",
      subjects: "Exigences fonctionnelles et contraintes d’encombrement.",
      conclusion: "Le cahier des charges est conforme.",
      decisions: "Validation officielle du jalon de cadrage.",
      actions: "Mandataire : signer le PV. Freelance : lancer l’étude détaillée.",
      openPoints: "Aucun point bloquant.",
      nextStep: "Revue des premières solutions.",
    },
    2: {
      objectives: "Examiner la construction et les premières solutions proposées.",
      subjects: "Architecture du rouage et premières simulations.",
      conclusion: "La solution est viable avec deux ajustements.",
      decisions: "Conserver le rapport de transmission proposé.",
      actions: "Freelance : corriger les deux entraxes signalés.",
      openPoints: "Contrôler la réserve de marche simulée.",
      nextStep: "Validation intermédiaire.",
    },
  });
  const sessions = [
    {
      date: "04 août",
      objective: "Lancement du projet et validation de l’organisation",
      status: "Terminée",
      kind: "past",
      mandatory: false,
    },
    {
      date: "08 août",
      objective: "Cadrage technique et validation du cahier des charges",
      status: "Jalon obligatoire 1",
      kind: "past",
      mandatory: true,
    },
    {
      date: "13 août",
      objective: "Revue de la construction et des premières solutions",
      status: "Terminée",
      kind: "past",
      mandatory: false,
    },
    {
      date: "20 août",
      objective: "Validation intermédiaire de la solution retenue",
      status: "Prochaine séance",
      kind: "next",
      mandatory: true,
    },
    {
      date: "29 août",
      objective: "Contrôle des plans et des livrables intermédiaires",
      status: "À venir",
      kind: "future",
      mandatory: false,
    },
    {
      date: "08 sept.",
      objective: "Pré-validation technique avant livraison",
      status: "À venir",
      kind: "future",
      mandatory: false,
    },
    {
      date: "18 sept.",
      objective: "Livraison technique et validation finale du projet",
      status: "Jalon obligatoire 3",
      kind: "future",
      mandatory: true,
    },
  ];
  useEffect(() => {
    const track = trackRef.current;
    const next = nextRef.current;
    if (track && next) track.scrollLeft = next.offsetLeft - track.clientWidth / 2 + next.clientWidth / 2;
  }, [projectTitle]);
  const move = (direction: number) => trackRef.current?.scrollBy({ left: direction * 300, behavior: "smooth" });
  const openSession = (index: number) => {
    setSelectedIndex(index);
    setOpenedIndex(index);
    setDetailTab("Documents");
  };
  const addFile = (index: number, author: string, file?: File) => {
    if (!file) return;
    const extension = (file.name.split(".").pop() || "FICHIER").toUpperCase();
    setDocuments((current) => ({
      ...current,
      [index]: [...(current[index] || []), { name: file.name, type: extension, author }],
    }));
  };
  const summaryFields = [
    { key: "objectives", label: "Objectifs de la séance" },
    { key: "subjects", label: "Sujets abordés" },
    { key: "conclusion", label: "Conclusion de la séance" },
    { key: "decisions", label: "Décisions prises" },
    { key: "actions", label: "Actions et responsables" },
    { key: "openPoints", label: "Points ouverts" },
    { key: "nextStep", label: "Prochaine étape" },
  ];
  const currentSummary = summaries[openedIndex ?? selectedIndex] || {};
  const updateSummary = (key: string, value: string) => {
    const index = openedIndex ?? selectedIndex;
    setSummaries((current) => ({
      ...current,
      [index]: { ...(current[index] || {}), [key]: value },
    }));
  };
  const openedSession = openedIndex !== null ? sessions[openedIndex] : null;
  const isValidated = openedIndex !== null && validatedSessions.includes(openedIndex);
  const isRecentSession = openedIndex === 2;
  const canFreelanceEdit = role === "Freelance" && isRecentSession && !isValidated;
  const canMandataireValidate = role === "Mandataire" && isRecentSession && !isValidated;
  const summaryLocked = !canFreelanceEdit;
  const workflowLabel = isValidated ? "PV validé · Lecture seule" : isRecentSession ? (role === "Freelance" ? "18 h restantes pour compléter le PV" : "PV transmis · Validation requise") : openedSession?.kind === "past" ? "Délai de 24 h terminé" : "Disponible après la séance";
  const selectAndCenter = (index: number, card: HTMLElement) => {
    setSelectedIndex(index);
    const track = trackRef.current;
    if (track)
      track.scrollTo({
        left: card.offsetLeft - track.clientWidth / 2 + card.clientWidth / 2,
        behavior: "smooth",
      });
  };
  return (
    <>
      <section className="sessions-wheel" aria-label="Historique et prochaines séances">
        <div className="sessions-head">
          <div>
            <span>SUIVI DES SÉANCES</span>
            <h3>Historique et séances à venir</h3>
          </div>
          <div>
            <button onClick={() => move(-1)} aria-label="Voir les séances précédentes">
              ‹
            </button>
            <button onClick={() => move(1)} aria-label="Voir les séances suivantes">
              ›
            </button>
          </div>
        </div>
        <div className="sessions-track" ref={trackRef}>
          {sessions.map((session, index) => (
            <article
              ref={session.kind === "next" ? nextRef : undefined}
              tabIndex={0}
              onClick={(event) => selectAndCenter(index, event.currentTarget)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  selectAndCenter(index, event.currentTarget);
                }
              }}
              className={`${session.kind} ${session.mandatory ? "mandatory" : ""} ${selectedIndex === index ? "selected" : ""}`}
              key={session.date + session.objective}
            >
              <div className="session-index">{index + 1}</div>
              <span className="session-state">{session.status}</span>
              <h4>{projectTitle}</h4>
              <small>OBJECTIF DE LA SÉANCE</small>
              <p>{session.objective}</p>
              <time>{session.date} 2026</time>
              {session.mandatory && <b>JALON OBLIGATOIRE</b>}
              <button
                className="session-open"
                onClick={(event) => {
                  event.stopPropagation();
                  openSession(index);
                }}
              >
                Ouvrir
              </button>
            </article>
          ))}
        </div>
        <div className="sessions-legend">
          <span>
            <i></i>Historique
          </span>
          <span>
            <i></i>Prochaine séance
          </span>
          <span>
            <i></i>À venir
          </span>
        </div>
      </section>
      {openedSession && openedIndex !== null && (
        <div className="session-detail-overlay" onMouseDown={() => setOpenedIndex(null)}>
          <section className="project-popup session-detail-popup" onMouseDown={(event) => event.stopPropagation()}>
            <div className="project-popup-head">
              <div>
                <span>
                  SÉANCE {openedIndex + 1} · {openedSession.status.toUpperCase()}
                </span>
                <h2>{projectTitle}</h2>
                <p>
                  {openedSession.objective} · {openedSession.date} 2026
                </p>
              </div>
              <button className="project-close" onClick={() => setOpenedIndex(null)} aria-label="Fermer la séance">
                ×
              </button>
            </div>
            <nav className="project-tabs session-detail-tabs" aria-label="Contenu de la séance">
              {["Documents", "Résumé"].map((tab) => (
                <button key={tab} className={detailTab === tab ? "active" : ""} onClick={() => setDetailTab(tab)}>
                  {tab}
                </button>
              ))}
            </nav>
            <div className="project-popup-body session-detail-body">
              {detailTab === "Documents" ? (
                <>
                  <div className="session-section-heading">
                    <div>
                      <span>FICHIERS DE LA SÉANCE</span>
                      <h3>Documents partagés</h3>
                    </div>
                    <div className="session-upload-actions">
                      <label>
                        ＋ Ajouter comme Freelance
                        <input type="file" accept=".pdf,.one,.onepkg,.step,.stp,.doc,.docx,.xlsx" onChange={(event) => addFile(openedIndex, "Freelance", event.target.files?.[0])} />
                      </label>
                      <label>
                        ＋ Ajouter comme Mandataire
                        <input type="file" accept=".pdf,.one,.onepkg,.step,.stp,.doc,.docx,.xlsx" onChange={(event) => addFile(openedIndex, "Mandataire", event.target.files?.[0])} />
                      </label>
                    </div>
                  </div>
                  <div className="session-documents">
                    {(documents[openedIndex] || []).length ? (
                      (documents[openedIndex] || []).map((doc, index) => (
                        <article key={doc.name + index}>
                          <i>{doc.type}</i>
                          <div>
                            <b>{doc.name}</b>
                            <span>Ajouté par {doc.author}</span>
                          </div>
                          <button aria-label={`Ouvrir ${doc.name}`}>Ouvrir</button>
                        </article>
                      ))
                    ) : (
                      <div className="empty-session-docs">Aucun document ajouté à cette séance.</div>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <div className="session-section-heading">
                    <div>
                      <span>COMPTE RENDU</span>
                      <h3>Résumé de la séance</h3>
                    </div>
                    <em>{workflowLabel}</em>
                  </div>
                  <div className={`pv-workflow ${isValidated ? "validated" : isRecentSession ? "pending" : "locked"}`}>
                    <i>{isValidated ? "✓" : isRecentSession ? "24 h" : "🔒"}</i>
                    <div>
                      <b>{isValidated ? "Procès-verbal validé" : isRecentSession ? "Circuit de validation en cours" : "Résumé verrouillé"}</b>
                      <span>{isValidated ? "Ce résumé a été validé par le mandataire et ne peut plus être modifié." : isRecentSession ? "Le freelance complète le PV sous 24 h, puis le mandataire le valide." : "La période de saisie est terminée. Le contenu reste consultable uniquement."}</span>
                    </div>
                  </div>
                  <div className={`session-summary-grid ${summaryLocked ? "read-only" : ""}`}>
                    {summaryFields.map((field) => (
                      <label key={field.key}>
                        <span>{field.label}</span>
                        <textarea disabled={summaryLocked} value={currentSummary[field.key] || ""} onChange={(event) => updateSummary(field.key, event.target.value)} placeholder="Saisir les informations à la fin de la séance…" />
                      </label>
                    ))}
                  </div>
                  <div className="summary-save">
                    {canFreelanceEdit && <button>Enregistrer et envoyer au mandataire</button>}
                    {canMandataireValidate && <button onClick={() => setValidatedSessions((current) => [...current, openedIndex])}>✓ Valider définitivement le PV</button>}
                    {summaryLocked && !canMandataireValidate && <span className="summary-locked">🔒 Aucune modification possible</span>}
                  </div>
                </>
              )}
            </div>
          </section>
        </div>
      )}
    </>
  );
}

function QuoteRequestsBoard() {
  const requests = [
    {
      id: "DEV-034",
      title: "Petite seconde décentrée",
      client: "Maison Aster",
      received: "Aujourd’hui · 09:42",
      status: "Nouvelle demande",
      budget: "Budget souhaité : CHF 18’000",
      need: "Adapter une petite seconde sur un mouvement existant, avec étude d’intégration et dossier de plans.",
      price: "CHF 21’500",
      rank: "C",
      credits: "30",
      duration: "6 semaines",
      document: "Demande_de_devis_petite_seconde.docx",
      documentType: "Word",
      documentFormat: "DOCX",
    },
    {
      id: "DEV-031",
      title: "Étude barillet longue réserve",
      client: "Orbe Manufacture",
      received: "Hier · 15:18",
      status: "Contre-proposition",
      budget: "Objectif client : inférieur à CHF 35’000",
      need: "Étudier un barillet longue réserve et fournir les simulations, la construction et les plans de principe.",
      price: "CHF 38’400",
      rank: "A",
      credits: "80",
      duration: "14 semaines",
      document: "Parametres_barillet_longue_reserve.xlsx",
      documentType: "Excel",
      documentFormat: "XLSX",
    },
    {
      id: "DEV-029",
      title: "Dossier de plans calibre existant",
      client: "Atelier Meridian",
      received: "16 août · 11:05",
      status: "Proposition envoyée",
      budget: "Budget communiqué : CHF 7’500",
      need: "Finaliser la mise en plans et la nomenclature d’un calibre déjà construit.",
      price: "CHF 7’200",
      rank: "D",
      credits: "15",
      duration: "3 semaines",
      document: "Demande_mise_en_plans_calibre.docx",
      documentType: "Word",
      documentFormat: "DOCX",
    },
  ];
  const [selected, setSelected] = useState<(typeof requests)[number] | null>(null);
  const [tab, setTab] = useState("Demande");
  const [price, setPrice] = useState(requests[0].price);
  const [rank, setRank] = useState(requests[0].rank);
  const [credits, setCredits] = useState(requests[0].credits);
  const [duration, setDuration] = useState(requests[0].duration);
  const [billing, setBilling] = useState("Paiement en 3 fois · 30 % / 40 % / 30 %");
  const [note, setNote] = useState("");
  const [sent, setSent] = useState(false);
  const [stageUploads, setStageUploads] = useState<Record<string, { name: string; format: string }[]>>({});
  const openRequest = (request: (typeof requests)[number]) => {
    setSelected(request);
    setTab("Demande");
    setPrice(request.price);
    setRank(request.rank);
    setCredits(request.credits);
    setDuration(request.duration);
    setNote("");
    setSent(false);
  };
  const rankCredits: Record<string, string> = {
    D: "15",
    C: "30",
    B: "50",
    A: "75",
    S: "100",
  };
  const tabs = ["Demande", "Document mandataire", "Chiffrage", "Facturation", "Révision", "Historique"];
  const currentRequest = selected || requests[0];
  const stageDocuments: Record<string, { name: string; type: string; format: string; author: string; status: string }[]> = {
    Demande: [{ name: currentRequest.document, type: currentRequest.documentType, format: currentRequest.documentFormat, author: currentRequest.client, status: "Document reçu" }],
    "Document mandataire": [{ name: currentRequest.document, type: currentRequest.documentType, format: currentRequest.documentFormat, author: currentRequest.client, status: "Document original" }],
    Chiffrage: [{ name: "Chiffrage_admin_metier.xlsx", type: "Excel", format: "XLSX", author: "Claire Dubois", status: "À compléter hors plateforme" }],
    Facturation: [{ name: "Conditions_de_facturation.docx", type: "Word", format: "DOCX", author: "Admin métier", status: "Modèle disponible" }],
    Révision: [{ name: "Proposition_revisee.xlsx", type: "Excel", format: "XLSX", author: "Claire Dubois", status: currentRequest.status === "Contre-proposition" ? "Révision demandée" : "Aucune révision demandée" }],
    Historique: [
      { name: currentRequest.document, type: currentRequest.documentType, format: currentRequest.documentFormat, author: currentRequest.client, status: "Version 1 · Demande" },
      { name: "Proposition_admin_v1.pdf", type: "PDF", format: "PDF", author: "Admin métier", status: "Version 2 · Proposition" },
    ],
  };
  return (
    <section className="quote-workspace">
      <div className="quote-workspace-head">
        <div>
          <span>FLUX MANDATAIRES → ADMIN MÉTIER</span>
          <h3>Demandes reçues</h3>
          <p>Cliquez sur un devis pour ouvrir sa fiche complète et configurer la proposition.</p>
        </div>
        <button>＋ Créer un devis manuel</button>
      </div>
      <div className="quote-kpis">
        <article>
          <b>3</b>
          <span>Nouvelles demandes</span>
        </article>
        <article>
          <b>2</b>
          <span>À chiffrer</span>
        </article>
        <article>
          <b>1</b>
          <span>Négociation en cours</span>
        </article>
        <article>
          <b>5 j</b>
          <span>Délai moyen de réponse</span>
        </article>
      </div>
      <div className="quote-card-grid">
        {requests.map((request) => (
          <button key={request.id} onClick={() => openRequest(request)}>
            <span>
              <i>{request.id}</i>
              <em>{request.status}</em>
            </span>
            <h3>{request.title}</h3>
            <p>
              {request.client} · {request.received}
            </p>
            <div>
              <strong>{request.price}</strong>
              <b>Classe {request.rank}</b>
              <b>{request.credits} crédits</b>
            </div>
            <small>Ouvrir le devis →</small>
          </button>
        ))}
      </div>
      {selected && (
        <div className="project-overlay" onMouseDown={() => setSelected(null)}>
          <section className="project-popup quote-popup" onMouseDown={(event) => event.stopPropagation()}>
            <div className="project-popup-head">
              <div>
                <span>DEMANDE DE DEVIS · {selected.id}</span>
                <h2>{selected.title}</h2>
                <p>
                  {selected.client} · Reçue {selected.received}
                </p>
              </div>
              <button className="project-close" onClick={() => setSelected(null)} aria-label="Fermer le devis">
                ×
              </button>
            </div>
            <nav className="project-tabs quote-tabs" aria-label="Informations du devis">
              {tabs.map((item) => (
                <button key={item} className={tab === item ? "active" : ""} onClick={() => setTab(item)}>
                  {item}
                </button>
              ))}
            </nav>
            <div className="project-popup-body quote-popup-body">
              <div className="project-tab-title">
                <span>{tab}</span>
                <em>{selected.status}</em>
              </div>
              <div className="quote-document-stage">
                <div className="quote-document-stage-head">
                  <div><span>DOCUMENTS DU DEVIS</span><h3>{tab}</h3><p>Les informations sont complétées dans les fichiers Word ou Excel, puis déposées ici.</p></div>
                  <label>＋ Déposer un document<input type="file" accept=".doc,.docx,.xls,.xlsx,.pdf" onChange={(event) => { const file = event.target.files?.[0]; if (!file) return; const format = (file.name.split(".").pop() || "FICHIER").toUpperCase(); setStageUploads((current) => ({ ...current, [tab]: [...(current[tab] || []), { name: file.name, format }] })); }} /></label>
                </div>
                <div className="quote-stage-file-grid">
                  {[...stageDocuments[tab], ...(stageUploads[tab] || []).map((file) => ({ ...file, type: file.format, author: "Vous", status: "Ajouté à l’instant" }))].map((document, index) => (
                    <article key={`${document.name}-${index}`}>
                      <i><b>{document.format}</b><span>▤</span></i>
                      <div><small>{document.status}</small><h4>{document.name}</h4><p>Type de fichier : {document.type} · Déposé par {document.author}</p></div>
                      <button>Consulter</button>
                    </article>
                  ))}
                </div>
              </div>
              {false && tab === "Demande" && (
                <div className="quote-tab-content">
                  <div className="client-budget">
                    <i>₣</i>
                    <div>
                      <b>Attente du mandataire</b>
                      <span>{selected?.budget}</span>
                    </div>
                  </div>
                  <div className="quote-request-summary">
                    <article>
                      <span>DESCRIPTION DU BESOIN</span>
                      <p>{selected?.need}</p>
                    </article>
                    <article>
                      <span>MANDATAIRE</span>
                      <b>{selected?.client}</b>
                      <small>Client vérifié · R&D Horlogerie</small>
                    </article>
                    <article>
                      <span>DOCUMENTS REÇUS</span>
                      <b>{selected?.document}</b>
                      <small>{selected?.documentType} · {selected?.documentFormat} · Déposé par {selected?.client}</small>
                      <button className="quote-document-link" onClick={() => setTab("Document mandataire")}>Consulter le document →</button>
                    </article>
                  </div>
                </div>
              )}
              {false && tab === "Document mandataire" && (
                <div className="quote-tab-content quote-mandate-document">
                  <div className="quote-document-card">
                    <div className="template-file-icon"><b>{selected?.documentFormat}</b><i>▤</i></div>
                    <span>DOCUMENT DÉPOSÉ PAR LE MANDATAIRE</span>
                    <h3>{selected?.document}</h3>
                    <strong>Type de fichier : {selected?.documentType} · {selected?.documentFormat}</strong>
                    <p>Ce document contient les informations et les paramètres transmis par le mandataire pour permettre à l’administrateur métier de préparer le devis.</p>
                    <small>Déposé par <b>{selected?.client}</b> · {selected?.received}</small>
                  </div>
                  <div className="quote-document-preview">
                    <span>APERÇU DU DOCUMENT</span>
                    <h3>Demande de devis — {selected?.title}</h3>
                    <div><b>Mandataire</b><p>{selected?.client}</p></div>
                    <div><b>Besoin communiqué</b><p>{selected?.need}</p></div>
                    <div><b>Budget souhaité</b><p>{selected?.budget}</p></div>
                    <em>Le modèle Word ou Excel définitif sera configuré plus tard dans l’espace mandataire.</em>
                  </div>
                </div>
              )}
              {false && tab === "Paramètres mandataire" && (
                <div className="quote-tab-content mandate-parameters">
                  <div className="mandate-parameters-head">
                    <div>
                      <span>CONFIGURATION TRANSMISE AVEC LA DEMANDE</span>
                      <h3>Résumé des paramètres sélectionnés</h3>
                      <p>Ces choix ont été renseignés par le mandataire. Ils sont en lecture seule et servent de base au chiffrage de l’admin métier.</p>
                    </div>
                    <em>12 paramètres reçus</em>
                  </div>
                  <div className="mandate-parameter-groups">
                    <section>
                      <span>1 · PÉRIMÈTRE DU PROJET</span>
                      <article>
                        <small>TYPE DE DEMANDE</small>
                        <b>Adaptation sur mouvement existant</b>
                      </article>
                      <article>
                        <small>MOUVEMENT DE BASE</small>
                        <b>Calibre mécanique fourni par le mandataire</b>
                      </article>
                      <article>
                        <small>COMPLICATION PRINCIPALE</small>
                        <b>Petite seconde décentrée</b>
                      </article>
                      <article>
                        <small>EXCLUSIVITÉ DEMANDÉE</small>
                        <b>Architecture réservée au mandataire</b>
                      </article>
                    </section>
                    <section>
                      <span>2 · NIVEAU TECHNIQUE</span>
                      <article>
                        <small>NIVEAU DE FINITION</small>
                        <b>Haute horlogerie</b>
                      </article>
                      <article>
                        <small>RÉSERVE DE MARCHE CIBLE</small>
                        <b>Supérieure à 60 heures</b>
                      </article>
                      <article>
                        <small>FRÉQUENCE DU MOUVEMENT</small>
                        <b>3 Hz · 21’600 alternances/heure</b>
                      </article>
                      <article>
                        <small>TOLÉRANCES</small>
                        <b>Standard R&D Horlogerie renforcé</b>
                      </article>
                    </section>
                    <section>
                      <span>3 · LIVRABLES ATTENDUS</span>
                      <article>
                        <small>CONSTRUCTION CAO</small>
                        <b>Maquette 3D complète sous Inventor</b>
                      </article>
                      <article>
                        <small>MISE EN PLANS</small>
                        <b>Dossier complet de fabrication</b>
                      </article>
                      <article>
                        <small>PROTOTYPE</small>
                        <b>Assemblage et contrôle fonctionnel requis</b>
                      </article>
                      <article>
                        <small>DOCUMENTATION FINALE</small>
                        <b>Nomenclature, calculs et dossier de validation</b>
                      </article>
                    </section>
                    <section>
                      <span>4 · ORGANISATION & CONTRAINTES</span>
                      <article>
                        <small>DÉLAI SOUHAITÉ</small>
                        <b>Livraison sous 6 semaines</b>
                      </article>
                      <article>
                        <small>JALONS DE SUIVI</small>
                        <b>3 jalons obligatoires + 2 revues techniques</b>
                      </article>
                      <article>
                        <small>MODE DE FACTURATION PRÉFÉRÉ</small>
                        <b>Paiement en 3 fois</b>
                      </article>
                      <article>
                        <small>CONFIDENTIALITÉ</small>
                        <b>NDA renforcé · accès strictement limité</b>
                      </article>
                    </section>
                  </div>
                  <div className="parameter-impact">
                    <i>◇</i>
                    <div>
                      <b>Impact estimé sur le devis</b>
                      <span>Les choix « haute horlogerie », « dossier de plans complet », « prototype requis » et « exclusivité » augmentent le niveau de complexité, la durée et le prix estimé.</span>
                    </div>
                    <button onClick={() => setTab("Chiffrage")}>Utiliser pour le chiffrage →</button>
                  </div>
                </div>
              )}
              {false && tab === "Chiffrage" && (
                <div className="quote-tab-content">
                  <div className="quote-fields">
                    <label>
                      PRIX PROPOSÉ
                      <input value={price} onChange={(event) => setPrice(event.target.value)} />
                    </label>
                    <label>
                      CLASSE DU PROJET
                      <select
                        value={rank}
                        onChange={(event) => {
                          setRank(event.target.value);
                          setCredits(rankCredits[event.target.value]);
                        }}
                      >
                        {["D", "C", "B", "A", "S"].map((value) => (
                          <option key={value}>{value}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      CRÉDITS DU PROJET
                      <input type="number" min="1" max="100" value={credits} onChange={(event) => setCredits(event.target.value)} />
                    </label>
                    <label>
                      DURÉE ESTIMÉE
                      <input value={duration} onChange={(event) => setDuration(event.target.value)} />
                    </label>
                    <label className="wide">
                      PÉRIMÈTRE INCLUS
                      <textarea defaultValue="Étude technique, construction CAO, dossier de plans et suivi des trois jalons obligatoires." />
                    </label>
                    <label className="wide">
                      LIVRABLES
                      <textarea defaultValue="Maquette 3D, plans de fabrication, nomenclature et dossier de validation." />
                    </label>
                  </div>
                </div>
              )}
              {false && tab === "Facturation" && (
                <div className="quote-tab-content">
                  <div className="quote-fields billing-tab">
                    <label className="wide">
                      MODE DE FACTURATION
                      <select value={billing} onChange={(event) => setBilling(event.target.value)}>
                        <option>Paiement en 3 fois · 30 % / 40 % / 30 %</option>
                        <option>Forfait à la livraison</option>
                        <option>Facturation à l’heure</option>
                        <option>Facturation à la demi-journée</option>
                      </select>
                    </label>
                    <label>
                      ACOMPTE
                      <input defaultValue="30 % · CHF 6’450" />
                    </label>
                    <label>
                      JALON INTERMÉDIAIRE
                      <input defaultValue="40 % · CHF 8’600" />
                    </label>
                    <label>
                      SOLDE FINAL
                      <input defaultValue="30 % · CHF 6’450" />
                    </label>
                    <label>
                      DÉLAI DE PAIEMENT
                      <input defaultValue="30 jours" />
                    </label>
                  </div>
                  <div className="quote-adjustment">
                    <b>Paramètres du domaine appliqués</b>
                    <span>Ces options proviennent de l’onglet Paramétrage → Facturation et restent modifiables pour ce devis.</span>
                  </div>
                </div>
              )}
              {false && tab === "Révision" && (
                <div className="quote-tab-content">
                  <div className="quote-adjustment">
                    <b>Faire baisser le prix de la proposition</b>
                    <span>Réduisez le périmètre, adaptez la durée ou le mode de facturation, puis expliquez clairement la modification au mandataire.</span>
                  </div>
                  <div className="quote-fields">
                    <label>
                      NOUVEAU PRIX
                      <input value={price} onChange={(event) => setPrice(event.target.value)} />
                    </label>
                    <label>
                      NOUVELLE DURÉE
                      <input value={duration} onChange={(event) => setDuration(event.target.value)} />
                    </label>
                    <label className="wide">
                      ÉLÉMENTS RETIRÉS OU MODIFIÉS
                      <textarea placeholder="Ex. Mise en plans partielle au lieu du dossier complet…" />
                    </label>
                    <label className="wide">
                      MESSAGE AU MANDATAIRE
                      <textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Expliquez les ajustements réalisés…" />
                    </label>
                  </div>
                </div>
              )}
              {false && tab === "Historique" && (
                <div className="quote-tab-content">
                  <div className="quote-history">
                    <span>HISTORIQUE DU DEVIS</span>
                    <article>
                      <i>1</i>
                      <div>
                        <b>Demande reçue du mandataire</b>
                        <small>{selected?.received}</small>
                      </div>
                    </article>
                    {selected?.status !== "Nouvelle demande" && (
                      <article>
                        <i>2</i>
                        <div>
                          <b>Première proposition · {selected?.price}</b>
                          <small>Envoyée par Claire Dubois</small>
                        </div>
                      </article>
                    )}
                    {selected?.status === "Contre-proposition" && (
                      <article>
                        <i>3</i>
                        <div>
                          <b>Prix jugé trop élevé par le mandataire</b>
                          <small>Demande de révision reçue hier</small>
                        </div>
                      </article>
                    )}
                    {sent && (
                      <article className="latest">
                        <i>✓</i>
                        <div>
                          <b>Nouvelle proposition envoyée · {price}</b>
                          <small>
                            Classe {rank} · {credits} crédits · {duration}
                          </small>
                        </div>
                      </article>
                    )}
                  </div>
                </div>
              )}
              <footer className="quote-popup-actions">
                <span>Aucune donnée n’est saisie directement sur la plateforme.</span>
                <button className="primary">Partager les documents avec le mandataire</button>
              </footer>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}

function AdminQuoteFlow({ quotes, onTransmit }: { quotes: QuoteRequest[]; onTransmit: MvpSharedProps["onTransmitQuote"] }) {
  const pending = quotes.filter((quote) => quote.status === "pending");
  const [selected, setSelected] = useState<QuoteRequest | null>(null);
  const [form, setForm] = useState({ projectClass: "C", credits: "30", price: "", eurekaQuoteNumber: "", eurekaProjectName: "" });
  const [file, setFile] = useState<File | null>(null);
  const [addCounterQuote, setAddCounterQuote] = useState(false);
  const submit = () => {
    if (!selected || !form.price || !form.eurekaQuoteNumber.trim() || !form.eurekaProjectName.trim() || (addCounterQuote && !file)) return;
    onTransmit(selected.id, {
      projectClass: form.projectClass,
      credits: Number(form.credits),
      price: Number(form.price),
      eurekaQuoteNumber: form.eurekaQuoteNumber.trim(),
      eurekaProjectName: form.eurekaProjectName.trim(),
      eurekaFile: file ? { id: `${selected.id}-eureka`, name: "Devis Eurêka", description: "Contre-devis transmis par l’Admin Métier", fileName: file.name, url: "", sourceFile:file } : undefined,
    });
    setSelected(null);
  };
  const open = (quote: QuoteRequest) => {
    setSelected(quote);
    setFile(null);
    setAddCounterQuote(false);
    setForm({ projectClass: "C", credits: "30", price: "", eurekaQuoteNumber: `EUR-DEV-${String(quotes.indexOf(quote) + 1).padStart(3, "0")}`, eurekaProjectName: quote.projectName });
  };
  return <section className="mvp-workspace">
    <div className="mvp-board-head"><div><span>DEMANDES REÇUES</span><h3>Demandes de devis</h3><p>Ouvrez une demande pour préparer et transmettre le devis Eurêka.</p></div></div>
    <div className="mvp-card-grid">{pending.length ? pending.map((quote) => <button key={quote.id} onClick={() => open(quote)}><span>{quote.internalNumber}</span><h3>{quote.projectName}</h3><em>Ouvrir la demande →</em></button>) : <p className="mvp-empty">Aucune demande en attente.</p>}</div>
    {selected && <div className="project-overlay" onMouseDown={() => setSelected(null)}><section className="project-popup mvp-form-popup" onMouseDown={(e) => e.stopPropagation()}>
      <div className="project-popup-head"><div><span>DEMANDE · {selected.internalNumber}</span><h2>{selected.projectName}</h2></div><button className="project-close" onClick={() => setSelected(null)}>×</button></div>
      <div className="project-popup-body"><h3>Informations reçues du mandataire</h3><div className="mvp-received"><article><small>N° DU MANDATAIRE</small><b>{selected.mandataireNumber}</b></article><article><small>NOM DU PROJET</small><b>{selected.projectName}</b></article><article><small>DOCUMENT REÇU</small><a href={selected.requestFile.url} target="_blank" rel="noreferrer">{selected.requestFile.fileName}</a></article></div>
      <h3>Informations du devis Eurêka</h3><div className="mvp-form-grid"><label>Classe du projet<select value={form.projectClass} onChange={(e) => setForm({...form, projectClass:e.target.value})}>{["D","C","B","A","S"].map(v=><option key={v}>{v}</option>)}</select></label><label>Nombre de crédits<input type="number" value={form.credits} onChange={(e)=>setForm({...form,credits:e.target.value})}/></label><label>Prix du projet (CHF)<input type="number" value={form.price} onChange={(e)=>setForm({...form,price:e.target.value})}/></label><label>N° de devis Eurêka<input value={form.eurekaQuoteNumber} onChange={(e)=>setForm({...form,eurekaQuoteNumber:e.target.value})}/></label><label>Nom du projet Eurêka<input value={form.eurekaProjectName} onChange={(e)=>setForm({...form,eurekaProjectName:e.target.value})}/></label></div>
      <label className="mvp-check-field"><input type="checkbox" checked={addCounterQuote} onChange={(e)=>{setAddCounterQuote(e.target.checked);if(!e.target.checked)setFile(null)}}/><span><b>Ajouter un contre-devis</b><small>Facultatif pour cette transmission</small></span></label>
      {addCounterQuote&&<label className="mvp-file-field mvp-optional-file">Contre-devis / devis Eurêka<input type="file" accept=".doc,.docx,.xls,.xlsx,.pdf" onChange={(e)=>setFile(e.target.files?.[0]||null)}/><small>{file?.name || "Aucun fichier sélectionné"}</small></label>}
      <div className="modal-actions"><button onClick={()=>setSelected(null)}>Annuler</button><button className="primary" disabled={!form.price || !form.eurekaQuoteNumber.trim() || !form.eurekaProjectName.trim() || (addCounterQuote&&!file)} onClick={submit}>Transmettre le devis au mandataire</button></div></div>
    </section></div>}
  </section>;
}

function MandataireQuoteFlow({ mode, quotes, onCreate, onAccept, onDecision }: { mode: "requests"|"quotes"; quotes: QuoteRequest[]; onCreate: MvpSharedProps["onCreateQuote"]; onAccept: MvpSharedProps["onAcceptQuote"]; onDecision:MvpSharedProps["onQuoteDecision"] }) {
  const [createOpen,setCreateOpen]=useState(false); const [selected,setSelected]=useState<QuoteRequest|null>(null);
  const [number,setNumber]=useState(""); const [name,setName]=useState(""); const [file,setFile]=useState<File|null>(null);
  const list=quotes.filter(q=>mode==="requests"?q.status==="pending":q.status==="sent");
  const create=()=>{if(!number.trim()||!name.trim()||!file)return;onCreate({mandataireNumber:number.trim(),projectName:name.trim(),requestFile:{id:`request-${Date.now()}`,name:"Demande de devis",description:"Document envoyé par le mandataire",fileName:file.name,url:"",sourceFile:file}});setCreateOpen(false);setNumber("");setName("");setFile(null)};
  return <section className="mvp-workspace"><div className="mvp-board-head"><div><span>{mode==="requests"?"DEMANDES ENVOYÉES":"DEVIS REÇUS"}</span><h3>{mode==="requests"?"Demandes de devis":"Devis"}</h3></div>{mode==="requests"&&<button className="primary" onClick={()=>setCreateOpen(true)}>＋ Nouvelle demande de devis</button>}</div>
  <div className="mvp-card-grid">{list.length?list.map(q=><button key={q.id} onClick={()=>setSelected(q)}><span>{mode==="requests"?q.mandataireNumber:q.eurekaQuoteNumber}</span><h3>{mode==="requests"?q.projectName:q.eurekaProjectName}</h3><em>{mode==="requests"?"En attente":"Consulter le devis →"}</em></button>):<p className="mvp-empty">{mode==="requests"?"Aucune demande en attente.":"Aucun devis reçu."}</p>}</div>
  {createOpen&&<div className="modal-backdrop" onMouseDown={()=>setCreateOpen(false)}><section className="modal mvp-small-modal" onMouseDown={e=>e.stopPropagation()}><div className="modal-head"><div><span>MANDATAIRE</span><h2>Nouvelle demande de devis</h2></div><button onClick={()=>setCreateOpen(false)}>×</button></div><label>Numéro de devis personnel<input autoFocus value={number} onChange={e=>setNumber(e.target.value)} placeholder="DEV-2026-001"/></label><label>Nom du projet<input value={name} onChange={e=>setName(e.target.value)} placeholder="Petite seconde"/></label><label>Document Demande de devis<input type="file" accept=".doc,.docx,.xls,.xlsx,.pdf" onChange={e=>setFile(e.target.files?.[0]||null)}/><small>{file?.name||"Aucun fichier sélectionné"}</small></label><div className="modal-actions"><button onClick={()=>setCreateOpen(false)}>Annuler</button><button className="primary" disabled={!number.trim()||!name.trim()||!file} onClick={create}>Demander un devis</button></div></section></div>}
  {selected&&mode==="quotes"&&<div className="project-overlay" onMouseDown={()=>setSelected(null)}><section className="project-popup mvp-form-popup" onMouseDown={e=>e.stopPropagation()}><div className="project-popup-head"><div><span>DEVIS EURÊKA · {selected.eurekaQuoteNumber}</span><h2>{selected.eurekaProjectName}</h2></div><button className="project-close" onClick={()=>setSelected(null)}>×</button></div><div className="project-popup-body"><div className="mvp-received"><article><small>CLASSE</small><b>{selected.projectClass}</b></article><article><small>CRÉDITS</small><b>{selected.credits}</b></article><article><small>PRIX</small><b>CHF {selected.price?.toLocaleString("fr-CH")}</b></article><article><small>CONTRE-DEVIS</small>{selected.eurekaFile?<a href={selected.eurekaFile.url} target="_blank" rel="noreferrer">{selected.eurekaFile.fileName}</a>:<b>Non joint</b>}</article></div><div className="modal-actions"><button onClick={()=>{const message=window.prompt("Motif de la demande de modification :")||"";if(message){onDecision(selected.id,"revision",message);setSelected(null)}}}>Demander une modification</button><button onClick={()=>{if(window.confirm("Refuser ce devis ?")){onDecision(selected.id,"refuse");setSelected(null)}}}>Refuser</button><button className="primary" onClick={()=>{onAccept(selected.id);setSelected(null)}}>Accepter le devis</button></div></div></section></div>}
  </section>;
}

function AdminShareFlow({ audience, folders, onCreateFolder, onAddFile }: { audience:"freelance"|"mandataire"; folders:SharedFolder[]; onCreateFolder:MvpSharedProps["onCreateFolder"]; onAddFile:MvpSharedProps["onAddSharedFile"] }) {
  const [folder,setFolder]=useState<SharedFolder|null>(null); const [folderModal,setFolderModal]=useState(false); const [fileModal,setFileModal]=useState(false); const [name,setName]=useState(""); const [description,setDescription]=useState(""); const [file,setFile]=useState<File|null>(null);
  const liveFolder=folder?folders.find(f=>f.id===folder.id)||null:null;
  return <section className="mvp-workspace"><div className="mvp-board-head"><div><span>PARTAGE {audience.toUpperCase()}</span><h3>{liveFolder?.name||"Dossiers partagés"}</h3><p>Les éléments ajoutés sont visibles immédiatement dans l’espace {audience}.</p></div>{liveFolder&&<button onClick={()=>setFolder(null)}>← Tous les dossiers</button>}</div>
  {!liveFolder?<div className="mvp-card-grid share-folder-grid">{folders.map(f=><button key={f.id} onClick={()=>setFolder(f)}><span>DOSSIER</span><h3>{f.name}</h3><em>{f.documents.length} document{f.documents.length!==1?"s":""}</em></button>)}<button className="mvp-add-card" onClick={()=>{setName("");setFolderModal(true)}}><b>＋</b><span>Créer un dossier</span></button></div>:<div className="document-template-grid mvp-document-grid">{liveFolder.documents.map(d=><article key={d.id}><div className="template-file-icon"><b>{d.fileName.split(".").pop()?.toUpperCase()}</b><i>▤</i></div><span>DOCUMENT PARTAGÉ</span><h4>{d.name}</h4><p>{d.description}</p><small>{d.fileName}</small><footer><a href={d.url} target="_blank" rel="noreferrer">Consulter</a></footer></article>)}<button className="mvp-add-card document-add" onClick={()=>{setName("");setDescription("");setFile(null);setFileModal(true)}}><b>＋</b><span>Ajouter un document</span></button></div>}
  {folderModal&&<div className="modal-backdrop" onMouseDown={()=>setFolderModal(false)}><section className="modal mvp-small-modal" onMouseDown={e=>e.stopPropagation()}><div className="modal-head"><div><span>NOUVEAU DOSSIER</span><h2>Créer un onglet</h2></div><button onClick={()=>setFolderModal(false)}>×</button></div><label>Nom du dossier / onglet<input autoFocus value={name} onChange={e=>setName(e.target.value)}/></label><div className="modal-actions"><button onClick={()=>setFolderModal(false)}>Annuler</button><button className="primary" disabled={!name.trim()} onClick={()=>{onCreateFolder(audience,name.trim());setFolderModal(false)}}>Créer</button></div></section></div>}
  {fileModal&&liveFolder&&<div className="modal-backdrop" onMouseDown={()=>setFileModal(false)}><section className="modal mvp-small-modal" onMouseDown={e=>e.stopPropagation()}><div className="modal-head"><div><span>{liveFolder.name}</span><h2>Ajouter un document</h2></div><button onClick={()=>setFileModal(false)}>×</button></div><label>Nom du document<input autoFocus value={name} onChange={e=>setName(e.target.value)}/></label><label>Upload du document<input type="file" onChange={e=>setFile(e.target.files?.[0]||null)}/><small>{file?.name||"Aucun fichier sélectionné"}</small></label><label>Description / utilité<textarea value={description} onChange={e=>setDescription(e.target.value)}/></label><div className="modal-actions"><button onClick={()=>setFileModal(false)}>Annuler</button><button className="primary" disabled={!name.trim()||!description.trim()||!file} onClick={()=>{if(!file)return;onAddFile(audience,liveFolder.id,{id:`file-${Date.now()}`,name:name.trim(),description:description.trim(),fileName:file.name,url:"",sourceFile:file});setFileModal(false)}}>Ajouter</button></div></section></div>}
  </section>;
}

function SharedDocumentsFlow({ folders }: { folders: SharedFolder[] }) { const [folder,setFolder]=useState<SharedFolder|null>(null); const live=folder?folders.find(f=>f.id===folder.id)||null:null; const readOnly=live?.name.toLowerCase().includes("normes"); return <section className="mvp-workspace"><div className="mvp-board-head"><div><span>BIBLIOTHÈQUE PARTAGÉE</span><h3>{live?.name||"Documents"}</h3><p>Documents mis à disposition par l’Admin Métier.</p></div>{live&&<button onClick={()=>setFolder(null)}>← Tous les dossiers</button>}</div>{!live?<div className="mvp-card-grid share-folder-grid">{folders.map(f=><button key={f.id} onClick={()=>setFolder(f)}><span>DOSSIER</span><h3>{f.name}</h3><em>{f.documents.length} document{f.documents.length!==1?"s":""}</em></button>)}</div>:<div className="document-template-grid mvp-document-grid">{live.documents.length?live.documents.map(d=><article key={d.id}><div className="template-file-icon"><b>{d.fileName.split(".").pop()?.toUpperCase()}</b><i>▤</i></div><span>{readOnly?"LECTURE SEULE":"DOCUMENT PARTAGÉ"}</span><h4>{d.name}</h4><p>{d.description}</p><small>{d.fileName}</small><footer><a href={d.url} {...(readOnly?{target:"_blank",rel:"noreferrer"}:{download:d.fileName})}>{readOnly?"Consulter":"↓ Télécharger"}</a></footer></article>):<p className="mvp-empty">Aucun document dans ce dossier.</p>}</div>}</section> }

function LegalLinks(){const[opened,setOpened]=useState<{title:string;content:string;status:string}|null>(null);const open=async(kind:string)=>{const response=await fetch("/api/v1/legal");if(!response.ok)return;const data=await response.json();const document=data.documents?.find((item:{kind:string})=>item.kind===kind);if(document)setOpened(document)};return <><div className="legal-links"><button onClick={()=>void open("legal_notice")}>Mentions légales</button><button onClick={()=>void open("privacy")}>Confidentialité</button><button onClick={()=>void open("terms_of_use")}>CGU</button><button onClick={()=>void open("support")}>Support</button></div>{opened&&<div className="modal-backdrop" onMouseDown={()=>setOpened(null)}><section className="modal mvp-small-modal" onMouseDown={e=>e.stopPropagation()}><div className="modal-head"><div><span>{opened.status==="draft_legal_review"?"PROJET À VALIDER JURIDIQUEMENT":"DOCUMENT EN VIGUEUR"}</span><h2>{opened.title}</h2></div><button onClick={()=>setOpened(null)}>×</button></div><p>{opened.content}</p><div className="modal-actions"><button className="primary" onClick={()=>setOpened(null)}>Fermer</button></div></section></div>}</>}

function ProductionAccessScreen({ status, identity, trades, pendingInfo, error, onRefresh }: { status:"loading"|"anonymous"|"no-access"|"error"; identity?:{name:string;email:string}; trades:PlatformTrade[]; pendingInfo?:{kind:"admin"|"membership";label:string}; error?:string; onRefresh:()=>void }) {
  const [mode,setMode]=useState<"login"|"register"|"admin-register"|"forgot"|"reset">("login");const [emailValue,setEmailValue]=useState("");const [password,setPassword]=useState("");const [newPassword,setNewPassword]=useState("");const [displayName,setDisplayName]=useState("");const [invitationCode,setInvitationCode]=useState("");const [resetCode,setResetCode]=useState("");const [inviteRefreshToken,setInviteRefreshToken]=useState("");const [isInviteActivation,setIsInviteActivation]=useState(false);
  const [publicTrades,setPublicTrades]=useState<PlatformTrade[]>(trades);const [tradeId,setTradeId]=useState(""); const [requestedRole,setRequestedRole]=useState<"freelance"|"mandataire">("freelance"); const [message,setMessage]=useState(""); const [file,setFile]=useState<File|null>(null); const [sending,setSending]=useState(false); const [feedback,setFeedback]=useState("");
  useEffect(()=>{const fragment=new URLSearchParams(window.location.hash.slice(1));const accessToken=fragment.get("access_token");const authType=fragment.get("type");if((authType==="recovery"||authType==="invite")&&accessToken){setResetCode(accessToken);setIsInviteActivation(authType==="invite");if(authType==="invite")setInviteRefreshToken(fragment.get("refresh_token")||"");setMode("reset");window.history.replaceState(null,"",`${window.location.pathname}${window.location.search}`);return}if(fragment.get("error_code")==="otp_expired"){setFeedback("Ce lien d’invitation est expiré ou a déjà été utilisé. Demandez un nouvel e-mail d’invitation.");window.history.replaceState(null,"",`${window.location.pathname}${window.location.search}`);return}if(authType==="signup"&&accessToken){const refreshToken=fragment.get("refresh_token");const expiresIn=Number(fragment.get("expires_in"));void fetch("/api/v1/auth/session",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({accessToken,refreshToken,expiresIn})}).then(async response=>{if(!response.ok){const result=await response.json().catch(()=>({}));setFeedback(result.error||"Impossible de confirmer votre adresse e-mail.");return}window.history.replaceState(null,"",`${window.location.pathname}${window.location.search}`);onRefresh()}).catch(()=>setFeedback("Le service de confirmation est indisponible."))}},[onRefresh]);
  useEffect(()=>{if(status!=="anonymous")return;void fetch("/api/v1/public/trades",{cache:"no-store"}).then(response=>response.json()).then(data=>setPublicTrades((data.trades||[]).map((trade:any)=>({id:trade.id,name:trade.name,adminName:"",adhesionDocument:{id:"",name:"",description:"",fileName:"",url:"#"}})))).catch(()=>undefined)},[status,mode]);
  useEffect(()=>{if(!publicTrades.some(trade=>trade.id===tradeId))setTradeId(publicTrades[0]?.id||"")},[tradeId,publicTrades]);
  const submitMembership=async()=>{if(!tradeId||!file)return false;const form=new FormData();form.set("tradeId",tradeId);form.set("role",requestedRole);form.set("message",message);form.set("file",file);const response=await fetch("/api/v1/membership-requests",{method:"POST",body:form});const result=await response.json().catch(()=>({error:"Le service d’adhésion a rencontré un problème."}));if(!response.ok){setFeedback(result.error||"Demande impossible.");return false}return true};
  const authSubmit=async()=>{
    setSending(true);setFeedback("");
    const path=mode==="login"?"login":mode==="register"||mode==="admin-register"?"register":mode==="forgot"?"forgot-password":"reset-password";
    const payload=mode==="login"?{email:emailValue,password}:mode==="register"?{email:emailValue,password,name:displayName}:mode==="admin-register"?{email:emailValue,password,name:displayName,invitationCode}:mode==="forgot"?{email:emailValue}:{code:resetCode,password:newPassword};
    let requestBody:BodyInit=JSON.stringify(payload);let requestHeaders:HeadersInit={"content-type":"application/json"};
    if(mode==="register"){const form=new FormData();form.set("email",emailValue);form.set("password",password);form.set("name",displayName);form.set("tradeId",tradeId);form.set("role",requestedRole);form.set("message",message);if(file)form.set("file",file);requestBody=form;requestHeaders={}}
    const response=await fetch(`/api/v1/auth/${path}`,{method:"POST",headers:requestHeaders,body:requestBody});const raw=await response.text();let result:{error?:string;resetCode?:string;message?:string}={};try{result=raw?JSON.parse(raw):{}}catch{result={error:"Le service de connexion a rencontré un problème. Réessayez dans un instant."}}
    if(!response.ok){setSending(false);setFeedback(result.error||"Action impossible.");return}
    if(mode==="forgot"){setSending(false);setFeedback(result.message||"Si ce compte existe, un e-mail de réinitialisation a été envoyé.");setMode("reset");return}
    if(mode==="reset"){if(isInviteActivation&&inviteRefreshToken){const sessionResponse=await fetch("/api/v1/auth/session",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({accessToken:resetCode,refreshToken:inviteRefreshToken,expiresIn:3600})});if(!sessionResponse.ok){const sessionResult=await sessionResponse.json().catch(()=>({}));setSending(false);setFeedback(sessionResult.error||"Mot de passe défini, mais la connexion n’a pas pu être activée. Réessayez de vous connecter.");return}setSending(false);setIsInviteActivation(false);setInviteRefreshToken("");setNewPassword("");onRefresh();return}setSending(false);setFeedback("Mot de passe modifié. Vous pouvez vous connecter.");setPassword("");setNewPassword("");setMode("login");return}
    if(mode==="register"){setSending(false);setFeedback(result.message||"Un e-mail de confirmation vous a été envoyé.");setMode("login");setPassword("");setFile(null);return}
    setSending(false);onRefresh();
  };
  const submit=async()=>{setSending(true);setFeedback("");if(await submitMembership()){setFeedback("Votre demande a été transmise à l’Admin Métier.");setFile(null);onRefresh()}setSending(false)};
  if(status==="loading")return <main className="login-screen"><section className="login-card"><EurekaLogo/><span>EURÊKA GROUP · V1 PRIVÉE</span><h1>Chargement sécurisé…</h1><p>Vérification de votre session et de vos autorisations.</p></section></main>;
  if(status==="anonymous")return <main className="login-screen"><section className="login-card"><EurekaLogo/><span>EURÊKA GROUP · COMPTES EURÊKA</span><h1>{mode==="login"?"Connexion":mode==="register"?"Créer un compte":mode==="admin-register"?"Activer une invitation":mode==="forgot"?"Mot de passe oublié":isInviteActivation?"Activer votre compte":"Réinitialiser le mot de passe"}</h1>
    {(mode==="register"||mode==="admin-register")&&<label>Nom complet<input value={displayName} onChange={e=>setDisplayName(e.target.value)} autoComplete="name"/></label>}
    {mode!=="reset"&&<label>{mode==="login"||mode==="forgot"?"Identifiant Eurêka ou adresse e-mail":"Adresse e-mail personnelle"}<input type={mode==="register"||mode==="admin-register"?"email":"text"} value={emailValue} onChange={e=>setEmailValue(e.target.value)} autoComplete="email"/></label>}
    {(mode==="login"||mode==="register"||mode==="admin-register")&&<label>Mot de passe<input type="password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete={mode==="login"?"current-password":"new-password"}/><small>10 caractères minimum, dont un chiffre.</small></label>}
    {mode==="register"&&<><label>Type de compte<select value={requestedRole} onChange={e=>setRequestedRole(e.target.value as "freelance"|"mandataire")}><option value="freelance">Freelance</option><option value="mandataire">Mandataire</option></select></label><label>Métier<select value={tradeId} onChange={e=>setTradeId(e.target.value)}>{publicTrades.map(trade=><option key={trade.id} value={trade.id}>{trade.name}</option>)}</select></label><label>Message<textarea value={message} onChange={e=>setMessage(e.target.value)} placeholder="Présentez brièvement votre demande."/></label><label>Document d’adhésion rempli<input type="file" accept=".doc,.docx,.xls,.xlsx,.pdf" onChange={e=>setFile(e.target.files?.[0]||null)}/><small>{file?.name||"Aucun fichier sélectionné"}</small></label></>}
    {mode==="admin-register"&&<label>Code d’invitation administrateur<input type="password" value={invitationCode} onChange={e=>setInvitationCode(e.target.value)} autoComplete="off"/><small>Le rôle et le métier sont déterminés par l’invitation créée par l’Admin global.</small></label>}
    {mode==="reset"&&<label>Nouveau mot de passe<input type="password" value={newPassword} onChange={e=>setNewPassword(e.target.value)} autoComplete="new-password"/><small>{isInviteActivation?"Choisissez un mot de passe pour votre compte. ":""}10 caractères minimum, dont un chiffre.</small></label>}
    {feedback&&<p className="auth-feedback">{feedback}</p>}
    <button className="primary login-submit" disabled={sending||(mode!=="reset"&&!emailValue)||(mode==="login"&&!password)||(mode==="register"&&(!displayName||!password||!tradeId||!file))||(mode==="admin-register"&&(!displayName||!password||!invitationCode))||(mode==="reset"&&(!resetCode||newPassword.length<10||!/\d/.test(newPassword)))} onClick={authSubmit}>{sending?"Traitement…":mode==="login"?"Se connecter":mode==="register"?"Créer mon compte et transmettre ma demande":mode==="admin-register"?"Activer mon compte invité":mode==="forgot"?"Envoyer un lien de réinitialisation":isInviteActivation?"Définir mon mot de passe":"Modifier le mot de passe"}</button>
    <div className="auth-links">{mode!=="login"&&<button onClick={()=>{setMode("login");setFeedback("")}}>J’ai déjà un compte</button>}{mode==="login"&&<><button onClick={()=>{setMode("register");setFeedback("")}}>Créer un compte</button><button onClick={()=>{setMode("admin-register");setFeedback("")}}>Activer une invitation administrateur</button><button onClick={()=>{setMode("forgot");setFeedback("")}}>Mot de passe oublié</button></>}</div><LegalLinks/></section></main>;
  if(status==="error")return <main className="login-screen"><section className="login-card"><EurekaLogo/><span>EURÊKA GROUP · ACCÈS SÉCURISÉ</span><h1>Connexion indisponible</h1><p>{error||"Impossible de charger la plateforme."}</p><button className="primary login-submit" onClick={onRefresh}>Réessayer</button></section></main>;
  if(pendingInfo)return <main className="login-screen"><section className="login-card"><EurekaLogo/><span>EURÊKA GROUP · VALIDATION</span><h1>Bonjour {identity?.name}</h1><p>{pendingInfo.kind==="admin"?"Votre compte administrateur est en attente de validation par un Admin global.":"Votre demande d’adhésion est en attente de validation par l’Admin métier concerné."}</p><small>{pendingInfo.label}</small><button className="login-membership" onClick={async()=>{await fetch("/api/v1/auth/logout",{method:"POST"});location.reload()}}>Se déconnecter</button></section></main>;
  return <main className="login-screen"><section className="login-card"><EurekaLogo/><span>EURÊKA GROUP · ADHÉSION</span><h1>Bonjour {identity?.name}</h1><p>Votre compte Eurêka est actif, mais il n’est encore membre d’aucun métier. Transmettez une demande d’adhésion.</p><label>Métier<select value={tradeId} onChange={e=>setTradeId(e.target.value)}>{trades.map(trade=><option key={trade.id} value={trade.id}>{trade.name}</option>)}</select></label><label>Type de compte<select value={requestedRole} onChange={e=>setRequestedRole(e.target.value as "freelance"|"mandataire")}><option value="freelance">Freelance</option><option value="mandataire">Mandataire</option></select></label><label>Message<textarea value={message} onChange={e=>setMessage(e.target.value)} placeholder="Présentez brièvement votre demande."/></label><label>Document d’adhésion rempli<input type="file" accept=".doc,.docx,.xls,.xlsx,.pdf" onChange={e=>setFile(e.target.files?.[0]||null)}/><small>{file?.name||"Aucun fichier sélectionné"}</small></label>{feedback&&<p>{feedback}</p>}<button className="primary login-submit" disabled={sending||!tradeId||!file} onClick={submit}>{sending?"Transmission…":"Transmettre la demande"}</button><button className="login-membership" onClick={async()=>{await fetch("/api/v1/auth/logout",{method:"POST"});location.reload()}}>Se déconnecter</button></section></main>;
}

function AdminEurekaPortal({ active, shared, onNavigate }: { active:string; shared:MvpSharedProps; onNavigate:(value:string)=>void }) {
  const [createOpen,setCreateOpen]=useState(false); const [inviteOpen,setInviteOpen]=useState(false); const [tradeName,setTradeName]=useState(""); const [adminName,setAdminName]=useState(""); const [adminEmail,setAdminEmail]=useState(""); const [inviteRole,setInviteRole]=useState("admin_metier");const [inviteTrade,setInviteTrade]=useState(""); const [quick,setQuick]=useState(["Métiers","Utilisateurs"]);
  const [selectedTrade,setSelectedTrade]=useState<PlatformTrade|null>(null);const [assignmentTarget,setAssignmentTarget]=useState<PlatformUser|null>(null);const [assignmentTrade,setAssignmentTrade]=useState("");
  const [deleteTarget,setDeleteTarget]=useState<{kind:"user"|"trade"|"invitation";id:string;name:string}|null>(null);
  const activeUsers=shared.users.filter(user=>user.role!=="En attente");const pendingUsers=shared.users.filter(user=>user.role==="En attente");
  return <div className="simple-page"><div className="role-top"><EurekaLogo/></div><div className="simple-heading"><span>ADMINISTRATION GLOBALE · EURÊKA GROUP</span><h2>{active}</h2><i></i><p>Supervision de la plateforme et de ses espaces métiers.</p></div>
  {active==="Accueil"&&<section className="freelance-quick-home admin-quick-home"><div><span>ACCUEIL PERSONNALISÉ</span><h3>Mes accès rapides</h3></div><div className="freelance-quick-grid">{quick.map(item=><div className="quick-card-wrap" key={item}><button onClick={()=>onNavigate(item)}><i>↗</i><b>{item}</b><small>Ouvrir cet espace</small></button><button className="quick-remove" aria-label={`Supprimer ${item}`} onClick={()=>setQuick(current=>current.filter(value=>value!==item))}>×</button></div>)}</div></section>}
  {active==="Métiers"&&<section className="mvp-workspace"><div className="mvp-board-head"><div><span>ESPACES MÉTIERS</span><h3>Métiers de la plateforme</h3></div></div><div className="mvp-card-grid">{shared.trades.map(trade=><div className="quick-card-wrap" key={trade.id}><button onClick={()=>setSelectedTrade(trade)}><span>ESPACE MÉTIER</span><h3>{trade.name}</h3><em>{shared.users.some(user=>user.tradeId===trade.id&&user.role==="Admin métier")?`Admin Métier · ${trade.adminName}`:"Aucun Admin métier actif"}</em></button><button className="quick-remove" aria-label={`Supprimer le métier ${trade.name}`} title="Supprimer le métier" onClick={()=>setDeleteTarget({kind:"trade",id:trade.id,name:trade.name})}>×</button></div>)}<button className="mvp-add-card" onClick={()=>{setTradeName("");setCreateOpen(true)}}><b>＋</b><span>Créer un métier</span></button></div></section>}
  {active==="Utilisateurs"&&<section className="mvp-workspace"><div className="mvp-board-head"><div><span>COMPTES DE LA PLATEFORME</span><h3>Utilisateurs actifs</h3><p>{activeUsers.length} comptes actifs</p></div><button onClick={()=>{setAdminName("");setAdminEmail("");setInviteRole("admin_metier");setInviteTrade(shared.trades[0]?.id||"");setInviteOpen(true)}}>＋ Inviter un responsable</button></div><div className="platform-user-list">{activeUsers.map(user=><article key={`${user.id}-${user.membershipId||user.role}`}><i>{user.name.split(" ").map(part=>part[0]).join("").slice(0,2)}</i><div><b>{user.name}</b><small>{user.eurekaEmail||user.email} · {user.tradeName} · {user.status==="suspended"?"Suspendu":"Actif"}</small></div><em>{user.role === "Admin métier" ? "Admin Métier" : user.role}</em><span className="platform-actions">{user.id!==shared.currentUser.id&&user.role!=="Admin métier"&&user.role!=="Admin Eurêka"&&<button onClick={()=>{setAssignmentTarget(user);setAssignmentTrade(shared.trades[0]?.id||"")}}>Nommer Admin métier</button>}{user.id!==shared.currentUser.id&&<button onClick={()=>{const next=user.status==="suspended"?"active":"suspended";if(window.confirm(next==="suspended"?"Suspendre ce compte ?":"Réactiver ce compte ?"))shared.onUserStatus(user.id,next)}}>{user.status==="suspended"?"Réactiver":"Suspendre"}</button>}<button className="danger-action" disabled={user.id===shared.currentUser.id} onClick={()=>setDeleteTarget({kind:"user",id:user.id,name:user.name})}>{user.id===shared.currentUser.id?"Compte actuel":"Supprimer"}</button></span></article>)}</div><div className="mvp-board-head"><div><span>VALIDATION ADMINISTRATIVE</span><h3>Utilisateurs et invitations en attente</h3><p>{pendingUsers.length+shared.adminInvitations.length} éléments</p></div></div>{shared.adminInvitations.length>0&&<div className="platform-user-list">{shared.adminInvitations.map(invitation=><article key={invitation.id}><i>{invitation.name.split(" ").map(part=>part[0]).join("").slice(0,2)}</i><div><b>{invitation.name}</b><small>{invitation.email||"Adresse à compléter"} · {invitation.tradeName}</small></div><em>{invitation.role} · Invitation</em><span className="platform-actions">{invitation.accountUserId?<><button onClick={()=>shared.onDecideAdminInvitation(invitation.id,"rejected",invitation.accountUserId)}>Refuser</button><button className="primary" onClick={()=>{if(window.confirm(`Accepter ${invitation.name} comme ${invitation.role} ?`))shared.onDecideAdminInvitation(invitation.id,"accepted",invitation.accountUserId)}}>Accepter</button></>:<small>Compte non activé</small>}<button className="danger-action" onClick={()=>setDeleteTarget({kind:"invitation",id:invitation.id,name:invitation.name})}>Supprimer</button></span></article>)}</div>}{pendingUsers.length>0&&<div className="platform-user-list">{pendingUsers.map(user=><article key={user.id}><i>{user.name.split(" ").map(part=>part[0]).join("").slice(0,2)}</i><div><b>{user.name}</b><small>{user.eurekaEmail||user.email} · Compte sans rôle actif</small></div><em>En attente</em><button className="danger-action" onClick={()=>setDeleteTarget({kind:"user",id:user.id,name:user.name})}>Supprimer</button></article>)}</div>}</section>}
  {createOpen&&<div className="modal-backdrop" onMouseDown={()=>setCreateOpen(false)}><section className="modal mvp-small-modal" onMouseDown={e=>e.stopPropagation()}><div className="modal-head"><div><span>ADMIN EURÊKA</span><h2>Créer un métier</h2></div><button onClick={()=>setCreateOpen(false)}>×</button></div><label>Nom du métier<input autoFocus value={tradeName} onChange={e=>setTradeName(e.target.value)}/></label><p>L’Admin métier pourra être nommé ou invité séparément.</p><div className="modal-actions"><button onClick={()=>setCreateOpen(false)}>Annuler</button><button className="primary" disabled={!tradeName.trim()} onClick={()=>{shared.onCreateTrade(tradeName.trim());setCreateOpen(false)}}>Créer le métier</button></div></section></div>}
  {inviteOpen&&<div className="modal-backdrop" onMouseDown={()=>setInviteOpen(false)}><section className="modal mvp-small-modal" onMouseDown={e=>e.stopPropagation()}><div className="modal-head"><div><span>INVITATION SÉCURISÉE</span><h2>Inviter un responsable</h2></div><button onClick={()=>setInviteOpen(false)}>×</button></div><label>Nom<input value={adminName} onChange={e=>setAdminName(e.target.value)}/></label><label>Adresse e-mail<input type="email" value={adminEmail} onChange={e=>setAdminEmail(e.target.value)}/></label><label>Rôle<select value={inviteRole} onChange={e=>setInviteRole(e.target.value)}><option value="admin_metier">Admin Métier</option><option value="admin_eureka">Admin global</option></select></label>{inviteRole==="admin_metier"&&<label>Métier<select value={inviteTrade} onChange={e=>setInviteTrade(e.target.value)}>{shared.trades.map(trade=><option key={trade.id} value={trade.id}>{trade.name}</option>)}</select></label>}<div className="modal-actions"><button onClick={()=>setInviteOpen(false)}>Annuler</button><button className="primary" disabled={!adminName.trim()||!adminEmail.includes("@")||(inviteRole==="admin_metier"&&!inviteTrade)} onClick={()=>{shared.onInviteAdmin({displayName:adminName.trim(),email:adminEmail.trim(),role:inviteRole,tradeId:inviteRole==="admin_metier"?inviteTrade:undefined});setInviteOpen(false)}}>Créer l’invitation</button></div></section></div>}
  {selectedTrade&&<div className="modal-backdrop" onMouseDown={()=>setSelectedTrade(null)}><section className="modal mvp-small-modal" onMouseDown={e=>e.stopPropagation()}><div className="modal-head"><div><span>FICHE MÉTIER</span><h2>{selectedTrade.name}</h2></div><button onClick={()=>setSelectedTrade(null)}>×</button></div><h3>Admins métier actifs</h3>{shared.users.filter(user=>user.tradeId===selectedTrade.id&&user.role==="Admin métier").map(user=><p key={user.id}><b>{user.name}</b><br/><small>{user.eurekaEmail||user.email}</small></p>)}{!shared.users.some(user=>user.tradeId===selectedTrade.id&&user.role==="Admin métier")&&<p>Aucun Admin métier actif.</p>}<h3>Invitations en attente</h3>{shared.adminInvitations.filter(invitation=>invitation.tradeId===selectedTrade.id).map(invitation=><p key={invitation.id}><b>{invitation.name}</b><br/><small>{invitation.email}</small></p>)}{!shared.adminInvitations.some(invitation=>invitation.tradeId===selectedTrade.id)&&<p>Aucune invitation en attente.</p>}</section></div>}
  {assignmentTarget&&<div className="modal-backdrop" onMouseDown={()=>setAssignmentTarget(null)}><section className="modal mvp-small-modal" onMouseDown={e=>e.stopPropagation()}><div className="modal-head"><div><span>ATTRIBUTION ADMINISTRATIVE</span><h2>Nommer {assignmentTarget.name}</h2></div><button onClick={()=>setAssignmentTarget(null)}>×</button></div><label>Métier obligatoire<select value={assignmentTrade} onChange={e=>setAssignmentTrade(e.target.value)}>{shared.trades.map(trade=><option key={trade.id} value={trade.id}>{trade.name}</option>)}</select></label><div className="modal-actions"><button onClick={()=>setAssignmentTarget(null)}>Annuler</button><button className="primary" disabled={!assignmentTrade} onClick={()=>{shared.onAssignAdmin(assignmentTarget.id,assignmentTrade);setAssignmentTarget(null)}}>Nommer Admin métier</button></div></section></div>}
  {deleteTarget&&<div className="modal-backdrop" onMouseDown={()=>setDeleteTarget(null)}><section className="modal mvp-small-modal" role="alertdialog" aria-modal="true" aria-labelledby="delete-title" onMouseDown={e=>e.stopPropagation()}><div className="modal-head"><div><span>CONFIRMATION REQUISE</span><h2 id="delete-title">Supprimer {deleteTarget.kind==="user"?"l’utilisateur":deleteTarget.kind==="trade"?"le métier":"l’invitation"}</h2></div><button aria-label="Fermer" onClick={()=>setDeleteTarget(null)}>×</button></div><p><b>{deleteTarget.name}</b></p><p>Cette suppression peut être irréversible. Les données importantes ou encore utilisées bloqueront automatiquement l’opération.</p><div className="modal-actions"><button onClick={()=>setDeleteTarget(null)}>Annuler</button><button className="danger-confirm" onClick={()=>{if(deleteTarget.kind==="user")shared.onDeleteUser(deleteTarget.id);else if(deleteTarget.kind==="trade")shared.onDeleteTrade(deleteTarget.id);else shared.onDeleteAdminInvitation(deleteTarget.id);setDeleteTarget(null)}}>Confirmer la suppression</button></div></section></div>}
  </div>;
}

function MembershipRequestsBoard({ shared }: { shared:MvpSharedProps }) { const [selected,setSelected]=useState<MembershipRequest|null>(null); const list=shared.membershipRequests.filter(request=>request.tradeId===shared.currentUser.tradeId); const decide=(decision:"accepted"|"rejected"|"needs_information")=>{if(!selected)return;shared.onDecideMembership(selected.id,decision);setSelected(null)}; return <section className="mvp-workspace"><div className="mvp-board-head"><div><span>ADHÉSIONS EN ATTENTE</span><h3>Demandes d’adhésion</h3><p>{shared.currentUser.tradeName}</p></div></div><div className="mvp-card-grid">{list.length?list.map(request=><button key={request.id} onClick={()=>setSelected(request)}><span>{request.requestedRole.toUpperCase()}</span><h3>{request.name}</h3><em>Consulter la demande →</em></button>):<p className="mvp-empty">Aucune demande en attente pour ce métier.</p>}</div>{selected&&<div className="project-overlay" onMouseDown={()=>setSelected(null)}><section className="project-popup mvp-form-popup" onMouseDown={e=>e.stopPropagation()}><div className="project-popup-head"><div><span>DEMANDE D’ADHÉSION</span><h2>{selected.name}</h2></div><button className="project-close" onClick={()=>setSelected(null)}>×</button></div><div className="project-popup-body"><div className="mvp-received"><article><small>TYPE DEMANDÉ</small><b>{selected.requestedRole}</b></article><article><small>MÉTIER</small><b>{selected.tradeName}</b></article><article><small>DOCUMENT TRANSMIS</small><a href={selected.document.url} target="_blank" rel="noreferrer">{selected.document.fileName}</a></article></div><div className="modal-actions"><button onClick={()=>decide("rejected")}>Refuser</button><button onClick={()=>decide("needs_information")}>Demander un complément</button><button className="primary" onClick={()=>decide("accepted")}>Confirmer l’adhésion</button></div></div></section></div>}</section> }

function MandataireApplicationsBoard({ shared }: { shared:MvpSharedProps }) {
  const [selected,setSelected]=useState<AcceptedProject|null>(null);
  const [candidateToConfirm,setCandidateToConfirm]=useState<PlatformUser|null>(null);
  const available=shared.acceptedProjects.filter(project=>project.tradeId===shared.currentUser.tradeId&&project.mandataireId===shared.currentUser.id&&(project.status==="À attribuer"||project.status==="Publié"));
  const candidates=selected?shared.applications.filter(application=>application.projectId===selected.id&&application.tradeId===selected.tradeId).map(application=>shared.users.find(user=>user.id===application.freelancerId&&user.tradeId===selected.tradeId)).filter(Boolean) as PlatformUser[]:[];
  const confirmSelection=()=>{if(!selected||!candidateToConfirm)return;shared.onSelectFreelancer(selected.id,candidateToConfirm.id);setCandidateToConfirm(null);setSelected(null)};
  return <section className="mvp-workspace"><div className="mvp-board-head"><div><span>PROJETS PUBLIÉS</span><h3>Postulations</h3><p>Consultez les freelances ayant candidaté avant le démarrage du projet.</p></div></div><div className="mvp-card-grid">{available.length?available.map(project=><button key={project.id} onClick={()=>setSelected(project)}><span>{project.id}</span><h3>{project.title}</h3><em>{shared.applications.filter(application=>application.projectId===project.id&&application.tradeId===project.tradeId).length} / 3 candidatures</em></button>):<p className="mvp-empty">Aucun projet en attente d’attribution.</p>}</div>{selected&&<div className="project-overlay" onMouseDown={()=>setSelected(null)}><section className="project-popup mvp-form-popup" onMouseDown={e=>e.stopPropagation()}><div className="project-popup-head"><div><span>POSTULATIONS · {selected.id}</span><h2>{selected.title}</h2></div><button className="project-close" onClick={()=>setSelected(null)}>×</button></div><div className="project-popup-body"><div className="candidate-list">{candidates.length?candidates.map(candidate=><article key={candidate.id}><div><b>{candidate.name}</b><small>Freelance</small></div><span>Classe {candidate.projectClass}</span><span>{candidate.credits} crédits</span><span>{candidate.note?.toLocaleString("fr-CH")} ★</span><button className="primary" onClick={()=>setCandidateToConfirm(candidate)}>Sélectionner ce freelance</button></article>):<p className="mvp-empty">Aucune candidature pour le moment.</p>}</div></div></section></div>}{candidateToConfirm&&<div className="modal-backdrop" onMouseDown={()=>setCandidateToConfirm(null)}><section className="modal mvp-small-modal" onMouseDown={e=>e.stopPropagation()}><div className="modal-head"><div><span>ATTRIBUTION DE LA MISSION</span><h2>Confirmer la sélection</h2></div><button onClick={()=>setCandidateToConfirm(null)}>×</button></div><p>Sélectionner <b>{candidateToConfirm.name}</b> et démarrer le projet ?</p><div className="modal-actions"><button onClick={()=>setCandidateToConfirm(null)}>Annuler</button><button className="primary" onClick={confirmSelection}>Confirmer et démarrer</button></div></section></div>}</section>
}

function InvoiceBoard({ invoices, onStatus }: { invoices:Invoice[]; onStatus:(id:string,status:string)=>void }) {
  const labels:Record<string,string>={to_invoice:"À facturer",invoice_sent:"Facture envoyée",payment_pending:"Paiement en attente",paid:"Payé",overdue:"En retard",cancelled:"Annulé"};
  const next:Record<string,{value:string;label:string}[]>={to_invoice:[{value:"invoice_sent",label:"Confirmer l’envoi"},{value:"cancelled",label:"Annuler"}],invoice_sent:[{value:"payment_pending",label:"Mettre en attente"},{value:"paid",label:"Confirmer le paiement"}],payment_pending:[{value:"paid",label:"Confirmer le paiement"},{value:"overdue",label:"Signaler en retard"}],overdue:[{value:"paid",label:"Confirmer le paiement"}]};
  return <section className="mvp-workspace"><div className="mvp-board-head"><div><span>FACTURATION MANUELLE</span><h3>Virements bancaires</h3><p>Aucun paiement n’est déclaré automatiquement. La confirmation reste réservée à l’administration autorisée.</p></div></div><div className="mvp-card-grid">{invoices.length?invoices.map(invoice=><article key={invoice.id}><span>{invoice.reference}</span><h3>{invoice.projectTitle}</h3><p>CHF {invoice.amount.toLocaleString("fr-CH",{minimumFractionDigits:2})}</p><em>{labels[invoice.status]||invoice.status}</em><footer>{(next[invoice.status]||[]).map(action=><button key={action.value} className={action.value==="paid"?"primary":""} onClick={()=>{if(window.confirm(`${action.label} pour ${invoice.reference} ?`))onStatus(invoice.id,action.value)}}>{action.label}</button>)}</footer></article>):<p className="mvp-empty">Aucune facture à traiter.</p>}</div></section>;
}

function SpecialistSettingsBoard({ settings,onSave,onValidate,canValidate }: {settings:TradeSetting[];onSave:(key:string,value:string,submit:boolean)=>void;onValidate:(id:string)=>void;canValidate:boolean}){const[key,setKey]=useState("");const[value,setValue]=useState("");return <section className="mvp-workspace"><div className="mvp-board-head"><div><span>RÉFÉRENTIEL MÉTIER</span><h3>Paramètres du métier</h3><p>Les règles préparées restent en brouillon ou sont soumises à validation de l’Admin Métier.</p></div></div><div className="mvp-card-grid">{settings.map(setting=><article key={setting.id}><span>{setting.status.toUpperCase()}</span><h3>{setting.key}</h3><p>{setting.value}</p>{canValidate&&setting.status==="submitted"&&<button className="primary" onClick={()=>onValidate(setting.id)}>Valider ce paramètre</button>}</article>)}</div><div className="account-fields"><label>Nom du paramètre<input value={key} onChange={e=>setKey(e.target.value)} placeholder="Ex. Coefficient de difficulté"/></label><label>Valeur ou règle<textarea value={value} onChange={e=>setValue(e.target.value)} placeholder="Décrire la règle validable"/></label><div className="modal-actions"><button disabled={!key.trim()||!value.trim()} onClick={()=>{onSave(key,value,false);setKey("");setValue("")}}>Enregistrer le brouillon</button><button className="primary" disabled={!key.trim()||!value.trim()} onClick={()=>{onSave(key,value,true);setKey("");setValue("")}}>Soumettre à validation</button></div></div></section>}

function SectionPage({ active, onNavigate, shared }: { active: string; onNavigate?: (section: string) => void; shared: MvpSharedProps }) {
  const data = sectionContent[active] || (active === "Partage Mandataire" ? { intro: "Gérer les documents mis à disposition des mandataires.", stats: [], items: [] } : active === "Demandes d’adhésion" ? {intro:"Valider les nouveaux freelances et mandataires de votre métier.",stats:[],items:[]} : sectionContent["Projets"]);
  const [filter, setFilter] = useState("Tous");
  const [shareCategory, setShareCategory] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newCategory, setNewCategory] = useState("Documents de projets");
  const [addedItems, setAddedItems] = useState<{ section: string; title: string; meta: string; tag: string }[]>([]);
  const [uploadedShareItems, setUploadedShareItems] = useState<{ section: string; title: string; fileName: string; meta: string; tag: string; url: string }[]>([]);
  const [shareUploadStatus, setShareUploadStatus] = useState("");
  const [selectedProject, setSelectedProject] = useState<{
    title: string;
    meta: string;
    tag: string;
  } | null>(null);
  const [selectedDirectoryName, setSelectedDirectoryName] = useState<string | null>(null);
  const [memberOpen,setMemberOpen]=useState(false);const [memberName,setMemberName]=useState("");const [memberPassword,setMemberPassword]=useState("");
  const [projectTab, setProjectTab] = useState("Vue d’ensemble");
  const [adminQuickAccesses, setAdminQuickAccesses] = useState(["Projets", "Demandes de devis", "Freelances"]);
  useEffect(() => {
    setFilter("Tous");
    setShareCategory(null);
    setSelectedDirectoryName(null);
  }, [active]);
  const isShare = false;
  const mvpShareAudience = active === "Partage freelance" ? "freelance" : active === "Partage Mandataire" ? "mandataire" : null;
  const isDirectory = active === "Freelances" || active === "Mandataires";
  const messagingBoard = active === "Messagerie";
  const calendarBoard = active === "Calendrier";
  const settingsBoard = active === "Paramétrage" || active === "Paramètres métier";
  const quoteBoard = active === "Demandes de devis";
  const statisticsBoard = active === "Statistiques métier";
  const directoryRole: PlatformRole | null = active === "Freelances" ? "Freelance" : active === "Mandataires" ? "Mandataire" : null;
  const directoryUsers = directoryRole ? shared.users.filter(user=>user.role===directoryRole&&user.tradeId===shared.currentUser.tradeId) : [];
  const directoryItems = directoryUsers.map(user=>({title:user.name,meta:user.role==="Freelance"?`Classe ${user.projectClass || "D"} · ${user.credits ?? 0} crédits`:`${shared.currentUser.tradeName} · Mandataire`,tag:"Actif"}));
  const selectedDirectoryUser = selectedDirectoryName ? directoryUsers.find(user=>user.name===selectedDirectoryName) : undefined;
  const selectedDirectory = selectedDirectoryName ? directoryProfiles[active]?.[selectedDirectoryName] || (selectedDirectoryUser ? {
    initials:selectedDirectoryUser.name.split(" ").map(part=>part[0]).join("").slice(0,2),
    subtitle:selectedDirectoryUser.role==="Freelance"?`Freelance · Classe ${selectedDirectoryUser.projectClass || "D"}`:"Mandataire",
    status:"Compte actif",
    facts:[{label:"Métier",value:selectedDirectoryUser.tradeName},{label:"Identifiant",value:selectedDirectoryUser.id}],
    metrics:selectedDirectoryUser.role==="Freelance"?[{label:"Note moyenne",value:`${selectedDirectoryUser.note ?? 0} / 5`},{label:"Crédits",value:`${selectedDirectoryUser.credits ?? 0} / 100`}]:[{label:"Statut",value:"Actif"}],
  } : null) : null;
  const [freelanceDraft, setFreelanceDraft] = useState(shared.freelancer);
  useEffect(() => { if (selectedDirectoryUser?.role === "Freelance") setFreelanceDraft({name:selectedDirectoryUser.name,projectClass:selectedDirectoryUser.projectClass || "D",credits:selectedDirectoryUser.credits ?? 0,note:selectedDirectoryUser.note ?? 0}); }, [selectedDirectoryUser]);
  const dynamicAdminProjects = active === "Projets" ? shared.acceptedProjects.filter(project=>project.tradeId===shared.currentUser.tradeId).map((project) => ({ title: project.title, meta: `${project.id} · CHF ${project.price.toLocaleString("fr-CH")} · Classe ${project.projectClass}`, tag: project.status })) : [];
  const allItems = isDirectory ? directoryItems : active === "Projets" ? dynamicAdminProjects : [...data.items, ...addedItems.filter((item) => item.section === active)];
  const shareBaseTitles = new Set(allItems.map((item) => item.title));
  const shareUploadedExtras = uploadedShareItems.filter((item) => item.tag === shareCategory && !shareBaseTitles.has(item.title)).map((item) => ({ title: item.title, meta: item.meta, tag: item.tag }));
  const shown = isShare && shareCategory ? [...allItems.filter((i) => i.tag === shareCategory), ...shareUploadedExtras] : active === "Freelances" && filter !== "Tous" ? allItems.filter((i) => i.meta.includes(filter)) : active === "Projets" || filter === "Tous" ? allItems : allItems.filter((i) => i.tag === filter);
  const tags = active === "Freelances" ? ["Tous", "Classe S", "Classe A", "Classe B", "Classe C", "Classe D"] : ["Tous", ...Array.from(new Set(data.items.map((i) => i.tag)))];
  const shareCategories = [
    {
      title: "Documents de projets",
      meta: "Modèles vierges téléchargeables par les freelances",
      tag: "4 modèles",
    },
    {
      title: "Normes & standards",
      meta: "Documents métier consultables en lecture seule",
      tag: "8 documents",
    },
  ];
  const openAdd = (category?: string) => {
    setNewCategory(category || "Documents de projets");
    setNewTitle("");
    setAddOpen(true);
  };
  const confirmAdd = () => {
    if (!newTitle.trim()) return;
    setAddedItems((items) => [
      ...items,
      {
        section: active,
        title: newTitle.trim(),
        meta: isShare ? "Ajouté par l’admin métier" : "Nouvel accès rapide",
        tag: isShare ? newCategory : "Ajouté",
      },
    ]);
    setAddOpen(false);
  };
  useEffect(() => {
    if (!isShare || !shareCategory) return;
    setShareUploadStatus("Chargement des documents…");
    fetch(`/api/share-documents?category=${encodeURIComponent(shareCategory)}`)
      .then(async (response) => {
        if (!response.ok) throw new Error("Chargement impossible");
        return response.json();
      })
      .then((payload) => {
        setUploadedShareItems((current) => [
          ...current.filter((item) => item.tag !== shareCategory),
          ...(payload.documents || []).map((document: { title: string; name: string; format: string; url: string }) => ({ section: "Partage freelance", title: document.title, fileName: document.name, meta: `${document.format} · ${document.name}`, tag: shareCategory, url: document.url })),
        ]);
        setShareUploadStatus("");
      })
      .catch(() => setShareUploadStatus("Impossible de charger les documents pour le moment."));
  }, [isShare, shareCategory]);
  const uploadShareFile = async (file: File | undefined, category: string, documentTitle: string) => {
    if (!file) return;
    setShareUploadStatus(`Envoi de « ${documentTitle} »…`);
    const form = new FormData();
    form.append("file", file);
    form.append("category", category);
    form.append("documentTitle", documentTitle);
    try {
      const response = await fetch("/api/share-documents", { method: "POST", body: form });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Envoi impossible");
      const document = payload.document as { title: string; name: string; format: string; url: string };
      setUploadedShareItems((items) => [
        ...items.filter((item) => !(item.tag === category && item.title === documentTitle)),
        { section: "Partage freelance", title: document.title, fileName: document.name, meta: `${document.format} · ${document.name}`, tag: category, url: document.url },
      ]);
      setShareUploadStatus(`« ${documentTitle} » est enregistré.`);
      window.setTimeout(() => setShareUploadStatus(""), 2200);
    } catch (error) {
      setShareUploadStatus(error instanceof Error ? error.message : "Impossible d’envoyer le document.");
    }
  };
  const openProject = (item: { title: string; meta: string; tag: string }) => {
    setSelectedProject(item);
    setProjectTab("Vue d’ensemble");
  };
  const adminQuickTargets: Record<string, string> = {
    Projets: "Projets",
    "Partage freelance": "Partage freelance",
    "Paramètres du domaine": "Paramétrage",
  };
  const openAdminHomeItem = (title: string) => onNavigate?.(adminQuickTargets[title] || "Projets");
  const openAdminNotification = (title: string) => onNavigate?.(title.toLowerCase().includes("devis") ? "Demandes de devis" : "Projets");
  const projectTabs = ["Vue d’ensemble", "Cahier des charges", "Missions", "Documents", "Suivi"];
  const projectTabItems: Record<string, { title: string; meta: string; tag: string }[]> = {
    "Vue d’ensemble": [
      { title: "Mandataire", meta: "Maison Aster", tag: "Client vérifié" },
      {
        title: "État du projet",
        meta: selectedProject?.meta || "",
        tag: selectedProject?.tag || "En cours",
      },
      {
        title: "Responsable métier",
        meta: "Claire Dubois",
        tag: "R&D Horlogerie",
      },
      { title: "Budget validé", meta: "CHF 42’800", tag: "Forfait" },
    ],
    "Cahier des charges": [
      {
        title: "Objectif",
        meta: "Développer une solution horlogère complète selon les exigences validées.",
        tag: "Validé",
      },
      {
        title: "Contraintes principales",
        meta: "Encombrement, réserve de marche, fiabilité et industrialisation.",
        tag: "4 exigences",
      },
      {
        title: "Livrables attendus",
        meta: "Maquette CAO, dossier de plans et dossier de validation.",
        tag: "3 livrables",
      },
    ],
    Missions: [
      {
        title: "Construction du rouage",
        meta: "Attribuée à Marc Lenoir · Avancement 70%",
        tag: "En cours",
      },
      {
        title: "Mise en plans",
        meta: "Attribution prévue après validation de la construction",
        tag: "À venir",
      },
      {
        title: "Contrôle fonctionnel",
        meta: "Spécialiste à sélectionner",
        tag: "À attribuer",
      },
    ],
    Documents: [
      {
        title: "Cahier des charges V2.3",
        meta: "PDF · Mis à jour le 12 août",
        tag: "Document",
      },
      {
        title: "Maquette CAO intermédiaire",
        meta: "Inventor · Déposée hier",
        tag: "CAO",
      },
      {
        title: "Compte rendu de validation",
        meta: "PDF · 3 remarques ouvertes",
        tag: "À revoir",
      },
    ],
    Suivi: [
      {
        title: "Avancement général",
        meta: "Construction en cours · prochaine étape le 18 septembre",
        tag: "68%",
      },
      {
        title: "Dernière activité",
        meta: "3 documents déposés par le freelance",
        tag: "Aujourd’hui",
      },
      {
        title: "Prochaine décision",
        meta: "Validation intermédiaire par l’admin métier",
        tag: "À planifier",
      },
    ],
  };
  const projectName = (selectedProject?.title || "").toLowerCase();
  const selectedAcceptedProject = shared.acceptedProjects.find((project) => project.title === selectedProject?.title&&project.tradeId===shared.currentUser.tradeId);
  const selectedPortalProject = selectedAcceptedProject;
  const closedProject = selectedProject?.tag === "Clôturé";
  const projectClassification = selectedAcceptedProject ? { level: `Classe ${selectedAcceptedProject.projectClass}`, credits: selectedAcceptedProject.credits, price: `CHF ${selectedAcceptedProject.price.toLocaleString("fr-CH")}` } : getProjectClassification(selectedProject?.title || "");
  const timelineClosed = selectedProject?.tag === "Clôturé" || selectedProject?.tag === "Terminé";
  const timelineEnd = timelineClosed ? new Date(2026, 6, 22) : projectName.includes("tourbillon") ? new Date(2026, 7, 29) : projectName.includes("phase de lune") ? new Date(2026, 8, 24) : projectName.includes("barillet") ? new Date(2026, 9, 4) : new Date(2026, 8, 18);
  const timelineStart = timelineClosed ? new Date(timelineEnd.getTime() - 45 * 24 * 60 * 60 * 1000) : new Date(2026, 7, 4);
  const today = new Date();
  const timelineProgress = timelineClosed ? 100 : Math.max(0, Math.min(100, ((today.getTime() - timelineStart.getTime()) / (timelineEnd.getTime() - timelineStart.getTime())) * 100));
  const formatTimelineDate = (date: Date) => date.toLocaleDateString("fr-CH", { day: "2-digit", month: "short" }).replace(".", "");
  const timelineMilestones = [
    {
      title: "Cadrage validé",
      date: new Date(timelineStart.getTime() + (timelineEnd.getTime() - timelineStart.getTime()) * 0.22),
      position: 22,
    },
    {
      title: "Validation intermédiaire",
      date: new Date(timelineStart.getTime() + (timelineEnd.getTime() - timelineStart.getTime()) * 0.52),
      position: 52,
    },
    {
      title: "Livraison technique",
      date: new Date(timelineStart.getTime() + (timelineEnd.getTime() - timelineStart.getTime()) * 0.82),
      position: 82,
    },
  ];
  return (
    <div className="simple-page">
      <div className="role-top">
        <EurekaLogo />
      </div>
      <div className="simple-heading">
        <span>ADMIN MÉTIER · {shared.currentUser.tradeName.toUpperCase()}</span>
        <h2>{active}</h2>
        <i></i>
        {data.intro && <p>{data.intro}</p>}
      </div>
      {isDirectory&&<div className="mvp-board-head"><div><span>COMPTES DE TEST DU MÉTIER</span><p>Créer un compte directement rattaché à {shared.currentUser.tradeName}.</p></div><button onClick={()=>{setMemberName("");setMemberPassword("");setMemberOpen(true)}}>＋ Créer un compte {active==="Freelances"?"Freelance":"Mandataire"}</button></div>}
      {memberOpen&&<div className="modal-backdrop" onMouseDown={()=>setMemberOpen(false)}><section className="modal mvp-small-modal" onMouseDown={e=>e.stopPropagation()}><div className="modal-head"><div><span>COMPTE DE TEST · {shared.currentUser.tradeName.toUpperCase()}</span><h2>Nouveau {active==="Freelances"?"Freelance":"Mandataire"}</h2></div><button onClick={()=>setMemberOpen(false)}>×</button></div><label>Nom complet<input autoFocus value={memberName} onChange={e=>setMemberName(e.target.value)}/></label><label>Mot de passe initial<input type="password" value={memberPassword} onChange={e=>setMemberPassword(e.target.value)}/><small>10 caractères minimum, dont un chiffre.</small></label><div className="modal-actions"><button onClick={()=>setMemberOpen(false)}>Annuler</button><button className="primary" disabled={!memberName.trim()||memberPassword.length<10||!/\d/.test(memberPassword)} onClick={()=>{shared.onCreateMember({name:memberName.trim(),role:active==="Freelances"?"freelance":"mandataire",password:memberPassword});setMemberOpen(false)}}>Créer le compte</button></div></section></div>}
      {messagingBoard && <MessagingCenter role="Admin métier" />}
      {calendarBoard && <SimpleCalendar />}
      {quoteBoard && <AdminQuoteFlow quotes={shared.quotes.filter(quote=>quote.tradeId===shared.currentUser.tradeId)} onTransmit={shared.onTransmitQuote} />}
      {active === "Facturation" && <InvoiceBoard invoices={shared.invoices} onStatus={shared.onInvoiceStatus}/>}
      {active === "Demandes d’adhésion" && <MembershipRequestsBoard shared={shared} />}
      {settingsBoard && (active==="Paramètres métier"?<SpecialistSettingsBoard settings={shared.tradeSettings} onSave={shared.onSaveTradeSetting} onValidate={shared.onValidateTradeSetting} canValidate={shared.currentUser.role==="Admin métier"}/>:<DomainSettingsMvp />)}
      {statisticsBoard && <TradeDashboard />}
      {active === "Accueil" && (
        <section className="freelance-quick-home admin-quick-home">
          <div>
            <span>ACCUEIL PERSONNALISÉ</span>
            <h3>Mes accès rapides</h3>
            <p>Ajoutez les raccourcis utiles à la gestion de votre domaine.</p>
          </div>
          <div className="freelance-quick-grid">
            {adminQuickAccesses.map((access) => (
              <div className="quick-card-wrap" key={access}><button onClick={() => onNavigate?.(access)}><i>↗</i><b>{access}</b><small>Ouvrir cet espace</small></button><button className="quick-remove" aria-label={`Supprimer ${access}`} onClick={()=>setAdminQuickAccesses(current=>current.filter(item=>item!==access))}>×</button></div>
            ))}
            <button
              className="quick-add"
              onClick={() => {
                const available = ["Partage freelance", "Partage Mandataire", "Mandataires", "Demandes d’adhésion"].find((item) => !adminQuickAccesses.includes(item));
                if (available) setAdminQuickAccesses((current) => [...current, available]);
              }}
            >
              <i>＋</i>
              <b>Ajouter un accès</b>
              <small>Personnaliser l’accueil</small>
            </button>
          </div>
        </section>
      )}
      {mvpShareAudience && <AdminShareFlow audience={mvpShareAudience} folders={mvpShareAudience === "freelance" ? shared.freelanceFolders : shared.mandataireFolders} onCreateFolder={shared.onCreateFolder} onAddFile={shared.onAddSharedFile} />}
      {isShare && !shareCategory && (
        <>
          <h3 className="notification-title secondary">Choisir une sous-catégorie</h3>
          <div className="simple-tiles share-categories">
            {shareCategories.map((category) => (
              <button key={category.title} onClick={() => setShareCategory(category.title)}>
                <b>{category.title}</b>
                <small>{category.meta}</small>
                <em>{category.tag}</em>
              </button>
            ))}
          </div>
        </>
      )}
      {isShare && shareCategory && (
        <div className="simple-filters share-back">
          <button onClick={() => setShareCategory(null)}>← Sous-catégories</button>
          <strong>{shareCategory}</strong>
        </div>
      )}
      {active !== "Accueil" && active !== "Projets" && active !== "Demandes d’adhésion" && active !== "Facturation" && !isShare && !mvpShareAudience && !messagingBoard && !calendarBoard && !settingsBoard && !quoteBoard && !statisticsBoard && (
        <div className="simple-filters">
          {tags.slice(0, active === "Freelances" ? 6 : 5).map((t) => (
            <button key={t} className={filter === t ? "selected" : ""} onClick={() => setFilter(t)}>
              {t}
            </button>
          ))}
        </div>
      )}
      {active !== "Accueil" && active !== "Demandes d’adhésion" && active !== "Facturation" && !mvpShareAudience && !messagingBoard && !calendarBoard && !settingsBoard && !quoteBoard && !statisticsBoard && (!isShare || shareCategory) && (
        <div className={`simple-tiles ${active === "Projets" ? "project-tiles" : ""} ${isDirectory ? "directory-tiles" : ""}`}>
          {shown.map((item) => {
            const acceptedProject = shared.acceptedProjects.find((project) => project.title === item.title&&project.tradeId===shared.currentUser.tradeId);
            const classification = acceptedProject ? { level: `Classe ${acceptedProject.projectClass}`, credits: acceptedProject.credits, price: `CHF ${acceptedProject.price.toLocaleString("fr-CH")}` } : getProjectClassification(item.title);
            const profile = directoryProfiles[active]?.[item.title];
            const freelanceClass = active === "Freelances" ? item.meta.match(/Classe ([SABCD])/)?.[1] || "" : "";
            if (isShare && shareCategory) {
              const uploaded = uploadedShareItems.find((document) => document.tag === shareCategory && document.title === item.title);
              const canDownload = shareCategory === "Documents de projets";
              return (
                <article className="share-document-admin-card" key={item.title}>
                  <div className="share-document-icon">▤</div>
                  <span>{canDownload ? "MODÈLE DE PROJET" : "NORME OU STANDARD"}</span>
                  <b>{item.title}</b>
                  <small>{uploaded ? uploaded.meta : item.meta}</small>
                  <em>{uploaded ? "Fichier disponible" : "Fichier à ajouter"}</em>
                  <footer>
                    <label>
                      {uploaded ? "Remplacer le fichier" : "Uploader le fichier"}
                      <input
                        type="file"
                        accept=".doc,.docx,.xls,.xlsx,.pdf,.one,.onepkg"
                        onChange={(event) => {
                          uploadShareFile(event.target.files?.[0], shareCategory, item.title);
                          event.currentTarget.value = "";
                        }}
                      />
                    </label>
                    {uploaded && (
                      <a href={uploaded.url} {...(canDownload ? { download: uploaded.fileName } : { target: "_blank", rel: "noreferrer" })}>
                        {canDownload ? "Télécharger" : "Consulter"}
                      </a>
                    )}
                  </footer>
                </article>
              );
            }
            return (
              <button key={item.title} onClick={() => (active === "Accueil" ? openAdminHomeItem(item.title) : active === "Projets" ? openProject(item) : isDirectory ? setSelectedDirectoryName(item.title) : isShare && "url" in item && typeof item.url === "string" && item.url ? window.open(item.url, "_blank", "noopener,noreferrer") : undefined)}>
                {freelanceClass && <span className="freelance-card-class">{freelanceClass}</span>}
                {isDirectory && profile && <span className="directory-avatar">{profile.initials}</span>}
                {active === "Projets" && <span className="project-tile-class">{classification.level.replace("Classe ", "")}</span>}
                <b>{item.title}</b>
                {item.meta && <small>{item.meta}</small>}
                {isDirectory && profile && (
                  <span className="directory-preview">
                    {profile.metrics.slice(0, 2).map((metric) => (
                      <i key={metric.label}>
                        <strong>{metric.value}</strong>
                        <small>{metric.label}</small>
                      </i>
                    ))}
                  </span>
                )}
                {active === "Projets" && (
                  <span className="project-tile-rank">
                    <strong className="project-tile-price">{classification.price}</strong>
                    <i>
                      <span>{classification.credits}</span>
                      <span className="credit-coin" aria-hidden="true">
                        E
                      </span>
                    </i>
                  </span>
                )}
                <em>{item.tag}</em>
              </button>
            );
          })}
        </div>
      )}
      {active === "Accueil" && (
        <div className="add-button-row">
          <button className="circle-add" onClick={() => openAdd()} aria-label="Ajouter un accès rapide">
            ＋
          </button>
        </div>
      )}
      {isShare && shareCategory && (
        <div className="add-button-row">
          {shareCategory === "Documents de projets" && (
            <button className="circle-add" onClick={() => openAdd("Documents de projets")} aria-label="Ajouter un nouveau document de projet">＋</button>
          )}
          {shareUploadStatus && <em className="share-upload-status">{shareUploadStatus}</em>}
        </div>
      )}
      {addOpen && (
        <div className="modal-backdrop" onMouseDown={() => setAddOpen(false)}>
          <div className="modal add-modal" onMouseDown={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <div>
                <span>ADMIN MÉTIER</span>
                <h2>{isShare ? "Ajouter au partage freelance" : "Ajouter un accès rapide"}</h2>
              </div>
              <button onClick={() => setAddOpen(false)}>×</button>
            </div>
            {isShare && <input type="hidden" value={newCategory} readOnly />}
            <label>
              Nom de l’élément
              <input autoFocus value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder={isShare ? "Ex. Guide de cotation" : "Ex. Nouvelle section"} />
            </label>
            <div className="modal-actions">
              <button onClick={() => setAddOpen(false)}>Annuler</button>
              <button className="primary" onClick={confirmAdd}>
                Ajouter
              </button>
            </div>
          </div>
        </div>
      )}
      {selectedDirectory && selectedDirectoryName && (
        <div className="project-overlay" onMouseDown={() => setSelectedDirectoryName(null)}>
          <section className="project-popup directory-popup" onMouseDown={(e) => e.stopPropagation()}>
            <div className="project-popup-head directory-popup-head">
              <div className="directory-avatar large">{selectedDirectory.initials}</div>
              <div>
                <span>{active === "Freelances" ? "FICHE FREELANCE" : "FICHE MANDATAIRE"} · {shared.currentUser.tradeName.toUpperCase()}</span>
                <h2>{selectedDirectoryName}</h2>
                <p>{selectedDirectory.subtitle}</p>
              </div>
              <button className="project-close" onClick={() => setSelectedDirectoryName(null)} aria-label="Fermer la fiche">
                ×
              </button>
            </div>
            <div className="project-popup-body">
              <div className="directory-status">
                <span>{selectedDirectory.status}</span>
                <small>Informations visibles par l’admin métier</small>
              </div>
              <h3 className="directory-section-title">{active === "Freelances" ? "Performances" : "Activité avec Eurêka"}</h3>
              {active === "Freelances" && selectedDirectoryUser?.role === "Freelance" ? <>
                <div className="mvp-form-grid freelancer-edit-grid">
                  <label>Classe<select value={freelanceDraft.projectClass} onChange={(e)=>setFreelanceDraft({...freelanceDraft,projectClass:e.target.value})}>{["D","C","B","A","S"].map(v=><option key={v}>{v}</option>)}</select></label>
                  <label>Nombre de crédits<input type="number" value={freelanceDraft.credits} onChange={(e)=>setFreelanceDraft({...freelanceDraft,credits:Number(e.target.value)})}/></label>
                  <label>Note<input type="number" min="0" max="5" step="0.1" value={freelanceDraft.note} onChange={(e)=>setFreelanceDraft({...freelanceDraft,note:Number(e.target.value)})}/></label>
                </div>
                <div className="modal-actions freelancer-edit-actions"><button onClick={()=>setFreelanceDraft({name:selectedDirectoryUser.name,projectClass:selectedDirectoryUser.projectClass || "D",credits:selectedDirectoryUser.credits ?? 0,note:selectedDirectoryUser.note ?? 0})}>Annuler les modifications</button><button className="primary" onClick={()=>shared.onUpdateFreelancer(freelanceDraft)}>Valider les modifications</button></div>
              </> : <div className="directory-metrics">
                {selectedDirectory.metrics.map((metric) => (
                  <article key={metric.label}>
                    <strong>{metric.value}</strong>
                    <span>{metric.label}</span>
                  </article>
                ))}
              </div>}
              <h3 className="directory-section-title">Informations</h3>
              <div className="directory-facts">
                {selectedDirectory.facts.map((fact) => (
                  <article key={fact.label}>
                    <span>{fact.label}</span>
                    <strong>{fact.value}</strong>
                  </article>
                ))}
              </div>
            </div>
          </section>
        </div>
      )}
      {selectedProject && (
        <div className="project-overlay" onMouseDown={() => setSelectedProject(null)}>
          <section className="project-popup" onMouseDown={(e) => e.stopPropagation()}>
            <div className="project-popup-head">
              <div>
                <span>PROJET · R&D HORLOGERIE</span>
                <h2>{selectedProject.title}</h2>
                <p>{selectedProject.meta}</p>
                <div className="project-rank-card">
                  <div className="project-class">
                    <small>CLASSE</small>
                    <strong>{projectClassification.level.replace("Classe ", "")}</strong>
                  </div>
                  <div className="project-credits">
                    <small>CRÉDITS</small>
                    <span>
                      <strong>{projectClassification.credits}</strong>
                      <i className="credit-coin" aria-hidden="true">
                        E
                      </i>
                    </span>
                  </div>
                </div>
              </div>
              <button className="project-close" onClick={() => setSelectedProject(null)} aria-label="Fermer la fiche projet">
                ×
              </button>
            </div>
            <nav className="project-tabs" aria-label="Informations du projet">
              {projectTabs.map((tab) => (
                <button key={tab} className={projectTab === tab ? "active" : ""} onClick={() => setProjectTab(tab)}>
                  {tab}
                </button>
              ))}
            </nav>
            <div className="project-popup-body">
              <div className="project-tab-title">
                <span>{projectTab}</span>
                <em>{selectedProject.tag}</em>
              </div>
              {projectTab === "Suivi" ? (
                <ProjectSessions projectTitle={selectedProject.title} role="Admin métier" />
              ) : (
                <div className="project-info-grid">
                  {projectTabItems[projectTab].map((item) => (
                    <article key={item.title}>
                      <b>{item.title}</b>
                      <p>{item.meta}</p>
                      <em>{item.tag}</em>
                    </article>
                  ))}
                </div>
              )}
              {projectTab === "Vue d’ensemble" && !selectedPortalProject && (
                <section className="project-timeline" aria-label="Chronologie du projet">
                  <div className="timeline-heading">
                    <div>
                      <span>CHRONOLOGIE DU PROJET</span>
                      <h3>Jalons et calendrier</h3>
                    </div>
                    <strong>{timelineClosed ? "Projet clôturé · calendrier terminé" : `${Math.round(timelineProgress)}% du temps écoulé`}</strong>
                  </div>
                  <div className="timeline-scale">
                    <div className="timeline-arrow">
                      <i style={{ width: `${timelineProgress}%` }}></i>
                    </div>
                    <div className={`timeline-today ${timelineClosed ? "closed" : ""}`} style={{ left: `${timelineProgress}%` }}>
                      <b>{timelineClosed ? "Clôturé" : "Aujourd’hui"}</b>
                      <span>{formatTimelineDate(timelineClosed ? timelineEnd : today)}</span>
                    </div>
                    {timelineMilestones.map((milestone, index) => (
                      <div className={`timeline-milestone ${timelineProgress >= milestone.position ? "passed" : ""}`} style={{ left: `${milestone.position}%` }} key={milestone.title}>
                        <i>{index + 1}</i>
                        <b>{milestone.title}</b>
                        <span>{formatTimelineDate(milestone.date)}</span>
                      </div>
                    ))}
                    <div className="timeline-bound start">
                      <b>Début</b>
                      <span>{formatTimelineDate(timelineStart)}</span>
                    </div>
                    <div className="timeline-bound end">
                      <b>Fin</b>
                      <span>{formatTimelineDate(timelineEnd)}</span>
                    </div>
                  </div>
                </section>
              )}
              {projectTab === "Vue d’ensemble" && selectedPortalProject && <section className="project-timeline"><div className="timeline-heading"><div><span>SUIVI PERSISTANT</span><h3>Jalons du projet</h3></div>{shared.currentUser.role==="Mandataire"&&<button onClick={()=>{const title=window.prompt("Nom du nouveau jalon :")||"";if(title){const dueAt=window.prompt("Échéance (AAAA-MM-JJ), facultative :")||"";shared.onAddMilestone(selectedPortalProject.id,title,dueAt)}}}>＋ Ajouter un jalon</button>}</div><div className="mvp-card-grid">{shared.milestones.filter(item=>item.projectId===selectedPortalProject.id).length?shared.milestones.filter(item=>item.projectId===selectedPortalProject.id).map(item=><article key={item.id}><span>{item.status.toUpperCase()}</span><h3>{item.title}</h3><p>{item.dueAt||"Sans échéance"}</p><footer>{shared.currentUser.role==="Freelance"&&item.status==="planned"&&<button onClick={()=>shared.onMilestoneStatus(item.id,"in_progress")}>Commencer</button>}{shared.currentUser.role==="Freelance"&&item.status==="in_progress"&&<button className="primary" onClick={()=>shared.onMilestoneStatus(item.id,"submitted")}>Soumettre</button>}{shared.currentUser.role==="Mandataire"&&item.status==="submitted"&&<button className="primary" onClick={()=>shared.onMilestoneStatus(item.id,"validated")}>Valider</button>}</footer></article>):<p className="mvp-empty">Aucun jalon enregistré.</p>}</div></section>}
              {projectTab === "Vue d’ensemble" && selectedPortalProject && !closedProject && <div className="modal-actions">{shared.currentUser.role==="Freelance"&&selectedPortalProject.status==="En cours"&&<button className="primary" onClick={()=>{if(window.confirm("Transmettre ce projet pour validation ?"))shared.onProjectAction(selectedPortalProject.id,"request-validation")}}>Demander la validation</button>}{shared.currentUser.role==="Freelance"&&selectedPortalProject.status==="Corrections demandées"&&<button className="primary" onClick={()=>shared.onProjectAction(selectedPortalProject.id,"resubmit")}>Renvoyer après correction</button>}{shared.currentUser.role==="Mandataire"&&selectedPortalProject.status==="En validation"&&<><button onClick={()=>{const comment=window.prompt("Correction demandée :")||"";if(comment)shared.onProjectAction(selectedPortalProject.id,"correction",{comment})}}>Demander une correction</button><button className="primary" onClick={()=>{const score=Number(window.prompt("Note du freelance (1 à 5) :","5"));if(score>=1&&score<=5&&window.confirm("Valider et clôturer définitivement le projet ?"))shared.onProjectAction(selectedPortalProject.id,"close",{score})}}>Valider et clôturer</button></>}</div>}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

const missionDetails: Record<
  string,
  {
    rank: "D" | "C" | "B" | "A" | "S";
    price: string;
    credits: number;
    duration: string;
    description: string;
  }
> = {
  "Mise en plan d’un pont de barillet": {
    rank: "D",
    price: "CHF 1’800",
    credits: 10,
    duration: "3 à 5 jours",
    description: "Réaliser deux plans de fabrication complets à partir d’une maquette 3D déjà validée.",
  },
  "Modification d’une nomenclature": {
    rank: "D",
    price: "CHF 1’250",
    credits: 15,
    duration: "2 à 3 jours",
    description: "Mettre à jour les références, matières et quantités d’un dossier de plans existant.",
  },
  "Construction d’un affichage simple": {
    rank: "C",
    price: "CHF 7’500",
    credits: 25,
    duration: "3 à 4 semaines",
    description: "Concevoir l’affichage heure, minute et petite seconde sur un mouvement mécanique existant.",
  },
  "Intégration d’une petite seconde": {
    rank: "C",
    price: "CHF 5’800",
    credits: 80,
    duration: "2 à 3 semaines",
    description: "Adapter un mobile de petite seconde, vérifier les entraxes et fournir les plans des composants modifiés.",
  },
  "Module de réserve de marche": {
    rank: "B",
    price: "CHF 18’500",
    credits: 45,
    duration: "6 à 8 semaines",
    description: "Développer un module de réserve de marche avec sa construction, ses contrôles et son dossier de plans.",
  },
  "Quantième simple": {
    rank: "B",
    price: "CHF 21’000",
    credits: 50,
    duration: "7 à 9 semaines",
    description: "Construire un mécanisme de date simple intégré à un calibre existant et préparer sa validation.",
  },
  "Module phase de lune": {
    rank: "A",
    price: "CHF 28’500",
    credits: 65,
    duration: "10 à 12 semaines",
    description: "Développer un module de phase de lune complet, de l’étude cinématique jusqu’aux livrables de validation.",
  },
  "Intégration chronographe": {
    rank: "A",
    price: "CHF 42’800",
    credits: 75,
    duration: "14 à 18 semaines",
    description: "Étudier et construire l’intégration d’un chronographe sur une architecture de mouvement existante.",
  },
  "Construction d’un tourbillon": {
    rank: "S",
    price: "CHF 96’000",
    credits: 90,
    duration: "24 à 30 semaines",
    description: "Concevoir une cage de tourbillon et son intégration dans un projet de haute horlogerie.",
  },
  "Développement d’un mouvement original": {
    rank: "S",
    price: "CHF 145’000",
    credits: 100,
    duration: "9 à 12 mois",
    description: "Développer l’architecture complète d’un nouveau calibre mécanique et son dossier technique.",
  },
};

const getMissionPreviewDetails = (rank: string) => {
  if (rank === "D")
    return {
      scope: "Intervention ciblée sur un dossier technique déjà structuré.",
      deliverables: "Plans PDF/DWG, cartouche complété et contrôle des références.",
      skills: "Mise en plans, cotation fonctionnelle et lecture de dossiers horlogers.",
      software: "Inventor ou Creo · Gabarits Eurêka fournis",
    };
  if (rank === "C")
    return {
      scope: "Adaptation ou construction simple sur une base mécanique existante.",
      deliverables: "Maquette 3D, plans des composants concernés et courte note de contrôle.",
      skills: "Construction horlogère, chaînes de cotes et intégration mécanique.",
      software: "Inventor ou Creo · Travail à distance",
    };
  if (rank === "B")
    return {
      scope: "Développement d’un sous-ensemble fonctionnel avec plusieurs composants.",
      deliverables: "Construction 3D, dossier de plans et synthèse des essais numériques.",
      skills: "Cinématique, dimensionnement, tolérancement et suivi de validation.",
      software: "Creo ou Inventor · Points techniques réguliers",
    };
  if (rank === "A")
    return {
      scope: "Développement avancé intégré à une architecture de mouvement existante.",
      deliverables: "Architecture, maquette complète, plans et dossier de validation intermédiaire.",
      skills: "Conception de complications, calculs fonctionnels et gestion des interfaces.",
      software: "CAO 3D professionnelle · Revue technique hebdomadaire",
    };
  return {
    scope: "Projet de haute horlogerie à forte complexité, présenté ici sans données sensibles.",
    deliverables: "Architecture générale, construction, dossier de plans et validation complète.",
    skills: "Expertise haute horlogerie, innovation mécanique et autonomie projet.",
    software: "Environnement CAO sécurisé fourni par Eurêka",
  };
};

const portalData: Record<
  string,
  Record<
    string,
    {
      intro: string;
      stats: string[];
      items: { title: string; meta: string; tag: string }[];
    }
  >
> = {
  Freelance: {
    Accueil: {
      intro: "Vos notifications et vos missions en cours.",
      stats: [],
      items: [
        {
          title: "Calibre automatique 3 aiguilles",
          meta: "EUR-024 · Échéance 18 août",
          tag: "En cours",
        },
        {
          title: "Mise en plans tourbillon",
          meta: "EUR-019 · 2 remarques reçues",
          tag: "À corriger",
        },
      ],
    },
    Projets: {
      intro: "Uniquement les projets sur lesquels vous travaillez actuellement ou avez déjà travaillé.",
      stats: ["1 en cours", "1 en validation", "14 clôturés"],
      items: [
        {
          title: "Intégration d’une petite seconde",
          meta: "EUR-024 · Maison Aster · Échéance 18 sept. · Classe C",
          tag: "En cours",
        },
        {
          title: "Construction d’un affichage simple",
          meta: "EUR-019 · Atelier Meridian · Livraison transmise · Classe C",
          tag: "En validation",
        },
        {
          title: "Adaptation d’un pont existant",
          meta: "EUR-012 · Orbe Manufacture · Clôturé le 22 juillet · Classe C",
          tag: "Clôturé",
        },
        {
          title: "Dossier de plans — Petite seconde",
          meta: "EUR-008 · Atelier Meridian · Clôturé le 6 juin · Classe D",
          tag: "Clôturé",
        },
        {
          title: "Correction d’une nomenclature",
          meta: "EUR-005 · Maison Aster · Clôturé le 18 avril · Classe D",
          tag: "Clôturé",
        },
      ],
    },
    "Tableau de missions": {
      intro: "Toutes les missions disponibles, classées de D à S avec leur valeur en crédits.",
      stats: [],
      items: [
        {
          title: "Mise en plan d’un pont de barillet",
          meta: "Mission courte · 2 plans",
          tag: "Rang D · 10 crédits",
        },
        {
          title: "Modification d’une nomenclature",
          meta: "Mise à jour d’un dossier existant",
          tag: "Rang D · 15 crédits",
        },
        {
          title: "Construction d’un affichage simple",
          meta: "Heure, minute et petite seconde",
          tag: "Rang C · 25 crédits",
        },
        {
          title: "Intégration d’une petite seconde",
          meta: "Adaptation sur mouvement existant",
          tag: "Rang C · 30 crédits",
        },
        {
          title: "Module de réserve de marche",
          meta: "Construction et mise en plans",
          tag: "Rang B · 45 crédits",
        },
        {
          title: "Quantième simple",
          meta: "Module complet sur calibre existant",
          tag: "Rang B · 50 crédits",
        },
        {
          title: "Module phase de lune",
          meta: "Développement et validation",
          tag: "Rang A · 65 crédits",
        },
        {
          title: "Intégration chronographe",
          meta: "Étude fonctionnelle et construction",
          tag: "Rang A · 75 crédits",
        },
        {
          title: "Construction d’un tourbillon",
          meta: "Projet haute horlogerie",
          tag: "Rang S · 90 crédits",
        },
        {
          title: "Développement d’un mouvement original",
          meta: "Nouveau calibre complet",
          tag: "Rang S · 100 crédits",
        },
      ],
    },
    Statistiques: {
      intro: "Analysez vos performances sur les projets terminés et l’évolution de votre profil.",
      stats: ["14 projets terminés", "4,7 / 5 de moyenne", "+28 crédits gagnés"],
      items: [
        {
          title: "Respect des délais",
          meta: "13 projets livrés dans le délai prévu sur 14",
          tag: "93 %",
        },
        {
          title: "Qualité technique",
          meta: "Moyenne des évaluations validées par l’admin métier",
          tag: "4,8 / 5",
        },
        {
          title: "Validation au premier passage",
          meta: "11 livrables acceptés sans correction majeure",
          tag: "79 %",
        },
        {
          title: "Crédits gagnés",
          meta: "34 gagnés · 6 retirés depuis votre inscription",
          tag: "+28",
        },
      ],
    },
    Profil: {
      intro: "Votre niveau, vos compétences et votre historique sur Eureka.",
      stats: [],
      items: [
        {
          title: "Classe actuelle",
          meta: "Constructeur mouvement",
          tag: "Classe C",
        },
        {
          title: "Crédits disponibles",
          meta: "Maximum autorisé : 100 crédits",
          tag: "75 / 100 crédits",
        },
        {
          title: "Missions terminées",
          meta: "Depuis votre inscription",
          tag: "14 missions",
        },
      ],
    },
    "Documents de projets": { intro: "Téléchargez les modèles vierges utiles à vos projets.", stats: [], items: [] },
    "Normes & standards": {
      intro: "Consultez les normes et standards imposés par l’admin R&D Horlogerie. Ils sont en lecture seule.",
      stats: ["9 normes", "12 standards", "3 obligatoires"],
      items: [
        {
          title: "Standard de construction mouvement",
          meta: "Obligatoire pour EUR-024 et EUR-027",
          tag: "Lecture seule",
        },
        {
          title: "Standard de mise en plan",
          meta: "Version 4.1 définie par l’admin métier",
          tag: "Lecture seule",
        },
        { title: "NIHS 02-10", meta: "Dimensions d’emboîtage", tag: "Norme" },
      ],
    },
    Messagerie: {
      intro: "Échangez avec l’admin métier et les interlocuteurs autorisés de vos missions.",
      stats: ["3 non lus", "5 discussions", "2 projets"],
      items: [
        {
          title: "EUR-024 · Question sur le rouage",
          meta: "Claire : Tu peux reprendre la solution B.",
          tag: "1 non lu",
        },
        {
          title: "EUR-019 · Retour de validation",
          meta: "2 remarques techniques reçues",
          tag: "2 non lus",
        },
        {
          title: "Équipe R&D Horlogerie",
          meta: "Canal d’information du métier",
          tag: "Info",
        },
      ],
    },
    Calendrier: {
      intro: "Suivez vos livraisons, réunions et contrôles programmés.",
      stats: ["4 échéances", "2 réunions", "1 contrôle"],
      items: [
        {
          title: "Livraison étape rouage",
          meta: "Lundi 18 août · EUR-024",
          tag: "Livraison",
        },
        {
          title: "Point technique avec Claire",
          meta: "Mardi 19 août · 14:00",
          tag: "Réunion",
        },
        {
          title: "Réponse mission EUR-027",
          meta: "Mercredi 20 août · 18:00",
          tag: "Échéance",
        },
      ],
    },
    "Forum métier": {
      intro: "Échangez avec les professionnels du métier sans accéder aux informations confidentielles des projets.",
      stats: ["6 sujets actifs", "2 nouveaux", "32 membres"],
      items: [
        {
          title: "Tolérancement des mobiles",
          meta: "8 réponses · Dernière activité aujourd’hui",
          tag: "Technique",
        },
        {
          title: "Bonnes pratiques Inventor",
          meta: "12 réponses · Épinglé par l’admin",
          tag: "CAO",
        },
        {
          title: "Questions sur le standard de plans",
          meta: "4 réponses",
          tag: "Standard",
        },
      ],
    },
    "Salles de réunion": {
      intro: "Rejoignez les réunions de vos projets et les salles d’entraide autorisées entre freelances.",
      stats: ["2 salles projet", "1 entraide ouverte", "Prochaine à 14:00"],
      items: [
        {
          title: "Jalon 2 — Validation intermédiaire",
          meta: "EUR-024 · Aujourd’hui 14:00 · 4 participants",
          tag: "Projet automatique",
        },
        {
          title: "Revue finale — Tourbillon",
          meta: "EUR-019 · Jeudi 10:30 · 3 participants",
          tag: "Projet automatique",
        },
        {
          title: "Entraide — Chaînes de cotes",
          meta: "Demain 18:30 · 6 places",
          tag: "Entraide freelance",
        },
      ],
    },
    Support: {
      intro: "Demandez de l’aide concernant votre compte, une mission ou un problème technique.",
      stats: ["1 ticket ouvert", "4 résolus", "2 h délai moyen"],
      items: [
        {
          title: "Ticket #1042 · Accès dossier EUR-024",
          meta: "Ouvert aujourd’hui · En cours de traitement",
          tag: "Ouvert",
        },
        {
          title: "Questions techniques",
          meta: "Contacter l’administrateur du métier",
          tag: "Nouveau ticket",
        },
        {
          title: "Aide plateforme",
          meta: "Guides et réponses fréquentes",
          tag: "FAQ",
        },
      ],
    },
  },
  Mandataire: {
    Accueil: {
      intro: "Suivez les projets confiés à Eureka Group, vos devis et les prochaines décisions attendues.",
      stats: ["4 projets actifs", "2 devis en cours", "1 validation"],
      items: [
        {
          title: "Calibre automatique 3 aiguilles",
          meta: "EUR-024 · Avancement 68% · Prochaine étape le 18 sept.",
          tag: "En cours",
        },
        {
          title: "Module phase de lune",
          meta: "EUR-027 · Recherche du spécialiste",
          tag: "Attribution",
        },
        {
          title: "Étude barillet longue réserve",
          meta: "EUR-031 · Devis disponible",
          tag: "À valider",
        },
      ],
    },
    Projets: {
      intro: "Consultez l’avancement, les livrables et les validations de tous vos projets.",
      stats: ["4 actifs", "1 terminé", "1 en retard"],
      items: [
        {
          title: "EUR-024 · Calibre automatique",
          meta: "Phase : construction · Avancement 68%",
          tag: "En cours",
        },
        {
          title: "EUR-027 · Module phase de lune",
          meta: "Spécialiste en cours d’attribution",
          tag: "À attribuer",
        },
        {
          title: "EUR-019 · Tourbillon",
          meta: "Livrable final disponible",
          tag: "Validation",
        },
        {
          title: "EUR-012 · Masse oscillante",
          meta: "Terminé le 22 juillet",
          tag: "Terminé",
        },
      ],
    },
    "Demandes de devis": {
      intro: "Envoyez une demande à l’admin métier, puis consultez, négociez et validez les propositions reçues.",
      stats: ["2 demandes en cours", "1 proposition à valider", "6 devis enregistrés"],
      items: [
        {
          title: "DEV-031 · Étude barillet longue réserve",
          meta: "Proposition reçue · CHF 38’400 · Délai estimé 14 semaines",
          tag: "À valider",
        },
        {
          title: "DEV-034 · Petite seconde décentrée",
          meta: "Demande envoyée · Analyse technique en cours",
          tag: "En préparation",
        },
        {
          title: "DEV-028 · Mise en plans calibre",
          meta: "Proposition acceptée le 2 août",
          tag: "Accepté",
        },
      ],
    },
    "Documents de projets": { intro: "Téléchargez les modèles vierges utiles à vos projets.", stats: [], items: [] },
    Messagerie: {
      intro: "Échangez avec l’équipe Eureka responsable de vos projets.",
      stats: ["2 non lus", "4 discussions", "3 projets"],
      items: [
        {
          title: "EUR-024 · Point d’avancement",
          meta: "Claire : Le rouage est validé.",
          tag: "1 non lu",
        },
        {
          title: "DEV-031 · Questions sur le barillet",
          meta: "Une précision est demandée",
          tag: "1 non lu",
        },
        {
          title: "Support Eureka",
          meta: "Discussion générale avec la plateforme",
          tag: "Support",
        },
      ],
    },
    Calendrier: {
      intro: "Visualisez les réunions, validations et dates de livraison de votre entreprise.",
      stats: ["5 échéances", "2 réunions", "1 livraison"],
      items: [
        {
          title: "Présentation intermédiaire EUR-024",
          meta: "Lundi 18 août · 10:30",
          tag: "Réunion",
        },
        {
          title: "Validation devis DEV-031",
          meta: "Mercredi 20 août",
          tag: "Décision",
        },
        {
          title: "Livraison finale EUR-019",
          meta: "Jeudi 21 août",
          tag: "Livraison",
        },
      ],
    },
    "Profil entreprise": {
      intro: "Gérez les informations de votre entreprise utilisées pour les projets et les contrats.",
      stats: ["Profil vérifié", "3 utilisateurs", "4 projets"],
      items: [
        {
          title: "Maison Aster SA",
          meta: "Genève · Mandataire vérifié",
          tag: "Entreprise",
        },
        {
          title: "Contacts autorisés",
          meta: "3 personnes peuvent suivre les projets",
          tag: "Accès",
        },
        {
          title: "Informations de facturation",
          meta: "Dernière vérification le 4 août",
          tag: "À jour",
        },
      ],
    },
    Support: {
      intro: "Contactez Eureka Group pour une question administrative, un litige ou un problème de projet.",
      stats: ["0 ticket ouvert", "3 résolus", "4 h délai moyen"],
      items: [
        {
          title: "Créer une demande de support",
          meta: "Projet, facturation ou utilisation du site",
          tag: "Nouveau",
        },
        {
          title: "Réclamation ou litige",
          meta: "Procédure confidentielle Eureka Group",
          tag: "Assistance",
        },
        {
          title: "Centre d’aide mandataire",
          meta: "Guides de création et suivi des projets",
          tag: "FAQ",
        },
      ],
    },
  },
};

function EurekaLogo() {
  return (
    <div className="page-logo">
      <i>E</i>
      <span>
        <b>EURÊKA</b>
        <small>GROUP</small>
      </span>
    </div>
  );
}

function TradeDashboard() {
  const revenueByClass = [
    { rank: "D", value: 58000, label: "CHF 58’000" },
    { rank: "C", value: 112000, label: "CHF 112’000" },
    { rank: "B", value: 146000, label: "CHF 146’000" },
    { rank: "A", value: 118000, label: "CHF 118’000" },
    { rank: "S", value: 52000, label: "CHF 52’000" },
  ];
  const maxRevenue = Math.max(...revenueByClass.map((item) => item.value));
  return (
    <section className="trade-dashboard">
      <div className="trade-kpis">
        {[
          ["Freelances enregistrés", "64", "Tous les profils du métier"],
          ["Freelances actifs", "41", "64 % des profils enregistrés"],
          ["Projets au total", "87", "Actifs et clôturés"],
          ["Chiffre d’affaires total", "CHF 486’000", "Toutes classes confondues"],
          ["Bénéfices", "CHF 97’200", "Marge métier estimée : 20 %"],
        ].map(([label, value, detail]) => (
          <article key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
            <small>{detail}</small>
          </article>
        ))}
      </div>
      <div className="trade-dashboard-grid">
        <article className="revenue-class-chart">
          <header>
            <div>
              <span>RÉPARTITION DU CHIFFRE D’AFFAIRES</span>
              <h3>Chiffre d’affaires par classe de projet</h3>
            </div>
            <strong>CHF 486’000</strong>
          </header>
          <div className="revenue-bars">
            {revenueByClass.map((item) => (
              <div key={item.rank}>
                <b>Classe {item.rank}</b>
                <span><i style={{ width: `${(item.value / maxRevenue) * 100}%` }}></i></span>
                <strong>{item.label}</strong>
              </div>
            ))}
          </div>
        </article>
        <article className="trade-summary-card">
          <span>ÉTAT DU MÉTIER</span>
          <h3>Activité actuelle</h3>
          <div><b>18</b><small>Projets en cours</small></div>
          <div><b>7</b><small>Projets à valider</small></div>
          <div><b>62</b><small>Projets clôturés</small></div>
          <footer><strong>41</strong><span>freelances actifs sur 64</span></footer>
        </article>
      </div>
    </section>
  );
}

function DomainSettingsMvp() {
  const [prefix, setPrefix] = useState("EUR");
  const [milestones, setMilestones] = useState("3");
  const [margin, setMargin] = useState("5 %");
  const [newParameter, setNewParameter] = useState("");
  const [customParameters, setCustomParameters] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);
  const addParameter = () => {
    if (!newParameter.trim()) return;
    setCustomParameters((current) => [...current, newParameter.trim()]);
    setNewParameter("");
  };
  const save = () => {
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1800);
  };
  return (
    <section className="domain-settings domain-settings-mvp">
      <div className="domain-settings-head">
        <div>
          <span>PARAMÈTRES MVP</span>
          <h3>Paramétrage R&D Horlogerie</h3>
          <p>Uniquement les règles indispensables au lancement du métier.</p>
        </div>
        <div className="domain-owner">
          <i>CD</i>
          <span><small>RESPONSABLE DU DOMAINE</small><b>Claire Dubois</b><em>Droits complets</em></span>
        </div>
      </div>
      <div className="domain-settings-body">
        <aside>
          <span>CONFIGURATION ACTIVE</span>
          <h4>Projets</h4>
          <p>Ces paramètres s’appliquent uniquement au domaine R&D Horlogerie.</p>
          <div className="setting-scope"><i>⌁</i><span><b>Portée limitée</b><small>R&D Horlogerie uniquement</small></span></div>
        </aside>
        <main>
          <div className="setting-fields">
            <label><span>Préfixe de projet</span><input value={prefix} onChange={(event) => setPrefix(event.target.value)} /></label>
            <label><span>Nombre de jalons obligatoires</span><input type="number" min="1" value={milestones} onChange={(event) => setMilestones(event.target.value)} /></label>
            <label><span>Marge du métier</span><input value={margin} onChange={(event) => setMargin(event.target.value)} /></label>
          </div>
          {customParameters.length > 0 && (
            <div className="custom-settings">
              <span>PARAMÈTRES AJOUTÉS</span>
              {customParameters.map((item, index) => (
                <label key={`${item}-${index}`}><span>{item}</span><input placeholder="Définir une valeur…" /><button onClick={() => setCustomParameters((current) => current.filter((_, currentIndex) => currentIndex !== index))}>×</button></label>
              ))}
            </div>
          )}
          <div className="add-setting">
            <input value={newParameter} onChange={(event) => setNewParameter(event.target.value)} onKeyDown={(event) => event.key === "Enter" && addParameter()} placeholder="Nom du nouveau paramètre…" />
            <button onClick={addParameter}>＋ Ajouter un paramètre</button>
          </div>
          <footer><span>Dernière modification : aujourd’hui par Claire Dubois</span><button className={saved ? "saved" : ""} onClick={save}>{saved ? "✓ Paramètres enregistrés" : "Enregistrer les modifications"}</button></footer>
        </main>
      </div>
    </section>
  );
}

function DomainSettings() {
  const tabs = ["Projets", "Devis", "Facturation", "Classes & crédits", "Récompenses", "Responsabilités"];
  const [tab, setTab] = useState("Projets");
  const [saved, setSaved] = useState(false);
  const [newParameter, setNewParameter] = useState("");
  const [customParameters, setCustomParameters] = useState<Record<string, string[]>>({});
  const [billingModes, setBillingModes] = useState([
    {
      id: 1,
      name: "Facturation à l’heure",
      unit: "Heure",
      rate: "CHF 120",
      rule: "Temps réellement déclaré",
      enabled: true,
    },
    {
      id: 2,
      name: "Facturation à la demi-journée",
      unit: "4 heures",
      rate: "CHF 450",
      rule: "Toute demi-journée commencée",
      enabled: true,
    },
    {
      id: 3,
      name: "Facturation à la journée",
      unit: "8 heures",
      rate: "CHF 850",
      rule: "Journée de travail complète",
      enabled: false,
    },
    {
      id: 4,
      name: "Facturation au forfait",
      unit: "Projet",
      rate: "Selon devis",
      rule: "Prix global validé avant attribution",
      enabled: true,
    },
    {
      id: 5,
      name: "Paiement en 3 fois",
      unit: "Échéancier",
      rate: "30 % · 40 % · 30 %",
      rule: "Acompte, jalon intermédiaire et solde",
      enabled: true,
    },
  ]);
  const [newBillingMode, setNewBillingMode] = useState("");
  const addParameter = () => {
    if (!newParameter.trim()) return;
    setCustomParameters((current) => ({
      ...current,
      [tab]: [...(current[tab] || []), newParameter.trim()],
    }));
    setNewParameter("");
  };
  const updateBillingMode = (id: number, key: "name" | "unit" | "rate" | "rule", value: string) => setBillingModes((current) => current.map((mode) => (mode.id === id ? { ...mode, [key]: value } : mode)));
  const toggleBillingMode = (id: number) => setBillingModes((current) => current.map((mode) => (mode.id === id ? { ...mode, enabled: !mode.enabled } : mode)));
  const addBillingMode = () => {
    if (!newBillingMode.trim()) return;
    setBillingModes((current) => [
      ...current,
      {
        id: Date.now(),
        name: newBillingMode.trim(),
        unit: "À définir",
        rate: "À définir",
        rule: "Règle à définir",
        enabled: true,
      },
    ]);
    setNewBillingMode("");
  };
  const save = () => {
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1800);
  };
  const fields: Record<string, { label: string; value: string; type?: string; hint?: string }[]> = {
    Projets: [
      { label: "Préfixe des projets", value: "EUR" },
      { label: "Nombre de jalons obligatoires", value: "3", type: "number" },
      { label: "Délai de validation d’un jalon", value: "5 jours ouvrés" },
      { label: "Délai du PV après une séance", value: "24 heures" },
      {
        label: "Accès après clôture",
        value: "Résumé, évaluation et PV validés",
        hint: "Les fichiers techniques restent la propriété du mandataire.",
      },
      {
        label: "Validation finale requise",
        value: "Mandataire + admin métier",
      },
    ],
    Devis: [
      { label: "Durée de validité d’un devis", value: "30 jours" },
      { label: "Marge Eurêka", value: "5 %" },
      { label: "Acompte demandé", value: "30 %" },
      { label: "Délai de réponse conseillé", value: "5 jours ouvrés" },
      { label: "Validation avant envoi", value: "Responsable du domaine" },
      {
        label: "Révision de prix autorisée",
        value: "Avant acceptation uniquement",
      },
    ],
    Facturation: [
      { label: "Devise du domaine", value: "CHF" },
      { label: "Facturation de l’acompte", value: "À l’acceptation du devis" },
      { label: "Facturation intermédiaire", value: "Après le jalon 2" },
      { label: "Solde du projet", value: "À la validation finale" },
      { label: "Délai de paiement", value: "30 jours" },
      { label: "Rappel automatique", value: "5 jours avant échéance" },
    ],
    Récompenses: [
      { label: "Note minimale sans perte", value: "3 / 5" },
      { label: "Qualité technique", value: "40 %" },
      { label: "Respect des délais", value: "25 %" },
      { label: "Communication", value: "20 %" },
      { label: "Dossier final", value: "15 %" },
      {
        label: "Validation de la récompense",
        value: "Contrôle de l’admin métier",
      },
    ],
    Responsabilités: [
      { label: "Responsable du domaine", value: "Claire Dubois" },
      { label: "Suppléant", value: "À définir" },
      { label: "Validation des classes", value: "Responsable du domaine" },
      { label: "Validation des devis", value: "Responsable ou suppléant" },
      { label: "Litiges projet", value: "Admin métier + Eurêka Group" },
      { label: "Modification des règles", value: "Journalisée et datée" },
    ],
  };
  const classes = [
    {
      rank: "D",
      min: 0,
      max: 19,
      gain: "+3",
      loss: "−2",
      scope: "Mise en plans et corrections",
    },
    {
      rank: "C",
      min: 20,
      max: 39,
      gain: "+6",
      loss: "−3",
      scope: "Adaptations et construction simple",
    },
    {
      rank: "B",
      min: 40,
      max: 59,
      gain: "+8",
      loss: "−4",
      scope: "Modules et complications simples",
    },
    {
      rank: "A",
      min: 60,
      max: 84,
      gain: "+10",
      loss: "−6",
      scope: "Développements complexes",
    },
    {
      rank: "S",
      min: 85,
      max: 100,
      gain: "+15",
      loss: "−10",
      scope: "Haute horlogerie et projets exceptionnels",
    },
  ];
  return (
    <section className="domain-settings">
      <div className="domain-settings-head">
        <div>
          <span>RÈGLES DU DOMAINE</span>
          <h3>Paramétrage R&D Horlogerie</h3>
          <p>Ces réglages s’appliquent uniquement à ce métier. Ils sont modifiables par le responsable du domaine et ses administrateurs autorisés.</p>
        </div>
        <div className="domain-owner">
          <i>CD</i>
          <span>
            <small>RESPONSABLE DU DOMAINE</small>
            <b>Claire Dubois</b>
            <em>Droits complets</em>
          </span>
        </div>
      </div>
      <nav className="domain-settings-tabs" aria-label="Catégories de paramétrage">
        {tabs.map((item) => (
          <button
            className={tab === item ? "active" : ""}
            key={item}
            onClick={() => {
              setTab(item);
              setSaved(false);
            }}
          >
            {item}
          </button>
        ))}
      </nav>
      <div className="domain-settings-body">
        <aside>
          <span>PARAMÈTRES DU DOMAINE</span>
          <h4>{tab}</h4>
          <p>{tab === "Classes & crédits" ? "Définissez les seuils d’accès, les crédits et les variations après évaluation." : tab === "Facturation" ? "Choisissez les modes de facturation autorisés pour ce métier et modifiez leurs règles." : "Modifiez les règles utilisées automatiquement par la plateforme."}</p>
          <div className="setting-scope">
            <i>⌁</i>
            <span>
              <b>Portée limitée</b>
              <small>R&D Horlogerie uniquement</small>
            </span>
          </div>
          <div className="setting-scope secure">
            <i>✓</i>
            <span>
              <b>Traçabilité active</b>
              <small>Chaque modification est enregistrée</small>
            </span>
          </div>
        </aside>
        <main>
          {tab === "Classes & crédits" ? (
            <>
              <div className="class-settings-title">
                <div>
                  <span>GRILLE DE PROGRESSION</span>
                  <h4>Classes et gains de crédits</h4>
                </div>
                <button>＋ Ajouter une classe</button>
              </div>
              <div className="class-settings-table">
                <div className="class-settings-header">
                  <span>CLASSE</span>
                  <span>CRÉDITS MIN.</span>
                  <span>CRÉDITS MAX.</span>
                  <span>GAIN MAX.</span>
                  <span>PERTE MAX.</span>
                  <span>PÉRIMÈTRE</span>
                </div>
                {classes.map((item) => (
                  <div className="class-settings-row" key={item.rank}>
                    <strong>{item.rank}</strong>
                    <label>
                      <input defaultValue={item.min} />
                    </label>
                    <label>
                      <input defaultValue={item.max} />
                    </label>
                    <label>
                      <input defaultValue={item.gain} />
                    </label>
                    <label>
                      <input defaultValue={item.loss} />
                    </label>
                    <span>{item.scope}</span>
                  </div>
                ))}
              </div>
              <div className="credit-rules">
                <label>
                  Crédits maximum d’un freelance
                  <input defaultValue="100" />
                </label>
                <label>
                  Perte automatique autorisée
                  <select defaultValue="Oui, après validation">
                    <option>Oui, après validation</option>
                    <option>Non</option>
                  </select>
                </label>
                <label>
                  Changement de classe
                  <select defaultValue="Automatique après contrôle">
                    <option>Automatique après contrôle</option>
                    <option>Manuel uniquement</option>
                  </select>
                </label>
              </div>
            </>
          ) : tab === "Facturation" ? (
            <>
              <div className="billing-settings-title">
                <div>
                  <span>MODES AUTORISÉS POUR CE MÉTIER</span>
                  <h4>Types de facturation</h4>
                  <p>Activez uniquement les méthodes adaptées au domaine. Le mode retenu sera ensuite choisi lors du devis.</p>
                </div>
                <label>
                  Devise
                  <select defaultValue="CHF">
                    <option>CHF</option>
                    <option>EUR</option>
                    <option>USD</option>
                  </select>
                </label>
              </div>
              <div className="billing-mode-list">
                {billingModes.map((mode) => (
                  <article className={mode.enabled ? "enabled" : ""} key={mode.id}>
                    <button className="billing-toggle" onClick={() => toggleBillingMode(mode.id)} aria-label={`${mode.enabled ? "Désactiver" : "Activer"} ${mode.name}`}>
                      <i></i>
                    </button>
                    <div className="billing-mode-fields">
                      <label>
                        TYPE DE FACTURATION
                        <input value={mode.name} onChange={(event) => updateBillingMode(mode.id, "name", event.target.value)} />
                      </label>
                      <label>
                        UNITÉ
                        <input value={mode.unit} onChange={(event) => updateBillingMode(mode.id, "unit", event.target.value)} />
                      </label>
                      <label>
                        TARIF OU RÉPARTITION
                        <input value={mode.rate} onChange={(event) => updateBillingMode(mode.id, "rate", event.target.value)} />
                      </label>
                      <label>
                        RÈGLE APPLIQUÉE
                        <input value={mode.rule} onChange={(event) => updateBillingMode(mode.id, "rule", event.target.value)} />
                      </label>
                    </div>
                    <em>{mode.enabled ? "Autorisé" : "Désactivé"}</em>
                  </article>
                ))}
              </div>
              <div className="billing-add">
                <input value={newBillingMode} onChange={(event) => setNewBillingMode(event.target.value)} onKeyDown={(event) => event.key === "Enter" && addBillingMode()} placeholder="Ex. Paiement mensuel, au livrable…" />
                <button onClick={addBillingMode}>＋ Ajouter un type de facturation</button>
              </div>
              <div className="billing-general-rules">
                <label>
                  Délai de paiement
                  <input defaultValue="30 jours" />
                </label>
                <label>
                  Mode proposé par défaut
                  <select defaultValue="Facturation au forfait">
                    <option>Facturation au forfait</option>
                    <option>Facturation à l’heure</option>
                    <option>Facturation à la demi-journée</option>
                    <option>Paiement en 3 fois</option>
                  </select>
                </label>
                <label>
                  Choix définitif du mode
                  <select defaultValue="Validé dans le devis">
                    <option>Validé dans le devis</option>
                    <option>Choisi par l’admin métier</option>
                    <option>Choisi par le mandataire</option>
                  </select>
                </label>
              </div>
            </>
          ) : (
            <div className="setting-fields">
              {(fields[tab] || []).map((field) => (
                <label key={field.label}>
                  <span>{field.label}</span>
                  <input type={field.type || "text"} defaultValue={field.value} />
                  {field.hint && <small>{field.hint}</small>}
                </label>
              ))}
            </div>
          )}
          {(customParameters[tab] || []).length > 0 && (
            <div className="custom-settings">
              <span>PARAMÈTRES AJOUTÉS</span>
              {customParameters[tab].map((item, index) => (
                <label key={item + index}>
                  <span>{item}</span>
                  <input placeholder="Définir une valeur…" />
                  <button
                    onClick={() =>
                      setCustomParameters((current) => ({
                        ...current,
                        [tab]: current[tab].filter((_, i) => i !== index),
                      }))
                    }
                  >
                    ×
                  </button>
                </label>
              ))}
            </div>
          )}
          {tab !== "Facturation" && (
            <div className="add-setting">
              <input value={newParameter} onChange={(event) => setNewParameter(event.target.value)} onKeyDown={(event) => event.key === "Enter" && addParameter()} placeholder="Nom du nouveau paramètre…" />
              <button onClick={addParameter}>＋ Ajouter un paramètre</button>
            </div>
          )}
          <footer>
            <span>Dernière modification : aujourd’hui par Claire Dubois</span>
            <button className={saved ? "saved" : ""} onClick={save}>
              {saved ? "✓ Paramètres enregistrés" : "Enregistrer les modifications"}
            </button>
          </footer>
        </main>
      </div>
    </section>
  );
}

function MessagingCenter({ role }: { role: string }) {
  const [section, setSection] = useState("Boîte mail");
  const [selectedMail, setSelectedMail] = useState(0);
  const [selectedContact, setSelectedContact] = useState(0);
  const [draft, setDraft] = useState("");
  const [sentMessages, setSentMessages] = useState<Record<number, string[]>>({});
  const mails = [
    {
      from: "Claire Dubois",
      role: "Admin métier",
      subject: "Validation intermédiaire · EUR-024",
      preview: "Le jalon est confirmé pour jeudi à 14 h.",
      date: "10:42",
      unread: true,
      body: "Bonjour, le jalon de validation intermédiaire est confirmé pour jeudi à 14 h. Merci de déposer les derniers éléments dans le projet avant mercredi soir.",
    },
    {
      from: "Maison Aster",
      role: "Mandataire",
      subject: "Retour sur les livrables",
      preview: "Nous avons ajouté deux remarques au dossier.",
      date: "Hier",
      unread: true,
      body: "Bonjour, nous avons ajouté deux remarques au dossier de livraison. Elles concernent uniquement la présentation du plan et la nomenclature.",
    },
    {
      from: "Eurêka Group",
      role: "Plateforme",
      subject: "Mise à jour des standards métier",
      preview: "Une nouvelle version est disponible dans le partage.",
      date: "16 août",
      unread: false,
      body: "La version 2.4 des standards R&D Horlogerie est maintenant disponible dans l’onglet Partage freelance.",
    },
    {
      from: "Support IT",
      role: "Assistance technique",
      subject: "Ticket IT-108 résolu",
      preview: "Votre accès au fichier STEP a été rétabli.",
      date: "14 août",
      unread: false,
      body: "Votre accès au fichier STEP a été rétabli. Si le problème revient, vous pouvez rouvrir le ticket depuis la partie Support IT.",
    },
  ];
  const contacts = [
    {
      name: "Sophie Aubert",
      kind: "Freelance · Classe B",
      initials: "SA",
      online: true,
      last: "Je vérifie et je te redis.",
      messages: ["Salut, tu as déjà travaillé sur ce type de chaîne de cotes ?", "Oui, je peux regarder la méthode générale avec toi."],
    },
    {
      name: "Maison Aster",
      kind: "Mandataire · Client vérifié",
      initials: "MA",
      online: true,
      last: "Le document est bien reçu.",
      messages: ["Bonjour, le dernier document a bien été reçu.", "Merci, nous faisons le retour dans la journée."],
    },
    {
      name: "Claire Dubois",
      kind: "Admin métier",
      initials: "CD",
      online: false,
      last: "Le jalon est confirmé jeudi.",
      messages: ["Le jalon est confirmé jeudi à 14 h.", "Pense à déposer la version figée avant la séance."],
    },
    {
      name: "Support IT Eurêka",
      kind: "Équipe technique",
      initials: "IT",
      online: true,
      last: "Un technicien est disponible.",
      messages: ["Bonjour, vous êtes en ligne avec le support IT Eurêka.", "Décrivez votre problème et un technicien vous répondra ici."],
    },
  ];
  const contact = contacts[selectedContact];
  const sendMessage = () => {
    if (!draft.trim()) return;
    setSentMessages((current) => ({
      ...current,
      [selectedContact]: [...(current[selectedContact] || []), draft.trim()],
    }));
    setDraft("");
  };
  return (
    <section className="messaging-center">
      <nav className="messaging-tabs" aria-label="Sections de la messagerie">
        {[
          ["Boîte mail", "✉"],
          ["Chat instantané", "●"],
          ["Support IT", "?"],
        ].map(([label, icon]) => (
          <button key={label} className={section === label ? "active" : ""} onClick={() => setSection(label)}>
            <i>{icon}</i>
            <span>{label}</span>
            {label === "Boîte mail" && <em>2</em>}
          </button>
        ))}
      </nav>
      {section === "Boîte mail" && (
        <div className="mail-layout">
          <aside className="mail-sidebar">
            <button className="compose-mail">＋ Nouveau message</button>
            <button className="active">
              Boîte de réception <b>2</b>
            </button>
            <button>Envoyés</button>
            <button>
              Brouillons <b>1</b>
            </button>
            <button>Archivés</button>
          </aside>
          <div className="mail-list">
            <div className="mail-list-head">
              <div>
                <span>BOÎTE DE RÉCEPTION</span>
                <h3>Messages</h3>
              </div>
              <label>
                ⌕<input placeholder="Rechercher…" />
              </label>
            </div>
            {mails.map((mail, index) => (
              <button className={`${selectedMail === index ? "selected" : ""} ${mail.unread ? "unread" : ""}`} key={mail.subject} onClick={() => setSelectedMail(index)}>
                <i>
                  {mail.from
                    .split(" ")
                    .map((part) => part[0])
                    .join("")
                    .slice(0, 2)}
                </i>
                <span>
                  <b>{mail.from}</b>
                  <strong>{mail.subject}</strong>
                  <small>{mail.preview}</small>
                </span>
                <time>{mail.date}</time>
              </button>
            ))}
          </div>
          <article className="mail-reader">
            <div className="mail-reader-head">
              <span>{mails[selectedMail].role}</span>
              <h3>{mails[selectedMail].subject}</h3>
              <div>
                <i>
                  {mails[selectedMail].from
                    .split(" ")
                    .map((part) => part[0])
                    .join("")
                    .slice(0, 2)}
                </i>
                <p>
                  <b>{mails[selectedMail].from}</b>
                  <small>À : {role}</small>
                </p>
              </div>
            </div>
            <p>{mails[selectedMail].body}</p>
            <div className="mail-actions">
              <button>↩ Répondre</button>
              <button>Transférer</button>
              <button>Archiver</button>
            </div>
          </article>
        </div>
      )}
      {section === "Chat instantané" && (
        <div className="chat-layout">
          <aside className="chat-contacts">
            <div>
              <span>CONVERSATIONS</span>
              <button>＋</button>
            </div>
            <label>
              ⌕<input placeholder="Rechercher une personne…" />
            </label>
            {contacts.map((item, index) => (
              <button className={selectedContact === index ? "selected" : ""} key={item.name} onClick={() => setSelectedContact(index)}>
                <i>
                  {item.initials}
                  <em className={item.online ? "online" : ""}></em>
                </i>
                <span>
                  <b>{item.name}</b>
                  <small>{item.kind}</small>
                  <p>{item.last}</p>
                </span>
              </button>
            ))}
          </aside>
          <article className="chat-window">
            <header>
              <div className="chat-person">
                <i>
                  {contact.initials}
                  <em className={contact.online ? "online" : ""}></em>
                </i>
                <span>
                  <b>{contact.name}</b>
                  <small>{contact.online ? "Disponible maintenant" : "Hors ligne · notifications activées"}</small>
                </span>
              </div>
              <div>
                <button>☎</button>
                <button>◫</button>
                <button>•••</button>
              </div>
            </header>
            <div className="chat-messages">
              <time>Aujourd’hui</time>
              {contact.messages.map((message, index) => (
                <div className={index % 2 ? "mine" : ""} key={message}>
                  <span>{message}</span>
                  <small>{index % 2 ? "10:36 · Lu" : "10:31"}</small>
                </div>
              ))}
              {(sentMessages[selectedContact] || []).map((message, index) => (
                <div className="mine" key={message + index}>
                  <span>{message}</span>
                  <small>À l’instant · Envoyé</small>
                </div>
              ))}
            </div>
            <div className="chat-compose">
              <button>＋</button>
              <input value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => event.key === "Enter" && sendMessage()} placeholder={`Écrire à ${contact.name}…`} />
              <button onClick={sendMessage}>Envoyer</button>
            </div>
          </article>
          <aside className="chat-details">
            <i>{contact.initials}</i>
            <h3>{contact.name}</h3>
            <span>{contact.kind}</span>
            <div>
              <button>Profil</button>
              <button>Fichiers partagés</button>
              <button>Projets communs</button>
            </div>
            <p>Les échanges liés à un projet restent visibles uniquement par les personnes autorisées.</p>
          </aside>
        </div>
      )}
      {section === "Support IT" && (
        <div className="it-center">
          <div className="it-intro">
            <i>IT</i>
            <div>
              <span>ASSISTANCE EURÊKA</span>
              <h3>Comment pouvons-nous vous aider ?</h3>
              <p>Contactez directement l’équipe technique ou suivez vos demandes en cours.</p>
            </div>
            <button
              onClick={() => {
                setSelectedContact(3);
                setSection("Chat instantané");
              }}
            >
              ● Démarrer un chat IT
            </button>
          </div>
          <div className="it-actions">
            <button>
              <i>⌘</i>
              <b>Signaler un problème</b>
              <span>Accès, connexion, documents ou matériel</span>
            </button>
            <button>
              <i>▣</i>
              <b>Demander du matériel</b>
              <span>PC portable, logiciels et accessoires</span>
            </button>
            <button>
              <i>?</i>
              <b>Centre d’aide</b>
              <span>Guides et réponses aux problèmes courants</span>
            </button>
          </div>
          <div className="it-tickets">
            <div>
              <span>MES DEMANDES</span>
              <h3>Tickets récents</h3>
            </div>
            <article>
              <i className="open"></i>
              <span>
                <b>IT-114 · Synchronisation OneNote</b>
                <small>Ouvert aujourd’hui · Technicien : Lucas Perrin</small>
              </span>
              <em>En cours</em>
            </article>
            <article>
              <i></i>
              <span>
                <b>IT-108 · Accès au fichier STEP</b>
                <small>Résolu le 14 août · Solution envoyée par mail</small>
              </span>
              <em>Résolu</em>
            </article>
          </div>
        </div>
      )}
    </section>
  );
}

function SimpleMessaging({ role }: { role: string }) {
  const conversations = [
    { name: "Claire Dubois", role: "Admin métier", initials: "CD", preview: "Le jalon est confirmé pour jeudi.", messages: ["Bonjour, le jalon est confirmé pour jeudi à 14 h.", "Parfait, je dépose les éléments avant la séance."] },
    { name: "Maison Aster", role: "Mandataire", initials: "MA", preview: "Le document est bien reçu.", messages: ["Bonjour, le document est bien reçu.", "Merci, nous revenons vers vous après vérification."] },
    { name: "Support Eurêka", role: "Assistance", initials: "IT", preview: "Comment pouvons-nous vous aider ?", messages: ["Bonjour, vous êtes en ligne avec le support Eurêka."] },
  ];
  const [selected, setSelected] = useState(0);
  const [draft, setDraft] = useState("");
  const [sent, setSent] = useState<Record<number, string[]>>({});
  const conversation = conversations[selected];
  const send = () => {
    if (!draft.trim()) return;
    setSent((current) => ({ ...current, [selected]: [...(current[selected] || []), draft.trim()] }));
    setDraft("");
  };
  return (
    <section className="simple-messaging">
      <aside>
        <header><div><span>MESSAGERIE</span><h3>Conversations</h3></div><button aria-label="Nouvelle conversation">＋</button></header>
        {conversations.map((item, index) => (
          <button className={selected === index ? "active" : ""} key={item.name} onClick={() => setSelected(index)}>
            <i>{item.initials}</i><span><b>{item.name}</b><small>{item.role}</small><p>{item.preview}</p></span>
          </button>
        ))}
      </aside>
      <article>
        <header><i>{conversation.initials}</i><div><h3>{conversation.name}</h3><span>{conversation.role}</span></div></header>
        <div className="simple-message-thread">
          <time>Aujourd’hui</time>
          {conversation.messages.map((message, index) => <p className={index % 2 ? "mine" : ""} key={message}>{message}<small>{index % 2 ? role : conversation.name}</small></p>)}
          {(sent[selected] || []).map((message, index) => <p className="mine" key={`${message}-${index}`}>{message}<small>À l’instant</small></p>)}
        </div>
        <footer><input value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => event.key === "Enter" && send()} placeholder={`Écrire à ${conversation.name}…`} /><button onClick={send}>Envoyer</button></footer>
      </article>
    </section>
  );
}

function SimpleCalendar() {
  const days = Array.from({ length: 30 }, (_, index) => index + 1);
  const [events, setEvents] = useState([
    { day: 8, title: "Point projet EUR-024", time: "10:30" },
    { day: 18, title: "Validation intermédiaire", time: "14:00" },
    { day: 24, title: "Livraison technique", time: "09:00" },
  ]);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [time, setTime] = useState("09:00");
  const addEvent = () => {
    if (!selectedDay || !title.trim()) return;
    setEvents((current) => [...current, { day: selectedDay, title: title.trim(), time }]);
    setTitle("");
    setSelectedDay(null);
  };
  return (
    <section className="simple-calendar">
      <header><button aria-label="Mois précédent">‹</button><div><span>CALENDRIER</span><h3>Septembre 2026</h3></div><button aria-label="Mois suivant">›</button></header>
      <div className="calendar-weekdays">{["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"].map((day) => <b key={day}>{day}</b>)}</div>
      <div className="calendar-grid">
        <span className="calendar-empty"></span>
        {days.map((day) => {
          const dayEvents = events.filter((event) => event.day === day);
          return <button key={day} className={day === 6 ? "today" : ""} onClick={() => setSelectedDay(day)}><strong>{day}</strong>{dayEvents.map((event) => <small key={`${event.time}-${event.title}`}><b>{event.time}</b>{event.title}</small>)}<i>＋</i></button>;
        })}
      </div>
      {selectedDay && <div className="calendar-modal-backdrop" onMouseDown={() => setSelectedDay(null)}><section onMouseDown={(event) => event.stopPropagation()}><button className="account-modal-close" onClick={() => setSelectedDay(null)}>×</button><span>NOUVEL ÉVÉNEMENT</span><h3>{selectedDay} septembre 2026</h3><label>Titre de l’événement<input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Ex. Réunion de projet" /></label><label>Heure<input type="time" value={time} onChange={(event) => setTime(event.target.value)} /></label><footer><button onClick={() => setSelectedDay(null)}>Annuler</button><button className="primary" onClick={addEvent}>Ajouter l’événement</button></footer></section></div>}
    </section>
  );
}

function ForumDiscussionPopup({ question, onClose, onProfile }: { question: { title: string; meta: string; tag: string }; onClose: () => void; onProfile: (name: string) => void }) {
  const [ratings, setRatings] = useState<Record<number, number>>({});
  const [helped, setHelped] = useState<number[]>([]);
  const [acceptedAnswers, setAcceptedAnswers] = useState<number[]>([]);
  const [questionClosed, setQuestionClosed] = useState(false);
  const answers = [
    {
      id: 0,
      name: "Sophie Aubert",
      initials: "SA",
      level: "B",
      job: "Ingénieure complications",
      text: "Je commence par une liste de contrôle fonctionnelle, puis je fais une revue séparée des interfaces et de la cotation. Ça évite de mélanger les deux analyses.",
      rating: 4.9,
      votes: 12,
    },
    {
      id: 1,
      name: "Nicolas Rey",
      initials: "NR",
      level: "S",
      job: "Spécialiste haute horlogerie",
      text: "Je conseille aussi de conserver une version figée avant chaque revue. La comparaison des versions aide beaucoup à identifier les écarts.",
      rating: 4.7,
      votes: 8,
    },
    {
      id: 2,
      name: "Élodie Marchand",
      initials: "EM",
      level: "C",
      job: "Constructrice habillage",
      text: "Pour les dossiers partagés, une nomenclature de contrôle commune permet à chacun de vérifier les mêmes points.",
      rating: 4.3,
      votes: 5,
    },
  ];
  const toggleHelped = (id: number) =>
    setHelped((current) => {
      if (current.includes(id)) {
        setRatings((values) => {
          const next = { ...values };
          delete next[id];
          return next;
        });
        return current.filter((item) => item !== id);
      }
      return [...current, id];
    });
  const toggleAccepted = (id: number) => setAcceptedAnswers((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  const rankedAnswers = [...answers].sort((a, b) => b.votes + (helped.includes(b.id) && ratings[b.id] ? 1 : 0) - (a.votes + (helped.includes(a.id) && ratings[a.id] ? 1 : 0)) || (ratings[b.id] || b.rating) - (ratings[a.id] || a.rating));
  return (
    <div className="project-overlay" onMouseDown={onClose}>
      <section className="forum-popup" onMouseDown={(e) => e.stopPropagation()}>
        <button className="project-close" onClick={onClose}>
          ×
        </button>
        <span className="forum-category">{question.tag} · Discussion freelance</span>
        <h2>{question.title}</h2>
        <p className="forum-meta">{question.meta}</p>
        {questionClosed ? (
          <div className="question-closed-banner">
            <i>✓</i>
            <div>
              <b>Question fermée par son auteur</b>
              <span>
                {acceptedAnswers.length} réponse
                {acceptedAnswers.length > 1 ? "s" : ""} retenue
                {acceptedAnswers.length > 1 ? "s" : ""} comme solution. La discussion reste consultable en lecture seule.
              </span>
            </div>
          </div>
        ) : (
          <div className="forum-warning">◈ Aucune information, référence ou pièce confidentielle d’un projet ne doit être partagée ici.</div>
        )}
        <article className="forum-question-card">
          <button className="forum-author" onClick={() => onProfile("Marc Lenoir")}>
            <i>ML</i>
            <span>
              <b>Marc Lenoir</b>
              <small>Constructeur mouvement · Classe A · Auteur de la question</small>
            </span>
          </button>
          <p>Je cherche vos retours d’expérience et vos bonnes pratiques sur ce point. Quelle méthode utilisez-vous pour fiabiliser le contrôle avant livraison ?</p>
          <small>Question publiée aujourd’hui à 09:18</small>
        </article>
        <div className="answer-ranking-info">
          <b>Classement communautaire</b>
          <span>Tous les freelances peuvent signaler qu’une réponse les a aidés, puis noter obligatoirement sa qualité.</span>
        </div>
        <h3 className="forum-answers-title">
          Réponses <span>{answers.length}</span>
        </h3>
        <div className="forum-answers">
          {rankedAnswers.map((answer, index) => {
            const selectedRating = ratings[answer.id] || 0;
            const hasHelped = helped.includes(answer.id);
            const isAccepted = acceptedAnswers.includes(answer.id);
            const displayedRating = selectedRating || answer.rating;
            const helperCount = answer.votes + (hasHelped && selectedRating ? 1 : 0);
            return (
              <article className={`forum-answer-card ${index === 0 ? "top-ranked" : ""} ${isAccepted ? "accepted-answer" : ""}`} key={answer.name}>
                {isAccepted && <div className="accepted-answer-badge">✓ RÉPONSE RETENUE PAR L’AUTEUR</div>}
                {index === 0 && !isAccepted && <div className="best-answer-badge">★ RÉPONSE LA MIEUX CLASSÉE</div>}
                <div className="answer-number">CLASSÉE N° {index + 1}</div>
                <button className="forum-author" onClick={() => onProfile(answer.name)}>
                  <i>{answer.initials}</i>
                  <span>
                    <b>{answer.name}</b>
                    <small>
                      {answer.job} · Classe {answer.level} · Voir la fiche
                    </small>
                  </span>
                </button>
                <p>{answer.text}</p>
                {!questionClosed && (
                  <button className={`author-solution-check ${isAccepted ? "selected" : ""}`} onClick={() => toggleAccepted(answer.id)}>
                    <i>{isAccepted ? "✓" : "○"}</i>
                    <span>
                      <b>{isAccepted ? "Réponse retenue pour clôturer" : "Cette réponse a résolu ma question"}</b>
                      <small>Choix visible uniquement par l’auteur avant la clôture</small>
                    </span>
                  </button>
                )}
                <div className="community-evaluation">
                  <button disabled={questionClosed} className={`helped-check ${hasHelped ? "checked" : ""}`} onClick={() => toggleHelped(answer.id)}>
                    <i>{hasHelped ? "✓" : "○"}</i>
                    <span>
                      <b>Cette réponse m’a aidé</b>
                      <small>{helperCount} freelances aidés</small>
                    </span>
                  </button>
                  {hasHelped && !questionClosed && (
                    <div className="required-rating">
                      <div>
                        <b>Notez la qualité de cette réponse</b>
                        <small>Obligatoire pour valider votre choix</small>
                      </div>
                      <div className="rating-stars">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <button
                            className={star <= selectedRating ? "active" : ""}
                            key={star}
                            onClick={() =>
                              setRatings((current) => ({
                                ...current,
                                [answer.id]: star,
                              }))
                            }
                          >
                            ★
                          </button>
                        ))}
                      </div>
                      {selectedRating ? <span className="rating-confirmed">✓ Note enregistrée : {selectedRating}/5</span> : <span className="rating-required">Choisissez une note pour valider</span>}
                    </div>
                  )}
                  <div className="answer-score">
                    <small>NOTE MOYENNE</small>
                    <strong>{Number(displayedRating).toFixed(1)} / 5</strong>
                    <span>{answer.votes + (selectedRating ? 1 : 0)} évaluations</span>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
        <div className="helpful-explanation">Les réponses retenues indiquent précisément les solutions qui ont permis à l’auteur de résoudre sa question.</div>
        {questionClosed ? (
          <div className="closed-readonly">🔒 Cette question est fermée : aucune nouvelle réponse ou évaluation ne peut être ajoutée.</div>
        ) : (
          <>
            <section className="close-question-panel">
              <div>
                <span>ACTION DE L’AUTEUR</span>
                <h3>Fermer ma question</h3>
                <p>Sélectionnez au moins une réponse qui a résolu votre problème. Vous pouvez en retenir plusieurs.</p>
              </div>
              <button disabled={acceptedAnswers.length === 0} onClick={() => setQuestionClosed(true)}>
                Fermer la question {acceptedAnswers.length > 0 ? `· ${acceptedAnswers.length} réponse${acceptedAnswers.length > 1 ? "s" : ""}` : ""}
              </button>
            </section>
            <label className="forum-reply">
              <textarea placeholder="Écrire une réponse…" />
              <button>Publier la réponse</button>
            </label>
          </>
        )}
      </section>
    </div>
  );
}

function UserPortal({ role, active, onNavigate, shared }: { role: string; active: string; onNavigate: (section: string) => void; shared: MvpSharedProps }) {
  const fallback = "Accueil";
  const customScreen = active === "Documents" || (role === "Mandataire" && (active === "Devis" || active === "Postulations"));
  const displayActive = portalData[role]?.[active] || customScreen ? active : fallback;
  const data = portalData[role]?.[active] || portalData[role][fallback];
  const openHomeNotification = (title: string) => {
    if (role === "Freelance") onNavigate(title.toLowerCase().includes("proposition") ? "Tableau de missions" : "Projets");
    else onNavigate(title.toLowerCase().includes("devis") ? "Demandes de devis" : "Projets");
  };
  const openHomeCard = (item: { title: string; meta: string; tag: string }) => {
    if (role === "Mandataire" && (item.tag.includes("valider") || item.meta.toLowerCase().includes("devis"))) onNavigate("Demandes de devis");
    else onNavigate("Projets");
  };
  const [filter, setFilter] = useState("Tous");
  const [selectedProject, setSelectedProject] = useState<{
    title: string;
    meta: string;
    tag: string;
  } | null>(null);
  const [selectedMission, setSelectedMission] = useState<{
    title: string;
    meta: string;
    tag: string;
  } | null>(null);
  const [selectedForum, setSelectedForum] = useState<{
    title: string;
    meta: string;
    tag: string;
  } | null>(null);
  const [newForumOpen, setNewForumOpen] = useState(false);
  const [forumScope, setForumScope] = useState("Toutes les questions");
  const [forumCategory, setForumCategory] = useState("Toutes");
  const [forumSubcategory, setForumSubcategory] = useState("Toutes");
  const [forumSearch, setForumSearch] = useState("");
  const [selectedForumProfile, setSelectedForumProfile] = useState<string | null>(null);
  const [selectedMeeting, setSelectedMeeting] = useState<{
    title: string;
    type: string;
    date: string;
    objective: string;
    participants: string[];
  } | null>(null);
  const [newMeetingOpen, setNewMeetingOpen] = useState(false);
  const [projectTab, setProjectTab] = useState("Vue d’ensemble");
  const [quickAccesses, setQuickAccesses] = useState(role === "Mandataire" ? ["Projets", "Demandes de devis", "Devis"] : ["Projets", "Tableau de missions"]);
  const [projectDocuments, setProjectDocuments] = useState<Record<string, { name: string; format: string; uploadedBy: string; url: string }[]>>({});
  const [projectUploadStatus, setProjectUploadStatus] = useState("");
  const [sharedLibraryFiles, setSharedLibraryFiles] = useState<{ title: string; name: string; format: string; url: string }[]>([]);
  const [selectedReference, setSelectedReference] = useState<{ title: string; type: string; format: string; version: string; description: string } | null>(null);
  useEffect(() => setFilter("Tous"), [displayActive]);
  const missionBoard = role === "Freelance" && displayActive === "Tableau de missions";
  const projectBoard = displayActive === "Projets";
  const sharedDocumentsBoard = displayActive === "Documents";
  const mandataireRequestBoard = role === "Mandataire" && displayActive === "Demandes de devis";
  const mandataireQuoteBoard = role === "Mandataire" && displayActive === "Devis";
  const mandataireApplicationsBoard = role === "Mandataire" && displayActive === "Postulations";
  const statisticsBoard = role === "Freelance" && displayActive === "Statistiques";
  const forumBoard = role === "Freelance" && displayActive === "Forum métier";
  const meetingBoard = role === "Freelance" && displayActive === "Salles de réunion";
  const messagingBoard = displayActive === "Messagerie";
  const calendarBoard = displayActive === "Calendrier";
  const documentTemplatesBoard = displayActive === "Documents de projets";
  const standardsBoard = displayActive === "Normes & standards";
  useEffect(() => {
    const category = documentTemplatesBoard ? "Documents de projets" : standardsBoard ? "Normes & standards" : "";
    if (!category) return;
    fetch(`/api/share-documents?category=${encodeURIComponent(category)}`)
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Chargement impossible");
        return payload;
      })
      .then((payload) => setSharedLibraryFiles(payload.documents || []))
      .catch(() => setSharedLibraryFiles([]));
  }, [documentTemplatesBoard, standardsBoard]);
  const referenceDocuments = [
    { title: "Standard de construction mouvement", type: "PDF", format: "PDF", version: "Version 3.2", description: "Règles de construction, bonnes pratiques et critères techniques applicables aux mouvements." },
    { title: "Standard de mise en plan", type: "PDF", format: "PDF", version: "Version 4.1", description: "Présentation des plans, cotation, tolérancement et informations obligatoires." },
    { title: "NIHS 02-10 — Dimensions d’emboîtage", type: "PDF", format: "PDF", version: "Norme en vigueur", description: "Référence dimensionnelle utilisée pour les interfaces d’emboîtage horloger." },
    { title: "NIHS 91-10 — Étanchéité", type: "PDF", format: "PDF", version: "Norme en vigueur", description: "Méthodes et critères de contrôle de l’étanchéité avant la validation d’un projet." },
    { title: "ISO 3159 — Chronomètres-bracelets", type: "PDF", format: "PDF", version: "Édition contrôlée", description: "Prescriptions relatives aux chronomètres-bracelets à oscillateur balancier-spiral." },
    { title: "Normes internes Eurêka R&D", type: "Word", format: "DOCX", version: "Version 2.6", description: "Exigences complémentaires définies par l’administration métier pour les projets Eurêka." },
    { title: "Nomenclature des composants", type: "Excel", format: "XLSX", version: "Version 3.0", description: "Codification commune des composants et règles de désignation utilisées dans les dossiers." },
    { title: "Guide de contrôle des dossiers CAO", type: "OneNote", format: "ONE", version: "Version 2.0", description: "Méthode de contrôle des assemblages, références et versions avant livraison." },
  ];
  const documentTemplates = role === "Freelance"
    ? [
        { title: "PV de séance", type: "Word", format: "DOCX", destination: "Suivi", description: "Compte rendu d’une séance, décisions prises et prochaines actions." },
        { title: "Fiche de livraison technique", type: "Word", format: "DOCX", destination: "Documents", description: "Liste des fichiers livrés, versions et contrôles réalisés." },
        { title: "Notes de séance", type: "OneNote", format: "ONE", destination: "Suivi", description: "Support de prise de notes avant la rédaction du PV définitif." },
        { title: "Relevé de corrections", type: "Excel", format: "XLSX", destination: "Documents", description: "Suivi des remarques, responsables, statuts et dates de correction." },
      ]
    : [
        { title: "Cahier des charges", type: "Word", format: "DOCX", destination: "Cahier des charges", description: "Objectifs, contraintes, livrables attendus et critères de validation." },
        { title: "Fiche de demande de mission", type: "Word", format: "DOCX", destination: "Missions", description: "Périmètre de la mission, compétences recherchées et échéances." },
        { title: "Validation d’un livrable", type: "PDF", format: "PDF", destination: "Cahier des charges", description: "Acceptation, réserves éventuelles et décision du mandataire." },
        { title: "Grille de besoins du projet", type: "Excel", format: "XLSX", destination: "Missions", description: "Inventaire structuré des besoins et priorités du projet." },
      ];
  const meetingRooms = [
    {
      title: "Jalon 2 — Validation intermédiaire",
      type: "Projet automatique",
      date: "Aujourd’hui · 14:00–15:00",
      objective: "Valider l’architecture du rouage et les interfaces avant la mise en plans.",
      participants: ["Marc Lenoir", "Claire Dubois", "Julien Morel", "Sophie Aubert"],
    },
    {
      title: "Revue finale — Tourbillon",
      type: "Projet automatique",
      date: "Jeudi · 10:30–11:30",
      objective: "Présenter les livrables finaux et clôturer les remarques techniques.",
      participants: ["Marc Lenoir", "Claire Dubois", "Antoine Keller"],
    },
    {
      title: "Entraide — Chaînes de cotes",
      type: "Entraide freelance",
      date: "Demain · 18:30–19:15",
      objective: "Échanger sur les méthodes générales de contrôle des chaînes de cotes.",
      participants: ["Marc Lenoir", "Sophie Aubert", "Élodie Marchand"],
    },
  ];
  const forumQuestions = [
    {
      title: "Tolérancement des mobiles",
      meta: "8 réponses · Dernière activité aujourd’hui",
      tag: "Technique",
      subcategory: "Tolérancement",
      author: "Marc Lenoir",
      mine: true,
    },
    {
      title: "Bonnes pratiques Inventor",
      meta: "12 réponses · Épinglé par l’admin",
      tag: "CAO & logiciels",
      subcategory: "Inventor",
      author: "Sophie Aubert",
      mine: false,
    },
    {
      title: "Questions sur le standard de plans",
      meta: "4 réponses",
      tag: "Normes & standards",
      subcategory: "Mise en plan",
      author: "Marc Lenoir",
      mine: true,
    },
    {
      title: "Contrôle d’un engrenage après construction",
      meta: "6 réponses · Activité hier",
      tag: "Technique",
      subcategory: "Rouage & engrenages",
      author: "Nicolas Rey",
      mine: false,
    },
    {
      title: "Organisation d’une revue CAO à distance",
      meta: "3 réponses",
      tag: "Organisation",
      subcategory: "Suivi de projet",
      author: "Élodie Marchand",
      mine: false,
    },
  ];
  const forumSubcategories = forumCategory === "Toutes" ? ["Toutes", "Tolérancement", "Inventor", "Mise en plan", "Rouage & engrenages", "Suivi de projet"] : forumCategory === "Technique" ? ["Toutes", "Tolérancement", "Rouage & engrenages"] : forumCategory === "CAO & logiciels" ? ["Toutes", "Inventor"] : forumCategory === "Normes & standards" ? ["Toutes", "Mise en plan"] : ["Toutes", "Suivi de projet"];
  const visibleForumQuestions = forumQuestions.filter((q) => (forumScope === "Toutes les questions" || q.mine) && (forumCategory === "Toutes" || q.tag === forumCategory) && (forumSubcategory === "Toutes" || q.subcategory === forumSubcategory) && `${q.title} ${q.meta} ${q.author}`.toLowerCase().includes(forumSearch.toLowerCase()));
  const tags = missionBoard ? ["Tous", "Rang D", "Rang C", "Rang B", "Rang A", "Rang S"] : ["Tous", ...Array.from(new Set(data.items.map((i) => i.tag)))];
  const projectsForTrade = shared.acceptedProjects.filter(project=>project.tradeId===shared.currentUser.tradeId);
  const portalProjects = role === "Mandataire" ? projectsForTrade.filter(project=>project.mandataireId===shared.currentUser.id) : projectsForTrade.filter(project=>project.freelancerId===shared.currentUser.id);
  const selectedPortalProject = portalProjects.find(project=>project.title===selectedProject?.title);
  const availableMissions = projectsForTrade.filter(project=>(project.status==="À attribuer"||project.status==="Publié")&&!project.freelancerId);
  const dynamicPortalItems = projectBoard ? portalProjects.map(p=>({title:p.title,meta:`${p.id} · CHF ${p.price.toLocaleString("fr-CH")} · Classe ${p.projectClass}`,tag:p.status})) : missionBoard ? availableMissions.map(p=>({title:p.title,meta:`Projet publié · CHF ${p.price.toLocaleString("fr-CH")}`,tag:`Rang ${p.projectClass} · ${p.credits} crédits`})) : [];
  const baseShown = projectBoard || missionBoard ? dynamicPortalItems : data.items;
  const shown = documentTemplatesBoard || standardsBoard || sharedDocumentsBoard || mandataireRequestBoard || mandataireQuoteBoard || mandataireApplicationsBoard || (role === "Freelance" && displayActive === "Accueil") ? [] : filter === "Tous" ? baseShown : baseShown.filter((i) => (missionBoard ? i.tag.startsWith(filter) : i.tag === filter));
  const openProject = (item: { title: string; meta: string; tag: string }) => {
    setSelectedProject(item);
    setProjectTab("Vue d’ensemble");
  };
  const rankOrder: Record<string, number> = { D: 0, C: 1, B: 2, A: 3, S: 4 };
  const loggedFreelancer = shared.currentUser.role === "Freelance" ? shared.currentUser : undefined;
  const freelanceRank = loggedFreelancer?.projectClass || shared.freelancer.projectClass;
  const freelanceCredits = loggedFreelancer?.credits ?? shared.freelancer.credits;
  const dynamicSelectedMission = selectedMission ? availableMissions.find((project) => project.title === selectedMission.title) : undefined;
  const selectedMissionDetails = selectedMission ? missionDetails[selectedMission.title] || (dynamicSelectedMission ? { rank: dynamicSelectedMission.projectClass as "D"|"C"|"B"|"A"|"S", price: `CHF ${dynamicSelectedMission.price.toLocaleString("fr-CH")}`, credits: dynamicSelectedMission.credits, duration: "À définir", description: "Mission créée après acceptation du devis par le mandataire." } : null) : null;
  const closedProject = selectedProject?.tag === "Clôturé";
  const projectTabs = closedProject ? ["Vue d’ensemble", "Évaluation", "PV validés", "Documents"] : ["Vue d’ensemble", "Cahier des charges", "Missions", "Documents", "Suivi"];
  const projectTabItems: Record<string, { title: string; meta: string; tag: string }[]> = {
    "Vue d’ensemble": selectedPortalProject ? [
          { title:"Identifiant du projet",meta:selectedPortalProject.id,tag:"Persistant" },
          { title:"État du projet",meta:selectedPortalProject.status,tag:selectedPortalProject.status },
          { title:"Budget accepté",meta:`CHF ${selectedPortalProject.price.toLocaleString("fr-CH")}`,tag:"Virement manuel" },
          { title:"Classe et crédits",meta:`Classe ${selectedPortalProject.projectClass} · ${selectedPortalProject.credits} crédits immobilisés`,tag:"Calcul serveur" },
        ] : closedProject ? [
          {
            title: "Archive du projet",
            meta: selectedProject?.meta || "",
            tag: "Accès limité",
          },
          {
            title: "Éléments conservés",
            meta: "Résumé non confidentiel, évaluation finale et procès-verbaux validés.",
            tag: "Lecture seule",
          },
          {
            title: "Propriété du projet",
            meta: "Les données techniques et les livrables restent la propriété du mandataire.",
            tag: "Client",
          },
          {
            title: "Durée de conservation",
            meta: "Les droits d’accès définitifs seront paramétrés par l’admin métier.",
            tag: "À définir",
          },
        ]
      : [
          { title: "Mandataire", meta: "Maison Aster", tag: "Client vérifié" },
          {
            title: "État du projet",
            meta: selectedProject?.meta || "",
            tag: selectedProject?.tag || "En cours",
          },
          {
            title: "Responsable métier",
            meta: "Claire Dubois",
            tag: "R&D Horlogerie",
          },
          {
            title: "Budget validé",
            meta: getProjectClassification(selectedProject?.title || "").price,
            tag: "Forfait",
          },
        ],
    "Cahier des charges": [
      {
        title: "Objectif",
        meta: "Développer une solution horlogère complète selon les exigences validées.",
        tag: "Validé",
      },
      {
        title: "Contraintes principales",
        meta: "Encombrement, réserve de marche, fiabilité et industrialisation.",
        tag: "4 exigences",
      },
      {
        title: "Livrables attendus",
        meta: "Maquette CAO, dossier de plans et dossier de validation.",
        tag: "3 livrables",
      },
    ],
    Missions: [
      {
        title: "Construction du rouage",
        meta: "Attribuée à Marc Lenoir · Avancement 70%",
        tag: "En cours",
      },
      {
        title: "Mise en plans",
        meta: "Attribution prévue après validation de la construction",
        tag: "À venir",
      },
      {
        title: "Contrôle fonctionnel",
        meta: "Spécialiste à sélectionner",
        tag: "À attribuer",
      },
    ],
    Documents: closedProject
      ? [
          {
            title: "Documents techniques du client",
            meta: "Plans, fichiers CAO, cahier des charges et livrables sources retirés après la clôture.",
            tag: "🔒 Accès retiré",
          },
          {
            title: "Droits d’archive à définir",
            meta: "L’admin métier pourra paramétrer précisément les documents conservés selon le contrat du projet.",
            tag: "Paramétrable",
          },
        ]
      : [
          {
            title: "Cahier des charges V2.3",
            meta: "PDF · Mis à jour le 12 août",
            tag: "Document",
          },
          {
            title: "Maquette CAO intermédiaire",
            meta: "Inventor · Déposée hier",
            tag: "CAO",
          },
          {
            title: "Compte rendu de validation",
            meta: "PDF · 3 remarques ouvertes",
            tag: "À revoir",
          },
        ],
    Suivi: [
      {
        title: "Avancement général",
        meta: "Construction en cours · prochaine étape le 18 septembre",
        tag: "68%",
      },
      {
        title: "Dernière activité",
        meta: "3 documents déposés par le freelance",
        tag: "Aujourd’hui",
      },
      {
        title: "Prochaine décision",
        meta: "Validation intermédiaire par l’admin métier",
        tag: "À planifier",
      },
    ],
    Évaluation: [
      {
        title: "Évaluation finale",
        meta: "Qualité technique 4,8 · Délais 5,0 · Communication 4,5 · Dossier final 4,7",
        tag: "4,8 / 5",
      },
      {
        title: "Crédits attribués",
        meta: "Évaluation contrôlée et validée par l’admin métier",
        tag: "+8 crédits",
      },
      {
        title: "Commentaire du mandataire",
        meta: "Travail rigoureux, livrables complets et échanges professionnels.",
        tag: "Validé",
      },
    ],
    "PV validés": [
      {
        title: "PV — Cadrage du projet",
        meta: "Document final signé · Lecture seule",
        tag: "Accessible",
      },
      {
        title: "PV — Validation intermédiaire",
        meta: "Document final signé · Lecture seule",
        tag: "Accessible",
      },
      {
        title: "PV — Clôture et livraison",
        meta: "Document final signé · Lecture seule",
        tag: "Accessible",
      },
    ],
  };
  const projectName = (selectedProject?.title || "").toLowerCase();
  const classification = getProjectClassification(selectedProject?.title || "");
  const closedTimelineEnd = projectName.includes("nomenclature") ? new Date(2026, 3, 18) : projectName.includes("dossier de plans") ? new Date(2026, 5, 6) : new Date(2026, 6, 22);
  const timelineEnd = closedProject ? closedTimelineEnd : projectName.includes("tourbillon") ? new Date(2026, 7, 29) : projectName.includes("phase de lune") ? new Date(2026, 8, 24) : projectName.includes("barillet") ? new Date(2026, 9, 4) : new Date(2026, 8, 18);
  const timelineStart = closedProject ? new Date(timelineEnd.getTime() - 45 * 24 * 60 * 60 * 1000) : new Date(2026, 7, 4);
  const today = new Date();
  const timelineProgress = closedProject ? 100 : Math.max(0, Math.min(100, ((today.getTime() - timelineStart.getTime()) / (timelineEnd.getTime() - timelineStart.getTime())) * 100));
  const formatDate = (date: Date) => date.toLocaleDateString("fr-CH", { day: "2-digit", month: "short" }).replace(".", "");
  const milestones = [
    { title: "Cadrage validé", position: 22 },
    { title: "Validation intermédiaire", position: 52 },
    { title: "Livraison technique", position: 82 },
  ].map((m) => ({
    ...m,
    date: new Date(timelineStart.getTime() + (timelineEnd.getTime() - timelineStart.getTime()) * (m.position / 100)),
  }));
  const documentTabOwners: Record<string, string> = {
    "Cahier des charges": "Mandataire",
    Missions: "Mandataire",
    Documents: "Freelance",
    Suivi: "Freelance",
  };
  const documentTabDescriptions: Record<string, string> = {
    "Cahier des charges": "Document de référence transmis par le mandataire.",
    Missions: "Documents de mission transmis par le mandataire.",
    Documents: "Documents de construction déposés par le freelance.",
    Suivi: "Uniquement les procès-verbaux de séances déposés par le freelance.",
  };
  const documentAreas:Record<string,string>={"Cahier des charges":"cahier_des_charges",Missions:"mission",Documents:"documents",Suivi:"suivi"};
  const projectDocumentKey = selectedProject ? `${selectedProject.title}::${projectTab}` : "";
  useEffect(() => {
    if (!selectedProject || !selectedPortalProject || closedProject || !documentTabOwners[projectTab]) return;
    const currentProject = selectedProject.title;
    const currentTab = projectTab;
    const stateKey = `${currentProject}::${currentTab}`;
    setProjectUploadStatus("Chargement des documents…");
    fetch(`/api/v1/documents?tradeId=${encodeURIComponent(shared.currentUser.tradeId)}&projectId=${encodeURIComponent(selectedPortalProject.id)}&area=${encodeURIComponent(documentAreas[currentTab])}`)
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Chargement impossible");
        return payload;
      })
      .then((payload) => {
        setProjectDocuments((current) => ({ ...current, [stateKey]: (payload.documents || []).map((document:{original_name:string;mime_type:string;downloadUrl:string})=>({name:document.original_name,format:document.original_name.split(".").pop()?.toUpperCase()||"FICHIER",uploadedBy:"Membre autorisé",url:document.downloadUrl})) }));
        setProjectUploadStatus("");
      })
      .catch((error) => setProjectUploadStatus(error instanceof Error ? error.message : "Impossible de charger les documents."));
  }, [selectedProject, selectedPortalProject, projectTab, closedProject, shared.currentUser.tradeId]);
  const addProjectDocuments = async (tab: string, files: FileList | null) => {
    if (!files || !selectedProject || !selectedPortalProject) return;
    const selectedFiles = Array.from(files);
    const stateKey = `${selectedProject.title}::${tab}`;
    setProjectUploadStatus(`Envoi de ${selectedFiles.length} fichier${selectedFiles.length > 1 ? "s" : ""}…`);
    try {
      const uploaded: { name: string; format: string; uploadedBy: string; url: string }[] = [];
      for (const file of selectedFiles) {
        const form = new FormData();
        form.append("file", file);
        form.append("tradeId", shared.currentUser.tradeId);
        form.append("projectId", selectedPortalProject.id);
        form.append("area", documentAreas[tab]);
        const response = await fetch("/api/v1/documents", { method: "POST", body: form });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || `Impossible d’envoyer ${file.name}`);
        uploaded.push({name:payload.originalName,format:payload.originalName.split(".").pop()?.toUpperCase()||"FICHIER",uploadedBy:shared.currentUser.name,url:payload.downloadUrl});
      }
      setProjectDocuments((current) => ({ ...current, [stateKey]: [...uploaded, ...(current[stateKey] || [])] }));
      setProjectUploadStatus(`${selectedFiles.length} fichier${selectedFiles.length > 1 ? "s enregistrés" : " enregistré"} avec succès.`);
      window.setTimeout(() => setProjectUploadStatus(""), 2500);
    } catch (error) {
      setProjectUploadStatus(error instanceof Error ? error.message : "Impossible d’envoyer le fichier.");
    }
  };
  return (
    <div
      className={"simple-page portal-" + role.toLowerCase()}
      onClickCapture={(event) => {
        if (displayActive !== "Accueil") return;
        const target = event.target as HTMLElement;
        const card = target.closest(".simple-tiles:not(.notification-tiles) > button");
        if (!card) return;
        const title = card.querySelector("b")?.textContent;
        const item = shown.find((entry) => entry.title === title);
        if (item) openHomeCard(item);
      }}
    >
      <div className="role-top">
        <EurekaLogo />
        {role === "Freelance" && (
          <div className="freelance-level">
            <span>
              <small>CLASSE</small>
              <b>{freelanceRank}</b>
            </span>
            <span>
              <small>CRÉDITS</small>
              <strong>
                {freelanceCredits} / 100
                <i className="credit-coin" aria-hidden="true">
                  E
                </i>
              </strong>
            </span>
            <span>
              <small>NOTE MOYENNE</small>
              <strong>{(loggedFreelancer?.note ?? shared.freelancer.note).toLocaleString("fr-CH")} ★</strong>
            </span>
          </div>
        )}
      </div>
      <div className="simple-heading">
        <span>ESPACE {role.toUpperCase()} · {shared.currentUser.tradeName.toUpperCase()}</span>
        <h2>{displayActive}</h2>
        <i></i>
      </div>
      {mandataireRequestBoard && <MandataireQuoteFlow mode="requests" quotes={shared.quotes.filter(quote=>quote.tradeId===shared.currentUser.tradeId&&quote.mandataireId===shared.currentUser.id)} onCreate={shared.onCreateQuote} onAccept={shared.onAcceptQuote} onDecision={shared.onQuoteDecision} />}
      {mandataireQuoteBoard && <MandataireQuoteFlow mode="quotes" quotes={shared.quotes.filter(quote=>quote.tradeId===shared.currentUser.tradeId&&quote.mandataireId===shared.currentUser.id)} onCreate={shared.onCreateQuote} onAccept={shared.onAcceptQuote} onDecision={shared.onQuoteDecision} />}
      {mandataireApplicationsBoard && <MandataireApplicationsBoard shared={shared} />}
      {sharedDocumentsBoard && <SharedDocumentsFlow folders={role === "Freelance" ? shared.freelanceFolders : shared.mandataireFolders} />}
      {messagingBoard && <MessagingCenter role={role} />}
      {calendarBoard && <SimpleCalendar />}
      {documentTemplatesBoard && (
        <section className="document-templates-hub">
          <div className="document-template-grid">
            {documentTemplates.map((template) => (
              <article key={template.title}>
                <div className="template-file-icon"><b>{template.format}</b><i>▤</i></div>
                <span>{role === "Freelance" ? "MODÈLE FREELANCE" : "MODÈLE MANDATAIRE"}</span>
                <h4>{template.title}</h4>
                <strong className="template-type">Type de fichier : {template.type} · {template.format}</strong>
                <p>{template.description}</p>
                <small>À déposer dans : <b>Projet → {template.destination}</b></small>
                <footer>
                  {sharedLibraryFiles.find((file) => file.title === template.title) ? (
                    <a href={sharedLibraryFiles.find((file) => file.title === template.title)?.url} download={sharedLibraryFiles.find((file) => file.title === template.title)?.name}>↓ Télécharger vierge</a>
                  ) : (
                    <button disabled>Fichier bientôt disponible</button>
                  )}
                </footer>
              </article>
            ))}
          </div>
        </section>
      )}
      {standardsBoard && (
        <section className="document-templates-hub standards-library">
          <div className="document-template-grid">
            {referenceDocuments.map((document) => (
              <article key={document.title}>
                <div className="template-file-icon"><b>{document.format}</b><i>▤</i></div>
                <span>DOCUMENT DE RÉFÉRENCE</span>
                <h4>{document.title}</h4>
                <strong className="template-type">Type de fichier : {document.type} · {document.format}</strong>
                <p>{document.description}</p>
                <small><b>{document.version}</b> · Lecture seule</small>
                <footer>
                  {sharedLibraryFiles.find((file) => file.title === document.title) ? (
                    <a className="consult-document" href={sharedLibraryFiles.find((file) => file.title === document.title)?.url} target="_blank" rel="noreferrer">Consulter</a>
                  ) : (
                    <button className="consult-document" disabled>Fichier bientôt disponible</button>
                  )}
                </footer>
              </article>
            ))}
          </div>
          {selectedReference && (
            <div className="reference-viewer-backdrop" onMouseDown={() => setSelectedReference(null)}>
              <section className="reference-viewer" onMouseDown={(event) => event.stopPropagation()}>
                <button className="account-modal-close" onClick={() => setSelectedReference(null)}>×</button>
                <span>LECTURE SEULE · {selectedReference.type.toUpperCase()}</span>
                <h2>{selectedReference.title}</h2>
                <small>{selectedReference.version}</small>
                <div className="reference-document-page"><h3>Document de référence</h3><p>{selectedReference.description}</p><p>Ce document est mis à disposition par l’administrateur métier. Il peut être consulté directement dans la plateforme, mais son téléchargement et sa modification sont désactivés.</p><div><b>R&D HORLOGERIE</b><span>Document contrôlé · Lecture seule</span></div></div>
                <footer><button onClick={() => setSelectedReference(null)}>Fermer le document</button></footer>
              </section>
            </div>
          )}
        </section>
      )}
      {displayActive === "Accueil" && (role === "Freelance" || role === "Mandataire") && (
        <section className="freelance-quick-home">
          <div>
            <span>ACCUEIL PERSONNALISÉ</span>
            <h3>Mes accès rapides</h3>
            <p>Ajoutez uniquement les raccourcis dont vous avez besoin.</p>
          </div>
          <div className="freelance-quick-grid">
            {quickAccesses.map((access) => (
              <div className="quick-card-wrap" key={access}><button onClick={() => onNavigate(access)}><i>↗</i><b>{access}</b><small>Ouvrir cet espace</small></button><button className="quick-remove" aria-label={`Supprimer ${access}`} onClick={()=>setQuickAccesses(current=>current.filter(item=>item!==access))}>×</button></div>
            ))}
            <button
              className="quick-add"
              onClick={() => {
                const available = (role === "Mandataire" ? ["Postulations","Documents"] : ["Documents"]).find((item) => !quickAccesses.includes(item));
                if (available) setQuickAccesses((current) => [...current, available]);
              }}
            >
              <i>＋</i>
              <b>Ajouter un raccourci</b>
              <small>Personnaliser mon accueil</small>
            </button>
          </div>
        </section>
      )}
      {displayActive === "Accueil" && role !== "Freelance" && role !== "Mandataire" && (
        <>
          <h3 className="notification-title">Notifications</h3>
          <div className="simple-tiles notification-tiles">
            {homeNotifications[role].map((n) => (
              <button className={n.level} key={n.title} onClick={() => openHomeNotification(n.title)}>
                <span className="notification-icon">!</span>
                <b>{n.title}</b>
                <small>{n.meta}</small>
                <em>{n.tag}</em>
              </button>
            ))}
          </div>
          <h3 className="notification-title secondary">Mes projets</h3>
        </>
      )}
      {forumBoard && (
        <>
          <div className="forum-toolbar">
            <div>
              <b>Entraide entre freelances</b>
              <span>Posez vos questions sans partager d’informations confidentielles sur les projets.</span>
            </div>
            <button onClick={() => setNewForumOpen(true)}>＋ Poser une question</button>
            <div className="forum-navigation">
              <nav>
                {["Toutes les questions", "Mes questions"].map((scope) => (
                  <button className={forumScope === scope ? "active" : ""} key={scope} onClick={() => setForumScope(scope)}>
                    {scope}
                  </button>
                ))}
              </nav>
              <label className="forum-search">
                <span>⌕</span>
                <input value={forumSearch} onChange={(e) => setForumSearch(e.target.value)} placeholder="Rechercher une question…" />
              </label>
            </div>
            <div className="forum-filter-group">
              <small>CATÉGORIES</small>
              <div>
                {["Toutes", "Technique", "CAO & logiciels", "Normes & standards", "Organisation"].map((category) => (
                  <button
                    className={forumCategory === category ? "active" : ""}
                    key={category}
                    onClick={() => {
                      setForumCategory(category);
                      setForumSubcategory("Toutes");
                    }}
                  >
                    {category}
                  </button>
                ))}
              </div>
            </div>
            <div className="forum-filter-group subcategories">
              <small>SOUS-CATÉGORIES</small>
              <div>
                {forumSubcategories.map((subcategory) => (
                  <button className={forumSubcategory === subcategory ? "active" : ""} key={subcategory} onClick={() => setForumSubcategory(subcategory)}>
                    {subcategory}
                  </button>
                ))}
              </div>
            </div>
            <section className="forum-topics">
              {visibleForumQuestions.map((item) => (
                <button key={item.title} onClick={() => setSelectedForum(item)}>
                  <span>
                    {item.tag} · {item.subcategory}
                  </span>
                  <h3>{item.title}</h3>
                  <p>{item.meta}</p>
                  <small>
                    Posée par {item.author}
                    {item.mine ? " · Ma question" : ""}
                  </small>
                  <em>Ouvrir la discussion →</em>
                </button>
              ))}
            </section>
            {visibleForumQuestions.length === 0 && <div className="forum-empty">Aucune question ne correspond à ces filtres.</div>}
          </div>
          {selectedForum && <ForumDiscussionPopup question={selectedForum} onClose={() => setSelectedForum(null)} onProfile={setSelectedForumProfile} />}
          {selectedForumProfile && (
            <div className="profile-overlay" onMouseDown={() => setSelectedForumProfile(null)}>
              <section className="forum-profile-card" onMouseDown={(e) => e.stopPropagation()}>
                <button className="project-close" onClick={() => setSelectedForumProfile(null)}>
                  ×
                </button>
                <div className="forum-profile-head">
                  <i>
                    {selectedForumProfile
                      .split(" ")
                      .map((name) => name[0])
                      .join("")}
                  </i>
                  <div>
                    <span>FICHE FREELANCE</span>
                    <h2>{selectedForumProfile}</h2>
                    <p>{selectedForumProfile === "Nicolas Rey" ? "Spécialiste haute horlogerie · Classe S" : selectedForumProfile === "Sophie Aubert" ? "Ingénieure complications · Classe B" : selectedForumProfile === "Élodie Marchand" ? "Constructrice habillage · Classe C" : "Constructeur mouvement · Classe A"}</p>
                  </div>
                </div>
                <div className="forum-profile-stats">
                  <article>
                    <strong>4,8 / 5</strong>
                    <span>Note moyenne</span>
                  </article>
                  <article>
                    <strong>93 %</strong>
                    <span>Délais respectés</span>
                  </article>
                  <article>
                    <strong>14</strong>
                    <span>Projets terminés</span>
                  </article>
                </div>
                <h3>Compétences principales</h3>
                <div className="forum-profile-skills">
                  <span>Construction horlogère</span>
                  <span>Inventor</span>
                  <span>Mise en plans</span>
                  <span>Tolérancement</span>
                </div>
                <button className="forum-profile-open">Ouvrir la fiche complète</button>
              </section>
            </div>
          )}
          {newForumOpen && (
            <div className="project-overlay" onMouseDown={() => setNewForumOpen(false)}>
              <section className="forum-popup new-topic" onMouseDown={(e) => e.stopPropagation()}>
                <button className="project-close" onClick={() => setNewForumOpen(false)}>
                  ×
                </button>
                <span className="forum-category">NOUVELLE DISCUSSION</span>
                <h2>Poser une question aux freelances</h2>
                <div className="forum-taxonomy">
                  <label>
                    Catégorie principale
                    <select>
                      <option>Technique horlogère</option>
                      <option>CAO & logiciels</option>
                      <option>Normes & standards</option>
                      <option>Organisation du travail</option>
                    </select>
                  </label>
                  <label>
                    Sous-catégorie
                    <select>
                      <option>Rouage & engrenages</option>
                      <option>Barillet & réserve de marche</option>
                      <option>Échappement</option>
                      <option>Tolérancement & chaînes de cotes</option>
                      <option>Mise en plan</option>
                      <option>Prototypage & validation</option>
                    </select>
                  </label>
                </div>
                <label className="forum-question-title">
                  Titre de la question <small>Indiquez précisément ce que votre question concerne</small>
                  <input placeholder="Ex. Contrôle de l’entraxe entre deux mobiles" />
                </label>
                <label>
                  Votre question
                  <textarea placeholder="Expliquez votre problème sans citer le client ni joindre de données confidentielles…" />
                </label>
                <div className="forum-warning">La publication est visible par tous les freelances du métier R&D Horlogerie.</div>
                <button className="forum-publish" onClick={() => setNewForumOpen(false)}>
                  Publier la question
                </button>
              </section>
            </div>
          )}
        </>
      )}
      {meetingBoard && (
        <>
          <section className="meeting-hub">
            <div className="meeting-hub-head">
              <div>
                <span>SALLES DE RÉUNION · R&D HORLOGERIE</span>
                <h3>Réunions et entraide en direct</h3>
                <p>Les salles projet sont créées automatiquement depuis le calendrier. Les salles d’entraide sont limitées aux échanges non confidentiels.</p>
              </div>
              <button onClick={() => setNewMeetingOpen(true)}>＋ Créer une salle d’entraide</button>
            </div>
            <div className="meeting-security">
              <i>🔒</i>
              <div>
                <b>Confidentialité par défaut</b>
                <span>Une salle projet est réservée aux personnes autorisées. Dans une salle d’entraide, le partage de plans, fichiers CAO, noms de clients et documents projet est désactivé.</span>
              </div>
            </div>
            <div className="meeting-section-title">
              <span>CRÉÉES AUTOMATIQUEMENT PAR LE CALENDRIER</span>
              <h3>Salles de vos projets</h3>
            </div>
            <div className="meeting-rooms">
              {meetingRooms
                .filter((room) => room.type === "Projet automatique")
                .map((room, index) => (
                  <button key={room.title} onClick={() => setSelectedMeeting(room)}>
                    <div className="meeting-live-icon">
                      <i></i>
                      <b>{index === 0 ? "BIENTÔT" : "PLANIFIÉE"}</b>
                    </div>
                    <span>{room.type}</span>
                    <h3>{room.title}</h3>
                    <time>{room.date}</time>
                    <p>{room.objective}</p>
                    <small>{room.participants.length} participants autorisés · Accès projet sécurisé</small>
                    <em>Voir la salle →</em>
                  </button>
                ))}
            </div>
            <div className="meeting-section-title help">
              <span>CRÉÉES PAR LES FREELANCES</span>
              <h3>Salles d’entraide</h3>
            </div>
            <div className="meeting-rooms help-rooms">
              {meetingRooms
                .filter((room) => room.type === "Entraide freelance")
                .map((room) => (
                  <button key={room.title} onClick={() => setSelectedMeeting(room)}>
                    <div className="meeting-live-icon community">
                      <i></i>
                      <b>ENTRAIDE</b>
                    </div>
                    <span>{room.type}</span>
                    <h3>{room.title}</h3>
                    <time>{room.date}</time>
                    <p>{room.objective}</p>
                    <small>{room.participants.length} participants · Aucun fichier projet autorisé</small>
                    <em>Voir la salle →</em>
                  </button>
                ))}
            </div>
          </section>
          {selectedMeeting && (
            <div className="project-overlay" onMouseDown={() => setSelectedMeeting(null)}>
              <section className="meeting-popup" onMouseDown={(e) => e.stopPropagation()}>
                <button className="project-close" onClick={() => setSelectedMeeting(null)}>
                  ×
                </button>
                <span>{selectedMeeting.type}</span>
                <h2>{selectedMeeting.title}</h2>
                <time>{selectedMeeting.date}</time>
                <div className={`meeting-access ${selectedMeeting.type === "Projet automatique" ? "project" : "community"}`}>
                  <i>{selectedMeeting.type === "Projet automatique" ? "🔒" : "◇"}</i>
                  <div>
                    <b>{selectedMeeting.type === "Projet automatique" ? "Salle projet sécurisée" : "Salle d’entraide limitée"}</b>
                    <p>{selectedMeeting.type === "Projet automatique" ? "Créée automatiquement depuis le calendrier. Seuls les membres autorisés du projet peuvent entrer et partager les documents associés." : "Échanges généraux uniquement. Le dépôt de documents, le partage d’écran de fichiers projet et les références client sont désactivés."}</p>
                  </div>
                </div>
                <article className="meeting-objective">
                  <small>OBJECTIF DE LA RÉUNION</small>
                  <p>{selectedMeeting.objective}</p>
                </article>
                <h3>Participants</h3>
                <div className="meeting-participants">
                  {selectedMeeting.participants.map((name) => (
                    <button key={name} onClick={() => setSelectedForumProfile(name)}>
                      <i>
                        {name
                          .split(" ")
                          .map((part) => part[0])
                          .join("")}
                      </i>
                      <span>{name}</span>
                    </button>
                  ))}
                </div>
                <button className="join-meeting">Rejoindre la salle</button>
              </section>
            </div>
          )}
          {newMeetingOpen && (
            <div className="project-overlay" onMouseDown={() => setNewMeetingOpen(false)}>
              <section className="meeting-popup create-meeting" onMouseDown={(e) => e.stopPropagation()}>
                <button className="project-close" onClick={() => setNewMeetingOpen(false)}>
                  ×
                </button>
                <span>SALLE D’ENTRAIDE FREELANCE</span>
                <h2>Créer une réunion d’entraide</h2>
                <label>
                  Sujet de la réunion
                  <input placeholder="Ex. Méthodes générales de tolérancement" />
                </label>
                <div className="meeting-form-grid">
                  <label>
                    Date
                    <input type="date" />
                  </label>
                  <label>
                    Heure
                    <input type="time" />
                  </label>
                  <label>
                    Durée
                    <select>
                      <option>30 minutes</option>
                      <option>45 minutes</option>
                      <option>1 heure</option>
                    </select>
                  </label>
                  <label>
                    Nombre de places
                    <select>
                      <option>4 freelances</option>
                      <option>6 freelances</option>
                      <option>8 freelances</option>
                    </select>
                  </label>
                </div>
                <label>
                  Objectif
                  <textarea placeholder="Décrivez le sujet général, sans citer de projet ni de client…" />
                </label>
                <div className="meeting-rules">
                  <b>Partages désactivés dans les salles d’entraide</b>
                  <span>Plans et fichiers CAO · Documents projet · Nom du client · Références confidentielles · Enregistrement de la réunion</span>
                </div>
                <label className="meeting-confirm">
                  <input type="checkbox" />
                  Je confirme que cette réunion ne contiendra aucune information confidentielle.
                </label>
                <button className="join-meeting" onClick={() => setNewMeetingOpen(false)}>
                  Créer la salle
                </button>
              </section>
            </div>
          )}
        </>
      )}
      {meetingBoard && selectedForumProfile && (
        <div className="profile-overlay" onMouseDown={() => setSelectedForumProfile(null)}>
          <section className="forum-profile-card" onMouseDown={(e) => e.stopPropagation()}>
            <button className="project-close" onClick={() => setSelectedForumProfile(null)}>
              ×
            </button>
            <div className="forum-profile-head">
              <i>
                {selectedForumProfile
                  .split(" ")
                  .map((name) => name[0])
                  .join("")}
              </i>
              <div>
                <span>PARTICIPANT · FICHE FREELANCE</span>
                <h2>{selectedForumProfile}</h2>
                <p>Professionnel R&D Horlogerie · Profil autorisé</p>
              </div>
            </div>
            <div className="forum-profile-stats">
              <article>
                <strong>4,8 / 5</strong>
                <span>Note moyenne</span>
              </article>
              <article>
                <strong>93 %</strong>
                <span>Délais respectés</span>
              </article>
              <article>
                <strong>14</strong>
                <span>Projets terminés</span>
              </article>
            </div>
            <button className="forum-profile-open">Ouvrir la fiche complète</button>
          </section>
        </div>
      )}
      {displayActive !== "Accueil" && !projectBoard && !statisticsBoard && !messagingBoard && !calendarBoard && !missionBoard && !documentTemplatesBoard && !standardsBoard && !sharedDocumentsBoard && !mandataireRequestBoard && !mandataireQuoteBoard && !mandataireApplicationsBoard && (
        <div className="simple-filters">
          {tags.slice(0, 6).map((t) => (
            <button key={t} className={filter === t ? "selected" : ""} onClick={() => setFilter(t)}>
              {t}
            </button>
          ))}
        </div>
      )}
      {statisticsBoard ? (
        <section className="freelance-statistics">
          <div className="freelance-stat-kpis">
            <article>
              <small>NOTE MOYENNE</small>
              <strong>
                4,7 <i>/ 5</i>
              </strong>
              <span>★★★★★</span>
            </article>
            <article>
              <small>PROJETS TERMINÉS</small>
              <strong>14</strong>
              <span>2 cette année</span>
            </article>
            <article>
              <small>CRÉDITS NETS GAGNÉS</small>
              <strong>
                +28{" "}
                <i className="credit-coin" aria-hidden="true">
                  E
                </i>
              </strong>
              <span>34 gagnés · 6 retirés</span>
            </article>
            <article>
              <small>RESPECT DES DÉLAIS</small>
              <strong>93 %</strong>
              <span>13 projets sur 14</span>
            </article>
          </div>
          <div className="freelance-stat-grid">
            <article className="performance-bars">
              <span>PERFORMANCE PAR CRITÈRE</span>
              <h3>Résultats moyens</h3>
              {[
                ["Qualité technique", 96],
                ["Respect des délais", 93],
                ["Communication", 88],
                ["Dossier final", 91],
              ].map(([label, value]) => (
                <div className="performance-row" key={String(label)}>
                  <div>
                    <b>{label}</b>
                    <em>{value}%</em>
                  </div>
                  <span>
                    <i style={{ width: `${value}%` }}></i>
                  </span>
                </div>
              ))}
            </article>
            <article className="credit-history">
              <span>ÉVOLUTION RÉCENTE</span>
              <h3>Crédits par projet</h3>
              {[
                ["Masse oscillante squelettée", "+8"],
                ["Petite seconde", "+6"],
                ["Nomenclature calibre", "+4"],
                ["Tourbillon — correction", "-2"],
              ].map(([label, value]) => (
                <div key={label}>
                  <b>{label}</b>
                  <strong className={String(value).startsWith("-") ? "negative" : ""}>
                    {value}{" "}
                    <i className="credit-coin" aria-hidden="true">
                      E
                    </i>
                  </strong>
                </div>
              ))}
            </article>
          </div>
        </section>
      ) : messagingBoard || calendarBoard || sharedDocumentsBoard || mandataireRequestBoard || mandataireQuoteBoard || mandataireApplicationsBoard ? null : (
        <div className={`simple-tiles ${projectBoard ? "project-tiles" : ""} ${missionBoard ? "mission-board-tiles" : ""}`}>
          {shown.map((item) => {
            const dynamicProject = projectsForTrade.find((project) => project.title === item.title);
            const itemClass = dynamicProject ? { level: `Classe ${dynamicProject.projectClass}`, credits: dynamicProject.credits, price: `CHF ${dynamicProject.price.toLocaleString("fr-CH")}` } : getProjectClassification(item.title);
            const mission = missionDetails[item.title] || (dynamicProject ? { rank: dynamicProject.projectClass as "D"|"C"|"B"|"A"|"S", price: `CHF ${dynamicProject.price.toLocaleString("fr-CH")}`, credits: dynamicProject.credits, duration: "À définir", description: "Mission créée après acceptation du devis par le mandataire." } : undefined);
            const locked = missionBoard && mission && (rankOrder[mission.rank] > rankOrder[freelanceRank] || mission.credits > freelanceCredits);
            return (
              <button className={locked ? "mission-locked" : ""} key={item.title} onClick={() => (projectBoard ? openProject(item) : missionBoard && setSelectedMission(item))}>
                {missionBoard && mission && (
                  <>
                    <span className="mission-card-class">{mission.rank}</span>
                    {locked && <span className="mission-lock">🔒</span>}
                  </>
                )}
                {projectBoard && <span className="project-tile-class">{itemClass.level.replace("Classe ", "")}</span>}
                <b>{item.title}</b>
                {item.meta && <small>{item.meta}</small>}
                {missionBoard && mission && (
                  <span className="mission-card-data">
                    <i>
                      <small>PRIX</small>
                      <strong>{mission.price}</strong>
                    </i>
                    <i>
                      <small>CRÉDITS REQUIS</small>
                      <strong>
                        {mission.credits}
                        <span className="credit-coin" aria-hidden="true">
                          E
                        </span>
                      </strong>
                    </i>
                    <i>
                      <small>DURÉE ESTIMÉE</small>
                      <strong>{mission.duration}</strong>
                    </i>
                  </span>
                )}
                {projectBoard && (
                  <span className="project-tile-rank">
                    <strong className="project-tile-price">{itemClass.price}</strong>
                    <i>
                      <span>{itemClass.credits}</span>
                      <span className="credit-coin" aria-hidden="true">
                        E
                      </span>
                    </i>
                  </span>
                )}
                <em>{locked ? (rankOrder[mission.rank] > rankOrder[freelanceRank] ? `Classe ${mission.rank} requise` : `${mission.credits} crédits requis`) : missionBoard ? "Mission accessible" : item.tag}</em>
              </button>
            );
          })}
        </div>
      )}
      {selectedMission &&
        selectedMissionDetails &&
        (() => {
          const locked = rankOrder[selectedMissionDetails.rank] > rankOrder[freelanceRank] || selectedMissionDetails.credits > freelanceCredits;
          const preview = getMissionPreviewDetails(selectedMissionDetails.rank);
          const reward = getMissionReward(selectedMissionDetails.rank);
          const applicationProject = availableMissions.find(project=>project.title===selectedMission.title);
          const missionApplications = applicationProject ? shared.applications.filter(application=>application.projectId===applicationProject.id&&application.tradeId===shared.currentUser.tradeId) : [];
          const alreadyApplied = missionApplications.some(application=>application.freelancerId===shared.currentUser.id);
          const applicationsFull = missionApplications.length >= 3;
          return (
            <div className="project-overlay" onMouseDown={() => setSelectedMission(null)}>
              <section className="mission-detail-popup mission-confidential-popup" onMouseDown={(e) => e.stopPropagation()}>
                <button className="project-close" onClick={() => setSelectedMission(null)} aria-label="Fermer la mission">
                  ×
                </button>
                <div className="mission-detail-header">
                  <div className="mission-detail-rank">{selectedMissionDetails.rank}</div>
                  <div>
                    <span className="mission-detail-label">APERÇU CONFIDENTIEL · {shared.currentUser.tradeName.toUpperCase()}</span>
                    <h2>{selectedMission.title}</h2>
                    <p>Le nom du mandataire, les références produit et les données techniques sensibles ne sont pas affichés avant attribution.</p>
                  </div>
                </div>
                <div className="mission-detail-data">
                  <article>
                    <small>PRIX</small>
                    <strong>{selectedMissionDetails.price}</strong>
                  </article>
                  <article>
                    <small>CRÉDITS REQUIS</small>
                    <strong>
                      {selectedMissionDetails.credits}
                      <i className="credit-coin" aria-hidden="true">
                        E
                      </i>
                    </strong>
                  </article>
                  <article>
                    <small>DURÉE ESTIMÉE</small>
                    <strong>{selectedMissionDetails.duration}</strong>
                  </article>
                </div>
                <div className="mission-preview-grid">
                  <article className="mission-preview-summary">
                    <span>RÉSUMÉ DE LA MISSION</span>
                    <h3>Ce qu’il faut comprendre</h3>
                    <p>{selectedMissionDetails.description}</p>
                  </article>
                  <article>
                    <span>PÉRIMÈTRE</span>
                    <h3>Travail demandé</h3>
                    <p>{preview.scope}</p>
                  </article>
                  <article>
                    <span>LIVRABLES</span>
                    <h3>Résultat attendu</h3>
                    <p>{preview.deliverables}</p>
                  </article>
                  <article>
                    <span>COMPÉTENCES</span>
                    <h3>Profil recherché</h3>
                    <p>{preview.skills}</p>
                  </article>
                  <article>
                    <span>ORGANISATION</span>
                    <h3>Outils et suivi</h3>
                    <p>{preview.software}</p>
                  </article>
                </div>
                <div className="mission-confidential-note">
                  <i>◈</i>
                  <div>
                    <b>Confidentialité protégée</b>
                    <span>Le cahier des charges, les plans, le client et les fichiers CAO seront accessibles uniquement après sélection du freelance et validation de l’accord de confidentialité.</span>
                  </div>
                </div>
                <section className="mission-reward-box">
                  <div className="mission-reward-title">
                    <div>
                      <span>RÉCOMPENSE APRÈS LA MISSION</span>
                      <h3>Évaluation et évolution des crédits</h3>
                      <p>Le mandataire évalue le travail terminé. L’admin métier contrôle l’évaluation avant d’ajouter ou retirer les crédits.</p>
                    </div>
                    <strong>
                      jusqu’à +{reward.max}
                      <small>crédits</small>
                    </strong>
                  </div>
                  <div className="evaluation-scale">
                    {[
                      ["5 ★", reward.max],
                      ["4 ★", Math.max(2, reward.max - 3)],
                      ["3 ★", 1],
                      ["2 ★", -2],
                      ["1 ★", reward.loss],
                    ].map(([note, credits]) => (
                      <span key={String(note)}>
                        <b>{note}</b>
                        <i className={Number(credits) >= 0 ? "gain" : "loss"}>
                          {Number(credits) > 0 ? "+" : ""}
                          {credits} crédits
                        </i>
                      </span>
                    ))}
                  </div>
                  <small className="mission-reward-criteria">Qualité technique 40 % · Délais 25 % · Communication 20 % · Dossier final 15 %</small>
                </section>
                {locked ? (
                  <div className="mission-access-denied">
                    <i>🔒</i>
                    <div>
                      <b>Mission verrouillée</b>
                      <span>{rankOrder[selectedMissionDetails.rank] > rankOrder[freelanceRank] ? `Cette mission demande la classe ${selectedMissionDetails.rank}. Votre classe actuelle est ${freelanceRank}.` : `Cette mission demande ${selectedMissionDetails.credits} crédits. Vous en possédez actuellement ${freelanceCredits}.`}</span>
                    </div>
                  </div>
                ) : (
                  <>{applicationProject ? <button className="mission-accept" disabled={alreadyApplied||applicationsFull} onClick={()=>shared.onApplyToMission(applicationProject.id,shared.currentUser.id)}>{alreadyApplied?"Candidature envoyée":applicationsFull?"3 candidatures déjà reçues":"Postuler"}</button> : <button className="mission-accept" disabled>Mission de démonstration</button>}</>
                )}
              </section>
            </div>
          );
        })()}
      {selectedProject && (
        <div className="project-overlay" onMouseDown={() => setSelectedProject(null)}>
          <section className="project-popup" onMouseDown={(e) => e.stopPropagation()}>
            <div className="project-popup-head">
              <div>
                <span>PROJET · {shared.currentUser.tradeName.toUpperCase()}</span>
                <h2>{selectedProject.title}</h2>
                <p>{selectedProject.meta}</p>
                <div className="project-rank-card">
                  <div className="project-class">
                    <small>CLASSE</small>
                    <strong>{classification.level.replace("Classe ", "")}</strong>
                  </div>
                  <div className="project-credits">
                    <small>CRÉDITS</small>
                    <span>
                      <strong>{classification.credits}</strong>
                      <i className="credit-coin" aria-hidden="true">
                        E
                      </i>
                    </span>
                  </div>
                </div>
              </div>
              <button className="project-close" onClick={() => setSelectedProject(null)} aria-label="Fermer la fiche projet">
                ×
              </button>
            </div>
            <nav className="project-tabs" aria-label="Informations du projet">
              {projectTabs.map((tab) => (
                <button key={tab} className={projectTab === tab ? "active" : ""} onClick={() => setProjectTab(tab)}>
                  {tab}
                </button>
              ))}
            </nav>
            <div className="project-popup-body">
              <div className="project-tab-title">
                <span>{projectTab}</span>
                <em>{selectedProject.tag}</em>
              </div>
              {projectTab === "Vue d’ensemble" || closedProject ? (
                <div className="project-info-grid">
                  {projectTabItems[projectTab].map((item) => (
                    <article key={item.title}>
                      <b>{item.title}</b>
                      <p>{item.meta}</p>
                      <em>{item.tag}</em>
                    </article>
                  ))}
                </div>
              ) : (
                <section className="project-document-space">
                  <div className="project-document-intro">
                    <div>
                      <small>ESPACE DOCUMENTAIRE</small>
                      <h3>{projectTab}</h3>
                      <p>{documentTabDescriptions[projectTab]}</p>
                    </div>
                    {documentTabOwners[projectTab] === role && (
                      <label className="project-upload-plus" title={`Uploader dans ${projectTab}`}>
                        <span>＋</span>
                        <b>Uploader</b>
                        <input
                          type="file"
                          multiple
                          accept=".doc,.docx,.xls,.xlsx,.pdf,.one,.onepkg,.step,.stp,.ipt,.iam,.dwg,.dxf,.zip"
                          onChange={(event) => {
                            addProjectDocuments(projectTab, event.target.files);
                            event.currentTarget.value = "";
                          }}
                        />
                      </label>
                    )}
                  </div>
                  {projectUploadStatus && <div className="project-upload-status" role="status">{projectUploadStatus}</div>}
                  {projectDocuments[projectDocumentKey]?.length ? (
                    <div className="project-document-list">
                      {projectDocuments[projectDocumentKey].map((file, index) => (
                        <article key={`${file.name}-${index}`}>
                          <i>▤</i>
                          <div>
                            <b>{file.name}</b>
                            <small>
                              {file.format} · {projectTab === "Suivi" ? "PV de séance" : "Document du projet"} · Déposé par {file.uploadedBy.toLowerCase()}
                            </small>
                          </div>
                          <a href={file.url} target="_blank" rel="noreferrer">Ouvrir</a>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <div className="project-document-empty">
                      <i>▤</i>
                      <b>Aucun document déposé</b>
                      <p>{documentTabOwners[projectTab] === role ? "Utilisez le bouton + pour ajouter le premier document." : `Les documents seront ajoutés par le ${documentTabOwners[projectTab].toLowerCase()}.`}</p>
                    </div>
                  )}
                </section>
              )}
              {projectTab === "Vue d’ensemble" && (
                <section className="project-timeline" aria-label="Chronologie du projet">
                  <div className="timeline-heading">
                    <div>
                      <span>CHRONOLOGIE DU PROJET</span>
                      <h3>Jalons et calendrier</h3>
                    </div>
                    <strong>{closedProject ? "Projet clôturé · calendrier terminé" : `${Math.round(timelineProgress)}% du temps écoulé`}</strong>
                  </div>
                  <div className="timeline-scale">
                    <div className="timeline-arrow">
                      <i style={{ width: `${timelineProgress}%` }}></i>
                    </div>
                    <div className={`timeline-today ${closedProject ? "closed" : ""}`} style={{ left: `${timelineProgress}%` }}>
                      <b>{closedProject ? "Clôturé" : "Aujourd’hui"}</b>
                      <span>{formatDate(closedProject ? timelineEnd : today)}</span>
                    </div>
                    {milestones.map((milestone, index) => (
                      <div className={`timeline-milestone ${timelineProgress >= milestone.position ? "passed" : ""}`} style={{ left: `${milestone.position}%` }} key={milestone.title}>
                        <i>{index + 1}</i>
                        <b>{milestone.title}</b>
                        <span>{formatDate(milestone.date)}</span>
                      </div>
                    ))}
                    <div className="timeline-bound start">
                      <b>Début</b>
                      <span>{formatDate(timelineStart)}</span>
                    </div>
                    <div className="timeline-bound end">
                      <b>Fin</b>
                      <span>{formatDate(timelineEnd)}</span>
                    </div>
                  </div>
                </section>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

const roleLabels: Record<string,PlatformRole> = { freelance:"Freelance",mandataire:"Mandataire",specialiste_metier:"Admin métier",admin_metier:"Admin métier",admin_eureka:"Admin Eurêka",pending:"En attente" };

export default function Home() {
  const [currentUser, setCurrentUser] = useState<PlatformUser | null>(null);
  const [accessStatus,setAccessStatus]=useState<"loading"|"anonymous"|"no-access"|"ready"|"error">("loading");
  const [localDevelopment,setLocalDevelopment]=useState(false);
  const [previewRole,setPreviewRole]=useState<"Admin Eurêka"|"Admin métier"|"Mandataire"|"Freelance"|null>(null);
  const [identity,setIdentity]=useState<{name:string;email:string}|undefined>();
  const [actionMessage,setActionMessage]=useState("");
  const [actionSuccess,setActionSuccess]=useState(false);
  const [notifications,setNotifications]=useState<{id:string;title:string;message:string;target_path?:string;read_at?:string}[]>([]);
  const [invoices,setInvoices]=useState<Invoice[]>([]);
  const [tradeSettings,setTradeSettings]=useState<TradeSetting[]>([]);
  const [milestones,setMilestones]=useState<ProjectMilestone[]>([]);
  const [active, setActive] = useState("Accueil");
  const [metier, setMetier] = useState("R&D Horlogerie");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [noticeOpen, setNoticeOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [accountPanel, setAccountPanel] = useState<"profil" | "parametres" | "securite" | null>(null);
  const [query, setQuery] = useState("");
  const [name, setName] = useState("R&D Horlogerie");
  const [accent, setAccent] = useState("#d69b3a");
  const [saved, setSaved] = useState(false);
  const [trades,setTrades]=useState<PlatformTrade[]>([]);
  const [users,setUsers]=useState<PlatformUser[]>([]);
  const [membershipRequests,setMembershipRequests]=useState<MembershipRequest[]>([]);
  const [adminInvitations,setAdminInvitations]=useState<AdminInvitation[]>([]);
  const [pendingInfo,setPendingInfo]=useState<{kind:"admin"|"membership";label:string}|undefined>();
  const [applications,setApplications]=useState<MissionApplication[]>([]);
  const [quotes, setQuotes] = useState<QuoteRequest[]>([]);
  const [acceptedProjects, setAcceptedProjects] = useState<AcceptedProject[]>([]);
  const [freelancer, setFreelancer] = useState<FreelancerState>({ name: "", projectClass: "D", credits: 0, note: 0 });
  const [freelanceFolders, setFreelanceFolders] = useState<SharedFolder[]>([]);
  const [mandataireFolders, setMandataireFolders] = useState<SharedFolder[]>([]);
  useEffect(() => {
    const isLocalHost = ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
    setLocalDevelopment(isLocalHost);
    if (!isLocalHost) return;
    const storedRole = localStorage.getItem("eureka-local-preview-role");
    if (storedRole === "Admin Eurêka" || storedRole === "Admin métier" || storedRole === "Mandataire" || storedRole === "Freelance") {
      setPreviewRole(storedRole);
    }
  }, []);
  const canUseLocalEditor = localDevelopment && currentUser?.role === "Admin Eurêka";
  const role = canUseLocalEditor ? previewRole || currentUser.role : currentUser?.role || "Freelance";
  const productionSiteUrl = process.env.NEXT_PUBLIC_PRODUCTION_SITE_URL || "https://magical-cascaron-8716ed.netlify.app";
  const currentNav = navByRole[role];
  useEffect(() => {
    const raw = localStorage.getItem("eureka-metier-settings");
    if (raw) {
      const v = JSON.parse(raw);
      setName(v.name || "R&D Horlogerie");
      setMetier(v.name || "R&D Horlogerie");
      setAccent(v.accent || "#d69b3a");
    }
  }, []);
  const loadSession=useCallback(async()=>{
    setActionMessage("");
    try{
      const response=await fetch("/api/v1/session",{cache:"no-store"});
      if(response.status===401){setCurrentUser(null);setPendingInfo(undefined);setAccessStatus("anonymous");return}
      const data=await response.json();if(!response.ok)throw new Error(data.error||"Session indisponible");
      setIdentity({name:data.currentUser.name,email:data.currentUser.email});
      const mappedUsers:PlatformUser[]=(data.users||[]).map((user:any)=>({id:user.id,membershipId:user.membership_id||undefined,email:user.email,eurekaEmail:user.eureka_email||undefined,name:user.display_name,role:roleLabels[user.role]||"Freelance",tradeId:user.trade_id,tradeName:user.trade_name,status:user.status,projectClass:user.project_class||undefined,credits:user.credits??undefined,reservedCredits:user.reserved_credits??undefined,note:user.rating??undefined}));
      const mappedTrades:PlatformTrade[]=(data.trades||[]).map((trade:any)=>({id:trade.id,name:trade.name,adminName:mappedUsers.find(user=>user.tradeId===trade.id&&user.role==="Admin métier")?.name||"Admin Métier à inviter",adhesionDocument:{id:`adh-${trade.id}`,name:`Document d’adhésion — ${trade.name}`,description:"Document fourni par l’Admin Métier",fileName:"Document_adhesion.docx",url:"#"}}));
      setUsers(mappedUsers);setTrades(mappedTrades);setNotifications(data.notifications||[]);setInvoices((data.invoices||[]).map((invoice:any)=>({id:invoice.id,reference:invoice.reference,projectTitle:invoice.project_title,amount:Number(invoice.amount_cents)/100,status:invoice.status,issueDate:invoice.issue_date,dueDate:invoice.due_date})));setTradeSettings((data.tradeSettings||[]).map((setting:any)=>{let parsed={value:setting.value_json};try{parsed=JSON.parse(setting.value_json)}catch{}return{id:setting.id,key:setting.setting_key,value:parsed.value||setting.value_json,status:setting.status}}));setMilestones((data.milestones||[]).map((milestone:any)=>({id:milestone.id,projectId:milestone.project_id,title:milestone.title,dueAt:milestone.due_at,status:milestone.status})));
      const currentMembership=data.memberships?.[0];
      const mappedCurrent:PlatformUser|undefined=data.currentUser.globalAdmin?{id:data.currentUser.id,email:data.currentUser.email,eurekaEmail:data.currentUser.eurekaEmail,name:data.currentUser.name,role:"Admin Eurêka",tradeId:"all-trades",tradeName:"Tous les métiers"}:currentMembership?{id:data.currentUser.id,membershipId:currentMembership.id,email:data.currentUser.email,eurekaEmail:data.currentUser.eurekaEmail,name:data.currentUser.name,role:roleLabels[currentMembership.role]||"Freelance",tradeId:currentMembership.trade_id,tradeName:mappedTrades.find(trade=>trade.id===currentMembership.trade_id)?.name||"Métier",projectClass:currentMembership.project_class||undefined,credits:currentMembership.credits,note:currentMembership.rating}:undefined;
      setAdminInvitations((data.adminInvitations||[]).map((invitation:any)=>({id:invitation.id,name:invitation.display_name,email:invitation.email||undefined,role:invitation.role==="admin_eureka"?"Admin Eurêka":"Admin métier",tradeId:invitation.trade_id||undefined,tradeName:invitation.role==="admin_eureka"?"Tous les métiers":invitation.trade_name||"Métier obligatoire",status:invitation.status,accountUserId:invitation.account_user_id||undefined})));
      if(!mappedCurrent){const ownRequest=data.membershipRequests?.[0];const adminPending=data.pendingAdminInvitation;setPendingInfo(adminPending?{kind:"admin",label:adminPending.role==="admin_eureka"?"Admin global":"Admin métier · "+(adminPending.trade_name||"")}:ownRequest?{kind:"membership",label:`${roleLabels[ownRequest.requested_role]} · ${ownRequest.trade_name}`} : undefined);setCurrentUser(null);setAccessStatus("no-access");return}
      setPendingInfo(undefined);
      setCurrentUser(mappedCurrent);setFreelancer({name:mappedCurrent.name,projectClass:mappedCurrent.projectClass||"D",credits:mappedCurrent.credits||0,note:mappedCurrent.note||0});
      const workflowDocs=data.workflowDocuments||[];const docFor=(field:string,value:string|undefined)=>workflowDocs.find((doc:any)=>doc[field]===value);
      const mappedQuotes:QuoteRequest[]=(data.quoteRequests||[]).map((request:any)=>{const versions=(data.quotes||[]).filter((quote:any)=>quote.quote_request_id===request.id).sort((a:any,b:any)=>b.version-a.version);const quote=versions[0];const requestDoc=docFor("quote_request_id",request.id);const quoteDoc=quote?docFor("quote_id",quote.id):undefined;return{id:quote?.id||request.id,internalNumber:request.id,mandataireNumber:request.personal_number,projectName:request.project_name,requestFile:{id:requestDoc?.id||"",name:"Demande de devis",description:"Document transmis par le mandataire",fileName:requestDoc?.original_name||"Document non joint",url:requestDoc?.download_url||"#"},status:quote?.status==="accepted"?"accepted":quote?.status==="sent"?"sent":"pending",projectClass:quote?.project_class,credits:quote?.required_credits,price:quote?Number(quote.amount_cents)/100:undefined,eurekaQuoteNumber:quote?.eureka_number,eurekaProjectName:quote?.project_name,eurekaFile:quoteDoc?{id:quoteDoc.id,name:"Devis Eurêka",description:"Document transmis par l’Admin Métier",fileName:quoteDoc.original_name,url:quoteDoc.download_url}:undefined,tradeId:request.trade_id,mandataireId:mappedUsers.find(user=>user.membershipId===request.mandataire_membership_id)?.id||""}});
      setQuotes(mappedQuotes);
      const projectRows=data.projects||[];const mappedProjects:AcceptedProject[]=[...(data.missions||[]).filter((mission:any)=>mission.status==="published").map((mission:any)=>({id:mission.id,title:mission.title,projectClass:mission.required_class,credits:mission.required_credits,price:Number(mission.amount_cents)/100,status:"À attribuer",tradeId:mission.trade_id,mandataireId:mappedUsers.find(user=>user.membershipId===mission.mandataire_membership_id)?.id||""})),...projectRows.map((project:any)=>({id:project.id,title:project.title,projectClass:project.project_class,credits:project.reserved_credits,price:Number(project.amount_cents)/100,status:project.status==="closed"?"Clôturé":project.status==="validation_requested"?"En validation":project.status==="correction_requested"?"Corrections demandées":"En cours",tradeId:project.trade_id,mandataireId:mappedUsers.find(user=>user.membershipId===project.mandataire_membership_id)?.id||"",freelancerId:mappedUsers.find(user=>user.membershipId===project.freelancer_membership_id)?.id}))];
      setAcceptedProjects(mappedProjects);setApplications((data.applications||[]).filter((application:any)=>application.status==="submitted").map((application:any)=>({id:application.id,projectId:application.mission_id,freelancerId:application.user_id,tradeId:application.trade_id})));
      setMembershipRequests((data.membershipRequests||[]).map((request:any)=>{const document=docFor("membership_request_id",request.id);return{id:request.id,name:request.display_name,requestedRole:roleLabels[request.requested_role] as "Freelance"|"Mandataire",tradeId:request.trade_id,tradeName:request.trade_name,document:{id:document?.id||"",name:"Document d’adhésion",description:"Pièce transmise",fileName:document?.original_name||"Document non joint",url:document?.download_url||"#"}}}));
      const mapFolders=(audience:"freelance"|"mandataire"):(SharedFolder[])=>(data.shareFolders||[]).filter((folder:any)=>folder.audience===audience).map((folder:any)=>({id:folder.id,name:folder.name,documents:(data.shareDocuments||[]).filter((doc:any)=>doc.share_folder_id===folder.id).map((doc:any)=>({id:doc.id,name:doc.original_name.replace(/\.[^.]+$/,"")||doc.original_name,description:"Document publié par l’Admin Métier",fileName:doc.original_name,url:doc.download_url}))}));
      setFreelanceFolders(mapFolders("freelance"));setMandataireFolders(mapFolders("mandataire"));setAccessStatus("ready");
    }catch(error){setCurrentUser(null);setAccessStatus("error");setActionMessage(error instanceof Error?error.message:"Impossible de charger la plateforme.")}
  },[]);
  useEffect(()=>{void loadSession()},[loadSession]);
  const runAction=async(path:string,options:RequestInit,successMessage?:string)=>{setActionMessage("");setActionSuccess(false);if(localDevelopment){setActionMessage("Aucune modification enregistrée : l’application locale est en lecture seule pour protéger les données en ligne.");return null}const response=await fetch(path,options);const result=await response.json().catch(()=>({error:"Réponse invalide"}));if(!response.ok){setActionMessage(result.error||"Action impossible.");return null}await loadSession();if(successMessage){setActionSuccess(true);setActionMessage(successMessage)}return result};
  const logout=async()=>{await fetch("/api/v1/auth/logout",{method:"POST"});setCurrentUser(null);setAccessStatus("anonymous");setAccountOpen(false);setAccountPanel(null)};
  const visible = useMemo(() => projects.filter((p) => `${p.id} ${p.title} ${p.client}`.toLowerCase().includes(query.toLowerCase())), [query]);
  const saveSettings = () => {
    localStorage.setItem("eureka-metier-settings", JSON.stringify({ name, accent }));
    setMetier(name);
    setSaved(true);
    setTimeout(() => {
      setSaved(false);
      setSettingsOpen(false);
    }, 650);
  };
  const createQuote: MvpSharedProps["onCreateQuote"] = (quote) => {
    if (!currentUser || currentUser.role !== "Mandataire") return;
    const form=new FormData();form.set("tradeId",currentUser.tradeId);form.set("personalNumber",quote.mandataireNumber);form.set("projectName",quote.projectName);if(quote.requestFile.sourceFile)form.set("file",quote.requestFile.sourceFile);void runAction("/api/v1/quote-requests",{method:"POST",body:form});
  };
  const transmitQuote: MvpSharedProps["onTransmitQuote"] = (id, values) => {const selected=quotes.find(quote=>quote.id===id);if(!selected)return;const form=new FormData();form.set("requestId",selected.internalNumber);form.set("projectClass",String(values.projectClass||"D"));form.set("requiredCredits",String(values.credits||0));form.set("amountCents",String(Math.round(Number(values.price||0)*100)));form.set("eurekaNumber",String(values.eurekaQuoteNumber||""));form.set("projectName",String(values.eurekaProjectName||""));if(values.eurekaFile?.sourceFile)form.set("file",values.eurekaFile.sourceFile);void runAction("/api/v1/quotes",{method:"POST",body:form})};
  const acceptQuote: MvpSharedProps["onAcceptQuote"] = (id) => {
    const quote = quotes.find((item) => item.id === id);
    if (!quote?.eurekaProjectName || !quote.projectClass || quote.credits === undefined || quote.price === undefined) return;
    void runAction(`/api/v1/quotes/${id}/accept`,{method:"PATCH",headers:{"content-type":"application/json"},body:"{}"});
  };
  const quoteDecision:MvpSharedProps["onQuoteDecision"]=(id,decision,message)=>{void runAction(`/api/v1/quotes/${id}/${decision}`,{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({message})})};
  const createFolder: MvpSharedProps["onCreateFolder"] = (audience, folderName) => {
    if(!currentUser)return;void runAction("/api/v1/share-folders",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({tradeId:currentUser.tradeId,audience,name:folderName})});
  };
  const addSharedFile: MvpSharedProps["onAddSharedFile"] = (audience, folderId, file) => {
    if(!currentUser||!file.sourceFile)return;const form=new FormData();form.set("tradeId",currentUser.tradeId);form.set("shareFolderId",folderId);form.set("area",audience==="freelance"?"partage_freelance":"partage_mandataire");form.set("visibility",audience==="freelance"?"trade_freelance":"trade_mandataire");form.set("file",file.sourceFile);void runAction("/api/v1/documents",{method:"POST",body:form});
  };
  const updateFreelancer = (next:FreelancerState) => {const target=users.find(user=>user.name===next.name&&user.role==="Freelance");if(!target?.membershipId)return;void runAction(`/api/v1/members/${target.membershipId}`,{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({projectClass:next.projectClass,credits:next.credits,rating:next.note})})};
  const createTrade:MvpSharedProps["onCreateTrade"] = (tradeName) => {void runAction("/api/v1/trades",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({name:tradeName})})};
  const inviteAdmin:MvpSharedProps["onInviteAdmin"]=(values)=>{void (async()=>{const result=await runAction("/api/v1/admin-invitations",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(values)});if(result?.invitationCode)window.alert(`Code d’invitation : ${result.invitationCode}\nTransmettez-le au responsable avec son adresse e-mail.`)})()};
  const decideAdminInvitation:MvpSharedProps["onDecideAdminInvitation"]=(id,decision,userId)=>{void runAction(`/api/v1/admin-invitations/${id}/decision`,{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({decision,userId})})};
  const deleteAdminInvitation:MvpSharedProps["onDeleteAdminInvitation"]=(id)=>{void runAction(`/api/v1/admin-invitations/${id}`,{method:"DELETE"},"Invitation supprimée avec succès.")};
  const assignAdmin:MvpSharedProps["onAssignAdmin"]=(userId,tradeId)=>{void runAction(`/api/v1/users/${userId}/admin-trade`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({tradeId})},"Admin métier nommé avec succès.")};
  const createMember:MvpSharedProps["onCreateMember"]=(values)=>{void (async()=>{const result=await runAction("/api/v1/member-accounts",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(values)},"Compte créé avec succès.");if(result?.eurekaEmail)window.alert(`Identifiant Eurêka créé : ${result.eurekaEmail}\nConservez-le avec le mot de passe initial.`)})()};
  const updateUserStatus:MvpSharedProps["onUserStatus"]=(userId,status)=>{void runAction(`/api/v1/users/${userId}/status`,{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({status})})};
  const deleteUser:MvpSharedProps["onDeleteUser"]=(userId)=>{void runAction(`/api/v1/users/${userId}`,{method:"DELETE"},"Utilisateur supprimé avec succès.")};
  const deleteTrade:MvpSharedProps["onDeleteTrade"]=(tradeId)=>{void runAction(`/api/v1/trades/${tradeId}`,{method:"DELETE"},"Métier supprimé avec succès.")};
  const applyToMission = (projectId:string,freelancerId:string) => {
    const project = acceptedProjects.find(item=>item.id===projectId);
    const applicant = users.find(user=>user.id===freelancerId&&user.role==="Freelance");
    if (!project || !applicant || project.tradeId!==applicant.tradeId || !["À attribuer","Publié"].includes(project.status) || project.freelancerId) return;
    void runAction(`/api/v1/missions/${projectId}/applications`,{method:"POST",headers:{"content-type":"application/json"},body:"{}"});
  };
  const selectFreelancer = (projectId:string,freelancerId:string) => {
    const project = acceptedProjects.find(item=>item.id===projectId);
    const applicant = applications.find(item=>item.projectId===projectId&&item.freelancerId===freelancerId);
    const freelancerUser = users.find(user=>user.id===freelancerId&&user.role==="Freelance");
    if (!project || !applicant || !freelancerUser || project.tradeId!==freelancerUser.tradeId || project.mandataireId!==currentUser?.id) return;
    void runAction(`/api/v1/missions/${projectId}/assign`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({applicationId:applicant.id})});
  };
  const projectAction:MvpSharedProps["onProjectAction"]=(projectId,action,values)=>{void runAction(`/api/v1/projects/${projectId}/${action}`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(values||{})})};
  const createMembershipRequest: MvpSharedProps["onCreateMembershipRequest"] = request => {void runAction("/api/v1/membership-requests",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({tradeId:request.tradeId,role:request.requestedRole.toLowerCase()})})};
  const confirmMembership = (id:string) => {void runAction(`/api/v1/membership-requests/${id}/decision`,{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({decision:"accepted"})})};
  const decideMembership = (id:string,decision:"accepted"|"rejected"|"needs_information") => {void runAction(`/api/v1/membership-requests/${id}/decision`,{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({decision})})};
  const updateInvoice=(id:string,status:string)=>{void runAction(`/api/v1/invoices/${id}`,{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({status})})};
  const saveTradeSetting=(key:string,value:string,submit:boolean)=>{if(!currentUser)return;void runAction("/api/v1/trade-settings",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({tradeId:currentUser.tradeId,key,value,submit})})};
  const validateTradeSetting=(id:string)=>{void runAction(`/api/v1/trade-settings/${id}/validate`,{method:"PATCH",headers:{"content-type":"application/json"},body:"{}"})};
  const addMilestone=(projectId:string,title:string,dueAt?:string)=>{void runAction(`/api/v1/projects/${projectId}/milestones`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({title,dueAt})})};
  const milestoneStatus=(id:string,status:string)=>{void runAction(`/api/v1/milestones/${id}`,{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({status})})};
  if (!currentUser) return <ProductionAccessScreen status={accessStatus==="ready"?"error":accessStatus} identity={identity} trades={trades} pendingInfo={pendingInfo} error={actionMessage} onRefresh={()=>void loadSession()}/>;
  const viewedUser = canUseLocalEditor && previewRole ? { ...currentUser, role: previewRole } : currentUser;
  const shared: MvpSharedProps = { quotes, onCreateQuote: createQuote, onTransmitQuote: transmitQuote, onAcceptQuote: acceptQuote, onQuoteDecision:quoteDecision, acceptedProjects, freelancer, onUpdateFreelancer: updateFreelancer, freelanceFolders, mandataireFolders, onCreateFolder: createFolder, onAddSharedFile: addSharedFile, currentUser: viewedUser, trades, users, applications, membershipRequests, adminInvitations, invoices, onInvoiceStatus:updateInvoice, tradeSettings, onSaveTradeSetting:saveTradeSetting, onValidateTradeSetting:validateTradeSetting, milestones, onAddMilestone:addMilestone, onMilestoneStatus:milestoneStatus, onCreateTrade:createTrade, onInviteAdmin:inviteAdmin, onDecideAdminInvitation:decideAdminInvitation, onDeleteAdminInvitation:deleteAdminInvitation, onAssignAdmin:assignAdmin, onCreateMember:createMember, onUserStatus:updateUserStatus, onDeleteUser:deleteUser, onDeleteTrade:deleteTrade, onApplyToMission:applyToMission, onSelectFreelancer:selectFreelancer, onProjectAction:projectAction, onCreateMembershipRequest:createMembershipRequest, onConfirmMembership:confirmMembership, onDecideMembership:decideMembership };
  return (
    <main className="app-shell" style={{ "--accent": accent } as React.CSSProperties}>
      {canUseLocalEditor && (
        <section className="local-editor-bar" aria-label="Mode édition local">
          <div className="local-editor-status">
            <strong>MODE ÉDITION · VERSION LOCALE</strong>
            <span>Aperçu visuel uniquement · session Admin Eurêka · actions désactivées</span>
          </div>
          <label>
            Espace à prévisualiser
            <select
              value={previewRole || currentUser.role}
              onChange={(event) => {
                const nextRole = event.target.value as "Admin Eurêka" | "Admin métier" | "Mandataire" | "Freelance";
                setPreviewRole(nextRole);
                localStorage.setItem("eureka-local-preview-role", nextRole);
                setActive("Accueil");
              }}
            >
              <option>Admin Eurêka</option>
              <option>Admin métier</option>
              <option>Mandataire</option>
              <option>Freelance</option>
            </select>
          </label>
          <button type="button" onClick={() => window.location.assign(productionSiteUrl)}>
            Ouvrir le site normal dans cet onglet
          </button>
        </section>
      )}
      {!localDevelopment && currentUser.role === "Admin Eurêka" && (
        <a className="local-editor-entry" href="http://localhost:8888/">
          Revenir au mode édition local
        </a>
      )}
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">E</div>
          <div>
            <strong>EURÊKA</strong>
            <span>GROUP</span>
          </div>
        </div>
        <div className="workspace-label">SESSION SÉCURISÉE</div>
        <button className="metier-select" onClick={() => role === "Admin métier" && setActive("Paramètres métier")}>
          <span className="watch-icon">◷</span>
          <span>
            <small>{role === "Admin Eurêka" ? "Périmètre global" : role === "Admin métier" ? "Métier administré" : "Métier attribué"}</small>
            <b>{currentUser.tradeName}</b>
          </span>
          <i>{role === "Admin métier" ? "›" : "🔒"}</i>
        </button>
        <nav>
          {currentNav.map(([label, icon]) => (
            <button key={label} className={active === label ? "active" : ""} onClick={() => setActive(label)}>
              <span>{icon}</span>
              {label}
              {label === "Projets" && <em>{role === "Mandataire" ? 4 : 18}</em>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom"><LegalLinks/></div>
      </aside>
      <section className="content">
        <div className="content-account-slot">
          <button className="account-trigger" onClick={() => setAccountOpen((open) => !open)} aria-expanded={accountOpen}>
            <i>{currentUser.name.split(" ").map(part=>part[0]).join("").slice(0,2)}</i>
            <span><b>{currentUser.name}</b><small>Mon compte</small></span>
            <em>⌄</em>
          </button>
          {accountOpen && (
            <section className="account-menu visible-account-menu">
              <div className="account-menu-head">
                <i>{currentUser.name.split(" ").map(part=>part[0]).join("").slice(0,2)}</i>
                <span><b>{currentUser.name}</b><small>{role} · {currentUser.tradeName}</small></span>
                <button onClick={() => setAccountOpen(false)}>×</button>
              </div>
              <button onClick={() => { setAccountPanel("profil"); setAccountOpen(false); }}><span>◎</span><b>{role === "Mandataire" ? "Profil de l’entreprise" : "Mon profil"}</b><i>›</i></button>
              <button onClick={() => { setAccountPanel("parametres"); setAccountOpen(false); }}><span>⚙</span><b>Paramètres du compte</b><i>›</i></button>
              <button onClick={() => { setAccountPanel("securite"); setAccountOpen(false); }}><span>⌾</span><b>Sécurité et connexion</b><i>›</i></button>
              <button className="account-logout" onClick={()=>void logout()}><span>↪</span><b>Déconnexion</b></button>
            </section>
          )}
        </div>
        <header>
          <div className="header-account-area">
            <button className="account-trigger" onClick={() => setAccountOpen((open) => !open)} aria-expanded={accountOpen}>
              <i>{currentUser.name.split(" ").map(part=>part[0]).join("").slice(0,2)}</i>
              <span>
                <b>{currentUser.name}</b>
                <small>{role}</small>
              </span>
              <em>⌄</em>
            </button>
            {accountOpen && (
              <section className="account-menu">
                <div className="account-menu-head">
                  <i>{currentUser.name.split(" ").map(part=>part[0]).join("").slice(0,2)}</i>
                  <span><b>{currentUser.name}</b><small>{role} · {currentUser.tradeName}</small></span>
                  <button onClick={() => setAccountOpen(false)}>×</button>
                </div>
                <button onClick={() => { setAccountPanel("profil"); setAccountOpen(false); }}><span>◎</span><b>{role === "Mandataire" ? "Profil de l’entreprise" : "Mon profil"}</b><i>›</i></button>
                <button onClick={() => { setAccountPanel("parametres"); setAccountOpen(false); }}><span>⚙</span><b>Paramètres du compte</b><i>›</i></button>
                <button onClick={() => { setAccountPanel("securite"); setAccountOpen(false); }}><span>⌾</span><b>Sécurité et connexion</b><i>›</i></button>
                <button className="account-logout" onClick={()=>void logout()}><span>↪</span><b>Déconnexion</b></button>
              </section>
            )}
            <div className="header-page-title">
            <div className="eyebrow">EURÊKA GROUP · {role.toUpperCase()}</div>
            <h1>{active}</h1>
            </div>
          </div>
          <div className="header-actions">
            {role !== "Freelance" && (
              <label className="search">
                <span>⌕</span>
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher…" />
              </label>
            )}
            {role !== "Freelance" && (
              <button className="round" onClick={() => setNoticeOpen(!noticeOpen)} aria-label="Notifications">
                ♢{notifications.some(item=>!item.read_at)&&<b>{notifications.filter(item=>!item.read_at).length}</b>}
              </button>
            )}
            <button className="primary" onClick={() => setActive(role === "Freelance" ? "Tableau de missions" : role === "Mandataire" ? "Demandes de devis" : role === "Admin Eurêka" ? "Métiers" : "Projets")}>
              {role === "Freelance" ? "Voir les missions" : role === "Mandataire" ? "＋ Nouvelle demande" : role === "Admin Eurêka" ? "Voir les métiers" : "Voir les projets"}
            </button>
          </div>
          {role !== "Freelance" && noticeOpen && (
            <div className="notifications">
              <b>Notifications</b>
              {notifications.length?notifications.slice(0,8).map(item=><button key={item.id} onClick={()=>{if(!item.read_at)void runAction(`/api/v1/notifications/${item.id}`,{method:"PATCH"});setNoticeOpen(false)}}><b>{item.title}</b><span>{item.message}</span></button>):<p>Aucune notification.</p>}
            </div>
          )}
        </header>
        {actionMessage&&<div className="role-note"><b>{actionSuccess?"Action effectuée":"Action non enregistrée"}</b><span>{actionMessage}</span><button onClick={()=>setActionMessage("")}>×</button></div>}
        {accountPanel && (
          <div className="account-modal-backdrop" onMouseDown={() => setAccountPanel(null)}>
            <section className="account-modal" onMouseDown={(event) => event.stopPropagation()}>
              <button className="account-modal-close" onClick={() => setAccountPanel(null)}>×</button>
              <span>COMPTE EURÊKA GROUP</span>
              <h2>{accountPanel === "profil" ? (role === "Mandataire" ? "Profil de l’entreprise" : "Mon profil") : accountPanel === "parametres" ? "Paramètres du compte" : "Sécurité et connexion"}</h2>
              {accountPanel === "profil" && <div className="account-fields"><label>Nom<input value={currentUser.name} readOnly /></label><label>Rôle<input value={role} readOnly /></label><label>Adresse e-mail<input value={currentUser.email||""} readOnly /></label><label>Métier<input value={currentUser.tradeName} readOnly /></label><button onClick={()=>{const next=window.prompt("Nouveau nom :",currentUser.name)?.trim();if(next)void runAction("/api/v1/account/profile",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({name:next})})}}>Modifier mon nom</button><small>Ces informations sont enregistrées dans votre compte Eurêka.</small></div>}
              {accountPanel === "parametres" && <div className="account-options"><button onClick={()=>void runAction("/api/v1/account-requests",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({kind:"data_export"})})}><span><b>Demander un export de mes données</b><small>La demande sera traitée et tracée par l’administration.</small></span><i>›</i></button><button onClick={()=>{if(window.confirm("Transmettre une demande de désactivation du compte ?"))void runAction("/api/v1/account-requests",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({kind:"account_deactivation"})})}}><span><b>Demander la désactivation du compte</b><small>Les données à conserver légalement ne sont pas supprimées immédiatement.</small></span><i>›</i></button></div>}
              {accountPanel === "securite" && <div className="account-options"><button onClick={()=>{const current=window.prompt("Mot de passe actuel :")||"";const next=window.prompt("Nouveau mot de passe (10 caractères minimum, dont un chiffre) :")||"";if(current&&next)void runAction("/api/v1/account/password",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({currentPassword:current,newPassword:next})})}}><span><b>Modifier mon mot de passe</b><small>Les autres sessions seront déconnectées.</small></span><i>›</i></button><button onClick={()=>void logout()}><span><b>Déconnecter cette session</b><small>Retourner à la connexion Eurêka.</small></span><i>›</i></button></div>}
              <footer><button className="primary" onClick={() => setAccountPanel(null)}>Fermer</button></footer>
            </section>
          </div>
        )}
        {role === "Admin Eurêka" ? <AdminEurekaPortal active={active} onNavigate={setActive} shared={shared}/> : role === "Admin métier" ? <SectionPage active={active} onNavigate={setActive} shared={shared} /> : <UserPortal role={role} active={active} onNavigate={setActive} shared={shared} />}
        {false &&
          (active === "Accueil" ? (
            <>
              <div className="role-note">
                <b>Tu es dans l’espace ADMIN MÉTIER.</b>
                <span>Cet espace gère uniquement les projets et les règles de {metier}. L’admin général Eureka Group reste séparé et ne gère aucun projet.</span>
              </div>
              <div className="metier-banner">
                <div className="movement">
                  <span></span>
                  <span></span>
                  <span></span>
                  <b>R&D</b>
                </div>
                <div>
                  <span className="pill">ESPACE MÉTIER ACTIF</span>
                  <h2>{metier}</h2>
                  <p>Projets, documents, normes et standards propres à l’horlogerie.</p>
                </div>
                <div className="banner-kpi">
                  <span>Responsable métier</span>
                  <b>Claire Dubois</b>
                </div>
                <div className="banner-kpi">
                  <span>Modèle</span>
                  <b>Standard Eureka v1</b>
                </div>
                <button onClick={() => setSettingsOpen(true)}>Paramétrer</button>
              </div>
              <div className="metrics">
                <article>
                  <span className="metric-icon gold">◇</span>
                  <div>
                    <small>Projets en cours</small>
                    <b>18</b>
                    <em>3 à attribuer</em>
                  </div>
                  <i className="spark one"></i>
                </article>
                <article>
                  <span className="metric-icon blue">⌁</span>
                  <div>
                    <small>Standards métier</small>
                    <b>12</b>
                    <em>2 à réviser</em>
                  </div>
                  <i className="spark two"></i>
                </article>
                <article>
                  <span className="metric-icon green">▤</span>
                  <div>
                    <small>Documents techniques</small>
                    <b>86</b>
                    <em>6 nouveaux</em>
                  </div>
                  <i className="spark three"></i>
                </article>
                <article>
                  <span className="metric-icon violet">✓</span>
                  <div>
                    <small>Projets à valider</small>
                    <b>7</b>
                    <em>4 prioritaires</em>
                  </div>
                  <i className="spark four"></i>
                </article>
              </div>
              <div className="dashboard-grid">
                <section className="panel projects-panel">
                  <div className="panel-title">
                    <div>
                      <h3>Projets récents</h3>
                      <p>Suivi opérationnel du métier</p>
                    </div>
                    <button onClick={() => setActive("Projets")}>Voir tous les projets →</button>
                  </div>
                  <div className="table-head">
                    <span>PROJET</span>
                    <span>STATUT</span>
                    <span>AVANCEMENT</span>
                    <span>ÉCHÉANCE</span>
                    <span></span>
                  </div>
                  {visible.map((p) => (
                    <div className="project-row" key={p.id}>
                      <div className="project-name">
                        <i>{p.id.slice(-2)}</i>
                        <span>
                          <b>{p.title}</b>
                          <small>
                            {p.id} · {p.client} · {p.level}
                          </small>
                        </span>
                      </div>
                      <span className={`status ${p.status.toLowerCase().replace(" ", "-").replace("à", "a")}`}>{p.status}</span>
                      <div className="progress">
                        <span>
                          <i style={{ width: `${p.progress}%` }}></i>
                        </span>
                        <b>{p.progress}%</b>
                      </div>
                      <time>{p.due}</time>
                      <button className="dots">•••</button>
                    </div>
                  ))}
                </section>
                <section className="panel activity-panel">
                  <div className="panel-title">
                    <div>
                      <h3>Activité du métier</h3>
                      <p>Actions liées aux projets horlogers</p>
                    </div>
                    <button>•••</button>
                  </div>
                  {[
                    ["CD", "Claire a validé une étape", "EUR-019 · Tourbillon", "Il y a 12 min"],
                    ["ML", "Marc a déposé 3 documents", "EUR-024 · Calibre automatique", "Il y a 48 min"],
                    ["SA", "Sophie a accepté la mission", "EUR-027 · Phase de lune", "Il y a 2 h"],
                    ["RD", "Standard de mise en plan mis à jour", "R&D Horlogerie", "Hier, 16:24"],
                  ].map((a, i) => (
                    <div className="activity" key={a[1]}>
                      <div className={`avatar a${i}`}>{a[0]}</div>
                      <span>
                        <b>{a[1]}</b>
                        <small>
                          {a[2]} · {a[3]}
                        </small>
                      </span>
                    </div>
                  ))}
                  <button className="activity-link">Afficher toute l’activité</button>
                </section>
              </div>
              <section className="bottom-grid">
                <div className="panel pipeline">
                  <div className="panel-title">
                    <div>
                      <h3>Répartition des projets</h3>
                      <p>Pipeline du métier par statut</p>
                    </div>
                    <select>
                      <option>30 derniers jours</option>
                    </select>
                  </div>
                  <div className="bars">
                    <i style={{ width: "25%" }}></i>
                    <i style={{ width: "19%" }}></i>
                    <i style={{ width: "32%" }}></i>
                    <i style={{ width: "14%" }}></i>
                    <i style={{ width: "10%" }}></i>
                  </div>
                  <div className="legend">
                    <span>
                      <i></i>Devis <b>6</b>
                    </span>
                    <span>
                      <i></i>À attribuer <b>4</b>
                    </span>
                    <span>
                      <i></i>En cours <b>8</b>
                    </span>
                    <span>
                      <i></i>Validation <b>3</b>
                    </span>
                    <span>
                      <i></i>Terminés <b>2</b>
                    </span>
                  </div>
                </div>
                <div className="panel quick">
                  <div className="panel-title">
                    <div>
                      <h3>Actions métier</h3>
                      <p>Paramétrer l’espace horlogerie</p>
                    </div>
                  </div>
                  <div>
                    <button>
                      ✓
                      <span>
                        <b>Valider un projet</b>
                        <small>7 en attente</small>
                      </span>
                    </button>
                    <button>
                      ＋
                      <span>
                        <b>Ajouter une norme</b>
                        <small>Référentiel métier</small>
                      </span>
                    </button>
                    <button>
                      ▤
                      <span>
                        <b>Créer un standard</b>
                        <small>Construction ou plans</small>
                      </span>
                    </button>
                  </div>
                </div>
              </section>
            </>
          ) : (
            <SectionPage active={active} shared={shared} onNavigate={setActive} />
          ))}
      </section>
      {settingsOpen && (
        <div className="modal-backdrop" onMouseDown={() => setSettingsOpen(false)}>
          <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <div>
                <span>MODÈLE ADMIN MÉTIER UNIQUEMENT</span>
                <h2>Paramétrer {metier}</h2>
                <p>Ce réglage ne concerne ni les freelances, ni les mandataires, ni l’admin général.</p>
              </div>
              <button onClick={() => setSettingsOpen(false)}>×</button>
            </div>
            <label>
              Nom du métier
              <input value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label>
              Couleur d’accent
              <div className="colors">
                {["#d69b3a", "#4d8ef7", "#39a577", "#a46ad4", "#d96657"].map((c) => (
                  <button key={c} onClick={() => setAccent(c)} className={accent === c ? "selected" : ""} style={{ background: c }}></button>
                ))}
              </div>
            </label>
            <label>
              Modèle métier à paramétrer
              <select
                value={metier}
                onChange={(e) => {
                  setMetier(e.target.value);
                  setName(e.target.value);
                }}
              >
                {métiers.map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </select>
            </label>
            <div className="modules">
              <span>Modules de l’admin métier</span>
              {["Projets et devis", "Partage freelance", "Messagerie", "Calendrier", "Statistiques métier"].map((m) => (
                <label key={m}>
                  <input type="checkbox" defaultChecked />
                  <i></i>
                  {m}
                </label>
              ))}
            </div>
            <div className="modal-actions">
              <button onClick={() => setSettingsOpen(false)}>Annuler</button>
              <button className="primary" onClick={saveSettings}>
                {saved ? "✓ Enregistré" : "Enregistrer la configuration"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
