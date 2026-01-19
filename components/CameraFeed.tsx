'use client';

import React, { useRef, useEffect, useState } from 'react';
import { OCRBlock, LogEntry } from '@/lib/types';
import { Camera, RefreshCw } from 'lucide-react';

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

  // Initialize Camera
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
  }, []); // eslint-disable-line react-hooks/exhaustive-deps


  const handleCapture = async () => {
      if (!videoRef.current || isProcessing) return;
      
      const video = videoRef.current;
      if (video.readyState !== 4 || video.videoWidth === 0) return;

      setIsProcessing(true);
      onLog("Capturing image...", 'info');

      try {
          // Capture frame
          const captureCanvas = document.createElement('canvas');
          captureCanvas.width = video.videoWidth;
          captureCanvas.height = video.videoHeight;
          const ctx = captureCanvas.getContext('2d');
          
          if (ctx) {
            ctx.drawImage(video, 0, 0, captureCanvas.width, captureCanvas.height);
            const base64Image = captureCanvas.toDataURL('image/jpeg', 0.9);
            
            setCapturedImage(base64Image); // Show static image
            
            // Call API
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
        console.error("Capture Error:", err);
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

  // Draw Bounding Boxes Overlay
  useEffect(() => {
      const canvas = canvasRef.current;
      const video = videoRef.current;
      if (!canvas) return;
      
      // Determine dimensions based on what's visible (video or captured image)
      const width = video?.videoWidth || 1920;
      const height = video?.videoHeight || 1080;

      if (canvas.width !== width || canvas.height !== height) {
          canvas.width = width;
          canvas.height = height;
      }

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // Only draw if we have a captured image
      if (capturedImage) {
          ctx.strokeStyle = '#00ff00';
          ctx.lineWidth = 4;
          ctx.fillStyle = 'rgba(0, 255, 0, 0.2)';

          ocrBlocks.forEach(block => {
              const x0 = block.bbox.x0 * canvas.width;
              const y0 = block.bbox.y0 * canvas.height;
              const x1 = block.bbox.x1 * canvas.width;
              const y1 = block.bbox.y1 * canvas.height;
              
              const w = x1 - x0;
              const h = y1 - y0;
              
              ctx.strokeRect(x0, y0, w, h);
              ctx.fillRect(x0, y0, w, h);
          });
      }

  }, [ocrBlocks, capturedImage]);


  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!capturedImage) return; // Only allow selection on captured image
      
      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;

      const x = (e.clientX - rect.left) * scaleX;
      const y = (e.clientY - rect.top) * scaleY;

      const normX = x / canvas.width;
      const normY = y / canvas.height;

      const clickedBlock = ocrBlocks.find(b => 
          normX >= b.bbox.x0 && normX <= b.bbox.x1 &&
          normY >= b.bbox.y0 && normY <= b.bbox.y1
      );

      if (clickedBlock) {
          onTextSelected(clickedBlock.text);
          onLog(`Selected: "${clickedBlock.text.substring(0, 20)}..."`, 'success');
      }
  };

  return (
    <div className="relative w-full h-full bg-black">
      {/* Video Element (Live Feed) */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className={`absolute inset-0 w-full h-full object-cover ${capturedImage ? 'hidden' : 'block'}`}
      />

      {/* Captured Image Display (Frozen Frame) */}
      {capturedImage && (
          // eslint-disable-next-line @next/next/no-img-element
          <img 
            src={capturedImage} 
            alt="Captured" 
            className="absolute inset-0 w-full h-full object-cover"
          />
      )}
      
      {/* Canvas Overlay for interactions */}
      <canvas
        ref={canvasRef}
        onClick={handleCanvasClick}
        className="absolute inset-0 w-full h-full object-cover cursor-crosshair z-10"
      />

      {/* Capture/Retake Controls */}
      <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 z-50 flex gap-4 pointer-events-auto">
          {!capturedImage ? (
              <button 
                  onClick={handleCapture}
                  disabled={isProcessing}
                  className="flex items-center gap-2 bg-cyan-600 hover:bg-cyan-500 text-white px-6 py-3 rounded-full shadow-lg shadow-cyan-500/50 transition-all font-bold tracking-wide disabled:opacity-50 disabled:cursor-not-allowed"
              >
                  <Camera size={20} />
                  {isProcessing ? 'SCANNING...' : 'SCAN TEXT'}
              </button>
          ) : (
              <button 
                  onClick={handleRetake}
                  className="flex items-center gap-2 bg-zinc-700 hover:bg-zinc-600 text-white px-6 py-3 rounded-full shadow-lg transition-all font-bold tracking-wide"
              >
                  <RefreshCw size={20} />
                  RETAKE
              </button>
          )}
      </div>
    </div>
  );
}
