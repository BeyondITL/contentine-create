import type { AvatarPreset } from '@/types';

/** Avatar preset names — matches the 30 SVGs in /public/avatars/. */
export const AVATAR_NAMES = [
  'Theo', 'Sofia', 'Marcus', 'Luna', 'Jayden', 'Aria', 'Ethan', 'Maya',
  'Noah', 'Zoe', 'Alex', 'Mia', 'Owen', 'Lily', 'Ryan', 'Emma',
  'Kai', 'Ava', 'Leo', 'Chloe', 'Diego', 'Nora', 'Sam', 'Ella',
  'Jack', 'Ivy', 'Adam', 'Sara', 'Finn', 'Ruby',
];

/** Gender mapping for each avatar name. */
export const AVATAR_GENDERS: Record<string, string> = {
  Theo: 'male', Sofia: 'female', Marcus: 'male', Luna: 'female', Jayden: 'male',
  Aria: 'female', Ethan: 'male', Maya: 'female', Noah: 'male', Zoe: 'female',
  Alex: 'male', Mia: 'female', Owen: 'male', Lily: 'female', Ryan: 'male',
  Emma: 'female', Kai: 'male', Ava: 'female', Leo: 'male', Chloe: 'female',
  Diego: 'male', Nora: 'female', Sam: 'male', Ella: 'female', Jack: 'male',
  Ivy: 'female', Adam: 'male', Sara: 'female', Finn: 'male', Ruby: 'female',
};

/** Style cycle for avatar presets. */
const STYLES = ['professional', 'casual', 'creative', 'character', 'professional'];

/** 30 local avatar presets — used as fallback when backend is unavailable. */
export const LOCAL_AVATAR_PRESETS: AvatarPreset[] = AVATAR_NAMES.map((name, i) => ({
  id: i + 1,
  name,
  description: `${AVATAR_GENDERS[name]} AI avatar preset`,
  gender: AVATAR_GENDERS[name] || null,
  age_range: i % 3 === 0 ? '25-35' : i % 3 === 1 ? '35-45' : '20-30',
  ethnicity: null,
  style: STYLES[i % STYLES.length],
  photo_path: `/avatars/${name.toLowerCase()}.svg`,
  is_active: true,
  sort_order: i,
}));
