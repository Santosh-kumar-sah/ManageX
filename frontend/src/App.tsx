import { lazy } from 'react';
import { Routes, Route } from 'react-router-dom';
import { PublicLayout } from '@/layouts/PublicLayout';
import { EventPortalLayout } from '@/layouts/EventPortalLayout';
import { WorkspaceLayout } from '@/layouts/WorkspaceLayout';
import { PlatformLayout } from '@/layouts/PlatformLayout';
import { RequireAuth, RequirePlatformAdmin, RequireOrgAccess } from '@/components/auth/RouteGuards';

import { HomePage } from '@/pages/HomePage';
import { ModulesPage } from '@/pages/ModulesPage';
import { SecurityPage } from '@/pages/SecurityPage';
import { EventsPortalHomePage } from '@/pages/public/EventsPortalHomePage';
import { PublicEventDetailPage } from '@/pages/public/PublicEventDetailPage';
import { StudentDashboardPage } from '@/pages/public/StudentDashboardPage';
import { LoginPage } from '@/pages/auth/LoginPage';
import { RegisterPage } from '@/pages/auth/RegisterPage';
import { VerifyEmailPage } from '@/pages/auth/VerifyEmailPage';
import { ForgotPasswordPage, ResetPasswordPage } from '@/pages/auth/PasswordRecoveryPages';
import { AcceptInvitationPage } from '@/pages/auth/AcceptInvitationPage';
import { AcceptEvaluationInvitationPage } from '@/pages/auth/AcceptEvaluationInvitationPage';

import { WorkspaceOverviewPage } from '@/pages/workspace/WorkspaceOverviewPage';
import { OrganisationsPage } from '@/pages/workspace/OrganisationsPage';
import { MembersPage } from '@/pages/workspace/MembersPage';
import { OrgSettingsPage } from '@/pages/workspace/OrgSettingsPage';
import { OrgModulesPage } from '@/pages/workspace/OrgModulesPage';
import { OrgAuditLogsPage } from '@/pages/workspace/OrgAuditLogsPage';
import { PlatformOverviewPage } from '@/pages/platform/PlatformOverviewPage';
import { PlatformAccountsPage } from '@/pages/platform/PlatformAccountsPage';
import { PlatformOrganisationsPage } from '@/pages/platform/PlatformOrganisationsPage';
import { PlatformModulesPage } from '@/pages/platform/PlatformModulesPage';
import { PlatformAuditLogsPage } from '@/pages/platform/PlatformAuditLogsPage';
import { NotFoundPage } from '@/pages/edge/ErrorPages';

// Load the heavier tools once a member actually opens their route.
const EventsPage = lazy(() => import('@/pages/workspace/events/EventsPage').then(m => ({ default: m.EventsPage })));
const EventDetailPage = lazy(() => import('@/pages/workspace/events/EventDetailPage').then(m => ({ default: m.EventDetailPage })));
const EvaluationPage = lazy(() => import('@/pages/workspace/events/EvaluationPage').then(m => ({ default: m.EvaluationPage })));
const JudgeWorkspacePage = lazy(() => import('@/pages/workspace/events/JudgeWorkspacePage').then(m => ({ default: m.JudgeWorkspacePage })));
const MeetingsPage = lazy(() => import('@/pages/workspace/meetings/MeetingsPage').then(m => ({ default: m.MeetingsPage })));
const MeetingDetailPage = lazy(() => import('@/pages/workspace/meetings/MeetingDetailPage').then(m => ({ default: m.MeetingDetailPage })));
const ProjectsPage = lazy(() => import('@/pages/workspace/projects/ProjectsPage').then(m => ({ default: m.ProjectsPage })));
const ProjectDetailPage = lazy(() => import('@/pages/workspace/projects/ProjectDetailPage').then(m => ({ default: m.ProjectDetailPage })));

export function App() {
  return (
    <Routes>
      {/* Event Portal Routes */}
      <Route element={<EventPortalLayout />}>
        <Route path="/events" element={<EventsPortalHomePage />} />
        <Route element={<RequireAuth />}>
          <Route path="/events/dashboard" element={<StudentDashboardPage />} />
        </Route>
        <Route path="/events/:eventId" element={<PublicEventDetailPage />} />
      </Route>

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
        <Route path="/invitations/evaluation/:token" element={<AcceptEvaluationInvitationPage />} />
        <Route path="/invitations/evaluation/:token/accept" element={<AcceptEvaluationInvitationPage />} />
      </Route>

      {/* Authenticated Workspace Routes */}
      <Route element={<RequireAuth />}>
        <Route path="/app" element={<WorkspaceLayout />}>
          <Route index element={<WorkspaceOverviewPage />} />
          <Route path="organisations" element={<OrganisationsPage />} />
          <Route path="judge/evaluations" element={<JudgeWorkspacePage />} />
          <Route path="judge/evaluations/:orgId/:eventId/:roundId" element={<JudgeWorkspacePage />} />
          <Route element={<RequireOrgAccess />}>
            <Route path="organisations/:orgId/events" element={<EventsPage />} />
            <Route path="organisations/:orgId/events/:eventId" element={<EventDetailPage />} />
            <Route path="organisations/:orgId/events/:eventId/rounds/:roundId/evaluation" element={<EvaluationPage />} />
            <Route path="organisations/:orgId/meetings" element={<MeetingsPage />} />
            <Route path="organisations/:orgId/meetings/:meetingId" element={<MeetingDetailPage />} />
            <Route path="organisations/:orgId/projects" element={<ProjectsPage />} />
            <Route path="organisations/:orgId/projects/:projectId" element={<ProjectDetailPage />} />
            <Route path="organisations/:orgId/members" element={<MembersPage />} />
            <Route path="organisations/:orgId/modules" element={<OrgModulesPage />} />
            <Route path="organisations/:orgId/audit-logs" element={<OrgAuditLogsPage />} />
            <Route path="organisations/:orgId/settings" element={<OrgSettingsPage />} />
          </Route>
        </Route>
      </Route>

      {/* Platform Administration Routes */}
      <Route element={<RequirePlatformAdmin />}>
        <Route path="/platform" element={<PlatformLayout />}>
          <Route index element={<PlatformOverviewPage />} />
          <Route path="accounts" element={<PlatformAccountsPage />} />
          <Route path="organisations" element={<PlatformOrganisationsPage />} />
          <Route path="modules" element={<PlatformModulesPage />} />
          <Route path="audit-logs" element={<PlatformAuditLogsPage />} />
        </Route>
      </Route>

      {/* 404 Catch-All Route */}
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
