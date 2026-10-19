import React, { useState } from 'react';
import { Breadcrumbs } from '@/components/ui/Breadcrumbs';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { Alert } from '@/components/ui/Alert';
import { Building2, Plus, ArrowRight, Check, Users } from 'lucide-react';
import { useOrg } from '@/api/OrgContext';
import { ApiError } from '@/api/client';

export function OrganisationsPage() {
  const { organisations, activeOrg, switchOrg, createOrganisation, isLoading } = useOrg();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [orgName, setOrgName] = useState('');
  const [orgSlug, setOrgSlug] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);

    if (!orgName.trim() || orgName.trim().length < 2) {
      setErrorMsg('Organisation name must be at least 2 characters.');
      return;
    }

    try {
      setIsSubmitting(true);
      await createOrganisation({
        name: orgName.trim(),
        slug: orgSlug.trim() || undefined,
      });
      setIsCreateOpen(false);
      setOrgName('');
      setOrgSlug('');
    } catch (err) {
      if (err instanceof ApiError) {
        setErrorMsg(err.message);
      } else {
        setErrorMsg('Failed to create organisation. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: 'Workspace', href: '/app' },
          { label: 'Organisations' },
        ]}
      />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Your Organisations</h1>
          <p className="text-xs text-slate-500 mt-1">
            Manage your tenant workspaces, switch between organisations, or create a new organisation.
          </p>
        </div>
        <Button
          size="sm"
          className="gap-1.5 self-start"
          onClick={() => {
            setErrorMsg(null);
            setIsCreateOpen(true);
          }}
        >
          <Plus className="h-4 w-4" />
          <span>New Organisation</span>
        </Button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="h-36 rounded-lg border border-slate-200 bg-slate-100/50 animate-pulse" />
          <div className="h-36 rounded-lg border border-slate-200 bg-slate-100/50 animate-pulse" />
        </div>
      ) : organisations.length === 0 ? (
        <Card className="border-dashed border-slate-300 bg-slate-50/50 flex flex-col justify-center items-center p-12 text-center">
          <Building2 className="h-10 w-10 text-slate-400 mb-3 stroke-1" />
          <h3 className="text-base font-semibold text-slate-900">No Organisations Found</h3>
          <p className="text-xs text-slate-500 max-w-sm mt-1 mb-4">
            You are not currently a member of any organisation. Create an organisation to begin managing events, meetings, and projects.
          </p>
          <Button
            size="sm"
            onClick={() => {
              setErrorMsg(null);
              setIsCreateOpen(true);
            }}
          >
            Create Your First Organisation
          </Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {organisations.map((org) => {
            const isCurrent = activeOrg?.id === org.id;

            return (
              <Card
                key={org.id}
                className={isCurrent ? 'border-brand-300 shadow-xs' : 'border-border hover:border-slate-300'}
              >
                <CardHeader className="p-5">
                  <div className="flex items-center justify-between mb-2">
                    <div className="h-9 w-9 rounded-md bg-brand-50 border border-brand-100 flex items-center justify-center text-brand-700 font-bold uppercase text-sm">
                      {org.name.charAt(0)}
                    </div>
                    {isCurrent ? (
                      <Badge variant="brand">Active Workspace</Badge>
                    ) : (
                      <Badge variant="neutral">{org.role.name}</Badge>
                    )}
                  </div>
                  <CardTitle className="text-base text-slate-900">{org.name}</CardTitle>
                  <CardDescription className="text-xs flex items-center gap-2 mt-1">
                    <span>
                      Slug: <code className="bg-slate-100 px-1 py-0.5 rounded text-[11px]">{org.slug}</code>
                    </span>
                    <span>•</span>
                    <span className="flex items-center gap-1">
                      <Users className="h-3 w-3 text-slate-400" />
                      {org.memberCount} {org.memberCount === 1 ? 'member' : 'members'}
                    </span>
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-5 pt-0 border-t border-border mt-3 flex justify-between items-center text-xs text-slate-500">
                  <span className="text-[11px] text-slate-400">Your Role: {org.role.name}</span>
                  {isCurrent ? (
                    <span className="font-semibold text-brand-600 flex items-center gap-1 text-xs">
                      <Check className="h-3.5 w-3.5" /> Currently Active
                    </span>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => switchOrg(org.id)}
                      className="text-brand-600 hover:text-brand-700 hover:bg-brand-50 gap-1 text-xs h-7 px-2"
                    >
                      <span>Switch Context</span>
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* New Organisation Dialog */}
      <Dialog
        isOpen={isCreateOpen}
        onClose={() => !isSubmitting && setIsCreateOpen(false)}
        title="Create New Organisation"
        description="Set up a new tenant workspace. You will automatically be designated as the Organisation Owner."
      >
        <form onSubmit={handleCreate} className="space-y-4 mt-2">
          {errorMsg && (
            <Alert variant="error" title="Error">
              {errorMsg}
            </Alert>
          )}

          <FormField label="Organisation Name" required htmlFor="org-name" helperText="The public display name for your company or team.">
            <Input
              id="org-name"
              placeholder="e.g. Acme Corporation"
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              required
              disabled={isSubmitting}
            />
          </FormField>

          <FormField
            label="Workspace URL Slug (Optional)"
            htmlFor="org-slug"
            helperText="Unique URL identifier. If omitted, will be generated automatically from the name."
          >
            <Input
              id="org-slug"
              placeholder="e.g. acme-corporation"
              value={orgSlug}
              onChange={(e) => setOrgSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
              disabled={isSubmitting}
            />
          </FormField>

          <div className="mt-6 flex justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsCreateOpen(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" isLoading={isSubmitting}>
              Create Organisation
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
