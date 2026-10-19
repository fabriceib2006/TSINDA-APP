import { Language } from '../types';

export const learnerDashboardT: Record<string, Record<Language, string>> = {
  learnerDashboardDesc: {
    en: "Rwanda National Gazette driving theory exam preparation.",
    rw: "Imyiteguro y'ikizamini cy'amategeko y'umuhanda hashingiwe ku Igazeti ya Leta.",
    fr: "Préparation à l'examen du code de la route basée sur le Journal Officiel du Rwanda."
  },
  passActive: {
    en: "Pass Active",
    rw: "Pass Ikora",
    fr: "Pass Actif"
  },
  validTo: {
    en: "Valid to",
    rw: "Kugeza",
    fr: "Valable jusqu'au"
  },
  examsUsed: {
    en: "Exams used",
    rw: "Ibizamini byakoreshejwe",
    fr: "Examens utilisés"
  },
  of: {
    en: "of",
    rw: "kuri",
    fr: "sur"
  },
  unlimited: {
    en: "Unlimited",
    rw: "Ntarengwa",
    fr: "Illimité"
  },
  upgradeToPro: {
    en: "Upgrade to Pro Plan",
    rw: "Kizamura kuri gahunda ya Pro",
    fr: "Passer au plan Pro"
  },
  locked: {
    en: "Locked",
    rw: "Gufunze",
    fr: "Verrouillé"
  },
  trafficLessons: {
    en: "Traffic Lessons",
    rw: "Inyigisho z'umuhanda",
    fr: "Leçons de circulation"
  },
  trafficLessonsDesc: {
    en: "Official Rwanda Gazette traffic rules & video lessons.",
    rw: "Amategeko y'umuhanda y'Igazeti ya Leta n'inyigisho za videwo.",
    fr: "Règles officielles de circulation du Journal Officiel et leçons vidéo."
  },
  practiceQuiz: {
    en: "Practice Quiz",
    rw: "Ikizamini cyo kwitoza",
    fr: "Quiz d'entraînement"
  },
  practiceQuizDesc: {
    en: "Category quizzes with instant feedback & explanations.",
    rw: "Ibizamini by'ibyiciro hamwe n'ibisubizo byihuse n'ibisobanuro.",
    fr: "Quiz par catégorie avec rétroaction instantanée et explications."
  },
  nationalMockExam: {
    en: "National Mock Exam",
    rw: "Ikizamini cyo kwitoza cy'Igihugu",
    fr: "Examen Blanc National"
  },
  mockExamDesc: {
    en: "Timed 20-question exam simulation with pass/fail scoring.",
    rw: "Ikizamini cy'ibibazo 20 gifite igihe ntarengwa hamwe no gutsinda/gutsindwa.",
    fr: "Simulation d'examen de 20 questions chronométré avec score de réussite/échec."
  },
  resultsHistory: {
    en: "Results History",
    rw: "Amateka y'ibisubizo",
    fr: "Historique des résultats"
  },
  resultsHistoryDesc: {
    en: "Review past mock exam scores and track your performance.",
    rw: "Reba amanota y'ibizamini byo kwitoza byashize kandi ukurikirane imyigire yawe.",
    fr: "Consultez les scores des examens blancs passés et suivez vos progrès."
  },
  left: {
    en: "left",
    rw: "bisigaye",
    fr: "restants"
  }
};

export const homepageT: Record<string, Record<Language, string>> = {
  pricing: { en: "Pricing", rw: "Ibiguzi", fr: "Tarification" },
  recommended: { en: "Recommended", rw: "Byiza cyane", fr: "Recommandé" },
  daysSingular: { en: "{n} day", rw: "Umunsi {n}", fr: "{n} jour" },
  daysPlural: { en: "{n} days", rw: "Iminsi {n}", fr: "{n} jours" },
  videoLessons: { en: "Video Lessons", rw: "Inyigisho za Videwo", fr: "Leçons Vidéo" },
  trafficRules: { en: "Traffic Rules", rw: "Amategeko y'Umuhanda", fr: "Code de la Route" },
  exams: { en: "Exams", rw: "Ibizamini", fr: "Examens" },
  examCountSingular: { en: "{n} exam", rw: "Ikizamini {n}", fr: "{n} examen" },
  examCountPlural: { en: "{n} exams", rw: "Ibizamini {n}", fr: "{n} examens" },
  unlimitedExams: { en: "Unlimited Exams", rw: "Ibizamini Ntarengwa", fr: "Examens Illimités" },
  choosePlan: { en: "Choose Plan", rw: "Hitamo Gahunda", fr: "Choisir le Plan" },
  oldPrice: { en: "Old price", rw: "Igiciro cya kera", fr: "Ancien prix" },
  discount: { en: "Discount", rw: "Igabanuka", fr: "Réduction" },
  endsIn: { en: "Ends in", rw: "Birarangira mu", fr: "Se termine dans" },
  features: { en: "Features", rw: "Ibyiza", fr: "Fonctionnalités" },
  howItWorks: { en: "How It Works", rw: "Uko Bikora", fr: "Comment ça marche" },
  faq: { en: "FAQ", rw: "Ibibazo", fr: "FAQ" },
  quickLinks: { en: "Quick Links", rw: "Ibyerekezo Byihuse", fr: "Liens Rapides" },
  contact: { en: "Contact", rw: "Twandikire", fr: "Contact" },
  socialMedia: { en: "Social Media", rw: "Imbuga Nkoranyambaga", fr: "Réseaux Sociaux" },
  studentRegistration: { en: "Student Registration", rw: "Kwiyandikisha k'Umunyeshuri", fr: "Inscription Élève" },
  adminLogin: { en: "Admin Login", rw: "Kwinjira nk'Umuyobozi", fr: "Connexion Admin" },
  phone: { en: "Phone", rw: "Telefoni", fr: "Téléphone" },
  email: { en: "Email", rw: "Imeri", fr: "E-mail" },
  address: { en: "Address", rw: "Aderesi", fr: "Adresse" },
  rightsReserved: {
    en: "All rights reserved. Rwanda National Gazette compliant.",
    rw: "Uburenganzira bwose burabitswe. Byubahirije amategeko y'Igazeti ya Leta.",
    fr: "Tous droits réservés. Conforme au Journal Officiel du Rwanda."
  }
};

export const t = {
  en: {
    appName: "TSINDA",
    subtitle: "Rwanda Driving Theory Prep",
    tagline: "Master Rwanda National Gazette traffic rules with confidence.",
    loginWithGoogle: "Sign in with Google",
    demoQuickLogin: "Quick Demo Login",
    selectRoleTitle: "Select Your Account Role",
    selectRoleDesc: "Choose how you will use TSINDA platform.",
    roleLearner: "Learner (Driver Student)",
    roleSchool: "Driving School",
    roleAdmin: "Administrator",
    fullName: "Full Name",
    phoneNumber: "Phone Number (e.g. +250 78...)",
    continue: "Continue",
    logout: "Log Out",
    dashboard: "Dashboard",
    users: "Users",
    plans: "Plans",
    payments: "Payments",
    content: "Content",
    exams: "Exams",
    adminPanel: "Admin Control Center",
    welcomeBack: "Welcome back",
    learnerPortal: "Learner Exam Prep Portal",
    schoolPortal: "Driving School Management Portal",
    settings: "Settings",
    language: "Language",
    certifiedBadge: "Rwanda National Gazette Certified",
    questionsLabel: "Published Questions",
    lessonsLabel: "Gazette Lessons",
    videosLabel: "Video Explanations",
    getStarted: "Start Learning Now",
    signIn: "Student Sign In",
    provisionalExam: "Provisional Exam",
    questionLabel: "Question 5 of 20",
    sampleQuestion: "When approaching a roundabout where traffic is already circulating, you must:",
    optionA: "Stop completely before entering.",
    optionB: "Give way to vehicles coming from the left.",
    optionC: "Sound your horn and proceed.",
    optionD: "Accelerate to merge quickly.",
  },
  rw: {
    appName: "TSINDA",
    subtitle: "Imyiteguro y'Ikizamini cy'Ubugenzuzi bw'Umuhanda",
    tagline: "Wige amategeko y'umuhanda mu Rwanda hashingiwe ku Igazeti ya Leta.",
    loginWithGoogle: "Injira na Google",
    demoQuickLogin: "Kwinjira vuba (Demo)",
    selectRoleTitle: "Hitamo Urwego rwawe",
    selectRoleDesc: "Hitamo uburyo uzakoresha urubuga rwa TSINDA.",
    roleLearner: "Umunyeshuri (Wiga Gutwara)",
    roleSchool: "Ishuri ry'Ubugenzuzi (Driving School)",
    roleAdmin: "Umuyobozi Mukuru (Admin)",
    fullName: "Amazina Yose",
    phoneNumber: "Nimero ya Telefoni (urug. +250 78...)",
    continue: "Komeza",
    logout: "Sohoka",
    dashboard: "Incamake",
    users: "Abakoresha",
    plans: "Gahunda",
    payments: "Kwishyuza",
    content: "Inyigisho",
    exams: "Ibizamini",
    adminPanel: "Ikigo cy'Ubuyobozi",
    welcomeBack: "Murakaza neza",
    learnerPortal: "Urubuga rw'Abanyeshuri",
    schoolPortal: "Urubuga rw'Amashuri y'Ubugenzuzi",
    settings: "Igenamiterere",
    language: "Ururimi",
    certifiedBadge: "Yemewe n'Igazeti ya Leta y'u Rwanda",
    questionsLabel: "Ibibazo Byatanzwe",
    lessonsLabel: "Inyigisho z'Igazeti",
    videosLabel: "Ibiganiro Byerekana",
    getStarted: "Tangira Kwiga",
    signIn: "Injira nk'Umunyeshuri",
    provisionalExam: "Ikizamini cy'agateganyo",
    questionLabel: "Ikibazo 5 kuri 20",
    sampleQuestion: "Igihe ugeze ku muhuriro w'umuhanda (roundabout) aho ibinyabiziga biri gukata, ugomba:",
    optionA: "Guhagarara burundu mbere yo kwinjira.",
    optionB: "Kureka ibinyabiziga biturutse ibumoso bikabanza.",
    optionC: "Gukanda ihembe hanyuma ugakomeza.",
    optionD: "Kwihuta kugira ngo winjire vuba.",
  },
  fr: {
    appName: "TSINDA",
    subtitle: "Préparation au Code de la Route au Rwanda",
    tagline: "Maîtrisez le code de la route rwandais basé sur le Journal Officiel.",
    loginWithGoogle: "Se connecter avec Google",
    demoQuickLogin: "Connexion Rapide Démo",
    selectRoleTitle: "Sélectionnez votre rôle",
    selectRoleDesc: "Choisissez comment vous utiliserez la plateforme TSINDA.",
    roleLearner: "Apprenant (Élève Conducteur)",
    roleSchool: "Auto-École",
    roleAdmin: "Administrateur",
    fullName: "Nom complet",
    phoneNumber: "Numéro de téléphone (ex. +250 78...)",
    continue: "Continuer",
    logout: "Se déconnecter",
    dashboard: "Tableau de bord",
    users: "Utilisateurs",
    plans: "Forfaits",
    payments: "Paiements",
    content: "Contenu",
    exams: "Examens",
    adminPanel: "Centre de Contrôle Admin",
    welcomeBack: "Bienvenue",
    learnerPortal: "Portail d'Apprentissage",
    schoolPortal: "Portail Auto-École",
    settings: "Paramètres",
    language: "Langue",
    certifiedBadge: "Certifié par le Journal Officiel du Rwanda",
    questionsLabel: "Questions Publiées",
    lessonsLabel: "Leçons du Journal",
    videosLabel: "Explications Vidéo",
    getStarted: "Commencer l'apprentissage",
    signIn: "Connexion Élève",
    provisionalExam: "Examen Provisoire",
    questionLabel: "Question 5 sur 20",
    sampleQuestion: "En approchant d'un rond-point où le trafic circule déjà, vous devez :",
    optionA: "Vous arrêter complètement avant d'entrer.",
    optionB: "Céder le passage aux véhicules venant de gauche.",
    optionC: "Klaxonner et procéder.",
    optionD: "Accélérer pour fusionner rapidement.",
  },
};
