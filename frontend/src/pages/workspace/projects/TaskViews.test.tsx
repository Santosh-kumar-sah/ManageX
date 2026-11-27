import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { TaskItem } from '@/types/projects';
import { TaskKanbanView } from './TaskKanbanView';
import { TaskListView } from './TaskListView';
import { availableTaskMoves } from './TaskStatusControl';

const task: TaskItem = {
  id: 't1', organisationId: 'org', projectId: 'project', title: 'Prepare brief',
  status: 'backlog', priority: 'medium', createdById: 'owner', createdByName: null,
  description: null, assigneeId: null, assigneeName: null, assigneeEmail: null,
  startDate: null, dueDate: null, labels: [], isOverdue: false, isDueSoon: false,
  deletedAt: null, createdAt: '2026-01-01', updatedAt: '2026-01-01',
};
const props = { tasks: [task], onStatusChange: vi.fn(), onTaskClick: vi.fn(), pendingTaskIds: new Set<string>() };

describe('Project task views', () => {
  it('shows the same permitted keyboard moves in both views', () => {
    for (const View of [TaskKanbanView, TaskListView]) {
      const html = renderToStaticMarkup(<View {...props} canUpdate canReopen={false} />);
      expect(html).toContain('aria-label="Move Prepare brief to another status"');
      expect(html).toContain('<option value="todo">To Do</option>');
      expect(html).not.toContain('<option value="done">');
    }
  });

  it('keeps tasks readable when editing is unavailable and suppresses duplicate moves while saving', () => {
    for (const View of [TaskKanbanView, TaskListView]) {
      const readOnly = renderToStaticMarkup(<View {...props} canUpdate={false} canReopen={false} />);
      expect(readOnly).toContain('Prepare brief');
      expect(readOnly).not.toContain('<select');
      expect(readOnly).not.toContain('draggable="true"');
      const busy = renderToStaticMarkup(<View {...props} pendingTaskIds={new Set([task.id])} canUpdate canReopen />);
      expect(busy).toMatch(/<select[^>]*disabled/);
      expect(busy).not.toContain('draggable="true"');
    }
  });

  it('limits reopening completed tasks to people who can both update and reopen', () => {
    const completed: TaskItem = { ...task, status: 'done' };
    expect(availableTaskMoves(completed, true, false)).toEqual([]);
    expect(availableTaskMoves(completed, false, true)).toEqual([]);
    expect(availableTaskMoves(completed, true, true)).toEqual(['in_progress']);
  });
});
