/**
 * ManageX Platform Administration Types
 * Strictly adheres to PRD Section 10 (PLAT-001 through PLAT-007) and SEC-009.
 */

export interface PlatformOverview {
  users: {
    total: number;
    active: number;
    suspended: number;
    pendingVerification: number;
  };
  organisations: {
    total: number;
    active: number;
    suspended: number;
  };
  modules: Array<{
    id: string;
    slug: string;
    name: string;
    description: string;
    isCore: boolean;
    isPlatformAvailable: boolean;
    activeOrganisationsCount: number;
  }>;
}

export interface PlatformAccount {
  id: string;
  fullName: string;
  email: string;
  status: 'active' | 'suspended' | 'pending_verification';
  isPlatformAdmin: boolean;
  platformRole: 'platform_super_admin' | 'platform_support_agent' | null;
  emailVerifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PlatformOrganisation {
  id: string;
  name: string;
  slug: string;
  status: 'active' | 'suspended';
  memberCount: number;
  activeModulesCount: number;
  createdAt: string;
  updatedAt: string;
  modules?: Array<{
    id: string;
    slug: string;
    name: string;
    isPlatformAvailable: boolean;
    isEnabled: boolean;
  }>;
}

export interface PlatformModule {
  id: string;
  slug: string;
  name: string;
  description: string;
  isCore: boolean;
  isPlatformAvailable: boolean;
  activeOrganisationsCount: number;
}

export interface PlatformAuditLog {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: Record<string, unknown>;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  actor: {
    id: string;
    fullName: string;
    email: string;
  } | null;
}
