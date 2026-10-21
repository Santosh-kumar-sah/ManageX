import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Breadcrumbs } from '@/components/ui/Breadcrumbs';
import { Card, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Alert } from '@/components/ui/Alert';
import {
  FolderKanban,
  Plus,
  Search,
  Calendar,
  ArrowRight,
  Users,
  Tag,
  Shield,
} from 'lucide-react';
import { apiClient, ApiError } from '@/api/client';
import { useOrg } from '@/api/OrgContext';
import {
  ProjectItem,
  PROJECT_STATUS_LABELS,
  PROJECT_STATUS_VARIANTS,
  PROJECT_PRIORITY_LABELS,
  PROJECT_PRIORITY_VARIANTS,
} from '@/types/projects';
import { CreateProjectDialog } from './CreateProjectDialog';

export function ProjectsPage() {
  const { orgId } = useParams<{ orgId: string }>();
  const { activeOrg, activeDetails } = useOrg();

  const effectiveOrgId = orgId && orgId !== 'default' ? orgId : activeOrg?.id;

  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const canCreateProject =
    activeDetails?.membership?.permissions?.includes('project.create') ||
    activeDetails?.membership?.role?.slug === 'organisation_owner' ||
    activeDetails?.membership?.role?.slug === 'organisation_admin' ||
    activeDetails?.membership?.role?.slug === 'project_admin';

  const fetchProjects = useCallback(async () => {
    if (!effectiveOrgId) return;

    try {
      setIsLoading(true);
      setErrorMsg(null);

      const params = new URLSearchParams();
      if (searchQuery.trim()) params.append('search', searchQuery.trim());
      if (statusFilter !== 'all') params.append('status', statusFilter);
      if (priorityFilter !== 'all') params.append('priority', priorityFilter);

      const queryString = params.toString() ? `?${params.toString()}` : '';
      const res = await apiClient<{ projects: ProjectItem[] }>(
        `/organisations/${effectiveOrgId}/projects${queryString}`
      );

      if (res.data) {
        setProjects(res.data.projects || []);
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setErrorMsg(err.message);
      } else {
        setErrorMsg('Failed to load organisation projects.');
      }
    } finally {
      setIsLoading(false);
    }
  }, [effectiveOrgId, searchQuery, statusFilter, priorityFilter]);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  function formatDate(iso: string | null) {
    if (!iso) return 'Not set';
    return new Date(iso).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: 'Workspace', href: '/app' },
          { label: activeOrg?.name || 'Organisation', href: '/app' },
          { label: 'Projects & Tasks' },
        ]}
      />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Projects & Tasks
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Organise workstreams, manage project memberships, and track delivery lifecycles.
          </p>
        </div>
        {canCreateProject && (
          <Button
            variant="primary"
            onClick={() => setIsCreateOpen(true)}
            className="flex items-center gap-1.5 self-start sm:self-auto shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span>New Project</span>
          </Button>
        )}
      </div>

      {errorMsg && (
        <Alert variant="error" className="text-sm">
          {errorMsg}
        </Alert>
      )}

      {/* Filters Bar */}
      <Card className="border border-slate-200 shadow-sm bg-white">
        <CardContent className="p-3 sm:p-4 space-y-3">
          <div className="flex flex-col md:flex-row gap-3">
            {/* Search */}
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input
                type="text"
                placeholder="Search projects by name or description..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 text-sm w-full"
              />
            </div>

            {/* Priority Selector */}
            <div className="w-full md:w-48">
              <select
                value={priorityFilter}
                onChange={(e) => setPriorityFilter(e.target.value)}
                className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                <option value="all">All Priorities</option>
                <option value="low">Low Priority</option>
                <option value="medium">Medium Priority</option>
                <option value="high">High Priority</option>
                <option value="urgent">Urgent Priority</option>
              </select>
            </div>
          </div>

          {/* Status Tabs */}
          <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-slate-100">
            <span className="text-xs font-medium text-slate-500 mr-1.5">Status:</span>
            {[
              { id: 'all', label: 'All' },
              { id: 'planning', label: 'Planning' },
              { id: 'active', label: 'Active' },
              { id: 'on_hold', label: 'On Hold' },
              { id: 'completed', label: 'Completed' },
              { id: 'archived', label: 'Archived' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setStatusFilter(tab.id)}
                className={`px-2.5 py-1 text-xs rounded-md font-medium transition-colors ${
                  statusFilter === tab.id
                    ? 'bg-indigo-50 text-indigo-700 border border-indigo-200 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Projects Grid */}
      {isLoading ? (
        <div className="py-16 text-center">
          <div className="inline-block animate-spin w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full mb-3" />
          <p className="text-sm text-slate-500">Loading projects...</p>
        </div>
      ) : projects.length === 0 ? (
        <Card className="border border-dashed border-slate-200 bg-slate-50/50">
          <CardContent className="py-16 text-center space-y-3">
            <div className="w-12 h-12 rounded-xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
              <FolderKanban className="w-6 h-6" />
            </div>
            <div>
              <CardTitle className="text-base text-slate-800">
                {searchQuery || statusFilter !== 'all' || priorityFilter !== 'all'
                  ? 'No matching projects found'
                  : 'No projects created yet'}
              </CardTitle>
              <CardDescription className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
                {searchQuery || statusFilter !== 'all' || priorityFilter !== 'all'
                  ? 'Try adjusting your search keywords, priority, or status filters.'
                  : 'Start tracking work by initiating your first project in this organisation.'}
              </CardDescription>
            </div>
            {canCreateProject && !searchQuery && statusFilter === 'all' && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => setIsCreateOpen(true)}
                className="mt-2"
              >
                <Plus className="w-4 h-4 mr-1" /> Create First Project
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((project) => (
            <Link
              key={project.id}
              to={`/app/organisations/${effectiveOrgId}/projects/${project.id}`}
              className="group block"
            >
              <Card className="h-full border border-slate-200/80 hover:border-indigo-300 hover:shadow-md transition-all duration-150 bg-white flex flex-col justify-between">
                <CardContent className="p-5 space-y-4">
                  {/* Top Badges */}
                  <div className="flex items-center justify-between gap-2">
                    <Badge variant={PROJECT_STATUS_VARIANTS[project.status]}>
                      {PROJECT_STATUS_LABELS[project.status]}
                    </Badge>
                    <Badge variant={PROJECT_PRIORITY_VARIANTS[project.priority]}>
                      {PROJECT_PRIORITY_LABELS[project.priority]} Priority
                    </Badge>
                  </div>

                  {/* Title & Description */}
                  <div>
                    <h3 className="text-base font-semibold text-slate-900 group-hover:text-indigo-600 transition-colors line-clamp-1">
                      {project.name}
                    </h3>
                    <p className="text-xs text-slate-500 mt-1 line-clamp-2">
                      {project.description || 'No description provided.'}
                    </p>
                  </div>

                  {/* Metadata List */}
                  <div className="space-y-1.5 text-xs text-slate-600 pt-2 border-t border-slate-100">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400 flex items-center gap-1">
                        <Shield className="w-3.5 h-3.5" /> Owner:
                      </span>
                      <span className="font-medium text-slate-800 truncate max-w-[150px]">
                        {project.ownerName || 'Unassigned'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-slate-400 flex items-center gap-1">
                        <Users className="w-3.5 h-3.5" /> Members:
                      </span>
                      <span className="font-medium text-slate-800">
                        {project.memberCount ?? 1}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-slate-400 flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5" /> Target:
                      </span>
                      <span className="font-medium text-slate-800">
                        {formatDate(project.targetDate)}
                      </span>
                    </div>
                  </div>

                  {/* Labels */}
                  {project.labels && project.labels.length > 0 && (
                    <div className="flex flex-wrap gap-1 pt-1">
                      {project.labels.slice(0, 3).map((lbl, idx) => (
                        <span
                          key={idx}
                          className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-600"
                        >
                          <Tag className="w-2.5 h-2.5 mr-0.5 text-slate-400" />
                          {lbl}
                        </span>
                      ))}
                      {project.labels.length > 3 && (
                        <span className="text-[10px] text-slate-400 self-center">
                          +{project.labels.length - 3} more
                        </span>
                      )}
                    </div>
                  )}
                </CardContent>

                {/* Footer action */}
                <div className="px-5 py-2.5 bg-slate-50/60 border-t border-slate-100 rounded-b-xl flex items-center justify-between text-xs text-slate-500 group-hover:text-indigo-600 transition-colors">
                  <span>View Project Details</span>
                  <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {/* Create Dialog */}
      {effectiveOrgId && (
        <CreateProjectDialog
          isOpen={isCreateOpen}
          onClose={() => setIsCreateOpen(false)}
          organisationId={effectiveOrgId}
          onSuccess={(newProject) => {
            setProjects((prev) => [newProject, ...prev]);
          }}
        />
      )}
    </div>
  );
}
