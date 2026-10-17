import { useEffect, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Server, ShieldAlert, Boxes } from 'lucide-react';
import { apiClient } from '@/api/client';

export function PlatformOverviewPage() {
  const [readyStatus, setReadyStatus] = useState<{ status: string; environment: string } | null>(null);

  useEffect(() => {
    apiClient<{ status: string; environment: string }>('/ready')
      .then((res) => {
        if (res.data) setReadyStatus(res.data);
      })
      .catch(() => {});
  }, []);

  const catalogueModules = [
    { key: 'events', name: 'Events & Hackathons', platformAvailable: true },
    { key: 'meetings', name: 'Meetings', platformAvailable: true },
    { key: 'projects', name: 'Projects & Tasks', platformAvailable: true },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Platform Operational Overview</h1>
        <p className="text-xs text-slate-500 mt-1">
          Platform-level management console for Super Admins and Support Agents.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* System Readiness Card */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Server className="h-4 w-4 text-indigo-600" />
                <span>Backend Platform Health</span>
              </CardTitle>
              {readyStatus ? (
                <Badge variant="success">Operational</Badge>
              ) : (
                <Badge variant="neutral">Connecting...</Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="text-xs text-slate-600 space-y-2 border-t border-border pt-4">
            <div>
              <strong>Runtime Mode:</strong> {readyStatus?.environment || 'development'}
            </div>
            <div>
              <strong>Probe Endpoint:</strong> <code className="bg-slate-100 px-1 py-0.5 rounded">/api/v1/ready</code>
            </div>
            <div>
              <strong>Platform Authorization:</strong> Strictly isolated from tenant private content as defined in Section 10 of PRD.
            </div>
          </CardContent>
        </Card>

        {/* Global Module Catalogue Status */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Boxes className="h-4 w-4 text-indigo-600" />
                <span>Global Module Availability</span>
              </CardTitle>
              <Badge variant="brand">Phase 9 Controls</Badge>
            </div>
          </CardHeader>
          <CardContent className="text-xs text-slate-600 border-t border-border pt-4 space-y-3">
            {catalogueModules.map((mod) => (
              <div key={mod.key} className="flex items-center justify-between">
                <span>{mod.name} (<code className="text-[11px] text-slate-500">{mod.key}</code>)</span>
                <Badge variant="success">Available</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Platform Audit Logs - Honest Empty State */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-900">Platform Security Audit Log</h2>
        <EmptyState
          icon={<ShieldAlert className="h-8 w-8 text-slate-400 stroke-1" />}
          title="No platform audit records in Phase 1"
          description="Auditing for platform operational changes, role delegations, and account status transitions will be connected in Phase 5 and Phase 9."
        />
      </div>
    </div>
  );
}
