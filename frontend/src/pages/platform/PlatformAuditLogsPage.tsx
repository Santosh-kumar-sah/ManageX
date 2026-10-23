import { useEffect, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/Table';
import { Dialog } from '@/components/ui/Dialog';
import { ShieldCheck, AlertTriangle, Eye, Clock, User } from 'lucide-react';
import { apiClient } from '@/api/client';
import { formatAuditAction } from '@/pages/workspace/OrgAuditLogsPage';
import { PlatformAuditLog } from '@/types/platform';

export function PlatformAuditLogsPage() {
  const [logs, setLogs] = useState<PlatformAuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Metadata Viewer Modal
  const [selectedLog, setSelectedLog] = useState<PlatformAuditLog | null>(null);

  useEffect(() => {
    fetchLogs();
  }, [page]);

  const fetchLogs = async () => {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams({
        page: String(page),
        limit: '25',
      });

      const res = await apiClient<{ logs: PlatformAuditLog[]; pagination: { total: number; totalPages: number } }>(
        `/platform/audit-logs?${params.toString()}`
      );
      if (res.data) {
        setLogs(res.data.logs);
        setTotal(res.data.pagination.total);
        setTotalPages(res.data.pagination.totalPages);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to fetch platform audit logs.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Platform Audit Logs</h1>
            <Badge variant="brand" className="bg-indigo-950 text-indigo-300 border-indigo-800">
              Security Audit
            </Badge>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Immutable append-only record of platform administrative mutations, account suspensions, and module availability changes.
          </p>
        </div>

        <Button variant="outline" size="sm" onClick={fetchLogs} disabled={loading}>
          Refresh Logs
        </Button>
      </div>

      {error && (
        <div className="p-4 rounded-md bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0 text-rose-500" />
          <span>{error}</span>
        </div>
      )}

      {/* Audit Log Table */}
      <Card>
        <CardHeader className="pb-3 border-b border-slate-100 flex flex-row items-center justify-between">
          <CardTitle className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
            <ShieldCheck className="h-4 w-4 text-indigo-600" />
            <span>Audit Events ({total})</span>
          </CardTitle>
          <span className="text-xs text-slate-400">
            Page {page} of {totalPages}
          </span>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Timestamp (UTC)</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Target Entity</TableHead>
                <TableHead>Operator / Actor</TableHead>
                <TableHead className="text-right">Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-xs text-slate-500">
                    Loading audit events...
                  </TableCell>
                </TableRow>
              ) : logs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-xs text-slate-500">
                    No platform audit records found.
                  </TableCell>
                </TableRow>
              ) : (
                logs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="text-xs text-slate-600 whitespace-nowrap font-mono">
                      <span className="flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5 text-slate-400" />
                        {new Date(log.createdAt).toISOString().replace('T', ' ').substring(0, 19)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="text-xs font-medium text-slate-800">
                        {formatAuditAction(log.action)}
                      </div>
                      <span className="text-[10px] font-mono text-slate-400">
                        {log.action}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs text-slate-600">
                      <span className="capitalize font-medium">{log.entityType}</span>
                      {log.entityId && (
                        <span className="text-slate-400 font-mono text-[10px] ml-1">
                          ({log.entityId.substring(0, 8)}...)
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-slate-700">
                      {log.actor ? (
                        <span className="flex items-center gap-1.5 font-medium">
                          <User className="h-3.5 w-3.5 text-slate-400" />
                          {log.actor.fullName}
                          <span className="text-slate-400 font-normal text-[11px]">({log.actor.email})</span>
                        </span>
                      ) : (
                        <span className="text-slate-400">System</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs text-indigo-600 hover:text-indigo-800"
                        onClick={() => setSelectedLog(log)}
                      >
                        <Eye className="h-3.5 w-3.5 mr-1" />
                        Inspect
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between p-4 border-t border-slate-100 text-xs text-slate-500">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1 || loading}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <span>
                Page {page} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages || loading}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Next
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Metadata Inspector Modal */}
      <Dialog
        isOpen={selectedLog !== null}
        onClose={() => setSelectedLog(null)}
        title="Audit Event Metadata"
        className="sm:max-w-lg"
      >
        {selectedLog && (
          <div className="space-y-4 py-2 text-xs">
            <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3 rounded border border-slate-100">
              <div>
                <span className="text-slate-400 block mb-0.5">Action Key</span>
                <code className="text-indigo-700 font-mono">{selectedLog.action}</code>
              </div>
              <div>
                <span className="text-slate-400 block mb-0.5">Entity Type</span>
                <span className="text-slate-800 font-medium capitalize">{selectedLog.entityType}</span>
              </div>
              <div>
                <span className="text-slate-400 block mb-0.5">Entity ID</span>
                <code className="text-slate-700 font-mono text-[11px]">{selectedLog.entityId || 'N/A'}</code>
              </div>
              <div>
                <span className="text-slate-400 block mb-0.5">Caller IP Address</span>
                <span className="text-slate-800 font-mono">{selectedLog.ipAddress || '127.0.0.1'}</span>
              </div>
            </div>

            <div>
              <span className="text-slate-500 font-medium block mb-1">Payload Metadata (Sanitized)</span>
              <pre className="p-3 bg-slate-900 text-emerald-400 rounded-md font-mono text-[11px] overflow-x-auto max-h-56">
                {JSON.stringify(selectedLog.metadata, null, 2)}
              </pre>
            </div>

            <div className="text-[11px] text-slate-500 italic">
              Credentials, passwords, session tokens, and confidential fields are automatically redacted from audit records.
            </div>
          </div>
        )}

        <div className="flex justify-end mt-4 pt-3 border-t border-slate-100">
          <Button variant="outline" size="sm" onClick={() => setSelectedLog(null)}>
            Close
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
