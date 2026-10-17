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

import { WorkspaceOverviewPage } from '@/pages/workspace/WorkspaceOverviewPage';
import { OrganisationsPage } from '@/pages/workspace/OrganisationsPage';
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
      </Route>

      {/* Authenticated Workspace Routes */}
      <Route path="/app" element={<WorkspaceLayout />}>
        <Route index element={<WorkspaceOverviewPage />} />
        <Route path="organisations" element={<OrganisationsPage />} />
        <Route
          path="organisations/:orgId/events/*"
          element={
            <ModulePlaceholderPage
              moduleName="Events & Hackathons"
              moduleKey="events"
              scheduledPhase="Phase 6"
              prerequisites="Shared Auth (Phase 3), Organisations (Phase 4), Scoped RBAC (Phase 5)"
              description="Event management, public registrations, teams, URL submissions, and assigned judging will be implemented in Phase 6."
            />
          }
        />
        <Route
          path="organisations/:orgId/meetings/*"
          element={
            <ModulePlaceholderPage
              moduleName="Meetings"
              moduleKey="meetings"
              scheduledPhase="Phase 7"
              prerequisites="Shared Auth (Phase 3), Organisations (Phase 4), Scoped RBAC (Phase 5)"
              description="Timezone-aware scheduling, ordered agenda items, confidential minutes, and action items will be implemented in Phase 7."
            />
          }
        />
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
        <Route
          path="organisations/:orgId/members"
          element={
            <ModulePlaceholderPage
              moduleName="Members & Invitations"
              scheduledPhase="Phase 4"
              prerequisites="Postgres Migrations (Phase 2), Shared Auth (Phase 3)"
              description="Member roster, role assignments, email invitations (7-day single use), and owner protection will be implemented in Phase 4."
            />
          }
        />
        <Route
          path="organisations/:orgId/settings"
          element={
            <ModulePlaceholderPage
              moduleName="Organisation Settings"
              scheduledPhase="Phase 4"
              prerequisites="Postgres Migrations (Phase 2), Shared Auth (Phase 3)"
              description="Approved organisation profile settings and high-impact ownership transfer with step-up reauthentication will be implemented in Phase 4."
            />
          }
        />
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
