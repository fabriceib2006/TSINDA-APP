import { db } from './firebase';
import { collection, getDocs, addDoc, doc, setDoc } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from './firestoreUtils';

export async function seedInitialData() {
  try {
    // Check if plans exist
    const plansSnap = await getDocs(collection(db, 'plans')).catch(() => null);
    if (!plansSnap || plansSnap.empty) {
      await addDoc(collection(db, 'plans'), {
        name: {
          rw: "Pro Ukwezi Kose",
          en: "30-Day Pro Pass",
          fr: "Pass Pro 30 Jours"
        },
        description: {
          rw: "Amategeko y'umuhanda yose, amashusho na simulations z'ibizamini bitagira umupaka.",
          en: "Full Rwanda Gazette rules, lesson videos, and unlimited mock exam simulations.",
          fr: "Règles du code de la route, vidéos de cours et examens blancs illimités."
        },
        price: 2000,
        durationDays: 30,
        access: {
          lessonVideos: true,
          trafficRules: true,
          exams: true
        },
        examLimit: null, // Unlimited
        isActive: true,
        isRecommended: true,
        sortOrder: 1,
        createdAt: new Date().toISOString()
      });

      await addDoc(collection(db, 'plans'), {
        name: {
          rw: "Ibyumweru 2 Standard",
          en: "14-Day Standard Pass",
          fr: "Pass Standard 14 Jours"
        },
        description: {
          rw: "Amategeko y'umuhanda n'ibizamini 15 byo kwitoza.",
          en: "Rwanda Gazette traffic rules and 15 complete mock exam attempts.",
          fr: "Règles du code de la route et 15 examens blancs complets."
        },
        price: 1500,
        durationDays: 14,
        access: {
          lessonVideos: false,
          trafficRules: true,
          exams: true
        },
        examLimit: 15,
        isActive: true,
        isRecommended: false,
        sortOrder: 2,
        createdAt: new Date().toISOString()
      });

      await addDoc(collection(db, 'plans'), {
        name: {
          rw: "Amategeko n'Amashusho",
          en: "7-Day Video Theory Pass",
          fr: "Pass Théorie & Vidéos 7 Jours"
        },
        description: {
          rw: "Amategeko yose y'umuhanda n'amashusho yose asobanura.",
          en: "Access all traffic rules and interactive video explanations (no exams).",
          fr: "Accès à toutes les règles du code et vidéos explicatives (sans examens)."
        },
        price: 1000,
        durationDays: 7,
        access: {
          lessonVideos: true,
          trafficRules: true,
          exams: false
        },
        examLimit: null,
        isActive: true,
        isRecommended: false,
        sortOrder: 3,
        createdAt: new Date().toISOString()
      });
    }

    // Check if examSettings exist
    const settingsSnap = await getDocs(collection(db, 'examSettings')).catch(() => null);
    if (!settingsSnap || settingsSnap.empty) {
      await setDoc(doc(db, 'examSettings', 'global-settings'), {
        numQuestions: 20,
        durationMinutes: 20,
        passMark: 12
      });
    }

    // Check if lessons exist
    const lessonsSnap = await getDocs(collection(db, 'lessons')).catch(() => null);
    if (!lessonsSnap || lessonsSnap.empty) {
      const sampleLessons = [
        {
          title: { en: "1. General Speed Limits in Rwanda", rw: "1. Umuvuduko wemewe mu Rwanda", fr: "1. Limites de vitesse générales" },
          body: { 
            en: "In built-up areas (cities and towns), the maximum speed limit is 50 km/h unless otherwise indicated. On rural roads, it is 80 km/h, and on expressways/highways up to 100 km/h.", 
            rw: "Mu duce tw'imidugugu n'imijyi, umuvuduko ntarengwa ni 50 km/h. Ku mihanda yo mu cyaro ni 80 km/h, naho ku mihanda migari ni 100 km/h.",
            fr: "Dans les agglomérations, la vitesse maximale est de 50 km/h. Sur les routes rurales 80 km/h."
          },
          category: "Speed Limits",
          order: 1,
          isPublished: true
        },
        {
          title: { en: "2. Priority at Intersections and Roundabouts", rw: "2. Uburenganzira bw'inzira ku tuyira", fr: "2. Priorité aux carrefours" },
          body: { 
            en: "Drivers entering a roundabout must yield to traffic already circulating inside the roundabout, unless road signs dictate otherwise.", 
            rw: "Abayobora ibinyabiziga binjira ku mzunguko (roundabout) bagomba kureka ibiri imbere mu mzunguko bikabanza gutambuka.",
            fr: "Les conducteurs s'engageant sur un rond-point doivent céder le passage à la circulation."
          },
          category: "Priority & Right of Way",
          order: 2,
          isPublished: true
        },
        {
          title: { en: "3. Overtaking Rules (Gucira)", rw: "3. Amategeko yo Gucira (Overtaking)", fr: "3. Règles de dépassement" },
          body: { 
            en: "Overtaking must always be done on the left side. Before overtaking, ensure the road ahead is clear and check your mirrors and blind spots.", 
            rw: "Gucira bigomba gukorerwa ibumoso buri gihe. Mbere yo gucira, reba neza ko umuhanda uri imbere nta kindi kinyabiziga kirimo.",
            fr: "Le dépassement doit toujours s'effectuer par la gauche."
          },
          category: "Overtaking",
          order: 3,
          isPublished: true
        },
        {
          title: { en: "4. Parking and Stopping Regulations", rw: "4. Amategeko yo Guhagarara no Kurangara", fr: "4. Stationnement et arrêt" },
          body: { 
            en: "Parking is strictly prohibited near pedestrian crossings, intersections, bridges, and on hills where visibility is restricted.", 
            rw: "Guhagarara bibujijwe hafi y'ibyambukiriro by'abanyamaguru, mu masangano y'inzira, ku biraro no ku misozi aho kureba bigoranye.",
            fr: "Le stationnement est strictement interdit près des passages pour piétons et intersections."
          },
          category: "Parking",
          order: 4,
          isPublished: true
        },
        {
          title: { en: "5. Seatbelts and Helmets Compliance", rw: "5. Kwambara Umukand-Umutekano n'Ingofero", fr: "5. Ceinture de sécurité et casque" },
          body: { 
            en: "All vehicle occupants must wear seatbelts while the vehicle is in motion. Motorcycle riders and passengers must wear certified safety helmets.", 
            rw: "Abari mu modoka bose bagomba kwambara umukand-umutekano. Abamotari n'abagenzi babo bagomba kwambara ingofero z'abagenzi zemewe.",
            fr: "Tous les occupants d'un véhicule doivent porter la ceinture de sécurité."
          },
          category: "Safety Equipment",
          order: 5,
          isPublished: true
        },
        {
          title: { en: "6. Blood Alcohol Limit for Drivers", rw: "6. Ikigero cy'Alukole mu maraso", fr: "6. Taux d'alcoolémie" },
          body: { 
            en: "Driving under the influence of alcohol is strictly illegal in Rwanda. The legal blood alcohol limit is 0.00g/l (zero tolerance for commercial and general drivers).", 
            rw: "Gutwara wanyoye inzoga birehejwe mu buryo bukomeye mu Rwanda. Ikigero cyemewe ni 0.00g/l.",
            fr: "Conduire sous l'influence de l'alcool est strictement interdit. La limite est de 0,00g/l."
          },
          category: "Driver Conduct",
          order: 6,
          isPublished: true
        },
        {
          title: { en: "7. Vehicle Technical Inspection (Contrôle Technique)", rw: "7. Kugenzura ubuziranenge bw'Ibinyabiziga", fr: "7. Contrôle technique" },
          body: { 
            en: "All motor vehicles must undergo periodic technical inspection at designated centers to ensure brakes, lights, and steering systems are roadworthy.", 
            rw: "Ibinyabiziga byose bigomba kujyanwa mu bugenzuzi bw'ubuziranenge mu bigo byemewe.",
            fr: "Tous les véhicules à moteur doivent passer un contrôle technique périodique."
          },
          category: "Vehicle Inspection",
          order: 7,
          isPublished: true
        }
      ];

      for (const lesson of sampleLessons) {
        await addDoc(collection(db, 'lessons'), lesson);
      }
    }

    // Check if questions exist
    const questionsSnap = await getDocs(collection(db, 'questions')).catch(() => null);
    if (!questionsSnap || questionsSnap.empty) {
      const sampleQuestions = [
        {
          text: { en: "What is the maximum speed limit in urban areas (cities and towns) in Rwanda?", rw: "Umuvuduko ntarengwa mu mijyi yo mu Rwanda ni uwuhe?", fr: "Quelle est la vitesse maximale en agglomération au Rwanda?" },
          options: {
            en: ["50 km/h", "60 km/h", "80 km/h", "100 km/h"],
            rw: [],
            fr: []
          },
          correctIndex: 0,
          explanation: {
            en: "According to Article 42 of Rwanda Traffic Law, urban areas have a general speed limit of 50 km/h.",
            rw: "",
            fr: ""
          },
          category: "Speed Limits",
          isPublished: true
        },
        {
          text: { en: "When approaching a roundabout, who has the right of way?", rw: "Mbere yo kwinjira ku mzunguko, ni nde ufite uburenganzira bwo gutambuka?", fr: "À l'approche d'un rond-point, qui a la priorité?" },
          options: {
            en: [
              "Vehicles entering the roundabout",
              "Vehicles already circulating inside the roundabout",
              "Large buses only",
              "Vehicles coming from the right"
            ],
            rw: [],
            fr: []
          },
          correctIndex: 1,
          explanation: {
            en: "Traffic already circulating inside the roundabout always has priority unless traffic police or signals direct otherwise.",
            rw: "",
            fr: ""
          },
          category: "Priority & Right of Way",
          isPublished: true
        },
        {
          text: { en: "On which side should you overtake another vehicle in Rwanda?", rw: "Gucira ikindi kinyabiziga bikorerwa ku ruhe ruhande?", fr: "De quel côté devez-vous dépasser un autre véhicule?" },
          options: {
            en: ["On the right side", "On the left side", "On either side", "Only on the shoulder"],
            rw: [],
            fr: []
          },
          correctIndex: 1,
          explanation: {
            en: "Overtaking must strictly be executed on the left side of the vehicle being passed.",
            rw: "",
            fr: ""
          },
          category: "Overtaking",
          isPublished: true
        },
        {
          text: { en: "What is the legal blood alcohol limit for drivers in Rwanda?", rw: "Ikigero cy'alukole cyemewe ku batwara ibinyabiziga mu Rwanda ni iki?", fr: "Quel est le taux d'alcoolémie légal pour les conducteurs?" },
          options: {
            en: ["0.5g/l", "0.8g/l", "0.00g/l (Zero tolerance)", "0.2g/l"],
            rw: [],
            fr: []
          },
          correctIndex: 2,
          explanation: {
            en: "Rwanda maintains a strict zero tolerance policy (0.00g/l) for alcohol in drivers.",
            rw: "",
            fr: ""
          },
          category: "Driver Conduct",
          isPublished: true
        },
        {
          text: { en: "Are front and rear seatbelts mandatory for all vehicle occupants?", rw: "Ese kwambara umukand-umutekano ni ngombwa ku bari mu modoka bose?", fr: "La ceinture de sécurité est-elle obligatoire pour tous les occupants?" },
          options: {
            en: ["Only for the driver", "Only for front passengers", "Mandatory for all occupants", "Optional"],
            rw: [],
            fr: []
          },
          correctIndex: 2,
          explanation: {
            en: "All occupants in both front and rear seats must wear seatbelts while the vehicle is in motion.",
            rw: "",
            fr: ""
          },
          category: "Safety Equipment",
          isPublished: true
        },
        {
          text: { en: "What does a triangular traffic sign with a red border indicate?", rw: "Ikimenyetso cy'umuhanda gifite ifasi y'mpande eshatu n'umutuku kivuga iki?", fr: "Que signifie un panneau de signalisation triangulaire à bord rouge?" },
          options: {
            en: ["Mandatory direction", "Danger / Warning sign", "Information sign", "Prohibition sign"],
            rw: [],
            fr: []
          },
          correctIndex: 1,
          explanation: {
            en: "Triangular signs with a red border warn drivers of upcoming road dangers or hazards.",
            rw: "",
            fr: ""
          },
          category: "Traffic Signs",
          isPublished: true
        },
        {
          text: { en: "Can you park your vehicle on a pedestrian crossing or within 5 meters of it?", rw: "Ese ushobora guhagarara ku cyambukiriro cy'abanyamaguru cyangwa hafi yacyo?", fr: "Pouvez-vous stationner sur un passage pour piétons?" },
          options: {
            en: ["Yes, for 5 minutes", "Yes, if hazard lights are on", "No, it is strictly prohibited", "Only at night"],
            rw: [],
            fr: []
          },
          correctIndex: 2,
          explanation: {
            en: "Parking or stopping on or immediately near pedestrian crossings obstructs visibility and is strictly prohibited.",
            rw: "",
            fr: ""
          },
          category: "Parking",
          isPublished: true
        },
        {
          text: { en: "What is the speed limit on rural roads in Rwanda unless posted otherwise?", rw: "Umuvuduko ku mihanda yo mu cyaro mu Rwanda ni uwuhe?", fr: "Quelle est la vitesse sur les routes rurales au Rwanda?" },
          options: {
            en: ["50 km/h", "80 km/h", "100 km/h", "120 km/h"],
            rw: [],
            fr: []
          },
          correctIndex: 1,
          explanation: {
            en: "Rural roads have a standard speed limit of 80 km/h.",
            rw: "",
            fr: ""
          },
          category: "Speed Limits",
          isPublished: true
        },
        {
          text: { en: "What should a driver do when approaching a yellow traffic light?", rw: "Umuyobozi w'ikinyabiziga agomba gukora iki abonye amatara y'umuhondo?", fr: "Que doit faire un conducteur à l'approche d'un feu jaune?" },
          options: {
            en: ["Accelerate quickly", "Stop if it can be done safely", "Ignore it", "Honk horn"],
            rw: [],
            fr: []
          },
          correctIndex: 1,
          explanation: {
            en: "A yellow light means stop unless you are too close to stop safely before the intersection.",
            rw: "",
            fr: ""
          },
          category: "Traffic Signals",
          isPublished: true
        },
        {
          text: { en: "Who must wear a certified helmet while riding a motorcycle?", rw: "Ni nde ugomba kwambara ingofero (helmet) yemejwe igihe atwaye ipikipiki?", fr: "Qui doit porter un casque homologué à moto?" },
          options: {
            en: ["Only the driver", "Only the passenger", "Both driver and passenger", "Not required"],
            rw: [],
            fr: []
          },
          correctIndex: 2,
          explanation: {
            en: "Both the motorcycle operator and passenger must wear certified safety helmets at all times.",
            rw: "",
            fr: ""
          },
          category: "Safety Equipment",
          isPublished: true
        },
        {
          text: { en: "What documents must a driver always carry while operating a motor vehicle in Rwanda?", rw: "Ni ayahe nyandiko umuyobozi w'ikinyabiziga agomba kugira igihe cyose?", fr: "Quels documents un conducteur doit-il toujours avoir sur lui?" },
          options: {
            en: ["Driving license, vehicle registration, and insurance", "Only passport", "Only ID card", "None"],
            rw: [],
            fr: []
          },
          correctIndex: 0,
          explanation: {
            en: "Drivers must carry their valid driving license, vehicle registration card, and proof of valid motor insurance.",
            rw: "",
            fr: ""
          },
          category: "Legal Requirements",
          isPublished: true
        },
        {
          text: { en: "What does a solid continuous white line in the middle of the road mean?", rw: "Umurongo wera udacagase mu hagati y'umuhanda usobanura iki?", fr: "Que signifie une ligne blanche continue au milieu de la route?" },
          options: {
            en: ["Overtaking allowed", "Crossing or overtaking is strictly prohibited", "Parking zone", "Bus lane"],
            rw: [],
            fr: []
          },
          correctIndex: 1,
          explanation: {
            en: "A solid white line indicates that crossing or overtaking is strictly forbidden.",
            rw: "",
            fr: ""
          },
          category: "Road Markings",
          isPublished: true
        }
      ];

      for (const q of sampleQuestions) {
        await addDoc(collection(db, 'questions'), q);
      }
    }
  } catch (err) {
    console.error("Error seeding initial data:", err);
  }
}
