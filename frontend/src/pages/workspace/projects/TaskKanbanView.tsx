import { useState } from 'react';
import { CalendarDays, Plus, UserRound } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import {  TASK_PRIORITY_LABELS, TASK_PRIORITY_VARIANTS, TASK_STATUS_LABELS, type TaskStatus } from '@/types/projects';
import { availableTaskMoves, TaskStatusControl, type TaskViewProps } from './TaskStatusControl';
import './projects.css';

interface TaskKanbanViewProps extends TaskViewProps {
  onCreateInColumn?: (status: TaskStatus) => void;
}

const columns = Object.keys(TASK_STATUS_LABELS) as TaskStatus[];

export function TaskKanbanView({ tasks, onTaskClick, onStatusChange, onCreateInColumn, canUpdate, canReopen, pendingTaskIds }: TaskKanbanViewProps) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const dragged = tasks.find(task => task.id === draggingId);
  return (
    <div className="project-task-board" aria-label="Task board" role="region" tabIndex={0}>
      {columns.map(status => {
        const items = tasks.filter(task => task.status === status);
        const acceptsDrop = dragged && !pendingTaskIds.has(dragged.id) && availableTaskMoves(dragged, canUpdate, canReopen).includes(status);
        return (
          <section className="project-board-column" key={status} aria-label={TASK_STATUS_LABELS[status]} data-drop-target={Boolean(acceptsDrop)}
            onDragOver={event => { if (acceptsDrop) { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; } }}
            onDrop={event => {
              if (!acceptsDrop || event.dataTransfer.getData('text/plain') !== dragged.id) return;
              event.preventDefault();
              setDraggingId(null);
              void onStatusChange(dragged, status);
            }}>
            <header>
              <h3>{TASK_STATUS_LABELS[status]} <span aria-label={items.length + ' tasks'}>{items.length}</span></h3>
              {onCreateInColumn && status !== 'done' && <button type="button"
                aria-label={'Add task to ' + TASK_STATUS_LABELS[status]} onClick={() => onCreateInColumn(status)}><Plus size={16} /></button>}
            </header>
            {items.length ? <ul>
              {items.map(task => {
                const busy = pendingTaskIds.has(task.id);
                const moves = availableTaskMoves(task, canUpdate, canReopen);
                return (
                  <li key={task.id} aria-busy={busy} draggable={moves.length > 0 && !busy}
                    onDragStart={event => {
                      if (!moves.length || busy) { event.preventDefault(); return; }
                      setDraggingId(task.id);
                      event.dataTransfer.effectAllowed = 'move';
                      event.dataTransfer.setData('text/plain', task.id);
                    }}
                    onDragEnd={() => setDraggingId(null)}>
                    <div className="project-status-row"><Badge variant={TASK_PRIORITY_VARIANTS[task.priority]}>{TASK_PRIORITY_LABELS[task.priority]} priority</Badge>
                      {task.isOverdue ? <Badge variant="danger">Overdue</Badge> : task.isDueSoon && <Badge variant="warning">Due soon</Badge>}
                    </div>
                    <button type="button" className="project-task-title" onClick={() => onTaskClick(task)}>{task.title}</button>
                    {task.description && <p className="project-task-preview">{task.description}</p>}
                    <div className="project-task-meta">
                      <span><UserRound size={14} aria-hidden="true" />{task.assigneeName || 'Unassigned'}</span>
                      {task.dueDate && <span><CalendarDays size={14} aria-hidden="true" /><time dateTime={task.dueDate}>{new Date(task.dueDate).toLocaleDateString()}</time></span>}
                    </div>
                    <TaskStatusControl task={task} moves={moves} pending={busy} onStatusChange={onStatusChange} />
                  </li>
                );
              })}
            </ul> : <p className="project-column-empty">No tasks</p>}
          </section>
        );
      })}
    </div>
  );
}
