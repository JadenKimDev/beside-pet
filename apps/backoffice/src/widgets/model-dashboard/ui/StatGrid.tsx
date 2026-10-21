'use client';

import { useState } from 'react';
import { cn } from '@/shared/lib';
import { Button, Card } from '@/shared/ui';
import type { StatCardValue } from '../model/cards';

const TONES = { danger: 'text-danger', warning: 'text-warning' } as const;

/** 카드 줄. 넓은 화면 4열, 768px 미만 2열, 480px 미만 1열이고 1열에서는 먼저 보일 넷만 보인다. */
export function StatGrid({ cards }: { cards: readonly StatCardValue[] }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 md:grid-cols-4">
        {cards.map((card) => (
          <Card
            key={card.id}
            className={cn('p-3.5 sm:p-4', !card.primary && !expanded && 'hidden min-[480px]:block')}
          >
            <p className="text-xs text-fg-muted">{card.label}</p>
            <p
              className={cn(
                'mt-1 text-2xl font-semibold tabular-nums md:text-[28px]',
                card.tone ? TONES[card.tone] : 'text-fg',
              )}
            >
              {card.value}
            </p>
            {card.note && <p className="mt-0.5 text-xs text-fg-muted">{card.note}</p>}
          </Card>
        ))}
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="self-start min-[480px]:hidden"
        aria-expanded={expanded}
        onClick={() => setExpanded((open) => !open)}
      >
        {expanded ? '접기' : '더 보기'}
      </Button>
    </div>
  );
}
