import React from 'react';
import { cn } from '@/lib/utils';

interface HUDProps {
  children: React.ReactNode;
  className?: string;
}

export default function HUD({ children, className }: HUDProps) {
  return (
    <div className={cn("relative w-full h-full overflow-hidden text-cyan-400 font-sans", className)}>
      {/* Decorative HUD Elements */}
      <div className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-cyan-500 rounded-tl-lg z-20 pointer-events-none" />
      <div className="absolute top-0 right-0 w-8 h-8 border-t-2 border-r-2 border-cyan-500 rounded-tr-lg z-20 pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-8 h-8 border-b-2 border-l-2 border-cyan-500 rounded-bl-lg z-20 pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-cyan-500 rounded-br-lg z-20 pointer-events-none" />
      
      {/* Scanline Effect (optional, adding subtle grid) */}
      <div className="absolute inset-0 z-10 pointer-events-none opacity-10 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))]" style={{ backgroundSize: "100% 2px, 3px 100%" }} />

      {/* Main Content */}
      <div className="relative z-0 w-full h-full flex flex-col">
          {children}
      </div>
    </div>
  );
}
