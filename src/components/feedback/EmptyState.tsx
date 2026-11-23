import { memo } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Inbox } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: { to?: string; onClick?: () => void; label: string };
  /** Segunda acción, menos destacada (p. ej. «Cerrar sesión» junto a «Reintentar»). */
  secondaryAction?: { onClick: () => void; label: string };
}

function EmptyStateBase({ icon: Icon = Inbox, title, description, action, secondaryAction }: EmptyStateProps) {
  return (
    <Card className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
      <Icon className="size-8 text-text-faint" />
      <p>{title}</p>
      {description && <p className="text-sm text-text-muted">{description}</p>}
      {action && (action.to
        ? <Button asChild><Link to={action.to}>{action.label}</Link></Button>
        : <Button onClick={action.onClick}>{action.label}</Button>)}
      {secondaryAction && <Button variant="ghost" size="sm" onClick={secondaryAction.onClick}>{secondaryAction.label}</Button>}
    </Card>
  );
}

export const EmptyState = memo(EmptyStateBase);
