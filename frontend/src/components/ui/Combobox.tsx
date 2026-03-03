import { useState, useRef, useEffect } from 'react';
import { ChevronDown, X } from 'lucide-react';
import { Button } from './Button';

interface ComboboxOption {
 value: string;
 label: string;
 subtitle?: string;
 searchText?: string;
}

interface ComboboxProps {
 options: ComboboxOption[];
 value: string;
 onChange: (value: string) => void;
 placeholder?: string;
 searchPlaceholder?: string;
 noResultsText?: string;
 className?: string;
 disabled?: boolean;
 required?: boolean;
 onClear?: () => void;
}

export const Combobox = ({
 options,
 value,
 onChange,
 placeholder ="Выберите опцию",
 searchPlaceholder ="Поиск...",
 className ="",
 disabled = false,
 required = false,
 onClear,
 noResultsText,
}: ComboboxProps) => {
 const [isOpen, setIsOpen] = useState(false);
 const [searchTerm, setSearchTerm] = useState('');
 const [highlightedIndex, setHighlightedIndex] = useState(-1);
 const inputRef = useRef<HTMLInputElement>(null);
 const listRef = useRef<HTMLUListElement>(null);
 const focusTimeoutRef = useRef<NodeJS.Timeout | null>(null);

 // Cleanup timeout on unmount
 useEffect(() => {
 return () => {
 if (focusTimeoutRef.current) {
 clearTimeout(focusTimeoutRef.current);
 }
 };
 }, []);

 // Фильтруем опции по поисковому запросу
 const filteredOptions = options.filter(option => {
 const query = searchTerm.toLowerCase();
 const labelMatch = option.label.toLowerCase().includes(query);
 const searchTextMatch = option.searchText?.toLowerCase().includes(query);
 const subtitleMatch = option.subtitle?.toLowerCase().includes(query);
 return labelMatch || searchTextMatch || subtitleMatch;
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
 if (focusTimeoutRef.current) {
 clearTimeout(focusTimeoutRef.current);
 }
 focusTimeoutRef.current = setTimeout(() => {
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
 if (focusTimeoutRef.current) {
 clearTimeout(focusTimeoutRef.current);
 }
 focusTimeoutRef.current = setTimeout(() => {
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
 onChange(option.value);
 setIsOpen(false);
 setSearchTerm('');
 setHighlightedIndex(-1);
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
 w-full h-11 px-3.5 border rounded-xl bg-elevated text-content focus:outline-none transition-all duration-200 flex items-center justify-between cursor-pointer
 ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
 ${isOpen ? 'border-accent-base ring-2 ring-[var(--color-ring)] shadow-sm' : 'border-[var(--color-border)] hover:border-[var(--color-border)]'}
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
 className="w-full bg-transparent border-none outline-none text-sm text-content placeholder-content-tertiary"
 placeholder={searchPlaceholder}
 value={searchTerm}
 onChange={(e) => setSearchTerm(e.target.value)}
 onKeyDown={handleSearchKeyDown}
 onClick={handleSearchClick}
 autoFocus
 />
 ) : (
 <span className={`text-sm ${selectedOption ? 'text-content' : 'text-content-tertiary'}`}>
 {selectedOption ? selectedOption.label : placeholder}
 </span>
 )}
 </div>
 
 <div className="flex items-center space-x-1 ml-2">
 {selectedOption && onClear && !disabled && (
 <Button
 type="button"
 variant="secondary"
 size="sm"
 onClick={handleClear}
 className="p-1 h-auto hover:bg-surface-alt"
 >
 <X className="w-3 h-3" />
 </Button>
 )}
 <ChevronDown 
 className={`w-4 h-4 text-content-tertiary transition-transform ${isOpen ? 'rotate-180' : ''}`} 
 />
 </div>
 </div>

 {/* Dropdown */}
 {isOpen && (
 <div
 className="absolute z-50 w-full mt-1.5 bg-elevated border border-[var(--color-border)] rounded-xl shadow-lg shadow-[var(--color-shadow)] animate-dropdown-in overflow-hidden"
 >
 <ul ref={listRef} role="listbox" className="py-1 max-h-60 overflow-auto scrollbar-thin">
 {filteredOptions.length === 0 ? (
 <li className="px-3.5 py-4 text-sm text-center text-content-tertiary">
 {noResultsText || 'Nothing found'}
 </li>
 ) : (
 filteredOptions.map((option, index) => (
 <li
 key={option.value}
 className={`
 px-3.5 py-2.5 text-sm cursor-pointer transition-colors
 ${index === highlightedIndex ? 'bg-[var(--color-accent-light)]' : 'hover:bg-surface-alt'}
 ${option.value === value ? 'bg-[var(--color-accent-light)] font-medium' : ''}
 `}
 onClick={() => selectOption(option)}
 onMouseDown={(e) => {
 e.preventDefault();
 selectOption(option);
 }}
 onMouseEnter={() => setHighlightedIndex(index)}
 role="option"
 aria-selected={option.value === value}
 >
 <span className="text-content">{option.label}</span>
 {option.subtitle && (
 <span className="block text-xs text-content-tertiary mt-0.5">{option.subtitle}</span>
 )}
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
