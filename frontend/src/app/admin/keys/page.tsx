'use client';

import { useEffect, useState, useCallback } from 'react';
import { Key, Plus, RefreshCw, Trash2, Eye, EyeOff, Shield, Activity } from 'lucide-react';
import { api } from '@/lib/api';
import Skeleton from '@/components/ui/Skeleton';
import Badge from '@/components/ui/Badge';
import Modal from '@/components/ui/Modal';

interface ServiceOverview {
  service: string;
  display_name: string;
  key_count: number;
  healthy_keys: number;
  total_daily_usage: number;
}

interface ServiceKey {
  id: number;
  service: string;
  label: string;
  key_prefix: string;
  is_active: boolean;
  priority: number;
  daily_limit: number;
  hourly_limit: number;
  daily_usage: number;
  hourly_usage: number;
  health_status: string;
  last_error: string | null;
  created_at: string;
}

/** Build local fallback services for when backend is unavailable. */
function buildLocalServices(): ServiceOverview[] {
  return [
    { service: 'anthropic', display_name: 'Claude API (Anthropic)', key_count: 0, healthy_keys: 0, total_daily_usage: 0 },
    { service: 'openai', display_name: 'OpenAI (DALL-E 3)', key_count: 0, healthy_keys: 0, total_daily_usage: 0 },
    { service: 'd-id', display_name: 'D-ID (Pro Avatars)', key_count: 0, healthy_keys: 0, total_daily_usage: 0 },
    { service: 'pexels', display_name: 'Pexels (Stock Media)', key_count: 0, healthy_keys: 0, total_daily_usage: 0 },
    { service: 'pixabay', display_name: 'Pixabay (Stock Media)', key_count: 0, healthy_keys: 0, total_daily_usage: 0 },
    { service: 'freesound', display_name: 'Freesound (Audio)', key_count: 0, healthy_keys: 0, total_daily_usage: 0 },
    { service: 'stripe', display_name: 'Stripe (Payments)', key_count: 0, healthy_keys: 0, total_daily_usage: 0 },
    { service: 'auth0', display_name: 'Auth0 (Authentication)', key_count: 1, healthy_keys: 1, total_daily_usage: 0 },
  ];
}

/** /admin/keys — Admin system API key management with rotation and health monitoring. */
export default function AdminKeysPage() {
  const [services, setServices] = useState<ServiceOverview[]>([]);
  const [selectedService, setSelectedService] = useState<string | null>(null);
  const [serviceKeys, setServiceKeys] = useState<ServiceKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [keysLoading, setKeysLoading] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);

  const fetchServices = useCallback(async () => {
    try {
      const data = await api.get('/admin/keys/services');
      const apiServices = Array.isArray(data?.services) ? data.services : [];
      if (apiServices.length > 0) {
        setServices(apiServices);
      } else {
        setServices(buildLocalServices());
      }
    } catch (e) {
      console.error('Failed to fetch services:', e);
      setServices(buildLocalServices());
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchKeys = useCallback(async (service: string) => {
    setKeysLoading(true);
    try {
      const data = await api.get(`/admin/keys/${service}`);
      setServiceKeys(data.keys || []);
    } catch (e) {
      console.error('Failed to fetch keys:', e);
    } finally {
      setKeysLoading(false);
    }
  }, []);

  useEffect(() => { fetchServices(); }, [fetchServices]);

  useEffect(() => {
    if (selectedService) fetchKeys(selectedService);
  }, [selectedService, fetchKeys]);

  const handleDeleteKey = async (keyId: number) => {
    if (!confirm('Delete this API key? This cannot be undone.')) return;
    await api.delete(`/admin/keys/key/${keyId}`);
    setServiceKeys((prev) => prev.filter((k) => k.id !== keyId));
    fetchServices(); // Refresh counts
  };

  const handleRotateKey = async (keyId: number) => {
    const newKey = prompt('Enter the new API key value:');
    if (!newKey) return;
    await api.post(`/admin/keys/key/${keyId}/rotate`, { new_key: newKey });
    if (selectedService) fetchKeys(selectedService);
  };

  if (loading) {
    return (
      <div className="p-6 max-w-6xl mx-auto">
        <Skeleton className="h-8 w-48 mb-6" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Key className="w-7 h-7 text-primary" />
          <h1 className="text-2xl font-bold text-dark dark:text-white">System API Keys</h1>
        </div>
      </div>

      {/* Service grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        {(services ?? []).map((svc) => (
          <button
            key={svc.service}
            onClick={() => setSelectedService(svc.service)}
            className={`text-left p-4 bg-white dark:bg-dark/60 border rounded-xl transition-all hover:shadow-md ${
              selectedService === svc.service
                ? 'border-primary ring-1 ring-primary/20'
                : 'border-border dark:border-white/10'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="font-semibold text-dark dark:text-white capitalize">
                {svc.display_name || svc.service}
              </span>
              <Badge
                variant={svc.healthy_keys > 0 ? 'success' : svc.key_count > 0 ? 'warning' : 'danger'}
                size="sm"
              >
                {svc.key_count === 0 ? 'No keys' : `${svc.healthy_keys}/${svc.key_count} healthy`}
              </Badge>
            </div>
            <div className="flex items-center gap-3 text-xs text-dark/50 dark:text-white/50">
              <span>{svc.key_count} key{svc.key_count !== 1 ? 's' : ''}</span>
              <span>·</span>
              <span>{svc.total_daily_usage} calls today</span>
            </div>
          </button>
        ))}
      </div>

      {/* Selected service keys */}
      {selectedService && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-dark dark:text-white capitalize">
              {selectedService} Keys
            </h2>
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary-hover transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add Key
            </button>
          </div>

          {keysLoading ? (
            <div className="space-y-3">
              {[1, 2].map((i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
            </div>
          ) : (serviceKeys ?? []).length === 0 ? (
            <div className="bg-white dark:bg-dark/60 border border-border dark:border-white/10 rounded-xl p-8 text-center">
              <Key className="w-10 h-10 text-dark/20 dark:text-white/20 mx-auto mb-3" />
              <p className="text-dark/60 dark:text-white/60">No API keys configured for this service.</p>
              <button
                onClick={() => setShowAddModal(true)}
                className="mt-3 text-sm text-primary hover:underline"
              >
                Add your first key
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {(serviceKeys ?? []).map((key) => (
                <div
                  key={key.id}
                  className="bg-white dark:bg-dark/60 border border-border dark:border-white/10 rounded-xl p-4"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-dark dark:text-white">{key.label}</span>
                      <code className="text-xs bg-surface dark:bg-white/5 px-1.5 py-0.5 rounded text-dark/50 dark:text-white/50">
                        {key.key_prefix}...
                      </code>
                      <Badge
                        variant={key.health_status === 'healthy' ? 'success' : key.health_status === 'degraded' ? 'warning' : 'danger'}
                        size="sm"
                      >
                        {key.health_status}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleRotateKey(key.id)}
                        className="p-1.5 text-primary hover:bg-primary/10 rounded-lg transition-colors"
                        title="Rotate key"
                      >
                        <RefreshCw className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteKey(key.id)}
                        className="p-1.5 text-danger hover:bg-danger/10 rounded-lg transition-colors"
                        title="Delete key"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-dark/50 dark:text-white/50">
                    <span>Priority: {key.priority}</span>
                    <span>Daily: {key.daily_usage}/{key.daily_limit || '∞'}</span>
                    <span>Hourly: {key.hourly_usage}/{key.hourly_limit || '∞'}</span>
                    {key.last_error && (
                      <span className="text-danger truncate max-w-[200px]" title={key.last_error}>
                        Error: {key.last_error}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Add Key Modal */}
      {showAddModal && selectedService && (
        <AddKeyModal
          service={selectedService}
          onClose={() => setShowAddModal(false)}
          onAdded={() => {
            setShowAddModal(false);
            fetchKeys(selectedService);
            fetchServices();
          }}
        />
      )}
    </div>
  );
}

/** Modal for adding a new API key. */
function AddKeyModal({
  service,
  onClose,
  onAdded,
}: {
  service: string;
  onClose: () => void;
  onAdded: () => void;
}) {
  const [label, setLabel] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [dailyLimit, setDailyLimit] = useState(0);
  const [hourlyLimit, setHourlyLimit] = useState(0);
  const [priority, setPriority] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [showKey, setShowKey] = useState(false);

  const handleSubmit = async () => {
    if (!label || !apiKey) return;
    setSubmitting(true);
    try {
      await api.post(`/admin/keys/${service}`, {
        label,
        api_key: apiKey,
        daily_limit: dailyLimit,
        hourly_limit: hourlyLimit,
        priority,
      });
      onAdded();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} title={`Add ${service} API Key`}>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-dark dark:text-white mb-1">Label</label>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. Primary key"
            className="w-full px-3 py-2 rounded-lg border border-border dark:border-white/20 bg-white dark:bg-dark text-dark dark:text-white text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-dark dark:text-white mb-1">API Key</label>
          <div className="relative">
            <input
              type={showKey ? 'text' : 'password'}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-..."
              className="w-full px-3 py-2 pr-10 rounded-lg border border-border dark:border-white/20 bg-white dark:bg-dark text-dark dark:text-white text-sm font-mono"
            />
            <button
              onClick={() => setShowKey(!showKey)}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-dark/40 dark:text-white/40 hover:text-dark dark:hover:text-white"
            >
              {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-medium text-dark/60 dark:text-white/60 mb-1">Daily Limit</label>
            <input
              type="number"
              min={0}
              value={dailyLimit}
              onChange={(e) => setDailyLimit(Number(e.target.value))}
              className="w-full px-2 py-1.5 rounded border border-border dark:border-white/20 bg-white dark:bg-dark text-dark dark:text-white text-sm"
            />
            <p className="text-[10px] text-dark/40 dark:text-white/40 mt-0.5">0 = unlimited</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-dark/60 dark:text-white/60 mb-1">Hourly Limit</label>
            <input
              type="number"
              min={0}
              value={hourlyLimit}
              onChange={(e) => setHourlyLimit(Number(e.target.value))}
              className="w-full px-2 py-1.5 rounded border border-border dark:border-white/20 bg-white dark:bg-dark text-dark dark:text-white text-sm"
            />
            <p className="text-[10px] text-dark/40 dark:text-white/40 mt-0.5">0 = unlimited</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-dark/60 dark:text-white/60 mb-1">Priority</label>
            <input
              type="number"
              min={1}
              max={100}
              value={priority}
              onChange={(e) => setPriority(Number(e.target.value))}
              className="w-full px-2 py-1.5 rounded border border-border dark:border-white/20 bg-white dark:bg-dark text-dark dark:text-white text-sm"
            />
            <p className="text-[10px] text-dark/40 dark:text-white/40 mt-0.5">Lower = preferred</p>
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-lg border border-border dark:border-white/20 text-dark dark:text-white hover:bg-surface dark:hover:bg-white/5 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!label || !apiKey || submitting}
            className="px-4 py-2 text-sm bg-primary text-white rounded-lg font-medium hover:bg-primary-hover disabled:opacity-50 transition-colors flex items-center gap-1.5"
          >
            <Shield className="w-4 h-4" />
            {submitting ? 'Encrypting...' : 'Add Key (Encrypted)'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
