import type { SVGProps } from 'react';

/** In-theme sun/dusk transition spinner using violet and gold. */
export function SunDuskSpinner({ className, ...props }: SVGProps<SVGSVGElement>) {
  const id = `sun-dusk-${Math.random().toString(36).slice(2)}`;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      className={`animate-spin ${className ?? ''}`}
      aria-hidden
      {...props}
    >
      <defs>
        <clipPath id={id}>
          <path d="M12 12L12 0A12 12 0 0 1 12 24z" />
        </clipPath>
      </defs>
      <g stroke="#B45309" strokeWidth="1.5" strokeLinecap="round">
        <circle cx="12" cy="12" r="5" fill="none" strokeDasharray="8 16" strokeDashoffset="0" />
        <path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.66 17.66l1.42 1.42M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.66 6.34l1.42-1.42" opacity="0.8" />
      </g>
      <circle
        cx="12"
        cy="12"
        r="10"
        fill="none"
        stroke="#1E8A5E"
        strokeWidth="2"
        strokeDasharray="31.4 31.4"
        strokeDashoffset="15.7"
        clipPath={`url(#${id})`}
      />
    </svg>
  );
}
