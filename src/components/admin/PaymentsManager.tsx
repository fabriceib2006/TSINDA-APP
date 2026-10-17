import React, { useEffect, useState, useMemo } from 'react';
import { db, functions } from '../../lib/firebase';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { Payment } from '../../types';
import {
  CreditCard,
  CheckCircle2,
  XCircle,
  Clock,
  Filter,
  RefreshCw,
  Search,
  Calendar,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  AlertTriangle,
  Smartphone,
  ShieldCheck,
  Check,
  X,
  Eye,
  Copy,
  ExternalLink
} from 'lucide-react';

interface TestResult {
  secrets: {
    passed: boolean;
    clientIdPresent: boolean;
    clientSecretPresent: boolean;
    webhookSecretPresent: boolean;
    message: string;
  };
  auth: {
    passed: boolean;
    message: string;
  };
  transactionsRead: {
    passed: boolean;
    message: string;
  };
  webhookReachability: {
    passed: boolean;
    message: string;
  };
  allPassed: boolean;
}

export const PaymentsManager: React.FC = () => {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [networkFilter, setNetworkFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [syncing, setSyncing] = useState(false);
  const [syncFeedback, setSyncFeedback] = useState<string | null>(null);

  // Selected payment for details modal
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null);
  const [copiedRef, setCopiedRef] = useState(false);

  // Test connection modal / state
  const [testingConnection, setTestingConnection] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [showTestModal, setShowTestModal] = useState(false);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Real-time listener for payments
  useEffect(() => {
    setLoading(true);
    const q = query(collection(db, 'payments'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((d) => {
          const data = d.data();
          let createdAtStr = '';
          if (data.createdAt?.toDate) {
            createdAtStr = data.createdAt.toDate().toISOString();
          } else if (typeof data.createdAt === 'string') {
            createdAtStr = data.createdAt;
          } else {
            createdAtStr = new Date().toISOString();
          }

          return {
            id: d.id,
            paypackRef: data.paypackRef || data.reference || d.id,
            userId: data.userId || '',
            userName: data.userName || data.userEmail || '',
            userEmail: data.userEmail || '',
            planId: data.planId || '',
            planName: data.planName || 'Pass',
            amount: Number(data.amount || 0),
            phone: data.phone || '',
            network: data.network || 'MTN',
            kind: data.kind || 'cashin',
            status: data.status || 'pending',
            failureReason: data.failureReason || null,
            subscriptionId: data.subscriptionId || null,
            reference: data.reference || data.paypackRef || d.id,
            createdAt: createdAtStr,
            updatedAt: data.updatedAt,
          } as Payment;
        });

        setPayments(list);
        setLoading(false);
      },
      (err) => {
        console.error('Error listening to payments:', err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  // Summary statistics
  const stats = useMemo(() => {
    let successfulRevenue = 0;
    let successfulCount = 0;
    let pendingCount = 0;
    let failedCount = 0;

    payments.forEach((p) => {
      if (p.status === 'successful' || p.status === 'success') {
        successfulRevenue += p.amount || 0;
        successfulCount++;
      } else if (p.status === 'pending') {
        pendingCount++;
      } else if (p.status === 'failed') {
        failedCount++;
      }
    });

    return {
      successfulRevenue,
      successfulCount,
      pendingCount,
      failedCount,
      totalCount: payments.length,
    };
  }, [payments]);

  // Sync with Paypack
  const handleSyncPaypack = async () => {
    setSyncing(true);
    setSyncFeedback(null);
    try {
      // Try local full-stack server route first
      const serverRes = await fetch('/api/paypack/sync', { method: 'POST' }).catch(() => null);
      if (serverRes && serverRes.ok) {
        const data = await serverRes.json();
        setSyncFeedback(`Sync complete: ${data.updatedCount} payment(s) updated out of ${data.totalFetched} fetched.`);
        setTimeout(() => setSyncFeedback(null), 5000);
        return;
      }

      // Fallback to Cloud Function callable
      const syncFn = httpsCallable<void, { success: boolean; totalFetched: number; updatedCount: number }>(
        functions,
        'syncPaypack'
      );
      const res = await syncFn();
      setSyncFeedback(`Sync complete: ${res.data.updatedCount} payment(s) updated out of ${res.data.totalFetched} fetched.`);
      setTimeout(() => setSyncFeedback(null), 5000);
    } catch (err: any) {
      console.error('Sync error:', err);
      setSyncFeedback(`Sync failed: ${err.message || 'Error communicating with Paypack'}`);
      setTimeout(() => setSyncFeedback(null), 6000);
    } finally {
      setSyncing(false);
    }
  };

  // Test Paypack Connection
  const handleTestConnection = async () => {
    setTestingConnection(true);
    setShowTestModal(true);
    setTestResult(null);

    try {
      // Try local server route first
      const serverRes = await fetch('/api/paypack/test-connection', { method: 'POST' }).catch(() => null);
      if (serverRes && serverRes.ok) {
        const data: TestResult = await serverRes.json();
        setTestResult(data);
        return;
      }

      // Fallback to Cloud Function callable
      const testFn = httpsCallable<void, TestResult>(functions, 'testPaypackConnection');
      const res = await testFn();
      setTestResult(res.data);
    } catch (err: any) {
      console.error('Error testing connection:', err);
      setTestResult({
        secrets: {
          passed: false,
          clientIdPresent: false,
          clientSecretPresent: false,
          webhookSecretPresent: false,
          message: err.message || 'Failed to call connection test function.',
        },
        auth: { passed: false, message: 'Could not execute authentication check.' },
        transactionsRead: { passed: false, message: 'Could not test transactions endpoint.' },
        webhookReachability: { passed: false, message: 'Could not test webhook reachability.' },
        allPassed: false,
      });
    } finally {
      setTestingConnection(false);
    }
  };

  // Filtered payments
  const filteredPayments = useMemo(() => {
    return payments.filter((p) => {
      // Status filter
      if (statusFilter !== 'all') {
        if (statusFilter === 'successful' && p.status !== 'successful' && p.status !== 'success') {
          return false;
        }
        if (statusFilter === 'pending' && p.status !== 'pending') return false;
        if (statusFilter === 'failed' && p.status !== 'failed') return false;
      }

      // Network filter
      if (networkFilter !== 'all') {
        const net = (p.network || '').toUpperCase();
        if (networkFilter.toUpperCase() !== net) return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesRef = (p.paypackRef || '').toLowerCase().includes(q);
        const matchesUser = (p.userName || '').toLowerCase().includes(q);
        const matchesEmail = (p.userEmail || '').toLowerCase().includes(q);
        const matchesPhone = (p.phone || '').toLowerCase().includes(q);
        const matchesPlan = (p.planName || '').toLowerCase().includes(q);
        if (!matchesRef && !matchesUser && !matchesEmail && !matchesPhone && !matchesPlan) {
          return false;
        }
      }

      // Date range filter
      if (startDate) {
        const pDate = new Date(p.createdAt);
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        if (pDate < start) return false;
      }
      if (endDate) {
        const pDate = new Date(p.createdAt);
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        if (pDate > end) return false;
      }

      return true;
    });
  }, [payments, statusFilter, networkFilter, searchQuery, startDate, endDate]);

  const isAnyFilterActive =
    statusFilter !== 'all' ||
    networkFilter !== 'all' ||
    searchQuery.trim() !== '' ||
    startDate !== '' ||
    endDate !== '';

  const handleResetFilters = () => {
    setStatusFilter('all');
    setNetworkFilter('all');
    setSearchQuery('');
    setStartDate('');
    setEndDate('');
    setCurrentPage(1);
  };

  // Pagination calculation
  const totalPages = Math.max(1, Math.ceil(filteredPayments.length / itemsPerPage));
  const paginatedPayments = useMemo(() => {
    const startIdx = (currentPage - 1) * itemsPerPage;
    return filteredPayments.slice(startIdx, startIdx + itemsPerPage);
  }, [filteredPayments, currentPage, itemsPerPage]);

  const formatDateTime = (isoString: string) => {
    try {
      const d = new Date(isoString);
      return d.toLocaleString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return isoString;
    }
  };

  const handleCopyRef = (refText?: string) => {
    if (!refText) return;
    navigator.clipboard.writeText(refText);
    setCopiedRef(true);
    setTimeout(() => setCopiedRef(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Header and Actions (Fully Responsive) */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">Payments & Transactions</h2>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Real-time mirror of Paypack mobile money transactions.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 w-full md:w-auto">
          <button
            onClick={handleTestConnection}
            disabled={testingConnection}
            className="min-h-[44px] flex items-center justify-center gap-2 px-4 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-semibold rounded-xl text-xs sm:text-sm shadow-2xs transition-colors shrink-0"
          >
            <ShieldCheck className="w-4 h-4 text-blue-600" />
            <span>Test Paypack Connection</span>
          </button>

          <button
            onClick={handleSyncPaypack}
            disabled={syncing}
            className="min-h-[44px] flex items-center justify-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-xl text-xs sm:text-sm shadow-sm transition-colors shrink-0"
          >
            <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
            <span>{syncing ? 'Syncing...' : 'Sync with Paypack'}</span>
          </button>
        </div>
      </div>

      {syncFeedback && (
        <div className="p-3.5 bg-blue-50 border border-blue-200 text-blue-800 rounded-xl text-xs sm:text-sm font-semibold flex items-center gap-2.5 shadow-2xs animate-in fade-in">
          <RefreshCw className="w-4 h-4 text-blue-600 shrink-0" />
          <span>{syncFeedback}</span>
        </div>
      )}

      {/* Summary Cards (Fluid Grid: 1 col on mobile, 2 on tablet, 3 on desktop) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-2">
          <div className="flex justify-between items-center text-slate-500 text-[11px] font-bold uppercase tracking-wider">
            <span>Successful Revenue</span>
            <div className="w-8 h-8 bg-emerald-50 text-emerald-600 rounded-lg flex items-center justify-center shrink-0">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight truncate">
            RWF {stats.successfulRevenue.toLocaleString()}
          </div>
          <div className="text-xs text-emerald-600 font-semibold flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>{stats.successfulCount} payments confirmed</span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-2">
          <div className="flex justify-between items-center text-slate-500 text-[11px] font-bold uppercase tracking-wider">
            <span>Pending Payments</span>
            <div className="w-8 h-8 bg-amber-50 text-amber-600 rounded-lg flex items-center justify-center shrink-0">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight truncate">
            {stats.pendingCount}
          </div>
          <div className="text-xs text-amber-600 font-semibold flex items-center gap-1">
            <Clock className="w-3.5 h-3.5" />
            <span>Awaiting USSD PIN or settlement</span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-2 sm:col-span-2 lg:col-span-1">
          <div className="flex justify-between items-center text-slate-500 text-[11px] font-bold uppercase tracking-wider">
            <span>Failed Payments</span>
            <div className="w-8 h-8 bg-red-50 text-red-600 rounded-lg flex items-center justify-center shrink-0">
              <XCircle className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight truncate">
            {stats.failedCount}
          </div>
          <div className="text-xs text-slate-400 font-semibold flex items-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>Declined, timeout, or cancelled</span>
          </div>
        </div>
      </div>

      {/* Filters and Search Bar (Responsive 12-Column Layout to Prevent Overflow) */}
      <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3">
          
          {/* Search Box: 4 cols on desktop, full width on mobile/tablet */}
          <div className="relative min-h-[44px] sm:col-span-2 lg:col-span-4">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="Search Paypack ref, phone, student..."
              className="w-full min-h-[44px] pl-10 pr-8 py-2.5 bg-slate-50 rounded-xl border border-slate-200 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 transition-colors"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-3.5 text-slate-400 hover:text-slate-600 p-0.5"
                title="Clear search"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Status Filter: 2 cols on desktop, 1 col on tablet */}
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 min-h-[44px] sm:col-span-1 lg:col-span-2">
            <Filter className="w-4 h-4 text-slate-400 shrink-0" />
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider shrink-0">Status:</span>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full bg-transparent text-xs sm:text-sm font-semibold text-slate-900 focus:outline-none cursor-pointer"
            >
              <option value="all">All</option>
              <option value="successful">Successful</option>
              <option value="pending">Pending</option>
              <option value="failed">Failed</option>
            </select>
          </div>

          {/* Network Filter: 2 cols on desktop, 1 col on tablet */}
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 min-h-[44px] sm:col-span-1 lg:col-span-2">
            <Smartphone className="w-4 h-4 text-slate-400 shrink-0" />
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider shrink-0">Net:</span>
            <select
              value={networkFilter}
              onChange={(e) => {
                setNetworkFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full bg-transparent text-xs sm:text-sm font-semibold text-slate-900 focus:outline-none cursor-pointer"
            >
              <option value="all">All Networks</option>
              <option value="MTN">MTN MoMo</option>
              <option value="Airtel">Airtel Money</option>
            </select>
          </div>

          {/* Date Range Inputs: 4 cols on desktop, full width on tablet with generous spacing */}
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 min-h-[44px] sm:col-span-2 lg:col-span-4">
            <Calendar className="w-4 h-4 text-slate-400 shrink-0 hidden sm:block" />
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                setCurrentPage(1);
              }}
              aria-label="Filter from date"
              className="w-full min-w-0 bg-transparent text-xs text-slate-800 font-medium focus:outline-none cursor-pointer"
            />
            <span className="text-slate-400 text-xs font-semibold px-0.5 shrink-0">to</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                setCurrentPage(1);
              }}
              aria-label="Filter to date"
              className="w-full min-w-0 bg-transparent text-xs text-slate-800 font-medium focus:outline-none cursor-pointer"
            />
            {(startDate || endDate) && (
              <button
                onClick={() => {
                  setStartDate('');
                  setEndDate('');
                }}
                className="text-slate-400 hover:text-slate-600 p-0.5 shrink-0"
                title="Clear date filter"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Active Filters Pill Bar & 1-Click Reset */}
        {isAnyFilterActive && (
          <div className="pt-2.5 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex flex-wrap items-center gap-1.5 text-slate-500">
              <span className="font-bold text-slate-700">Active filters:</span>
              {statusFilter !== 'all' && (
                <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded-md font-semibold text-[11px] capitalize">
                  Status: {statusFilter}
                </span>
              )}
              {networkFilter !== 'all' && (
                <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded-md font-semibold text-[11px]">
                  Net: {networkFilter}
                </span>
              )}
              {searchQuery && (
                <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded-md font-semibold text-[11px] max-w-[150px] truncate">
                  "{searchQuery}"
                </span>
              )}
              {(startDate || endDate) && (
                <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded-md font-semibold text-[11px]">
                  {startDate || 'Any'} → {endDate || 'Any'}
                </span>
              )}
              <span className="text-slate-400 ml-1">({filteredPayments.length} results)</span>
            </div>

            <button
              onClick={handleResetFilters}
              className="text-blue-600 hover:text-blue-800 font-bold text-xs hover:underline cursor-pointer"
            >
              Reset all filters
            </button>
          </div>
        )}
      </div>

      {/* Table (Desktop & Tablet >= 768px) / Cards (Mobile < 768px) */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        {loading ? (
          <div className="p-8 space-y-4">
            <div className="h-6 bg-slate-100 rounded w-48 animate-pulse"></div>
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-12 bg-slate-50 rounded-lg animate-pulse"></div>
            ))}
          </div>
        ) : filteredPayments.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <div className="w-12 h-12 bg-slate-100 text-slate-400 rounded-xl flex items-center justify-center mx-auto">
              <CreditCard className="w-6 h-6" />
            </div>
            <h3 className="font-bold text-slate-900 text-base">No payment transactions found</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              No transactions match the selected filters or search terms.
            </p>
            {isAnyFilterActive && (
              <button
                onClick={handleResetFilters}
                className="mt-2 min-h-[40px] px-4 py-2 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-xl text-xs font-bold transition-colors inline-flex items-center gap-1.5"
              >
                <span>Reset Filters</span>
              </button>
            )}
          </div>
        ) : (
          <>
            {/* Tablet & Desktop Table View (>= 768px with horizontal scrolling if needed) */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[760px]">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    <th className="py-3 px-4">Date & Time</th>
                    <th className="py-3 px-4">Paypack Ref</th>
                    <th className="py-3 px-4">Student</th>
                    <th className="py-3 px-4">Phone / Net</th>
                    <th className="py-3 px-4">Plan</th>
                    <th className="py-3 px-4">Amount</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {paginatedPayments.map((p) => {
                    const isSuccess = p.status === 'successful' || p.status === 'success';
                    const isPending = p.status === 'pending';
                    const isFailed = p.status === 'failed';

                    return (
                      <tr 
                        key={p.id} 
                        onClick={() => setSelectedPayment(p)}
                        className="hover:bg-slate-50/70 transition-colors cursor-pointer group"
                      >
                        <td className="py-3.5 px-4 text-slate-600 whitespace-nowrap">
                          {formatDateTime(p.createdAt)}
                        </td>
                        <td className="py-3.5 px-4 font-mono font-semibold text-slate-900 whitespace-nowrap">
                          <span title={p.paypackRef} className="group-hover:text-blue-600 transition-colors">
                            {p.paypackRef ? (p.paypackRef.length > 14 ? `${p.paypackRef.slice(0, 14)}...` : p.paypackRef) : '—'}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 max-w-[160px]">
                          <div className="font-bold text-slate-900 truncate">{p.userName || 'Learner'}</div>
                          {p.userEmail && <div className="text-[10px] text-slate-400 truncate">{p.userEmail}</div>}
                        </td>
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <div className="text-slate-800 font-mono text-[11px]">{p.phone || '-'}</div>
                          <span className={`inline-block px-1.5 py-0.5 text-[9px] font-bold rounded mt-0.5 ${
                            p.network === 'MTN' ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-800'
                          }`}>
                            {p.network || 'MoMo'}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-slate-700 font-medium">
                          {p.planName || 'Pass'}
                        </td>
                        <td className="py-3.5 px-4 font-extrabold text-slate-900 whitespace-nowrap">
                          RWF {p.amount?.toLocaleString()}
                        </td>
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold ${
                            isSuccess ? 'bg-emerald-50 text-emerald-700' :
                            isPending ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-700'
                          }`}>
                            {isSuccess && <CheckCircle2 className="w-3 h-3" />}
                            {isPending && <Clock className="w-3 h-3" />}
                            {isFailed && <XCircle className="w-3 h-3" />}
                            <span className="capitalize">{p.status}</span>
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-right whitespace-nowrap">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedPayment(p);
                            }}
                            className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            title="View Transaction Details"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards View (< 768px) */}
            <div className="block md:hidden divide-y divide-slate-100">
              {paginatedPayments.map((p) => {
                const isSuccess = p.status === 'successful' || p.status === 'success';
                const isPending = p.status === 'pending';
                const isFailed = p.status === 'failed';

                return (
                  <div 
                    key={p.id} 
                    onClick={() => setSelectedPayment(p)}
                    className="p-4 space-y-3 cursor-pointer hover:bg-slate-50/60 transition-colors"
                  >
                    <div className="flex justify-between items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="font-bold text-slate-900 text-sm truncate">
                          {p.userName || 'Learner'}
                        </div>
                        <div className="text-[11px] text-slate-500">{formatDateTime(p.createdAt)}</div>
                      </div>

                      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold shrink-0 ${
                        isSuccess ? 'bg-emerald-50 text-emerald-700' :
                        isPending ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-700'
                      }`}>
                        {isSuccess && <CheckCircle2 className="w-3 h-3" />}
                        {isPending && <Clock className="w-3 h-3" />}
                        {isFailed && <XCircle className="w-3 h-3" />}
                        <span className="capitalize">{p.status}</span>
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-slate-400 block text-[10px] uppercase font-bold">Amount & Plan</span>
                        <span className="font-extrabold text-slate-900">RWF {p.amount?.toLocaleString()}</span>
                        <span className="text-slate-500 block text-[11px] truncate">{p.planName}</span>
                      </div>

                      <div>
                        <span className="text-slate-400 block text-[10px] uppercase font-bold">Phone / Net</span>
                        <span className="font-mono text-slate-800 text-[11px]">{p.phone || '—'}</span>
                        <span className={`inline-block ml-1 px-1.5 py-0.2 rounded text-[10px] font-bold ${
                          p.network === 'MTN' ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-800'
                        }`}>
                          {p.network}
                        </span>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] font-mono text-slate-500">
                      <div className="truncate max-w-[200px]">
                        <span className="text-[10px] text-slate-400">Ref: </span>
                        <span>{p.paypackRef}</span>
                      </div>
                      <span className="text-blue-600 font-semibold text-xs flex items-center gap-0.5">
                        Details <ChevronRight className="w-3.5 h-3.5" />
                      </span>
                    </div>

                    {isFailed && p.failureReason && (
                      <div className="p-2 bg-red-50 text-red-700 text-xs rounded-lg border border-red-100 font-medium">
                        Reason: {p.failureReason}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Pagination Controls */}
            <div className="p-4 bg-slate-50/70 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3">
              <span className="text-xs text-slate-500">
                Showing {Math.min(filteredPayments.length, (currentPage - 1) * itemsPerPage + 1)} to{' '}
                {Math.min(filteredPayments.length, currentPage * itemsPerPage)} of {filteredPayments.length} transactions
              </span>

              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-40 transition-colors shadow-2xs"
                  aria-label="Previous page"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-xs font-bold px-2 text-slate-700">
                  {currentPage} / {totalPages}
                </span>
                <button
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-40 transition-colors shadow-2xs"
                  aria-label="Next page"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Transaction Details Modal */}
      {selectedPayment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
          <div className="w-full max-w-lg bg-white rounded-2xl shadow-xl border border-slate-200 p-6 sm:p-7 space-y-5 my-8 animate-in fade-in zoom-in-95">
            <div className="flex justify-between items-start border-b border-slate-100 pb-4">
              <div>
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Transaction Record</span>
                <h3 className="text-lg font-extrabold text-slate-900">Payment Details</h3>
              </div>
              <button
                onClick={() => setSelectedPayment(null)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs sm:text-sm">
              {/* Status Banner */}
              <div className={`p-3.5 rounded-xl border flex items-center justify-between ${
                selectedPayment.status === 'successful' || selectedPayment.status === 'success'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : selectedPayment.status === 'pending'
                  ? 'bg-amber-50 border-amber-200 text-amber-900'
                  : 'bg-red-50 border-red-200 text-red-900'
              }`}>
                <div className="flex items-center gap-2 font-bold capitalize">
                  {selectedPayment.status === 'successful' || selectedPayment.status === 'success' ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                  ) : selectedPayment.status === 'pending' ? (
                    <Clock className="w-5 h-5 text-amber-600" />
                  ) : (
                    <XCircle className="w-5 h-5 text-red-600" />
                  )}
                  <span>Status: {selectedPayment.status}</span>
                </div>
                <span className="text-lg font-black font-mono">
                  RWF {selectedPayment.amount?.toLocaleString()}
                </span>
              </div>

              {/* Data Grid */}
              <div className="bg-slate-50 rounded-xl p-4 space-y-3 border border-slate-200/80">
                <div className="flex justify-between items-center py-1 border-b border-slate-200/60">
                  <span className="text-slate-500 font-semibold">Paypack Reference:</span>
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono font-bold text-slate-800 text-xs">
                      {selectedPayment.paypackRef}
                    </span>
                    <button
                      onClick={() => handleCopyRef(selectedPayment.paypackRef)}
                      className="p-1 text-slate-400 hover:text-blue-600"
                      title="Copy reference"
                    >
                      {copiedRef ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                <div className="flex justify-between items-center py-1 border-b border-slate-200/60">
                  <span className="text-slate-500 font-semibold">Date & Time:</span>
                  <span className="font-medium text-slate-800">{formatDateTime(selectedPayment.createdAt)}</span>
                </div>

                <div className="flex justify-between items-center py-1 border-b border-slate-200/60">
                  <span className="text-slate-500 font-semibold">Student Name:</span>
                  <span className="font-bold text-slate-900">{selectedPayment.userName || 'Learner'}</span>
                </div>

                {selectedPayment.userEmail && (
                  <div className="flex justify-between items-center py-1 border-b border-slate-200/60">
                    <span className="text-slate-500 font-semibold">Student Email:</span>
                    <span className="font-medium text-slate-700">{selectedPayment.userEmail}</span>
                  </div>
                )}

                <div className="flex justify-between items-center py-1 border-b border-slate-200/60">
                  <span className="text-slate-500 font-semibold">Phone / MoMo:</span>
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono font-bold text-slate-800">{selectedPayment.phone || '—'}</span>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                      selectedPayment.network === 'MTN' ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-800'
                    }`}>
                      {selectedPayment.network}
                    </span>
                  </div>
                </div>

                <div className="flex justify-between items-center py-1 border-b border-slate-200/60">
                  <span className="text-slate-500 font-semibold">Subscription Plan:</span>
                  <span className="font-bold text-blue-700">{selectedPayment.planName}</span>
                </div>

                {selectedPayment.subscriptionId && (
                  <div className="flex justify-between items-center py-1">
                    <span className="text-slate-500 font-semibold">Linked Subscription:</span>
                    <span className="font-mono text-xs font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
                      #{selectedPayment.subscriptionId}
                    </span>
                  </div>
                )}

                {selectedPayment.failureReason && (
                  <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-xs space-y-1">
                    <span className="font-bold block">Paypack Failure Reason:</span>
                    <p className="font-medium">{selectedPayment.failureReason}</p>
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setSelectedPayment(null)}
                className="min-h-[44px] px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-xl text-xs sm:text-sm transition-colors"
              >
                Close Details
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Test Paypack Connection Modal */}
      {showTestModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
          <div className="w-full max-w-lg bg-white rounded-2xl shadow-xl border border-slate-200 p-6 sm:p-7 space-y-5 my-8">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <ShieldCheck className="w-6 h-6 text-blue-600" />
                <h3 className="font-bold text-slate-900 text-lg">Paypack Connection Test</h3>
              </div>
              <button
                onClick={() => setShowTestModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-md"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {testingConnection ? (
              <div className="py-8 text-center space-y-3">
                <RefreshCw className="w-8 h-8 text-blue-600 animate-spin mx-auto" />
                <p className="text-sm font-semibold text-slate-700">Verifying Paypack configuration...</p>
                <p className="text-xs text-slate-500">Checking Secret Manager, OAuth token, and endpoint reachability.</p>
              </div>
            ) : testResult ? (
              <div className="space-y-4">
                <div className="space-y-2.5">
                  {/* Secrets Check */}
                  <div className={`p-3.5 rounded-xl border text-xs flex items-start gap-2.5 ${
                    testResult.secrets.passed ? 'bg-emerald-50/70 border-emerald-200 text-emerald-900' : 'bg-red-50/70 border-red-200 text-red-900'
                  }`}>
                    {testResult.secrets.passed ? <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" /> : <X className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />}
                    <div>
                      <div className="font-bold">1. Secret Manager Credentials</div>
                      <div className="text-[11px] mt-0.5">{testResult.secrets.message}</div>
                      <div className="flex flex-wrap gap-2 mt-1.5 font-mono text-[10px]">
                        <span>CLIENT_ID: {testResult.secrets.clientIdPresent ? '✓ Present' : '✗ Missing'}</span>
                        <span>CLIENT_SECRET: {testResult.secrets.clientSecretPresent ? '✓ Present' : '✗ Missing'}</span>
                        <span>WEBHOOK_SECRET: {testResult.secrets.webhookSecretPresent ? '✓ Present' : '✗ Missing'}</span>
                      </div>
                    </div>
                  </div>

                  {/* Auth Check */}
                  <div className={`p-3.5 rounded-xl border text-xs flex items-start gap-2.5 ${
                    testResult.auth.passed ? 'bg-emerald-50/70 border-emerald-200 text-emerald-900' : 'bg-red-50/70 border-red-200 text-red-900'
                  }`}>
                    {testResult.auth.passed ? <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" /> : <X className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />}
                    <div>
                      <div className="font-bold">2. Paypack Authentication</div>
                      <div className="text-[11px] mt-0.5">{testResult.auth.message}</div>
                    </div>
                  </div>

                  {/* Read Transactions Check */}
                  <div className={`p-3.5 rounded-xl border text-xs flex items-start gap-2.5 ${
                    testResult.transactionsRead.passed ? 'bg-emerald-50/70 border-emerald-200 text-emerald-900' : 'bg-red-50/70 border-red-200 text-red-900'
                  }`}>
                    {testResult.transactionsRead.passed ? <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" /> : <X className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />}
                    <div>
                      <div className="font-bold">3. Read Transactions Endpoint</div>
                      <div className="text-[11px] mt-0.5">{testResult.transactionsRead.message}</div>
                    </div>
                  </div>

                  {/* Webhook Reachability Check */}
                  <div className={`p-3.5 rounded-xl border text-xs flex items-start gap-2.5 ${
                    testResult.webhookReachability.passed ? 'bg-emerald-50/70 border-emerald-200 text-emerald-900' : 'bg-red-50/70 border-red-200 text-red-900'
                  }`}>
                    {testResult.webhookReachability.passed ? <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" /> : <X className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />}
                    <div>
                      <div className="font-bold">4. Webhook URL Reachability</div>
                      <div className="text-[11px] mt-0.5">{testResult.webhookReachability.message}</div>
                    </div>
                  </div>
                </div>

                <div className="pt-2 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-t border-slate-100">
                  <span className={`text-xs font-bold ${testResult.allPassed ? 'text-emerald-600' : 'text-amber-600'}`}>
                    {testResult.allPassed ? 'All checks passed successfully.' : 'Configuration requires attention.'}
                  </span>
                  <button
                    onClick={() => setShowTestModal(false)}
                    className="min-h-[40px] px-5 py-2 bg-slate-900 text-white rounded-xl text-xs font-semibold hover:bg-slate-800 transition-colors"
                  >
                    Close
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
};
