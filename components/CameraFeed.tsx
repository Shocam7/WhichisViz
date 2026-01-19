'use client';

import React, { useRef, useEffect, useState } from 'react';
import Tesseract from 'tesseract.js';
import { OCRBlock, LogEntry } from '@/lib/types';

interface CameraFeedProps {
  onTextSelected: (text: string) => void;
  onLog: (message: string, type: LogEntry['type']) => void;
  isScanning: boolean;
}

export default function CameraFeed({ onTextSelected, onLog, isScanning }: CameraFeedProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const debugCanvasRef = useRef<HTMLCanvasElement>(null); // New debug canvas
  const [ocrBlocks, setOcrBlocks] = useState<OCRBlock[]>([]);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [showDebug, setShowDebug] = useState(false); // Toggle for debug view

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

  // Image Processing Function
  const preprocessImage = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
      const imageData = ctx.getImageData(0, 0, width, height);
      const data = imageData.data;
      
      // Simple Grayscale & High Contrast
      for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          
          // Luminance formula
          const gray = 0.299 * r + 0.587 * g + 0.114 * b;
          
          // Binarization (Thresholding)
          // Dynamic thresholding would be better, but let's try a simple hard threshold first
          // or just contrast stretching. Let's try boosting contrast.
          const contrastFactor = 1.5; // Adjust as needed
          const adjusted = (gray - 128) * contrastFactor + 128;
          
          // Clamp
          const val = Math.max(0, Math.min(255, adjusted));
          
          data[i] = val;     // R
          data[i+1] = val;   // G
          data[i+2] = val;   // B
      }
      
      ctx.putImageData(imageData, 0, 0);
  };

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
          // Create or reuse an offscreen canvas for OCR
          const captureCanvas = document.createElement('canvas');
          captureCanvas.width = video.videoWidth;
          captureCanvas.height = video.videoHeight;
          const ctx = captureCanvas.getContext('2d');
          
          if (ctx) {
            ctx.drawImage(video, 0, 0, captureCanvas.width, captureCanvas.height);
            
            // Apply Image Preprocessing
            preprocessImage(ctx, captureCanvas.width, captureCanvas.height);

            // Update debug canvas if visible
            if (showDebug && debugCanvasRef.current) {
                const debugCtx = debugCanvasRef.current.getContext('2d');
                if (debugCtx) {
                    debugCanvasRef.current.width = captureCanvas.width / 4; // Scale down for preview
                    debugCanvasRef.current.height = captureCanvas.height / 4;
                    debugCtx.drawImage(captureCanvas, 0, 0, debugCanvasRef.current.width, debugCanvasRef.current.height);
                }
            }

            const result = await Tesseract.recognize(captureCanvas, 'eng', {
                // logger: m => console.log(m)
            });

            // Tesseract.js Page object structure: data -> blocks -> paragraphs -> lines -> words
            const allWords: any[] = [];
            result.data.blocks?.forEach((block: any) => {
                block.paragraphs?.forEach((para: any) => {
                    para.lines?.forEach((line: any) => {
                        line.words?.forEach((word: any) => {
                            allWords.push(word);
                        });
                    });
                });
            });

            const blocks: OCRBlock[] = allWords.map(w => ({
              text: w.text,
              bbox: {
                x0: w.bbox.x0,
                y0: w.bbox.y0,
                x1: w.bbox.x1,
                y1: w.bbox.y1
              }
            }));
            
            // Only update if we found something, or at least log it
            if (blocks.length > 0) {
               setOcrBlocks(blocks);
               // onLog(`Detected ${blocks.length} text blocks`, 'info'); // Too verbose
            } else {
               setOcrBlocks([]); 
            }
          }

      } catch (err) {
        console.error("OCR Error:", err);
        // onLog('OCR processing failed', 'error');
      } finally {
        isProcessing = false;
      }
    };

    if (isScanning) {
        intervalId = setInterval(runOCR, 2000); // Run every 2 seconds
        setTimeout(runOCR, 1000); 
    }

    return () => clearInterval(intervalId);
  }, [isScanning, onLog, showDebug]); // Added showDebug dependency

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
          const w = block.bbox.x1 - block.bbox.x0;
          const h = block.bbox.y1 - block.bbox.y0;
          ctx.strokeRect(block.bbox.x0, block.bbox.y0, w, h);
          ctx.fillRect(block.bbox.x0, block.bbox.y0, w, h);
      });

  }, [ocrBlocks]);


  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;

      const x = (e.clientX - rect.left) * scaleX;
      const y = (e.clientY - rect.top) * scaleY;

      const clickedBlock = ocrBlocks.find(b => 
          x >= b.bbox.x0 && x <= b.bbox.x1 &&
          y >= b.bbox.y0 && y <= b.bbox.y1
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

      {/* Debug View Toggle */}
      <div className="absolute top-4 left-4 z-50">
          <button 
             onClick={() => setShowDebug(!showDebug)}
             className="bg-gray-800/50 text-white text-xs px-2 py-1 rounded border border-gray-600 hover:bg-gray-700"
          >
             {showDebug ? 'Hide Debug' : 'Show OCR View'}
          </button>
      </div>

      {/* Debug Canvas */}
      <div className={`absolute top-12 left-4 z-50 border border-green-500 bg-black ${showDebug ? 'block' : 'hidden'}`}>
          <canvas ref={debugCanvasRef} className="w-48 h-auto" />
      </div>
    </div>
  );
}
