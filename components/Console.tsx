import React, { useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { LogEntry } from '@/lib/types';

interface ConsoleProps {
  logs: LogEntry[];
  className?: string;
}

export default function Console({ logs, className }: ConsoleProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <div className={cn("bg-black/80 border-t-2 border-cyan-500 font-mono text-xs p-2 overflow-y-auto", className)} ref={scrollRef}>
      {logs.map((log) => (
        <div key={log.id} className="mb-1">
          <span className="text-gray-500">[{new Date(log.timestamp).toLocaleTimeString()}]</span>
          <span className={cn(
            "ml-2",
            log.type === 'error' ? 'text-red-500' :
            log.type === 'success' ? 'text-green-500' :
            'text-cyan-300'
          )}>
            {log.message}
          </span>
        </div>
      ))}
    </div>
  );
}
