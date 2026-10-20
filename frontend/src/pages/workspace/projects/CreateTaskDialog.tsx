import { useState } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Alert } from '@/components/ui/Alert';
import { X, CheckSquare } from 'lucide-react';
import { apiClient, ApiError } from '@/api/client';
import {
  TaskItem,
  TaskPriority,
  TaskStatus,
  ProjectMember,
  TASK_STATUS_LABELS,
  TASK_PRIORITY_LABELS,
} from '@/types/projects';

interface CreateTaskDialogProps {
  isOpen: boolean;
  onClose: () => void;
  organisationId: string;
  projectId: string;
  projectMembers: ProjectMember[];
  initialStatus?: TaskStatus;
  onSuccess: (task: TaskItem) => void;
}

export function CreateTaskDialog({
  isOpen,
  onClose,
  organisationId,
  projectId,
  projectMembers,
  initialStatus = 'backlog',
  onSuccess,
}: CreateTaskDialogProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<TaskStatus>(initialStatus);
  const [priority, setPriority] = useState<TaskPriority>('medium');
  const [assigneeId, setAssigneeId] = useState<string>('');
  const [startDate, setStartDate] = useState('');
  const [dueDate, setDueDate] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);

    if (!title.trim()) {
      setErrorMsg('Task title is required.');
      return;
    }

    if (startDate && dueDate && new Date(startDate) > new Date(dueDate)) {
      setErrorMsg('Start date cannot be after the due date.');
      return;
    }

    try {
      setIsSubmitting(true);
      const payload: Record<string, unknown> = {
        title: title.trim(),
        description: description.trim() || null,
        status,
        priority,
        assigneeId: assigneeId ? assigneeId : null,
        startDate: startDate ? new Date(startDate).toISOString() : null,
        dueDate: dueDate ? new Date(dueDate).toISOString() : null,
      };

      const res = await apiClient<{ task: TaskItem }>(
        `/organisations/${organisationId}/projects/${projectId}/tasks`,
        {
          method: 'POST',
          body: JSON.stringify(payload),
        }
      );

      if (res.data?.task) {
        onSuccess(res.data.task);
        onClose();
        // Reset form
        setTitle('');
        setDescription('');
        setStatus('backlog');
        setPriority('medium');
        setAssigneeId('');
        setStartDate('');
        setDueDate('');
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setErrorMsg(err.message);
      } else {
        setErrorMsg('An unexpected error occurred while creating the task.');
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-task-title"
    >
      <Card className="w-full max-w-lg shadow-xl border-neutral-200">
        <CardHeader className="flex flex-row items-center justify-between border-b border-neutral-100 pb-4">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
              <CheckSquare className="w-5 h-5" />
            </div>
            <div>
              <CardTitle id="create-task-title" className="text-lg">
                Create New Task
              </CardTitle>
              <CardDescription>
                Add a task to the project backlog or assign it to a team member.
              </CardDescription>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-neutral-400 hover:text-neutral-600 p-1 rounded-md transition-colors"
            aria-label="Close dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </CardHeader>

        <CardContent className="pt-5">
          {errorMsg && (
            <div className="mb-4">
              <Alert variant="error" title="Task Creation Failed">
                {errorMsg}
              </Alert>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="task-title"
                className="block text-sm font-medium text-neutral-700 mb-1"
              >
                Task Title <span className="text-red-500">*</span>
              </label>
              <Input
                id="task-title"
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Implement user authentication tests"
                maxLength={255}
                disabled={isSubmitting}
              />
            </div>

            <div>
              <label
                htmlFor="task-desc"
                className="block text-sm font-medium text-neutral-700 mb-1"
              >
                Description
              </label>
              <textarea
                id="task-desc"
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Technical details, acceptance criteria, or implementation notes..."
                disabled={isSubmitting}
                className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:opacity-50"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="task-status"
                  className="block text-sm font-medium text-neutral-700 mb-1"
                >
                  Status
                </label>
                <select
                  id="task-status"
                  value={status}
                  onChange={(e) => setStatus(e.target.value as TaskStatus)}
                  disabled={isSubmitting}
                  className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                >
                  {(['backlog', 'todo', 'in_progress', 'blocked'] as TaskStatus[]).map((st) => (
                    <option key={st} value={st}>
                      {TASK_STATUS_LABELS[st]}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="task-priority"
                  className="block text-sm font-medium text-neutral-700 mb-1"
                >
                  Priority
                </label>
                <select
                  id="task-priority"
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as TaskPriority)}
                  disabled={isSubmitting}
                  className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                >
                  {(['low', 'medium', 'high', 'urgent'] as TaskPriority[]).map((p) => (
                    <option key={p} value={p}>
                      {TASK_PRIORITY_LABELS[p]}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label
                htmlFor="task-assignee"
                className="block text-sm font-medium text-neutral-700 mb-1"
              >
                Assignee
              </label>
              <select
                id="task-assignee"
                value={assigneeId}
                onChange={(e) => setAssigneeId(e.target.value)}
                disabled={isSubmitting}
                className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white"
              >
                <option value="">Unassigned</option>
                {projectMembers.map((m) => (
                  <option key={m.userId} value={m.userId}>
                    {m.userName || m.userEmail} ({m.role})
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-neutral-500">
                Only active project members can be assigned tasks (PRJ-004).
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="task-start-date"
                  className="block text-sm font-medium text-neutral-700 mb-1"
                >
                  Start Date
                </label>
                <Input
                  id="task-start-date"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  disabled={isSubmitting}
                />
              </div>

              <div>
                <label
                  htmlFor="task-due-date"
                  className="block text-sm font-medium text-neutral-700 mb-1"
                >
                  Due Date
                </label>
                <Input
                  id="task-due-date"
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  disabled={isSubmitting}
                />
              </div>
            </div>

            <div className="flex items-center justify-end space-x-3 pt-4 border-t border-neutral-100">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Creating...' : 'Create Task'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
