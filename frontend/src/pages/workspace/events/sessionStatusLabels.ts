import type { EvaluationSessionStatus } from '@/types/events';

export const sessionStatusLabels: Record<EvaluationSessionStatus, string> = {
  scheduled: 'Scheduled',
  in_progress: 'In progress',
  completed: 'Completed',
  no_show: 'No show',
  cancelled: 'Cancelled',
  rescheduled: 'Rescheduled',
};
