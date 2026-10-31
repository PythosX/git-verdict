import { Sparkles } from 'lucide-react';
import { ROAST_LEVELS, ROAST_LEVEL_LABELS, RoastLevel } from '../types/pythosx';

export const PYTHOSX_PROFILE_URL = 'https://github.com/PythosX';

/** Small amber pill used next to major PythosX headings. */
export function PythosXBadge({ children = 'PythosX' }: { children?: React.ReactNode }) {
  return (
    <span
      className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest"
      style={{ background: 'var(--accent-light)', border: '1px solid var(--border-accent)', color: '#8B6914' }}
    >
      <Sparkles className="w-3 h-3" /> {children}
    </span>
  );
}

export function PxSectionHeader({ eyebrow, title, subtitle, right }: { eyebrow?: string; title: string; subtitle?: string; right?: React.ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
      <div className="min-w-0">
        {eyebrow && <div className="mb-2"><PythosXBadge>{eyebrow}</PythosXBadge></div>}
        <h3 className="text-2xl font-black tracking-tight break-words" style={{ color: 'var(--text-primary)' }}>{title}</h3>
        {subtitle && <p className="text-sm font-medium mt-1" style={{ color: 'var(--text-secondary)' }}>{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}

export function RoastLevelSwitch({ level, onChange }: { level: RoastLevel; onChange: (level: RoastLevel) => void }) {
  return (
    <div className="inline-flex rounded-full p-1 gap-1 shrink-0 no-print" role="group" aria-label="PythosX roast level"
      style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
      {ROAST_LEVELS.map((item) => {
        const active = item === level;
        return (
          <button key={item} type="button" onClick={() => onChange(item)} aria-pressed={active} title={ROAST_LEVEL_LABELS[item]}
            className="px-3 py-1.5 rounded-full text-[11px] font-black uppercase tracking-wider transition-all"
            style={active ? { background: 'var(--accent)', color: '#FFFFFF', boxShadow: '0 2px 8px var(--accent-glow)' } : { color: 'var(--text-secondary)' }}>
            <span className="sm:hidden">{item === 'brutal' ? 'Brutal' : item === 'spicy' ? 'Spicy' : 'Friendly'}</span>
            <span className="hidden sm:inline">{ROAST_LEVEL_LABELS[item]}</span>
          </button>
        );
      })}
    </div>
  );
}

export function scoreColor(value: number): string {
  return value >= 80 ? '#2E7D32' : value >= 60 ? '#1565C0' : value >= 40 ? '#E65100' : '#C62828';
}

/** Animated progress bar (grows from 0 on mount). */
export function PxBar({ value, label, detail, right }: { value: number | null; label: string; detail?: string; right?: string }) {
  const known = value !== null && Number.isFinite(value);
  const v = known ? Math.max(0, Math.min(100, value as number)) : 0;
  const color = known ? scoreColor(v) : 'var(--text-muted)';
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 mb-1">
        <span className="text-xs font-bold min-w-0 break-words" style={{ color: 'var(--text-primary)' }}>{label}</span>
        <span className="text-xs font-black font-mono shrink-0" style={{ color }}>{known ? `${Math.round(v)}/100` : 'n/a'}{right ? ` · ${right}` : ''}</span>
      </div>
      <div className="h-2 w-full rounded-full overflow-hidden" style={{ background: 'rgba(0,0,0,0.06)' }} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={known ? Math.round(v) : undefined}>
        <div className="h-full rounded-full px-bar-fill" style={{ width: `${v}%`, background: color }} />
      </div>
      {detail && <p className="text-[11px] mt-1 leading-snug font-medium" style={{ color: 'var(--text-muted)' }}>{detail}</p>}
    </div>
  );
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return 'Unknown';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Unknown';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}
