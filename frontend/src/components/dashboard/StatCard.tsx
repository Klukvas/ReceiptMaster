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
 <Card className={href ? '@container hover:shadow-lg transition-shadow duration-200 cursor-pointer' : ''}>
 {/* Narrow linked counters drop the icon by their own width; the others stack below 360 px, where the label no longer fits beside it. */}
 <div className={href ? 'flex items-center' : 'flex flex-col items-start min-[360px]:flex-row min-[360px]:items-center'}>
 <div className={`shrink-0 p-3 ${href ? 'hidden @[10rem]:block' : ''} rounded-lg ${bgColor}`}>
 <Icon className={`h-6 w-6 ${color}`} />
 </div>
 <div className={`min-w-0 ${href ? '@[10rem]:ml-4' : 'mt-3 min-[360px]:mt-0 min-[360px]:ml-4'}`}>
 <p className="break-words text-sm font-medium text-content-secondary">{name}</p>
 <p className="text-2xl font-bold text-content tabular-nums">{value}</p>
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
