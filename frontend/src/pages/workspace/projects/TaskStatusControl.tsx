import { TASK_ALLOWED_TRANSITIONS, TASK_STATUS_LABELS, type TaskItem, type TaskStatus } from '@/types/projects';

export interface TaskViewProps {
  tasks: TaskItem[];
  onTaskClick: (task: TaskItem) => void;
  onStatusChange: (task: TaskItem, newStatus: TaskStatus) => Promise<void>;
  canUpdate: boolean;
  canReopen: boolean;
  pendingTaskIds: ReadonlySet<string>;
}

export function availableTaskMoves(task: TaskItem, canUpdate: boolean, canReopen: boolean): TaskStatus[] {
  return canUpdate && (task.status !== 'done' || canReopen) ? TASK_ALLOWED_TRANSITIONS[task.status] : [];
}

export function TaskStatusControl({ task, onStatusChange, moves, pending }: {
  task: TaskItem;
  onStatusChange: TaskViewProps['onStatusChange'];
  pending: boolean;
  moves: TaskStatus[];
}) {
  if (!moves.length) return null;
  return (
    <select className="project-task-move" aria-label={'Move ' + task.title + ' to another status'} value="" disabled={pending}
      onChange={event => {
        const next = event.target.value as TaskStatus;
        if (moves.includes(next)) void onStatusChange(task, next);
      }}>
      <option value="" disabled>{pending ? 'Moving…' : 'Move to…'}</option>
      {moves.map(next => <option key={next} value={next}>{TASK_STATUS_LABELS[next]}</option>)}
    </select>
  );
}
