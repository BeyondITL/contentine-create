'use client';

interface AvatarProps {
  src?: string;
  alt?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  fallback?: string;
  className?: string;
}

const sizeMap = {
  sm: 'w-6 h-6 text-[9px]',
  md: 'w-8 h-8 text-[10px]',
  lg: 'w-10 h-10 text-[12px]',
  xl: 'w-12 h-12 text-[13px]',
};

/** Circular avatar with image or initial fallback. */
export default function Avatar({ src, alt = '', size = 'md', fallback, className = '' }: AvatarProps) {
  const initials = fallback || alt?.charAt(0)?.toUpperCase() || 'U';

  if (src) {
    return (
      <img
        src={src}
        alt={alt}
        className={`${sizeMap[size]} rounded-full object-cover shrink-0 ${className}`}
      />
    );
  }

  return (
    <div
      className={`${sizeMap[size]} rounded-full bg-gradient-to-br from-primary via-accent to-secondary flex items-center justify-center text-white font-bold shrink-0 ${className}`}
    >
      {initials}
    </div>
  );
}
