'use client';

import React, { useState, useEffect } from 'react';
import { LogEntry, VisualizationType } from '@/lib/types';
import HUD from '@/components/HUD';
import CameraFeed from '@/components/CameraFeed';
import Console from '@/components/Console';
import ThreeScene from '@/components/renderers/ThreeScene';
import TwoDScene from '@/components/renderers/TwoDScene';

export default function Home() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [capturedText, setCapturedText] = useState<string>("");
  const [selectedText, setSelectedText] = useState<string>("");
  const [isScanning, setIsScanning] = useState<boolean>(true);
  
  // Visualization State
  const [vizType, setVizType] = useState<VisualizationType | null>(null);
  const [vizScript, setVizScript] = useState<string>("");
  const [glbUrl, setGlbUrl] = useState<string | null>(null);
  
  // Colab Backend URL
  const [colabUrl, setColabUrl] = useState<string>("");

  const addLog = (message: string, type: LogEntry['type'] = 'info') => {
    setLogs(prev => [...prev, {
      id: Math.random().toString(36).substring(7),
      timestamp: Date.now(),
      message,
      type
    }]);
  };

  const handleTextSelected = (text: string) => {
    setSelectedText(text);
    // Pause scanning when text is selected to let user decide
    setIsScanning(false);
  };

  const handleReset = () => {
    setSelectedText("");
    setVizType(null);
    setVizScript("");
    setGlbUrl(null);
    setIsScanning(true);
    addLog("System reset. Resume scanning.", "info");
  };

  const handleVisualise = async () => {
    if (!selectedText) return;

    addLog(`Analyzing: "${selectedText.substring(0, 30)}..."`, "info");
    
    try {
      const res = await fetch('/api/visualize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: selectedText })
      });

      if (!res.ok) throw new Error('Failed to fetch visualization plan');

      const data = await res.json();
      addLog(`Decision: ${data.type} (${data.reasoning})`, "success");

      if (data.type === '2D') {
        setVizType('2D');
        setVizScript(data.script);
      } else if (data.type === '3D') {
        if (!colabUrl) {
           addLog("Error: Colab Backend URL is missing", "error");
           return;
        }

        addLog("Sending to 3D Renderer (Colab)...", "info");
        
        // Call Colab Backend
        const colabRes = await fetch(`${colabUrl}/render`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ script: data.script })
        });

        if (!colabRes.ok) throw new Error('Colab rendering failed');

        const blob = await colabRes.blob();
        const url = URL.createObjectURL(blob);
        setGlbUrl(url);
        setVizType('3D');
        addLog("3D Model received and loaded", "success");
      }

    } catch (err: any) {
      console.error(err);
      addLog(err.message || "Unknown error occurred", "error");
    }
  };

  return (
    <main className="w-screen h-screen bg-black overflow-hidden relative">
      <HUD>
        {/* Layer 1: Camera Feed */}
        <div className="absolute inset-0 z-0">
          <CameraFeed 
            onTextSelected={handleTextSelected} 
            onLog={addLog}
            isScanning={isScanning}
          />
        </div>

        {/* Layer 2: Visualizations (Stacked on top) */}
        <div className="absolute inset-0 z-10 pointer-events-none">
          {vizType === '3D' && glbUrl && (
             <div className="w-full h-full pointer-events-auto">
                <ThreeScene modelUrl={glbUrl} />
             </div>
          )}
          {vizType === '2D' && vizScript && (
             <div className="w-full h-full pointer-events-auto">
                <TwoDScene script={vizScript} />
             </div>
          )}
        </div>

        {/* Layer 3: UI Controls & HUD Overlay */}
        <div className="absolute inset-0 z-20 pointer-events-none flex flex-col justify-between p-4">
          
          {/* Header */}
          <div className="flex justify-between items-start pointer-events-auto">
            <h1 className="text-2xl font-bold tracking-widest text-cyan-500 uppercase">VisionViz <span className="text-xs align-top opacity-50">v1.0</span></h1>
            
            <div className="bg-black/80 border border-cyan-800 p-2 rounded backdrop-blur-sm">
               <label className="text-xs text-cyan-300 block mb-1">Colab Backend URL</label>
               <input 
                  type="text" 
                  value={colabUrl}
                  onChange={(e) => setColabUrl(e.target.value)}
                  placeholder="https://....loca.lt"
                  className="bg-zinc-900 border border-zinc-700 text-white text-xs p-1 w-48 rounded focus:border-cyan-500 outline-none"
               />
            </div>
          </div>

          {/* Center Interaction Area */}
          <div className="flex-1 flex items-center justify-center pointer-events-none">
             {selectedText && !vizType && (
                <div className="bg-black/80 border border-cyan-500 p-6 rounded-lg max-w-lg text-center backdrop-blur-md pointer-events-auto animate-in fade-in zoom-in duration-300">
                    <h3 className="text-white text-lg mb-2">Text Detected</h3>
                    <p className="text-cyan-200 mb-4 italic">"{selectedText}"</p>
                    <div className="flex gap-4 justify-center">
                        <button 
                          className="bg-cyan-600 hover:bg-cyan-500 text-white px-6 py-2 rounded uppercase font-bold tracking-wide transition-all"
                          onClick={handleVisualise}
                        >
                          Visualise
                        </button>
                        <button 
                          className="border border-red-500 text-red-500 hover:bg-red-500/20 px-6 py-2 rounded uppercase font-bold tracking-wide transition-all"
                          onClick={handleReset}
                        >
                          Cancel
                        </button>
                    </div>
                </div>
             )}
          </div>

          {/* Footer: Console */}
          <div className="h-48 w-full max-w-2xl pointer-events-auto">
             <Console logs={logs} className="h-full rounded-tr-xl border-r-2" />
          </div>

        </div>
      </HUD>
    </main>
  );
}
