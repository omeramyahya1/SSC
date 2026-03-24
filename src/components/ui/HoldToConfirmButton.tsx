import { useState, useRef, useEffect, useCallback } from 'react';
import { animate, motion, useMotionValue, useTransform } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Button, ButtonProps } from './button';

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
  variant = 'default',
  ...props
}: HoldToConfirmButtonProps) {
  const [isHolding, setIsHolding] = useState(false);
  const animationRef = useRef<ReturnType<typeof animate> | null>(null);
  const holdTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const confirmedRef = useRef(false);
  const progress = useMotionValue(0);
  const fillRightOffset = useTransform(progress, (v) => `${(1 - v) * 100}%`);

  // Use a Ref for onConfirm to avoid stale closures during long hold animations
  const onConfirmRef = useRef(onConfirm);
  useEffect(() => {
    onConfirmRef.current = onConfirm;
  }, [onConfirm]);

  const triggerConfirm = useCallback(() => {
    if (confirmedRef.current) return;
    confirmedRef.current = true;
    setIsHolding(false);
    progress.set(0);
    if (animationRef.current) {
      animationRef.current.stop();
      animationRef.current = null;
    }
    if (holdTimeoutRef.current) {
      clearTimeout(holdTimeoutRef.current);
      holdTimeoutRef.current = null;
    }
    onConfirmRef.current();
  }, [progress]);

  const startHolding = useCallback(() => {
    if (disabled) return;
    if (isHolding) return;
    confirmedRef.current = false;
    setIsHolding(true);
    if (animationRef.current) animationRef.current.stop();
    progress.set(0);
    if (holdTimeoutRef.current) {
      clearTimeout(holdTimeoutRef.current);
      holdTimeoutRef.current = null;
    }
    holdTimeoutRef.current = setTimeout(() => {
      triggerConfirm();
    }, holdDuration);
    animationRef.current = animate(progress, 1, {
      duration: holdDuration / 1000,
      ease: 'linear',
      onComplete: triggerConfirm,
    });
  }, [disabled, holdDuration, progress, isHolding, triggerConfirm]);

  const stopHolding = useCallback(() => {
    setIsHolding(false);
    if (animationRef.current) {
      animationRef.current.stop();
      animationRef.current = null;
    }
    if (holdTimeoutRef.current) {
      clearTimeout(holdTimeoutRef.current);
      holdTimeoutRef.current = null;
    }
    progress.set(0);
  }, [progress]);

  useEffect(() => {
    return () => {
      if (animationRef.current) animationRef.current.stop();
      if (holdTimeoutRef.current) clearTimeout(holdTimeoutRef.current);
    };
  }, []);

  return (
    <Button
      className={cn(
        "w-full relative overflow-hidden transition-all duration-200 border-transparent", className,
        isHolding && cn(
          "scale-[0.95] bg-primary-light"
        )
      )}
      onPointerDown={(e) => {
        (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
        startHolding();
      }}
      onKeyDown={(e) => {
        if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) {
          e.preventDefault();
          startHolding();
        }
      }}
      onKeyUp={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          stopHolding();
        }
      }}
      onPointerUp={(e) => {
        (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
        stopHolding();
      }}
      onPointerCancel={stopHolding}
      disabled={disabled}
      variant={variant}
      {...props}
    >
      {/* Filling background */}
      <motion.div
        className={cn(
          "absolute left-0 top-0 bottom-0 pointer-events-none z-0 bg-primary"
        )}
        style={{ right: fillRightOffset }}
      />

      <span className="relative z-10 flex items-center justify-center gap-2">
        {isHolding && confirmationLabel ? confirmationLabel : children}
      </span>
    </Button>
  );
}
