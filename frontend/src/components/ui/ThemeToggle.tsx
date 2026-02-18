import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../../contexts/useTheme';
import { clsx } from 'clsx';

interface ThemeToggleProps {
  compact?: boolean;
}

export const ThemeToggle = ({ compact = false }: ThemeToggleProps) => {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      className={clsx(
        'relative inline-flex items-center rounded-full transition-colors duration-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900',
        compact ? 'h-7 w-12' : 'h-9 w-16',
        theme === 'dark' ? 'bg-blue-600' : 'bg-gray-300'
      )}
      aria-label="Toggle theme"
    >
      <span
        className={clsx(
          'inline-flex transform items-center justify-center rounded-full bg-white transition-transform duration-300 shadow-lg',
          compact ? 'h-5 w-5' : 'h-7 w-7',
          theme === 'dark'
            ? compact ? 'translate-x-6' : 'translate-x-8'
            : 'translate-x-1'
        )}
      >
        {theme === 'dark' ? (
          <Moon className={compact ? 'h-3 w-3 text-blue-600' : 'h-4 w-4 text-blue-600'} />
        ) : (
          <Sun className={compact ? 'h-3 w-3 text-yellow-500' : 'h-4 w-4 text-yellow-500'} />
        )}
      </span>
    </button>
  );
};

