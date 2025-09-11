import { useState, useRef, useEffect } from 'react';
import { ChevronDown, X } from 'lucide-react';
import { Button } from './Button';

interface ComboboxOption {
  value: string;
  label: string;
  searchText?: string; // Дополнительный текст для поиска
}

interface ComboboxProps {
  options: ComboboxOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  className?: string;
  disabled?: boolean;
  required?: boolean;
  onClear?: () => void;
}

export const Combobox = ({
  options,
  value,
  onChange,
  placeholder = "Выберите опцию",
  searchPlaceholder = "Поиск...",
  className = "",
  disabled = false,
  required = false,
  onClear,
}: ComboboxProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // Фильтруем опции по поисковому запросу
  const filteredOptions = options.filter(option => {
    const searchText = searchTerm.toLowerCase();
    const labelMatch = option.label.toLowerCase().includes(searchText);
    const searchTextMatch = option.searchText?.toLowerCase().includes(searchText);
    return labelMatch || searchTextMatch;
  });

  // Находим выбранную опцию
  const selectedOption = options.find(option => option.value === value);

  // Обработка открытия/закрытия
  const toggleOpen = () => {
    if (!disabled) {
      setIsOpen(!isOpen);
      if (!isOpen) {
        setSearchTerm('');
        setHighlightedIndex(-1);
        // Небольшая задержка для корректного рендеринга инпута
        setTimeout(() => {
          const searchInput = inputRef.current?.querySelector('input');
          if (searchInput) {
            searchInput.focus();
            searchInput.select(); // Выделяем весь текст для удобства
          }
        }, 10);
      }
    }
  };

  // Обработка клика на инпут поиска
  const handleSearchClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isOpen) {
      setIsOpen(true);
      setSearchTerm('');
      setHighlightedIndex(-1);
      setTimeout(() => {
        const searchInput = inputRef.current?.querySelector('input');
        if (searchInput) {
          searchInput.focus();
          searchInput.select();
        }
      }, 10);
    }
  };

  // Обработка выбора опции
  const selectOption = (option: ComboboxOption) => {
    console.log('Selecting option:', option);
    onChange(option.value);
    setIsOpen(false);
    setSearchTerm('');
    setHighlightedIndex(-1);
  };

  // Обработка клика на элемент списка
  const handleOptionClick = (option: ComboboxOption) => {
    console.log('Option clicked:', option);
    selectOption(option);
  };

  // Обработка очистки
  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange('');
    onClear?.();
  };

  // Обработка клавиатуры для основного контейнера
  const handleContainerKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault();
        toggleOpen();
      }
      return;
    }

    // Если фокус на инпуте поиска, не обрабатываем здесь
    if (e.target === inputRef.current?.querySelector('input')) {
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex(prev => 
          prev < filteredOptions.length - 1 ? prev + 1 : 0
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex(prev => 
          prev > 0 ? prev - 1 : filteredOptions.length - 1
        );
        break;
      case 'Enter':
        e.preventDefault();
        if (highlightedIndex >= 0 && filteredOptions[highlightedIndex]) {
          selectOption(filteredOptions[highlightedIndex]);
        }
        break;
      case 'Escape':
        setIsOpen(false);
        setSearchTerm('');
        setHighlightedIndex(-1);
        break;
    }
  };

  // Обработка клавиатуры для инпута поиска
  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex(prev => 
          prev < filteredOptions.length - 1 ? prev + 1 : 0
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex(prev => 
          prev > 0 ? prev - 1 : filteredOptions.length - 1
        );
        break;
      case 'Enter':
        e.preventDefault();
        if (highlightedIndex >= 0 && filteredOptions[highlightedIndex]) {
          selectOption(filteredOptions[highlightedIndex]);
        } else if (filteredOptions.length === 1) {
          // Если только один результат, выбираем его
          selectOption(filteredOptions[0]);
        }
        break;
      case 'Escape':
        setIsOpen(false);
        setSearchTerm('');
        setHighlightedIndex(-1);
        break;
    }
  };

  // Прокрутка к выделенному элементу
  useEffect(() => {
    if (highlightedIndex >= 0 && listRef.current) {
      const highlightedElement = listRef.current.children[highlightedIndex] as HTMLElement;
      if (highlightedElement) {
        highlightedElement.scrollIntoView({
          block: 'nearest',
          behavior: 'smooth'
        });
      }
    }
  }, [highlightedIndex]);

  // Закрытие при клике вне компонента
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (inputRef.current && !inputRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearchTerm('');
        setHighlightedIndex(-1);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  return (
    <div className={`relative ${className}`}>
      {/* Основной инпут */}
      <div
        ref={inputRef}
        className={`
          input flex items-center justify-between cursor-pointer
          ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
          ${isOpen ? 'ring-2 ring-blue-500 border-blue-500' : ''}
        `}
        onClick={toggleOpen}
        onKeyDown={handleContainerKeyDown}
        tabIndex={disabled ? -1 : 0}
        role="combobox"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
      >
        <div className="flex-1 min-w-0">
          {isOpen ? (
            <input
              type="text"
              className="w-full bg-transparent border-none outline-none text-sm"
              placeholder={searchPlaceholder}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              onClick={handleSearchClick}
              autoFocus
            />
          ) : (
            <span className={`text-sm ${selectedOption ? 'text-gray-900' : 'text-gray-500'}`}>
              {selectedOption ? selectedOption.label : placeholder}
            </span>
          )}
        </div>
        
        <div className="flex items-center space-x-1 ml-2">
          {selectedOption && onClear && !disabled && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleClear}
              className="p-1 h-auto hover:bg-gray-100"
            >
              <X className="w-3 h-3" />
            </Button>
          )}
          <ChevronDown 
            className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} 
          />
        </div>
      </div>

      {/* Выпадающий список */}
      {isOpen && (
        <div 
          className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-auto"
        >
          <ul ref={listRef} role="listbox" className="py-1">
            {filteredOptions.length === 0 ? (
              <li className="px-3 py-2 text-sm text-gray-500">
                Ничего не найдено
              </li>
            ) : (
              filteredOptions.map((option, index) => (
                <li
                  key={option.value}
                  className={`
                    px-3 py-2 text-sm cursor-pointer transition-colors
                    ${index === highlightedIndex ? 'bg-blue-50 text-blue-900' : 'hover:bg-gray-50'}
                    ${option.value === value ? 'bg-blue-100 text-blue-900 font-medium' : ''}
                  `}
                  onClick={() => {
                    console.log('Direct click on option:', option);
                    selectOption(option);
                  }}
                  onMouseDown={(e) => {
                    console.log('Mouse down on option:', option);
                    e.preventDefault();
                    selectOption(option);
                  }}
                  onMouseEnter={() => setHighlightedIndex(index)}
                  role="option"
                  aria-selected={option.value === value}
                >
                  {option.label}
                </li>
              ))
            )}
          </ul>
        </div>
      )}

      {/* Скрытый инпут для валидации формы */}
      {required && (
        <input
          type="text"
          value={value}
          onChange={() => {}}
          className="sr-only"
          tabIndex={-1}
          required
        />
      )}
    </div>
  );
};
