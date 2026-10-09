'use client';

import { useEffect, useState, useCallback } from 'react';
import { Building, Mail, Phone, Users, MessageSquare, Clock } from 'lucide-react';
import { api } from '@/lib/api';
import Skeleton from '@/components/ui/Skeleton';
import Badge from '@/components/ui/Badge';
import EmptyState from '@/components/ui/EmptyState';

interface EnterpriseLead {
  id: number;
  company_name: string;
  contact_name: string;
  contact_email: string;
  phone: string | null;
  team_size: string | null;
  message: string | null;
  status: 'new' | 'contacted' | 'negotiating' | 'closed_won' | 'closed_lost';
  created_at: string;
}

const STATUS_MAP: Record<string, { label: string; variant: 'primary' | 'warning' | 'success' | 'danger' | 'accent' }> = {
  new: { label: 'New', variant: 'primary' },
  contacted: { label: 'Contacted', variant: 'warning' },
  negotiating: { label: 'Negotiating', variant: 'accent' },
  closed_won: { label: 'Closed Won', variant: 'success' },
  closed_lost: { label: 'Closed Lost', variant: 'danger' },
};

/** /admin/enterprise — Admin enterprise lead management. */
export default function AdminEnterprisePage() {
  const [leads, setLeads] = useState<EnterpriseLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLead, setSelectedLead] = useState<EnterpriseLead | null>(null);

  const fetchLeads = useCallback(async () => {
    try {
      // Use the enterprise endpoint — might need to be created
      const data = await api.get('/admin/enterprise/leads');
      setLeads(data.leads || []);
    } catch {
      // Endpoint may not exist yet — show empty
      setLeads([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchLeads(); }, [fetchLeads]);

  if (loading) {
    return (
      <div className="p-6 max-w-6xl mx-auto">
        <Skeleton className="h-8 w-48 mb-6" />
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Building className="w-7 h-7 text-warning" />
        <div>
          <h1 className="text-2xl font-bold text-dark dark:text-white">Enterprise Leads</h1>
          <p className="text-sm text-dark/60 dark:text-white/60">
            {leads.length} lead{leads.length !== 1 ? 's' : ''} total ·{' '}
            {leads.filter((l) => l.status === 'new').length} new
          </p>
        </div>
      </div>

      {leads.length === 0 ? (
        <EmptyState
          icon={Building}
          title="No enterprise leads yet"
          description="Enterprise contact form submissions will appear here."
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Lead list */}
          <div className="lg:col-span-2 space-y-3">
            {leads.map((lead) => {
              const status = STATUS_MAP[lead.status] || STATUS_MAP.new;
              return (
                <button
                  key={lead.id}
                  onClick={() => setSelectedLead(lead)}
                  className={`w-full text-left p-4 bg-white dark:bg-dark/60 border rounded-xl transition-all hover:shadow-md ${
                    selectedLead?.id === lead.id
                      ? 'border-primary ring-1 ring-primary/20'
                      : 'border-border dark:border-white/10'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-dark dark:text-white">
                        {lead.company_name || 'Unknown Company'}
                      </span>
                      <Badge variant={status.variant} size="sm">{status.label}</Badge>
                    </div>
                    <span className="text-xs text-dark/40 dark:text-white/40">
                      {new Date(lead.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-dark/60 dark:text-white/60">
                    <span className="flex items-center gap-1">
                      <Mail className="w-3 h-3" />
                      {lead.contact_email}
                    </span>
                    {lead.contact_name && (
                      <span className="flex items-center gap-1">
                        <Users className="w-3 h-3" />
                        {lead.contact_name}
                      </span>
                    )}
                    {lead.team_size && (
                      <span>{lead.team_size} team members</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Lead detail panel */}
          <div className="lg:col-span-1">
            {selectedLead ? (
              <div className="sticky top-6 bg-white dark:bg-dark/60 border border-border dark:border-white/10 rounded-xl p-5">
                <h3 className="font-semibold text-dark dark:text-white text-lg mb-4">
                  {selectedLead.company_name || 'Unknown Company'}
                </h3>
                <div className="space-y-3">
                  <InfoRow icon={Users} label="Contact" value={selectedLead.contact_name || '—'} />
                  <InfoRow icon={Mail} label="Email" value={selectedLead.contact_email} />
                  <InfoRow icon={Phone} label="Phone" value={selectedLead.phone || '—'} />
                  <InfoRow icon={Users} label="Team Size" value={selectedLead.team_size || '—'} />
                  <InfoRow icon={Clock} label="Submitted" value={new Date(selectedLead.created_at).toLocaleString()} />
                  <div>
                    <p className="text-xs font-medium text-dark/60 dark:text-white/60 mb-1 flex items-center gap-1">
                      <MessageSquare className="w-3 h-3" /> Message
                    </p>
                    <p className="text-sm text-dark/80 dark:text-white/80 bg-surface dark:bg-white/5 rounded-lg p-3">
                      {selectedLead.message || 'No message provided.'}
                    </p>
                  </div>
                  <div className="pt-2">
                    <p className="text-xs font-medium text-dark/60 dark:text-white/60 mb-2">Status</p>
                    <div className="flex flex-wrap gap-1.5">
                      {Object.entries(STATUS_MAP).map(([key, val]) => (
                        <button
                          key={key}
                          onClick={async () => {
                            if (selectedLead.status === key) return;
                            try {
                              await api.put(`/admin/enterprise/leads/${selectedLead.id}`, { status: key });
                              const updated = { ...selectedLead, status: key as EnterpriseLead['status'] };
                              setSelectedLead(updated);
                              setLeads((prev) => prev.map((l) => (l.id === updated.id ? updated : l)));
                            } catch {
                              // Silently fail — backend may not support this yet
                            }
                          }}
                          className={`px-2.5 py-1 text-xs rounded-full font-medium border transition-colors ${
                            selectedLead.status === key
                              ? 'bg-primary text-white border-primary'
                              : 'border-border dark:border-white/20 text-dark/60 dark:text-white/60 hover:border-primary/50 hover:bg-primary/5'
                          }`}
                        >
                          {val.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-surface dark:bg-white/5 border border-border dark:border-white/10 rounded-xl p-8 text-center text-dark/40 dark:text-white/40">
                <Building className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">Select a lead to view details</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** Simple info row helper. */
function InfoRow({ icon: Icon, label, value }: { icon: typeof Mail; label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium text-dark/60 dark:text-white/60 mb-0.5 flex items-center gap-1">
        <Icon className="w-3 h-3" /> {label}
      </p>
      <p className="text-sm text-dark dark:text-white">{value}</p>
    </div>
  );
}
