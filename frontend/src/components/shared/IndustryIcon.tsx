'use client';

import {
  Home,
  Dumbbell,
  UtensilsCrossed,
  ShoppingCart,
  Monitor,
  GraduationCap,
  Heart,
  Scale,
  DollarSign,
  Plane,
  Car,
  Sparkles,
  Hammer,
  Dog,
  PartyPopper,
  Target,
  HeartHandshake,
  Lightbulb,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface IndustryIconProps {
  /** Icon name string matching a lucide-react component. */
  name: string;
  /** Icon size in pixels. */
  size?: number;
  /** Additional CSS classes. */
  className?: string;
}

/** Map of icon name strings to lucide-react components. */
const iconMap: Record<string, LucideIcon> = {
  Home,
  Dumbbell,
  UtensilsCrossed,
  ShoppingCart,
  Monitor,
  GraduationCap,
  Heart,
  Scale,
  DollarSign,
  Plane,
  Car,
  Sparkles,
  Hammer,
  Dog,
  PawPrint: Dog,
  PartyPopper,
  Target,
  HeartHandshake,
  Lightbulb,
};

/** Renders a lucide-react icon by name string with a Lightbulb fallback. */
export default function IndustryIcon({ name, size = 20, className = '' }: IndustryIconProps) {
  const IconComponent = iconMap[name] || iconMap.Lightbulb;

  return <IconComponent size={size} className={className} />;
}
