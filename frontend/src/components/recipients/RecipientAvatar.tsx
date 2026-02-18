import { MessageCircle } from 'lucide-react';

interface RecipientAvatarProps {
  name: string;
  telegramLinked?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

const COLORS = [
  'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
  'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300',
  'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300',
  'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300',
];

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

function getColorIndex(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash) % COLORS.length;
}

const SIZES = {
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-14 w-14 text-lg',
};

const BADGE_SIZES = {
  sm: 'h-3.5 w-3.5 -bottom-0.5 -right-0.5',
  md: 'h-4 w-4 -bottom-0.5 -right-0.5',
  lg: 'h-5 w-5 -bottom-0.5 -right-0.5',
};

export const RecipientAvatar = ({ name, telegramLinked, size = 'md' }: RecipientAvatarProps) => {
  const initials = getInitials(name);
  const colorClass = COLORS[getColorIndex(name)];

  return (
    <div className="relative inline-flex shrink-0">
      <div
        className={`${SIZES[size]} ${colorClass} rounded-full flex items-center justify-center font-semibold select-none`}
      >
        {initials}
      </div>
      {telegramLinked && (
        <div
          className={`absolute ${BADGE_SIZES[size]} bg-sky-500 rounded-full flex items-center justify-center ring-2 ring-white dark:ring-gray-800`}
        >
          <MessageCircle className="h-2.5 w-2.5 text-white fill-white" />
        </div>
      )}
    </div>
  );
};
