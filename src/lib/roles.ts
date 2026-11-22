// UI permissions. The database enforces the same rules with RLS (supabase/schema.sql),
// so this only decides what to show. Add a capability here + a policy there to extend.
import type { Role } from '../data/types';

export const ROLE_LABEL: Record<Role, string> = {
  owner: 'Owner', admin: 'Admin', finance: 'Finance', sales: 'Sales', viewer: 'Viewer', pending: 'Awaiting access',
};

const CAN = {
  'dashboard.view': ['owner', 'admin', 'finance', 'viewer'],
  'money.view': ['owner', 'admin', 'finance', 'viewer'],
  'money.edit': ['owner', 'admin', 'finance'],
  'money.delete': ['owner', 'admin'],
  'clients.view': ['owner', 'admin', 'finance', 'sales', 'viewer'],
  'clients.edit': ['owner', 'admin', 'finance', 'sales'],
  'quotes.view': ['owner', 'admin', 'finance', 'sales', 'viewer'],
  'quotes.edit': ['owner', 'admin', 'sales'],
  'catalog.edit': ['owner', 'admin', 'sales'],
  'settings.edit': ['owner', 'admin'],
  'team.manage': ['owner', 'admin'],
  'partners.edit': ['owner'],
  'work.view': ['owner', 'admin', 'finance', 'sales', 'viewer'],
  'work.edit': ['owner', 'admin', 'finance', 'sales'],      // tasks, bugs, milestones
  'projects.edit': ['owner', 'admin', 'sales'],
  'work.delete': ['owner', 'admin'],                       // anyone may delete what they created
} as const satisfies Record<string, readonly Role[]>;

export type Capability = keyof typeof CAN;
export const can = (role: Role | undefined, cap: Capability) => !!role && (CAN[cap] as readonly Role[]).includes(role);
