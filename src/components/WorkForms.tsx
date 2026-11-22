import { useEffect, useState } from 'react';
import type { Bug, BugSeverity, BugStatus, Milestone, MilestoneKind, Priority, Project, ProjectStatus, Repeat, Task } from '../data/types';
import { useMutate, useStore } from '../data/store';
import { REPEAT_LABEL, STATUS_LABEL, localDay } from '../lib/work';
import { Field, Seg, Sheet } from './Sheet';

/** Can the signed-in user delete this row? Owners/admins always; others only what they created. */
export function useCanDelete() {
  const { can, profile } = useStore();
  return (row: { created_by?: string | null }) => can('work.delete') || (!!row.created_by && row.created_by === profile?.id);
}

function PeopleSelect({ value, onChange, label = 'Assigned to' }: { value: string; onChange: (v: string) => void; label?: string }) {
  const { db } = useStore();
  return (
    <Field label={label}>
      <select className="select" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">— Anyone —</option>
        {(db?.people ?? []).map((p) => <option key={p.id} value={p.id}>{p.full_name || p.email}</option>)}
      </select>
    </Field>
  );
}

function ProjectSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { db } = useStore();
  return (
    <Field label="Project">
      <select className="select" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">— None —</option>
        {(db?.projects ?? []).filter((p) => p.status !== 'done' || p.id === value).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
    </Field>
  );
}

// ---------------------------------------------------------------- Task
export function TaskSheet({ open, onClose, edit, presetProject }: { open: boolean; onClose: () => void; edit?: Task | null; presetProject?: string }) {
  const { repo, profile } = useStore();
  const mutate = useMutate();
  const canDelete = useCanDelete();
  const blank = { title: '', notes: '', project_id: '', assignee_id: '', due_date: '', priority: 'normal' as Priority, repeat: 'none' as Repeat };
  const [f, setF] = useState(blank);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    setF(edit
      ? { title: edit.title, notes: edit.notes, project_id: edit.project_id ?? '', assignee_id: edit.assignee_id ?? '', due_date: edit.due_date ?? '', priority: edit.priority, repeat: edit.repeat }
      : { ...blank, project_id: presetProject ?? '', assignee_id: profile?.id ?? '', due_date: localDay() });
  }, [open, edit, presetProject]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    if (!repo || !f.title.trim()) return;
    setBusy(true);
    const row = {
      title: f.title.trim(), notes: f.notes.trim(), project_id: f.project_id || null, assignee_id: f.assignee_id || null,
      due_date: f.due_date || (f.repeat !== 'none' ? localDay() : null), priority: f.priority, repeat: f.repeat,
    };
    const r = await mutate<unknown>(() => (edit ? repo.update('tasks', edit.id, row) : repo.insert('tasks', { ...row, done: false, done_on: null })), edit ? 'Task updated' : 'Task added');
    setBusy(false);
    if (r !== undefined) onClose();
  };
  const remove = async () => {
    if (!repo || !edit || !confirm('Delete this task?')) return;
    await mutate(() => repo.remove('tasks', edit.id), 'Task deleted');
    onClose();
  };

  return (
    <Sheet open={open} onClose={onClose} title={edit ? 'Edit task' : 'New task'}>
      <div className="form">
        <Field label="Task"><input className="input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="What needs doing?" autoFocus={!edit} /></Field>
        <Field label="Repeats" hint={f.repeat === 'none' ? undefined : 'Comes back on its schedule; tick it off each time. Starts from the date below.'}>
          <Seg value={f.repeat} onChange={(v) => setF({ ...f, repeat: v })} options={(Object.keys(REPEAT_LABEL) as Repeat[]).map((k) => ({ value: k, label: REPEAT_LABEL[k] }))} />
        </Field>
        <div className="form-2">
          <Field label={f.repeat === 'none' ? 'Due' : 'Starts'}><input className="input" type="date" value={f.due_date} onChange={(e) => setF({ ...f, due_date: e.target.value })} /></Field>
          <Field label="Priority">
            <select className="select" value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value as Priority })}>
              <option value="high">High</option><option value="normal">Normal</option><option value="low">Low</option>
            </select>
          </Field>
        </div>
        <div className="form-2">
          <PeopleSelect value={f.assignee_id} onChange={(v) => setF({ ...f, assignee_id: v })} />
          <ProjectSelect value={f.project_id} onChange={(v) => setF({ ...f, project_id: v })} />
        </div>
        <Field label="Notes"><textarea className="textarea" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
        <button className="btn block" disabled={!f.title.trim() || busy} onClick={save}>{busy ? 'Saving…' : edit ? 'Save task' : 'Add task'}</button>
        {edit && canDelete(edit) && <button className="btn danger block" onClick={remove}>Delete task</button>}
      </div>
    </Sheet>
  );
}

// ---------------------------------------------------------------- Bug
export const SEV_LABEL: Record<BugSeverity, string> = { critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low' };
export const BUG_STATUS_LABEL: Record<BugStatus, string> = { open: 'Open', in_progress: 'In progress', fixed: 'Fixed', closed: 'Closed' };

export function BugSheet({ open, onClose, edit, presetProject }: { open: boolean; onClose: () => void; edit?: Bug | null; presetProject?: string }) {
  const { repo } = useStore();
  const mutate = useMutate();
  const canDelete = useCanDelete();
  const blank = { title: '', description: '', project_id: '', severity: 'medium' as BugSeverity, status: 'open' as BugStatus, assignee_id: '' };
  const [f, setF] = useState(blank);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    setF(edit
      ? { title: edit.title, description: edit.description, project_id: edit.project_id ?? '', severity: edit.severity, status: edit.status, assignee_id: edit.assignee_id ?? '' }
      : { ...blank, project_id: presetProject ?? '' });
  }, [open, edit, presetProject]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    if (!repo || !f.title.trim()) return;
    setBusy(true);
    const resolved = f.status === 'fixed' || f.status === 'closed';
    const row = {
      title: f.title.trim(), description: f.description.trim(), project_id: f.project_id || null, severity: f.severity, status: f.status,
      assignee_id: f.assignee_id || null, resolved_on: resolved ? (edit?.resolved_on ?? localDay()) : null,
    };
    const r = await mutate<unknown>(() => (edit ? repo.update('bugs', edit.id, row) : repo.insert('bugs', row)), edit ? 'Bug updated' : 'Bug reported');
    setBusy(false);
    if (r !== undefined) onClose();
  };
  const remove = async () => {
    if (!repo || !edit || !confirm('Delete this bug?')) return;
    await mutate(() => repo.remove('bugs', edit.id), 'Bug deleted');
    onClose();
  };

  return (
    <Sheet open={open} onClose={onClose} title={edit ? 'Bug' : 'Report a bug'}>
      <div className="form">
        <Field label="What’s wrong"><input className="input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Short summary" autoFocus={!edit} /></Field>
        <Field label="Severity">
          <Seg value={f.severity} onChange={(v) => setF({ ...f, severity: v })} options={(['low', 'medium', 'high', 'critical'] as BugSeverity[]).map((k) => ({ value: k, label: SEV_LABEL[k] }))} />
        </Field>
        <Field label="Status">
          <Seg value={f.status} onChange={(v) => setF({ ...f, status: v })} options={(['open', 'in_progress', 'fixed', 'closed'] as BugStatus[]).map((k) => ({ value: k, label: BUG_STATUS_LABEL[k] }))} />
        </Field>
        <div className="form-2">
          <ProjectSelect value={f.project_id} onChange={(v) => setF({ ...f, project_id: v })} />
          <PeopleSelect value={f.assignee_id} onChange={(v) => setF({ ...f, assignee_id: v })} />
        </div>
        <Field label="Details / steps to reproduce"><textarea className="textarea" style={{ minHeight: 120 }} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder={'1. Open …\n2. Tap …\nExpected … / Got …'} /></Field>
        <button className="btn block" disabled={!f.title.trim() || busy} onClick={save}>{busy ? 'Saving…' : edit ? 'Save bug' : 'Report bug'}</button>
        {edit && canDelete(edit) && <button className="btn danger block" onClick={remove}>Delete bug</button>}
      </div>
    </Sheet>
  );
}

// ---------------------------------------------------------------- Project
export function ProjectSheet({ open, onClose, edit, presetClient, onSaved }: { open: boolean; onClose: () => void; edit?: Project | null; presetClient?: string; onSaved?: (p: Project) => void }) {
  const { repo, db, profile, can } = useStore();
  const mutate = useMutate();
  const blank = { name: '', client_id: '', status: 'active' as ProjectStatus, start_date: '', due_date: '', description: '', lead_id: '' };
  const [f, setF] = useState(blank);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    setF(edit
      ? { name: edit.name, client_id: edit.client_id ?? '', status: edit.status, start_date: edit.start_date ?? '', due_date: edit.due_date ?? '', description: edit.description, lead_id: edit.lead_id ?? '' }
      : { ...blank, client_id: presetClient ?? '', start_date: localDay(), lead_id: profile?.id ?? '' });
  }, [open, edit, presetClient]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    if (!repo || !f.name.trim()) return;
    setBusy(true);
    const row = { name: f.name.trim(), client_id: f.client_id || null, status: f.status, start_date: f.start_date || null, due_date: f.due_date || null, description: f.description.trim(), lead_id: f.lead_id || null };
    const r = await mutate(async () => (edit ? (await repo.update('projects', edit.id, row), { ...edit, ...row }) : repo.insert<Project>('projects', row)), edit ? 'Project updated' : 'Project created');
    setBusy(false);
    if (r) { onSaved?.(r as Project); onClose(); }
  };
  const remove = async () => {
    if (!repo || !edit || !confirm('Delete this project and its timeline? Tasks and bugs stay, unlinked.')) return;
    await mutate(() => repo.remove('projects', edit.id), 'Project deleted');
    onClose();
  };

  return (
    <Sheet open={open} onClose={onClose} title={edit ? 'Edit project' : 'New project'}>
      <div className="form">
        <Field label="Project name"><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus={!edit} /></Field>
        <div className="form-2">
          <Field label="Client">
            <select className="select" value={f.client_id} onChange={(e) => setF({ ...f, client_id: e.target.value })}>
              <option value="">— Internal —</option>
              {(db?.clients ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <PeopleSelect label="Project lead" value={f.lead_id} onChange={(v) => setF({ ...f, lead_id: v })} />
        </div>
        <Field label="Status">
          <Seg value={f.status} onChange={(v) => setF({ ...f, status: v })} options={(Object.keys(STATUS_LABEL) as ProjectStatus[]).map((k) => ({ value: k, label: STATUS_LABEL[k] }))} />
        </Field>
        <div className="form-2">
          <Field label="Start"><input className="input" type="date" value={f.start_date} onChange={(e) => setF({ ...f, start_date: e.target.value })} /></Field>
          <Field label="Deadline"><input className="input" type="date" value={f.due_date} onChange={(e) => setF({ ...f, due_date: e.target.value })} /></Field>
        </div>
        <Field label="Scope / brief"><textarea className="textarea" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        <button className="btn block" disabled={!f.name.trim() || busy} onClick={save}>{busy ? 'Saving…' : edit ? 'Save project' : 'Create project'}</button>
        {edit && can('work.delete') && <button className="btn danger block" onClick={remove}>Delete project</button>}
      </div>
    </Sheet>
  );
}

// ---------------------------------------------------------------- Milestone / deliverable
export function MilestoneSheet({ open, onClose, edit, projectId }: { open: boolean; onClose: () => void; edit?: Milestone | null; projectId: string }) {
  const { repo, can } = useStore();
  const mutate = useMutate();
  const [f, setF] = useState({ title: '', kind: 'deliverable' as MilestoneKind, due_date: '' });
  useEffect(() => { if (open) setF(edit ? { title: edit.title, kind: edit.kind, due_date: edit.due_date ?? '' } : { title: '', kind: 'deliverable', due_date: '' }); }, [open, edit]);
  const save = async () => {
    if (!repo || !f.title.trim()) return;
    const row = { title: f.title.trim(), kind: f.kind, due_date: f.due_date || null };
    const r = await mutate<unknown>(() => (edit ? repo.update('milestones', edit.id, row) : repo.insert('milestones', { ...row, project_id: projectId, done: false, done_on: null })), 'Timeline updated');
    if (r !== undefined) onClose();
  };
  return (
    <Sheet open={open} onClose={onClose} title={edit ? 'Edit timeline item' : 'Add to timeline'}>
      <div className="form">
        <Seg value={f.kind} onChange={(v) => setF({ ...f, kind: v })} options={[{ value: 'deliverable', label: 'Deliverable' }, { value: 'milestone', label: 'Milestone' }]} />
        <Field label={f.kind === 'deliverable' ? 'What gets delivered' : 'Milestone'}><input className="input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} autoFocus={!edit} placeholder={f.kind === 'deliverable' ? 'Final logo files' : 'Client sign-off'} /></Field>
        <Field label="Date"><input className="input" type="date" value={f.due_date} onChange={(e) => setF({ ...f, due_date: e.target.value })} /></Field>
        <button className="btn block" disabled={!f.title.trim()} onClick={save}>Save</button>
        {edit && can('work.edit') && <button className="btn danger block" onClick={async () => { if (repo && confirm('Remove from timeline?')) { await mutate(() => repo.remove('milestones', edit.id), 'Removed'); onClose(); } }}>Remove</button>}
      </div>
    </Sheet>
  );
}
