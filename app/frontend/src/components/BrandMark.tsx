type BrandMarkProps = {
  size?: number;
  className?: string;
};

export function BrandMark({ size = 24, className = '' }: BrandMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <rect x="4" y="14" width="11" height="11" rx="2.5" fill="currentColor" opacity="0.35" />
      <rect x="11" y="9" width="11" height="11" rx="2.5" fill="currentColor" opacity="0.6" />
      <rect x="18" y="4" width="11" height="11" rx="2.5" fill="currentColor" />
    </svg>
  );
}
