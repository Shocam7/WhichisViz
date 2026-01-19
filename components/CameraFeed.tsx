'use client';

import React, { useRef, useEffect, useState } from 'react';
import { createWorker, Worker, PSM } from 'tesseract.js';
import { OCRBlock, LogEntry } from '@/lib/types';

interface CameraFeedProps {
  onTextSelected: (text: string) => void;
  onLog: (message: string, type: LogEntry['type']) => void;
  isScanning: boolean;
}

export default function CameraFeed({ onTextSelected, onLog, isScanning }: CameraFeedProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const workerRef = useRef<Worker | null>(null);
  
  const [ocrBlocks, setOcrBlocks] = useState<OCRBlock[]>([]);
  const [isWorkerReady, setIsWorkerReady] = useState(false);

  // 1. Initialize Tesseract Worker once on mount
  useEffect(() => {
    let isMounted = true;

    async function initWorker() {
      try {
        onLog('Initializing OCR engine...', 'info');
        // createWorker is the standard way to initialize in Tesseract.js v4/v5
        const worker = await createWorker('eng');
        
        await worker.setParameters({
          tessedit_pageseg_mode: PSM.SPARSE_TEXT, 
        });
        
        if (isMounted) {
          workerRef.current = worker;
          setIsWorkerReady(true);
          onLog('OCR engine ready', 'success');
        }
      } catch (err) {
        onLog('Failed to initialize OCR engine', 'error');
        console.error(err);
      }
    }

    initWorker();

    return () => {
      isMounted = false;
      workerRef.current?.terminate();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 2. Initialize Camera Stream
  useEffect(() => {
    let stream: MediaStream | null = null;

    async function setupCamera() {
      try {
        const constraints = {
          video: { 
            facingMode: 'environment',
            width: { ideal: 1280 }, 
            height: { ideal: 720 }
          }
        };
        stream = await navigator.mediaDevices.getUserMedia(constraints);
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (err) {
        onLog('Camera access denied or error occurred', 'error');
      }
    }
    setupCamera();

    return () => {
      stream?.getTracks().forEach(track => track.stop());
    };
  }, [onLog]);

  // 3. OCR Processing Loop
  useEffect(() => {
    let intervalId: NodeJS.Timeout;
    let isProcessing = false;

    const runOCR = async () => {
      if (!videoRef.current || !workerRef.current || !isWorkerReady || isProcessing || !isScanning) return;

      const video = videoRef.current;
      if (video.readyState !== 4 || video.videoWidth === 0) return;

      isProcessing = true;

      try {
        const captureCanvas = document.createElement('canvas');
        captureCanvas.width = video.videoWidth;
        captureCanvas.height = video.videoHeight;
        const ctx = captureCanvas.getContext('2d');
        
        if (ctx) {
          // --- PRE-PROCESSING ---
          // Grayscale and Contrast boost helps the engine see characters
          ctx.filter = 'contrast(1.3) grayscale(1)';
          ctx.drawImage(video, 0, 0);
          
          // --- THE FIX ---
          // We cast the result to 'any' to avoid the "Property words does not exist on type Page" build error
          const result: any = await workerRef.current.recognize(captureCanvas);
          const words = result.data.words || [];
          
          const blocks: OCRBlock[] = words
            .filter((w: any) => w.confidence > 45) // Ignore blurry noise
            .map((w: any) => ({
              text: w.text,
              bbox: {
                x0: w.bbox.x0,
                y0: w.bbox.y0,
                x1: w.bbox.x1,
                y1: w.bbox.y1
              }
            }));

          setOcrBlocks(blocks);
          if (blocks.length > 0) {
            onLog(`Detected ${blocks.length} items`, 'info');
          }
        }
      } catch (err) {
        console.error("OCR Runtime Error:", err);
      } finally {
        isProcessing = false;
      }
    };

    if (isScanning && isWorkerReady) {
      // Run immediately then every 2 seconds
      runOCR();
      intervalId = setInterval(runOCR, 2000);
    } else {
      setOcrBlocks([]); // Clear boxes when scanning stops
    }

    return () => clearInterval(intervalId);
  }, [isScanning, isWorkerReady, onLog]);

  // 4. Draw Interactive Overlay
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
    
    // Styling for text boxes
    ctx.strokeStyle = '#00ff00';
    ctx.lineWidth = 3;
    ctx.fillStyle = 'rgba(0, 255, 0, 0.1)';

    ocrBlocks.forEach(block => {
      const { x0, y0, x1, y1 } = block.bbox;
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
    <div className="relative w-full h-full bg-black overflow-hidden">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="absolute inset-0 w-full h-full object-cover"
      />
      <canvas
        ref={canvasRef}
        onClick={handleCanvasClick}
        className="absolute inset-0 w-full h-full object-cover cursor-crosshair z-10"
      />
      
      {!isWorkerReady && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 text-white z-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mb-2"></div>
          <p className="text-sm font-medium">Loading OCR Engine...</p>
        </div>
      )}
    </div>
  );
}
