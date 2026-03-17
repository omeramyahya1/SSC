import React, { useState, useRef, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { Button, ButtonProps } from './button';
import { Progress } from './progress';

interface HoldToConfirmButtonProps extends ButtonProps {
  onConfirm: () => void;
  holdDuration?: number; // duration in ms
  confirmationLabel?: string;
}

export function HoldToConfirmButton({
  onConfirm,
  holdDuration = 2000,
  confirmationLabel,
  children,
  className,
  disabled,
  variant,
  ...props
}: HoldToConfirmButtonProps) {
  const [progress, setProgress] = useState(0);
  const [isHolding, setIsHolding] = useState(false);
  const timerRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);

  const startHolding = useCallback(() => {
    if (disabled) return;
    setIsHolding(true);
    startTimeRef.current = Date.now();
    
    const updateProgress = () => {
      const elapsed = Date.now() - startTimeRef.current;
      const newProgress = Math.min((elapsed / holdDuration) * 100, 100);
      setProgress(newProgress);
      
      if (newProgress < 100) {
        timerRef.current = requestAnimationFrame(updateProgress);
      } else {
        setIsHolding(false);
        setProgress(0);
        onConfirm();
      }
    };
    
    timerRef.current = requestAnimationFrame(updateProgress);
  }, [disabled, holdDuration, onConfirm]);

  const stopHolding = useCallback(() => {
    setIsHolding(false);
    setProgress(0);
    if (timerRef.current) {
      cancelAnimationFrame(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) cancelAnimationFrame(timerRef.current);
    };
  }, []);

  return (
    <div className="relative w-full group overflow-hidden rounded-md">
      <Button
        className={cn(
          "w-full transition-all duration-200 relative z-10",
          isHolding && "scale-[0.98]",
          className
        )}
        onMouseDown={startHolding}
        onMouseUp={stopHolding}
        onMouseLeave={stopHolding}
        onTouchStart={startHolding}
        onTouchEnd={stopHolding}
        disabled={disabled}
        variant={variant}
        {...props}
      >
        {isHolding && confirmationLabel ? confirmationLabel : children}
      </Button>
      
      {isHolding && (
        <div 
          className="absolute inset-0 bg-white/20 z-20 pointer-events-none transition-all duration-75"
          style={{ width: `${progress}%` }}
        />
      )}
      
      {/* Visual background fill effect for feedback */}
      <div 
        className={cn(
            "absolute inset-0 bg-black/10 z-0 transition-opacity duration-300",
            isHolding ? "opacity-100" : "opacity-0"
        )}
      />
    </div>
  );
}
