// All money values are integer paise (₹1 = 100).
export type Role = 'owner' | 'admin' | 'finance' | 'sales' | 'viewer' | 'pending';

export interface Profile {
  id: string;
  email: string | null;
  full_name: string;
  role: Role;
  partner_id: string | null;
}

export interface Partner {
  id: string;
  name: string;
  share_pct: number;
  active: boolean;
  sort: number;
}

export type ClientStatus = 'lead' | 'active' | 'paused' | 'archived';
export interface Client {
  id: string;
  name: string;
  contact_name: string;
  email: string;
  phone: string;
  gstin: string;
  address: string;
  city: string;
  status: ClientStatus;
  notes: string;
  created_at: string;
}

export interface CatalogItem {
  id: string;
  name: string;
  description: string;
  unit: string;
  rate: number;
  active: boolean;
}

export interface QuoteItem {
  name: string;
  description: string;
  qty: number;
  unit: string;
  rate: number;
}

export type QuoteStatus = 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired' | 'paid';
export type DocKind = 'quote' | 'invoice';
export interface Quote {
  id: string;
  number: string | null;
  /** quotation (a price offer) or invoice (a bill). Older rows have no kind: treat as 'quote'. */
  kind?: DocKind;
  /** invoices: how much of the total has been received, in paise */
  paid?: number;
  /** print the partners' names under their signatures (default on) */
  show_names?: boolean;
  client_id: string | null;
  client_snapshot: Partial<Pick<Client, 'name' | 'contact_name' | 'email' | 'phone' | 'gstin' | 'address' | 'city'>>;
  title: string;
  issue_date: string;
  valid_until: string | null;
  status: QuoteStatus;
  items: QuoteItem[];
  discount: number;
  tax_pct: number;
  subtotal: number;
  tax_amount: number;
  total: number;
  notes: string;
  terms: string;
  created_at: string;
}

export type PayMethod = 'bank' | 'upi' | 'cash' | 'cheque' | 'card' | 'other';
export interface SplitPart { partner_id: string; pct: number }
export interface ClientPayment {
  id: string;
  client_id: string | null;
  quote_id: string | null;
  amount: number;
  received_by: string;
  split: SplitPart[];
  method: PayMethod;
  reference: string;
  received_on: string;
  note: string;
}

/** Money a client still owes us. Not income until it's actually received. */
export type DueStatus = 'due' | 'received' | 'cancelled';
export interface ClientDue {
  id: string;
  client_id: string | null;
  project_id: string | null;
  amount: number;              // paise still outstanding
  due_date: string | null;
  note: string;
  status: DueStatus;
  payment_id: string | null;   // the receipt that cleared it
  created_at: string;
}

export type LedgerKind = 'cost' | 'investment' | 'payment';
export interface LedgerEntry {
  id: string;
  kind: LedgerKind;
  payer_id: string;
  amount: number;
  among: string[];
  category: string;
  client_id: string | null;
  note: string;
  entry_date: string;
}

export interface CompanySettings {
  legal_name: string;
  address: string;
  email: string;
  phone: string;
  gstin: string;
  pan: string;
  bank_details: string;
  quote_terms: string;
  default_tax_pct: number;
  currency: string;
}

// ---------------------------------------------------------------- Work
export type ProjectStatus = 'planning' | 'active' | 'on_hold' | 'done';
export interface Project {
  id: string;
  name: string;
  client_id: string | null;
  status: ProjectStatus;
  start_date: string | null;
  due_date: string | null;
  description: string;
  lead_id: string | null;      // profile id
  created_by?: string | null;
  created_at: string;
}

export type MilestoneKind = 'milestone' | 'deliverable';
export interface Milestone {
  id: string;
  project_id: string;
  kind: MilestoneKind;
  title: string;
  due_date: string | null;
  done: boolean;
  done_on: string | null;
  created_by?: string | null;
}

export type Repeat = 'none' | 'daily' | 'weekdays' | 'weekly' | 'monthly';
export type Priority = 'low' | 'normal' | 'high';
export interface Task {
  id: string;
  title: string;
  notes: string;
  project_id: string | null;
  assignee_id: string | null;  // profile id
  due_date: string | null;     // for repeating tasks: the anchor (start) date
  priority: Priority;
  repeat: Repeat;
  done: boolean;               // one-off tasks
  done_on: string | null;      // one-off: when finished; repeating: last day it was ticked
  created_by?: string | null;
  created_at: string;
}

export type BugSeverity = 'low' | 'medium' | 'high' | 'critical';
export type BugStatus = 'open' | 'in_progress' | 'fixed' | 'closed';
export interface Bug {
  id: string;
  title: string;
  description: string;
  project_id: string | null;
  severity: BugSeverity;
  status: BugStatus;
  assignee_id: string | null;
  created_by?: string | null;
  created_at: string;
  resolved_on: string | null;
}

export interface Db {
  settings: CompanySettings;
  partners: Partner[];
  clients: Client[];
  catalog: CatalogItem[];
  quotes: Quote[];
  payments: ClientPayment[];
  ledger: LedgerEntry[];
  dues: ClientDue[];
  projects: Project[];
  milestones: Milestone[];
  tasks: Task[];
  bugs: Bug[];
  people: Profile[];
  /** true when the Work tables haven't been created in Supabase yet */
  workMissing?: boolean;
  /** true when the client_dues table hasn't been created yet */
  duesMissing?: boolean;
}

export type TableName = 'partners' | 'clients' | 'catalog_items' | 'quotes' | 'client_payments' | 'ledger_entries' | 'client_dues' | 'projects' | 'milestones' | 'tasks' | 'bugs';
