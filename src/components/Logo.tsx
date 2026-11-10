interface LogoProps {
  size?: 'sm' | 'md' | 'lg';
  showCompany?: boolean;
  company?: string;
  inverse?: boolean;
}

export function Logo({ size = 'md', showCompany = true, company = 'MAGVIEW', inverse = false }: LogoProps) {
  const markSize = size === 'lg' ? 52 : size === 'sm' ? 30 : 38;
  return (
    <span className={`logo logo-${size}${inverse ? ' logo-inverse' : ''}`}>
      <svg width={markSize} height={markSize} viewBox="0 0 64 64" aria-hidden="true" className="logo-mark">
        <rect width="64" height="64" rx="16" fill={inverse ? '#F4F1E8' : '#1D4A3A'} />
        <rect x="15" y="27" width="4.5" height="18" rx="2.25" fill={inverse ? '#1D4A3A' : '#E9F0E9'} />
        <rect x="24" y="19" width="4.5" height="26" rx="2.25" fill={inverse ? '#1D4A3A' : '#E9F0E9'} />
        <rect x="33" y="24" width="4.5" height="21" rx="2.25" fill={inverse ? '#1D4A3A' : '#E9F0E9'} />
        <rect x="42" y="15" width="4.5" height="30" rx="2.25" fill={inverse ? '#1D4A3A' : '#E9F0E9'} />
        <circle cx="49" cy="48" r="5" fill={inverse ? '#B7791F' : '#D99A2B'} />
      </svg>
      <span className="logo-text">
        <span className="logo-word">uren</span>
        {showCompany && <span className="logo-company">{company}</span>}
      </span>
    </span>
  );
}
