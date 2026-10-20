import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import {
  Calendar,
  AlertCircle,
  Clock,
  ArrowRight,
  CheckCircle2,
  Circle,
  AlertTriangle,
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

interface TaskListViewProps {
  tasks: TaskItem[];
  onTaskClick: (task: TaskItem) => void;
  onStatusChange: (task: TaskItem, newStatus: TaskStatus) => Promise<void>;
  isProjectArchived: boolean;
}

export function TaskListView({
  tasks,
  onTaskClick,
  onStatusChange,
  isProjectArchived,
}: TaskListViewProps) {
  if (tasks.length === 0) {
    return (
      <div className="text-center py-12 bg-white rounded-lg border border-neutral-200">
        <Circle className="mx-auto h-12 w-12 text-neutral-300" />
        <h3 className="mt-2 text-sm font-medium text-neutral-900">No tasks found</h3>
        <p className="mt-1 text-sm text-neutral-500">
          No tasks match the selected filters. Try adjusting your search or filters.
        </p>
      </div>
    );
  }

  function getStatusIcon(status: TaskStatus) {
    switch (status) {
      case 'done':
        return <CheckCircle2 className="w-4 h-4 text-emerald-600" />;
      case 'in_progress':
        return <Clock className="w-4 h-4 text-amber-500" />;
      case 'blocked':
        return <AlertTriangle className="w-4 h-4 text-red-500" />;
      default:
        return <Circle className="w-4 h-4 text-neutral-400" />;
    }
  }

  return (
    <div className="overflow-x-auto bg-white rounded-lg border border-neutral-200 shadow-sm">
      <table className="min-w-full divide-y divide-neutral-200 text-left text-sm">
        <thead className="bg-neutral-50 font-medium text-neutral-600">
          <tr>
            <th scope="col" className="py-3 px-4 w-12">
              <span className="sr-only">Status</span>
            </th>
            <th scope="col" className="py-3 px-4">
              Task
            </th>
            <th scope="col" className="py-3 px-4">
              Status
            </th>
            <th scope="col" className="py-3 px-4">
              Priority
            </th>
            <th scope="col" className="py-3 px-4">
              Assignee
            </th>
            <th scope="col" className="py-3 px-4">
              Due Date
            </th>
            <th scope="col" className="py-3 px-4 text-right">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-200 bg-white">
          {tasks.map((task) => {
            const nextStatuses = TASK_ALLOWED_TRANSITIONS[task.status] || [];
            return (
              <tr
                key={task.id}
                className="hover:bg-neutral-50/80 transition-colors group cursor-pointer"
                onClick={() => onTaskClick(task)}
              >
                <td className="py-3.5 px-4 text-center">
                  {getStatusIcon(task.status)}
                </td>
                <td className="py-3.5 px-4">
                  <div className="font-medium text-neutral-900 group-hover:text-indigo-600 transition-colors">
                    {task.title}
                  </div>
                  {task.description && (
                    <div className="text-xs text-neutral-500 truncate max-w-md mt-0.5">
                      {task.description}
                    </div>
                  )}
                </td>
                <td className="py-3.5 px-4 whitespace-nowrap">
                  <Badge variant={TASK_STATUS_VARIANTS[task.status]}>
                    {TASK_STATUS_LABELS[task.status]}
                  </Badge>
                </td>
                <td className="py-3.5 px-4 whitespace-nowrap">
                  <Badge variant={TASK_PRIORITY_VARIANTS[task.priority]}>
                    {TASK_PRIORITY_LABELS[task.priority]}
                  </Badge>
                </td>
                <td className="py-3.5 px-4 whitespace-nowrap text-neutral-600">
                  {task.assigneeName ? (
                    <span className="text-sm">{task.assigneeName}</span>
                  ) : (
                    <span className="text-xs text-neutral-400 italic">Unassigned</span>
                  )}
                </td>
                <td className="py-3.5 px-4 whitespace-nowrap">
                  {task.dueDate ? (
                    <div className="flex items-center space-x-1.5">
                      <Calendar className="w-3.5 h-3.5 text-neutral-400" />
                      <span
                        className={`text-xs font-medium ${
                          task.isOverdue
                            ? 'text-red-600 font-semibold'
                            : task.isDueSoon
                            ? 'text-amber-600'
                            : 'text-neutral-600'
                        }`}
                      >
                        {new Date(task.dueDate).toLocaleDateString()}
                      </span>
                      {task.isOverdue && (
                        <span className="inline-flex items-center text-[10px] px-1.5 py-0.2 rounded bg-red-100 text-red-700 font-bold">
                          <AlertCircle className="w-2.5 h-2.5 mr-0.5" /> Overdue
                        </span>
                      )}
                    </div>
                  ) : (
                    <span className="text-xs text-neutral-400">—</span>
                  )}
                </td>
                <td
                  className="py-3.5 px-4 text-right whitespace-nowrap"
                  onClick={(e) => e.stopPropagation()}
                >
                  {!isProjectArchived && nextStatuses.length > 0 && (
                    <div className="inline-flex items-center space-x-1">
                      {nextStatuses.map((nxt) => (
                        <Button
                          key={nxt}
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 px-2"
                          onClick={() => onStatusChange(task, nxt)}
                          title={`Move to ${TASK_STATUS_LABELS[nxt]}`}
                        >
                          <span>{TASK_STATUS_LABELS[nxt]}</span>
                          <ArrowRight className="w-3 h-3 ml-1" />
                        </Button>
                      ))}
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
