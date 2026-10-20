import { useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import {
  Calendar,
  AlertCircle,
  Clock,
  ChevronLeft,
  ChevronRight,
  Plus,
} from 'lucide-react';
import {
  TaskItem,
  TaskStatus,
  TASK_STATUS_LABELS,
  TASK_STATUS_VARIANTS,
  TASK_PRIORITY_LABELS,
  TASK_PRIORITY_VARIANTS,
  TASK_ALLOWED_TRANSITIONS,
} from '@/types/projects';

interface TaskKanbanViewProps {
  tasks: TaskItem[];
  onTaskClick: (task: TaskItem) => void;
  onStatusChange: (task: TaskItem, newStatus: TaskStatus) => Promise<void>;
  onCreateInColumn?: (status: TaskStatus) => void;
  isProjectArchived: boolean;
}

const KANBAN_COLUMNS: TaskStatus[] = [
  'backlog',
  'todo',
  'in_progress',
  'blocked',
  'done',
];

export function TaskKanbanView({
  tasks,
  onTaskClick,
  onStatusChange,
  onCreateInColumn,
  isProjectArchived,
}: TaskKanbanViewProps) {
  const [transitioningTaskId, setTransitioningTaskId] = useState<string | null>(null);

  // Group tasks by status
  const columnsData: Record<TaskStatus, TaskItem[]> = {
    backlog: [],
    todo: [],
    in_progress: [],
    blocked: [],
    done: [],
  };

  tasks.forEach((t) => {
    if (columnsData[t.status]) {
      columnsData[t.status].push(t);
    }
  });

  async function handleMove(task: TaskItem, targetStatus: TaskStatus) {
    try {
      setTransitioningTaskId(task.id);
      await onStatusChange(task, targetStatus);
    } finally {
      setTransitioningTaskId(null);
    }
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4 items-start overflow-x-auto pb-4">
      {KANBAN_COLUMNS.map((columnKey) => {
        const columnTasks = columnsData[columnKey];
        const statusVariant = TASK_STATUS_VARIANTS[columnKey];

        return (
          <div
            key={columnKey}
            className="bg-neutral-50/80 rounded-xl border border-neutral-200/80 p-3 flex flex-col min-w-[240px] max-w-full"
          >
            {/* Column Header */}
            <div className="flex items-center justify-between mb-3 pb-2 border-b border-neutral-200">
              <div className="flex items-center space-x-2">
                <Badge variant={statusVariant} className="text-xs">
                  {TASK_STATUS_LABELS[columnKey]}
                </Badge>
                <span className="text-xs font-semibold text-neutral-500 bg-neutral-200/80 rounded-full px-2 py-0.5">
                  {columnTasks.length}
                </span>
              </div>
              {!isProjectArchived && onCreateInColumn && columnKey !== 'done' && (
                <button
                  type="button"
                  onClick={() => onCreateInColumn(columnKey)}
                  className="text-neutral-400 hover:text-indigo-600 p-1 rounded hover:bg-neutral-200/60 transition-colors"
                  title={`Add task to ${TASK_STATUS_LABELS[columnKey]}`}
                  aria-label={`Add task to ${TASK_STATUS_LABELS[columnKey]}`}
                >
                  <Plus className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Task Cards Column Body */}
            <div className="space-y-2.5 min-h-[150px]">
              {columnTasks.length === 0 ? (
                <div className="text-center py-8 text-neutral-400 text-xs italic">
                  No tasks
                </div>
              ) : (
                columnTasks.map((task) => {
                  const allowedTransitions = TASK_ALLOWED_TRANSITIONS[task.status] || [];
                  const isTransitioning = transitioningTaskId === task.id;

                  // Find previous and next logical targets for accessible button movements
                  const nextTarget = allowedTransitions[0];
                  // If in todo, backlog is backward, in_progress is forward
                  const prevTarget =
                    task.status === 'todo'
                      ? 'backlog'
                      : task.status === 'blocked'
                      ? 'in_progress'
                      : null;

                  return (
                    <div
                      key={task.id}
                      onClick={() => onTaskClick(task)}
                      className={`bg-white p-3 rounded-lg border border-neutral-200 shadow-sm hover:shadow hover:border-indigo-300 transition-all cursor-pointer relative ${
                        isTransitioning ? 'opacity-50 pointer-events-none' : ''
                      }`}
                    >
                      {/* Priority & Due Date Badges */}
                      <div className="flex items-center justify-between mb-1.5">
                        <Badge
                          variant={TASK_PRIORITY_VARIANTS[task.priority]}
                          className="text-[10px] px-1.5 py-0"
                        >
                          {TASK_PRIORITY_LABELS[task.priority]}
                        </Badge>
                        {task.isOverdue ? (
                          <span className="inline-flex items-center text-[10px] text-red-600 font-bold">
                            <AlertCircle className="w-2.5 h-2.5 mr-0.5" /> Overdue
                          </span>
                        ) : task.isDueSoon ? (
                          <span className="inline-flex items-center text-[10px] text-amber-600 font-medium">
                            <Clock className="w-2.5 h-2.5 mr-0.5" /> Due Soon
                          </span>
                        ) : null}
                      </div>

                      {/* Title */}
                      <h4 className="text-sm font-medium text-neutral-900 leading-snug mb-1">
                        {task.title}
                      </h4>

                      {/* Description preview */}
                      {task.description && (
                        <p className="text-xs text-neutral-500 line-clamp-2 mb-2 leading-relaxed">
                          {task.description}
                        </p>
                      )}

                      {/* Assignee & Dates footer */}
                      <div className="flex items-center justify-between text-xs text-neutral-500 pt-2 border-t border-neutral-100">
                        <span className="truncate max-w-[110px]" title={task.assigneeName || 'Unassigned'}>
                          {task.assigneeName || <span className="italic text-neutral-400">Unassigned</span>}
                        </span>

                        {task.dueDate && (
                          <div className="flex items-center space-x-1 text-neutral-400">
                            <Calendar className="w-3 h-3" />
                            <span className="text-[11px]">
                              {new Date(task.dueDate).toLocaleDateString(undefined, {
                                month: 'short',
                                day: 'numeric',
                              })}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Accessible Keyboard/Button Status Movement Controls */}
                      {!isProjectArchived && allowedTransitions.length > 0 && (
                        <div
                          className="mt-2.5 pt-2 border-t border-neutral-100 flex items-center justify-between"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {prevTarget && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 px-1.5 text-[11px] text-neutral-600 hover:text-neutral-900"
                              onClick={() => handleMove(task, prevTarget)}
                              title={`Move back to ${TASK_STATUS_LABELS[prevTarget]}`}
                            >
                              <ChevronLeft className="w-3 h-3 mr-0.5" />
                              <span>{TASK_STATUS_LABELS[prevTarget]}</span>
                            </Button>
                          )}

                          {nextTarget && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 px-1.5 text-[11px] text-indigo-600 hover:text-indigo-800 ml-auto"
                              onClick={() => handleMove(task, nextTarget)}
                              title={`Move to ${TASK_STATUS_LABELS[nextTarget]}`}
                            >
                              <span>{TASK_STATUS_LABELS[nextTarget]}</span>
                              <ChevronRight className="w-3 h-3 ml-0.5" />
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
