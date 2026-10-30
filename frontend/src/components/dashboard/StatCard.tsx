import { type ReactNode } from 'react';
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
 /** Optional note under the description, e.g. profit completeness. */
 footer?: ReactNode;
}

export const StatCard = ({ name, value, icon: Icon, color, bgColor, href, description, footer }: StatCardProps) => {
 const content = (
 <Card className={href ? 'hover:shadow-lg transition-shadow duration-200 cursor-pointer' : ''}>
 <div className="flex items-center">
 <div className={`p-3 rounded-lg ${bgColor}`}>
 <Icon className={`h-6 w-6 ${color}`} />
 </div>
 <div className="ml-4">
 <p className="text-sm font-medium text-content-secondary">{name}</p>
 <p className="text-2xl font-bold text-content">{value}</p>
 {description && (
 <p className="text-xs text-content-tertiary mt-0.5">{description}</p>
 )}
 {footer && <div className="mt-1">{footer}</div>}
 </div>
 </div>
 </Card>
 );

 if (href) {
 return <Link to={href}>{content}</Link>;
 }
 return content;
};
