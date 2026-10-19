import { Routes, Route } from 'react-router-dom';
import { PublicLayout } from '@/layouts/PublicLayout';
import { WorkspaceLayout } from '@/layouts/WorkspaceLayout';
import { PlatformLayout } from '@/layouts/PlatformLayout';

import { HomePage } from '@/pages/HomePage';
import { ModulesPage } from '@/pages/ModulesPage';
import { SecurityPage } from '@/pages/SecurityPage';
import { LoginPage } from '@/pages/auth/LoginPage';
import { RegisterPage } from '@/pages/auth/RegisterPage';
import { VerifyEmailPage } from '@/pages/auth/VerifyEmailPage';
import { ForgotPasswordPage, ResetPasswordPage } from '@/pages/auth/PasswordRecoveryPages';
import { AcceptInvitationPage } from '@/pages/auth/AcceptInvitationPage';

import { WorkspaceOverviewPage } from '@/pages/workspace/WorkspaceOverviewPage';
import { OrganisationsPage } from '@/pages/workspace/OrganisationsPage';
import { MembersPage } from '@/pages/workspace/MembersPage';
import { OrgSettingsPage } from '@/pages/workspace/OrgSettingsPage';
import { OrgModulesPage } from '@/pages/workspace/OrgModulesPage';
import { OrgAuditLogsPage } from '@/pages/workspace/OrgAuditLogsPage';
import { EventsPage } from '@/pages/workspace/events/EventsPage';
import { EventDetailPage } from '@/pages/workspace/events/EventDetailPage';
import { MeetingsPage } from '@/pages/workspace/meetings/MeetingsPage';
import { MeetingDetailPage } from '@/pages/workspace/meetings/MeetingDetailPage';
import { ModulePlaceholderPage } from '@/pages/workspace/ModulePlaceholderPage';
import { PlatformOverviewPage } from '@/pages/platform/PlatformOverviewPage';
import { NotFoundPage } from '@/pages/edge/ErrorPages';

export function App() {
  return (
    <Routes>
      {/* Public Routes */}
      <Route element={<PublicLayout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/modules" element={<ModulesPage />} />
        <Route path="/security" element={<SecurityPage />} />
        <Route path="/auth/login" element={<LoginPage />} />
        <Route path="/auth/register" element={<RegisterPage />} />
        <Route path="/auth/verify-email" element={<VerifyEmailPage />} />
        <Route path="/auth/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/auth/reset-password" element={<ResetPasswordPage />} />
        <Route path="/invitations/:token/accept" element={<AcceptInvitationPage />} />
      </Route>

      {/* Authenticated Workspace Routes */}
      <Route path="/app" element={<WorkspaceLayout />}>
        <Route index element={<WorkspaceOverviewPage />} />
        <Route path="organisations" element={<OrganisationsPage />} />
        <Route path="organisations/:orgId/events" element={<EventsPage />} />
        <Route path="organisations/:orgId/events/:eventId" element={<EventDetailPage />} />
        <Route path="organisations/:orgId/meetings" element={<MeetingsPage />} />
        <Route path="organisations/:orgId/meetings/:meetingId" element={<MeetingDetailPage />} />
        <Route
          path="organisations/:orgId/projects/*"
          element={
            <ModulePlaceholderPage
              moduleName="Projects & Tasks"
              moduleKey="projects"
              scheduledPhase="Phase 8"
              prerequisites="Shared Auth (Phase 3), Organisations (Phase 4), Scoped RBAC (Phase 5)"
              description="Project lifecycles, project-scoped members, List and Kanban boards, due-date views, and comments will be implemented in Phase 8."
            />
          }
        />
        <Route path="organisations/:orgId/members" element={<MembersPage />} />
        <Route path="organisations/:orgId/modules" element={<OrgModulesPage />} />
        <Route path="organisations/:orgId/audit-logs" element={<OrgAuditLogsPage />} />
        <Route path="organisations/:orgId/settings" element={<OrgSettingsPage />} />
      </Route>

      {/* Platform Administration Routes */}
      <Route path="/platform" element={<PlatformLayout />}>
        <Route index element={<PlatformOverviewPage />} />
        <Route
          path="organisations"
          element={
            <ModulePlaceholderPage
              moduleName="Platform Organisations Management"
              scheduledPhase="Phase 9"
              prerequisites="All prior phases (0 through 8)"
              description="Platform Super Admin views for customer organisation metadata and disable/enable operations will arrive in Phase 9."
              backHref="/platform"
            />
          }
        />
        <Route
          path="modules"
          element={
            <ModulePlaceholderPage
              moduleName="Platform Module Catalogue Management"
              scheduledPhase="Phase 9"
              prerequisites="All prior phases (0 through 8)"
              description="Platform-wide module catalogue toggles for events, meetings, and projects will arrive in Phase 9."
              backHref="/platform"
            />
          }
        />
        <Route
          path="audit-logs"
          element={
            <ModulePlaceholderPage
              moduleName="Platform Audit Log Viewer"
              scheduledPhase="Phase 9"
              prerequisites="Audit infrastructure (Phase 5), All prior phases"
              description="Immutable platform-wide audit log inspection and security review views will arrive in Phase 9."
              backHref="/platform"
            />
          }
        />
      </Route>

      {/* 404 Catch-All Route */}
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
