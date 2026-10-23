export function LogoMark({ className = 'size-8' }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      <rect width="64" height="64" rx="14" fill="#ce5b25" />
      <path d="M14 20l8 26 10-18 10 18 8-26" fill="none" stroke="#f9f6f1" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function Wordmark({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 font-semibold tracking-tight ${className}`}>
      <LogoMark />
      <span className="text-xl">WorkIn</span>
    </span>
  )
}
