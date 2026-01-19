'use client';

import React, { useRef, useEffect, useState } from 'react';
import { OCRBlock, LogEntry } from '@/lib/types';

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
  const [showDebug, setShowDebug] = useState(false);

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


  // OCR Loop
  useEffect(() => {
    let intervalId: NodeJS.Timeout;
    let isProcessing = false;

    const runOCR = async () => {
      if (!videoRef.current || isProcessing || !isScanning) return;

      const video = videoRef.current;
      
      if (video.readyState !== 4 || video.videoWidth === 0) return;

      isProcessing = true;

      try {
          // Create offscreen canvas to capture frame
          const captureCanvas = document.createElement('canvas');
          captureCanvas.width = video.videoWidth;
          captureCanvas.height = video.videoHeight;
          const ctx = captureCanvas.getContext('2d');
          
          if (ctx) {
            ctx.drawImage(video, 0, 0, captureCanvas.width, captureCanvas.height);
            
            // Convert to Base64
            const base64Image = captureCanvas.toDataURL('image/jpeg', 0.8);
            
            // Call API
            const response = await fetch('/api/ocr', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ image: base64Image })
            });

            if (response.ok) {
                const data = await response.json();
                if (data.blocks && Array.isArray(data.blocks)) {
                    setOcrBlocks(data.blocks);
                    onLog(`Detected ${data.blocks.length} text blocks via Gemini`, 'info');
                }
            } else {
                console.error("OCR API failed");
            }
          }

      } catch (err) {
        console.error("OCR Error:", err);
      } finally {
        isProcessing = false;
      }
    };

    if (isScanning) {
        // Run less frequently to save API costs/latency (e.g., every 4 seconds)
        intervalId = setInterval(runOCR, 4000); 
        setTimeout(runOCR, 1000); 
    }

    return () => clearInterval(intervalId);
  }, [isScanning, onLog]);

  // Draw Bounding Boxes Overlay
  useEffect(() => {
      const canvas = canvasRef.current;
      const video = videoRef.current;
      if (!canvas || !video) return;

      if (video.videoWidth > 0 && (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight)) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
      }

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      ctx.strokeStyle = '#00ff00';
      ctx.lineWidth = 2;
      ctx.fillStyle = 'rgba(0, 255, 0, 0.2)';

      ocrBlocks.forEach(block => {
          // Bbox is normalized (0-1) in new implementation
          const x0 = block.bbox.x0 * canvas.width;
          const y0 = block.bbox.y0 * canvas.height;
          const x1 = block.bbox.x1 * canvas.width;
          const y1 = block.bbox.y1 * canvas.height;
          
          const w = x1 - x0;
          const h = y1 - y0;
          
          ctx.strokeRect(x0, y0, w, h);
          ctx.fillRect(x0, y0, w, h);
      });

  }, [ocrBlocks]);


  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;

      // Click coordinates relative to canvas pixels
      const x = (e.clientX - rect.left) * scaleX;
      const y = (e.clientY - rect.top) * scaleY;

      // Normalize click coordinates to 0-1 for comparison
      const normX = x / canvas.width;
      const normY = y / canvas.height;

      // Find clicked block
      const clickedBlock = ocrBlocks.find(b => 
          normX >= b.bbox.x0 && normX <= b.bbox.x1 &&
          normY >= b.bbox.y0 && normY <= b.bbox.y1
      );

      if (clickedBlock) {
          onTextSelected(clickedBlock.text);
          onLog(`Selected: "${clickedBlock.text}"`, 'success');
      }
  };

  return (
    <div className="relative w-full h-full bg-black">
      {/* Video Element */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="absolute inset-0 w-full h-full object-cover"
      />
      
      {/* Canvas Overlay for interactions */}
      <canvas
        ref={canvasRef}
        onClick={handleCanvasClick}
        className="absolute inset-0 w-full h-full object-cover cursor-crosshair"
      />
    </div>
  );
}
