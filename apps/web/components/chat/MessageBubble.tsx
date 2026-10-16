import type { Message } from './types';

/** A bubble — bot on the left (surface), user on the right (accent). View only. */
export function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === 'user';
  const waiting = message.streaming === true && message.text.length === 0;
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-3 text-[15px] leading-relaxed ${
          isUser
            ? 'bg-accent text-accent-foreground'
            : 'border border-black/5 bg-surface text-foreground'
        }`}
      >
        {waiting ? <TypingDots /> : message.text}
      </div>
    </div>
  );
}

/** Three pulsing dots shown while waiting for the first streamed token. */
function TypingDots() {
  return (
    <span className="inline-flex items-center gap-1 py-1" role="status" aria-label="typing">
      <span className="size-1.5 animate-bounce rounded-full bg-muted [animation-delay:-0.3s]" />
      <span className="size-1.5 animate-bounce rounded-full bg-muted [animation-delay:-0.15s]" />
      <span className="size-1.5 animate-bounce rounded-full bg-muted" />
    </span>
  );
}
