/**
 * ManageX Organisation Context & Switcher Hook
 * Strictly adheres to PRD Section 6.2 (ORG-002, ORG-003) and docs/security.md.
 * 
 * Rules:
 * - Client caches are invalidated or refreshed on organisation switch.
 * - Active organisation ID is tracked in state and persisted in localStorage for session convenience.
 * - Derives effective role and membership details from the server response.
 */

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { apiClient, ApiError } from './client';
import { useAuth } from './AuthContext';

export interface OrganisationRole {
  slug: string;
  name: string;
}

export interface UserOrganisation {
  id: string;
  name: string;
  slug: string;
  status: string;
  createdAt: string;
  memberCount: number;
  role: OrganisationRole;
}

export interface ActiveOrgDetails {
  organisation: {
    id: string;
    name: string;
    slug: string;
    status: string;
  };
  membership: {
    id: string;
    role: OrganisationRole;
    permissions: string[];
  };
}

interface OrgContextType {
  organisations: UserOrganisation[];
  activeOrg: UserOrganisation | null;
  activeDetails: ActiveOrgDetails | null;
  isLoading: boolean;
  switchOrg: (orgId: string) => Promise<void>;
  refreshOrganisations: () => Promise<void>;
  createOrganisation: (data: { name: string; slug?: string }) => Promise<UserOrganisation>;
}

const OrgContext = createContext<OrgContextType | undefined>(undefined);

const ACTIVE_ORG_STORAGE_KEY = 'managex_active_org_id';

export function OrgProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  const [organisations, setOrganisations] = useState<UserOrganisation[]>([]);
  const [activeOrgId, setActiveOrgId] = useState<string | null>(() => {
    return localStorage.getItem(ACTIVE_ORG_STORAGE_KEY);
  });
  const [activeDetails, setActiveDetails] = useState<ActiveOrgDetails | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // 1. Fetch user's organisations list
  const refreshOrganisations = useCallback(async () => {
    if (!isAuthenticated) {
      setOrganisations([]);
      setActiveDetails(null);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      const res = await apiClient<{ organisations: UserOrganisation[] }>('/organisations');
      const orgList = res.data?.organisations || [];
      setOrganisations(orgList);

      if (orgList.length > 0) {
        // If current activeOrgId is valid and user belongs to it, keep it; otherwise default to first org
        const currentActive = orgList.find((o) => o.id === activeOrgId);
        if (currentActive) {
          setActiveOrgId(currentActive.id);
        } else {
          setActiveOrgId(orgList[0].id);
          localStorage.setItem(ACTIVE_ORG_STORAGE_KEY, orgList[0].id);
        }
      } else {
        setActiveOrgId(null);
        setActiveDetails(null);
        localStorage.removeItem(ACTIVE_ORG_STORAGE_KEY);
      }
    } catch (err) {
      if (err instanceof ApiError && (err.statusCode === 401 || err.statusCode === 403)) {
        setOrganisations([]);
        setActiveDetails(null);
      }
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated, activeOrgId]);

  // 2. Fetch verified active organisation details & permissions whenever activeOrgId changes
  useEffect(() => {
    if (!isAuthenticated || !activeOrgId) {
      setActiveDetails(null);
      return;
    }

    let isMounted = true;

    async function fetchActiveDetails() {
      try {
        const res = await apiClient<ActiveOrgDetails>(`/organisations/${activeOrgId}`);
        if (isMounted && res.data) {
          setActiveDetails(res.data);
        }
      } catch (err) {
        if (err instanceof ApiError && (err.statusCode === 403 || err.statusCode === 404)) {
          // If membership was revoked or org deleted, reset and refresh
          if (isMounted) {
            localStorage.removeItem(ACTIVE_ORG_STORAGE_KEY);
            setActiveOrgId(null);
            setActiveDetails(null);
            refreshOrganisations();
          }
        }
      }
    }

    fetchActiveDetails();

    return () => {
      isMounted = false;
    };
  }, [isAuthenticated, activeOrgId, refreshOrganisations]);

  // Initial load
  useEffect(() => {
    refreshOrganisations();
  }, [isAuthenticated]);

  // 3. Switch active organisation
  const switchOrg = useCallback(async (newOrgId: string) => {
    setActiveOrgId(newOrgId);
    localStorage.setItem(ACTIVE_ORG_STORAGE_KEY, newOrgId);
    // Explicitly refetch details
    try {
      const res = await apiClient<ActiveOrgDetails>(`/organisations/${newOrgId}`);
      if (res.data) {
        setActiveDetails(res.data);
      }
    } catch {
      // Handled by the effect
    }
  }, []);

  // 4. Create new organisation and switch to it
  const createOrganisation = useCallback(async (data: { name: string; slug?: string }) => {
    const res = await apiClient<{ organisation: UserOrganisation }>('/organisations', {
      method: 'POST',
      body: JSON.stringify(data),
    });

    const newOrg = res.data!.organisation;
    localStorage.setItem(ACTIVE_ORG_STORAGE_KEY, newOrg.id);
    setActiveOrgId(newOrg.id);
    await refreshOrganisations();
    return newOrg;
  }, [refreshOrganisations]);

  const activeOrg = organisations.find((o) => o.id === activeOrgId) || null;

  return (
    <OrgContext.Provider
      value={{
        organisations,
        activeOrg,
        activeDetails,
        isLoading,
        switchOrg,
        refreshOrganisations,
        createOrganisation,
      }}
    >
      {children}
    </OrgContext.Provider>
  );
}

export function useOrg(): OrgContextType {
  const context = useContext(OrgContext);
  if (!context) {
    throw new Error('useOrg must be used within an OrgProvider');
  }
  return context;
}
