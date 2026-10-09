'use client';

/** Animated 3D gradient logo mark for Contentine Create. */
export default function ContentineLogo({ size = 30 }: { size?: number }) {
  // Unique IDs to prevent SVG gradient collisions when multiple instances render
  const id = 'cl';

  return (
    <div
      className="logo-mark-wrapper relative shrink-0"
      style={{ width: size, height: size * 0.737 }}
    >
      {/* Subtle glow behind the logo */}
      <div
        className="absolute inset-0 rounded-full opacity-40 blur-md animate-[logoPulseGlow_6s_ease-in-out_infinite]"
        style={{
          background: 'radial-gradient(circle, rgba(0,195,255,0.4) 0%, rgba(243,166,255,0.2) 50%, transparent 70%)',
        }}
      />

      <svg
        viewBox="0 0 512 377.32"
        xmlns="http://www.w3.org/2000/svg"
        className="relative z-[1] w-full h-full drop-shadow-[0_1px_4px_rgba(0,195,255,0.3)] hover:drop-shadow-[0_2px_8px_rgba(0,195,255,0.5)] transition-[filter] duration-300 animate-[logoFloat_6s_ease-in-out_infinite]"
        style={{ transformStyle: 'preserve-3d' }}
      >
        <defs>
          {/* Main animated gradient — cycles through brand colors */}
          <linearGradient id={`${id}-main`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%">
              <animate attributeName="stop-color" values="#00C3FF;#35C838;#F3A6FF;#00C3FF" dur="8s" repeatCount="indefinite" />
            </stop>
            <stop offset="50%">
              <animate attributeName="stop-color" values="#F3A6FF;#00C3FF;#35C838;#F3A6FF" dur="8s" repeatCount="indefinite" />
            </stop>
            <stop offset="100%">
              <animate attributeName="stop-color" values="#35C838;#F3A6FF;#00C3FF;#35C838" dur="8s" repeatCount="indefinite" />
            </stop>
          </linearGradient>

          {/* Radial gradient for the eye pupil — separate cycle for visual depth */}
          <radialGradient id={`${id}-eye`} cx="50%" cy="50%" r="60%">
            <stop offset="0%">
              <animate attributeName="stop-color" values="#FFFFFF;#F3A6FF;#66DAFF;#FFFFFF" dur="6s" repeatCount="indefinite" />
            </stop>
            <stop offset="40%">
              <animate attributeName="stop-color" values="#00C3FF;#35C838;#F3A6FF;#00C3FF" dur="6s" repeatCount="indefinite" />
            </stop>
            <stop offset="100%">
              <animate attributeName="stop-color" values="#0088B0;#1A7A1C;#A060C0;#0088B0" dur="6s" repeatCount="indefinite" />
            </stop>
          </radialGradient>

          {/* Top-left highlight for 3D depth illusion */}
          <linearGradient id={`${id}-hi`} x1="0%" y1="0%" x2="50%" y2="100%">
            <stop offset="0%" stopColor="white" stopOpacity="0.22" />
            <stop offset="100%" stopColor="white" stopOpacity="0" />
          </linearGradient>

          {/* Specular bevel filter for 3D emboss */}
          <filter id={`${id}-bevel`}>
            <feGaussianBlur in="SourceAlpha" stdDeviation="2" result="blur" />
            <feSpecularLighting in="blur" surfaceScale="5" specularConstant="0.75" specularExponent="20" result="specOut">
              <fePointLight x="150" y="50" z="200" />
            </feSpecularLighting>
            <feComposite in="specOut" in2="SourceAlpha" operator="in" result="specOut" />
            <feComposite in="SourceGraphic" in2="specOut" operator="arithmetic" k1="0" k2="1" k3="1" k4="0" />
          </filter>
        </defs>

        {/* Shadow layer — offset for 3D lift */}
        <g transform="translate(4, 6)" opacity="0.15">
          <path fill="#000" d="M20.81,326.77c0.02,16.54,14.46,29.52,30.18,29.52l430.26,0.13l0.58-56.02c6.41-3.49,14.92-3.69,21.1,0.18l0.2,64.67c0.02,6.11-5.13,12.08-11.91,12.07L48.07,376.8c-26.54-0.03-48.09-23.66-48.07-49L0.19,47.16c0.02-26,24.5-47.03,48.88-47.05L158.48,0l329.5,0.13c8.06,0,15.14,1.57,15.09,11.39l-0.33,64.77c-4.25,4.96-15.11,5.46-20.82,0.94l-0.6-56.13L48.96,21.19c-16.99,0-28.44,15.44-28.42,30.71L20.81,326.77z" />
          <path fill="#000" d="M507.65,196.06c-21.83,22.67-44.81,41.68-72.66,54.96c-49.04,23.38-103.15,19.52-149.5-8.46c-20.76-12.53-37.69-27.71-56.49-46.06l-122.44,69.42c-1.97,1.12-6.53,1.08-8.22,0.15s-3.83-5.08-3.83-7.38l-0.08-139.07c0-2.98,2.54-7.76,4.83-8.32c2.35-0.57,7.47,0.22,10.06,1.67l119.62,67.01c19.13-18.41,37.74-35.45,60.4-48.17c51.1-28.68,110.66-28.17,160.98,1.88c22.18,13.24,40.66,29.6,58.45,48.48c1.21,1.28,2.99,4.72,3.19,6.33C512.22,190.44,509.88,193.75,507.65,196.06z" />
          <circle cx="368.22" cy="188.61" r="39.85" />
        </g>

        {/* Main body with bevel filter */}
        <g filter={`url(#${id}-bevel)`}>
          <path fill={`url(#${id}-main)`} d="M20.81,326.77c0.02,16.54,14.46,29.52,30.18,29.52l430.26,0.13l0.58-56.02c6.41-3.49,14.92-3.69,21.1,0.18l0.2,64.67c0.02,6.11-5.13,12.08-11.91,12.07L48.07,376.8c-26.54-0.03-48.09-23.66-48.07-49L0.19,47.16c0.02-26,24.5-47.03,48.88-47.05L158.48,0l329.5,0.13c8.06,0,15.14,1.57,15.09,11.39l-0.33,64.77c-4.25,4.96-15.11,5.46-20.82,0.94l-0.6-56.13L48.96,21.19c-16.99,0-28.44,15.44-28.42,30.71L20.81,326.77z" />
          <path fill={`url(#${id}-main)`} d="M507.65,196.06c-21.83,22.67-44.81,41.68-72.66,54.96c-49.04,23.38-103.15,19.52-149.5-8.46c-20.76-12.53-37.69-27.71-56.49-46.06l-122.44,69.42c-1.97,1.12-6.53,1.08-8.22,0.15s-3.83-5.08-3.83-7.38l-0.08-139.07c0-2.98,2.54-7.76,4.83-8.32c2.35-0.57,7.47,0.22,10.06,1.67l119.62,67.01c19.13-18.41,37.74-35.45,60.4-48.17c51.1-28.68,110.66-28.17,160.98,1.88c22.18,13.24,40.66,29.6,58.45,48.48c1.21,1.28,2.99,4.72,3.19,6.33C512.22,190.44,509.88,193.75,507.65,196.06z M422.88,236.61c25.94-11.64,47.26-28.01,65.87-48.24c-18.45-19.93-38.54-34.7-61.54-46.5c-37.46-17.45-78.54-17.55-116.27-0.55c-23.48,11.87-44.19,26.76-63.16,46.84c19.05,20.68,41.08,37.13,66.6,48.7C349.49,252.17,386.87,252.21,422.88,236.61z" />
        </g>

        {/* Eye pupil — radial gradient + breathing pulse */}
        <circle fill={`url(#${id}-eye)`} cx="368.22" cy="188.61" r="39.85">
          <animate attributeName="r" values="39.85;36;39.85" dur="4s" repeatCount="indefinite" />
        </circle>

        {/* Expanding ring from pupil — sonar effect */}
        <circle fill="none" stroke={`url(#${id}-main)`} cx="368.22" cy="188.61" r="39.85" opacity="0">
          <animate attributeName="r" values="39.85;70" dur="3s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.3;0" dur="3s" repeatCount="indefinite" />
          <animate attributeName="stroke-width" values="2;0.3" dur="3s" repeatCount="indefinite" />
        </circle>

        {/* Highlight overlay for 3D depth */}
        <path fill={`url(#${id}-hi)`} opacity="0.25" d="M20.81,326.77c0.02,16.54,14.46,29.52,30.18,29.52l430.26,0.13l0.58-56.02c6.41-3.49,14.92-3.69,21.1,0.18l0.2,64.67c0.02,6.11-5.13,12.08-11.91,12.07L48.07,376.8c-26.54-0.03-48.09-23.66-48.07-49L0.19,47.16c0.02-26,24.5-47.03,48.88-47.05L158.48,0l329.5,0.13c8.06,0,15.14,1.57,15.09,11.39l-0.33,64.77c-4.25,4.96-15.11,5.46-20.82,0.94l-0.6-56.13L48.96,21.19c-16.99,0-28.44,15.44-28.42,30.71L20.81,326.77z" />
      </svg>
    </div>
  );
}
