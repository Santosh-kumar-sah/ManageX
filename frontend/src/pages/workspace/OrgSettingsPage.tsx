import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { Breadcrumbs } from '@/components/ui/Breadcrumbs';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { FormField } from '@/components/ui/FormField';
import { Select } from '@/components/ui/Select';
import { Alert } from '@/components/ui/Alert';
import { Dialog } from '@/components/ui/Dialog';
import { ShieldAlert, ArrowRightLeft, LogOut } from 'lucide-react';
import { apiClient, ApiError } from '@/api/client';
import { useOrg } from '@/api/OrgContext';
import { useAuth } from '@/api/AuthContext';
import { cn } from '@/lib/utils';
import { IntegrationsSettingsTab } from './settings/IntegrationsSettingsTab';

interface MemberCandidate {
  userId: string;
  fullName: string;
  email: string;
  status: string;
  role: {
    slug: string;
    name: string;
  };
}

export function OrgSettingsPage() {
  const { orgId } = useParams<{ orgId: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { activeOrg, activeDetails, refreshOrganisations } = useOrg();
  const { user } = useAuth();

  const effectiveOrgId = orgId && orgId !== 'default' ? orgId : activeOrg?.id;
  const activeTab = searchParams.get('tab') === 'integrations' ? 'integrations' : 'general';

  function handleTabChange(tab: 'general' | 'integrations') {
    const next = new URLSearchParams(searchParams);
    if (tab === 'general') {
      next.delete('tab');
    } else {
      next.set('tab', 'integrations');
    }
    setSearchParams(next);
  }

  // Form states
  const [name, setName] = useState(activeOrg?.name || '');
  const [isSavingName, setIsSavingName] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [nameSuccess, setNameSuccess] = useState<string | null>(null);

  // Transfer Ownership dialog state (ORG-008)
  const [isTransferOpen, setIsTransferOpen] = useState(false);
  const [candidates, setCandidates] = useState<MemberCandidate[]>([]);
  const [isLoadingCandidates, setIsLoadingCandidates] = useState(false);
  const [selectedTargetUserId, setSelectedTargetUserId] = useState<string>('');
  const [stepUpPassword, setStepUpPassword] = useState('');
  const [isSubmittingTransfer, setIsSubmittingTransfer] = useState(false);
  const [transferError, setTransferError] = useState<string | null>(null);
  const [transferSuccess, setTransferSuccess] = useState<string | null>(null);

  // Leave Org dialog state (ORG-010)
  const [isLeaveOpen, setIsLeaveOpen] = useState(false);
  const [isSubmittingLeave, setIsSubmittingLeave] = useState(false);
  const [leaveError, setLeaveError] = useState<string | null>(null);

  useEffect(() => {
    if (activeOrg?.name) {
      setName(activeOrg.name);
    }
  }, [activeOrg?.name]);

  const canEdit = activeDetails?.membership?.permissions?.includes('org.edit') ?? false;
  const isOwner = activeDetails?.membership?.role?.slug === 'organisation_owner';

  // Handle name update (ORG-009)
  async function handleUpdateName(e: React.FormEvent) {
    e.preventDefault();
    setNameError(null);
    setNameSuccess(null);

    if (!effectiveOrgId) return;
    if (name.trim().length < 2) {
      setNameError('Organisation name must be at least 2 characters.');
      return;
    }

    try {
      setIsSavingName(true);
      await apiClient(`/organisations/${effectiveOrgId}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: name.trim() }),
      });
      setNameSuccess('Organisation name updated successfully.');
      await refreshOrganisations();
    } catch (err) {
      if (err instanceof ApiError) {
        setNameError(err.message);
      } else {
        setNameError('Failed to update organisation name.');
      }
    } finally {
      setIsSavingName(false);
    }
  }

  // Open transfer dialog and fetch eligible members
  async function handleOpenTransfer() {
    setIsTransferOpen(true);
    setTransferError(null);
    setStepUpPassword('');
    setSelectedTargetUserId('');

    if (!effectiveOrgId) return;

    try {
      setIsLoadingCandidates(true);
      const res = await apiClient<{ members: MemberCandidate[] }>(`/organisations/${effectiveOrgId}/members`);
      const eligible = (res.data?.members || []).filter(
        (m) => m.userId !== user?.id && m.status === 'active'
      );
      setCandidates(eligible);
      if (eligible.length > 0) {
        setSelectedTargetUserId(eligible[0].userId);
      }
    } catch {
      setTransferError('Failed to load eligible active members.');
    } finally {
      setIsLoadingCandidates(false);
    }
  }

  // Submit Step-Up Ownership Transfer (ORG-008)
  async function handleSubmitTransfer(e: React.FormEvent) {
    e.preventDefault();
    setTransferError(null);

    if (!effectiveOrgId) return;
    if (!selectedTargetUserId) {
      setTransferError('Please select a target member to receive primary ownership.');
      return;
    }
    if (!stepUpPassword) {
      setTransferError('Please enter your current password for step-up verification.');
      return;
    }

    try {
      setIsSubmittingTransfer(true);
      await apiClient(`/organisations/${effectiveOrgId}/transfer-owner`, {
        method: 'POST',
        body: JSON.stringify({
          targetUserId: selectedTargetUserId,
          password: stepUpPassword,
        }),
      });

      setTransferSuccess('Ownership transferred successfully. Your role is now Organisation Admin.');
      setIsTransferOpen(false);
      setStepUpPassword('');
      await refreshOrganisations();
    } catch (err) {
      if (err instanceof ApiError) {
        setTransferError(err.message);
      } else {
        setTransferError('Ownership transfer failed. Check your password and try again.');
      }
    } finally {
      setIsSubmittingTransfer(false);
    }
  }

  // Submit Leave Organisation (ORG-010)
  async function handleSubmitLeave() {
    setLeaveError(null);
    if (!effectiveOrgId) return;

    try {
      setIsSubmittingLeave(true);
      await apiClient(`/organisations/${effectiveOrgId}/leave`, {
        method: 'POST',
      });

      setIsLeaveOpen(false);
      await refreshOrganisations();
      navigate('/app/organisations');
    } catch (err) {
      if (err instanceof ApiError) {
        setLeaveError(err.message);
      } else {
        setLeaveError('Failed to leave organisation.');
      }
    } finally {
      setIsSubmittingLeave(false);
    }
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <Breadcrumbs
        items={[
          { label: 'Workspace', href: '/app' },
          { label: activeOrg?.name || 'Organisation', href: '/app' },
          { label: 'Organisation Settings' },
        ]}
      />

      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Organisation Settings</h1>
        <p className="text-xs text-slate-500 mt-1">
          Manage organisation profile details, ownership credentials, and workspace membership.
        </p>
      </div>

      {/* Tabs Navigation */}
      <div className="flex border-b border-slate-200 gap-6">
        <button
          type="button"
          onClick={() => handleTabChange('general')}
          className={cn(
            'pb-3 text-sm font-medium border-b-2 transition-colors',
            activeTab === 'general'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
          )}
        >
          General
        </button>
        <button
          type="button"
          onClick={() => handleTabChange('integrations')}
          className={cn(
            'pb-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5',
            activeTab === 'integrations'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
          )}
        >
          Integrations
        </button>
      </div>

      {activeTab === 'integrations' ? (
        <IntegrationsSettingsTab
          effectiveOrgId={effectiveOrgId || ''}
          canEdit={canEdit}
        />
      ) : (
        <>
          {nameSuccess && (
            <Alert variant="success" title="Success">
              {nameSuccess}
            </Alert>
          )}

          {transferSuccess && (
            <Alert variant="success" title="Ownership Transferred">
              {transferSuccess}
            </Alert>
          )}

          {/* General Settings Card */}
      <Card>
        <form onSubmit={handleUpdateName}>
          <CardHeader className="p-5 pb-3">
            <CardTitle className="text-base">General Information</CardTitle>
            <CardDescription className="text-xs">
              Basic metadata and display attributes for this workspace.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-5 space-y-4">
            {nameError && (
              <Alert variant="error" title="Validation Error">
                {nameError}
              </Alert>
            )}

            <FormField
              label="Organisation Name"
              required
              htmlFor="org-name"
              helperText="The primary display name shown across all workspace headers and emails."
            >
              <Input
                id="org-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={!canEdit || isSavingName}
                required
              />
            </FormField>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <FormField label="URL Slug" helperText="Permanent unique workspace handle.">
                <Input value={activeOrg?.slug || ''} disabled className="bg-slate-50 text-slate-500" />
              </FormField>

              <FormField label="Workspace UUID" helperText="Immutable database identifier.">
                <Input value={activeOrg?.id || ''} disabled className="bg-slate-50 font-mono text-[11px] text-slate-500" />
              </FormField>
            </div>
          </CardContent>
          <CardFooter className="p-5 pt-3 bg-slate-50 border-t border-slate-100 flex justify-between items-center">
            <span className="text-[11px] text-slate-400">
              {canEdit ? 'Changes will reflect across your entire team immediately.' : 'You have view-only access to these settings.'}
            </span>
            {canEdit && (
              <Button type="submit" size="sm" isLoading={isSavingName} disabled={!name.trim() || name === activeOrg?.name}>
                Save Changes
              </Button>
            )}
          </CardFooter>
        </form>
      </Card>

      {/* High-Impact Actions & Final-Owner Protection Card */}
      <Card className="border-red-200">
        <CardHeader className="p-5 pb-3 bg-red-50/40 border-b border-red-100">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-red-600" />
            <CardTitle className="text-base text-red-950">Danger Zone & Lifecycle Actions</CardTitle>
          </div>
          <CardDescription className="text-xs text-red-700/80">
            High-impact administrative actions requiring elevated privileges and protected by strict safety invariants.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-5 space-y-6">
          {/* Transfer Ownership */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-100">
            <div>
              <div className="font-semibold text-slate-900 text-xs sm:text-sm">Transfer Organisation Ownership</div>
              <p className="text-xs text-slate-500 mt-0.5">
                Designate another active member as primary Owner. Requires step-up password reauthentication. Your role will become Organisation Admin.
              </p>
            </div>
            {isOwner ? (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 self-start shrink-0 text-amber-700 border-amber-300 hover:bg-amber-50"
                onClick={handleOpenTransfer}
              >
                <ArrowRightLeft className="h-3.5 w-3.5" />
                <span>Transfer Ownership</span>
              </Button>
            ) : (
              <span className="text-xs text-slate-400 italic shrink-0">Owner only</span>
            )}
          </div>

          {/* Leave Organisation */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="font-semibold text-slate-900 text-xs sm:text-sm">Leave Organisation</div>
              <p className="text-xs text-slate-500 mt-0.5">
                Relinquish your membership and access to this workspace. Final-owner protection prevents leaving if you are the sole active Owner.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 self-start shrink-0 text-red-600 border-red-200 hover:bg-red-50"
              onClick={() => {
                setLeaveError(null);
                setIsLeaveOpen(true);
              }}
            >
              <LogOut className="h-3.5 w-3.5" />
              <span>Leave Workspace</span>
            </Button>
          </div>
        </CardContent>
      </Card>
      </>
      )}

      {/* Step-Up Ownership Transfer Dialog (ORG-008) */}
      <Dialog
        isOpen={isTransferOpen}
        onClose={() => !isSubmittingTransfer && setIsTransferOpen(false)}
        title="Transfer Organisation Ownership"
        description="Transferring ownership is an irreversible administrative step. Please select an active team member and confirm your password."
      >
        <form onSubmit={handleSubmitTransfer} className="space-y-4 mt-2">
          {transferError && (
            <Alert variant="error" title="Transfer Failed">
              {transferError}
            </Alert>
          )}

          {isLoadingCandidates ? (
            <p className="text-xs text-slate-400 py-4 text-center">Loading team members...</p>
          ) : candidates.length === 0 ? (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800">
              No other active members found. You must invite or activate another team member before you can transfer ownership.
            </div>
          ) : (
            <>
              <FormField
                label="New Primary Owner"
                required
                htmlFor="target-user"
                helperText="Selected member will gain full Owner rights. You will retain Organisation Admin privileges."
              >
                <Select
                  id="target-user"
                  value={selectedTargetUserId}
                  onChange={(e) => setSelectedTargetUserId(e.target.value)}
                  disabled={isSubmittingTransfer}
                  required
                >
                  {candidates.map((candidate) => (
                    <option key={candidate.userId} value={candidate.userId}>
                      {candidate.fullName} ({candidate.email}) — {candidate.role.name}
                    </option>
                  ))}
                </Select>
              </FormField>

              <FormField
                label="Reauthenticate Password"
                required
                htmlFor="stepup-password"
                helperText="Enter your current account password to authorize this sensitive transfer."
              >
                <Input
                  id="stepup-password"
                  type="password"
                  placeholder="••••••••••••"
                  value={stepUpPassword}
                  onChange={(e) => setStepUpPassword(e.target.value)}
                  disabled={isSubmittingTransfer}
                  required
                />
              </FormField>
            </>
          )}

          <div className="mt-6 flex justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsTransferOpen(false)}
              disabled={isSubmittingTransfer}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              isLoading={isSubmittingTransfer}
              disabled={candidates.length === 0 || !stepUpPassword}
              className="bg-amber-700 hover:bg-amber-800 text-white"
            >
              Authorize Transfer
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Leave Organisation Confirmation Dialog (ORG-010) */}
      <Dialog
        isOpen={isLeaveOpen}
        onClose={() => !isSubmittingLeave && setIsLeaveOpen(false)}
        title="Leave Organisation"
        description="Are you sure you want to leave this organisation? You will lose access to all modules, meetings, events, and projects within this workspace."
      >
        <div className="space-y-4 mt-2">
          {leaveError && (
            <Alert variant="error" title="Cannot Leave Organisation">
              {leaveError}
            </Alert>
          )}

          {isOwner && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800">
              <strong>Notice:</strong> As an Owner, if you are the only remaining active Owner, you cannot leave until you transfer ownership to another active member.
            </div>
          )}

          <div className="mt-6 flex justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsLeaveOpen(false)}
              disabled={isSubmittingLeave}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              isLoading={isSubmittingLeave}
              onClick={handleSubmitLeave}
            >
              Confirm Leave
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
