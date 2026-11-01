'use client';

import React, { useState, useMemo } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  BarChart,
  AreaChart,
  Area,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
} from 'recharts';
import {
  Download,
  FileSpreadsheet,
  TrendingUp,
  Users,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  Calendar,
  Percent,
  Award,
  Wallet,
} from 'lucide-react';
import { formatEtb } from '@/src/lib/bingo-engine';

export interface DailyRevenuePoint {
  date: string;
  label: string;
  approvedDepositsMinor: number;
  pendingDepositsMinor?: number;
  rejectedDepositsMinor?: number;
  depositsCount?: number;
  approvedWithdrawalsMinor: number;
  pendingWithdrawalsMinor?: number;
  rejectedWithdrawalsMinor?: number;
  withdrawalsCount?: number;
  netDepositsMinor: number;
  roundPayoutsMinor: number;
  totalPayoutsMinor: number;
  houseFeeMinor: number;
  netRevenueMinor?: number;
  totalPotMinor?: number;
  gamesPlayedCount?: number;
  ticketSalesMinor: number;
  ticketsCount: number;
  playersWonMinor?: number;
  playersWonCount?: number;
  playersLostMinor?: number;
  playersLostCount?: number;
  activePlayersCount: number;
  approvedDepositsBirr: number;
  approvedWithdrawalsBirr: number;
  netDepositsBirr: number;
  roundPayoutsBirr: number;
  totalPayoutsBirr: number;
  houseFeeBirr: number;
  netRevenueBirr?: number;
  totalPotBirr?: number;
  ticketSalesBirr: number;
  playersWonBirr?: number;
  playersLostBirr?: number;
}

export interface PlayerDailyWinLossItem {
  date: string;
  userId: number;
  username: string;
  phone: string;
  gamesPlayedCount: number;
  ticketsCount: number;
  winsCount: number;
  lossesCount: number;
  totalStakedMinor: number;
  wonMinor: number;
  lostMinor: number;
  netWinLossMinor: number;
  approvedDepositsMinor: number;
  approvedWithdrawalsMinor: number;
  currentBalanceMinor: number;
}

export interface RevenueSummary30d {
  approvedDepositsMinor: number;
  approvedWithdrawalsMinor: number;
  netDepositsMinor: number;
  roundPayoutsMinor: number;
  totalPayoutsMinor: number;
  houseFeeMinor: number;
  gamesPlayedCount?: number;
  totalPotMinor?: number;
  ticketsCount: number;
  playersWonMinor?: number;
  playersLostMinor?: number;
  peakDailyActivePlayers: number;
}

interface AdminRevenueDashboardProps {
  timeline: DailyRevenuePoint[];
  summary?: RevenueSummary30d;
  serverTimeUtc?: string;
  houseCommissionPercent?: number;
  playerDailyWinLossLogs?: PlayerDailyWinLossItem[];
  playerGameHistoryLogs?: any[];
  allPlayers?: any[];
}

type DateFilterPreset = 'TODAY' | 'YESTERDAY' | '7D' | '14D' | '30D' | 'CUSTOM';
type ChartMode = 'combined' | 'cashflow' | 'players';

function computeGrowthMetric(todayVal: number, yesterdayVal: number) {
  const delta = todayVal - yesterdayVal;
  let pctText = '0.0%';
  if (yesterdayVal === 0) {
    if (todayVal > 0) pctText = '+100.0%';
    else if (todayVal < 0) pctText = '-100.0%';
  } else {
    const pct = (delta / Math.abs(yesterdayVal)) * 100;
    const sign = pct > 0 ? '+' : '';
    pctText = `${sign}${pct.toFixed(1)}%`;
  }
  const direction: 'up' | 'down' | 'flat' = delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat';
  return { delta, pctText, direction };
}

export default function AdminRevenueDashboard({
  timeline,
  summary,
  serverTimeUtc,
  houseCommissionPercent = 20,
  playerDailyWinLossLogs = [],
  playerGameHistoryLogs = [],
  allPlayers = [],
}: AdminRevenueDashboardProps) {
  const [dateFilter, setDateFilter] = useState<DateFilterPreset>('30D');
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');
  const [chartMode, setChartMode] = useState<ChartMode>('combined');
  const [showDailyTable, setShowDailyTable] = useState(true);
  const [showPlayersWinLossTable, setShowPlayersWinLossTable] = useState(true);
  const [playerReportViewMode, setPlayerReportViewMode] = useState<'ALL_PLAYERS_SUMMARY' | 'DAILY_BY_DATE'>('ALL_PLAYERS_SUMMARY');
  const [playerFilterSearch, setPlayerFilterSearch] = useState('');

  const fullList = useMemo(() => (Array.isArray(timeline) ? timeline : []), [timeline]);

  const todayPoint = fullList.length >= 1 ? fullList[fullList.length - 1] : null;
  const yesterdayPoint = fullList.length >= 2 ? fullList[fullList.length - 2] : null;

  const filteredData = useMemo(() => {
    if (!fullList.length) return [];
    if (dateFilter === 'TODAY') {
      return todayPoint ? [todayPoint] : fullList.slice(-1);
    }
    if (dateFilter === 'YESTERDAY') {
      return yesterdayPoint ? [yesterdayPoint] : fullList.slice(-2, -1);
    }
    if (dateFilter === '7D') {
      return fullList.slice(-7);
    }
    if (dateFilter === '14D') {
      return fullList.slice(-14);
    }
    if (dateFilter === '30D') {
      return fullList.slice(-30);
    }
    if (dateFilter === 'CUSTOM') {
      return fullList.filter((item) => {
        if (customStartDate && item.date < customStartDate) return false;
        if (customEndDate && item.date > customEndDate) return false;
        return true;
      });
    }
    return fullList.slice(-30);
  }, [fullList, dateFilter, customStartDate, customEndDate, todayPoint, yesterdayPoint]);

  const filteredDateSet = useMemo(
    () => new Set(filteredData.map((d) => d.date)),
    [filteredData]
  );

  // Filter daily per-player win/loss rows to match the selected Date Range
  const filteredPlayerDailyLogs = useMemo(() => {
    const list = Array.isArray(playerDailyWinLossLogs) ? playerDailyWinLossLogs : [];
    const byDate = list.filter((row) => filteredDateSet.has(row.date));
    const q = playerFilterSearch.trim().toLowerCase();
    if (!q) return byDate;
    return byDate.filter(
      (r) =>
        String(r.username || '').toLowerCase().includes(q) ||
        String(r.phone || '').toLowerCase().includes(q) ||
        String(r.date || '').includes(q)
    );
  }, [playerDailyWinLossLogs, filteredDateSet, playerFilterSearch]);

  // Aggregate Wins ("የበሉት") and Losses ("የተበሉት") for ALL players across the selected Date Range
  const allPlayersSummaryList = useMemo(() => {
    const map = new Map<
      number,
      {
        userId: number;
        username: string;
        phone: string;
        gamesPlayedCount: number;
        ticketsCount: number;
        winsCount: number;
        lossesCount: number;
        totalStakedMinor: number;
        wonMinor: number;
        lostMinor: number;
        netWinLossMinor: number;
        approvedDepositsMinor: number;
        approvedWithdrawalsMinor: number;
        currentBalanceMinor: number;
        activeDaysCount: number;
        createdAt?: string;
        lastActiveAt?: string;
      }
    >();

    // Seed with all registered players so every player is included in the report
    for (const p of Array.isArray(allPlayers) ? allPlayers : []) {
      map.set(p.id, {
        userId: p.id,
        username: p.username || `Player #${p.id}`,
        phone: p.phone || '-',
        gamesPlayedCount: 0,
        ticketsCount: 0,
        winsCount: 0,
        lossesCount: 0,
        totalStakedMinor: 0,
        wonMinor: 0,
        lostMinor: 0,
        netWinLossMinor: 0,
        approvedDepositsMinor: 0,
        approvedWithdrawalsMinor: 0,
        currentBalanceMinor: p.balanceMinor || 0,
        activeDaysCount: 0,
        createdAt: p.createdAt || '',
        lastActiveAt: p.lastActiveAt || '',
      });
    }

    const list = Array.isArray(playerDailyWinLossLogs) ? playerDailyWinLossLogs : [];
    for (const row of list) {
      if (!filteredDateSet.has(row.date)) continue;
      let entry = map.get(row.userId);
      if (!entry) {
        entry = {
          userId: row.userId,
          username: row.username,
          phone: row.phone || '-',
          gamesPlayedCount: 0,
          ticketsCount: 0,
          winsCount: 0,
          lossesCount: 0,
          totalStakedMinor: 0,
          wonMinor: 0,
          lostMinor: 0,
          netWinLossMinor: 0,
          approvedDepositsMinor: 0,
          approvedWithdrawalsMinor: 0,
          currentBalanceMinor: row.currentBalanceMinor || 0,
          activeDaysCount: 0,
        };
        map.set(row.userId, entry);
      }
      entry.gamesPlayedCount += row.gamesPlayedCount || 0;
      entry.ticketsCount += row.ticketsCount || 0;
      entry.winsCount += row.winsCount || 0;
      entry.lossesCount += row.lossesCount || 0;
      entry.totalStakedMinor += row.totalStakedMinor || 0;
      entry.wonMinor += row.wonMinor || 0;
      entry.lostMinor += row.lostMinor || 0;
      entry.netWinLossMinor = entry.wonMinor - entry.totalStakedMinor;
      entry.approvedDepositsMinor += row.approvedDepositsMinor || 0;
      entry.approvedWithdrawalsMinor += row.approvedWithdrawalsMinor || 0;
      entry.activeDaysCount += 1;
    }

    const allRows = Array.from(map.values()).sort((a, b) => {
      if (b.wonMinor !== a.wonMinor) return b.wonMinor - a.wonMinor;
      if (b.lostMinor !== a.lostMinor) return b.lostMinor - a.lostMinor;
      if (b.totalStakedMinor !== a.totalStakedMinor) return b.totalStakedMinor - a.totalStakedMinor;
      return a.username.localeCompare(b.username);
    });

    const q = playerFilterSearch.trim().toLowerCase();
    if (!q) return allRows;
    return allRows.filter(
      (r) =>
        String(r.username || '').toLowerCase().includes(q) ||
        String(r.phone || '').toLowerCase().includes(q)
    );
  }, [allPlayers, playerDailyWinLossLogs, filteredDateSet, playerFilterSearch]);

  const playersTotals = useMemo(() => {
    return allPlayersSummaryList.reduce(
      (acc, p) => {
        acc.gamesPlayedCount += p.gamesPlayedCount;
        acc.ticketsCount += p.ticketsCount;
        acc.winsCount += p.winsCount;
        acc.lossesCount += p.lossesCount;
        acc.totalStakedMinor += p.totalStakedMinor;
        acc.wonMinor += p.wonMinor;
        acc.lostMinor += p.lostMinor;
        acc.netWinLossMinor += p.netWinLossMinor;
        acc.approvedDepositsMinor += p.approvedDepositsMinor;
        acc.approvedWithdrawalsMinor += p.approvedWithdrawalsMinor;
        acc.currentBalanceMinor += p.currentBalanceMinor;
        return acc;
      },
      {
        gamesPlayedCount: 0,
        ticketsCount: 0,
        winsCount: 0,
        lossesCount: 0,
        totalStakedMinor: 0,
        wonMinor: 0,
        lostMinor: 0,
        netWinLossMinor: 0,
        approvedDepositsMinor: 0,
        approvedWithdrawalsMinor: 0,
        currentBalanceMinor: 0,
      }
    );
  }, [allPlayersSummaryList]);

  const rangeMetrics = useMemo(() => {
    return filteredData.reduce(
      (acc, d) => {
        acc.netDepositsMinor += d.netDepositsMinor;
        acc.approvedDepositsMinor += d.approvedDepositsMinor;
        acc.pendingDepositsMinor += d.pendingDepositsMinor || 0;
        acc.rejectedDepositsMinor += d.rejectedDepositsMinor || 0;
        acc.depositsCount += d.depositsCount || 0;
        acc.approvedWithdrawalsMinor += d.approvedWithdrawalsMinor;
        acc.pendingWithdrawalsMinor += d.pendingWithdrawalsMinor || 0;
        acc.rejectedWithdrawalsMinor += d.rejectedWithdrawalsMinor || 0;
        acc.withdrawalsCount += d.withdrawalsCount || 0;
        acc.totalPayoutsMinor += d.totalPayoutsMinor;
        acc.roundPayoutsMinor += d.roundPayoutsMinor;
        acc.houseFeeMinor += d.houseFeeMinor;
        acc.gamesPlayedCount += d.gamesPlayedCount || 0;
        acc.totalPotMinor += d.totalPotMinor || 0;
        acc.ticketsCount += d.ticketsCount;
        acc.playersWonMinor += d.playersWonMinor ?? d.roundPayoutsMinor ?? 0;
        acc.playersWonCount += d.playersWonCount || 0;
        acc.playersLostMinor += d.playersLostMinor || 0;
        acc.playersLostCount += d.playersLostCount || 0;
        acc.totalActivePlayerDays += d.activePlayersCount;
        if (d.activePlayersCount > acc.peakActivePlayers) {
          acc.peakActivePlayers = d.activePlayersCount;
        }
        return acc;
      },
      {
        netDepositsMinor: 0,
        approvedDepositsMinor: 0,
        pendingDepositsMinor: 0,
        rejectedDepositsMinor: 0,
        depositsCount: 0,
        approvedWithdrawalsMinor: 0,
        pendingWithdrawalsMinor: 0,
        rejectedWithdrawalsMinor: 0,
        withdrawalsCount: 0,
        totalPayoutsMinor: 0,
        roundPayoutsMinor: 0,
        houseFeeMinor: 0,
        gamesPlayedCount: 0,
        totalPotMinor: 0,
        ticketsCount: 0,
        playersWonMinor: 0,
        playersWonCount: 0,
        playersLostMinor: 0,
        playersLostCount: 0,
        totalActivePlayerDays: 0,
        peakActivePlayers: 0,
      }
    );
  }, [filteredData]);

  const avgDailyActivePlayers =
    filteredData.length > 0
      ? (rangeMetrics.totalActivePlayerDays / filteredData.length).toFixed(1)
      : '0.0';

  const dailyComparison = useMemo(() => {
    const tDeposits = todayPoint?.approvedDepositsMinor ?? 0;
    const yDeposits = yesterdayPoint?.approvedDepositsMinor ?? 0;
    const tWithdrawals = todayPoint?.approvedWithdrawalsMinor ?? 0;
    const yWithdrawals = yesterdayPoint?.approvedWithdrawalsMinor ?? 0;
    const tGgr = todayPoint?.houseFeeMinor ?? 0;
    const yGgr = yesterdayPoint?.houseFeeMinor ?? 0;
    const tGames = todayPoint?.gamesPlayedCount ?? 0;
    const yGames = yesterdayPoint?.gamesPlayedCount ?? 0;
    const tTickets = todayPoint?.ticketsCount ?? 0;
    const yTickets = yesterdayPoint?.ticketsCount ?? 0;

    return {
      deposits: {
        today: tDeposits,
        yesterday: yDeposits,
        ...computeGrowthMetric(tDeposits, yDeposits),
      },
      withdrawals: {
        today: tWithdrawals,
        yesterday: yWithdrawals,
        ...computeGrowthMetric(tWithdrawals, yWithdrawals),
      },
      ggrFee: {
        today: tGgr,
        yesterday: yGgr,
        todayTickets: tTickets,
        yesterdayTickets: yTickets,
        ...computeGrowthMetric(tGgr, yGgr),
      },
      gamesPlayed: {
        today: tGames,
        yesterday: yGames,
        ...computeGrowthMetric(tGames, yGames),
      },
    };
  }, [todayPoint, yesterdayPoint]);

  const periodLabel = useMemo(() => {
    if (dateFilter === 'TODAY') return `ዛሬ / Today (${todayPoint?.date || ''})`;
    if (dateFilter === 'YESTERDAY') return `ትላንት / Yesterday (${yesterdayPoint?.date || ''})`;
    if (dateFilter === '7D') return 'ባለፉት 7 ቀናት / Last 7 Days';
    if (dateFilter === '14D') return 'ባለፉት 14 ቀናት / Last 14 Days';
    if (dateFilter === '30D') return 'ባለፉት 30 ቀናት / Last 30 Days';
    if (dateFilter === 'CUSTOM') {
      return `Custom (${customStartDate || 'Start'} → ${customEndDate || 'End'})`;
    }
    return '30 Days';
  }, [dateFilter, customStartDate, customEndDate, todayPoint, yesterdayPoint]);

  const buildReportCsvRows = () => {
    const headers = [
      'Date (YYYY-MM-DD)',
      'Total Daily Deposits (ETB)',
      'Deposits Count',
      'Total Daily Withdrawals (ETB)',
      'Withdrawals Count',
      'Total Daily House Commission Earned (ETB)',
      'Total Games Played',
      'Cartelas Sold',
      'Total Prize Pool / Pot (ETB)',
      'Players Won / ተጫዋቾች የበሉት (ETB)',
      'Players Won Count (የበሉ ካርቴላዎች)',
      'Players Lost / ተጫዋቾች የተበሉት (ETB)',
      'Players Lost Count (የተበሉ ካርቴላዎች)',
      'Net Gaming Revenue / Commission (ETB)',
      'Net Cashflow Deposits - Withdrawals (ETB)',
      'Active Players',
    ];
    const rows = [...filteredData].reverse().map((r) => {
      const wonMinor = r.playersWonMinor ?? r.roundPayoutsMinor ?? 0;
      const lostMinor = r.playersLostMinor ?? 0;
      return [
        r.date,
        r.approvedDepositsBirr.toFixed(2),
        String(r.depositsCount || 0),
        r.approvedWithdrawalsBirr.toFixed(2),
        String(r.withdrawalsCount || 0),
        r.houseFeeBirr.toFixed(2),
        String(r.gamesPlayedCount || 0),
        String(r.ticketsCount),
        ((r.totalPotMinor || 0) / 100).toFixed(2),
        (wonMinor / 100).toFixed(2),
        String(r.playersWonCount || 0),
        (lostMinor / 100).toFixed(2),
        String(r.playersLostCount || 0),
        r.houseFeeBirr.toFixed(2),
        r.netDepositsBirr.toFixed(2),
        String(r.activePlayersCount),
      ];
    });
    const totalsRow = [
      `TOTAL (${filteredData.length} Days)`,
      (rangeMetrics.approvedDepositsMinor / 100).toFixed(2),
      String(rangeMetrics.depositsCount),
      (rangeMetrics.approvedWithdrawalsMinor / 100).toFixed(2),
      String(rangeMetrics.withdrawalsCount),
      (rangeMetrics.houseFeeMinor / 100).toFixed(2),
      String(rangeMetrics.gamesPlayedCount),
      String(rangeMetrics.ticketsCount),
      (rangeMetrics.totalPotMinor / 100).toFixed(2),
      (rangeMetrics.playersWonMinor / 100).toFixed(2),
      String(rangeMetrics.playersWonCount),
      (rangeMetrics.playersLostMinor / 100).toFixed(2),
      String(rangeMetrics.playersLostCount),
      (rangeMetrics.houseFeeMinor / 100).toFixed(2),
      (rangeMetrics.netDepositsMinor / 100).toFixed(2),
      `Peak ${rangeMetrics.peakActivePlayers || summary?.peakDailyActivePlayers || 0}`,
    ];

    // Section 2: All Players Daily Balances & Wins/Losses Summary for Selected Period
    const playerSummaryHeaders = [
      'Player ID',
      'Player Name / Username (የተጫዋች ስም)',
      'Phone Number (ስልክ ቁጥር)',
      'Daily / Current Wallet Balance ETB (የአሁኑ ቀሪ ሂሳብ)',
      'Games Played (የተጫወቱት ዙር)',
      'Cartelas Bought (የገዙት ካርቴላ)',
      'Wins Count (የበሉት ጊዜ)',
      'Total Won ETB (የበሉት ብር)',
      'Losses Count (የተበሉት ጊዜ)',
      'Total Lost ETB (የተበሉት ብር)',
      'Total Staked / Bet ETB (ጠቅላላ ውርርድ)',
      'Net Player Win/Loss ETB (የተጣራ የበሉት/የተበሉት ልዩነት)',
      'Approved Deposits ETB (የጸደቀ ገቢ)',
      'Approved Withdrawals ETB (የተከፈለ ወጪ)',
      'Registered Timestamp (Date/Time)',
      'Last Active Timestamp (Date/Time)',
    ];
    const formatExportTimestamp = (iso?: string) => {
      if (!iso) return '-';
      try {
        return new Date(iso).toLocaleString('en-US', { timeZone: 'Africa/Addis_Ababa' });
      } catch {
        return iso;
      }
    };
    const playerSummaryRows = allPlayersSummaryList.map((p) => [
      `#${p.userId}`,
      p.username,
      p.phone,
      (p.currentBalanceMinor / 100).toFixed(2),
      String(p.gamesPlayedCount),
      String(p.ticketsCount),
      String(p.winsCount),
      (p.wonMinor / 100).toFixed(2),
      String(p.lossesCount),
      (p.lostMinor / 100).toFixed(2),
      (p.totalStakedMinor / 100).toFixed(2),
      (p.netWinLossMinor / 100).toFixed(2),
      (p.approvedDepositsMinor / 100).toFixed(2),
      (p.approvedWithdrawalsMinor / 100).toFixed(2),
      formatExportTimestamp(p.createdAt),
      formatExportTimestamp(p.lastActiveAt),
    ]);
    const playerSummaryTotalsRow = [
      'TOTAL',
      `All Players (${allPlayersSummaryList.length})`,
      '-',
      (playersTotals.currentBalanceMinor / 100).toFixed(2),
      String(playersTotals.gamesPlayedCount),
      String(playersTotals.ticketsCount),
      String(playersTotals.winsCount),
      (playersTotals.wonMinor / 100).toFixed(2),
      String(playersTotals.lossesCount),
      (playersTotals.lostMinor / 100).toFixed(2),
      (playersTotals.totalStakedMinor / 100).toFixed(2),
      (playersTotals.netWinLossMinor / 100).toFixed(2),
      (playersTotals.approvedDepositsMinor / 100).toFixed(2),
      (playersTotals.approvedWithdrawalsMinor / 100).toFixed(2),
      '-',
      '-',
    ];

    // Section 3: Daily Player-by-Player Breakdown by Date
    const playerDailyHeaders = [
      'Date (YYYY-MM-DD / ቀን)',
      'Player ID',
      'Player Name / Username (የተጫዋች ስም)',
      'Phone Number (ስልክ ቁጥር)',
      'Daily / Current Balance ETB (ቀሪ ሂሳብ)',
      'Games Played (የተጫወቱት ዙር)',
      'Cartelas Bought (የገዙት ካርቴላ)',
      'Wins Count (የበሉት ጊዜ)',
      'Daily Won ETB (ዕለታዊ የበሉት ብር)',
      'Losses Count (የተበሉት ጊዜ)',
      'Daily Lost ETB (ዕለታዊ የተበሉት ብር)',
      'Daily Total Staked ETB (ዕለታዊ ጠቅላላ ውርርድ)',
      'Daily Net Win/Loss ETB (ዕለታዊ የተጣራ ልዩነት)',
      'Daily Deposits ETB (ዕለታዊ ገቢ)',
      'Daily Withdrawals ETB (ዕለታዊ ወጪ)',
    ];
    const playerDailyRows = filteredPlayerDailyLogs.map((r) => [
      r.date,
      `#${r.userId}`,
      r.username,
      r.phone,
      (r.currentBalanceMinor / 100).toFixed(2),
      String(r.gamesPlayedCount),
      String(r.ticketsCount),
      String(r.winsCount),
      (r.wonMinor / 100).toFixed(2),
      String(r.lossesCount),
      (r.lostMinor / 100).toFixed(2),
      (r.totalStakedMinor / 100).toFixed(2),
      (r.netWinLossMinor / 100).toFixed(2),
      (r.approvedDepositsMinor / 100).toFixed(2),
      (r.approvedWithdrawalsMinor / 100).toFixed(2),
    ]);

    // Section 4: Detailed Game History for All Registered Players with Timestamps (Date/Time)
    const gameHistoryHeaders = [
      'Timestamp (Date/Time)',
      'Date (YYYY-MM-DD)',
      'Player ID',
      'Player Name / Username (የተጫዋች ስም)',
      'Phone Number (ስልክ ቁጥር)',
      'Player Daily Balance ETB (ቀሪ ሂሳብ)',
      'Round ID',
      'Room Name',
      'Game Mode',
      'Winning Pattern',
      'Cartela Number',
      'Stake / Bet Paid ETB',
      'Game Result',
      'Won Amount ETB',
      'Lost Amount ETB',
      'Net Profit/Loss ETB',
      'Balls Drawn',
    ];
    const filteredHistoryList = (Array.isArray(playerGameHistoryLogs) ? playerGameHistoryLogs : []).filter(
      (gh) => !gh.dateKey || filteredDateSet.has(gh.dateKey)
    );
    const gameHistoryRows = filteredHistoryList.map((gh) => [
      formatExportTimestamp(gh.timestampUtc),
      gh.dateKey || '-',
      `#${gh.userId}`,
      gh.username || `Player #${gh.userId}`,
      gh.phone || '-',
      ((gh.currentBalanceMinor || 0) / 100).toFixed(2),
      `Round #${gh.roundId}`,
      `${gh.roomNameAm || ''} (${gh.roomNameEn || 'Bingo Room'})`,
      gh.modeTag || 'LIVE',
      gh.winningPattern || 'ONE_LINE',
      `Cartela #${gh.cardIndex}`,
      ((gh.pricePaidMinor || 0) / 100).toFixed(2),
      gh.result || gh.roundStatus || '-',
      ((gh.wonAmountMinor || 0) / 100).toFixed(2),
      ((gh.lostAmountMinor || 0) / 100).toFixed(2),
      ((gh.netProfitLossMinor || 0) / 100).toFixed(2),
      `${gh.drawnCount || 0}/75`,
    ]);

    return {
      headers,
      rows,
      totalsRow,
      playerSummaryHeaders,
      playerSummaryRows,
      playerSummaryTotalsRow,
      playerDailyHeaders,
      playerDailyRows,
      gameHistoryHeaders,
      gameHistoryRows,
    };
  };

  const sanitizeSpreadsheetField = (val: unknown): string => {
    const raw = String(val ?? '').replace(/[\r\n\t]+/g, ' ');
    if (!raw || raw === '-') return raw;
    if (/^\s*[=+\-@]/.test(raw)) {
      return `'${raw}`;
    }
    return raw;
  };

  const escapeCell = (val: unknown) => {
    const sanitized = sanitizeSpreadsheetField(val);
    return `"${sanitized.replace(/"/g, '""')}"`;
  };

  const handleExportCsv = () => {
    if (!filteredData.length) return;
    const {
      headers,
      rows,
      totalsRow,
      playerSummaryHeaders,
      playerSummaryRows,
      playerSummaryTotalsRow,
      playerDailyHeaders,
      playerDailyRows,
      gameHistoryHeaders,
      gameHistoryRows,
    } = buildReportCsvRows();
    const csvLines = [
      escapeCell(`# 1. DAILY FINANCIAL REPORT SUMMARY (${periodLabel})`),
      headers.map(escapeCell).join(','),
      ...rows.map((r) => r.map(escapeCell).join(',')),
      totalsRow.map(escapeCell).join(','),
      '',
      escapeCell(
        `# 2. ALL REGISTERED PLAYERS DAILY BALANCES & WIN/LOSS SUMMARY (${periodLabel})`
      ),
      playerSummaryHeaders.map(escapeCell).join(','),
      ...playerSummaryRows.map((r) => r.map(escapeCell).join(',')),
      playerSummaryTotalsRow.map(escapeCell).join(','),
      '',
      escapeCell(
        `# 3. PLAYER-BY-PLAYER DAILY BALANCES, WINS (የበሉት) & LOSSES (የተበሉት) BY DATE (${periodLabel})`
      ),
      playerDailyHeaders.map(escapeCell).join(','),
      ...playerDailyRows.map((r) => r.map(escapeCell).join(',')),
      '',
      escapeCell(
        `# 4. ALL REGISTERED PLAYERS DETAILED GAME HISTORY & TIMESTAMPS (${periodLabel})`
      ),
      gameHistoryHeaders.map(escapeCell).join(','),
      ...gameHistoryRows.map((r) => r.map(escapeCell).join(',')),
    ];
    // Include UTF-8 BOM (\uFEFF) so Microsoft Excel opens Amharic + English with proper encoding
    const csvContent = '\uFEFF' + csvLines.join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `winner-bingo-players-daily-balances-and-game-history-${dateFilter.toLowerCase()}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportExcel = () => {
    if (!filteredData.length) return;
    const {
      headers,
      rows,
      totalsRow,
      playerSummaryHeaders,
      playerSummaryRows,
      playerSummaryTotalsRow,
      playerDailyHeaders,
      playerDailyRows,
      gameHistoryHeaders,
      gameHistoryRows,
    } = buildReportCsvRows();
    const tsvLines = [
      `'# 1. DAILY FINANCIAL REPORT SUMMARY (${periodLabel})`,
      headers.map(sanitizeSpreadsheetField).join('\t'),
      ...rows.map((r) => r.map(sanitizeSpreadsheetField).join('\t')),
      totalsRow.map(sanitizeSpreadsheetField).join('\t'),
      '',
      `'# 2. ALL REGISTERED PLAYERS DAILY BALANCES & WIN/LOSS SUMMARY (${periodLabel})`,
      playerSummaryHeaders.map(sanitizeSpreadsheetField).join('\t'),
      ...playerSummaryRows.map((r) => r.map(sanitizeSpreadsheetField).join('\t')),
      playerSummaryTotalsRow.map(sanitizeSpreadsheetField).join('\t'),
      '',
      `'# 3. PLAYER-BY-PLAYER DAILY BALANCES, WINS (የበሉት) & LOSSES (የተበሉት) BY DATE (${periodLabel})`,
      playerDailyHeaders.map(sanitizeSpreadsheetField).join('\t'),
      ...playerDailyRows.map((r) => r.map(sanitizeSpreadsheetField).join('\t')),
      '',
      `'# 4. ALL REGISTERED PLAYERS DETAILED GAME HISTORY & TIMESTAMPS (${periodLabel})`,
      gameHistoryHeaders.map(sanitizeSpreadsheetField).join('\t'),
      ...gameHistoryRows.map((r) => r.map(sanitizeSpreadsheetField).join('\t')),
    ];
    const excelContent = '\uFEFF' + tsvLines.join('\r\n');
    const blob = new Blob([excelContent], {
      type: 'application/vnd.ms-excel;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `winner-bingo-players-daily-balances-and-game-history-${dateFilter.toLowerCase()}-${new Date().toISOString().slice(0, 10)}.xls`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportPlayersWinLossOnlyCsv = () => {
    const {
      playerSummaryHeaders,
      playerSummaryRows,
      playerSummaryTotalsRow,
      playerDailyHeaders,
      playerDailyRows,
      gameHistoryHeaders,
      gameHistoryRows,
    } = buildReportCsvRows();
    const csvLines = [
      escapeCell(
        `# ALL REGISTERED PLAYERS DAILY BALANCES & WIN/LOSS SUMMARY (${periodLabel})`
      ),
      playerSummaryHeaders.map(escapeCell).join(','),
      ...playerSummaryRows.map((r) => r.map(escapeCell).join(',')),
      playerSummaryTotalsRow.map(escapeCell).join(','),
      '',
      escapeCell(
        `# DAILY PLAYER-BY-PLAYER BALANCES, WINS (የበሉት) & LOSSES (የተበሉት) BY DATE (${periodLabel})`
      ),
      playerDailyHeaders.map(escapeCell).join(','),
      ...playerDailyRows.map((r) => r.map(escapeCell).join(',')),
      '',
      escapeCell(
        `# ALL REGISTERED PLAYERS DETAILED GAME HISTORY & TIMESTAMPS (${periodLabel})`
      ),
      gameHistoryHeaders.map(escapeCell).join(','),
      ...gameHistoryRows.map((r) => r.map(escapeCell).join(',')),
    ];
    const csvContent = '\uFEFF' + csvLines.join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `winner-bingo-all-players-daily-balances-and-history-${dateFilter.toLowerCase()}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportPlayersWinLossOnlyExcel = () => {
    const {
      playerSummaryHeaders,
      playerSummaryRows,
      playerSummaryTotalsRow,
      playerDailyHeaders,
      playerDailyRows,
      gameHistoryHeaders,
      gameHistoryRows,
    } = buildReportCsvRows();
    const tsvLines = [
      `'# ALL REGISTERED PLAYERS DAILY BALANCES & WIN/LOSS SUMMARY (${periodLabel})`,
      playerSummaryHeaders.map(sanitizeSpreadsheetField).join('\t'),
      ...playerSummaryRows.map((r) => r.map(sanitizeSpreadsheetField).join('\t')),
      playerSummaryTotalsRow.map(sanitizeSpreadsheetField).join('\t'),
      '',
      `'# DAILY PLAYER-BY-PLAYER BALANCES, WINS (የበሉት) & LOSSES (የተበሉት) BY DATE (${periodLabel})`,
      playerDailyHeaders.map(sanitizeSpreadsheetField).join('\t'),
      ...playerDailyRows.map((r) => r.map(sanitizeSpreadsheetField).join('\t')),
      '',
      `'# ALL REGISTERED PLAYERS DETAILED GAME HISTORY & TIMESTAMPS (${periodLabel})`,
      gameHistoryHeaders.map(sanitizeSpreadsheetField).join('\t'),
      ...gameHistoryRows.map((r) => r.map(sanitizeSpreadsheetField).join('\t')),
    ];
    const excelContent = '\uFEFF' + tsvLines.join('\r\n');
    const blob = new Blob([excelContent], {
      type: 'application/vnd.ms-excel;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `winner-bingo-all-players-daily-balances-and-history-${dateFilter.toLowerCase()}-${new Date().toISOString().slice(0, 10)}.xls`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="bg-slate-900 border-2 border-slate-800 rounded-2xl p-4 sm:p-6 space-y-5 shadow-xl">
      {/* Header & Reporter Export Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-emerald-400 font-semibold">
            <TrendingUp className="w-4 h-4 shrink-0" />
            <span>የዕለታዊ ፋይናንስ ክትትል እና ሪፖርት ማውጫ · Daily Financial Tracking &amp; Reporting Dashboard</span>
            <span className="px-2.5 py-0.5 rounded-full bg-purple-500/20 border border-purple-400/50 text-purple-300 font-mono text-[11px] font-bold">
              Active Commission: {houseCommissionPercent}%
            </span>
          </div>
          <h2 className="font-display text-lg sm:text-xl font-extrabold text-white mt-1">
            Daily Financial Report — {periodLabel}
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Automated daily logging of Deposits, Withdrawals, House Commission, Games Played, and All Players Daily Wins (የበሉት) &amp; Losses (የተበሉት)
            {serverTimeUtc ? ` · Updated ${new Date(serverTimeUtc).toLocaleTimeString()}` : ''}
          </p>
        </div>

        {/* Export to CSV / Excel Buttons */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleExportCsv}
            className="px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-extrabold flex items-center gap-1.5 whitespace-nowrap shadow-md cursor-pointer transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export Full Report + Players (CSV)</span>
          </button>
          <button
            type="button"
            onClick={handleExportExcel}
            className="px-3.5 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-extrabold flex items-center gap-1.5 whitespace-nowrap shadow-md cursor-pointer transition-colors"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>Export Full Report + Players (.xls)</span>
          </button>
          <button
            type="button"
            onClick={handleExportPlayersWinLossOnlyCsv}
            className="px-3.5 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-extrabold flex items-center gap-1.5 whitespace-nowrap shadow-md cursor-pointer transition-colors"
          >
            <Users className="w-3.5 h-3.5" />
            <span>የሁሉም ተጫዋቾች የበሉት/የተበሉት አውርድ (CSV)</span>
          </button>
        </div>
      </div>

      {/* Reporter Date-Range Filter Bar (Today, Yesterday, 7D, 14D, 30D, Custom Date Range) */}
      <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5 mr-1">
            <Calendar className="w-3.5 h-3.5 text-emerald-400" />
            <span>የቀን ማጣሪያ (Date Filter):</span>
          </span>
          {(
            [
              { id: 'TODAY', label: 'ዛሬ (Today)' },
              { id: 'YESTERDAY', label: 'ትላንት (Yesterday)' },
              { id: '7D', label: '7 ቀናት (7D)' },
              { id: '14D', label: '14 ቀናት (14D)' },
              { id: '30D', label: '30 ቀናት (30D)' },
              { id: 'CUSTOM', label: '📅 Custom Date Range' },
            ] as Array<{ id: DateFilterPreset; label: string }>
          ).map((btn) => (
            <button
              key={btn.id}
              type="button"
              onClick={() => {
                setDateFilter(btn.id);
                if (btn.id === 'CUSTOM' && !customStartDate && fullList.length > 0) {
                  setCustomStartDate(
                    fullList[Math.max(0, fullList.length - 7)]?.date || ''
                  );
                  setCustomEndDate(fullList[fullList.length - 1]?.date || '');
                }
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition-all cursor-pointer ${
                dateFilter === btn.id
                  ? 'bg-emerald-500 text-slate-950 shadow-sm'
                  : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800'
              }`}
            >
              {btn.label}
            </button>
          ))}
        </div>

        {/* Custom Date Range Inputs */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5">
            <label className="text-[11px] font-semibold text-slate-400">ከ (From):</label>
            <input
              type="date"
              value={customStartDate}
              onChange={(e) => {
                setCustomStartDate(e.target.value);
                setDateFilter('CUSTOM');
              }}
              className="h-8 px-2.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white font-mono"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <label className="text-[11px] font-semibold text-slate-400">እስከ (To):</label>
            <input
              type="date"
              value={customEndDate}
              onChange={(e) => {
                setCustomEndDate(e.target.value);
                setDateFilter('CUSTOM');
              }}
              className="h-8 px-2.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white font-mono"
            />
          </div>
          {(customStartDate || customEndDate) && (
            <button
              type="button"
              onClick={() => {
                setCustomStartDate('');
                setCustomEndDate('');
                setDateFilter('30D');
              }}
              className="h-8 px-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 font-semibold cursor-pointer"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {/* ====================================================================
          4 REPORTER SUMMARY CARDS FOR THE SELECTED DATE RANGE:
          a) Total Daily Deposits
          b) Total Daily Withdrawals
          c) Total Daily House Commission Earned
          d) Total Games Played & Players Won / Lost
         ==================================================================== */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 font-mono tabular-nums">
        {/* Card A: Total Daily Deposits */}
        <div className="bg-slate-950 border-2 border-emerald-500/40 rounded-2xl p-4 space-y-1.5">
          <div className="flex items-center justify-between text-xs font-sans font-bold text-emerald-300">
            <span>ሀ) ጠቅላላ ገቢ (Total Deposits)</span>
            <Wallet className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-emerald-400">
            {formatEtb(rangeMetrics.approvedDepositsMinor, 'en')}
          </div>
          <div className="text-[11px] font-sans text-slate-300 flex flex-wrap items-center justify-between gap-1 pt-0.5">
            <span>የጸደቁ: {rangeMetrics.depositsCount} ጊዜ</span>
            <span>·</span>
            <span>ዛሬ: {formatEtb(dailyComparison.deposits.today, 'en')}</span>
          </div>
        </div>

        {/* Card B: Total Daily Withdrawals */}
        <div className="bg-slate-950 border-2 border-amber-400/40 rounded-2xl p-4 space-y-1.5">
          <div className="flex items-center justify-between text-xs font-sans font-bold text-amber-300">
            <span>ለ) ጠቅላላ ወጪ (Total Withdrawals)</span>
            <ArrowDownRight className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-amber-300">
            {formatEtb(rangeMetrics.approvedWithdrawalsMinor, 'en')}
          </div>
          <div className="text-[11px] font-sans text-slate-300 flex flex-wrap items-center justify-between gap-1 pt-0.5">
            <span>የተከፈሉ: {rangeMetrics.withdrawalsCount} ጊዜ</span>
            <span>·</span>
            <span>ዛሬ: {formatEtb(dailyComparison.withdrawals.today, 'en')}</span>
          </div>
        </div>

        {/* Card C: Total Daily House Commission Earned */}
        <div className="bg-slate-950 border-2 border-purple-500/50 rounded-2xl p-4 space-y-1.5">
          <div className="flex items-center justify-between text-xs font-sans font-bold text-purple-300">
            <span>ሐ) የቤት ኮሚሽን (House Commission)</span>
            <Percent className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-white">
            {formatEtb(rangeMetrics.houseFeeMinor, 'en')}
          </div>
          <div className="text-[11px] font-sans text-slate-300 flex flex-wrap items-center justify-between gap-1 pt-0.5">
            <span className="text-purple-300 font-bold">መቶኛ: {houseCommissionPercent}%</span>
            <span>·</span>
            <span>ዛሬ: {formatEtb(dailyComparison.ggrFee.today, 'en')}</span>
          </div>
        </div>

        {/* Card D: Total Games Played & Players Won / Lost */}
        <div className="bg-slate-950 border-2 border-sky-500/40 rounded-2xl p-4 space-y-1.5">
          <div className="flex items-center justify-between text-xs font-sans font-bold text-sky-300">
            <span>መ) የበሉት እና የተበሉት (Wins &amp; Losses)</span>
            <Award className="w-4 h-4 text-sky-400" />
          </div>
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-sm sm:text-base font-black text-emerald-400">
              የበሉት: {formatEtb(rangeMetrics.playersWonMinor, 'en')}
            </span>
          </div>
          <div className="text-[11px] font-sans text-slate-300 flex flex-wrap items-center justify-between gap-1 pt-0.5">
            <span className="text-red-400 font-bold font-mono">
              የተበሉት: {formatEtb(rangeMetrics.playersLostMinor, 'en')}
            </span>
            <span>·</span>
            <span>{rangeMetrics.gamesPlayedCount} ጨዋታዎች</span>
          </div>
        </div>
      </div>

      {/* Today vs. Yesterday Quick Comparison Strip */}
      <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden">
        <div className="px-4 py-2 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="font-bold text-white">
            የዛሬ እና የትላንት ዕለታዊ ንጽጽር · Today ({todayPoint?.date || 'Today'}) vs. Yesterday ({yesterdayPoint?.date || 'Yesterday'})
          </span>
          <span className="text-[11px] font-mono text-slate-400">
            Day-over-Day (DoD) Comparison
          </span>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-slate-800 font-mono tabular-nums text-xs">
          <div className="p-3 space-y-1">
            <div className="flex items-center justify-between text-slate-400 font-sans">
              <span>Today Deposits</span>
              <span
                className={
                  dailyComparison.deposits.direction === 'up'
                    ? 'text-emerald-400 font-mono font-bold'
                    : dailyComparison.deposits.direction === 'down'
                    ? 'text-red-400 font-mono font-bold'
                    : 'text-slate-400 font-mono'
                }
              >
                {dailyComparison.deposits.pctText}
              </span>
            </div>
            <div className="text-base font-extrabold text-emerald-400">
              {formatEtb(dailyComparison.deposits.today, 'en')}
            </div>
            <div className="text-[11px] text-slate-400">
              Yesterday: {formatEtb(dailyComparison.deposits.yesterday, 'en')}
            </div>
          </div>

          <div className="p-3 space-y-1">
            <div className="flex items-center justify-between text-slate-400 font-sans">
              <span>Today Withdrawals</span>
              <span className="text-amber-300 font-mono font-bold">
                {dailyComparison.withdrawals.pctText}
              </span>
            </div>
            <div className="text-base font-extrabold text-amber-300">
              {formatEtb(dailyComparison.withdrawals.today, 'en')}
            </div>
            <div className="text-[11px] text-slate-400">
              Yesterday: {formatEtb(dailyComparison.withdrawals.yesterday, 'en')}
            </div>
          </div>

          <div className="p-3 space-y-1">
            <div className="flex items-center justify-between text-slate-400 font-sans">
              <span>Today House Commission</span>
              <span
                className={
                  dailyComparison.ggrFee.direction === 'up'
                    ? 'text-emerald-400 font-mono font-bold'
                    : 'text-purple-300 font-mono font-bold'
                }
              >
                {dailyComparison.ggrFee.pctText}
              </span>
            </div>
            <div className="text-base font-extrabold text-white">
              {formatEtb(dailyComparison.ggrFee.today, 'en')}
            </div>
            <div className="text-[11px] text-slate-400">
              Yesterday: {formatEtb(dailyComparison.ggrFee.yesterday, 'en')}
            </div>
          </div>

          <div className="p-3 space-y-1">
            <div className="flex items-center justify-between text-slate-400 font-sans">
              <span>Today Games Played</span>
              <span className="text-sky-400 font-mono font-bold">
                {dailyComparison.gamesPlayed.pctText}
              </span>
            </div>
            <div className="text-base font-extrabold text-sky-400">
              {dailyComparison.gamesPlayed.today} Games ({dailyComparison.ggrFee.todayTickets} Cards)
            </div>
            <div className="text-[11px] text-slate-400">
              Yesterday: {dailyComparison.gamesPlayed.yesterday} Games ({dailyComparison.ggrFee.yesterdayTickets} Cards)
            </div>
          </div>
        </div>
      </div>

      {/* ====================================================================
          REPORTER DAILY FINANCIAL DATA TABLE (Visible by default)
         ==================================================================== */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="font-display text-sm sm:text-base font-extrabold text-white">
              1. የዕለታዊ ፋይናንስ ሪፖርት ሰንጠረዥ · Daily Financial Breakdown Table ({filteredData.length} Days)
            </h3>
            <p className="text-xs text-slate-400">
              Shows Daily Deposits, Withdrawals, House Commission, Games Played, Players Won (የበሉት), Players Lost (የተበሉት) &amp; Net Cashflow by date.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleExportCsv}
              className="px-3 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/50 text-xs font-extrabold text-emerald-300 flex items-center gap-1.5 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>ሙሉ ሪፖርት CSV አውርድ</span>
            </button>
            <button
              type="button"
              onClick={() => setShowDailyTable((prev) => !prev)}
              className="px-3 py-1.5 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800 text-xs font-semibold text-slate-300 transition-colors cursor-pointer"
            >
              {showDailyTable ? 'ሰንጠረዥ ደብቅ (Hide Table)' : 'ሰንጠረዥ አሳይ (Show Table)'}
            </button>
          </div>
        </div>

        {showDailyTable && (
          <div className="overflow-x-auto border border-slate-800 rounded-xl bg-slate-950 shadow-inner max-h-[460px] overflow-y-auto">
            <table className="w-full text-left border-collapse text-xs font-mono tabular-nums">
              <thead className="sticky top-0 z-10 bg-slate-900 border-b border-slate-800 text-slate-300">
                <tr>
                  <th className="py-3 px-3">ቀን / Date</th>
                  <th className="py-3 px-3 text-right">ጠቅላላ ገቢ (Deposits)</th>
                  <th className="py-3 px-3 text-right">ጠቅላላ ወጪ (Withdrawals)</th>
                  <th className="py-3 px-3 text-right">የቤት ኮሚሽን (Commission)</th>
                  <th className="py-3 px-3 text-right">ጨዋታዎች (Games)</th>
                  <th className="py-3 px-3 text-right">ካርቴላዎች (Cards)</th>
                  <th className="py-3 px-3 text-right">ጠቅላላ ፖት (Total Pot)</th>
                  <th className="py-3 px-3 text-right text-emerald-300">ተጫዋቾች የበሉት (Players Won)</th>
                  <th className="py-3 px-3 text-right text-red-300">ተጫዋቾች የተበሉት (Players Lost)</th>
                  <th className="py-3 px-3 text-right">ተጣራ ገቢ (Net Cashflow)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {filteredData.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="py-8 text-center text-slate-400 font-sans">
                      በተመረጠው የቀን ክልል ምንም መረጃ አልተገኘም (No records for selected date range).
                    </td>
                  </tr>
                ) : (
                  [...filteredData].reverse().map((row) => {
                    const wonMinor = row.playersWonMinor ?? row.roundPayoutsMinor ?? 0;
                    const lostMinor = row.playersLostMinor ?? 0;
                    return (
                      <tr key={row.date} className="hover:bg-slate-900/70 transition-colors">
                        <td className="py-2.5 px-3 text-white font-bold whitespace-nowrap">
                          {row.date}{' '}
                          <span className="text-slate-400 font-normal">({row.label})</span>
                        </td>
                        <td className="py-2.5 px-3 text-right text-emerald-400 font-bold">
                          {formatEtb(row.approvedDepositsMinor, 'en')}
                          {(row.depositsCount || 0) > 0 && (
                            <span className="text-[10px] text-slate-400 block">
                              ({row.depositsCount} tx)
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-right text-amber-300 font-bold">
                          {formatEtb(row.approvedWithdrawalsMinor, 'en')}
                          {(row.withdrawalsCount || 0) > 0 && (
                            <span className="text-[10px] text-slate-400 block">
                              ({row.withdrawalsCount} tx)
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-right text-purple-300 font-extrabold">
                          {formatEtb(row.houseFeeMinor, 'en')}
                        </td>
                        <td className="py-2.5 px-3 text-right text-sky-400 font-bold">
                          {row.gamesPlayedCount || 0}
                        </td>
                        <td className="py-2.5 px-3 text-right text-slate-200">
                          {row.ticketsCount}
                        </td>
                        <td className="py-2.5 px-3 text-right text-slate-300">
                          {formatEtb(row.totalPotMinor || 0, 'en')}
                        </td>
                        <td className="py-2.5 px-3 text-right text-emerald-300 font-bold">
                          {formatEtb(wonMinor, 'en')}
                          {(row.playersWonCount || 0) > 0 && (
                            <span className="text-[10px] text-slate-400 block">
                              ({row.playersWonCount} wins)
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-right text-red-400 font-bold">
                          {formatEtb(lostMinor, 'en')}
                          {(row.playersLostCount || 0) > 0 && (
                            <span className="text-[10px] text-slate-400 block">
                              ({row.playersLostCount} lost)
                            </span>
                          )}
                        </td>
                        <td
                          className={`py-2.5 px-3 text-right font-extrabold ${
                            row.netDepositsMinor > 0
                              ? 'text-emerald-400'
                              : row.netDepositsMinor < 0
                              ? 'text-red-400'
                              : 'text-slate-400'
                          }`}
                        >
                          {row.netDepositsMinor > 0 ? '+' : ''}
                          {formatEtb(row.netDepositsMinor, 'en')}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
              {filteredData.length > 0 && (
                <tfoot className="sticky bottom-0 bg-slate-900 border-t-2 border-emerald-500/50 font-extrabold text-xs">
                  <tr>
                    <td className="py-3 px-3 text-emerald-300">
                      ድምር / TOTAL ({filteredData.length} Days)
                    </td>
                    <td className="py-3 px-3 text-right text-emerald-400">
                      {formatEtb(rangeMetrics.approvedDepositsMinor, 'en')}
                    </td>
                    <td className="py-3 px-3 text-right text-amber-300">
                      {formatEtb(rangeMetrics.approvedWithdrawalsMinor, 'en')}
                    </td>
                    <td className="py-3 px-3 text-right text-purple-300">
                      {formatEtb(rangeMetrics.houseFeeMinor, 'en')}
                    </td>
                    <td className="py-3 px-3 text-right text-sky-400">
                      {rangeMetrics.gamesPlayedCount}
                    </td>
                    <td className="py-3 px-3 text-right text-white">
                      {rangeMetrics.ticketsCount}
                    </td>
                    <td className="py-3 px-3 text-right text-slate-200">
                      {formatEtb(rangeMetrics.totalPotMinor, 'en')}
                    </td>
                    <td className="py-3 px-3 text-right text-emerald-300">
                      {formatEtb(rangeMetrics.playersWonMinor, 'en')}
                    </td>
                    <td className="py-3 px-3 text-right text-red-400">
                      {formatEtb(rangeMetrics.playersLostMinor, 'en')}
                    </td>
                    <td
                      className={`py-3 px-3 text-right ${
                        rangeMetrics.netDepositsMinor >= 0
                          ? 'text-emerald-400'
                          : 'text-red-400'
                      }`}
                    >
                      {rangeMetrics.netDepositsMinor > 0 ? '+' : ''}
                      {formatEtb(rangeMetrics.netDepositsMinor, 'en')}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </div>

      {/* ====================================================================
          2. ALL PLAYERS DAILY WINS ("የበሉት") & LOSSES ("የተበሉት") REPORT & DOWNLOAD
         ==================================================================== */}
      <div className="bg-slate-950/90 border-2 border-sky-500/40 rounded-2xl p-4 sm:p-5 space-y-3.5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-slate-800 pb-3">
          <div>
            <h3 className="font-display text-sm sm:text-base font-extrabold text-sky-300 flex items-center gap-2">
              <Users className="w-4 h-4 text-sky-400 shrink-0" />
              <span>
                2. የሁሉም ተጫዋቾች ዕለታዊ የበሉት እና የተበሉት ሪፖርት · All Players Daily Wins (የበሉት) &amp; Losses (የተበሉት) ({periodLabel})
              </span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              የእያንዳንዱ ተጫዋች የበሉት (Won)፣ የተበሉት (Lost)፣ ጠቅላላ ውርርድ እና የተጣራ ልዩነት — በቀጥታ ወደ CSV ወይም Excel (.xls) ይወርዳል።
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleExportPlayersWinLossOnlyCsv}
              className="px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-extrabold flex items-center gap-1.5 cursor-pointer shadow-sm"
            >
              <Download className="w-3.5 h-3.5" />
              <span>የተጫዋቾች የበሉት/የተበሉት CSV አውርድ</span>
            </button>
            <button
              type="button"
              onClick={handleExportPlayersWinLossOnlyExcel}
              className="px-3 py-1.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-extrabold flex items-center gap-1.5 cursor-pointer shadow-sm"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>የተጫዋቾች Excel (.xls) አውርድ</span>
            </button>
            <button
              type="button"
              onClick={() => setShowPlayersWinLossTable((prev) => !prev)}
              className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-semibold text-slate-300 cursor-pointer"
            >
              {showPlayersWinLossTable ? 'ዝርዝር ደብቅ (Hide)' : 'ዝርዝር አሳይ (Show)'}
            </button>
          </div>
        </div>

        {/* View Mode Switcher + Player Search */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setPlayerReportViewMode('ALL_PLAYERS_SUMMARY')}
              className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition-colors cursor-pointer ${
                playerReportViewMode === 'ALL_PLAYERS_SUMMARY'
                  ? 'bg-sky-500 text-slate-950'
                  : 'bg-slate-900 text-slate-300 border border-slate-800 hover:bg-slate-800'
              }`}
            >
              ሀ) የሁሉም ተጫዋቾች ማጠቃለያ ({allPlayersSummaryList.length} Players)
            </button>
            <button
              type="button"
              onClick={() => setPlayerReportViewMode('DAILY_BY_DATE')}
              className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition-colors cursor-pointer ${
                playerReportViewMode === 'DAILY_BY_DATE'
                  ? 'bg-sky-500 text-slate-950'
                  : 'bg-slate-900 text-slate-300 border border-slate-800 hover:bg-slate-800'
              }`}
            >
              ለ) የየዕለቱ የተጫዋቾች ዝርዝር በቀን ({filteredPlayerDailyLogs.length} Daily Rows)
            </button>
          </div>

          <input
            type="text"
            value={playerFilterSearch}
            onChange={(e) => setPlayerFilterSearch(e.target.value)}
            placeholder="ተጫዋች ፈልግ (Search Username, Phone)..."
            className="h-8 px-3 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white focus:border-sky-400 focus:outline-none w-full sm:w-64"
          />
        </div>

        {showPlayersWinLossTable && (
          <div className="overflow-x-auto border border-slate-800 rounded-xl bg-slate-900/90 max-h-[420px] overflow-y-auto">
            {playerReportViewMode === 'ALL_PLAYERS_SUMMARY' ? (
              <table className="w-full text-left border-collapse text-xs font-mono tabular-nums">
                <thead className="sticky top-0 z-10 bg-slate-900 border-b border-slate-800 text-slate-300">
                  <tr>
                    <th className="py-2.5 px-3">ተጫዋች (Player)</th>
                    <th className="py-2.5 px-3">ስልክ (Phone)</th>
                    <th className="py-2.5 px-3 text-right">ዙሮች / ካርቴላ</th>
                    <th className="py-2.5 px-3 text-right text-emerald-300">የበሉት ጊዜ (Wins)</th>
                    <th className="py-2.5 px-3 text-right text-emerald-400">የበሉት ብር (Total Won)</th>
                    <th className="py-2.5 px-3 text-right text-red-300">የተበሉት ጊዜ (Losses)</th>
                    <th className="py-2.5 px-3 text-right text-red-400">የተበሉት ብር (Total Lost)</th>
                    <th className="py-2.5 px-3 text-right">ጠቅላላ ውርርድ (Total Bet)</th>
                    <th className="py-2.5 px-3 text-right">የተጣራ ልዩነት (Net P&amp;L)</th>
                    <th className="py-2.5 px-3 text-right">የአሁኑ ቀሪ (Wallet Balance)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {allPlayersSummaryList.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="py-6 text-center text-slate-400 font-sans">
                        ምንም የተጫዋች መረጃ አልተገኘም (No players found).
                      </td>
                    </tr>
                  ) : (
                    allPlayersSummaryList.map((p) => (
                      <tr key={p.userId} className="hover:bg-slate-800/60 transition-colors">
                        <td className="py-2.5 px-3 text-white font-bold">
                          {p.username}{' '}
                          <span className="text-slate-500 font-normal">#{p.userId}</span>
                        </td>
                        <td className="py-2.5 px-3 text-slate-300">{p.phone}</td>
                        <td className="py-2.5 px-3 text-right text-slate-300">
                          {p.gamesPlayedCount} ዙር / {p.ticketsCount} ካርቴላ
                        </td>
                        <td className="py-2.5 px-3 text-right text-emerald-300 font-bold">
                          {p.winsCount}
                        </td>
                        <td className="py-2.5 px-3 text-right text-emerald-400 font-extrabold">
                          {formatEtb(p.wonMinor, 'en')}
                        </td>
                        <td className="py-2.5 px-3 text-right text-red-300 font-bold">
                          {p.lossesCount}
                        </td>
                        <td className="py-2.5 px-3 text-right text-red-400 font-extrabold">
                          {formatEtb(p.lostMinor, 'en')}
                        </td>
                        <td className="py-2.5 px-3 text-right text-slate-200">
                          {formatEtb(p.totalStakedMinor, 'en')}
                        </td>
                        <td
                          className={`py-2.5 px-3 text-right font-extrabold ${
                            p.netWinLossMinor > 0
                              ? 'text-emerald-400'
                              : p.netWinLossMinor < 0
                              ? 'text-red-400'
                              : 'text-slate-400'
                          }`}
                        >
                          {p.netWinLossMinor > 0 ? '+' : ''}
                          {formatEtb(p.netWinLossMinor, 'en')}
                        </td>
                        <td className="py-2.5 px-3 text-right text-amber-300 font-bold">
                          {formatEtb(p.currentBalanceMinor, 'en')}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                {allPlayersSummaryList.length > 0 && (
                  <tfoot className="sticky bottom-0 bg-slate-900 border-t-2 border-sky-500/50 font-extrabold text-xs">
                    <tr>
                      <td className="py-3 px-3 text-sky-300" colSpan={2}>
                        የሁሉም ተጫዋቾች ድምር / ALL PLAYERS TOTAL ({allPlayersSummaryList.length})
                      </td>
                      <td className="py-3 px-3 text-right text-white">
                        {playersTotals.gamesPlayedCount} ዙር / {playersTotals.ticketsCount} ካርቴላ
                      </td>
                      <td className="py-3 px-3 text-right text-emerald-300">
                        {playersTotals.winsCount}
                      </td>
                      <td className="py-3 px-3 text-right text-emerald-400">
                        {formatEtb(playersTotals.wonMinor, 'en')}
                      </td>
                      <td className="py-3 px-3 text-right text-red-300">
                        {playersTotals.lossesCount}
                      </td>
                      <td className="py-3 px-3 text-right text-red-400">
                        {formatEtb(playersTotals.lostMinor, 'en')}
                      </td>
                      <td className="py-3 px-3 text-right text-slate-200">
                        {formatEtb(playersTotals.totalStakedMinor, 'en')}
                      </td>
                      <td
                        className={`py-3 px-3 text-right ${
                          playersTotals.netWinLossMinor >= 0
                            ? 'text-emerald-400'
                            : 'text-red-400'
                        }`}
                      >
                        {playersTotals.netWinLossMinor > 0 ? '+' : ''}
                        {formatEtb(playersTotals.netWinLossMinor, 'en')}
                      </td>
                      <td className="py-3 px-3 text-right text-amber-300">
                        {formatEtb(playersTotals.currentBalanceMinor, 'en')}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            ) : (
              <table className="w-full text-left border-collapse text-xs font-mono tabular-nums">
                <thead className="sticky top-0 z-10 bg-slate-900 border-b border-slate-800 text-slate-300">
                  <tr>
                    <th className="py-2.5 px-3">ቀን (Date)</th>
                    <th className="py-2.5 px-3">ተጫዋች (Player)</th>
                    <th className="py-2.5 px-3">ስልክ (Phone)</th>
                    <th className="py-2.5 px-3 text-right">ዙሮች / ካርቴላ</th>
                    <th className="py-2.5 px-3 text-right text-emerald-300">የበሉት ጊዜ</th>
                    <th className="py-2.5 px-3 text-right text-emerald-400">ዕለታዊ የበሉት (Won ETB)</th>
                    <th className="py-2.5 px-3 text-right text-red-300">የተበሉት ጊዜ</th>
                    <th className="py-2.5 px-3 text-right text-red-400">ዕለታዊ የተበሉት (Lost ETB)</th>
                    <th className="py-2.5 px-3 text-right">ዕለታዊ ውርርድ (Staked)</th>
                    <th className="py-2.5 px-3 text-right">ዕለታዊ ልዩነት (Net P&amp;L)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {filteredPlayerDailyLogs.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="py-6 text-center text-slate-400 font-sans">
                        በተመረጠው ቀን የተመዘገበ የጨዋታ እንቅስቃሴ የለም (No daily player game records in selected period).
                      </td>
                    </tr>
                  ) : (
                    filteredPlayerDailyLogs.map((r) => (
                      <tr key={`${r.date}-${r.userId}`} className="hover:bg-slate-800/60 transition-colors">
                        <td className="py-2.5 px-3 text-slate-300 font-bold">{r.date}</td>
                        <td className="py-2.5 px-3 text-white font-bold">
                          {r.username} <span className="text-slate-500 font-normal">#{r.userId}</span>
                        </td>
                        <td className="py-2.5 px-3 text-slate-300">{r.phone}</td>
                        <td className="py-2.5 px-3 text-right text-slate-300">
                          {r.gamesPlayedCount} ዙር / {r.ticketsCount} ካርቴላ
                        </td>
                        <td className="py-2.5 px-3 text-right text-emerald-300 font-bold">
                          {r.winsCount}
                        </td>
                        <td className="py-2.5 px-3 text-right text-emerald-400 font-extrabold">
                          {formatEtb(r.wonMinor, 'en')}
                        </td>
                        <td className="py-2.5 px-3 text-right text-red-300 font-bold">
                          {r.lossesCount}
                        </td>
                        <td className="py-2.5 px-3 text-right text-red-400 font-extrabold">
                          {formatEtb(r.lostMinor, 'en')}
                        </td>
                        <td className="py-2.5 px-3 text-right text-slate-200">
                          {formatEtb(r.totalStakedMinor, 'en')}
                        </td>
                        <td
                          className={`py-2.5 px-3 text-right font-extrabold ${
                            r.netWinLossMinor > 0
                              ? 'text-emerald-400'
                              : r.netWinLossMinor < 0
                              ? 'text-red-400'
                              : 'text-slate-400'
                          }`}
                        >
                          {r.netWinLossMinor > 0 ? '+' : ''}
                          {formatEtb(r.netWinLossMinor, 'en')}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      {/* Interactive Recharts Visual Analytics */}
      <div className="bg-slate-950 border border-slate-800 rounded-xl p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div className="text-xs font-semibold text-slate-200">
            {chartMode === 'combined' &&
              'ዕለታዊ ተጣራ ገቢ (Net Deposits ETB)፣ የቤት ኮሚሽን (House Commission ETB) እና ንቁ ተጫዋቾች (Active Players)'}
            {chartMode === 'cashflow' &&
              'ዕለታዊ የጸደቀ ገቢ፣ ወጪ እና የቤት ኮሚሽን ገቢ (Daily Cashflow & Commission Breakdown in ETB)'}
            {chartMode === 'players' &&
              'ዕለታዊ ንቁ ተጫዋቾች ብዛት እና የተሸጡ ካርቴላዎች (Daily Active Players & Cartela Volume)'}
          </div>

          <div className="flex items-center gap-1 p-1 bg-slate-900 border border-slate-800 rounded-xl">
            <button
              type="button"
              onClick={() => setChartMode('combined')}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                chartMode === 'combined'
                  ? 'bg-emerald-500 text-slate-950'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              Combined
            </button>
            <button
              type="button"
              onClick={() => setChartMode('cashflow')}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                chartMode === 'cashflow'
                  ? 'bg-emerald-500 text-slate-950'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              Deposits / Withdrawals / Commission
            </button>
            <button
              type="button"
              onClick={() => setChartMode('players')}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                chartMode === 'players'
                  ? 'bg-emerald-500 text-slate-950'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              Players &amp; Cards
            </button>
          </div>
        </div>

        <div className="w-full h-72">
          <ResponsiveContainer width="100%" height="100%">
            {chartMode === 'combined' ? (
              <ComposedChart data={filteredData} margin={{ top: 10, right: 16, left: 4, bottom: 0 }}>
                <defs>
                  <linearGradient id="netDepositsGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis
                  dataKey="label"
                  stroke="#94a3b8"
                  tick={{ fill: '#94a3b8', fontSize: 11 }}
                  tickLine={false}
                  axisLine={{ stroke: '#334155' }}
                />
                <YAxis
                  yAxisId="etb"
                  stroke="#94a3b8"
                  tick={{ fill: '#94a3b8', fontSize: 11 }}
                  tickLine={false}
                  axisLine={{ stroke: '#334155' }}
                  tickFormatter={(v) => `${v} Br`}
                />
                <YAxis
                  yAxisId="players"
                  orientation="right"
                  allowDecimals={false}
                  stroke="#38bdf8"
                  tick={{ fill: '#38bdf8', fontSize: 11 }}
                  tickLine={false}
                  axisLine={{ stroke: '#334155' }}
                  tickFormatter={(v) => `${v} P`}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#020617',
                    borderColor: '#334155',
                    borderRadius: '12px',
                    fontSize: '12px',
                    color: '#f8fafc',
                  }}
                  formatter={(value: any, name: any) => {
                    if (String(name).includes('Players') || String(name).includes('Cartelas')) {
                      return [value, name];
                    }
                    return [`${Number(value).toFixed(2)} ETB`, name];
                  }}
                  labelFormatter={(label, payload) => {
                    const row = payload?.[0]?.payload as DailyRevenuePoint | undefined;
                    return row ? `${label} (${row.date})` : String(label);
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }} />
                <ReferenceLine yAxisId="etb" y={0} stroke="#475569" strokeDasharray="3 3" />
                <Area
                  yAxisId="etb"
                  type="monotone"
                  dataKey="approvedDepositsBirr"
                  name="Daily Deposits (ETB)"
                  stroke="#10b981"
                  strokeWidth={2.5}
                  fill="url(#netDepositsGrad)"
                />
                <Bar
                  yAxisId="etb"
                  dataKey="houseFeeBirr"
                  name="House Commission Earned (ETB)"
                  fill="#a855f7"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={24}
                />
                <Line
                  yAxisId="players"
                  type="monotone"
                  dataKey="activePlayersCount"
                  name="Active Players"
                  stroke="#38bdf8"
                  strokeWidth={2.5}
                  dot={{ r: 3, fill: '#38bdf8', strokeWidth: 0 }}
                  activeDot={{ r: 5 }}
                />
              </ComposedChart>
            ) : chartMode === 'cashflow' ? (
              <BarChart data={filteredData} margin={{ top: 10, right: 16, left: 4, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis
                  dataKey="label"
                  stroke="#94a3b8"
                  tick={{ fill: '#94a3b8', fontSize: 11 }}
                  tickLine={false}
                  axisLine={{ stroke: '#334155' }}
                />
                <YAxis
                  stroke="#94a3b8"
                  tick={{ fill: '#94a3b8', fontSize: 11 }}
                  tickLine={false}
                  axisLine={{ stroke: '#334155' }}
                  tickFormatter={(v) => `${v} Br`}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#020617',
                    borderColor: '#334155',
                    borderRadius: '12px',
                    fontSize: '12px',
                    color: '#f8fafc',
                  }}
                  formatter={(value: any, name: any) => [`${Number(value).toFixed(2)} ETB`, name]}
                />
                <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }} />
                <ReferenceLine y={0} stroke="#475569" strokeDasharray="3 3" />
                <Bar
                  dataKey="approvedDepositsBirr"
                  name="Daily Deposits (ETB)"
                  fill="#10b981"
                  radius={[4, 4, 0, 0]}
                />
                <Bar
                  dataKey="approvedWithdrawalsBirr"
                  name="Daily Withdrawals (ETB)"
                  fill="#f59e0b"
                  radius={[4, 4, 0, 0]}
                />
                <Bar
                  dataKey="houseFeeBirr"
                  name="House Commission (ETB)"
                  fill="#a855f7"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            ) : (
              <AreaChart data={filteredData} margin={{ top: 10, right: 16, left: 4, bottom: 0 }}>
                <defs>
                  <linearGradient id="activePlayersGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#38bdf8" stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="ticketsGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis
                  dataKey="label"
                  stroke="#94a3b8"
                  tick={{ fill: '#94a3b8', fontSize: 11 }}
                  tickLine={false}
                  axisLine={{ stroke: '#334155' }}
                />
                <YAxis
                  allowDecimals={false}
                  stroke="#94a3b8"
                  tick={{ fill: '#94a3b8', fontSize: 11 }}
                  tickLine={false}
                  axisLine={{ stroke: '#334155' }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#020617',
                    borderColor: '#334155',
                    borderRadius: '12px',
                    fontSize: '12px',
                    color: '#f8fafc',
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }} />
                <Area
                  type="monotone"
                  dataKey="activePlayersCount"
                  name="Active Players"
                  stroke="#38bdf8"
                  strokeWidth={2.5}
                  fill="url(#activePlayersGrad)"
                />
                <Area
                  type="monotone"
                  dataKey="ticketsCount"
                  name="Cartelas Sold"
                  stroke="#10b981"
                  strokeWidth={2}
                  fill="url(#ticketsGrad)"
                />
              </AreaChart>
            )}
          </ResponsiveContainer>
        </div>
      </div>
    </section>
  );
}
