import { Badge } from '@/components/ui/Badge';
import { TASK_STATUS_LABELS, TASK_STATUS_VARIANTS, TASK_PRIORITY_LABELS, TASK_PRIORITY_VARIANTS } from '@/types/projects';
import { availableTaskMoves, TaskStatusControl, type TaskViewProps } from './TaskStatusControl';
import './projects.css';

export function TaskListView({ tasks, onTaskClick, onStatusChange, canUpdate, canReopen, pendingTaskIds }: TaskViewProps) {
  if (!tasks.length) return (
    <div className="project-empty"><h3>No tasks to show</h3><p>Tasks matching your current view will appear here.</p></div>
  );
  return (
    <table className="project-task-list" aria-label="Project tasks">
      <thead><tr><th scope="col">Task</th><th scope="col">Status</th><th scope="col">Priority</th><th scope="col">Assignee</th><th scope="col">Due date</th>
        {canUpdate && <th scope="col"><span className="sr-only">Change status</span></th>}
      </tr></thead>
      <tbody>
        {tasks.map(task => <tr key={task.id} aria-busy={pendingTaskIds.has(task.id)}>
          <th scope="row"><button type="button" className="project-task-title" onClick={() => onTaskClick(task)}>{task.title}</button>
            {task.description && <p className="project-task-preview">{task.description}</p>}
          </th>
          <td data-label="Status"><Badge variant={TASK_STATUS_VARIANTS[task.status]}>{TASK_STATUS_LABELS[task.status]}</Badge></td>
          <td data-label="Priority"><Badge variant={TASK_PRIORITY_VARIANTS[task.priority]}>{TASK_PRIORITY_LABELS[task.priority]}</Badge></td>
          <td data-label="Assignee">{task.assigneeName || 'Unassigned'}</td>
          <td data-label="Due date"><div className="project-date-cell">{task.dueDate ? <time dateTime={task.dueDate}>{new Date(task.dueDate).toLocaleDateString()}</time> : 'No due date'}
            {task.isOverdue ? <Badge variant="danger">Overdue</Badge> : task.isDueSoon && <Badge variant="warning">Due soon</Badge>}</div></td>
          {canUpdate && <td><TaskStatusControl task={task} moves={availableTaskMoves(task, canUpdate, canReopen)} pending={pendingTaskIds.has(task.id)} onStatusChange={onStatusChange} /></td>}
        </tr>)}
      </tbody>
    </table>
  );
}
