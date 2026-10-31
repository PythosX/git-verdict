import { useState } from 'react';
import { ChevronDown, ClipboardCheck, Clock, ExternalLink, FileText, Flame, GitFork, Lock, Sparkles, Star } from 'lucide-react';
import { PythosXReport, RepoReview, RoastLevel, ROAST_LEVEL_LABELS } from '../types/pythosx';
import { PxBar, PxSectionHeader, PythosXBadge, RoastLevelSwitch, formatDate, scoreColor } from './PythosXBrand';
import type { PythosXUnlock } from '../hooks/usePythosXUnlock';
import { PYTHOSX_URL } from '../utils/pythosxUnlock';

function Chip({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: 'neutral' | 'amber' | 'warn' }) {
  const style = tone === 'amber'
    ? { background: 'var(--accent-light)', color: '#8B6914', border: '1px solid var(--border-accent)' }
    : tone === 'warn'
      ? { background: '#FFF3E0', color: '#E65100', border: '1px solid #F5D9BE' }
      : { background: 'var(--bg-secondary)', color: 'var(--text-secondary)', border: '1px solid var(--border)' };
  return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider" style={style}>{children}</span>;
}

function MiniPanel({ icon: Icon, title, children }: { icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl p-4 min-w-0" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
      <p className="text-[10px] font-black uppercase tracking-[0.15em] mb-2 flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
        <Icon className="w-3.5 h-3.5" style={{ color: 'var(--accent)' }} /> {title}
      </p>
      {children}
    </div>
  );
}

function Bullets({ items, tone }: { items: string[]; tone: 'good' | 'bad' | 'todo' }) {
  const color = tone === 'good' ? '#2E7D32' : tone === 'bad' ? '#C62828' : 'var(--accent)';
  if (items.length === 0) return <p className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Nothing flagged from the available evidence.</p>;
  return (
    <ul className="space-y-1.5">
      {items.map((item, i) => (
        <li key={i} className="text-xs leading-relaxed font-medium flex gap-2" style={{ color: 'var(--text-secondary)' }}>
          <span className="mt-1.5 w-1.5 h-1.5 rounded-full shrink-0" style={{ background: color }} /> <span className="min-w-0 break-words">{item}</span>
        </li>
      ))}
    </ul>
  );
}

export function RepoReviewCard({ repo, roastLevel, defaultOpen = false }: { repo: RepoReview; roastLevel: RoastLevel; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const bodyId = `px-repo-${repo.id.replace(/[^a-z0-9]/gi, '-')}`;
  const roast = repo.roasts[roastLevel]?.[0];
  const c = scoreColor(repo.score);
  const rd = repo.readme;

  return (
    <article className="glass rounded-3xl p-5 sm:p-6 card-hover animate-slide-up min-w-0">
      <div className="flex flex-wrap gap-1.5 mb-3">
        {repo.labels.map((label) => <Chip key={label} tone="amber">{label}</Chip>)}
        {repo.isFork && <Chip tone="warn">Fork</Chip>}
        {repo.isArchived && <Chip tone="warn">Archived</Chip>}
      </div>

      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <a href={repo.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-lg font-black tracking-tight break-all" style={{ color: 'var(--text-primary)' }}>
            {repo.name} <ExternalLink className="w-4 h-4 shrink-0" style={{ color: 'var(--accent)' }} />
          </a>
          <p className="text-xs font-medium mt-1 leading-relaxed" style={{ color: repo.description ? 'var(--text-secondary)' : 'var(--text-muted)' }}>
            {repo.description || 'No repository description.'}
          </p>
        </div>
        <div className="flex flex-col items-center gap-1 shrink-0">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-xl font-black font-mono" style={{ background: 'var(--accent-light)', border: '1px solid var(--border-accent)', color: '#8B6914' }}>{repo.grade}</div>
          <span className="text-[11px] font-black font-mono" style={{ color: c }}>{repo.score}/100</span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-3 text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
        <span className="inline-flex items-center gap-1"><Star className="w-3.5 h-3.5" style={{ color: 'var(--accent)' }} /> {repo.stars}</span>
        <span className="inline-flex items-center gap-1"><GitFork className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} /> {repo.forks}</span>
        <span className="inline-flex items-center gap-1"><Clock className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} /> Updated {formatDate(repo.updatedAt)}</span>
        {repo.primaryLanguage && <span>{repo.primaryLanguage}</span>}
        {repo.license && <span>{repo.license}</span>}
      </div>

      <div className="mt-4 rounded-2xl p-4" style={{ background: 'var(--accent-light)', border: '1px solid var(--border-accent)' }}>
        <p className="text-[10px] font-black uppercase tracking-[0.15em] mb-1" style={{ color: '#8B6914' }}>PythosX Technical Verdict</p>
        <p className="text-xs leading-relaxed font-semibold" style={{ color: 'var(--text-primary)' }}>{repo.verdict}</p>
      </div>

      {roast && (
        <p key={roastLevel} className="mt-3 text-xs leading-relaxed font-medium italic flex gap-2 animate-slide-up" style={{ color: 'var(--text-secondary)' }}>
          <Flame className="w-4 h-4 shrink-0 mt-0.5" style={{ color: '#C05621' }} /> <span>“{roast}”</span>
        </p>
      )}

      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-controls={bodyId}
        className="mt-4 w-full flex items-center justify-between gap-2 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all"
        style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}>
        {open ? 'Hide detailed review' : 'Open detailed review'}
        <ChevronDown className="w-4 h-4 transition-transform" style={{ transform: open ? 'rotate(180deg)' : 'none', color: 'var(--accent)' }} />
      </button>

      {open && (
        <div id={bodyId} className="mt-5 space-y-5 animate-slide-up">
          {repo.languages.length > 0 && (
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.15em] mb-2" style={{ color: 'var(--text-muted)' }}>Programming language composition</p>
              <div className="flex h-2.5 rounded-full overflow-hidden" style={{ background: 'rgba(0,0,0,0.06)' }}>
                {repo.languages.slice(0, 6).map((l, i) => <div key={l.name} title={`${l.name} ${l.pct}%`} style={{ width: `${l.pct}%`, background: ['#E8A800', '#D4780A', '#C05621', '#8B6914', '#F5C542', '#A0A0A0'][i] }} />)}
              </div>
              <p className="text-[11px] font-medium mt-1.5" style={{ color: 'var(--text-muted)' }}>{repo.languages.slice(0, 6).map((l) => `${l.name} ${Math.round(l.pct)}%`).join(' · ')}</p>
            </div>
          )}

          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.15em] mb-3" style={{ color: 'var(--text-muted)' }}>Review by PythosX — 10-point breakdown</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
              {repo.sections.map((section) => <PxBar key={section.key} value={section.score} label={section.label} detail={section.summary} />)}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <MiniPanel icon={Sparkles} title="Technical strengths"><Bullets items={repo.strengths} tone="good" /></MiniPanel>
            <MiniPanel icon={Flame} title="Technical weaknesses"><Bullets items={repo.weaknesses} tone="bad" /></MiniPanel>
            <MiniPanel icon={ClipboardCheck} title="PythosX Recommendations"><Bullets items={repo.recommendations} tone="todo" /></MiniPanel>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <MiniPanel icon={FileText} title="README Reality Check">
              {rd.exists === null ? (
                <p className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>{rd.verdict}</p>
              ) : (
                <div className="space-y-2">
                  <PxBar value={rd.score} label="Documentation score" />
                  <p className="text-[11px] font-semibold" style={{ color: 'var(--text-secondary)' }}>Setup: {rd.setupQuality} · Explanation: {rd.explanationQuality} · {rd.words} words</p>
                  {rd.missingSections.length > 0 && <p className="text-[11px] font-medium" style={{ color: 'var(--text-secondary)' }}>Missing: {rd.missingSections.join(', ')}</p>}
                  <p className="text-xs italic font-medium" style={{ color: 'var(--text-secondary)' }}>“{rd.verdict}”</p>
                </div>
              )}
            </MiniPanel>

            <MiniPanel icon={Clock} title="Repository Ghost Detector">
              <p className="text-xs font-black" style={{ color: 'var(--text-primary)' }}>
                {repo.ghost.activityLevel}{repo.ghost.daysSincePush !== null ? ` · last push ${repo.ghost.daysSincePush} day(s) ago` : ''}
              </p>
              <p className="text-[11px] font-medium mt-1" style={{ color: 'var(--text-muted)' }}>Last updated {formatDate(repo.ghost.lastUpdated)}</p>
              {repo.ghost.concerns.length > 0 && <div className="mt-2"><Bullets items={repo.ghost.concerns} tone="bad" /></div>}
              <p className="text-xs italic font-medium mt-2" style={{ color: 'var(--text-secondary)' }}>“{repo.ghost.comment}”</p>
            </MiniPanel>

            <MiniPanel icon={ClipboardCheck} title="Testing Vacation Alert">
              <p className="text-xs font-black" style={{ color: 'var(--text-primary)' }}>{repo.testing.status}{repo.testing.status !== 'Unknown' ? ` · ${repo.testing.testFileCount} test file(s) · CI ${repo.testing.hasCI ? 'yes' : 'no'}` : ''}</p>
              {repo.testing.status !== 'Unknown' && <div className="mt-2"><PxBar value={repo.testing.qualityScore} label="Testing quality" /></div>}
              {repo.testing.missingSignals.length > 0 && <div className="mt-2"><Bullets items={repo.testing.missingSignals} tone="bad" /></div>}
              {repo.testing.recommendations.length > 0 && <div className="mt-2"><Bullets items={repo.testing.recommendations} tone="todo" /></div>}
              <p className="text-xs italic font-medium mt-2" style={{ color: 'var(--text-secondary)' }}>“{repo.testing.verdict}”</p>
            </MiniPanel>

            <MiniPanel icon={Star} title="Star vs Substance">
              <p className="text-xs font-black" style={{ color: 'var(--text-primary)' }}>{repo.starVsSubstance.stars} star(s) · {repo.starVsSubstance.popularityTier} · Score {repo.starVsSubstance.score}/100 ({repo.starVsSubstance.substanceTier})</p>
              <p className="text-xs font-medium mt-2 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{repo.starVsSubstance.observation}</p>
            </MiniPanel>
          </div>

          <div className="rounded-2xl p-4" style={{ background: '#FFF8F0', border: '1px solid #F5D9BE' }}>
            <p className="text-[10px] font-black uppercase tracking-[0.15em] mb-2 flex items-center gap-1.5" style={{ color: '#C05621' }}><Flame className="w-3.5 h-3.5" /> {ROAST_LEVEL_LABELS[roastLevel]}</p>
            <ul className="space-y-1.5">
              {repo.roasts[roastLevel].map((line, i) => <li key={i} className="text-xs leading-relaxed font-medium italic" style={{ color: 'var(--text-secondary)' }}>“{line}”</li>)}
            </ul>
          </div>

          <p className="text-[10px] font-semibold leading-relaxed" style={{ color: 'var(--text-muted)' }}>
            Evidence: {repo.evidence.filesScanned} file(s) scanned · repository tree {repo.evidence.treeAvailable ? 'readable' : 'unavailable'} · confidence {repo.confidence}% · scores are based on public GitHub data only.
          </p>
        </div>
      )}
    </article>
  );
}

function LockOverlay({ unlock }: { unlock: PythosXUnlock }) {
  return (
    <div className="absolute inset-0 z-20 px-3 sm:px-6 pt-6 pb-6 px-lock-overlay" data-testid="pythosx-lock-overlay">
      <div className="sticky top-[14vh] mx-auto max-w-lg rounded-3xl p-6 sm:p-8 text-center animate-scale-in"
        style={{ background: 'rgba(255,253,247,0.94)', border: '1px solid var(--border-accent)', boxShadow: '0 12px 48px rgba(232,168,0,0.22)' }}>
        <div className="w-12 h-12 rounded-2xl mx-auto mb-4 flex items-center justify-center" style={{ background: 'var(--accent-light)', border: '1px solid var(--border-accent)' }}>
          <Lock className="w-6 h-6" style={{ color: 'var(--accent)' }} />
        </div>
        <h4 className="text-xl font-black tracking-tight" style={{ color: 'var(--text-primary)' }}>Want to see what your repositories reveal?</h4>
        <p className="text-sm font-medium mt-2 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>Follow PythosX on GitHub to unlock your personalized repository review.</p>
        <button type="button" onClick={unlock.startUnlock}
          className="mt-5 w-full px-5 py-4 rounded-2xl text-sm sm:text-base font-black uppercase tracking-wider transition-all hover:scale-[1.02] active:scale-95 px-cta"
          style={{ background: 'var(--accent)', color: '#FFFFFF', boxShadow: '0 8px 24px var(--accent-glow)' }}>
          Follow PythosX to view your repo review
        </button>
        <p className="text-[11px] font-medium mt-3" style={{ color: 'var(--text-muted)' }}>
          Opens <a href={PYTHOSX_URL} target="_blank" rel="noopener noreferrer" className="font-bold" style={{ color: 'var(--accent)' }}>github.com/PythosX</a> in a new tab. Come back here and your review unlocks automatically.
        </p>
        <button type="button" onClick={unlock.manualReveal}
          className="mt-3 text-xs font-bold underline underline-offset-4" style={{ color: 'var(--text-secondary)' }}>
          I'm back — Reveal My Repository Review
        </button>
      </div>
    </div>
  );
}

interface Props {
  report: PythosXReport;
  unlock: PythosXUnlock;
  roastLevel: RoastLevel;
  onRoastLevelChange: (level: RoastLevel) => void;
}

export function PythosXRepositoryIntelligence({ report, unlock, roastLevel, onRoastLevelChange }: Props) {
  const intel = report.repositoryIntelligence;
  const repos = intel.repositories;
  const empty = repos.length === 0;
  const locked = !unlock.unlocked && !empty;

  return (
    <section className="space-y-5 animate-slide-up" aria-labelledby="px-repo-title">
      <div className="glass rounded-3xl p-6 sm:p-7 noise">
        <PxSectionHeader
          eyebrow="Analyzed by PythosX"
          title="PythosX Repository Intelligence"
          subtitle="Your GitHub projects, investigated and reviewed by PythosX."
          right={!locked && !empty ? <RoastLevelSwitch level={roastLevel} onChange={onRoastLevelChange} /> : undefined}
        />
        <span id="px-repo-title" className="sr-only">PythosX Repository Intelligence</span>
        {!empty && <p className="text-[11px] font-medium mt-3" style={{ color: 'var(--text-muted)' }}>{intel.selection.note}</p>}
      </div>

      {unlock.welcome && (
        <div role="status" className="rounded-2xl px-5 py-4 flex items-center justify-between gap-3 animate-slide-up" style={{ background: '#F3FAF4', border: '1px solid #D6EBD9', color: '#2E7D32' }}>
          <p className="text-sm font-bold">Welcome back! Your PythosX Repository Review is unlocked.</p>
          <button type="button" onClick={unlock.dismissWelcome} className="text-xs font-black uppercase tracking-wider" aria-label="Dismiss message">Dismiss</button>
        </div>
      )}

      {empty ? (
        <div className="glass rounded-3xl p-8 text-center">
          <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>No public repositories to review yet.</p>
          <p className="text-xs font-medium mt-1" style={{ color: 'var(--text-muted)' }}>{intel.message || 'PythosX only reviews real public repositories — nothing is made up.'}</p>
        </div>
      ) : (
        <div className="relative">
          <div className={locked ? 'px-locked-content' : 'px-unlocked-content'} aria-hidden={locked || undefined} inert={locked}>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {repos.map((repo, i) => <RepoReviewCard key={repo.id} repo={repo} roastLevel={roastLevel} defaultOpen={!locked && repos.length === 1 && i === 0} />)}
            </div>

            <div className="mt-5 rounded-3xl p-6 sm:p-7 noise" style={{ background: 'var(--accent-light)', border: '1px solid var(--border-accent)' }}>
              <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
                <p className="text-xs font-black uppercase tracking-[0.15em] flex items-center gap-2" style={{ color: '#8B6914' }}><Flame className="w-4 h-4" /> PythosX Funny Verdict</p>
                <PythosXBadge>{ROAST_LEVEL_LABELS[roastLevel]}</PythosXBadge>
              </div>
              <p className="text-base sm:text-lg font-black leading-snug" style={{ color: 'var(--text-primary)' }}>“{report.funnyVerdict[roastLevel]}”</p>
              <p className="text-[10px] font-semibold mt-3" style={{ color: 'var(--text-muted)' }}>Based on real findings from {repos.length} reviewed repositor{repos.length === 1 ? 'y' : 'ies'}{report.aiEnhanced ? ' · wording enhanced by AI' : ''}.</p>
            </div>
          </div>
          {locked && <LockOverlay unlock={unlock} />}
        </div>
      )}
    </section>
  );
}
