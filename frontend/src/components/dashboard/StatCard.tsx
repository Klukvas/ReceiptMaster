import { type LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Card } from '../ui/Card';

interface StatCardProps {
  name: string;
  value: string | number;
  icon: LucideIcon;
  color: string;
  bgColor: string;
  href?: string;
  description?: string;
}

export const StatCard = ({ name, value, icon: Icon, color, bgColor, href, description }: StatCardProps) => {
  const content = (
    <Card className={href ? 'hover:shadow-lg transition-shadow duration-200 cursor-pointer' : ''}>
      <div className="flex items-center">
        <div className={`p-3 rounded-lg ${bgColor}`}>
          <Icon className={`h-6 w-6 ${color}`} />
        </div>
        <div className="ml-4">
          <p className="text-sm font-medium text-gray-600 dark:text-gray-400">{name}</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
          {description && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{description}</p>
          )}
        </div>
      </div>
    </Card>
  );

  if (href) {
    return <Link to={href}>{content}</Link>;
  }
  return content;
};
