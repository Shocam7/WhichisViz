'use client';

import React, { useRef, useEffect, useState } from 'react';
import { OCRBlock, LogEntry } from '@/lib/types';
import { Camera, RefreshCw, ScanLine } from 'lucide-react'; // Added ScanLine for variety

interface CameraFeedProps {
  onTextSelected: (text: string) => void;
  onLog: (message: string, type: LogEntry['type']) => void;
  isScanning: boolean;
}

export default function CameraFeed({ onTextSelected, onLog, isScanning }: CameraFeedProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ocrBlocks, setOcrBlocks] = useState<OCRBlock[]>([]);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // ... (setupCamera and return cleanup remain the same)
  useEffect(() => {
    async function setupCamera() {
      try {
        const constraints = {
          video: { 
            facingMode: 'environment',
            width: { ideal: 1920 },
            height: { ideal: 1080 }
          }
        };
        const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
        setStream(mediaStream);
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
          videoRef.current.onloadedmetadata = () => {
             onLog(`Camera Ready: ${videoRef.current?.videoWidth}x${videoRef.current?.videoHeight}`, 'info');
          };
        }
      } catch (err) {
        console.error("Camera Error:", err);
        onLog('Failed to access camera', 'error');
      }
    }
    setupCamera();
    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  const handleCapture = async () => {
      if (!videoRef.current || isProcessing) return;
      const video = videoRef.current;
      if (video.readyState !== 4 || video.videoWidth === 0) return;

      setIsProcessing(true);
      onLog("Capturing image...", 'info');

      try {
          const captureCanvas = document.createElement('canvas');
          captureCanvas.width = video.videoWidth;
          captureCanvas.height = video.videoHeight;
          const ctx = captureCanvas.getContext('2d');
          
          if (ctx) {
            ctx.drawImage(video, 0, 0, captureCanvas.width, captureCanvas.height);
            const base64Image = captureCanvas.toDataURL('image/jpeg', 0.9);
            setCapturedImage(base64Image);
            
            onLog("Analyzing text...", 'info');
            const response = await fetch('/api/ocr', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ image: base64Image })
            });

            if (response.ok) {
                const data = await response.json();
                if (data.blocks && Array.isArray(data.blocks)) {
                    setOcrBlocks(data.blocks);
                    onLog(`Detected ${data.blocks.length} text blocks`, 'success');
                } else {
                    onLog("No text found", 'info');
                }
            } else {
                onLog("OCR API failed", 'error');
            }
          }
      } catch (err: any) {
        onLog(`Error: ${err.message}`, 'error');
      } finally {
        setIsProcessing(false);
      }
  };

  const handleRetake = () => {
      setCapturedImage(null);
      setOcrBlocks([]);
      onLog("Ready to scan", 'info');
  };

  // ... (Bounding box useEffect and handleCanvasClick remain the same)
  useEffect(() => {
      const canvas = canvasRef.current;
      const video = videoRef.current;
      if (!canvas) return;
      const width = video?.videoWidth || 1920;
      const height = video?.videoHeight || 1080;
      if (canvas.width !== width || canvas.height !== height) {
          canvas.width = width;
          canvas.height = height;
      }
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (capturedImage) {
          ctx.strokeStyle = '#00ff00';
          ctx.lineWidth = 4;
          ctx.fillStyle = 'rgba(0, 255, 0, 0.2)';
          ocrBlocks.forEach(block => {
              const x0 = block.bbox.x0 * canvas.width;
              const y0 = block.bbox.y0 * canvas.height;
              const x1 = block.bbox.x1 * canvas.width;
              const y1 = block.bbox.y1 * canvas.height;
              ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
              ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
          });
      }
  }, [ocrBlocks, capturedImage]);

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!capturedImage) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const normX = ((e.clientX - rect.left) * scaleX) / canvas.width;
      const normY = ((e.clientY - rect.top) * scaleY) / canvas.height;
      const clickedBlock = ocrBlocks.find(b => 
          normX >= b.bbox.x0 && normX <= b.bbox.x1 &&
          normY >= b.bbox.y0 && normY <= b.bbox.y1
      );
      if (clickedBlock) {
          onTextSelected(clickedBlock.text);
          onLog(`Selected text...`, 'success');
      }
  };

  return (
    <div className="relative w-full h-full bg-black overflow-hidden">
      {/* Live Feed */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className={`absolute inset-0 w-full h-full object-cover ${capturedImage ? 'hidden' : 'block'}`}
      />

      {/* Captured Image */}
      {capturedImage && (
          <img 
            src={capturedImage} 
            alt="Captured" 
            className="absolute inset-0 w-full h-full object-cover"
          />
      )}
      
      {/* Interactivity Layer */}
      <canvas
        ref={canvasRef}
        onClick={handleCanvasClick}
        className="absolute inset-0 w-full h-full object-cover cursor-crosshair z-10"
      />

      {/* Primary Floating Controls - Moved UP to avoid Log Box */}
      <div className="absolute bottom-40 left-1/2 transform -translate-x-1/2 z-50 flex flex-col items-center gap-3">
          {!capturedImage ? (
              <button 
                  onClick={handleCapture}
                  disabled={isProcessing}
                  className="group flex flex-col items-center gap-1 transition-all"
              >
                  <div className="bg-cyan-600 group-hover:bg-cyan-500 text-white p-4 rounded-full shadow-lg shadow-cyan-500/40 animate-pulse-slow">
                    <Camera size={28} />
                  </div>
                  <span className="text-[10px] text-cyan-400 font-bold tracking-widest bg-black/50 px-2 py-0.5 rounded">
                    {isProcessing ? 'SCANNING...' : 'SCAN'}
                  </span>
              </button>
          ) : (
              <button 
                  onClick={handleRetake}
                  className="group flex flex-col items-center gap-1 transition-all"
              >
                  <div className="bg-zinc-800 group-hover:bg-zinc-700 text-white p-4 rounded-full shadow-lg border border-zinc-600">
                    <RefreshCw size={28} />
                  </div>
                  <span className="text-[10px] text-zinc-400 font-bold tracking-widest bg-black/50 px-2 py-0.5 rounded">
                    RETAKE
                  </span>
              </button>
          )}
      </div>

      {/* Optional: Visual guide for scanning area */}
      {!capturedImage && (
          <div className="absolute inset-0 pointer-events-none border-[2px] border-dashed border-white/20 m-12 rounded-xl" />
      )}
    </div>
  );
}
