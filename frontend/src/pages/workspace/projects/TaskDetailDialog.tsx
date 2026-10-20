import { useState, useEffect, useCallback } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Alert } from '@/components/ui/Alert';
import {
  X,
  Calendar,
  User,
  Clock,
  Trash2,
  ArrowRight,
  AlertCircle,
  Edit2,
  Check,
  MessageSquare,
  Send,
} from 'lucide-react';
import { apiClient, ApiError } from '@/api/client';
import { useAuth } from '@/api/AuthContext';
import {
  TaskItem,
  TaskStatus,
  TaskPriority,
  ProjectMember,
  TaskComment,
  TASK_STATUS_LABELS,
  TASK_STATUS_VARIANTS,
  TASK_PRIORITY_LABELS,
  TASK_PRIORITY_VARIANTS,
  TASK_ALLOWED_TRANSITIONS,
} from '@/types/projects';

interface TaskDetailDialogProps {
  isOpen: boolean;
  onClose: () => void;
  task: TaskItem;
  organisationId: string;
  projectId: string;
  projectMembers: ProjectMember[];
  isProjectArchived: boolean;
  onTaskUpdated: (updatedTask: TaskItem) => void;
  onTaskDeleted: (taskId: string) => void;
}

export function TaskDetailDialog({
  isOpen,
  onClose,
  task,
  organisationId,
  projectId,
  projectMembers,
  isProjectArchived,
  onTaskUpdated,
  onTaskDeleted,
}: TaskDetailDialogProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(task.title);
  const [editDescription, setEditDescription] = useState(task.description || '');
  const [editPriority, setEditPriority] = useState<TaskPriority>(task.priority);
  const [editAssigneeId, setEditAssigneeId] = useState<string>(task.assigneeId || '');
  const [editStartDate, setEditStartDate] = useState(
    task.startDate ? task.startDate.split('T')[0] : ''
  );
  const [editDueDate, setEditDueDate] = useState(
    task.dueDate ? task.dueDate.split('T')[0] : ''
  );

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Phase 8C Comments State (PRJ-007)
  const { user } = useAuth();
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [isLoadingComments, setIsLoadingComments] = useState(false);
  const [commentError, setCommentError] = useState<string | null>(null);
  const [newCommentBody, setNewCommentBody] = useState('');
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingCommentBody, setEditingCommentBody] = useState('');
  const [isSubmittingEditComment, setIsSubmittingEditComment] = useState(false);

  const fetchComments = useCallback(async () => {
    if (!task.id) return;
    try {
      setIsLoadingComments(true);
      setCommentError(null);
      const res = await apiClient<{ comments: TaskComment[] }>(
        `/organisations/${organisationId}/projects/${projectId}/tasks/${task.id}/comments`
      );
      if (res.data?.comments) {
        setComments(res.data.comments);
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setCommentError(err.message);
      }
    } finally {
      setIsLoadingComments(false);
    }
  }, [organisationId, projectId, task.id]);

  useEffect(() => {
    if (isOpen && task.id) {
      fetchComments();
    }
  }, [isOpen, task.id, fetchComments]);

  async function handleAddComment(e: React.FormEvent) {
    e.preventDefault();
    if (!newCommentBody.trim() || isSubmittingComment) return;
    try {
      setIsSubmittingComment(true);
      setCommentError(null);
      const res = await apiClient<{ comment: TaskComment }>(
        `/organisations/${organisationId}/projects/${projectId}/tasks/${task.id}/comments`,
        {
          method: 'POST',
          body: JSON.stringify({ body: newCommentBody.trim() }),
        }
      );
      if (res.data?.comment) {
        const newComment = res.data.comment;
        setComments((prev) => [...prev, newComment]);
        setNewCommentBody('');
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setCommentError(err.message);
      } else {
        setCommentError('Failed to post comment.');
      }
    } finally {
      setIsSubmittingComment(false);
    }
  }

  async function handleEditCommentSubmit(commentId: string) {
    if (!editingCommentBody.trim() || isSubmittingEditComment) return;
    try {
      setIsSubmittingEditComment(true);
      setCommentError(null);
      const res = await apiClient<{ comment: TaskComment }>(
        `/organisations/${organisationId}/projects/${projectId}/tasks/${task.id}/comments/${commentId}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ body: editingCommentBody.trim() }),
        }
      );
      if (res.data?.comment) {
        const updatedComment = res.data.comment;
        setComments((prev) =>
          prev.map((c) => (c.id === commentId ? updatedComment : c))
        );
        setEditingCommentId(null);
        setEditingCommentBody('');
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setCommentError(err.message);
      } else {
        setCommentError('Failed to update comment.');
      }
    } finally {
      setIsSubmittingEditComment(false);
    }
  }

  async function handleDeleteComment(commentId: string) {
    try {
      setCommentError(null);
      await apiClient(
        `/organisations/${organisationId}/projects/${projectId}/tasks/${task.id}/comments/${commentId}`,
        {
          method: 'DELETE',
        }
      );
      setComments((prev) =>
        prev.map((c) =>
          c.id === commentId
            ? { ...c, isDeleted: true, body: '[This comment has been deleted]' }
            : c
        )
      );
    } catch (err) {
      if (err instanceof ApiError) {
        setCommentError(err.message);
      } else {
        setCommentError('Failed to delete comment.');
      }
    }
  }

  if (!isOpen) return null;

  const allowedNextStatuses = TASK_ALLOWED_TRANSITIONS[task.status] || [];

  async function handleStatusTransition(targetStatus: TaskStatus) {
    setErrorMsg(null);
    try {
      setIsSubmitting(true);
      const res = await apiClient<{ task: TaskItem }>(
        `/organisations/${organisationId}/projects/${projectId}/tasks/${task.id}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ status: targetStatus }),
        }
      );
      if (res.data?.task) {
        onTaskUpdated(res.data.task);
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setErrorMsg(err.message);
      } else {
        setErrorMsg('Failed to update task status.');
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);

    if (!editTitle.trim()) {
      setErrorMsg('Task title cannot be empty.');
      return;
    }

    if (editStartDate && editDueDate && new Date(editStartDate) > new Date(editDueDate)) {
      setErrorMsg('Start date cannot be after the due date.');
      return;
    }

    try {
      setIsSubmitting(true);
      const payload: Record<string, unknown> = {
        title: editTitle.trim(),
        description: editDescription.trim() || null,
        priority: editPriority,
        assigneeId: editAssigneeId ? editAssigneeId : null,
        startDate: editStartDate ? new Date(editStartDate).toISOString() : null,
        dueDate: editDueDate ? new Date(editDueDate).toISOString() : null,
      };

      const res = await apiClient<{ task: TaskItem }>(
        `/organisations/${organisationId}/projects/${projectId}/tasks/${task.id}`,
        {
          method: 'PATCH',
          body: JSON.stringify(payload),
        }
      );

      if (res.data?.task) {
        onTaskUpdated(res.data.task);
        setIsEditing(false);
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setErrorMsg(err.message);
      } else {
        setErrorMsg('Failed to save task changes.');
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDeleteTask() {
    setErrorMsg(null);
    try {
      setIsDeleting(true);
      await apiClient(
        `/organisations/${organisationId}/projects/${projectId}/tasks/${task.id}`,
        {
          method: 'DELETE',
        }
      );
      onTaskDeleted(task.id);
      onClose();
    } catch (err) {
      if (err instanceof ApiError) {
        setErrorMsg(err.message);
      } else {
        setErrorMsg('Failed to delete task.');
      }
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="task-detail-title"
    >
      <Card className="w-full max-w-2xl shadow-xl border-neutral-200 max-h-[90vh] flex flex-col">
        <CardHeader className="flex flex-row items-start justify-between border-b border-neutral-100 pb-4">
          <div className="flex-1 pr-4">
            <div className="flex items-center space-x-2 mb-2">
              <Badge variant={TASK_STATUS_VARIANTS[task.status]}>
                {TASK_STATUS_LABELS[task.status]}
              </Badge>
              <Badge variant={TASK_PRIORITY_VARIANTS[task.priority]}>
                {TASK_PRIORITY_LABELS[task.priority]}
              </Badge>
              {task.isOverdue && (
                <span className="inline-flex items-center text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-800 font-medium">
                  <AlertCircle className="w-3 h-3 mr-1" /> Overdue
                </span>
              )}
              {task.isDueSoon && (
                <span className="inline-flex items-center text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-medium">
                  <Clock className="w-3 h-3 mr-1" /> Due Soon
                </span>
              )}
            </div>
            <CardTitle id="task-detail-title" className="text-xl leading-snug">
              {task.title}
            </CardTitle>
          </div>
          <div className="flex items-center space-x-2">
            {!isEditing && !isProjectArchived && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsEditing(true)}
                className="flex items-center space-x-1"
              >
                <Edit2 className="w-3.5 h-3.5" />
                <span>Edit</span>
              </Button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="text-neutral-400 hover:text-neutral-600 p-1 rounded-md transition-colors"
              aria-label="Close dialog"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </CardHeader>

        <CardContent className="pt-5 overflow-y-auto space-y-6">
          {errorMsg && (
            <Alert variant="error" title="Error">
              {errorMsg}
            </Alert>
          )}

          {/* Canonical Status Transitions Bar */}
          {!isProjectArchived && allowedNextStatuses.length > 0 && (
            <div className="p-3 bg-neutral-50 rounded-lg border border-neutral-200">
              <span className="text-xs font-semibold uppercase tracking-wider text-neutral-500 block mb-2">
                Available Transitions (PRJ-005)
              </span>
              <div className="flex flex-wrap gap-2">
                {allowedNextStatuses.map((nextStatus) => (
                  <Button
                    key={nextStatus}
                    size="sm"
                    variant={nextStatus === 'done' ? 'primary' : 'outline'}
                    disabled={isSubmitting}
                    onClick={() => handleStatusTransition(nextStatus)}
                    className="flex items-center space-x-1.5"
                  >
                    <span>Move to {TASK_STATUS_LABELS[nextStatus]}</span>
                    <ArrowRight className="w-3.5 h-3.5 text-neutral-400" />
                  </Button>
                ))}
              </div>
            </div>
          )}

          {isEditing ? (
            /* Editing Form */
            <form onSubmit={handleSaveEdit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">
                  Title
                </label>
                <Input
                  type="text"
                  required
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  disabled={isSubmitting}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">
                  Description
                </label>
                <textarea
                  rows={4}
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  disabled={isSubmitting}
                  className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">
                    Priority
                  </label>
                  <select
                    value={editPriority}
                    onChange={(e) => setEditPriority(e.target.value as TaskPriority)}
                    disabled={isSubmitting}
                    className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                  >
                    {(['low', 'medium', 'high', 'urgent'] as TaskPriority[]).map((p) => (
                      <option key={p} value={p}>
                        {TASK_PRIORITY_LABELS[p]}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">
                    Assignee
                  </label>
                  <select
                    value={editAssigneeId}
                    onChange={(e) => setEditAssigneeId(e.target.value)}
                    disabled={isSubmitting}
                    className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                  >
                    <option value="">Unassigned</option>
                    {projectMembers.map((m) => (
                      <option key={m.userId} value={m.userId}>
                        {m.userName || m.userEmail} ({m.role})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">
                    Start Date
                  </label>
                  <Input
                    type="date"
                    value={editStartDate}
                    onChange={(e) => setEditStartDate(e.target.value)}
                    disabled={isSubmitting}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">
                    Due Date
                  </label>
                  <Input
                    type="date"
                    value={editDueDate}
                    onChange={(e) => setEditDueDate(e.target.value)}
                    disabled={isSubmitting}
                  />
                </div>
              </div>

              <div className="flex items-center justify-end space-x-3 pt-3 border-t border-neutral-100">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsEditing(false)}
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={isSubmitting} className="flex items-center space-x-1">
                  <Check className="w-4 h-4" />
                  <span>{isSubmitting ? 'Saving...' : 'Save Changes'}</span>
                </Button>
              </div>
            </form>
          ) : (
            /* Details View */
            <div className="space-y-6">
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-1.5">
                  Description
                </h4>
                <p className="text-sm text-neutral-800 whitespace-pre-wrap leading-relaxed">
                  {task.description || <span className="italic text-neutral-400">No description provided.</span>}
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-neutral-100">
                <div className="flex items-start space-x-3">
                  <User className="w-4 h-4 text-neutral-400 mt-0.5" />
                  <div>
                    <span className="text-xs text-neutral-500 block">Assignee</span>
                    <span className="text-sm font-medium text-neutral-900">
                      {task.assigneeName ? (
                        `${task.assigneeName} (${task.assigneeEmail || ''})`
                      ) : (
                        <span className="text-neutral-400">Unassigned</span>
                      )}
                    </span>
                  </div>
                </div>

                <div className="flex items-start space-x-3">
                  <Calendar className="w-4 h-4 text-neutral-400 mt-0.5" />
                  <div>
                    <span className="text-xs text-neutral-500 block">Due Date</span>
                    <span className={`text-sm font-medium ${task.isOverdue ? 'text-red-600 font-semibold' : 'text-neutral-900'}`}>
                      {task.dueDate ? new Date(task.dueDate).toLocaleDateString() : 'No deadline'}
                    </span>
                  </div>
                </div>

                <div className="flex items-start space-x-3">
                  <Clock className="w-4 h-4 text-neutral-400 mt-0.5" />
                  <div>
                    <span className="text-xs text-neutral-500 block">Created By</span>
                    <span className="text-sm text-neutral-700">
                      {task.createdByName || 'Unknown'} on {new Date(task.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>

                <div className="flex items-start space-x-3">
                  <Clock className="w-4 h-4 text-neutral-400 mt-0.5" />
                  <div>
                    <span className="text-xs text-neutral-500 block">Last Updated</span>
                    <span className="text-sm text-neutral-700">
                      {new Date(task.updatedAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              </div>

              {/* Task Discussion & Comments Thread (PRJ-007) */}
              <div className="pt-6 border-t border-neutral-100 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <MessageSquare className="w-4 h-4 text-indigo-600" />
                    <h4 className="text-sm font-semibold text-neutral-900">
                      Comments & Discussion
                    </h4>
                    <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-medium">
                      {comments.length}
                    </span>
                  </div>
                </div>

                {commentError && (
                  <Alert variant="error" className="py-2 text-xs">
                    {commentError}
                  </Alert>
                )}

                {/* Comments List */}
                <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
                  {isLoadingComments ? (
                    <div className="text-center py-4 text-xs text-neutral-500">
                      Loading discussion...
                    </div>
                  ) : comments.length === 0 ? (
                    <div className="text-center py-4 text-xs text-neutral-400 bg-neutral-50 rounded-lg">
                      No comments yet. Start the conversation below.
                    </div>
                  ) : (
                    comments.map((comment) => (
                      <div
                        key={comment.id}
                        className={`p-3 rounded-lg border text-xs ${
                          comment.isDeleted
                            ? 'bg-neutral-50 border-dashed border-neutral-200 text-neutral-400 italic'
                            : 'bg-white border-neutral-200 text-neutral-700 shadow-sm'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="font-semibold text-neutral-900">
                            {comment.authorName || comment.authorEmail || 'Team Member'}
                          </span>
                          <span className="text-[11px] text-neutral-400">
                            {new Date(comment.createdAt).toLocaleString()}
                          </span>
                        </div>

                        {editingCommentId === comment.id ? (
                          <div className="space-y-2 mt-2">
                            <textarea
                              value={editingCommentBody}
                              onChange={(e) => setEditingCommentBody(e.target.value)}
                              maxLength={2000}
                              rows={2}
                              className="w-full text-xs p-2 rounded border border-neutral-300 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            />
                            <div className="flex items-center justify-end space-x-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setEditingCommentId(null);
                                  setEditingCommentBody('');
                                }}
                              >
                                Cancel
                              </Button>
                              <Button
                                size="sm"
                                variant="primary"
                                disabled={isSubmittingEditComment || !editingCommentBody.trim()}
                                onClick={() => handleEditCommentSubmit(comment.id)}
                              >
                                {isSubmittingEditComment ? 'Saving...' : 'Save'}
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <p className="whitespace-pre-wrap">{comment.body}</p>
                        )}

                        {!comment.isDeleted && !isProjectArchived && editingCommentId !== comment.id && (
                          <div className="mt-2 flex items-center justify-end space-x-2 text-[11px]">
                            {comment.authorId === user?.id && (
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingCommentId(comment.id);
                                  setEditingCommentBody(comment.body);
                                }}
                                className="text-neutral-500 hover:text-indigo-600 font-medium"
                              >
                                Edit
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleDeleteComment(comment.id)}
                              className="text-neutral-400 hover:text-red-600 font-medium"
                            >
                              Delete
                            </button>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>

                {/* Add Comment Input */}
                {!isProjectArchived ? (
                  <form onSubmit={handleAddComment} className="space-y-2 pt-2">
                    <div className="relative">
                      <textarea
                        value={newCommentBody}
                        onChange={(e) => setNewCommentBody(e.target.value)}
                        placeholder="Write a comment (plain text, max 2000 chars)..."
                        maxLength={2000}
                        rows={2}
                        className="w-full text-xs p-2.5 rounded-lg border border-neutral-300 bg-white placeholder-neutral-400 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-neutral-400">
                        {newCommentBody.length}/2000 characters
                      </span>
                      <Button
                        type="submit"
                        size="sm"
                        variant="primary"
                        disabled={isSubmittingComment || !newCommentBody.trim()}
                        className="flex items-center space-x-1.5"
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>{isSubmittingComment ? 'Posting...' : 'Post Comment'}</span>
                      </Button>
                    </div>
                  </form>
                ) : (
                  <div className="text-xs text-neutral-400 italic bg-neutral-50 p-2.5 rounded-lg text-center">
                    Project is archived. Comments are read-only.
                  </div>
                )}
              </div>

              {/* Destructive Action: Soft Delete */}
              {!isProjectArchived && (
                <div className="pt-6 border-t border-neutral-100 flex items-center justify-between">
                  {confirmDelete ? (
                    <div className="flex items-center space-x-2">
                      <span className="text-xs text-red-600 font-medium">
                        Are you sure you want to soft-delete this task?
                      </span>
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={isDeleting}
                        onClick={handleDeleteTask}
                      >
                        {isDeleting ? 'Deleting...' : 'Yes, Delete'}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setConfirmDelete(false)}
                      >
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setConfirmDelete(true)}
                      className="text-red-600 hover:text-red-700 hover:bg-red-50 border-neutral-200"
                    >
                      <Trash2 className="w-4 h-4 mr-1.5" />
                      <span>Soft Delete Task</span>
                    </Button>
                  )}
                  <Button variant="outline" onClick={onClose}>
                    Close
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
