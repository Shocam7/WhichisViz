'use client';

import React, { useRef, useEffect, useState, useCallback } from 'react';
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
  const [ocrBlocks, setOcrBlocks] = useState<OCRBlock[]>([]);
  const [stream, setStream] = useState<MediaStream | null>(null);

  // Initialize Camera
  useEffect(() => {
    async function setupCamera() {
      try {
        const mediaStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' }
        });
        setStream(mediaStream);
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
        }
        onLog('Camera initialized', 'info');
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

  // OCR Loop
  useEffect(() => {
    let intervalId: NodeJS.Timeout;

    const runOCR = async () => {
      if (!videoRef.current || !canvasRef.current || !isScanning) return;

      const video = videoRef.current;
      const canvas = canvasRef.current;
      
      // Ensure video dimensions are available
      if (video.videoWidth === 0 || video.videoHeight === 0) return;

      // Match canvas to video size
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Draw current video frame to canvas for OCR
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      try {
        const result = await Tesseract.recognize(canvas, 'eng', {
            // logger: m => console.log(m) // Optional logger
        });

        // Tesseract.js Page object structure: data -> blocks -> paragraphs -> lines -> words
        const allWords: any[] = [];
        result.data.blocks?.forEach(block => {
            block.paragraphs.forEach(para => {
                para.lines.forEach(line => {
                    line.words.forEach(word => {
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

        setOcrBlocks(blocks);
        onLog(`Detected ${blocks.length} text blocks`, 'info');

      } catch (err) {
        console.error("OCR Error:", err);
        onLog('OCR processing failed', 'error');
      }
    };

    if (isScanning) {
        intervalId = setInterval(runOCR, 5000); // Run every 5 seconds to save resources
        runOCR(); // Run immediately once
    }

    return () => clearInterval(intervalId);
  }, [isScanning, onLog]);

  // Draw Bounding Boxes Overlay
  useEffect(() => {
      const canvas = canvasRef.current;
      const video = videoRef.current;
      if (!canvas || !video) return;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Clear previous drawings but keep the video frame (if we want to see what was captured)
      // Actually, we want the overlay to be transparent over the live video
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // We need to re-draw the bounding boxes on every frame if we want them to stick? 
      // But since the objects move, we only update positions on new OCR run.
      // For now, just draw the boxes we have.
      
      // NOTE: Since the video is playing underneath, the canvas should ideally be absolute positioned on top of it.
      // The OCR captured a snapshot. The boxes correspond to that snapshot. 
      // If the camera moves, the boxes will be misaligned until next OCR.
      
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

      // Find clicked block
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
    </div>
  );
}
