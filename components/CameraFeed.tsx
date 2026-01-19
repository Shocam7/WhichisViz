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

  // 1. Initialize Tesseract Worker once
  useEffect(() => {
    async function initWorker() {
      try {
        onLog('Initializing OCR engine...', 'info');
        const worker = await createWorker('eng');
        
        // Set parameters for better mobile/live scanning
        await worker.setParameters({
          tessedit_pageseg_mode: PSM.SPARSE_TEXT, // Better for scattered words on screen
        });
        
        workerRef.current = worker;
        setIsWorkerReady(true);
        onLog('OCR engine ready', 'success');
      } catch (err) {
        onLog('Failed to initialize OCR engine', 'error');
      }
    }
    initWorker();

    return () => {
      workerRef.current?.terminate();
    };
  }, []);

  // 2. Initialize Camera
  useEffect(() => {
    let stream: MediaStream | null = null;

    async function setupCamera() {
      try {
        const constraints = {
          video: { 
            facingMode: 'environment',
            width: { ideal: 1280 }, // Slightly lower res is actually faster for OCR
            height: { ideal: 720 }
          }
        };
        stream = await navigator.mediaDevices.getUserMedia(constraints);
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (err) {
        onLog('Camera access denied', 'error');
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
      if (video.readyState !== 4) return;

      isProcessing = true;

      try {
        const captureCanvas = document.createElement('canvas');
        captureCanvas.width = video.videoWidth;
        captureCanvas.height = video.videoHeight;
        const ctx = captureCanvas.getContext('2d');
        
        if (ctx) {
          // --- IMAGE PRE-PROCESSING ---
          // Grayscale and Contrast help Tesseract significantly
          ctx.filter = 'contrast(1.2) grayscale(1)';
          ctx.drawImage(video, 0, 0);
          
          const { data } = await workerRef.current.recognize(captureCanvas);
          
          // Use data.words for a flat array of detected text items
          const blocks: OCRBlock[] = (data.words || [])
            .filter(w => w.confidence > 40) // Filter out noise
            .map(w => ({
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
            onLog(`Detected ${blocks.length} text blocks`, 'info');
          }
        }
      } catch (err) {
        console.error("OCR Error:", err);
      } finally {
        isProcessing = false;
      }
    };

    if (isScanning && isWorkerReady) {
      intervalId = setInterval(runOCR, 1500); // Process every 1.5s
    }

    return () => clearInterval(intervalId);
  }, [isScanning, isWorkerReady, onLog]);

  // 4. Draw Overlay
  useEffect(() => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;

    if (canvas.width !== video.videoWidth) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#00ff00';
    ctx.lineWidth = 3;
    ctx.fillStyle = 'rgba(0, 255, 0, 0.15)';

    ocrBlocks.forEach(block => {
      const { x0, y0, x1, y1 } = block.bbox;
      ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
      ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
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
        className="absolute inset-0 w-full h-full object-cover cursor-pointer"
      />
      {!isWorkerReady && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-white">
          Loading OCR Engine...
        </div>
      )}
    </div>
  );
}
