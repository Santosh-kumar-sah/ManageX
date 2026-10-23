export type EventStatus =
  | 'draft'
  | 'published'
  | 'registration_closed'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'archived';

export type EventType = 'general_event' | 'hackathon';
export type EventVisibility = 'public' | 'private';
export type EventLocationType = 'in_person' | 'virtual' | 'hybrid';

export interface EventItem {
  id: string;
  organisationId: string;
  title: string;
  slug: string;
  description?: string;
  eventType: EventType;
  status: EventStatus;
  visibility: EventVisibility;
  startAt: string;
  endAt: string;
  timezone: string;
  locationType: EventLocationType;
  location?: string;
  virtualUrl?: string;
  registrationOpensAt?: string | null;
  registrationClosesAt?: string | null;
  capacity?: number | null;
  teamSizeMin?: number;
  teamSizeMax?: number;
  submissionOpensAt?: string | null;
  submissionClosesAt?: string | null;
  resultsPublishedAt?: string | null;
  participantInstructions?: string;
  organisation?: {
    id: string;
    name: string;
    slug: string;
  };
  createdAt: string;
  updatedAt: string;
}

export const EVENT_STATUS_LABELS: Record<EventStatus, string> = {
  draft: 'Draft',
  published: 'Published',
  registration_closed: 'Registration Closed',
  in_progress: 'In Progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
  archived: 'Archived',
};

export const EVENT_STATUS_VARIANTS: Record<
  EventStatus,
  'neutral' | 'brand' | 'success' | 'warning' | 'danger'
> = {
  draft: 'neutral',
  published: 'brand',
  registration_closed: 'warning',
  in_progress: 'success',
  completed: 'neutral',
  cancelled: 'danger',
  archived: 'neutral',
};

export const ALLOWED_TRANSITIONS: Record<EventStatus, EventStatus[]> = {
  draft: ['published', 'archived'],
  published: ['registration_closed', 'in_progress', 'cancelled', 'archived'],
  registration_closed: ['in_progress', 'cancelled', 'archived'],
  in_progress: ['completed', 'cancelled', 'archived'],
  completed: ['archived'],
  cancelled: ['archived'],
  archived: [],
};

export type RegistrationStatus = 'registered' | 'withdrawn';

export interface RegistrationItem {
  id: string;
  organisationId: string;
  eventId: string;
  userId: string;
  status: RegistrationStatus;
  registeredAt: string;
  withdrawnAt?: string | null;
  reactivatedAt?: string | null;
  customAnswers?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  user?: {
    id: string;
    email: string;
    fullName: string;
  };
  participantInstructions?: string | null;
}

export interface TeamMember {
  id: string;
  userId: string;
  isOwner: boolean;
  joinedAt: string;
  user?: {
    id: string;
    email: string;
    fullName: string;
  };
  participantInstructions?: string | null;
}

export interface TeamItem {
  id: string;
  organisationId: string;
  eventId: string;
  name: string;
  slug: string;
  description?: string | null;
  createdById: string;
  createdAt: string;
  updatedAt: string;
  memberCount: number;
  members?: TeamMember[];
  owner?: {
    id: string;
    email: string;
    fullName: string;
  };
}

export interface TeamInvitation {
  id: string;
  teamId: string;
  invitedEmail: string;
  status: 'pending' | 'accepted' | 'rejected' | 'revoked' | 'expired';
  createdAt: string;
  expiresAt: string;
  acceptedAt?: string | null;
  revokedAt?: string | null;
}

export interface MyPendingInvitation {
  id: string;
  teamId: string;
  teamName: string;
  teamSlug: string;
  invitedByName: string;
  createdAt: string;
  expiresAt: string;
}

export interface SubmissionItem {
  id: string;
  organisationId: string;
  eventId: string;
  roundId?: string | null;
  teamId?: string | null;
  teamName?: string | null;
  submitterUserId: string;
  submitterName?: string | null;
  submitterEmail?: string | null;
  title: string;
  description?: string | null;
  repositoryUrl?: string | null;
  demoUrl?: string | null;
  customFields?: Record<string, unknown>;
  status: 'submitted' | 'draft' | 'withdrawn';
  submittedAt: string;
  updatedAt: string;
}

export interface ScoringCriterion {
  id: string;
  organisationId: string;
  eventId: string;
  roundId?: string | null;
  name: string;
  description?: string | null;
  orderIndex: number;
  maxScore: number;
  createdAt: string;
}

export interface JudgeAssignment {
  id: string;
  organisationId: string;
  eventId: string;
  judgeUserId: string;
  judgeEmail: string;
  judgeName?: string | null;
  submissionId?: string | null;
  submissionTitle?: string | null;
  createdAt: string;
}

export interface JudgeWorkItem {
  submissionId: string;
  title: string;
  description?: string | null;
  repositoryUrl?: string | null;
  demoUrl?: string | null;
  teamName?: string | null;
  scores: Array<{
    criterionId: string;
    score: number;
    feedback?: string | null;
    updatedAt: string;
  }>;
  isFullyEvaluated: boolean;
}

export interface EventResultItem {
  submissionId: string;
  title: string;
  description?: string | null;
  repositoryUrl?: string | null;
  demoUrl?: string | null;
  teamId?: string | null;
  teamName?: string | null;
  totalScore: number;
  scoreCount: number;
  rank: number;
  isComplete: boolean;
}

export interface EventResultsData {
  eventId: string;
  isPublished: boolean;
  publishedAt?: string | null;
  isPublishable: boolean;
  criteria: Array<{
    id: string;
    name: string;
    maxScore: number;
  }>;
  results: EventResultItem[];
}

export type RoundAdvancementRule = 'manual' | 'score_threshold' | 'top_n';
export type RoundStatus = 'pending' | 'open' | 'judging' | 'completed';

export interface EventRound {
  id: string;
  organisationId: string;
  eventId: string;
  roundNumber: number;
  name: string;
  description?: string | null;
  instructions?: string | null;
  submissionOpensAt?: string | null;
  submissionClosesAt?: string | null;
  advancementRule: RoundAdvancementRule;
  advancementThreshold?: number | null;
  advancementTopN?: number | null;
  status: RoundStatus;
  resultsPublishedAt?: string | null;
  resultsPublishedById?: string | null;
  resultsScheduledAt?: string | null;
  createdAt: string;
  updatedAt: string;
  submissionCount?: number;
  criteriaCount?: number;
  advancementCount?: number;
}

export type AdvancementStatus = 'qualified' | 'eliminated' | 'disqualified';

export interface EventRoundAdvancement {
  id: string;
  organisationId: string;
  eventId: string;
  roundId: string;
  teamId?: string | null;
  teamName?: string | null;
  participantUserId?: string | null;
  participantName?: string | null;
  participantEmail?: string | null;
  status: AdvancementStatus;
  qualificationScore?: number | null;
  qualificationRank?: number | null;
  advancedById: string;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RoundResultsData {
  eventId: string;
  roundId: string;
  roundNumber: number;
  roundName: string;
  isPublished: boolean;
  publishedAt?: string | null;
  criteria: Array<{
    id: string;
    name: string;
    maxScore: number;
  }>;
  results: Array<{
    submissionId: string;
    title: string;
    description?: string | null;
    repositoryUrl?: string | null;
    demoUrl?: string | null;
    teamId?: string | null;
    teamName?: string | null;
    submitterUserId?: string | null;
    submitterName?: string | null;
    totalScore: number;
    scoreCount: number;
    rank: number;
    qualificationStatus?: AdvancementStatus | null;
  }>;
}


