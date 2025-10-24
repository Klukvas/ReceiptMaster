import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../../contexts/useTheme';
import { clsx } from 'clsx';

export const ThemeToggle = () => {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      className={clsx(
        'relative inline-flex h-9 w-16 items-center rounded-full transition-colors duration-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900',
        theme === 'dark' ? 'bg-blue-600' : 'bg-gray-300'
      )}
      aria-label="Toggle theme"
    >
      <span
        className={clsx(
          'inline-flex h-7 w-7 transform items-center justify-center rounded-full bg-white transition-transform duration-300 shadow-lg',
          theme === 'dark' ? 'translate-x-8' : 'translate-x-1'
        )}
      >
        {theme === 'dark' ? (
          <Moon className="h-4 w-4 text-blue-600" />
        ) : (
          <Sun className="h-4 w-4 text-yellow-500" />
        )}
      </span>
    </button>
  );
};

