import { useContext } from 'react';
import { Link } from 'react-router-dom';
import { Building2, ChevronRight, Shield, Users } from 'lucide-react';
import { Alert } from '@/components/ui/Alert';
import { Skeleton } from '@/components/ui/Skeleton';
import { useAuth } from '@/api/AuthContext';
import { useOrg } from '@/api/OrgContext';
import { workspaceTools, WorkspaceToolsContext } from './workspaceTools';

export function WorkspaceOverviewPage() {
  const { user } = useAuth();
  const { activeOrg, isLoading } = useOrg();
  const catalogue = useContext(WorkspaceToolsContext);

  if (isLoading && !activeOrg) return <p role="status">Loading workspace…</p>;

  if (!activeOrg) {
    const admin = user?.isPlatformAdmin;
    return (
      <div className="workspace-overview">
        <h1>{admin ? 'Platform workspace' : 'Personal workspace'}</h1>
        <section className="workspace-welcome">
          {admin ? <Shield size={27} aria-hidden="true" /> : <Building2 size={27} aria-hidden="true" />}
          <h2>{admin ? 'Platform administration' : 'Your events and organisations'}</h2>
          <p>{admin ? 'Manage accounts, organisations and tools across ManageX.' : 'Open your event registrations, find an event to join, or create a workspace for your team.'}</p>
          <nav aria-label="Workspace actions">
            <Link className="workspace-action-link" to={admin ? '/platform' : '/events/dashboard'}>{admin ? 'Open platform administration' : 'Participant dashboard'}</Link>
            {!admin && <Link className="workspace-text-link" to="/events">Browse public events</Link>}
            <Link className="workspace-text-link" to="/app/organisations">Create organisation</Link>
          </nav>
        </section>
      </div>
    );
  }

  const orgHref = '/app/organisations/' + activeOrg.id;
  const tools = catalogue.orgId === activeOrg.id ? catalogue.tools : undefined;
  const error = catalogue.orgId === activeOrg.id && catalogue.error;
  const rows = workspaceTools.flatMap(tool => {
    const record = tools?.find(item => item.slug === tool.slug);
    if (!record) return [];
    return [{ ...tool, enabled: record.isEnabled && record.isPlatformAvailable }];
  });

  return (
    <div className="workspace-overview">
      <header className="workspace-overview-heading">
        <h1>{activeOrg.name}</h1>
        <div className="workspace-overview-meta">
          {activeOrg.role?.name && <span>{activeOrg.role.name}</span>}
          {typeof activeOrg.memberCount === 'number' && <span><Users size={16} aria-hidden="true" />{activeOrg.memberCount} {activeOrg.memberCount === 1 ? 'member' : 'members'}</span>}
        </div>
      </header>
      <section aria-labelledby="workspace-tools-heading">
        <div className="workspace-section-heading">
          <h2 id="workspace-tools-heading">Workspace tools</h2>
          {catalogue.canOpenSettings && <Link to={orgHref + '/modules'}>Manage tools</Link>}
        </div>
        {error ? (
          <Alert variant="error">{error} <button className="workspace-text-link" onClick={catalogue.refresh}>Try again</button></Alert>
        ) : !tools ? (
          <div role="status" aria-label="Loading workspace tools" className="space-y-2">
            <Skeleton className="h-20 w-full" /><Skeleton className="h-20 w-full" />
          </div>
        ) : rows.length ? (
          <ul className="workspace-tool-list">
            {rows.map(({ slug, name, description, icon: Icon, enabled }) => {
              const content = <><span className="workspace-tool-icon"><Icon size={23} aria-hidden="true" /></span><div><strong>{name}</strong><p>{description}</p></div></>;
              return <li key={slug}>{enabled
                ? <Link className="workspace-tool-row" to={orgHref + '/' + slug}>{content}<ChevronRight className="workspace-tool-tail" size={20} aria-hidden="true" /></Link>
                : <div className="workspace-tool-row">{content}<span className="workspace-tool-tail text-sm">Off</span></div>}
              </li>;
            })}
          </ul>
        ) : (
          <p>No tools are available for this organisation.</p>
        )}
      </section>
    </div>
  );
}
