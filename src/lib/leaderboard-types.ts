export type User = {
  id: string;
  email: string | null;
  displayName: string;
  emailVerifiedAt: number | null;
  createdAt: number;
};

export type FieldJournal = {
  id: string;
  userId: string;
  streak: number;
  totalScore: number;
  filterHash: string;
  filterLabel: string;
  createdAt: number;
};

export type Sighting = {
  id: number;
  journalId: string;
  roundIndex: number;
  taxonId: number | null;
  taxonName: string;
  distanceKm: number;
  score: number;
  hintsUsed: number;
  passed: boolean;
};

// API request/response types

export type RegisterRequest = {
  userId: string;
  nickname: string;
};

export type RegisterResponse = {
  userId: string;
  displayName: string;
};

export type SendMagicLinkRequest = {
  userId: string;
  email: string;
};

export type SendMagicLinkResponse = {
  sent: boolean;
};

export type VerifyResponse = {
  verified: boolean;
  userId?: string;
};

export type MeResponse = {
  user: User | null;
};

export type SightingInput = {
  roundIndex: number;
  taxonId: number | null;
  taxonName: string;
  distanceKm: number;
  score: number;
  hintsUsed: number;
  passed: boolean;
};

export type SubmitJournalRequest = {
  journalId: string;
  userId: string;
  streak: number;
  totalScore: number;
  filterHash: string;
  filterLabel: string;
  rounds: SightingInput[];
};

export type SubmitJournalResponse = {
  journalId: string;
  rank: {
    streak: number;
    totalScore: number;
  };
};

export type LeaderboardEntry = {
  rank: number;
  displayName: string;
  value: number;
  filterLabel: string;
  verified: boolean;
};

export type LeaderboardType = 'streak' | 'totalScore';
export type LeaderboardWindow = 'allTime' | 'daily';

export type LeaderboardResponse = {
  type: LeaderboardType;
  window: LeaderboardWindow;
  entries: LeaderboardEntry[];
  userRank: number | null;
  userValue: number | null;
};
