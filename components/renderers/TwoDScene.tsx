import React, { useRef, useEffect } from 'react';

interface TwoDSceneProps {
  script: string;
}

export default function TwoDScene({ script }: TwoDSceneProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number>(0);
  const frameCountRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Resize handling
    const resizeCanvas = () => {
      canvas.width = canvas.parentElement?.clientWidth || window.innerWidth;
      canvas.height = canvas.parentElement?.clientHeight || window.innerHeight;
    };
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // Dynamic Function Creation
    // We create a function that takes 'ctx', 'width', 'height', 'frameCount'
    // and executes the script.
    let drawFrame: Function | null = null;
    try {
      drawFrame = new Function('ctx', 'width', 'height', 'frameCount', script);
    } catch (e) {
      console.error("Failed to compile 2D script:", e);
      // Could display error on canvas
      ctx.fillStyle = 'red';
      ctx.font = '20px Arial';
      ctx.fillText("Script Error", 50, 50);
      return;
    }

    const render = () => {
      // Clear canvas (optional, depending on if script handles it, but good practice usually)
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      try {
        if (drawFrame) {
            drawFrame(ctx, canvas.width, canvas.height, frameCountRef.current);
        }
      } catch (e) {
        console.error("Runtime Error in 2D script:", e);
      }

      frameCountRef.current++;
      animationFrameRef.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      cancelAnimationFrame(animationFrameRef.current);
    };
  }, [script]);

  return (
    <canvas ref={canvasRef} className="w-full h-full block" />
  );
}
