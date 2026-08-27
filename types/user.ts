export interface ScheduleSlot {
  time: string; // "HH:MM" in 24h format
  count: number; // commits to produce in this burst (1–3)
  lastRun: string | null; // "YYYY-MM-DD" of the last run in user's timezone, or null
}

export interface UserConfig {
  githubId: string;
  githubLogin: string;
  encryptedToken: string;
  owner: string;
  repo: string;
  targetFile: string;
  timezone: string;
  slots: ScheduleSlot[];
  createdAt: string;
  updatedAt: string;
}

export type PublicUser = Omit<UserConfig, "encryptedToken"> & {
  isAdmin?: boolean;
};

export interface AdminUser {
  githubLogin: string;
  owner: string;
  repo: string;
  targetFile: string;
  timezone: string;
  slots: { time: string; count: number }[];
  createdAt: string;
  updatedAt: string;
}
