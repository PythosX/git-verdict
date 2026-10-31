import { Briefcase, CheckCircle2, ExternalLink, Flame, Target, TrendingUp, Wrench } from 'lucide-react';
import { ProfessionalReview, RoastLevel, RoastSet } from '../types/pythosx';
import { PxBar, PxSectionHeader, PythosXBadge, RoastLevelSwitch, formatDate, scoreColor } from './PythosXBrand';
import { ScoreRing, TagPills } from './UI';

function Stat({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="rounded-2xl p-4 min-w-0" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
      <p className="text-[10px] font-black uppercase tracking-[0.15em] mb-1" style={{ color: 'var(--text-muted)' }}>{label}</p>
      <p className="text-lg font-black font-mono break-words" style={{ color: 'var(--text-primary)' }}>{value}</p>
      {hint && <p className="text-[10px] font-medium mt-0.5" style={{ color: 'var(--text-muted)' }}>{hint}</p>}
    </div>
  );
}

const IMPACT_STYLE: Record<string, { bg: string; fg: string }> = {
  High: { bg: '#FFEBEE', fg: '#C62828' },
  Medium: { bg: '#FFF3E0', fg: '#E65100' },
  Low: { bg: '#E8F5E9', fg: '#2E7D32' },
};

interface Props {
  review: ProfessionalReview;
  profileRoasts: RoastSet;
  roastLevel: RoastLevel;
  onRoastLevelChange: (level: RoastLevel) => void;
}

export function PythosXProfessionalReview({ review, profileRoasts, roastLevel, onRoastLevelChange }: Props) {
  const { snapshot: s, presenceScore: p, verdict: v } = review;
  const tags = s.dominantLanguages.map((l) => `${l.name} ${Math.round(l.pct)}%`);
  const roastLines = profileRoasts?.[roastLevel] || [];

  return (
    <section className="space-y-6 animate-slide-up" aria-labelledby="px-pro-title">
      <div className="glass rounded-3xl p-6 sm:p-7 noise relative">
        <PxSectionHeader
          eyebrow="Analyzed by PythosX"
          title="PythosX Professional Developer Review"
          subtitle="Beyond GitHub statistics. A deeper look at your professional developer presence."
        />
        <span id="px-pro-title" className="sr-only">PythosX Professional Developer Review</span>

        {/* A. Snapshot */}
        <div className="mt-6">
          <p className="text-[10px] font-black uppercase tracking-[0.15em] mb-3 flex items-center gap-2" style={{ color: 'var(--text-muted)' }}>
            <Briefcase className="w-3.5 h-3.5" style={{ color: 'var(--accent)' }} /> Professional Developer Snapshot
          </p>
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-2">
            <h4 className="text-xl font-black" style={{ color: 'var(--text-primary)' }}>{s.name || `@${s.username}`}</h4>
            <a href={`https://github.com/${s.username}`} target="_blank" rel="noopener noreferrer" className="text-sm font-mono font-bold" style={{ color: 'var(--accent)' }}>@{s.username}</a>
            {s.company && <span className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>{s.company}</span>}
            {s.location && <span className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>{s.location}</span>}
          </div>
          <p className="text-sm font-medium leading-relaxed" style={{ color: s.bio ? 'var(--text-secondary)' : 'var(--text-muted)' }}>
            {s.bio || 'No public bio on this profile.'}
          </p>
          {s.website && (
            <a href={/^https?:\/\//i.test(s.website) ? s.website : `https://${s.website}`} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 mt-2 text-xs font-bold break-all" style={{ color: 'var(--accent)' }}>
              <ExternalLink className="w-3.5 h-3.5 shrink-0" /> {s.website}
            </a>
          )}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
            <Stat label="Account age" value={s.accountAgeYears !== null ? `${s.accountAgeYears} yr` : 'Unknown'} hint={s.accountCreatedAt ? `Since ${formatDate(s.accountCreatedAt)}` : undefined} />
            <Stat label="Public repos" value={s.publicRepos} />
            <Stat label="Total stars" value={s.totalStars} hint={s.starsScope === 'sampled' ? 'Across the 100 most recent originals' : 'Across original repos'} />
            <Stat label="Followers" value={s.followers} />
            <Stat label="Contributions" value={s.contributions ? s.contributions.calendarTotal : 'n/a'}
              hint={s.contributions ? `${s.contributions.totalCommits} commits · ${s.contributions.totalPRs} PRs (${s.contributions.window})` : 'Not available'} />
            <Stat label="Organizations" value={s.organizations} />
            <Stat label="Pinned repos" value={s.pinnedRepos} />
            <Stat label="Top language" value={s.dominantLanguages[0]?.name || 'n/a'} />
          </div>
          {tags.length > 0 && <TagPills tags={tags} />}
        </div>
      </div>

      {/* B. Presence score */}
      <div className="glass rounded-3xl p-6 sm:p-7">
        <div className="flex flex-col sm:flex-row gap-6 sm:items-center">
          <div className="flex items-center gap-4 shrink-0">
            <ScoreRing value={p.overall} label="Presence" color="#E8A800" size={96} />
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.15em]" style={{ color: 'var(--text-muted)' }}>PythosX Professional Presence Score</p>
              <p className="text-xl font-black" style={{ color: scoreColor(p.overall) }}>{p.label}</p>
            </div>
          </div>
          <p className="text-xs leading-relaxed font-medium" style={{ color: 'var(--text-muted)' }}>{p.disclaimer}</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4 mt-6">
          {p.components.map((c) => <PxBar key={c.key} value={c.score} label={c.label} right={`weight ${c.weight}%`} detail={c.evidence} />)}
        </div>
        <details className="mt-5 group">
          <summary className="cursor-pointer text-xs font-black uppercase tracking-wider" style={{ color: 'var(--accent)' }}>How this score was calculated</summary>
          <ul className="mt-3 space-y-1.5 list-disc pl-5">
            {p.method.map((line, i) => <li key={i} className="text-xs leading-relaxed font-medium" style={{ color: 'var(--text-secondary)' }}>{line}</li>)}
          </ul>
        </details>
      </div>

      {/* C + D. Strengths / improvements */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="glass rounded-3xl p-6">
          <p className="text-[10px] font-black uppercase tracking-[0.15em] mb-4 flex items-center gap-2" style={{ color: 'var(--text-muted)' }}>
            <CheckCircle2 className="w-3.5 h-3.5" style={{ color: '#2E7D32' }} /> PythosX Professional Strengths
          </p>
          {review.strengths.length === 0 ? (
            <p className="text-sm font-medium" style={{ color: 'var(--text-muted)' }}>No standout professional signals were found in the public data yet.</p>
          ) : (
            <ul className="space-y-3">
              {review.strengths.map((item, i) => (
                <li key={i} className="rounded-xl p-3.5" style={{ background: '#F3FAF4', border: '1px solid #D6EBD9' }}>
                  <p className="text-sm font-black" style={{ color: '#2E7D32' }}>{item.title}</p>
                  <p className="text-xs leading-relaxed font-medium mt-0.5" style={{ color: 'var(--text-secondary)' }}>{item.detail}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="glass rounded-3xl p-6">
          <p className="text-[10px] font-black uppercase tracking-[0.15em] mb-4 flex items-center gap-2" style={{ color: 'var(--text-muted)' }}>
            <Wrench className="w-3.5 h-3.5" style={{ color: 'var(--accent)' }} /> PythosX Areas to Improve
          </p>
          {review.improvements.length === 0 ? (
            <p className="text-sm font-medium" style={{ color: 'var(--text-muted)' }}>No major gaps were detected in the public profile.</p>
          ) : (
            <ul className="space-y-3">
              {review.improvements.map((item, i) => {
                const style = IMPACT_STYLE[item.impact] || IMPACT_STYLE.Low!;
                return (
                  <li key={i} className="rounded-xl p-3.5" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-black min-w-0 break-words" style={{ color: 'var(--text-primary)' }}>{item.title}</p>
                      <span className="shrink-0 text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full" style={{ background: style.bg, color: style.fg }}>{item.impact}</span>
                    </div>
                    <p className="text-xs leading-relaxed font-medium mt-0.5" style={{ color: 'var(--text-secondary)' }}>{item.detail}</p>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {/* E. Verdict */}
      <div className="rounded-3xl p-6 sm:p-7 noise" style={{ background: 'var(--accent-light)', border: '1px solid var(--border-accent)' }}>
        <div className="flex items-center gap-2 mb-4"><Target className="w-5 h-5" style={{ color: 'var(--accent)' }} />
          <h4 className="text-lg font-black tracking-tight" style={{ color: 'var(--text-primary)' }}>PythosX Professional Verdict</h4></div>
        <p className="text-sm leading-relaxed font-medium mb-5" style={{ color: 'var(--text-secondary)' }}>{v.impression}</p>
        <dl className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {([
            ['Strongest technical area', v.strongestArea, TrendingUp],
            ['Biggest portfolio weakness', v.biggestWeakness, Wrench],
            ['Most valuable improvement', v.mostValuableImprovement, Target],
            ['Recommended next step', v.nextStep, CheckCircle2],
          ] as const).map(([label, text, Icon]) => (
            <div key={label} className="rounded-2xl p-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
              <dt className="text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 mb-1" style={{ color: 'var(--text-muted)' }}>
                <Icon className="w-3.5 h-3.5" style={{ color: 'var(--accent)' }} /> {label}
              </dt>
              <dd className="text-xs leading-relaxed font-semibold" style={{ color: 'var(--text-primary)' }}>{text}</dd>
            </div>
          ))}
        </dl>
      </div>

      {/* Profile roast */}
      <div className="rounded-3xl p-6 border relative" style={{ background: '#FFF8F0', borderColor: '#F5D9BE' }}>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <span className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-widest" style={{ color: '#C05621' }}>
            <Flame className="w-5 h-5" /> PythosX Roast
          </span>
          <RoastLevelSwitch level={roastLevel} onChange={onRoastLevelChange} />
        </div>
        <ul className="space-y-2" key={roastLevel}>
          {roastLines.map((line, i) => (
            <li key={i} className="text-sm leading-relaxed font-medium italic animate-slide-up" style={{ color: 'var(--text-secondary)', animationDelay: `${i * 0.06}s` }}>“{line}”</li>
          ))}
        </ul>
        <p className="text-[10px] font-semibold mt-3" style={{ color: 'var(--text-muted)' }}>Humor targets profile presentation and code practices — never the person.</p>
      </div>
      <div className="flex justify-end"><PythosXBadge>PythosX Developer Review</PythosXBadge></div>
    </section>
  );
}
