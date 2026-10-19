import React, { useEffect, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { Breadcrumbs } from '@/components/ui/Breadcrumbs';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/Table';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Alert } from '@/components/ui/Alert';
import { UserPlus, Mail, Trash2, Shield, Plus, X } from 'lucide-react';
import { apiClient, ApiError } from '@/api/client';
import { useOrg } from '@/api/OrgContext';

interface RoleRef {
  id: string;
  slug: string;
  name: string;
  scope?: string;
}

interface Member {
  membershipId: string;
  userId: string;
  fullName: string;
  email: string;
  status: string;
  joinedAt: string;
  role: RoleRef;
  roles?: RoleRef[];
}

interface Invitation {
  id: string;
  email: string;
  status: string;
  expiresAt: string;
  createdAt: string;
  invitedByName: string;
  role: {
    slug: string;
    name: string;
  };
}

export function MembersPage() {
  const { orgId } = useParams<{ orgId: string }>();
  const { activeOrg, activeDetails } = useOrg();

  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [availableRoles, setAvailableRoles] = useState<RoleRef[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Invite modal state
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'organisation_member' | 'organisation_admin'>('organisation_member');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  // Role management modal state (RBAC-004, RBAC-005, RBAC-006)
  const [isRoleModalOpen, setIsRoleModalOpen] = useState(false);
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [roleToAssign, setRoleToAssign] = useState<string>('');
  const [isAssigningRole, setIsAssigningRole] = useState(false);
  const [roleModalError, setRoleModalError] = useState<string | null>(null);

  const effectiveOrgId = orgId && orgId !== 'default' ? orgId : activeOrg?.id;

  const canManageMembers =
    activeDetails?.membership?.permissions?.includes('org.members.manage') ||
    activeDetails?.membership?.permissions?.includes('org.roles.assign') ||
    activeDetails?.membership?.role?.slug === 'organisation_owner' ||
    activeDetails?.membership?.role?.slug === 'organisation_admin';

  const isOwner = activeDetails?.membership?.role?.slug === 'organisation_owner';

  const fetchMembers = useCallback(async () => {
    if (!effectiveOrgId) return;

    try {
      setIsLoading(true);
      setErrorMsg(null);
      const [membersRes, rolesRes] = await Promise.all([
        apiClient<{ members: Member[]; invitations: Invitation[] }>(
          `/organisations/${effectiveOrgId}/members`
        ),
        apiClient<{ roles: RoleRef[] }>(`/organisations/${effectiveOrgId}/roles`).catch(() => ({
          data: { roles: [] },
        })),
      ]);

      if (membersRes.data) {
        setMembers(membersRes.data.members || []);
        setInvitations(membersRes.data.invitations || []);
      }
      if (rolesRes.data) {
        // Exclude platform scoped roles from organisation role assignments
        const orgAssignable = (rolesRes.data.roles || []).filter((r) => r.scope !== 'platform');
        setAvailableRoles(orgAssignable);
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setErrorMsg(err.message);
      } else {
        setErrorMsg('Failed to load organisation members.');
      }
    } finally {
      setIsLoading(false);
    }
  }, [effectiveOrgId]);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  // Handle invitation creation
  async function handleSendInvite(e: React.FormEvent) {
    e.preventDefault();
    setInviteError(null);
    setSuccessMsg(null);

    if (!inviteEmail.trim()) {
      setInviteError('Please provide a valid email address.');
      return;
    }

    try {
      setIsSubmitting(true);
      await apiClient(`/organisations/${effectiveOrgId}/invitations`, {
        method: 'POST',
        body: JSON.stringify({
          email: inviteEmail.trim(),
          roleSlug: inviteRole,
        }),
      });

      setSuccessMsg(`Invitation dispatched to ${inviteEmail}.`);
      setInviteEmail('');
      setIsInviteOpen(false);
      await fetchMembers();
    } catch (err) {
      if (err instanceof ApiError) {
        setInviteError(err.message);
      } else {
        setInviteError('Failed to send invitation.');
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  // Handle invitation revocation
  async function handleRevokeInvite(invitationId: string) {
    if (!confirm('Are you sure you want to revoke this invitation?')) return;

    try {
      await apiClient(`/organisations/${effectiveOrgId}/invitations/${invitationId}/revoke`, {
        method: 'POST',
      });
      setSuccessMsg('Invitation revoked successfully.');
      await fetchMembers();
    } catch (err) {
      if (err instanceof ApiError) {
        setErrorMsg(err.message);
      } else {
        setErrorMsg('Failed to revoke invitation.');
      }
    }
  }

  // Handle member removal
  async function handleRemoveMember(targetUserId: string, targetName: string) {
    if (!confirm(`Are you sure you want to remove ${targetName} from this organisation?`)) return;

    try {
      await apiClient(`/organisations/${effectiveOrgId}/members/${targetUserId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'removed' }),
      });
      setSuccessMsg(`Member ${targetName} removed from organisation.`);
      await fetchMembers();
    } catch (err) {
      if (err instanceof ApiError) {
        setErrorMsg(err.message);
      } else {
        setErrorMsg('Failed to remove member.');
      }
    }
  }

  // Open Role Management modal
  function openRoleModal(member: Member) {
    setSelectedMember(member);
    setRoleModalError(null);
    setRoleToAssign('');
    setIsRoleModalOpen(true);
  }

  // Assign role to member (RBAC-005 anti-escalation)
  async function handleAssignRole(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedMember || !roleToAssign) return;

    setRoleModalError(null);
    try {
      setIsAssigningRole(true);
      await apiClient(`/organisations/${effectiveOrgId}/members/${selectedMember.userId}/roles`, {
        method: 'POST',
        body: JSON.stringify({ roleSlug: roleToAssign }),
      });

      setSuccessMsg(`Role assigned successfully to ${selectedMember.fullName}.`);
      setRoleToAssign('');
      await fetchMembers();

      // Update selected member in modal
      const updatedMembers = await apiClient<{ members: Member[] }>(
        `/organisations/${effectiveOrgId}/members`
      );
      const refreshedTarget = updatedMembers.data?.members.find(
        (m) => m.userId === selectedMember.userId
      );
      if (refreshedTarget) {
        setSelectedMember(refreshedTarget);
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setRoleModalError(err.message);
      } else {
        setRoleModalError('Failed to assign role.');
      }
    } finally {
      setIsAssigningRole(false);
    }
  }

  // Remove role from member (ORG-008 final-owner protected)
  async function handleRemoveRole(roleSlug: string) {
    if (!selectedMember) return;
    setRoleModalError(null);

    try {
      setIsAssigningRole(true);
      await apiClient(
        `/organisations/${effectiveOrgId}/members/${selectedMember.userId}/roles/${roleSlug}`,
        {
          method: 'DELETE',
        }
      );

      setSuccessMsg(`Role ${roleSlug} revoked from ${selectedMember.fullName}.`);
      await fetchMembers();

      // Refresh target in modal
      const updatedMembers = await apiClient<{ members: Member[] }>(
        `/organisations/${effectiveOrgId}/members`
      );
      const refreshedTarget = updatedMembers.data?.members.find(
        (m) => m.userId === selectedMember.userId
      );
      if (refreshedTarget) {
        setSelectedMember(refreshedTarget);
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setRoleModalError(err.message);
      } else {
        setRoleModalError('Failed to revoke role.');
      }
    } finally {
      setIsAssigningRole(false);
    }
  }

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: 'Workspace', href: '/app' },
          { label: activeOrg?.name || 'Organisation', href: `/app/organisations/${effectiveOrgId}/settings` },
          { label: 'Members & Roles' },
        ]}
      />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Members & Roles</h1>
          <p className="text-xs text-slate-500 mt-1">
            Manage teammates, scoped roles, and pending invitations for <strong className="text-slate-700">{activeOrg?.name || 'this organisation'}</strong>.
          </p>
        </div>

        {canManageMembers && (
          <Button
            size="sm"
            onClick={() => {
              setInviteEmail('');
              setInviteRole('organisation_member');
              setInviteError(null);
              setIsInviteOpen(true);
            }}
            className="gap-1.5 self-start sm:self-auto"
          >
            <UserPlus className="h-4 w-4" />
            <span>Invite Member</span>
          </Button>
        )}
      </div>

      {errorMsg && (
        <Alert variant="error" title="Error">
          {errorMsg}
        </Alert>
      )}

      {successMsg && (
        <Alert variant="success" title="Success">
          {successMsg}
        </Alert>
      )}

      {/* Members Table */}
      <Card>
        <CardHeader className="p-5 pb-4 border-b border-border">
          <CardTitle className="text-base">Active Members ({members.length})</CardTitle>
          <CardDescription className="text-xs">
            Members authenticated with active workspace access and assigned scoped RBAC roles.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Member</TableHead>
                <TableHead>Assigned Roles</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Joined</TableHead>
                {canManageMembers && <TableHead className="text-right">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-slate-400 text-xs">
                    Loading members...
                  </TableCell>
                </TableRow>
              ) : members.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-slate-400 text-xs">
                    No active members found.
                  </TableCell>
                </TableRow>
              ) : (
                members.map((member) => {
                  const memberRoles = member.roles && member.roles.length > 0 ? member.roles : [member.role];
                  const isTargetOwner = memberRoles.some((r) => r.slug === 'organisation_owner');
                  const canEditThisMember = isOwner || (!isTargetOwner && canManageMembers);

                  return (
                    <TableRow key={member.membershipId}>
                      <TableCell>
                        <div className="font-medium text-slate-900 text-xs">{member.fullName}</div>
                        <div className="text-[11px] text-slate-400">{member.email}</div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1 items-center">
                          {memberRoles.map((r) => (
                            <Badge
                              key={r.slug || r.id}
                              variant={r.slug === 'organisation_owner' ? 'brand' : 'neutral'}
                            >
                              {r.name}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={member.status === 'active' ? 'success' : 'warning'}>
                          {member.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-slate-500">
                        {new Date(member.joinedAt).toLocaleDateString()}
                      </TableCell>
                      {canManageMembers && (
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            {canEditThisMember && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => openRoleModal(member)}
                                className="h-7 px-2 text-xs gap-1"
                                title="Manage roles"
                              >
                                <Shield className="h-3 w-3 text-slate-500" />
                                <span>Roles</span>
                              </Button>
                            )}

                            {canEditThisMember && !isTargetOwner ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleRemoveMember(member.userId, member.fullName)}
                                className="text-red-600 hover:text-red-700 hover:bg-red-50 h-7 px-2"
                                title="Remove member"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            ) : isTargetOwner ? (
                              <span className="text-[11px] text-slate-300 px-1">Protected</span>
                            ) : null}
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Pending Invitations Table */}
      <Card>
        <CardHeader className="p-5 pb-4">
          <CardTitle className="text-base">Pending Invitations ({invitations.length})</CardTitle>
          <CardDescription className="text-xs">
            Invitations expire after 7 days and can be accepted once by the matching email address.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email Address</TableHead>
                <TableHead>Initial Role</TableHead>
                <TableHead>Invited By</TableHead>
                <TableHead>Expires</TableHead>
                {canManageMembers && <TableHead className="text-right">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-slate-400 text-xs">
                    Loading invitations...
                  </TableCell>
                </TableRow>
              ) : invitations.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-slate-400 text-xs">
                    No pending invitations.
                  </TableCell>
                </TableRow>
              ) : (
                invitations.map((invite) => (
                  <TableRow key={invite.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Mail className="h-3.5 w-3.5 text-slate-400" />
                        <span className="font-medium text-slate-800 text-xs">{invite.email}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="neutral">{invite.role.name}</Badge>
                    </TableCell>
                    <TableCell className="text-xs text-slate-500">
                      {invite.invitedByName || 'Team Member'}
                    </TableCell>
                    <TableCell className="text-xs text-slate-500">
                      {new Date(invite.expiresAt).toLocaleDateString()}
                    </TableCell>
                    {canManageMembers && (
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRevokeInvite(invite.id)}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50 text-xs h-7 px-2"
                        >
                          Revoke
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Invite Member Dialog */}
      <Dialog
        isOpen={isInviteOpen}
        onClose={() => !isSubmitting && setIsInviteOpen(false)}
        title="Invite New Member"
        description="A single-use 7-day invitation link will be dispatched to the recipient's email address."
      >
        <form onSubmit={handleSendInvite} className="space-y-4 mt-2">
          {inviteError && (
            <Alert variant="error" title="Error">
              {inviteError}
            </Alert>
          )}

          <FormField
            label="Recipient Email"
            required
            htmlFor="invite-email"
            helperText="The user must sign in with this exact email address to accept."
          >
            <Input
              id="invite-email"
              type="email"
              placeholder="colleague@example.com"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              required
              disabled={isSubmitting}
            />
          </FormField>

          <FormField
            label="Initial Role"
            htmlFor="invite-role"
            helperText="Organisation Admins can manage members and settings; Members can access entitled workspaces."
          >
            <Select
              id="invite-role"
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as 'organisation_member' | 'organisation_admin')}
              disabled={isSubmitting}
            >
              <option value="organisation_member">Organisation Member</option>
              <option value="organisation_admin">Organisation Admin</option>
            </Select>
          </FormField>

          <div className="mt-6 flex justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsInviteOpen(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" isLoading={isSubmitting}>
              Send Invitation
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Manage Roles Dialog (RBAC-004, RBAC-005, RBAC-006) */}
      <Dialog
        isOpen={isRoleModalOpen}
        onClose={() => !isAssigningRole && setIsRoleModalOpen(false)}
        title={`Manage Roles — ${selectedMember?.fullName}`}
        description="Assign scoped module roles or organization privileges. Least privilege and anti-escalation rules apply."
      >
        <div className="space-y-5 mt-2">
          {roleModalError && (
            <Alert variant="error" title="Role Operation Failed">
              {roleModalError}
            </Alert>
          )}

          {/* Current Roles */}
          <div>
            <span className="text-xs font-semibold text-slate-700 block mb-2">
              Currently Assigned Roles
            </span>
            <div className="space-y-2">
              {(() => {
                const curRoles =
                  selectedMember?.roles && selectedMember.roles.length > 0
                    ? selectedMember.roles
                    : selectedMember
                    ? [selectedMember.role]
                    : [];

                return curRoles.map((r) => {
                  const isSoleOwner = r.slug === 'organisation_owner';
                  return (
                    <div
                      key={r.slug || r.id}
                      className="flex items-center justify-between p-2.5 rounded-md border border-slate-200 bg-slate-50 text-xs"
                    >
                      <div>
                        <span className="font-medium text-slate-800">{r.name}</span>
                        <span className="font-mono text-[10px] text-slate-400 ml-2">
                          ({r.slug})
                        </span>
                      </div>
                      {isSoleOwner ? (
                        <span className="text-[10px] text-slate-400 italic">
                          Protected Owner
                        </span>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveRole(r.slug)}
                          disabled={isAssigningRole}
                          className="h-6 px-1.5 text-red-600 hover:text-red-700 hover:bg-red-50 text-[11px]"
                        >
                          <X className="h-3 w-3 mr-1" />
                          <span>Revoke</span>
                        </Button>
                      )}
                    </div>
                  );
                });
              })()}
            </div>
          </div>

          {/* Assign New Role */}
          <form onSubmit={handleAssignRole} className="border-t border-slate-200 pt-4 space-y-3">
            <span className="text-xs font-semibold text-slate-700 block">
              Assign Additional Role
            </span>
            <div className="flex gap-2">
              <Select
                value={roleToAssign}
                onChange={(e) => setRoleToAssign(e.target.value)}
                disabled={isAssigningRole}
                className="text-xs flex-1"
                aria-label="Select role to assign"
              >
                <option value="">Select a role to assign...</option>
                {availableRoles
                  .filter((ar) => {
                    const memberRoleSlugs = (
                      selectedMember?.roles && selectedMember.roles.length > 0
                        ? selectedMember.roles
                        : selectedMember
                        ? [selectedMember.role]
                        : []
                    ).map((r) => r.slug);
                    return !memberRoleSlugs.includes(ar.slug);
                  })
                  .map((ar) => (
                    <option key={ar.id || ar.slug} value={ar.slug}>
                      {ar.name} ({ar.scope || 'org'})
                    </option>
                  ))}
              </Select>
              <Button
                type="submit"
                size="sm"
                disabled={!roleToAssign || isAssigningRole}
                isLoading={isAssigningRole}
                className="gap-1 shrink-0"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Assign</span>
              </Button>
            </div>
            <p className="text-[11px] text-slate-400">
              Only roles within your authorized permission scope can be assigned (anti-escalation check enforced).
            </p>
          </form>

          <div className="mt-4 flex justify-end border-t border-slate-200 pt-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsRoleModalOpen(false)}
            >
              Close
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
