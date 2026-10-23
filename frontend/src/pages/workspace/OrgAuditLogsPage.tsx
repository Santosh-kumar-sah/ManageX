import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { Breadcrumbs } from '@/components/ui/Breadcrumbs';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/Table';
import { Badge } from '@/components/ui/Badge';
import { Pagination } from '@/components/ui/Pagination';
import { Select } from '@/components/ui/Select';
import { Alert } from '@/components/ui/Alert';
import { ShieldCheck, User, RefreshCw } from 'lucide-react';
import { apiClient, ApiError } from '@/api/client';
import { useOrg } from '@/api/OrgContext';

export interface AuditRecord {
  id: string;
  action: string;
  actorUserId: string | null;
  actorName: string | null;
  actorEmail: string | null;
  targetType: string | null;
  targetId: string | null;
  ipAddress: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

interface PaginationMeta {
  page: number;
  limit: number;
  totalRecords: number;
  totalPages: number;
}

const ACTION_BADGE_VARIANTS: Record<string, 'brand' | 'success' | 'warning' | 'danger' | 'neutral'> = {
  'org.created': 'brand',
  'org.updated': 'neutral',
  'org.ownership_transferred': 'warning',
  'member.invited': 'brand',
  'member.joined': 'success',
  'member.removed': 'danger',
  'member.role_assigned': 'brand',
  'member.role_removed': 'warning',
  'invitation.revoked': 'danger',
  'module.enabled': 'success',
  'module.disabled': 'warning',
};

export function formatAuditAction(action: string): string {
  const map: Record<string, string> = {
    'org.created': 'Organisation Created',
    'org.updated': 'Organisation Updated',
    'org.ownership_transferred': 'Ownership Transferred',
    'member.invited': 'Member Invited',
    'member.joined': 'Member Joined',
    'member.removed': 'Member Removed',
    'member.role_assigned': 'Role Assigned',
    'member.role_removed': 'Role Revoked',
    'invitation.revoked': 'Invitation Revoked',
    'module.enabled': 'Module Activated',
    'module.disabled': 'Module Deactivated',
    'event.created': 'Event Created',
    'event.updated': 'Event Updated',
    'event.status_changed': 'Event Status Changed',
    'meeting.created': 'Meeting Created',
    'meeting.updated': 'Meeting Updated',
    'meeting.status_changed': 'Meeting Status Changed',
    'project.created': 'Project Created',
    'project.updated': 'Project Updated',
    'project.status_changed': 'Project Status Changed',
  };
  if (map[action]) return map[action];
  return action
    .split(/[\._]/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function OrgAuditLogsPage() {
  const { orgId } = useParams<{ orgId: string }>();
  const { activeOrg, activeDetails } = useOrg();

  const [logs, setLogs] = useState<AuditRecord[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta>({
    page: 1,
    limit: 20,
    totalRecords: 0,
    totalPages: 1,
  });
  const [actionFilter, setActionFilter] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const effectiveOrgId = orgId && orgId !== 'default' ? orgId : activeOrg?.id;
  const canViewAudit =
    activeDetails?.membership?.permissions?.includes('org.audit.view') ||
    activeDetails?.membership?.role?.slug === 'organisation_owner' ||
    activeDetails?.membership?.role?.slug === 'organisation_admin';

  const fetchLogs = useCallback(
    async (pageToFetch = 1, currentFilter = actionFilter) => {
      if (!effectiveOrgId || !canViewAudit) return;

      try {
        setIsLoading(true);
        setErrorMsg(null);

        let query = `/organisations/${effectiveOrgId}/audit-logs?page=${pageToFetch}&limit=20`;
        if (currentFilter) {
          query += `&action=${encodeURIComponent(currentFilter)}`;
        }

        const res = await apiClient<{ logs: AuditRecord[]; pagination: PaginationMeta }>(query);
        if (res.data) {
          setLogs(res.data.logs || []);
          setPagination(res.data.pagination);
        }
      } catch (err) {
        if (err instanceof ApiError) {
          setErrorMsg(err.message);
        } else {
          setErrorMsg('Failed to load audit logs.');
        }
      } finally {
        setIsLoading(false);
      }
    },
    [effectiveOrgId, canViewAudit, actionFilter]
  );

  useEffect(() => {
    fetchLogs(1, actionFilter);
  }, [fetchLogs, actionFilter]);

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: 'Workspace', href: '/app' },
          { label: activeOrg?.name || 'Organisation', href: '/app' },
          { label: 'Security & Audit Log' },
        ]}
      />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Security & Audit Log</h1>
            <Badge variant="neutral">Append-Only</Badge>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Immutable audit trail of administrative actions, membership lifecycles, and module toggles for{' '}
            <strong className="text-slate-700">{activeOrg?.name || 'this organisation'}</strong>.
          </p>
        </div>

        <button
          onClick={() => fetchLogs(pagination.page, actionFilter)}
          disabled={isLoading}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border bg-white hover:bg-slate-50 text-xs font-medium text-slate-700 shadow-sm transition-colors self-start sm:self-auto disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 text-slate-500 ${isLoading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {errorMsg && (
        <Alert variant="error" title="Error Loading Audit Records">
          {errorMsg}
        </Alert>
      )}

      {/* Filter and Log Table */}
      <Card>
        <CardHeader className="p-4 sm:p-5 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <CardTitle className="text-base">Audit Trail</CardTitle>
            <CardDescription className="text-xs">
              Showing records scoped strictly to this organisation. IP addresses and user agents recorded for compliance.
            </CardDescription>
          </div>

          <div className="w-full sm:w-64">
            <Select
              value={actionFilter}
              onChange={(e) => {
                setActionFilter(e.target.value);
              }}
              aria-label="Filter by Action"
            >
              <option value="">All Lifecycle Actions</option>
              <option value="org.created">Organisation Created</option>
              <option value="org.updated">Organisation Updated</option>
              <option value="org.ownership_transferred">Ownership Transferred</option>
              <option value="member.invited">Member Invited</option>
              <option value="member.joined">Member Joined</option>
              <option value="member.removed">Member Removed</option>
              <option value="member.role_assigned">Role Assigned</option>
              <option value="member.role_removed">Role Revoked</option>
              <option value="invitation.revoked">Invitation Revoked</option>
              <option value="module.enabled">Module Activated</option>
              <option value="module.disabled">Module Deactivated</option>
            </Select>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Timestamp</TableHead>
                <TableHead>Event / Action</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Target Resource</TableHead>
                <TableHead>Origin / IP</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-12 text-slate-400 text-xs">
                    Loading audit trail...
                  </TableCell>
                </TableRow>
              ) : logs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-12 text-slate-400 text-xs">
                    No audit records found matching the current filter.
                  </TableCell>
                </TableRow>
              ) : (
                logs.map((log) => {
                  const badgeVariant = ACTION_BADGE_VARIANTS[log.action] || 'neutral';
                  return (
                    <TableRow key={log.id}>
                      <TableCell className="text-xs text-slate-500 whitespace-nowrap font-mono">
                        {new Date(log.createdAt).toLocaleString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                        })}
                      </TableCell>
                      <TableCell>
                        <Badge variant={badgeVariant}>{formatAuditAction(log.action)}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <User className="h-3.5 w-3.5 text-slate-400" />
                          <div className="text-xs">
                            <span className="font-medium text-slate-800">
                              {log.actorName || 'System'}
                            </span>
                            {log.actorEmail && (
                              <span className="text-slate-400 block text-[11px]">
                                {log.actorEmail}
                              </span>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-slate-600 font-mono">
                        {log.targetType ? (
                          <span>
                            {log.targetType}
                            {log.targetId && (
                              <span className="text-slate-400 text-[11px] block">
                                {log.targetId.substring(0, 8)}...
                              </span>
                            )}
                          </span>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-slate-500 font-mono">
                        {log.ipAddress || 'Internal'}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>

          {pagination.totalPages > 1 && (
            <div className="p-4 border-t border-border">
              <Pagination
                page={pagination.page}
                totalPages={pagination.totalPages}
                totalItems={pagination.totalRecords}
                limit={pagination.limit}
                onPageChange={(newPage) => fetchLogs(newPage, actionFilter)}
              />
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center gap-2 text-[11px] text-slate-400 justify-end">
        <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
        <span>PostgreSQL Append-Only Audit Invariant Enforced (AUD-001)</span>
      </div>
    </div>
  );
}
