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
  const [ocrBlocks, setOcrBlocks] = useState<OCRBlock[]>([]);
  const [stream, setStream] = useState<MediaStream | null>(null);

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
          // Create an offscreen canvas for OCR
          const captureCanvas = document.createElement('canvas');
          captureCanvas.width = video.videoWidth;
          captureCanvas.height = video.videoHeight;
          const ctx = captureCanvas.getContext('2d');
          
          if (ctx) {
            ctx.drawImage(video, 0, 0, captureCanvas.width, captureCanvas.height);
            
            // Log for debugging (optional: could export to see what we captured)
            // const dataUrl = captureCanvas.toDataURL();
            // console.log("Capturing frame for OCR...", captureCanvas.width, captureCanvas.height);

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
               onLog(`Detected ${blocks.length} text blocks`, 'info');
            } else {
               // Keep old blocks? Or clear? Clearing might be safer if we moved away.
               // But if OCR failed due to blur, we might want to keep last known good?
               // Let's clear to avoid confusion.
               setOcrBlocks([]); 
               // console.log("No text detected");
            }
          }

      } catch (err) {
        console.error("OCR Error:", err);
        onLog('OCR processing failed', 'error');
      } finally {
        isProcessing = false;
      }
    };

    if (isScanning) {
        intervalId = setInterval(runOCR, 2000); // Run every 2 seconds
        // Wait a bit for video to stabilize before first run
        setTimeout(runOCR, 1000); 
    }

    return () => clearInterval(intervalId);
  }, [isScanning, onLog]);

  // Draw Bounding Boxes Overlay
  useEffect(() => {
      const canvas = canvasRef.current;
      const video = videoRef.current;
      if (!canvas || !video) return;

      // Ensure canvas matches video size for correct overlay positioning
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
