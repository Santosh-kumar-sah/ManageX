import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Alert } from '@/components/ui/Alert';
import { X, FolderPlus } from 'lucide-react';
import { apiClient, ApiError } from '@/api/client';
import { ProjectItem, ProjectPriority, ProjectStatus } from '@/types/projects';

interface OrgMemberOption {
  userId: string;
  fullName: string;
  email: string;
  status: string;
}

interface CreateProjectDialogProps {
  isOpen: boolean;
  onClose: () => void;
  organisationId: string;
  onSuccess: (project: ProjectItem) => void;
}

export function CreateProjectDialog({
  isOpen,
  onClose,
  organisationId,
  onSuccess,
}: CreateProjectDialogProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<ProjectPriority>('medium');
  const [status, setStatus] = useState<ProjectStatus>('planning');
  const [ownerId, setOwnerId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [labelsInput, setLabelsInput] = useState('');

  const [members, setMembers] = useState<OrgMemberOption[]>([]);
  const [isLoadingMembers, setIsLoadingMembers] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !organisationId) return;

    async function loadMembers() {
      try {
        setIsLoadingMembers(true);
        const res = await apiClient<{
          members: Array<{
            userId?: string;
            fullName?: string;
            email?: string;
            user?: { id: string; fullName: string; email: string };
            status: string;
          }>;
        }>(`/organisations/${organisationId}/members`);
        if (res.data?.members) {
          const activeMembers = res.data.members
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
          setMembers(activeMembers);
          if (activeMembers.length > 0 && !ownerId) {
            setOwnerId(activeMembers[0].userId);
          }
        }
      } catch {
        // Fallback silently if member list fails
      } finally {
        setIsLoadingMembers(false);
      }
    }

    loadMembers();
  }, [isOpen, organisationId]);

  if (!isOpen) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setErrorMsg('Project name is required.');
      return;
    }

    if (startDate && targetDate && new Date(startDate) > new Date(targetDate)) {
      setErrorMsg('Start date cannot be after the target completion date.');
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorMsg(null);

      const labels = labelsInput
        .split(',')
        .map((l) => l.trim())
        .filter(Boolean);

      const payload: Record<string, unknown> = {
        name: name.trim(),
        description: description.trim() || undefined,
        priority,
        status,
        labels,
      };

      if (ownerId) payload.ownerId = ownerId;
      if (startDate) payload.startDate = new Date(startDate).toISOString();
      if (targetDate) payload.targetDate = new Date(targetDate).toISOString();

      const res = await apiClient<{ project: ProjectItem }>(
        `/organisations/${organisationId}/projects`,
        {
          method: 'POST',
          body: JSON.stringify(payload),
        }
      );

      if (res.data?.project) {
        onSuccess(res.data.project);
        onClose();
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setErrorMsg(err.message);
      } else {
        setErrorMsg('Failed to create project.');
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <Card className="w-full max-w-lg bg-white shadow-xl animate-in fade-in zoom-in-95 duration-150">
        <CardHeader className="flex flex-row items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center space-x-2">
            <div className="p-2 rounded-lg bg-indigo-50 text-indigo-600">
              <FolderPlus className="w-5 h-5" />
            </div>
            <div>
              <CardTitle className="text-base font-semibold text-slate-900">
                Create New Project
              </CardTitle>
              <CardDescription className="text-xs text-slate-500">
                Configure project parameters, priority, and assign an eligible owner.
              </CardDescription>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1 rounded-md hover:bg-slate-50 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </CardHeader>

        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4 pt-4">
            {errorMsg && (
              <Alert variant="error" className="text-xs py-2">
                {errorMsg}
              </Alert>
            )}

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Project Name <span className="text-rose-500">*</span>
              </label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Platform Micro-Frontend Migration"
                required
                maxLength={255}
                autoFocus
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Description (Optional)
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Briefly describe the objectives, scope, and technical roadmap..."
                rows={3}
                className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Initial Status
                </label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as ProjectStatus)}
                  className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="planning">Planning</option>
                  <option value="active">Active</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Priority
                </label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as ProjectPriority)}
                  className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Project Owner / Manager
              </label>
              <select
                value={ownerId}
                onChange={(e) => setOwnerId(e.target.value)}
                disabled={isLoadingMembers || members.length === 0}
                className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:bg-slate-50 disabled:text-slate-400"
              >
                {members.length === 0 && <option value="">Loading members...</option>}
                {members.map((m) => (
                  <option key={m.userId} value={m.userId}>
                    {m.fullName} ({m.email})
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Owner will automatically be added as a project manager member.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Start Date (Optional)
                </label>
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Target Completion (Optional)
                </label>
                <Input
                  type="date"
                  value={targetDate}
                  onChange={(e) => setTargetDate(e.target.value)}
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Labels (Optional, comma-separated)
              </label>
              <Input
                value={labelsInput}
                onChange={(e) => setLabelsInput(e.target.value)}
                placeholder="e.g. frontend, performance, q4"
              />
            </div>
          </CardContent>

          <div className="flex items-center justify-end space-x-2 p-4 border-t border-slate-100 bg-slate-50/50 rounded-b-xl">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Creating...' : 'Create Project'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
