import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Dialog } from '@/components/ui/Dialog';
import { Video, CheckCircle2, AlertTriangle, Unlink, RefreshCw, ExternalLink, ShieldCheck } from 'lucide-react';
import { apiClient, ApiError } from '@/api/client';

export interface GoogleIntegrationStatus {
  isConnected: boolean;
  status: 'connected' | 'revoked' | 'error' | 'disconnected';
  provider: string;
  connectedEmail: string | null;
  scopes: string[];
  updatedAt: string | null;
  lastError: string | null;
}

interface IntegrationsSettingsTabProps {
  effectiveOrgId: string;
  canEdit: boolean;
}

export function IntegrationsSettingsTab({ effectiveOrgId, canEdit }: IntegrationsSettingsTabProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [status, setStatus] = useState<GoogleIntegrationStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Disconnect confirmation modal
  const [isDisconnectOpen, setIsDisconnectOpen] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [disconnectError, setDisconnectError] = useState<string | null>(null);

  // URL alert state from callback redirect
  const [urlSuccessMessage, setUrlSuccessMessage] = useState<string | null>(null);
  const [urlErrorMessage, setUrlErrorMessage] = useState<string | null>(null);

  // Parse and clear URL search parameters from OAuth redirect
  useEffect(() => {
    const statusParam = searchParams.get('status');
    const messageParam = searchParams.get('message');

    if (statusParam === 'connected') {
      setUrlSuccessMessage(
        'Google Workspace integration connected successfully. Google Meet links will now be automatically generated for virtual and hybrid meetings.'
      );
      // Clean up search params without triggering re-render loop
      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete('status');
      nextParams.delete('message');
      setSearchParams(nextParams, { replace: true });
    } else if (statusParam === 'error') {
      setUrlErrorMessage(
        messageParam ? decodeURIComponent(messageParam) : 'Failed to connect Google integration.'
      );
      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete('status');
      nextParams.delete('message');
      setSearchParams(nextParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  // Load current integration status
  const loadStatus = useCallback(async () => {
    if (!effectiveOrgId) return;
    try {
      setIsLoading(true);
      setFetchError(null);
      const res = await apiClient<GoogleIntegrationStatus>(
        `/organisations/${effectiveOrgId}/integrations/google/status`
      );
      setStatus(res.data || null);
    } catch (err) {
      if (err instanceof ApiError) {
        setFetchError(err.message);
      } else {
        setFetchError('Unable to load integration status.');
      }
    } finally {
      setIsLoading(false);
    }
  }, [effectiveOrgId]);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  // Initiate OAuth authorization flow
  function handleConnect() {
    if (!effectiveOrgId || !canEdit) return;
    // Standard full-page browser navigation to authorize endpoint initiates Google redirect
    window.location.href = `/api/v1/organisations/${effectiveOrgId}/integrations/google/authorize`;
  }

  // Handle disconnect
  async function handleDisconnect() {
    if (!effectiveOrgId || !canEdit) return;
    try {
      setIsDisconnecting(true);
      setDisconnectError(null);
      await apiClient(`/organisations/${effectiveOrgId}/integrations/google/disconnect`, {
        method: 'POST',
      });
      setIsDisconnectOpen(false);
      await loadStatus();
    } catch (err) {
      if (err instanceof ApiError) {
        setDisconnectError(err.message);
      } else {
        setDisconnectError('Failed to disconnect Google integration. Please try again.');
      }
    } finally {
      setIsDisconnecting(false);
    }
  }

  return (
    <div className="space-y-6">
      {urlSuccessMessage && (
        <Alert
          variant="success"
          title="Integration Connected"
          className="shadow-sm"
        >
          {urlSuccessMessage}
        </Alert>
      )}

      {urlErrorMessage && (
        <Alert
          variant="error"
          title="Connection Error"
          className="shadow-sm"
        >
          {urlErrorMessage}
        </Alert>
      )}

      {fetchError && (
        <Alert variant="error" title="Failed to Load Integrations">
          {fetchError}
        </Alert>
      )}

      {/* Google Meet & Calendar Integration Card */}
      <Card className="border-slate-200 shadow-sm overflow-hidden">
        <CardHeader className="p-5 pb-4 border-b border-slate-100 bg-white">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-lg bg-indigo-50 border border-indigo-100 text-indigo-700 shrink-0">
                <Video className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <CardTitle className="text-base font-semibold text-slate-900">
                    Google Meet & Google Calendar
                  </CardTitle>
                  {isLoading ? (
                    <Badge variant="neutral">Checking...</Badge>
                  ) : status?.isConnected ? (
                    <Badge variant="success" className="gap-1">
                      <CheckCircle2 className="h-3 w-3" />
                      Connected
                    </Badge>
                  ) : status?.status === 'error' ? (
                    <Badge variant="warning" className="gap-1">
                      <AlertTriangle className="h-3 w-3" />
                      Action Required
                    </Badge>
                  ) : (
                    <Badge variant="neutral">Not Connected</Badge>
                  )}
                </div>
                <CardDescription className="text-xs text-slate-500 mt-0.5">
                  Automatically provision secure Google Meet conferencing links when scheduling virtual or hybrid meetings.
                </CardDescription>
              </div>
            </div>

            {/* Quick action button in header */}
            {!isLoading && (
              <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
                {status?.isConnected ? (
                  canEdit && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 text-rose-600 border-rose-200 hover:bg-rose-50"
                      onClick={() => {
                        setDisconnectError(null);
                        setIsDisconnectOpen(true);
                      }}
                    >
                      <Unlink className="h-3.5 w-3.5" />
                      <span>Disconnect</span>
                    </Button>
                  )
                ) : (
                  canEdit && (
                    <Button
                      variant="primary"
                      size="sm"
                      className="gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white"
                      onClick={handleConnect}
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      <span>Connect Google</span>
                    </Button>
                  )
                )}
              </div>
            )}
          </div>
        </CardHeader>

        <CardContent className="p-5 space-y-4 bg-slate-50/50">
          {isLoading ? (
            <div className="py-8 flex flex-col items-center justify-center text-slate-400 gap-2">
              <RefreshCw className="h-5 w-5 animate-spin text-slate-400" />
              <p className="text-xs">Loading integration details...</p>
            </div>
          ) : status?.isConnected ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-3.5 bg-white border border-slate-200 rounded-lg">
                  <div className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Connected Account
                  </div>
                  <div className="text-sm font-semibold text-slate-900 mt-1 break-all">
                    {status.connectedEmail || 'Unknown Account'}
                  </div>
                </div>

                <div className="p-3.5 bg-white border border-slate-200 rounded-lg">
                  <div className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Granted Permissions
                  </div>
                  <div className="text-xs font-medium text-slate-700 mt-1 flex flex-wrap gap-1.5">
                    {status.scopes && status.scopes.length > 0 ? (
                      status.scopes.map((scope) => (
                        <span
                          key={scope}
                          className="px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-mono text-[11px]"
                        >
                          {scope.replace('https://www.googleapis.com/auth/', '')}
                        </span>
                      ))
                    ) : (
                      <span className="text-slate-400 italic">Default Calendar Scopes</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Security & Privacy Invariant Notice */}
              <div className="p-3.5 bg-emerald-50/60 border border-emerald-200/80 rounded-lg flex items-start gap-3">
                <ShieldCheck className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
                <div className="text-xs text-emerald-900 leading-relaxed">
                  <div className="font-semibold text-emerald-950">Option A Privacy Guarantee Active</div>
                  ManageX provisions Google Meet rooms headlessly without sending participant email rosters to Google Calendar. Zero participant personal identities are disclosed to Google infrastructure.
                </div>
              </div>

              {status.updatedAt && (
                <div className="text-[11px] text-slate-400">
                  Last connected / renewed: {new Date(status.updatedAt).toLocaleString()}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {status?.status === 'error' && (
                <Alert variant="warning" title="Authorization Issue">
                  {status.lastError || 'Google refresh token may have expired or been revoked upstream.'}
                </Alert>
              )}

              <p className="text-xs text-slate-600 leading-relaxed">
                Connecting your organisation to Google Workspace allows meeting organisers to automatically generate Google Meet video conferencing links for all virtual and hybrid meetings scheduled in ManageX.
              </p>

              <div className="p-3.5 bg-slate-100 border border-slate-200 rounded-lg space-y-2">
                <div className="text-xs font-semibold text-slate-800">What permissions are requested?</div>
                <ul className="text-xs text-slate-600 space-y-1 list-disc list-inside">
                  <li><strong>Google Calendar Events:</strong> Create, reschedule, and delete meeting calendar containers for Google Meet rooms.</li>
                  <li><strong>Account Email:</strong> Display the connected administrator address in workspace settings.</li>
                </ul>
              </div>

              {!canEdit && (
                <p className="text-xs text-slate-400 italic">
                  Organisation Admin privileges (<code className="font-mono text-[11px]">org.update</code>) are required to connect or disconnect integrations.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Disconnect Confirmation Dialog */}
      <Dialog
        isOpen={isDisconnectOpen}
        onClose={() => !isDisconnecting && setIsDisconnectOpen(false)}
        title="Disconnect Google Integration"
        description="Are you sure you want to disconnect this Google account from ManageX?"
      >
        <div className="space-y-4 mt-2">
          {disconnectError && (
            <Alert variant="error" title="Disconnect Failed">
              {disconnectError}
            </Alert>
          )}

          <p className="text-xs text-slate-600 leading-relaxed">
            Disconnecting will revoke the OAuth token upstream at Google and permanently delete all stored credentials from ManageX.
          </p>

          <div className="p-3 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800">
            <strong>Note:</strong> Existing scheduled meetings that already have a Google Meet link will retain their current link. Newly scheduled meetings will require manual conferencing link entry until an integration is re-connected.
          </div>

          <div className="mt-6 flex justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsDisconnectOpen(false)}
              disabled={isDisconnecting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              isLoading={isDisconnecting}
              onClick={handleDisconnect}
            >
              Confirm Disconnect
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
