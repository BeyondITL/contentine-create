'use client';

import { useState } from 'react';
import { Send, Loader2, CheckCircle, Building2, AlertCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { useToast } from '@/components/ui/Toast';

/** Team size bracket options. */
const TEAM_SIZES = ['1-10', '11-50', '51-200', '201-500', '500+'] as const;
type TeamSize = (typeof TEAM_SIZES)[number];

/** Form field values. */
interface FormData {
  companyName: string;
  contactName: string;
  email: string;
  phone: string;
  teamSize: TeamSize | '';
  message: string;
}

/** Validation errors keyed by field name. */
type FormErrors = Partial<Record<keyof FormData, string>>;

const initialForm: FormData = {
  companyName: '',
  contactName: '',
  email: '',
  phone: '',
  teamSize: '',
  message: '',
};

/** Enterprise contact sales form with validation, loading state, and success confirmation. */
export default function EnterpriseContactForm() {
  const { toast } = useToast();
  const [form, setForm] = useState<FormData>(initialForm);
  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  function updateField<K extends keyof FormData>(key: K, value: FormData[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    // Clear field error on edit
    if (errors[key]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  }

  function validate(): FormErrors {
    const errs: FormErrors = {};

    if (!form.email.trim()) {
      errs.email = 'Email is required.';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      errs.email = 'Please enter a valid email address.';
    }

    return errs;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const validationErrors = validate();
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    setIsSubmitting(true);
    setErrors({});

    try {
      await api.post('/enterprise/contact', {
        company_name: form.companyName.trim(),
        contact_name: form.contactName.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        team_size: form.teamSize,
        message: form.message.trim(),
      }, { auth: false });

      setIsSubmitted(true);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Something went wrong. Please try again.';
      toast({
        variant: 'error',
        title: 'Failed to send',
        description: message,
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  // ── Success state ──
  if (isSubmitted) {
    return (
      <div id="enterprise-contact" className="bento-card-glow p-6 md:p-8">
        <div className="flex flex-col items-center text-center py-6">
          <div className="w-14 h-14 rounded-2xl bg-secondary/10 dark:bg-secondary/15 flex items-center justify-center mb-4">
            <CheckCircle size={28} className="text-secondary" />
          </div>
          <h3 className="text-[18px] md:text-[16px] font-bold text-text dark:text-[#E0E0E0] mb-2">
            Thank you!
          </h3>
          <p className="text-[14px] md:text-[13px] text-text-secondary dark:text-[#AAA] max-w-sm leading-relaxed">
            Our team will reach out within 24 hours. We look forward to helping your team scale with Contentine Create.
          </p>
          <button
            type="button"
            onClick={() => {
              setIsSubmitted(false);
              setForm(initialForm);
            }}
            className="mt-6 btn-ghost text-[13px] cursor-pointer"
          >
            Send another inquiry
          </button>
        </div>
      </div>
    );
  }

  // ── Form state ──
  return (
    <div id="enterprise-contact" className="bento-card-glow p-6 md:p-8">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-primary-bg dark:bg-primary/10 flex items-center justify-center">
          <Building2 size={20} className="text-primary" />
        </div>
        <div>
          <h3 className="text-[16px] md:text-[15px] font-bold text-text dark:text-[#E0E0E0]">
            Contact Sales
          </h3>
          <p className="text-[12px] text-text-muted">
            Tell us about your team and we will craft a custom plan.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        {/* Row: Company + Contact Name */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="ec-company" className="block text-[12px] font-medium text-text dark:text-[#E0E0E0] mb-1.5">
              Company Name
            </label>
            <input
              id="ec-company"
              type="text"
              value={form.companyName}
              onChange={(e) => updateField('companyName', e.target.value)}
              placeholder="Acme Inc."
              disabled={isSubmitting}
              className="input-field w-full"
            />
          </div>
          <div>
            <label htmlFor="ec-contact" className="block text-[12px] font-medium text-text dark:text-[#E0E0E0] mb-1.5">
              Contact Name
            </label>
            <input
              id="ec-contact"
              type="text"
              value={form.contactName}
              onChange={(e) => updateField('contactName', e.target.value)}
              placeholder="Jane Smith"
              disabled={isSubmitting}
              className="input-field w-full"
            />
          </div>
        </div>

        {/* Row: Email + Phone */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="ec-email" className="block text-[12px] font-medium text-text dark:text-[#E0E0E0] mb-1.5">
              Work Email <span className="text-danger">*</span>
            </label>
            <input
              id="ec-email"
              type="email"
              value={form.email}
              onChange={(e) => updateField('email', e.target.value)}
              placeholder="jane@acme.com"
              disabled={isSubmitting}
              required
              aria-invalid={!!errors.email}
              aria-describedby={errors.email ? 'ec-email-error' : undefined}
              className={`
                input-field w-full
                ${errors.email ? 'border-danger focus:ring-danger/15 focus:border-danger' : ''}
              `}
            />
            {errors.email && (
              <p id="ec-email-error" className="flex items-center gap-1 mt-1 text-[11px] text-danger">
                <AlertCircle className="w-3 h-3" />
                {errors.email}
              </p>
            )}
          </div>
          <div>
            <label htmlFor="ec-phone" className="block text-[12px] font-medium text-text dark:text-[#E0E0E0] mb-1.5">
              Phone
            </label>
            <input
              id="ec-phone"
              type="tel"
              value={form.phone}
              onChange={(e) => updateField('phone', e.target.value)}
              placeholder="+1 (555) 000-0000"
              disabled={isSubmitting}
              className="input-field w-full"
            />
          </div>
        </div>

        {/* Team Size */}
        <div>
          <label htmlFor="ec-team-size" className="block text-[12px] font-medium text-text dark:text-[#E0E0E0] mb-1.5">
            Team Size
          </label>
          <select
            id="ec-team-size"
            value={form.teamSize}
            onChange={(e) => updateField('teamSize', e.target.value as TeamSize | '')}
            disabled={isSubmitting}
            className="input-field w-full cursor-pointer appearance-none"
          >
            <option value="">Select team size</option>
            {TEAM_SIZES.map((size) => (
              <option key={size} value={size}>
                {size} people
              </option>
            ))}
          </select>
        </div>

        {/* Message */}
        <div>
          <label htmlFor="ec-message" className="block text-[12px] font-medium text-text dark:text-[#E0E0E0] mb-1.5">
            Message
          </label>
          <textarea
            id="ec-message"
            value={form.message}
            onChange={(e) => updateField('message', e.target.value)}
            placeholder="Tell us about your content creation needs..."
            disabled={isSubmitting}
            rows={4}
            className="input-field w-full resize-none min-h-[120px]"
          />
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={isSubmitting}
          className="
            w-full sm:w-auto btn-primary flex items-center justify-center gap-2
            disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer
          "
        >
          {isSubmitting ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              Sending...
            </>
          ) : (
            <>
              <Send size={14} />
              Send Inquiry
            </>
          )}
        </button>
      </form>
    </div>
  );
}
