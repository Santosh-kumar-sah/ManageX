import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Breadcrumbs } from '@/components/ui/Breadcrumbs';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Alert } from '@/components/ui/Alert';
import { Input } from '@/components/ui/Input';
import { ConfirmDialog, Dialog } from '@/components/ui/Dialog';
import {
  FolderKanban,
  Users,
  Edit3,
  Play,
  Pause,
  CheckCircle2,
  Archive,
  UserPlus,
  Trash2,
  CheckSquare,
  LayoutList,
  Kanban,
  Search,
  Plus,
  History,
} from 'lucide-react';
import { apiClient, ApiError } from '@/api/client';
import { useOrg } from '@/api/OrgContext';
import { useAuth } from '@/api/AuthContext';
import {
  ProjectItem,
  ProjectMember,
  ProjectMemberRole,
  ProjectPriority,
  ProjectStatus,
  PROJECT_STATUS_LABELS,
  PROJECT_STATUS_VARIANTS,
  PROJECT_PRIORITY_LABELS,
  PROJECT_PRIORITY_VARIANTS,
  PROJECT_MEMBER_ROLE_LABELS,
  TaskItem,
  TaskStatus,
  ProjectActivityItem,
} from '@/types/projects';
import { CreateTaskDialog } from './CreateTaskDialog';
import { TaskDetailDialog } from './TaskDetailDialog';
import { TaskListView } from './TaskListView';
import { TaskKanbanView } from './TaskKanbanView';

interface ProjectDetailResponse extends ProjectItem {
  members: ProjectMember[];
}

interface OrgMemberOption {
  userId: string;
  fullName: string;
  email: string;
  status: string;
}

export function ProjectDetailPage() {
  const { orgId, projectId } = useParams<{ orgId: string; projectId: string }>();
  const { activeOrg, activeDetails } = useOrg();
  const { user } = useAuth();

  const effectiveOrgId = orgId && orgId !== 'default' ? orgId : activeOrg?.id;

  const [project, setProject] = useState<ProjectDetailResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'members' | 'tasks' | 'activity'>('overview');

  // Edit Project Modal
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editPriority, setEditPriority] = useState<ProjectPriority>('medium');
  const [editOwnerId, setEditOwnerId] = useState('');
  const [editStartDate, setEditStartDate] = useState('');
  const [editTargetDate, setEditTargetDate] = useState('');
  const [editLabels, setEditLabels] = useState('');
  const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);

  // Add Member Modal
  const [isAddMemberOpen, setIsAddMemberOpen] = useState(false);
  const [newMemberUserId, setNewMemberUserId] = useState('');
  const [newMemberRole, setNewMemberRole] = useState<ProjectMemberRole>('member');
  const [isSubmittingMember, setIsSubmittingMember] = useState(false);

  // Org members for selectors
  const [orgMembers, setOrgMembers] = useState<OrgMemberOption[]>([]);

  // Status transition loader
  const [isTransitioning, setIsTransitioning] = useState(false);

  const isArchived = project?.status === 'archived';

  const membership = activeDetails && activeDetails.organisation.id === effectiveOrgId ? activeDetails.membership : undefined;
  const roles = membership?.roles ?? (membership ? [membership.role] : []);
  const isProjectAdmin = roles.some(role => ['organisation_owner', 'organisation_admin', 'project_admin'].includes(role.slug));
  const projectRole = project?.members?.find(member => member.userId === user?.id)?.role;
  const managesTasks = isProjectAdmin || Boolean(user && project?.ownerId === user.id) || projectRole === 'manager';
  const writableProject = Boolean(project && !isArchived && (managesTasks || projectRole === 'member'));
  const canUpdateTasks = writableProject && !!membership?.permissions.includes('task.update');
  const canCreateTasks = writableProject && !!membership?.permissions.includes('task.create');
  const canDeleteTasks = writableProject && !!membership?.permissions.includes('task.delete');

  const canManageProject =
    !isArchived &&
    (activeDetails?.membership?.permissions?.includes('project.edit') ||
      activeDetails?.membership?.role?.slug === 'organisation_owner' ||
      activeDetails?.membership?.role?.slug === 'organisation_admin' ||
      activeDetails?.membership?.role?.slug === 'project_admin' ||
      project?.ownerId === user?.id);

  // ---------------------------------------------------------------------------
  // Tasks State (Phase 8B: PRJ-003, PRJ-004, PRJ-005, PRJ-006)
  // ---------------------------------------------------------------------------
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [isLoadingTasks, setIsLoadingTasks] = useState(false);
  const [tasksError, setTasksError] = useState<string | null>(null);
  const movingTasks = useRef(new Set<string>());
  const [pendingTaskIds, setPendingTaskIds] = useState<ReadonlySet<string>>(new Set());
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [taskViewMode, setTaskViewMode] = useState<'list' | 'kanban'>('kanban');
  const [taskStatusFilter, setTaskStatusFilter] = useState<string>('all');
  const [taskPriorityFilter, setTaskPriorityFilter] = useState<string>('all');
  const [taskAssigneeFilter, setTaskAssigneeFilter] = useState<string>('all');
  const [taskSpecialView, setTaskSpecialView] = useState<'all' | 'assigned_to_me' | 'due_soon' | 'overdue'>('all');
  const [taskSearch, setTaskSearch] = useState<string>('');

  const [isCreateTaskOpen, setIsCreateTaskOpen] = useState(false);
  const [createTaskInitialStatus, setCreateTaskInitialStatus] = useState<TaskStatus>('backlog');
  const [selectedTask, setSelectedTask] = useState<TaskItem | null>(null);

  // Member removal confirm state
  const [memberToRemove, setMemberToRemove] = useState<string | null>(null);
  const [isRemovingMember, setIsRemovingMember] = useState(false);

  // ---------------------------------------------------------------------------
  // Activity Timeline State (Phase 8C: PRJ-008)
  // ---------------------------------------------------------------------------
  const [activities, setActivities] = useState<ProjectActivityItem[]>([]);
  const [isLoadingActivities, setIsLoadingActivities] = useState(false);
  const [activitiesError, setActivitiesError] = useState<string | null>(null);

  const fetchActivities = useCallback(async () => {
    if (!effectiveOrgId || !projectId) return;
    try {
      setIsLoadingActivities(true);
      setActivitiesError(null);
      const res = await apiClient<{ items: ProjectActivityItem[]; total: number }>(
        `/organisations/${effectiveOrgId}/projects/${projectId}/activity`
      );
      if (res.data?.items) {
        setActivities(res.data.items);
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setActivitiesError(err.message);
      } else {
        setActivitiesError('Failed to load project activity timeline.');
      }
    } finally {
      setIsLoadingActivities(false);
    }
  }, [effectiveOrgId, projectId]);

  useEffect(() => {
    if (activeTab === 'activity') {
      fetchActivities();
    }
  }, [activeTab, fetchActivities]);

  const fetchProject = useCallback(async () => {
    if (!effectiveOrgId || !projectId) return;

    try {
      setIsLoading(true);
      setErrorMsg(null);

      const res = await apiClient<{ project: ProjectDetailResponse }>(
        `/organisations/${effectiveOrgId}/projects/${projectId}`
      );

      if (res.data?.project) {
        setProject(res.data.project);
        setEditName(res.data.project.name);
        setEditDesc(res.data.project.description || '');
        setEditPriority(res.data.project.priority);
        setEditOwnerId(res.data.project.ownerId);
        setEditStartDate(res.data.project.startDate ? res.data.project.startDate.split('T')[0] : '');
        setEditTargetDate(res.data.project.targetDate ? res.data.project.targetDate.split('T')[0] : '');
        setEditLabels(res.data.project.labels.join(', '));
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setErrorMsg(err.message);
      } else {
        setErrorMsg('Failed to load project details.');
      }
    } finally {
      setIsLoading(false);
    }
  }, [effectiveOrgId, projectId]);

  useEffect(() => {
    fetchProject();
  }, [fetchProject]);

  // Load org members for dropdowns
  useEffect(() => {
    if (!effectiveOrgId) return;
    async function loadOrgMembers() {
      try {
        const res = await apiClient<{
          members: Array<{
            userId?: string;
            fullName?: string;
            email?: string;
            user?: { id: string; fullName: string; email: string };
            status: string;
          }>;
        }>(`/organisations/${effectiveOrgId}/members`);
        if (res.data?.members) {
          const actives = res.data.members
            .filter((m) => m.status === 'active')
            .map((m) => {
              const uId = m.userId || m.user?.id || '';
              const uName = m.fullName || m.user?.fullName || m.email || m.user?.email || 'Unknown Member';
              const uEmail = m.email || m.user?.email || '';
              return {
                userId: uId,
                fullName: uName,
                email: uEmail,
                status: m.status,
              };
            })
            .filter((m) => Boolean(m.userId));
          setOrgMembers(actives);
        }
      } catch {
        // Ignored
      }
    }
    loadOrgMembers();
  }, [effectiveOrgId]);

  // Load tasks for active tab (PRJ-005, PRJ-006)
  const fetchTasks = useCallback(async () => {
    if (!effectiveOrgId || !projectId) return;

    try {
      setIsLoadingTasks(true);
      setTasksError(null);

      const params = new URLSearchParams();
      if (taskStatusFilter !== 'all') params.set('status', taskStatusFilter);
      if (taskPriorityFilter !== 'all') params.set('priority', taskPriorityFilter);
      if (taskAssigneeFilter !== 'all') params.set('assigneeId', taskAssigneeFilter);
      if (taskSpecialView !== 'all') params.set('view', taskSpecialView);
      if (taskSearch.trim()) params.set('search', taskSearch.trim());

      const res = await apiClient<{ items: TaskItem[]; total: number }>(
        `/organisations/${effectiveOrgId}/projects/${projectId}/tasks?${params.toString()}`
      );

      if (res.data?.items) {
        setTasks(res.data.items);
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setTasksError(err.message);
      } else {
        setTasksError('Failed to load project tasks.');
      }
    } finally {
      setIsLoadingTasks(false);
    }
  }, [
    effectiveOrgId,
    projectId,
    taskStatusFilter,
    taskPriorityFilter,
    taskAssigneeFilter,
    taskSpecialView,
    taskSearch,
  ]);

  useEffect(() => {
    if (activeTab === 'tasks') {
      fetchTasks();
    }
  }, [activeTab, fetchTasks]);

  async function handleTaskStatusChange(task: TaskItem, newStatus: TaskStatus) {
    if (!effectiveOrgId || !projectId || !canUpdateTasks || movingTasks.current.has(task.id)) return;
    movingTasks.current.add(task.id);
    setPendingTaskIds(new Set(movingTasks.current));
    setTasksError(null);
    try {
      const res = await apiClient<{ task: TaskItem }>(
        `/organisations/${effectiveOrgId}/projects/${projectId}/tasks/${task.id}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ status: newStatus }),
        }
      );

      if (res.data?.task) {
        const updatedTask = res.data.task;
        setTasks((prev) =>
          prev.map((t) => (t.id === task.id ? updatedTask : t))
        );
        if (selectedTask?.id === task.id) {
          setSelectedTask(updatedTask);
        }
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setTasksError(err.message);
      } else {
        setTasksError('Failed to update task status.');
      }
    } finally {
      movingTasks.current.delete(task.id);
      setPendingTaskIds(new Set(movingTasks.current));
    }
  }

  function handleTaskCreated(newTask: TaskItem) {
    setTasks((prev) => [newTask, ...prev]);
  }

  function handleTaskUpdated(updatedTask: TaskItem) {
    setTasks((prev) =>
      prev.map((t) => (t.id === updatedTask.id ? updatedTask : t))
    );
    setSelectedTask(updatedTask);
  }

  function handleTaskDeleted(deletedTaskId: string) {
    setTasks((prev) => prev.filter((t) => t.id !== deletedTaskId));
    setSelectedTask(null);
  }

  async function handleStatusTransition(targetStatus: ProjectStatus) {
    if (!effectiveOrgId || !projectId) return;
    try {
      setIsTransitioning(true);
      setErrorMsg(null);

      const res = await apiClient<{ project: ProjectDetailResponse }>(
        `/organisations/${effectiveOrgId}/projects/${projectId}/status`,
        {
          method: 'PATCH',
          body: JSON.stringify({ status: targetStatus }),
        }
      );

      if (res.data?.project) {
        setProject(res.data.project);
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setErrorMsg(err.message);
      } else {
        setErrorMsg('Failed to update project status.');
      }
    } finally {
      setIsTransitioning(false);
    }
  }

  async function handleEditSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!effectiveOrgId || !projectId) return;

    if (editStartDate && editTargetDate && new Date(editStartDate) > new Date(editTargetDate)) {
      setErrorMsg('Start date cannot be after the target completion date.');
      return;
    }

    try {
      setIsSubmittingEdit(true);
      setErrorMsg(null);

      const labels = editLabels
        .split(',')
        .map((l) => l.trim())
        .filter(Boolean);

      const payload: Record<string, unknown> = {
        name: editName.trim(),
        description: editDesc.trim() || null,
        priority: editPriority,
        labels,
      };

      if (editOwnerId) payload.ownerId = editOwnerId;
      if (editStartDate) payload.startDate = new Date(editStartDate).toISOString();
      if (editTargetDate) payload.targetDate = new Date(editTargetDate).toISOString();

      const res = await apiClient<{ project: ProjectDetailResponse }>(
        `/organisations/${effectiveOrgId}/projects/${projectId}`,
        {
          method: 'PATCH',
          body: JSON.stringify(payload),
        }
      );

      if (res.data?.project) {
        setProject(res.data.project);
        setIsEditOpen(false);
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setErrorMsg(err.message);
      } else {
        setErrorMsg('Failed to update project.');
      }
    } finally {
      setIsSubmittingEdit(false);
    }
  }

  async function handleAddMember(e: React.FormEvent) {
    e.preventDefault();
    if (!effectiveOrgId || !projectId || !newMemberUserId) return;

    try {
      setIsSubmittingMember(true);
      setErrorMsg(null);

      const res = await apiClient<{ member: ProjectMember }>(
        `/organisations/${effectiveOrgId}/projects/${projectId}/members`,
        {
          method: 'POST',
          body: JSON.stringify({
            userId: newMemberUserId,
            role: newMemberRole,
          }),
        }
      );

      if (res.data?.member) {
        setProject((prev) => (prev ? { ...prev, members: [...prev.members, res.data!.member] } : null));
        setIsAddMemberOpen(false);
        setNewMemberUserId('');
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setErrorMsg(err.message);
      } else {
        setErrorMsg('Failed to add project member.');
      }
    } finally {
      setIsSubmittingMember(false);
    }
  }

  async function handleUpdateMemberRole(memberUserId: string, newRole: ProjectMemberRole) {
    if (!effectiveOrgId || !projectId) return;

    try {
      setErrorMsg(null);
      const res = await apiClient<{ member: ProjectMember }>(
        `/organisations/${effectiveOrgId}/projects/${projectId}/members/${memberUserId}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ role: newRole }),
        }
      );

      if (res.data?.member) {
        setProject((prev) =>
          prev
            ? {
                ...prev,
                members: prev.members.map((m) =>
                  m.userId === memberUserId ? res.data!.member : m
                ),
              }
            : null
        );
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setErrorMsg(err.message);
      } else {
        setErrorMsg('Failed to update member role.');
      }
    }
  }

  function handleRemoveMember(memberUserId: string) {
    setMemberToRemove(memberUserId);
  }

  async function confirmRemoveMember() {
    if (!effectiveOrgId || !projectId || !memberToRemove) return;

    try {
      setIsRemovingMember(true);
      setErrorMsg(null);
      await apiClient(
        `/organisations/${effectiveOrgId}/projects/${projectId}/members/${memberToRemove}`,
        {
          method: 'DELETE',
        }
      );

      setProject((prev) =>
        prev
          ? {
              ...prev,
              members: prev.members.filter((m) => m.userId !== memberToRemove),
            }
          : null
      );
      setMemberToRemove(null);
    } catch (err) {
      if (err instanceof ApiError) {
        setErrorMsg(err.message);
      } else {
        setErrorMsg('Failed to remove member.');
      }
    } finally {
      setIsRemovingMember(false);
    }
  }

  function formatDate(iso: string | null) {
    if (!iso) return 'Not set';
    return new Date(iso).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }

  if (isLoading) {
    return (
      <div className="py-20 text-center">
        <div className="inline-block animate-spin w-8 h-8 border-2 border-brand-600 border-t-transparent rounded-full mb-3" />
        <p className="text-sm text-slate-500">Loading project details...</p>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="space-y-4">
        <Alert variant="error">
          {errorMsg || 'Project not found or you lack permission to view it.'}
        </Alert>
        <Link className="workspace-text-link" to={`/app/organisations/${effectiveOrgId}/projects`}>Back to projects</Link>
      </div>
    );
  }

  return (
    <div className="projects-page space-y-6">
      <Breadcrumbs
        items={[
          { label: 'Workspace', href: '/app' },
          { label: activeOrg?.name || 'Organisation', href: '/app' },
          { label: 'Projects & Tasks', href: `/app/organisations/${effectiveOrgId}/projects` },
          { label: project.name },
        ]}
      />

      {errorMsg && (
        <Alert variant="error" className="text-sm">
          {errorMsg}
        </Alert>
      )}

      {/* Project header */}
      <header className="project-headline">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={PROJECT_STATUS_VARIANTS[project.status]}>
                  {PROJECT_STATUS_LABELS[project.status]}
                </Badge>
                <Badge variant={PROJECT_PRIORITY_VARIANTS[project.priority]}>
                  {PROJECT_PRIORITY_LABELS[project.priority]} Priority
                </Badge>
                {isArchived && (
                  <Badge variant="neutral" className="bg-slate-100 text-slate-600">
                    Read only
                  </Badge>
                )}
              </div>
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
                {project.name}
              </h1>
              <p className="text-sm text-slate-600 max-w-3xl">
                {project.description}
              </p>
            </div>

            {/* Actions & Lifecycle Transitions */}
            <div className="flex flex-wrap items-center gap-2 self-start md:self-auto">
              {canManageProject && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsEditOpen(true)}
                    className="flex items-center gap-1.5"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>Edit Project</span>
                  </Button>

                  {/* Lifecycle Transitions based on PRD §9.2 */}
                  {project.status === 'planning' && (
                    <>
                      <Button
                        variant="primary"
                        size="sm"
                        disabled={isTransitioning}
                        onClick={() => handleStatusTransition('active')}
                        className="flex items-center gap-1.5"
                      >
                        <Play className="w-3.5 h-3.5" />
                        <span>Start Project</span>
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={isTransitioning}
                        onClick={() => setConfirmArchive(true)}
                        className="flex items-center gap-1.5 text-slate-600 hover:text-slate-900"
                      >
                        <Archive className="w-3.5 h-3.5" />
                        <span>Archive</span>
                      </Button>
                    </>
                  )}

                  {project.status === 'active' && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={isTransitioning}
                        onClick={() => handleStatusTransition('on_hold')}
                        className="flex items-center gap-1.5 text-amber-700 hover:bg-amber-50"
                      >
                        <Pause className="w-3.5 h-3.5" />
                        <span>Put On Hold</span>
                      </Button>
                      <Button
                        variant="primary"
                        size="sm"
                        disabled={isTransitioning}
                        onClick={() => handleStatusTransition('completed')}
                        className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Complete</span>
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={isTransitioning}
                        onClick={() => setConfirmArchive(true)}
                        className="flex items-center gap-1.5 text-slate-600 hover:text-slate-900"
                      >
                        <Archive className="w-3.5 h-3.5" />
                        <span>Archive</span>
                      </Button>
                    </>
                  )}

                  {project.status === 'on_hold' && (
                    <>
                      <Button
                        variant="primary"
                        size="sm"
                        disabled={isTransitioning}
                        onClick={() => handleStatusTransition('active')}
                        className="flex items-center gap-1.5"
                      >
                        <Play className="w-3.5 h-3.5" />
                        <span>Resume Project</span>
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={isTransitioning}
                        onClick={() => handleStatusTransition('completed')}
                        className="flex items-center gap-1.5 text-emerald-700 hover:bg-emerald-50"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Complete</span>
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={isTransitioning}
                        onClick={() => setConfirmArchive(true)}
                        className="flex items-center gap-1.5 text-slate-600 hover:text-slate-900"
                      >
                        <Archive className="w-3.5 h-3.5" />
                        <span>Archive</span>
                      </Button>
                    </>
                  )}

                  {project.status === 'completed' && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={isTransitioning}
                      onClick={() => setConfirmArchive(true)}
                      className="flex items-center gap-1.5 text-slate-600 hover:text-slate-900"
                    >
                      <Archive className="w-3.5 h-3.5" />
                      <span>Archive Project</span>
                    </Button>
                  )}
                </>
              )}
            </div>
          </div>

      </header>

      {/* Tabs Bar */}
      <div className="project-tabs" aria-label="Project sections" role="group">
        {[
          { id: 'overview', label: 'Overview', icon: FolderKanban },
          { id: 'members', label: `Members (${project.members?.length || 0})`, icon: Users },
          { id: 'tasks', label: 'Tasks', icon: CheckSquare },
          { id: 'activity', label: 'Activity', icon: History },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button" aria-pressed={isActive}
              onClick={() => setActiveTab(tab.id as 'overview' | 'members' | 'tasks' | 'activity')}
              className={`flex items-center space-x-2 py-3 px-1 border-b-2 font-medium text-sm transition-colors ${
                isActive
                  ? 'border-brand-600 text-brand-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab 1: Project Overview */}
      {activeTab === 'overview' && (
        <section aria-label="Project details">
          <dl className="project-overview-data">
            <div><dt>Project owner</dt><dd>{project.ownerName || project.ownerEmail || 'Unassigned'}</dd>
              {project.ownerName && project.ownerEmail && <dd className="text-sm text-slate-600">{project.ownerEmail}</dd>}</div>
            <div><dt>Start date</dt><dd>{formatDate(project.startDate)}</dd></div>
            <div><dt>Target date</dt><dd>{formatDate(project.targetDate)}</dd></div>
            {project.members && <div><dt>Team members</dt><dd>{project.members.length}</dd></div>}
            <div><dt>Created</dt><dd>{new Date(project.createdAt).toLocaleString()}</dd></div>
            <div><dt>Last updated</dt><dd>{new Date(project.updatedAt).toLocaleString()}</dd></div>
            {project.labels?.length > 0 && <div><dt>Labels</dt><dd>{project.labels.join(' · ')}</dd></div>}
          </dl>
        </section>
      )}

      {/* Tab 2: Members Management */}
      {activeTab === 'members' && (
        <Card className="border border-slate-200 bg-white">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="text-base font-semibold text-slate-900">
                Team members
              </CardTitle>
              <CardDescription className="text-xs text-slate-500">
                People with access to this project.
              </CardDescription>
            </div>
            {canManageProject && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => setIsAddMemberOpen(true)}
                className="flex items-center gap-1.5"
              >
                <UserPlus className="w-4 h-4" />
                <span>Add Member</span>
              </Button>
            )}
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-700">
                <thead className="bg-slate-50 border-y border-slate-200 text-xs font-medium text-slate-500 uppercase tracking-wider">
                  <tr>
                    <th className="px-6 py-3">Member Name & Email</th>
                    <th className="px-6 py-3">Project Role</th>
                    <th className="px-6 py-3">Joined Project</th>
                    {canManageProject && <th className="px-6 py-3 text-right">Actions</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {project.members?.map((member) => {
                    const isProjectOwner = member.userId === project.ownerId;
                    return (
                      <tr key={member.id} className="hover:bg-slate-50/50">
                        <td className="px-6 py-3.5">
                          <div className="flex items-center space-x-2">
                            <div className="w-8 h-8 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center font-medium text-xs">
                              {member.userName?.[0] || 'U'}
                            </div>
                            <div>
                              <div className="font-medium text-slate-900 flex items-center gap-1.5">
                                <span>{member.userName || 'Unnamed User'}</span>
                                {isProjectOwner && (
                                  <span className="text-xs font-semibold bg-brand-50 text-brand-700 px-1.5 py-0.5 rounded border border-brand-200">
                                    Project Owner
                                  </span>
                                )}
                              </div>
                              <div className="text-xs text-slate-500">{member.userEmail}</div>
                            </div>
                          </div>
                        </td>

                        <td className="px-6 py-3.5">
                          {canManageProject && !isProjectOwner ? (
                            <select
                              aria-label={'Project role for ' + (member.userName || member.userEmail || 'member')}
                              value={member.role}
                              onChange={(e) =>
                                handleUpdateMemberRole(
                                  member.userId,
                                  e.target.value as ProjectMemberRole
                                )
                              }
                              className="rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-800 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                            >
                              <option value="manager">Project Manager</option>
                              <option value="member">Team Member</option>
                              <option value="viewer">Viewer</option>
                            </select>
                          ) : (
                            <Badge variant={member.role === 'manager' ? 'brand' : 'neutral'}>
                              {PROJECT_MEMBER_ROLE_LABELS[member.role] || member.role}
                            </Badge>
                          )}
                        </td>

                        <td className="px-6 py-3.5 text-xs text-slate-500">
                          {formatDate(member.createdAt)}
                        </td>

                        {canManageProject && (
                          <td className="px-6 py-3.5 text-right">
                            {isProjectOwner ? (
                              <span className="text-xs text-slate-400 italic">
                                Project owner
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleRemoveMember(member.userId)}
                                className="text-slate-400 hover:text-rose-600 p-1 rounded hover:bg-slate-50 transition-colors"
                                aria-label={'Remove ' + (member.userName || member.userEmail || 'member') + ' from project'}
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tab 3: Tasks & Board (PRJ-003, PRJ-004, PRJ-005, PRJ-006) */}
      {activeTab === 'tasks' && (
        <div className="space-y-4">
          {tasksError && (
            <Alert variant="error" className="mb-2">
              {tasksError}
            </Alert>
          )}

          {/* Task Filters & Control Bar */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
            {/* View Mode & Preset Filters */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex rounded-lg border border-slate-200 p-0.5 bg-slate-50">
                <button
                  type="button"
                  aria-pressed={taskViewMode === 'kanban'}
                  onClick={() => setTaskViewMode('kanban')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                    taskViewMode === 'kanban'
                      ? 'bg-white text-brand-600 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Kanban className="w-3.5 h-3.5" />
                  Board
                </button>
                <button
                  type="button"
                  aria-pressed={taskViewMode === 'list'}
                  onClick={() => setTaskViewMode('list')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                    taskViewMode === 'list'
                      ? 'bg-white text-brand-600 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <LayoutList className="w-3.5 h-3.5" />
                  List
                </button>
              </div>

              {/* Special View Filters */}
              <div className="flex flex-wrap items-center gap-1 text-sm">
                {(
                  [
                    { id: 'all', label: 'All Tasks' },
                    { id: 'assigned_to_me', label: 'Assigned to Me' },
                    { id: 'due_soon', label: 'Due Soon' },
                    { id: 'overdue', label: 'Overdue' },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    aria-pressed={taskSpecialView === tab.id}
                    onClick={() => setTaskSpecialView(tab.id)}
                    className={`px-2.5 py-1.5 rounded-md font-medium transition-colors ${
                      taskSpecialView === tab.id
                        ? 'bg-brand-50 text-brand-700'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2">
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  setCreateTaskInitialStatus('backlog');
                  setIsCreateTaskOpen(true);
                }}
                disabled={!canCreateTasks}
                className="gap-1.5"
              >
                <Plus className="w-4 h-4" />
                New Task
              </Button>
            </div>
          </div>

          {/* Search and Secondary Dropdown Filters */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 bg-slate-50/70 p-3 rounded-lg border border-slate-200">
            <div className="relative sm:col-span-1">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
              <Input
                placeholder="Search tasks..."
                aria-label="Search tasks"
                value={taskSearch}
                onChange={(e) => setTaskSearch(e.target.value)}
                className="pl-9 h-9 text-xs bg-white"
              />
            </div>

            <div>
              <select
                aria-label="Task status"
                value={taskStatusFilter}
                onChange={(e) => setTaskStatusFilter(e.target.value)}
                className="w-full h-9 rounded-md border border-slate-200 bg-white px-2.5 text-xs text-slate-700 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              >
                <option value="all">All Statuses</option>
                <option value="backlog">Backlog</option>
                <option value="todo">To Do</option>
                <option value="in_progress">In Progress</option>
                <option value="blocked">Blocked</option>
                <option value="done">Done</option>
              </select>
            </div>

            <div>
              <select
                aria-label="Task priority"
                value={taskPriorityFilter}
                onChange={(e) => setTaskPriorityFilter(e.target.value)}
                className="w-full h-9 rounded-md border border-slate-200 bg-white px-2.5 text-xs text-slate-700 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              >
                <option value="all">All Priorities</option>
                <option value="urgent">Urgent</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>

            <div>
              <select
                aria-label="Task assignee"
                value={taskAssigneeFilter}
                onChange={(e) => setTaskAssigneeFilter(e.target.value)}
                className="w-full h-9 rounded-md border border-slate-200 bg-white px-2.5 text-xs text-slate-700 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              >
                <option value="all">All Assignees</option>
                <option value="unassigned">Unassigned</option>
                {project?.members.map((m) => (
                  <option key={m.userId} value={m.userId}>
                    {m.userName || m.userEmail || m.userId}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Task Content: Kanban or List */}
          {isLoadingTasks ? (
            <div className="flex items-center justify-center py-16 bg-white rounded-xl border border-slate-200">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" />
            </div>
          ) : taskViewMode === 'kanban' ? (
            <TaskKanbanView
              tasks={tasks}
              onTaskClick={(t) => setSelectedTask(t)}
              onStatusChange={handleTaskStatusChange}
              pendingTaskIds={pendingTaskIds}
              onCreateInColumn={canCreateTasks ? (col) => {
                setCreateTaskInitialStatus(col);
                setIsCreateTaskOpen(true);
              } : undefined}
              canUpdate={canUpdateTasks}
              canReopen={managesTasks}
            />
          ) : (
            <TaskListView
              tasks={tasks}
              onTaskClick={(t) => setSelectedTask(t)}
              onStatusChange={handleTaskStatusChange}
              pendingTaskIds={pendingTaskIds}
              canUpdate={canUpdateTasks}
              canReopen={managesTasks}
            />
          )}
        </div>
      )}

      {/* Tab 4: Activity Timeline (PRJ-008) */}
      {activeTab === 'activity' && (
        <Card className="border border-slate-200 bg-white shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-3 border-b border-slate-100">
            <div>
              <CardTitle className="text-base font-semibold text-slate-900">
                Project activity
              </CardTitle>
              <CardDescription className="text-xs text-slate-500">
                Updates to project details, team members and tasks.
              </CardDescription>
            </div>
            {isArchived && (
              <Badge variant="neutral" className="text-xs">
                Archived
              </Badge>
            )}
          </CardHeader>

          <CardContent className="pt-6">
            {activitiesError && (
              <Alert variant="error" className="mb-4">
                {activitiesError}
              </Alert>
            )}

            {isLoadingActivities ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" />
              </div>
            ) : activities.length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                <History className="w-10 h-10 mx-auto mb-2 text-slate-300" />
                <p className="text-sm font-medium text-slate-600">No activity recorded yet</p>
                <p className="text-xs text-slate-400 mt-1">
                  Actions taken on this project will be listed here.
                </p>
              </div>
            ) : (
              <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
                {activities.map((item) => (
                  <div key={item.id} className="relative flex items-start space-x-3 text-xs">
                    <div className="absolute -left-6 mt-1 w-2.5 h-2.5 rounded-full bg-brand-600 ring-4 ring-white" />
                    <div className="flex-1 bg-slate-50/70 p-3 rounded-lg border border-slate-200/80">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-slate-900">
                          {item.actorName || item.actorEmail || 'System'}
                        </span>
                        <span className="text-xs text-slate-400">
                          {new Date(item.createdAt).toLocaleString()}
                        </span>
                      </div>
                      <p className="text-slate-700 mt-1 font-medium">{item.summary}</p>

                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Edit Project Dialog */}
      <Dialog isOpen={isEditOpen} onClose={() => !isSubmittingEdit && setIsEditOpen(false)} title="Edit project" className="project-dialog">
            <form onSubmit={handleEditSubmit}>
              <div className="space-y-4 pt-4">
                {errorMsg && <Alert variant="error">{errorMsg}</Alert>}
                <div>
                  <label htmlFor="project-field-editName" className="block text-xs font-medium text-slate-700 mb-1">
                    Project Name
                  </label>
                  <Input id="project-field-editName"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    required
                  />
                </div>

                <div>
                  <label htmlFor="project-field-editDesc" className="block text-xs font-medium text-slate-700 mb-1">
                    Description
                  </label>
                  <textarea id="project-field-editDesc"
                    value={editDesc}
                    onChange={(e) => setEditDesc(e.target.value)}
                    rows={3}
                    className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 resize-none"
                  />
                </div>

                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="project-field-editPriority" className="block text-xs font-medium text-slate-700 mb-1">
                      Priority
                    </label>
                    <select id="project-field-editPriority"
                      value={editPriority}
                      onChange={(e) => setEditPriority(e.target.value as ProjectPriority)}
                      className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                      <option value="urgent">Urgent</option>
                    </select>
                  </div>

                  <div>
                    <label htmlFor="project-field-editOwnerId" className="block text-xs font-medium text-slate-700 mb-1">
                      Project owner
                    </label>
                    <select id="project-field-editOwnerId"
                      value={editOwnerId}
                      onChange={(e) => setEditOwnerId(e.target.value)}
                      className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                    >
                      {orgMembers.map((m) => (
                        <option key={m.userId} value={m.userId}>
                          {m.fullName}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="project-field-editStartDate" className="block text-xs font-medium text-slate-700 mb-1">
                      Start Date
                    </label>
                    <Input id="project-field-editStartDate"
                      type="date"
                      value={editStartDate}
                      onChange={(e) => setEditStartDate(e.target.value)}
                    />
                  </div>

                  <div>
                    <label htmlFor="project-field-editTargetDate" className="block text-xs font-medium text-slate-700 mb-1">
                      Target Completion
                    </label>
                    <Input id="project-field-editTargetDate"
                      type="date"
                      value={editTargetDate}
                      onChange={(e) => setEditTargetDate(e.target.value)}
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="project-field-editLabels" className="block text-xs font-medium text-slate-700 mb-1">
                    Labels (comma-separated)
                  </label>
                  <Input id="project-field-editLabels"
                    value={editLabels}
                    onChange={(e) => setEditLabels(e.target.value)}
                  />
                </div>
              </div>

              <div className="flex items-center justify-end space-x-2 p-4 border-t border-slate-100 bg-slate-50/50 rounded-b-xl">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsEditOpen(false)}
                  disabled={isSubmittingEdit}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={isSubmittingEdit}
                >
                  {isSubmittingEdit ? 'Saving...' : 'Save Changes'}
                </Button>
              </div>
            </form>
      </Dialog>

      {/* Add Member Dialog */}
      <Dialog isOpen={isAddMemberOpen} onClose={() => !isSubmittingMember && setIsAddMemberOpen(false)} title="Add a team member" className="project-dialog">
            <form onSubmit={handleAddMember}>
              <div className="space-y-4 pt-4">
                {errorMsg && <Alert variant="error">{errorMsg}</Alert>}
                <div>
                  <label htmlFor="project-field-newMemberUserId" className="block text-xs font-medium text-slate-700 mb-1">
                    Select Organisation Member <span className="text-rose-500">*</span>
                  </label>
                  <select id="project-field-newMemberUserId"
                    value={newMemberUserId}
                    onChange={(e) => setNewMemberUserId(e.target.value)}
                    required
                    className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  >
                    <option value="">Select a member...</option>
                    {orgMembers
                      .filter((om) => !project.members?.some((pm) => pm.userId === om.userId))
                      .map((m) => (
                        <option key={m.userId} value={m.userId}>
                          {m.fullName} ({m.email})
                        </option>
                      ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="project-field-newMemberRole" className="block text-xs font-medium text-slate-700 mb-1">
                    Project Role
                  </label>
                  <select id="project-field-newMemberRole"
                    value={newMemberRole}
                    onChange={(e) => setNewMemberRole(e.target.value as ProjectMemberRole)}
                    className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  >
                    <option value="member">Team Member</option>
                    <option value="manager">Project Manager</option>
                    <option value="viewer">Viewer</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-end space-x-2 p-4 border-t border-slate-100 bg-slate-50/50 rounded-b-xl">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsAddMemberOpen(false)}
                  disabled={isSubmittingMember}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={isSubmittingMember || !newMemberUserId}
                >
                  {isSubmittingMember ? 'Adding...' : 'Add Member'}
                </Button>
              </div>
            </form>
      </Dialog>

      {/* Create Task Dialog (PRJ-003) */}
      {effectiveOrgId && projectId && (
        <CreateTaskDialog
          isOpen={isCreateTaskOpen}
          onClose={() => setIsCreateTaskOpen(false)}
          organisationId={effectiveOrgId}
          projectId={projectId}
          projectMembers={project?.members || []}
          initialStatus={createTaskInitialStatus}
          onSuccess={handleTaskCreated}
        />
      )}

      {/* Task Detail Dialog (PRJ-003, PRJ-004) */}
      {effectiveOrgId && projectId && selectedTask && (
        <TaskDetailDialog
          isOpen={!!selectedTask}
          onClose={() => setSelectedTask(null)}
          task={selectedTask}
          organisationId={effectiveOrgId}
          projectId={projectId}
          projectMembers={project?.members || []}
          isProjectArchived={isArchived}
          canUpdate={canUpdateTasks}
          canReopen={managesTasks}
          canDelete={canDeleteTasks}
          onTaskUpdated={handleTaskUpdated}
          onTaskDeleted={handleTaskDeleted}
        />
      )}
      <ConfirmDialog isOpen={confirmArchive} onClose={() => !isTransitioning && setConfirmArchive(false)}
        onConfirm={async () => { await handleStatusTransition('archived'); setConfirmArchive(false); }}
        title="Archive this project?" description="The project and its tasks will become read-only. Your team can still view its history."
        confirmLabel="Archive project" isLoading={isTransitioning} variant="destructive" />
      {/* Remove Member Confirmation Dialog */}
      <ConfirmDialog
        isOpen={!!memberToRemove}
        onClose={() => setMemberToRemove(null)}
        onConfirm={confirmRemoveMember}
        title="Remove Project Member"
        description="Are you sure you want to remove this member from the project? They will no longer have access to private project tasks."
        confirmLabel="Remove Member"
        variant="destructive"
        isLoading={isRemovingMember}
      />
    </div>
  );
}
