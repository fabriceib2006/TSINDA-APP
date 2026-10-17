import { db } from './firebase';
import { doc, getDoc, setDoc, collection, getDocs, addDoc } from 'firebase/firestore';

export async function seedSystemSettingsIfNeeded() {
  try {
    // Check if siteSettings config exists
    const settingsRef = doc(db, 'siteSettings', 'config');
    const settingsSnap = await getDoc(settingsRef);

    if (!settingsSnap.exists()) {
      await setDoc(settingsRef, {
        appName: 'TSINDA',
        tagline: {
          rw: 'Witegure Ikizamini cy\'uruhushya rwo gutwara ibinyabiziga mu Rwanda',
          en: 'Master your Rwandan driving theory and exam prep with confidence',
          fr: 'Maîtrisez votre code de la route et préparation à l\'examen au Rwanda'
        },
        logoUrl: '',
        faviconUrl: '',
        primaryColor: '#2563eb',
        contact: {
          phone: '+250780000000',
          whatsapp: '+250780000000',
          email: 'info@tsinda.app',
          address: 'Kigali, Rwanda'
        },
        seo: {
          title: 'TSINDA - Rwanda Driving Theory & License Exam Prep',
          description: 'Official Rwandan driving permit theory test preparation platform featuring authorized Rwanda Gazette lessons and timed mock exams.'
        },
        maintenanceMode: false
      });
    }

    // Check homepageSections
    const sectionsSnap = await getDocs(collection(db, 'homepageSections'));
    if (sectionsSnap.empty) {
      const defaultSections = [
        {
          type: 'hero',
          title: { rw: 'Pass Your Rwandan Driving Test First Time', en: 'Pass Your Rwandan Driving Test First Time', fr: 'Réussissez votre examen du permis du premier coup' },
          subtitle: { rw: 'Gatsinda ikizamini cya Provisional nta nkomyi', en: 'Interactive Rwanda National Gazette traffic rules lessons and timed mock exams.', fr: 'Leçons interactives du code de la route et examens blancs.' },
          order: 1,
          isVisible: true,
          settings: {}
        },
        {
          type: 'announcements',
          title: { rw: 'Amatangazo Mashya', en: 'Latest Announcements', fr: 'Dernières annonces' },
          subtitle: { rw: 'Amakuru agezweho n\'amatangazo ya Leta', en: 'Official updates and announcements', fr: 'Mises à jour officielles' },
          order: 2,
          isVisible: true,
          settings: {}
        },
        {
          type: 'features',
          title: { rw: 'Ibyiza byo Gukoresha TSINDA', en: 'Why Choose TSINDA', fr: 'Pourquoi choisir TSINDA' },
          subtitle: { rw: 'Porogaramu yizewe yo kwitegura ikizamini', en: 'Built according to the official Rwanda National Gazette guidelines', fr: 'Conforme aux directives officielles' },
          order: 3,
          isVisible: true,
          settings: {}
        },
        {
          type: 'howItWorks',
          title: { rw: 'Uko Bikora', en: 'How It Works', fr: 'Comment ça marche' },
          subtitle: { rw: 'Intambwe zoroshye zo gutsinda', en: 'Simple steps to your driving license', fr: 'Étapes simples pour réussir' },
          order: 4,
          isVisible: true,
          settings: {}
        },
        {
          type: 'plans',
          title: { rw: 'Porogaramu n\'Ibiciro', en: 'Pricing Plans', fr: 'Plans tarifaires' },
          subtitle: { rw: 'Hitamo gahunda igufasha gutsinda', en: 'Choose a study plan that fits your goals', fr: 'Choisissez un plan d\'étude' },
          order: 5,
          isVisible: true,
          settings: {}
        },
        {
          type: 'stats',
          title: { rw: 'Imibare y\'Abatsinze', en: 'Our Impact', fr: 'Notre impact' },
          subtitle: { rw: 'Abanyeshuri batsinda buri munsi', en: 'Thousands of learners pass daily', fr: 'Des milliers d\'étudiants réussissent' },
          order: 6,
          isVisible: true,
          settings: {}
        },
        {
          type: 'testimonials',
          title: { rw: 'Ubuhamya bw\'Abatsinze', en: 'Success Stories', fr: 'Témoignages' },
          subtitle: { rw: 'Icyo abanyeshuri bacu bavuga', en: 'What our learners say', fr: 'Ce que disent nos étudiants' },
          order: 7,
          isVisible: true,
          settings: {}
        },
        {
          type: 'faq',
          title: { rw: 'Ibibazo Bikunze Kubazwa', en: 'Frequently Asked Questions', fr: 'Questions Fréquentes' },
          subtitle: { rw: 'Ibisubizo ku bibazo byawe', en: 'Got questions? We have answers', fr: 'Vous avez des questions ? Nous avons des réponses' },
          order: 8,
          isVisible: true,
          settings: {}
        },
        {
          type: 'cta',
          title: { rw: 'Tangira Kwiga Ubu', en: 'Start Learning Today', fr: 'Commencez à apprendre dès aujourd\'hui' },
          subtitle: { rw: 'Injira muri TSINDA witegure neza', en: 'Join thousands of successful drivers in Rwanda', fr: 'Rejoignez des milliers de conducteurs' },
          order: 9,
          isVisible: true,
          settings: {}
        }
      ];

      for (const s of defaultSections) {
        await addDoc(collection(db, 'homepageSections'), s);
      }
    }

    // Check homepageItems
    const itemsSnap = await getDocs(collection(db, 'homepageItems'));
    if (itemsSnap.empty) {
      const defaultItems = [
        // Features
        {
          sectionId: 'features',
          title: { rw: 'Igitabo cy\'amategeko y\'umuhanda', en: 'Official Traffic Rules', fr: 'Code de la route officiel' },
          description: { rw: 'Amategeko yose y\'umuhanda yemejwe mu Rwanda mu ndimi eshatu.', en: 'Comprehensive Rwanda Gazette traffic rules in Kinyarwanda, English, and French.', fr: 'Règles de circulation officielles du Rwanda.' },
          iconName: 'BookOpen',
          imageUrl: '',
          linkLabel: { rw: 'Menya Byinshi', en: 'Learn More', fr: 'En savoir plus' },
          linkUrl: '#',
          order: 1,
          isVisible: true
        },
        {
          sectionId: 'features',
          title: { rw: 'Ibizami by\'Igerageza (Mock Exams)', en: 'Timed Mock Exams', fr: 'Examens blancs chronométrés' },
          description: { rw: 'Gerageza ubumenyi bwawe mu bizamini bisa n\'ibya nyabyo bya Police.', en: 'Practice with realistic timed exams mirroring the official Police provisional test.', fr: 'Entraînez-vous avec des examens chronométrés.' },
          iconName: 'Award',
          imageUrl: '',
          linkLabel: { rw: 'Gerageza Ubu', en: 'Try Exam', fr: 'Essayer l\'examen' },
          linkUrl: '#',
          order: 2,
          isVisible: true
        },
        {
          sectionId: 'features',
          title: { rw: 'Amashusho y\'Umuhanda', en: 'Video Lessons', fr: 'Leçons vidéo' },
          description: { rw: 'Reba amashusho asobanura ibimenyetso byo mu muhanda n\'amategeko.', en: 'Watch clear video explanations of road signs, right of way, and traffic signals.', fr: 'Regardez des explications vidéo claires.' },
          iconName: 'Play',
          imageUrl: '',
          linkLabel: { rw: 'Reba Amashusho', en: 'Watch Videos', fr: 'Voir les vidéos' },
          linkUrl: '#',
          order: 3,
          isVisible: true
        },
        // How it works
        {
          sectionId: 'howItWorks',
          title: { rw: '1. Iyandikishe', en: '1. Create Account', fr: '1. Créez un compte' },
          description: { rw: 'Koresha nimero ya telefone yawe y\'u Rwanda kwiyandikisha mu buryo bworoshye.', en: 'Sign up securely using your Rwandan mobile phone number in seconds.', fr: 'Inscrivez-vous en toute sécurité.' },
          iconName: 'UserPlus',
          imageUrl: '',
          linkLabel: { rw: '', en: '', fr: '' },
          linkUrl: '',
          order: 1,
          isVisible: true
        },
        {
          sectionId: 'howItWorks',
          title: { rw: '2. Hitamo Gahunda', en: '2. Choose Plan', fr: '2. Choisissez un plan' },
          description: { rw: 'Hitamo porogaramu ikujemo ukoresheje MoMo cyangwa ikarita.', en: 'Select a study pass and pay conveniently via MTN/Airtel Mobile Money.', fr: 'Sélectionnez un plan et payez via Mobile Money.' },
          iconName: 'CreditCard',
          imageUrl: '',
          linkLabel: { rw: '', en: '', fr: '' },
          linkUrl: '',
          order: 2,
          isVisible: true
        },
        {
          sectionId: 'howItWorks',
          title: { rw: '3. Wige Utsinde', en: '3. Study & Pass', fr: '3. Étudiez et réussissez' },
          description: { rw: 'Soma amasomo yose kandi ukore ibizamini byinshi kugeza utsindiye 100%.', en: 'Study official lessons and master mock exams until you pass with flying colors.', fr: 'Étudiez les leçons officielles et réussissez.' },
          iconName: 'CheckCircle2',
          imageUrl: '',
          linkLabel: { rw: '', en: '', fr: '' },
          linkUrl: '',
          order: 3,
          isVisible: true
        },
        // Stats
        {
          sectionId: 'stats',
          title: { rw: '98%', description: { rw: 'Igipimo cy\'abatsinze ikizamini', en: 'Exam Pass Rate', fr: 'Taux de réussite' }, iconName: 'TrendingUp', order: 1, isVisible: true },
          subtitle: { rw: '', en: '', fr: '' }
        },
        {
          sectionId: 'stats',
          title: { rw: '15,000+', description: { rw: 'Abanyeshuri bamaze gutsinda', en: 'Successful Learners', fr: 'Étudiants réussis' }, iconName: 'Users', order: 2, isVisible: true },
          subtitle: { rw: '', en: '', fr: '' }
        },
        {
          sectionId: 'stats',
          title: { rw: '100%', description: { rw: 'Dukurikiza amategeko ya Leta', en: 'Rwanda Gazette Aligned', fr: 'Conforme aux textes officiels' }, iconName: 'ShieldCheck', order: 3, isVisible: true },
          subtitle: { rw: '', en: '', fr: '' }
        },
        // Testimonials
        {
          sectionId: 'testimonials',
          title: { rw: 'Jean Pierre N.', en: 'Jean Pierre N.', fr: 'Jean Pierre N.' },
          description: { rw: 'Natsinze ikizamini cya provisional kuri 98% kubera TSINDA. Ndabashimira cyane!', en: 'I passed my provisional driving test on the first attempt with 98% score thanks to TSINDA!', fr: 'J\'ai réussi mon examen provisoire du premier coup grâce à TSINDA !' },
          imageUrl: '',
          order: 1,
          isVisible: true
        },
        {
          sectionId: 'testimonials',
          title: { rw: 'Marie Claire U.', en: 'Marie Claire U.', fr: 'Marie Claire U.' },
          description: { rw: 'Ibizamini by\'igerageza byamfashije kumenya uko ikizamini nyacyo kimeze.', en: 'The timed mock exams gave me the exact confidence needed for the Police exam room.', fr: 'Les examens blancs m\'ont donné la confiance nécessaire.' },
          imageUrl: '',
          order: 2,
          isVisible: true
        },
        // FAQ
        {
          sectionId: 'faq',
          title: { rw: 'Ese nshobora kwishyura nkoresheje Mobile Money?', en: 'Can I pay using Mobile Money?', fr: 'Puis-je payer avec Mobile Money ?' },
          description: { rw: 'Yego rwose! Ushobora kwishyura ukoresheje MTN Mobile Money cyangwa Airtel Money ako kanya.', en: 'Yes! You can instantly pay securely using MTN Mobile Money or Airtel Money.', fr: 'Oui ! Vous pouvez payer instantanément via Mobile Money.' },
          order: 1,
          isVisible: true
        },
        {
          sectionId: 'faq',
          title: { rw: 'Ese amasomo ahuye n\'ayemewe mu Rwanda?', en: 'Are the lessons aligned with Rwandan laws?', fr: 'Les leçons sont-elles conformes aux lois rwandaises ?' },
          description: { rw: 'Yego, amasomo yose n\'ibibazo bikurikiza Amategeko y\'Umuhanda yemejwe mu Igazeti ya Leta.', en: 'All lessons and questions strictly follow the official Rwanda National Gazette traffic regulations.', fr: 'Toutes les leçons suivent strictement les réglementations du Journal Officiel.' },
          order: 2,
          isVisible: true
        }
      ];

      for (const item of defaultItems) {
        await addDoc(collection(db, 'homepageItems'), item);
      }
    }

    // Check announcements
    const announcementsSnap = await getDocs(collection(db, 'announcements'));
    if (announcementsSnap.empty) {
      await addDoc(collection(db, 'announcements'), {
        title: { rw: 'Ikibanza Gishya cyo Kwiga', en: 'New Study Portal Available', fr: 'Nouveau portail d\'étude disponible' },
        body: { rw: 'Tangira kwitegura ikizamini cya Provisional uyu munsi kuri TSINDA.', en: 'Start preparing for your provisional driving test today with our updated Rwanda Gazette study materials.', fr: 'Commencez à vous préparer dès aujourd\'hui.' },
        type: 'promo',
        imageUrl: '',
        linkUrl: '#',
        startAt: new Date().toISOString(),
        endAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        isPinned: true,
        isActive: true,
        createdAt: new Date().toISOString()
      });
    }

    // Check footerGroups and footerLinks
    const footerGroupsSnap = await getDocs(collection(db, 'footerGroups'));
    if (footerGroupsSnap.empty) {
      const g1 = await addDoc(collection(db, 'footerGroups'), { title: { rw: 'Amasomo', en: 'Learning', fr: 'Apprentissage' }, order: 1, isVisible: true });
      const g2 = await addDoc(collection(db, 'footerGroups'), { title: { rw: 'Kampani', en: 'Company', fr: 'Entreprise' }, order: 2, isVisible: true });
      
      await addDoc(collection(db, 'footerLinks'), { groupId: g1.id, label: { rw: 'Amategeko y\'Umuhanda', en: 'Traffic Rules', fr: 'Code de la route' }, url: '/lessons', order: 1, isVisible: true });
      await addDoc(collection(db, 'footerLinks'), { groupId: g1.id, label: { rw: 'Ibizamini by\'Igerageza', en: 'Mock Exams', fr: 'Examens blancs' }, url: '/exams', order: 2, isVisible: true });
      await addDoc(collection(db, 'footerLinks'), { groupId: g2.id, label: { rw: 'Abo Turi Bo', en: 'About Us', fr: 'À propos' }, url: '/about', order: 1, isVisible: true });
    }

    // Check socialLinks
    const socialSnap = await getDocs(collection(db, 'socialLinks'));
    if (socialSnap.empty) {
      await addDoc(collection(db, 'socialLinks'), { platform: 'WhatsApp', url: 'https://whatsapp.com', order: 1, isVisible: true });
      await addDoc(collection(db, 'socialLinks'), { platform: 'YouTube', url: 'https://youtube.com', order: 2, isVisible: true });
      await addDoc(collection(db, 'socialLinks'), { platform: 'Twitter', url: 'https://twitter.com', order: 3, isVisible: true });
    }

  } catch (err) {
    console.error('Error seeding system settings:', err);
  }
}
