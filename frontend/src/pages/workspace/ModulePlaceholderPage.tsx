import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Breadcrumbs } from '@/components/ui/Breadcrumbs';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { ArrowLeft, Construction, ShieldAlert, Layers } from 'lucide-react';
import { apiClient, ApiError } from '@/api/client';
import { useOrg } from '@/api/OrgContext';

export interface ModulePlaceholderProps {
  moduleName: string;
  moduleKey?: string;
  scheduledPhase: string;
  prerequisites: string;
  description: string;
  backHref?: string;
}

export function ModulePlaceholderPage({
  moduleName,
  moduleKey,
  scheduledPhase,
  prerequisites,
  description,
  backHref = '/app',
}: ModulePlaceholderProps) {
  const { orgId } = useParams<{ orgId: string }>();
  const { activeOrg } = useOrg();
  const effectiveOrgId = orgId && orgId !== 'default' ? orgId : activeOrg?.id;

  const [entitlementStatus, setEntitlementStatus] = useState<{
    isChecked: boolean;
    isDisabled: boolean;
    errorCode?: string;
    message?: string;
  }>({
    isChecked: false,
    isDisabled: false,
  });

  useEffect(() => {
    if (!effectiveOrgId || !moduleKey) {
      setEntitlementStatus({ isChecked: true, isDisabled: false });
      return;
    }

    let isMounted = true;
    apiClient(`/organisations/${effectiveOrgId}/${moduleKey}`)
      .then(() => {
        if (isMounted) {
          setEntitlementStatus({ isChecked: true, isDisabled: false });
        }
      })
      .catch((err) => {
        if (!isMounted) return;
        if (err instanceof ApiError && err.statusCode === 403) {
          setEntitlementStatus({
            isChecked: true,
            isDisabled: true,
            errorCode: err.code,
            message: err.message,
          });
        } else {
          setEntitlementStatus({ isChecked: true, isDisabled: false });
        }
      });

    return () => {
      isMounted = false;
    };
  }, [effectiveOrgId, moduleKey]);

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: 'Workspace', href: '/app' },
          { label: moduleName },
        ]}
      />

      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">{moduleName}</h1>
            {entitlementStatus.isDisabled ? (
              <Badge variant="danger">Module Deactivated</Badge>
            ) : (
              <Badge variant="brand">{scheduledPhase}</Badge>
            )}
          </div>
          {moduleKey && (
            <p className="text-xs text-slate-500 mt-1">
              Internal Key: <code className="bg-slate-100 px-1 py-0.5 rounded">{moduleKey}</code>
            </p>
          )}
        </div>
        <Link to={backHref}>
          <Button variant="outline" size="sm" className="gap-1.5">
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Back</span>
          </Button>
        </Link>
      </div>

      {entitlementStatus.isDisabled && (
        <Alert variant="warning" title="Module Currently Deactivated (MOD-004)">
          <div className="space-y-2 mt-1">
            <p>
              {entitlementStatus.message ||
                'This module is currently deactivated for this organisation. Requests to this domain fail closed.'}
            </p>
            {effectiveOrgId && (
              <Link
                to={`/app/organisations/${effectiveOrgId}/modules`}
                className="inline-flex items-center gap-1.5 font-semibold text-amber-900 underline hover:no-underline text-xs"
              >
                <Layers className="h-3.5 w-3.5" />
                <span>Go to Modules & Entitlements to activate</span>
              </Link>
            )}
          </div>
        </Alert>
      )}

      <Card className="border-dashed border-slate-300">
        <CardHeader className="text-center py-10 space-y-3">
          <div className="mx-auto h-12 w-12 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-500">
            {entitlementStatus.isDisabled ? (
              <ShieldAlert className="h-6 w-6 text-amber-600" />
            ) : (
              <Construction className="h-6 w-6 text-slate-600" />
            )}
          </div>
          <CardTitle className="text-lg">
            {entitlementStatus.isDisabled
              ? `${moduleName} is Inactive`
              : `Module Scheduled for ${scheduledPhase}`}
          </CardTitle>
          <CardDescription className="max-w-md mx-auto leading-relaxed">
            {entitlementStatus.isDisabled
              ? 'Organisation Admins can enable or disable domain modules at any time with non-destructive preservation of all data.'
              : description}
          </CardDescription>
        </CardHeader>
        <CardContent className="border-t border-border bg-slate-50 p-6 rounded-b-lg text-xs space-y-2 text-slate-600">
          <div>
            <strong className="text-slate-800">Prerequisites:</strong> {prerequisites}
          </div>
          <div>
            <strong className="text-slate-800">Entitlement Verification:</strong> Validated server-side via{' '}
            <code className="bg-slate-100 px-1 py-0.5 rounded font-mono text-[11px]">
              requireModuleEntitlement('{moduleKey || 'core'}')
            </code>{' '}
            middleware adhering to PRD MOD-004.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
