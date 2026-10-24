import React, { useEffect, useState } from 'react';
import { db, storage } from '../../lib/firebase';
import { collection, getDocs, doc, setDoc, addDoc, updateDoc, deleteDoc, writeBatch } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { handleFirestoreError, OperationType } from '../../lib/firestoreUtils';
import { Question, ExamSettings, Language } from '../../types';
import { compressImage } from '../../lib/imageUtils';
import Papa from 'papaparse';
import JSZip from 'jszip';
import { 
  Settings, 
  HelpCircle, 
  Plus, 
  Trash2, 
  Edit2, 
  Upload, 
  Eye, 
  EyeOff, 
  CheckCircle, 
  Search, 
  ImageIcon,
  FileText
} from 'lucide-react';
import { ConfirmModal } from '../common/ConfirmModal';

export const ExamsManager: React.FC = () => {
  const [subTab, setSubTab] = useState<'questions' | 'bulk' | 'settings'>('questions');

  // Exam Settings state
  const [settingsId, setSettingsId] = useState<string>('global-settings');
  const [numQuestions, setNumQuestions] = useState<number>(20);
  const [durationMinutes, setDurationMinutes] = useState<number>(20);
  const [passMark, setPassMark] = useState<number>(12);
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsSuccess, setSettingsSuccess] = useState(false);

  // Questions state
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loadingQuestions, setLoadingQuestions] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState<'all' | 'text' | 'image'>('all');

  // Single Question Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
  const [questionToDelete, setQuestionToDelete] = useState<Question | null>(null);

  // Question form state
  const [formLang, setFormLang] = useState<'en' | 'rw' | 'fr'>('en');
  const [qTextEn, setQTextEn] = useState('');
  const [qTextRw, setQTextRw] = useState('');
  const [qTextFr, setQTextFr] = useState('');
  
  const [opt1En, setOpt1En] = useState('');
  const [opt2En, setOpt2En] = useState('');
  const [opt3En, setOpt3En] = useState('');
  const [opt4En, setOpt4En] = useState('');

  const [opt1Rw, setOpt1Rw] = useState('');
  const [opt2Rw, setOpt2Rw] = useState('');
  const [opt3Rw, setOpt3Rw] = useState('');
  const [opt4Rw, setOpt4Rw] = useState('');

  const [opt1Fr, setOpt1Fr] = useState('');
  const [opt2Fr, setOpt2Fr] = useState('');
  const [opt3Fr, setOpt3Fr] = useState('');
  const [opt4Fr, setOpt4Fr] = useState('');

  const [explanationEn, setExplanationEn] = useState('');
  const [explanationRw, setExplanationRw] = useState('');
  const [explanationFr, setExplanationFr] = useState('');

  const [correctIdx, setCorrectIdx] = useState(0);
  const [qCategory, setQCategory] = useState('Traffic Signs');
  const [imageUrl, setImageUrl] = useState('');
  const [qPublished, setQPublished] = useState(true);

  // Bulk Import state
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [bulkImages, setBulkImages] = useState<File[]>([]);
  const [parsedRows, setParsedRows] = useState<any[]>([]);
  const [validationReport, setValidationReport] = useState<{
    validCount: number;
    skippedCount: number;
    errors: { row: number; message: string; type?: string }[];
    missingImages: string[];
    unusedImages: string[];
    duplicateImages: string[];
    existingIds: { id: string; row: number }[];
  } | null>(null);
  const [importing, setImporting] = useState(false);

  const [firestoreCategories, setFirestoreCategories] = useState<string[]>([]);

  // Fetch initial data
  const fetchData = async () => {
    try {
      const catSnap = await getDocs(collection(db, 'categories')).catch(() => null);
      if (catSnap && !catSnap.empty) {
        const catList = catSnap.docs.map(d => {
          const val = d.data();
          return typeof val.name === 'object' ? val.name.en || val.name.rw || 'General' : val.name || 'General';
        });
        setFirestoreCategories(catList);
      }

      const setSnap = await getDocs(collection(db, 'examSettings')).catch(() => null);
      if (setSnap && !setSnap.empty) {
        const docData = setSnap.docs[0];
        setSettingsId(docData.id);
        const data = docData.data() as ExamSettings;
        setNumQuestions(data.numQuestions || 20);
        setDurationMinutes(data.durationMinutes || 20);
        setPassMark(data.passMark || 12);
      }

      const qSnap = await getDocs(collection(db, 'questions')).catch(err => {
        handleFirestoreError(err, OperationType.LIST, 'questions');
        return null;
      });
      if (qSnap) {
        setQuestions(qSnap.docs.map(d => ({ id: d.id, ...d.data() } as Question)));
      }
    } catch (err) {
      console.error("Error fetching exam data:", err);
    } finally {
      setLoadingQuestions(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSettings(true);
    setSettingsSuccess(false);
    const data: ExamSettings = {
      id: settingsId,
      numQuestions: Number(numQuestions),
      durationMinutes: Number(durationMinutes),
      passMark: Number(passMark)
    };

    try {
      await setDoc(doc(db, 'examSettings', settingsId), data).catch(err => {
        handleFirestoreError(err, OperationType.WRITE, `examSettings/${settingsId}`);
      });
      setSettingsSuccess(true);
      setTimeout(() => setSettingsSuccess(false), 3000);
    } catch (err) {
      console.error("Error saving settings:", err);
    } finally {
      setSavingSettings(false);
    }
  };

  const handleSaveQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    const questionData = {
      text: { en: qTextEn.trim(), rw: qTextRw.trim(), fr: qTextFr.trim() },
      options: {
        en: [opt1En, opt2En, opt3En, opt4En].map(s => s.trim()).filter(Boolean),
        rw: [opt1Rw, opt2Rw, opt3Rw, opt4Rw].map(s => s.trim()).filter(Boolean),
        fr: [opt1Fr, opt2Fr, opt3Fr, opt4Fr].map(s => s.trim()).filter(Boolean)
      },
      correctIndex: Number(correctIdx),
      explanation: {
        en: explanationEn.trim(),
        rw: explanationRw.trim(),
        fr: explanationFr.trim()
      },
      category: qCategory,
      imageUrl,
      isPublished: qPublished
    };

    try {
      if (editingQuestion) {
        await updateDoc(doc(db, 'questions', editingQuestion.id), questionData).catch(err => {
          handleFirestoreError(err, OperationType.UPDATE, `questions/${editingQuestion.id}`);
        });
        setQuestions(questions.map(q => q.id === editingQuestion.id ? { ...q, ...questionData } : q));
      } else {
        const docRef = await addDoc(collection(db, 'questions'), questionData).catch(err => {
          handleFirestoreError(err, OperationType.CREATE, 'questions');
          return null;
        });
        if (docRef) {
          setQuestions([...questions, { id: docRef.id, ...questionData }]);
        }
      }
      setIsModalOpen(false);
    } catch (err) {
      console.error("Error saving question:", err);
    }
  };

  const handleTogglePublish = async (question: Question) => {
    const updated = !question.isPublished;
    try {
      await updateDoc(doc(db, 'questions', question.id), { isPublished: updated }).catch(err => {
        handleFirestoreError(err, OperationType.UPDATE, `questions/${question.id}`);
      });
      setQuestions(questions.map(q => q.id === question.id ? { ...q, isPublished: updated } : q));
    } catch (err) {
      console.error("Error updating publish status:", err);
    }
  };

  const handleDeleteQuestion = async () => {
    if (!questionToDelete) return;
    try {
      await deleteDoc(doc(db, 'questions', questionToDelete.id)).catch(err => {
        handleFirestoreError(err, OperationType.DELETE, `questions/${questionToDelete.id}`);
      });
      setQuestions(questions.filter(q => q.id !== questionToDelete.id));
      setQuestionToDelete(null);
    } catch (err) {
      console.error("Error deleting question:", err);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressImage(file);
      setImageUrl(compressed);
    } catch (err) {
      console.error("Error compressing image:", err);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvFile(file);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      encoding: "UTF-8",
      complete: (results) => {
        setParsedRows(results.data);
        validateBulkRows(results.data, bulkImages);
      }
    });
  };

  const handleBulkImagesUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const files = Array.from(e.target.files);
    const imageMap = new Map<string, File>();

    for (const file of files) {
      if (file.name.toLowerCase().endsWith('.zip') || file.type.includes('zip')) {
        try {
          const zip = new JSZip();
          const zipContent = await zip.loadAsync(file);
          for (const [relativePath, zipEntry] of Object.entries(zipContent.files)) {
            if (!zipEntry.dir) {
              const filename = relativePath.split('/').pop() || relativePath;
              const blob = await zipEntry.async('blob');
              const imgFile = new File([blob], filename, { type: 'image/png' });
              imageMap.set(filename.toLowerCase(), imgFile);
            }
          }
        } catch (err) {
          console.error("Error unzipping file:", err);
        }
      } else {
        imageMap.set(file.name.toLowerCase(), file);
      }
    }

    const allFiles = Array.from(imageMap.values());
    setBulkImages(allFiles);
    validateBulkRows(parsedRows, allFiles);
  };

  const validateBulkRows = (rows: any[], images: File[]) => {
    const errors: { row: number; message: string; type?: string }[] = [];
    let skippedCount = 0;
    const imageNamesMap = new Map<string, File>();
    images.forEach(img => imageNamesMap.set(img.name.toLowerCase(), img));

    const matchedImagesInRows = new Set<string>();
    const existingIds: { id: string; row: number }[] = [];

    rows.forEach((row, index) => {
      const rowNum = index + 1;
      const status = (row.import_status || '').trim().toLowerCase();
      if (status === 'needs_decision') {
        skippedCount++;
        return;
      }

      const qId = (row.question_id || row.id || '').trim();
      if (!qId) {
        errors.push({ row: rowNum, message: "Missing question_id.", type: "Missing ID" });
        return;
      }

      if (questions.some(q => q.id === qId)) {
        existingIds.push({ id: qId, row: rowNum });
      }

      const qRw = (row.question_rw || '').trim();
      const qEn = (row.question_en || '').trim();
      const qFr = (row.question_fr || '').trim();
      if (!qRw && !qEn && !qFr) {
        errors.push({ row: rowNum, message: "Missing question text in all languages (rw, en, fr).", type: "Missing Question Text" });
      }

      const correctAns = (row.correct_answer || '').trim().toUpperCase();
      if (!['A', 'B', 'C', 'D'].includes(correctAns)) {
        errors.push({ row: rowNum, message: `Invalid or missing correct_answer (${row.correct_answer}): must be A, B, C, or D.`, type: "Invalid Correct Answer" });
      }

      // Check options a, b, c, d
      ['a', 'b', 'c', 'd'].forEach(optKey => {
        const textRw = (row[`option_${optKey}_rw`] || '').trim();
        const textEn = (row[`option_${optKey}_en`] || '').trim();
        const textFr = (row[`option_${optKey}_fr`] || '').trim();
        const optImg = (row[`option_${optKey}_image`] || '').trim();
        if (!textRw && !textEn && !textFr && !optImg) {
          errors.push({ row: rowNum, message: `Option ${optKey.toUpperCase()} has no text and no image.`, type: "Invalid Option" });
        }
        if (optImg) {
          const cleanImg = optImg.toLowerCase();
          matchedImagesInRows.add(cleanImg);
          if (imageNamesMap.size > 0 && !imageNamesMap.has(cleanImg)) {
            errors.push({ row: rowNum, message: `Missing option image: ${optImg}`, type: "Missing Image" });
          }
        }
      });

      // Check image_name (pipe separated)
      const imgNames = (row.image_name || '').split('|').map((s: string) => s.trim()).filter(Boolean);
      imgNames.forEach((imgName: string) => {
        const cleanName = imgName.toLowerCase();
        matchedImagesInRows.add(cleanName);
        if (imageNamesMap.size > 0 && !imageNamesMap.has(cleanName)) {
          errors.push({ row: rowNum, message: `Missing image_name reference: ${imgName}`, type: "Missing Image" });
        }
      });
    });

    const unusedImages = images
      .map(img => img.name)
      .filter(imgName => !matchedImagesInRows.has(imgName.toLowerCase()));

    const validCount = Math.max(0, rows.length - skippedCount - errors.length);

    setValidationReport({
      validCount,
      skippedCount,
      errors,
      missingImages: [],
      unusedImages,
      duplicateImages: [],
      existingIds
    });
  };

  const [importProgress, setImportProgress] = useState<string>('');

  const fileToDataUrl = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleConfirmImport = async () => {
    if (parsedRows.length === 0) return;
    setImporting(true);

    try {
      setImportProgress(`Reading images (0/${bulkImages.length})...`);
      const imageUrlMap = new Map<string, string>();
      for (let i = 0; i < bulkImages.length; i++) {
        const img = bulkImages[i];
        if (i % 10 === 0 || i === bulkImages.length - 1) {
          setImportProgress(`Reading images (${i + 1}/${bulkImages.length})`);
        }
        const dataUrl = await fileToDataUrl(img);
        imageUrlMap.set(img.name.toLowerCase(), dataUrl);
      }

      const validRowsToImport = parsedRows.filter(row => {
        const status = (row.import_status || '').trim().toLowerCase();
        if (status === 'needs_decision') return false;
        const qId = (row.question_id || row.id || '').trim();
        return Boolean(qId);
      });

      let importedCount = 0;
      let batch = writeBatch(db);
      let batchSize = 0;

      for (let i = 0; i < validRowsToImport.length; i++) {
        const row = validRowsToImport[i];
        const qId = (row.question_id || row.id || '').trim();

        if (i % 20 === 0 || i === validRowsToImport.length - 1) {
          setImportProgress(`Saving questions (${i + 1}/${validRowsToImport.length})`);
        }

        const correctAns = (row.correct_answer || 'A').trim().toUpperCase();
        let correctIndex = 0;
        if (correctAns === 'B') correctIndex = 1;
        else if (correctAns === 'C') correctIndex = 2;
        else if (correctAns === 'D') correctIndex = 3;

        const options = {
          rw: [row.option_a_rw, row.option_b_rw, row.option_c_rw, row.option_d_rw].map(s => (s || '').trim()),
          en: [row.option_a_en, row.option_b_en, row.option_c_en, row.option_d_en].map(s => (s || '').trim()),
          fr: [row.option_a_fr, row.option_b_fr, row.option_c_fr, row.option_d_fr].map(s => (s || '').trim()),
        };

        const optionImages = {
          a: row.option_a_image ? imageUrlMap.get(row.option_a_image.trim().toLowerCase()) || '' : '',
          b: row.option_b_image ? imageUrlMap.get(row.option_b_image.trim().toLowerCase()) || '' : '',
          c: row.option_c_image ? imageUrlMap.get(row.option_c_image.trim().toLowerCase()) || '' : '',
          d: row.option_d_image ? imageUrlMap.get(row.option_d_image.trim().toLowerCase()) || '' : '',
        };

        const imgNames = (row.image_name || '').split('|').map((s: string) => s.trim()).filter(Boolean);
        const images = imgNames.map((name: string) => imageUrlMap.get(name.toLowerCase()) || '').filter(Boolean);
        const imageUrlVal = images[0] || '';

        const questionData = {
          text: {
            rw: (row.question_rw || '').trim(),
            en: (row.question_en || '').trim(),
            fr: (row.question_fr || '').trim(),
          },
          options,
          optionImages,
          images,
          imageNames: imgNames,
          optionImageNames: {
            a: (row.option_a_image || '').trim(),
            b: (row.option_b_image || '').trim(),
            c: (row.option_c_image || '').trim(),
            d: (row.option_d_image || '').trim(),
          },
          imageUrl: imageUrlVal,
          correctIndex,
          category: row.group_id || 'Traffic Signs',
          article_id: row.article_id || '',
          group_id: row.group_id || '',
          source_number: row.source_number || '',
          source_page: row.source_page || '',
          review_flags: row.review_flags || '',
          translation_source: row.translation_source || '',
          match_confidence: row.match_confidence || '',
          alt_articles: row.alt_articles || '',
          explanation: {
            rw: (row.explanation_rw || '').trim(),
            en: (row.explanation_en || '').trim(),
            fr: (row.explanation_fr || '').trim(),
          },
          isPublished: true
        };

        const docStringSize = new TextEncoder().encode(JSON.stringify(questionData)).length;
        if (docStringSize > 900 * 1024) {
          throw new Error(`Question ${qId} exceeds 900 KB limit (${Math.round(docStringSize / 1024)} KB)`);
        }

        batch.set(doc(db, 'questions', qId), questionData, { merge: true });
        batchSize++;
        importedCount++;

        if (batchSize === 500) {
          await batch.commit();
          batch = writeBatch(db);
          batchSize = 0;
        }
      }

      if (batchSize > 0) {
        await batch.commit();
      }

      alert(`Successfully imported/updated ${importedCount} questions!`);
      setParsedRows([]);
      setBulkImages([]);
      setValidationReport(null);
      setCsvFile(null);
      setSubTab('questions');
      fetchData();
    } catch (err: any) {
      console.error("Error during bulk import:", err);
      alert(`Bulk import failed: ${err.message || err}`);
    } finally {
      setImporting(false);
      setImportProgress('');
    }
  };

  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 15;

  const filteredQuestions = questions.filter(q => {
    const matchesSearch = q.text.en.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          q.text.rw.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = categoryFilter === 'all' || q.category === categoryFilter;
    const matchesType = typeFilter === 'all' || (typeFilter === 'image' ? !!q.imageUrl : !q.imageUrl);
    return matchesSearch && matchesCategory && matchesType;
  });

  const totalPages = Math.ceil(filteredQuestions.length / ITEMS_PER_PAGE);
  const paginatedQuestions = filteredQuestions.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);
  
  // Reset to page 1 when filtering
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, categoryFilter, typeFilter]);

  const paginationControls = totalPages > 1 ? (
    <div className="flex items-center justify-between p-4 border-t border-slate-200">
      <span className="text-sm text-slate-500">
        Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1} - {Math.min(currentPage * ITEMS_PER_PAGE, filteredQuestions.length)} of {filteredQuestions.length} questions
      </span>
      <div className="flex gap-2">
        <button
          disabled={currentPage === 1}
          onClick={() => setCurrentPage(p => p - 1)}
          className="px-3 py-1 bg-white border border-slate-300 rounded-md text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
        >
          Previous
        </button>
        <button
          disabled={currentPage === totalPages}
          onClick={() => setCurrentPage(p => p + 1)}
          className="px-3 py-1 bg-white border border-slate-300 rounded-md text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
        >
          Next
        </button>
      </div>
    </div>
  ) : null;

  const categories = [
    'all',
    ...Array.from(new Set([...firestoreCategories, ...questions.map((q) => q.category)])).filter(Boolean),
  ];

  return (
    <div className="space-y-6">
      {/* Sub-tabs for Exams section with 44px min touch targets */}
      <div className="flex flex-wrap gap-1.5 p-1 bg-slate-200/70 rounded-xl w-full sm:w-fit">
        <button
          onClick={() => setSubTab('questions')}
          className={`min-h-[44px] flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 py-2 rounded-[10px] text-xs sm:text-sm font-semibold transition-all ${
            subTab === 'questions' ? 'bg-white text-blue-600 shadow-xs' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <HelpCircle className="w-4 h-4 shrink-0" />
          <span className="whitespace-nowrap">Questions ({questions.length})</span>
        </button>
        <button
          onClick={() => setSubTab('bulk')}
          className={`min-h-[44px] flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 py-2 rounded-[10px] text-xs sm:text-sm font-semibold transition-all ${
            subTab === 'bulk' ? 'bg-white text-blue-600 shadow-xs' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Upload className="w-4 h-4 shrink-0" />
          <span className="whitespace-nowrap">Bulk Import</span>
        </button>
        <button
          onClick={() => setSubTab('settings')}
          className={`min-h-[44px] flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 py-2 rounded-[10px] text-xs sm:text-sm font-semibold transition-all ${
            subTab === 'settings' ? 'bg-white text-blue-600 shadow-xs' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Settings className="w-4 h-4 shrink-0" />
          <span className="whitespace-nowrap">Exam Settings</span>
        </button>
      </div>

      {/* 1. National Exam Configuration Settings */}
      {subTab === 'settings' && (
        <div className="max-w-2xl bg-white rounded-xl border border-slate-200 shadow-sm p-6 sm:p-8 space-y-6">
          <div className="flex items-center gap-3 pb-6 border-b border-slate-100">
            <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-[10px] flex items-center justify-center">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-slate-900">National Exam Configuration</h3>
              <p className="text-xs sm:text-sm text-slate-500">Configure parameters for Rwanda National Gazette theory exams.</p>
            </div>
          </div>

          {settingsSuccess && (
            <div className="flex items-center gap-2 p-4 bg-emerald-50 text-emerald-800 rounded-[10px] text-sm font-medium border border-emerald-200">
              <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0" />
              <span>Exam settings successfully saved to Firestore!</span>
            </div>
          )}

          <form onSubmit={handleSaveSettings} className="space-y-5">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase mb-1.5">
                Number of Questions per Exam
              </label>
              <input
                type="number"
                required
                min={5}
                max={100}
                value={numQuestions}
                onChange={(e) => setNumQuestions(Number(e.target.value))}
                className="w-full min-h-[44px] px-4 py-2.5 rounded-[10px] border border-slate-200 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase mb-1.5">
                Exam Duration (Minutes)
              </label>
              <input
                type="number"
                required
                min={5}
                max={120}
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(Number(e.target.value))}
                className="w-full min-h-[44px] px-4 py-2.5 rounded-[10px] border border-slate-200 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase mb-1.5">
                Passing Mark (Minimum Correct Answers)
              </label>
              <input
                type="number"
                required
                min={1}
                max={numQuestions}
                value={passMark}
                onChange={(e) => setPassMark(Number(e.target.value))}
                className="w-full min-h-[44px] px-4 py-2.5 rounded-[10px] border border-slate-200 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <button
              type="submit"
              disabled={savingSettings}
              className="min-h-[44px] flex items-center justify-center gap-2 w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-[10px] shadow-sm transition-colors text-sm disabled:opacity-50"
            >
              <CheckCircle className="w-4 h-4" />
              <span>{savingSettings ? 'Saving...' : 'Save Exam Settings'}</span>
            </button>
          </form>
        </div>
      )}

      {/* 2. Exam Questions Table */}
      {subTab === 'questions' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3">
            <div className="flex flex-wrap items-center gap-2 sm:gap-3 flex-1">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search questions..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full min-h-[44px] pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-[10px] text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="min-h-[44px] px-3 py-2 bg-white border border-slate-200 rounded-[10px] text-base sm:text-sm text-slate-700 focus:outline-none cursor-pointer"
              >
                {categories.map(cat => (
                  <option key={cat} value={cat}>Category: {cat}</option>
                ))}
              </select>

              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value as any)}
                className="min-h-[44px] px-3 py-2 bg-white border border-slate-200 rounded-[10px] text-base sm:text-sm text-slate-700 focus:outline-none cursor-pointer"
              >
                <option value="all">Type: All</option>
                <option value="text">Text Only</option>
                <option value="image">With Image</option>
              </select>
            </div>

            <button
              onClick={() => {
                setEditingQuestion(null);
                setFormLang('en');
                setQTextEn(''); setQTextRw(''); setQTextFr('');
                setOpt1En(''); setOpt2En(''); setOpt3En(''); setOpt4En('');
                setOpt1Rw(''); setOpt2Rw(''); setOpt3Rw(''); setOpt4Rw('');
                setOpt1Fr(''); setOpt2Fr(''); setOpt3Fr(''); setOpt4Fr('');
                setExplanationEn(''); setExplanationRw(''); setExplanationFr('');
                setCorrectIdx(0); setImageUrl(''); setQPublished(true);
                setIsModalOpen(true);
              }}
              className="min-h-[44px] flex items-center justify-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-[10px] text-sm shadow-sm transition-colors whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              <span>Add Question</span>
            </button>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            {loadingQuestions ? (
              <div className="p-6 space-y-4">
                <div className="h-6 bg-slate-100 rounded w-48 mb-4"></div>
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="flex items-center gap-4 py-3.5 border-b border-slate-100 animate-pulse">
                    <div className="w-12 h-12 bg-slate-200 rounded-lg shrink-0"></div>
                    <div className="flex-1 space-y-2">
                      <div className="h-4 bg-slate-200 rounded w-3/4"></div>
                      <div className="h-3 bg-slate-100 rounded w-1/2"></div>
                    </div>
                    <div className="h-6 bg-slate-100 rounded-full w-20"></div>
                    <div className="h-8 bg-slate-100 rounded-lg w-20"></div>
                  </div>
                ))}
              </div>
            ) : filteredQuestions.length === 0 ? (
              <div className="p-10 sm:p-14 text-center space-y-3">
                <div className="w-12 h-12 bg-slate-100 text-slate-400 rounded-xl flex items-center justify-center mx-auto">
                  <HelpCircle className="w-6 h-6" />
                </div>
                <h3 className="font-bold text-slate-900 text-base">No exam questions found</h3>
                <p className="text-sm text-slate-500 max-w-sm mx-auto">
                  {searchQuery || categoryFilter !== 'all' || typeFilter !== 'all'
                    ? "No questions match your current filter criteria."
                    : "Add single questions or bulk import from CSV to populate the question bank."}
                </p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[650px]">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600 uppercase">
                      <th className="py-3.5 px-6">Image</th>
                      <th className="py-3.5 px-6">English Preview</th>
                      <th className="py-3.5 px-6">Category</th>
                      <th className="py-3.5 px-6">Status</th>
                      <th className="py-3.5 px-6 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm">
                    {paginatedQuestions.map((q) => (
                      <tr key={q.id} className="hover:bg-slate-50/60 transition-colors">
                        <td className="py-4 px-6 whitespace-nowrap">
                          {q.imageUrl ? (
                            <img src={q.imageUrl} alt="Thumb" className="w-12 h-12 object-cover rounded-lg border bg-slate-50" />
                          ) : (
                            <div className="w-12 h-12 rounded-lg bg-slate-100 flex items-center justify-center text-slate-400 text-xs font-medium">
                              Text
                            </div>
                          )}
                        </td>
                        <td className="py-4 px-6 max-w-md">
                          <div className="font-semibold text-slate-900 line-clamp-1">{q.text.en}</div>
                          <div className="flex flex-wrap items-center gap-1.5 mt-1">
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${q.text.rw ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-500'}`}>
                              RW text: {q.text.rw ? '✓' : '–'}
                            </span>
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${q.text.fr ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-500'}`}>
                              FR text: {q.text.fr ? '✓' : '–'}
                            </span>
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${Array.isArray(q.options?.rw) && q.options.rw.length > 0 ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-700 border border-amber-200'}`}>
                              RW opts: {Array.isArray(q.options?.rw) && q.options.rw.length > 0 ? `${q.options.rw.length}✓` : '–'}
                            </span>
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${Array.isArray(q.options?.fr) && q.options.fr.length > 0 ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-700 border border-amber-200'}`}>
                              FR opts: {Array.isArray(q.options?.fr) && q.options.fr.length > 0 ? `${q.options.fr.length}✓` : '–'}
                            </span>
                          </div>
                        </td>
                        <td className="py-4 px-6 text-slate-600 whitespace-nowrap">{q.category}</td>
                        <td className="py-4 px-6 whitespace-nowrap">
                          <button
                            onClick={() => handleTogglePublish(q)}
                            className={`min-h-[44px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                              q.isPublished ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100' : 'bg-amber-50 text-amber-700 hover:bg-amber-100'
                            }`}
                          >
                            {q.isPublished ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                            <span>{q.isPublished ? 'Published' : 'Draft'}</span>
                          </button>
                        </td>
                        <td className="py-4 px-6 text-right space-x-2 whitespace-nowrap">
                          <button
                            onClick={() => {
                              setEditingQuestion(q);
                              setFormLang('en');
                              setQTextEn(q.text?.en || '');
                              setQTextRw(q.text?.rw || '');
                              setQTextFr(q.text?.fr || '');

                              const enOpts = Array.isArray(q.options?.en) ? q.options.en : (Array.isArray(q.options) ? q.options : []);
                              const rwOpts = Array.isArray(q.options?.rw) ? q.options.rw : [];
                              const frOpts = Array.isArray(q.options?.fr) ? q.options.fr : [];

                              setOpt1En(enOpts[0] || ''); setOpt2En(enOpts[1] || ''); setOpt3En(enOpts[2] || ''); setOpt4En(enOpts[3] || '');
                              setOpt1Rw(rwOpts[0] || ''); setOpt2Rw(rwOpts[1] || ''); setOpt3Rw(rwOpts[2] || ''); setOpt4Rw(rwOpts[3] || '');
                              setOpt1Fr(frOpts[0] || ''); setOpt2Fr(frOpts[1] || ''); setOpt3Fr(frOpts[2] || ''); setOpt4Fr(frOpts[3] || '');

                              const expEn = typeof q.explanation === 'object' && q.explanation !== null ? (q.explanation.en || '') : (typeof q.explanation === 'string' ? q.explanation : '');
                              const expRw = typeof q.explanation === 'object' && q.explanation !== null ? (q.explanation.rw || '') : '';
                              const expFr = typeof q.explanation === 'object' && q.explanation !== null ? (q.explanation.fr || '') : '';

                              setExplanationEn(expEn);
                              setExplanationRw(expRw);
                              setExplanationFr(expFr);

                              setCorrectIdx(q.correctIndex ?? 0);
                              setQCategory(q.category || 'General');
                              setImageUrl(q.imageUrl || '');
                              setQPublished(q.isPublished ?? true);
                              setIsModalOpen(true);
                            }}
                            className="min-h-[44px] min-w-[44px] p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-[10px] transition-colors inline-flex items-center justify-center"
                            aria-label="Edit Question"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setQuestionToDelete(q)}
                            className="min-h-[44px] min-w-[44px] p-2 bg-red-50 hover:bg-red-100 text-red-600 rounded-[10px] transition-colors inline-flex items-center justify-center"
                            aria-label="Delete Question"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {totalPages > 1 && (
                <div className="flex items-center justify-between p-4 border-t border-slate-200">
                  <span className="text-sm text-slate-500">
                    Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1} - {Math.min(currentPage * ITEMS_PER_PAGE, filteredQuestions.length)} of {filteredQuestions.length} questions
                  </span>
                  <div className="flex gap-2">
                    <button
                      disabled={currentPage === 1}
                      onClick={() => setCurrentPage(p => p - 1)}
                      className="px-3 py-1 bg-white border border-slate-300 rounded-md text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
                    >
                      Previous
                    </button>
                    <button
                      disabled={currentPage === totalPages}
                      onClick={() => setCurrentPage(p => p + 1)}
                      className="px-3 py-1 bg-white border border-slate-300 rounded-md text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    )}

      {/* 3. Bulk Import */}
      {subTab === 'bulk' && (
        <div className="max-w-2xl bg-white rounded-xl border border-slate-200 shadow-sm p-6 sm:p-8 space-y-6">
          <div className="space-y-2">
            <h3 className="text-base sm:text-lg font-bold text-slate-900">Bulk Import Questions & Images</h3>
            <p className="text-sm text-slate-500 leading-relaxed">
              Upload a CSV file containing questions and select all corresponding image files. The system matches each question via the <code className="bg-slate-100 px-1.5 py-0.5 rounded text-xs">image_name</code> column.
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase mb-1.5">
                Step 1: Upload Questions File (.csv)
              </label>
              <input
                type="file"
                accept=".csv,.txt"
                onChange={handleFileUpload}
                className="w-full min-h-[44px] text-base sm:text-sm text-slate-500 file:mr-4 file:py-2.5 file:px-4 file:rounded-[10px] file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 border border-slate-200 rounded-[10px] p-2"
              />
              {csvFile && <p className="text-xs text-emerald-600 mt-1 font-medium">Loaded CSV: {csvFile.name} ({parsedRows.length} rows)</p>}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase mb-1.5">
                Step 2: Upload All Corresponding Images (Multiple files)
              </label>
              <input
                type="file"
                multiple
                accept="image/*"
                onChange={handleBulkImagesUpload}
                className="w-full min-h-[44px] text-base sm:text-sm text-slate-500 file:mr-4 file:py-2.5 file:px-4 file:rounded-[10px] file:border-0 file:text-xs file:font-semibold file:bg-purple-50 file:text-purple-700 hover:file:bg-purple-100 border border-slate-200 rounded-[10px] p-2"
              />
              {bulkImages.length > 0 && <p className="text-xs text-emerald-600 mt-1 font-medium">Loaded {bulkImages.length} image files.</p>}
            </div>
          </div>

          {validationReport && (
            <div className="p-6 bg-white rounded-xl border border-slate-200 shadow-sm space-y-4">
              <h4 className="font-bold text-slate-900 text-sm">Validation Preview Report</h4>
              
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs font-medium">
                <div className="p-3 bg-slate-50 rounded-[10px] border">
                  <span className="text-slate-500 block">Total Rows:</span>
                  <span className="text-lg font-bold text-slate-900">{parsedRows.length}</span>
                </div>
                <div className="p-3 bg-slate-50 rounded-[10px] border">
                  <span className="text-slate-500 block">Valid:</span>
                  <span className="text-lg font-bold text-emerald-600">{validationReport.validCount}</span>
                </div>
                <div className="p-3 bg-slate-50 rounded-[10px] border">
                  <span className="text-slate-500 block">Skipped (Needs Decision):</span>
                  <span className="text-lg font-bold text-amber-600">{validationReport.skippedCount}</span>
                </div>
                <div className="p-3 bg-slate-50 rounded-[10px] border">
                  <span className="text-slate-500 block">Errors:</span>
                  <span className={`text-lg font-bold ${validationReport.errors.length > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                    {validationReport.errors.length}
                  </span>
                </div>
              </div>

              {validationReport.errors.length > 0 && (
                <div className="space-y-1">
                  <span className="text-xs font-bold text-red-700">Row Errors (Showing up to first 20 examples per type):</span>
                  <ul className="text-xs text-red-600 space-y-1 max-h-48 overflow-y-auto bg-slate-50 p-3 rounded-[10px] border font-mono">
                    {validationReport.errors.slice(0, 20).map((err, idx) => (
                      <li key={idx}>Row {err.row}: {err.message}</li>
                    ))}
                    {validationReport.errors.length > 20 && (
                      <li className="text-slate-500 italic">...and {validationReport.errors.length - 20} more errors.</li>
                    )}
                  </ul>
                </div>
              )}

              {validationReport.unusedImages.length > 0 && (
                <div className="space-y-1">
                  <span className="text-xs font-bold text-slate-700">Unused Uploaded Images (Warnings):</span>
                  <p className="text-xs text-slate-600 bg-slate-50 p-3 rounded-[10px] border max-h-24 overflow-y-auto">
                    {validationReport.unusedImages.join(', ')}
                  </p>
                </div>
              )}

              {/* Existing IDs notice */}
              {validationReport.existingIds.length > 0 && (
                <p className="text-xs text-blue-700 font-semibold pt-2">
                  Note: {validationReport.existingIds.length} question(s) already exist in the database and will be updated/replaced with new data & images.
                </p>
              )}

              <button
                onClick={handleConfirmImport}
                disabled={importing || validationReport.validCount === 0}
                className="w-full min-h-[44px] py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-[10px] text-sm shadow-sm transition-colors disabled:opacity-50"
              >
                {importing ? (importProgress || "Importing...") : `Confirm Import (${validationReport.validCount} Valid Rows)`}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Single Question Add/Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
          <div className="w-full max-w-2xl bg-white rounded-xl shadow-xl overflow-hidden border border-slate-100 p-6 sm:p-8 my-8">
            <h3 className="text-xl font-bold text-slate-900 mb-6">
              {editingQuestion ? 'Edit Exam Question' : 'Create Exam Question'}
            </h3>
            <form onSubmit={handleSaveQuestion} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1.5">Category *</label>
                  <select
                    value={qCategory}
                    onChange={(e) => setQCategory(e.target.value)}
                    className="w-full min-h-[44px] px-3 py-2.5 rounded-[10px] border border-slate-200 text-base sm:text-sm bg-white"
                  >
                    {categories.filter(c => c !== 'all').map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1.5">Correct Option *</label>
                  <select
                    value={correctIdx}
                    onChange={(e) => setCorrectIdx(Number(e.target.value))}
                    className="w-full min-h-[44px] px-3 py-2.5 rounded-[10px] border border-slate-200 text-base sm:text-sm bg-white font-semibold text-emerald-800"
                  >
                    <option value={0}>Option A</option>
                    <option value={1}>Option B</option>
                    <option value={2}>Option C</option>
                    <option value={3}>Option D</option>
                  </select>
                </div>
              </div>

              {/* Language Tabs */}
              <div className="pt-2">
                <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
                  <button
                    type="button"
                    onClick={() => setFormLang('en')}
                    className={`min-h-[38px] px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
                      formLang === 'en'
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    <span>English (EN) *</span>
                    {qTextEn && opt1En && <span className="w-2 h-2 rounded-full bg-emerald-400"></span>}
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormLang('rw')}
                    className={`min-h-[38px] px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
                      formLang === 'rw'
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    <span>Kinyarwanda (RW)</span>
                    {qTextRw && opt1Rw ? (
                      <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                    ) : (
                      <span className="text-[10px] font-normal opacity-70">(pending)</span>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormLang('fr')}
                    className={`min-h-[38px] px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
                      formLang === 'fr'
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    <span>Français (FR)</span>
                    {qTextFr && opt1Fr ? (
                      <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                    ) : (
                      <span className="text-[10px] font-normal opacity-70">(pending)</span>
                    )}
                  </button>
                </div>
              </div>

              {/* Language Specific Fields */}
              {formLang === 'en' && (
                <div className="space-y-4 p-4 rounded-xl bg-slate-50 border border-slate-200/80">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase text-slate-700 tracking-wider">English Content (Required)</span>
                    <span className="text-[11px] text-slate-500">Base language</span>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase mb-1.5">Question Prompt (EN) *</label>
                    <textarea
                      rows={2}
                      required
                      value={qTextEn}
                      onChange={(e) => setQTextEn(e.target.value)}
                      className="w-full min-h-[44px] px-4 py-2.5 rounded-[10px] border border-slate-300 text-base sm:text-sm bg-white"
                      placeholder="Enter question text in English..."
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 uppercase mb-1.5">Option A (EN) *</label>
                      <input type="text" required value={opt1En} onChange={(e) => setOpt1En(e.target.value)} className="w-full min-h-[44px] px-3.5 py-2 rounded-[10px] border border-slate-300 text-base sm:text-sm bg-white" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 uppercase mb-1.5">Option B (EN) *</label>
                      <input type="text" required value={opt2En} onChange={(e) => setOpt2En(e.target.value)} className="w-full min-h-[44px] px-3.5 py-2 rounded-[10px] border border-slate-300 text-base sm:text-sm bg-white" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 uppercase mb-1.5">Option C (EN) *</label>
                      <input type="text" required value={opt3En} onChange={(e) => setOpt3En(e.target.value)} className="w-full min-h-[44px] px-3.5 py-2 rounded-[10px] border border-slate-300 text-base sm:text-sm bg-white" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 uppercase mb-1.5">Option D (EN) *</label>
                      <input type="text" required value={opt4En} onChange={(e) => setOpt4En(e.target.value)} className="w-full min-h-[44px] px-3.5 py-2 rounded-[10px] border border-slate-300 text-base sm:text-sm bg-white" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase mb-1.5">Explanation (EN)</label>
                    <textarea
                      rows={2}
                      value={explanationEn}
                      onChange={(e) => setExplanationEn(e.target.value)}
                      className="w-full min-h-[44px] px-4 py-2.5 rounded-[10px] border border-slate-300 text-base sm:text-sm bg-white"
                      placeholder="Rwanda Gazette explanation in English..."
                    />
                  </div>
                </div>
              )}

              {formLang === 'rw' && (
                <div className="space-y-4 p-4 rounded-xl bg-slate-50 border border-slate-200/80">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase text-slate-700 tracking-wider">Kinyarwanda Content</span>
                    <span className="text-[11px] text-slate-500">Falls back to English if empty</span>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase mb-1.5">Question Prompt (RW - Kinyarwanda)</label>
                    <textarea
                      rows={2}
                      value={qTextRw}
                      onChange={(e) => setQTextRw(e.target.value)}
                      className="w-full min-h-[44px] px-4 py-2.5 rounded-[10px] border border-slate-300 text-base sm:text-sm bg-white"
                      placeholder="Andika ikibazo mu Kinyarwanda..."
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 uppercase mb-1.5">Option A (RW)</label>
                      <input type="text" value={opt1Rw} onChange={(e) => setOpt1Rw(e.target.value)} className="w-full min-h-[44px] px-3.5 py-2 rounded-[10px] border border-slate-300 text-base sm:text-sm bg-white" placeholder="Igisubizo A mu Kinyarwanda..." />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 uppercase mb-1.5">Option B (RW)</label>
                      <input type="text" value={opt2Rw} onChange={(e) => setOpt2Rw(e.target.value)} className="w-full min-h-[44px] px-3.5 py-2 rounded-[10px] border border-slate-300 text-base sm:text-sm bg-white" placeholder="Igisubizo B mu Kinyarwanda..." />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 uppercase mb-1.5">Option C (RW)</label>
                      <input type="text" value={opt3Rw} onChange={(e) => setOpt3Rw(e.target.value)} className="w-full min-h-[44px] px-3.5 py-2 rounded-[10px] border border-slate-300 text-base sm:text-sm bg-white" placeholder="Igisubizo C mu Kinyarwanda..." />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 uppercase mb-1.5">Option D (RW)</label>
                      <input type="text" value={opt4Rw} onChange={(e) => setOpt4Rw(e.target.value)} className="w-full min-h-[44px] px-3.5 py-2 rounded-[10px] border border-slate-300 text-base sm:text-sm bg-white" placeholder="Igisubizo D mu Kinyarwanda..." />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase mb-1.5">Explanation (RW)</label>
                    <textarea
                      rows={2}
                      value={explanationRw}
                      onChange={(e) => setExplanationRw(e.target.value)}
                      className="w-full min-h-[44px] px-4 py-2.5 rounded-[10px] border border-slate-300 text-base sm:text-sm bg-white"
                      placeholder="Ibisobanuro by'amategeko mu Kinyarwanda..."
                    />
                  </div>
                </div>
              )}

              {formLang === 'fr' && (
                <div className="space-y-4 p-4 rounded-xl bg-slate-50 border border-slate-200/80">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase text-slate-700 tracking-wider">French Content</span>
                    <span className="text-[11px] text-slate-500">Falls back to English if empty</span>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase mb-1.5">Question Prompt (FR - Français)</label>
                    <textarea
                      rows={2}
                      value={qTextFr}
                      onChange={(e) => setQTextFr(e.target.value)}
                      className="w-full min-h-[44px] px-4 py-2.5 rounded-[10px] border border-slate-300 text-base sm:text-sm bg-white"
                      placeholder="Texte de la question en français..."
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 uppercase mb-1.5">Option A (FR)</label>
                      <input type="text" value={opt1Fr} onChange={(e) => setOpt1Fr(e.target.value)} className="w-full min-h-[44px] px-3.5 py-2 rounded-[10px] border border-slate-300 text-base sm:text-sm bg-white" placeholder="Option A en français..." />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 uppercase mb-1.5">Option B (FR)</label>
                      <input type="text" value={opt2Fr} onChange={(e) => setOpt2Fr(e.target.value)} className="w-full min-h-[44px] px-3.5 py-2 rounded-[10px] border border-slate-300 text-base sm:text-sm bg-white" placeholder="Option B en français..." />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 uppercase mb-1.5">Option C (FR)</label>
                      <input type="text" value={opt3Fr} onChange={(e) => setOpt3Fr(e.target.value)} className="w-full min-h-[44px] px-3.5 py-2 rounded-[10px] border border-slate-300 text-base sm:text-sm bg-white" placeholder="Option C en français..." />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 uppercase mb-1.5">Option D (FR)</label>
                      <input type="text" value={opt4Fr} onChange={(e) => setOpt4Fr(e.target.value)} className="w-full min-h-[44px] px-3.5 py-2 rounded-[10px] border border-slate-300 text-base sm:text-sm bg-white" placeholder="Option D en français..." />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase mb-1.5">Explanation (FR)</label>
                    <textarea
                      rows={2}
                      value={explanationFr}
                      onChange={(e) => setExplanationFr(e.target.value)}
                      className="w-full min-h-[44px] px-4 py-2.5 rounded-[10px] border border-slate-300 text-base sm:text-sm bg-white"
                      placeholder="Explication du code de la route en français..."
                    />
                  </div>
                </div>
              )}

              {/* Media & Publication Settings */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1.5">Question Image (Optional)</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="w-full min-h-[44px] text-base sm:text-sm text-slate-500 file:mr-2 file:py-2 file:px-3 file:rounded-[8px] file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700"
                />
              </div>

              {imageUrl && (
                <div className="flex items-center gap-4 p-3 bg-slate-50 rounded-xl">
                  <img src={imageUrl} alt="Preview" className="w-16 h-16 object-cover rounded-lg border" />
                  <span className="text-xs text-slate-500 font-medium">Image attached successfully</span>
                </div>
              )}

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="qPub"
                  checked={qPublished}
                  onChange={(e) => setQPublished(e.target.checked)}
                  className="w-4 h-4 text-blue-600 rounded border-slate-300"
                />
                <label htmlFor="qPub" className="text-sm font-medium text-slate-700 cursor-pointer">Published</label>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="min-h-[44px] px-4 py-2.5 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-[10px]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="min-h-[44px] px-5 py-2.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-[10px] shadow-sm"
                >
                  Save Question
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={!!questionToDelete}
        title="Delete Question"
        message="Are you sure you want to delete this exam question?"
        confirmText="Delete Question"
        onConfirm={handleDeleteQuestion}
        onClose={() => setQuestionToDelete(null)}
      />
    </div>
  );
};
