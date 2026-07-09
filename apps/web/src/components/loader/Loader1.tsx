"use client";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";

interface ChessLoaderProps {
    size?: number;     // piece size in px, default 52
    steps?: number;    // number of squares to travel, default 7
    duration?: number; // seconds per full cycle, default 2.8
    color?: string;    // piece fill color
}

export default function ChessLoader({
    size = 52,
    steps = 7,
    duration = 2.8,
    color = "#fff",
}: ChessLoaderProps) {
    const [position, setPosition] = useState(steps - 1); // starts rightmost
    const [queen, setQueen] = useState(false);
    const [cycleId, setCycleId] = useState(0);           // bumped each full cycle to remount pawn
    const reduced = useReducedMotion();

    const stepDuration = (duration / steps) * 1000;
    const cell = Math.round(size * 1.35);                // gap between step positions
    const totalWidth = cell * steps;
    const pieceX = (pos: number) => pos * cell;          // x offset for a given position

    useEffect(() => {
        if (queen) return;
        const t = setTimeout(() => {
            if (position > 0) {
                setPosition(p => p - 1);
            } else {
                // Reached left — promote
                setQueen(true);
                setTimeout(() => {
                    // Instant teleport: bump cycleId so pawn remounts at right
                    setCycleId(id => id + 1);
                    setPosition(steps - 1);
                    setQueen(false);
                }, 680);
            }
        }, reduced ? 0 : stepDuration);
        return () => clearTimeout(t);
    }, [position, queen, stepDuration, steps, reduced]);

    const hopY = reduced ? 0 : -(size * 0.18);

    return (
        <div
            role="status"
            aria-label="Loading"
            aria-busy="true"
            style={{
                position: "relative",
                width: totalWidth,
                height: Math.round(size * 1.5),
                overflow: "hidden",
            }}
        >
            {/* Shadow ellipse under the active piece */}
            <motion.div
                animate={{ x: pieceX(position) }}
                transition={reduced ? { duration: 0 } : { duration: 0.22, ease: "easeInOut" }}
                style={{
                    position: "absolute",
                    bottom: 4,
                    left: cell / 2 - size * 0.22,
                    width: size * 0.44,
                    height: 5,
                    borderRadius: 999,
                    background: "rgba(0,0,0,0.35)",
                    filter: "blur(3px)",
                }}
            />

            <AnimatePresence initial={false} mode="wait">
                {!queen ? (
                    // Pawn — key includes cycleId so it remounts fresh at right each cycle
                    <motion.div
                        key={`pawn-${cycleId}`}
                        style={{ position: "absolute", top: 0, left: 0 }}
                        initial={reduced ? false : {
                            x: pieceX(steps - 1),
                            opacity: 0,
                        }}
                        animate={{
                            x: pieceX(position),
                            y: [0, hopY, 0],
                            opacity: 1,
                        }}
                        exit={{ opacity: 0, scale: 0.8, transition: { duration: 0.12 } }}
                        transition={reduced ? { duration: 0 } : {
                            x: { duration: 0.22, ease: "easeInOut" },
                            y: { duration: 0.22, ease: "easeOut" },
                            opacity: { duration: 0.18 },
                        }}
                    >
                        <Pawn size={size} color={color} />
                    </motion.div>
                ) : (
                    // Queen — appears at the leftmost position (x=0)
                    <motion.div
                        key="queen"
                        style={{
                            position: "absolute",
                            top: 0,
                            left: 0,
                            filter: `drop-shadow(0 0 ${Math.round(size * 0.12)}px ${color})`,
                        }}
                        initial={reduced ? false : { scale: 0, opacity: 0, rotate: -25 }}
                        animate={{ scale: [0, 1.18, 1], opacity: 1, rotate: 0 }}
                        exit={{ opacity: 0, scale: 0, transition: { duration: 0.12 } }}
                        transition={reduced ? { duration: 0 } : { duration: 0.55, ease: "easeOut" }}
                    >
                        <Queen size={size} color={color} />
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

function Pawn({ size, color }: { size: number; color: string }) {
    return (
        <svg width={size} height={size} viewBox="0 0 45 45" fill={color} aria-hidden="true">
            <path
                shapeRendering="crispEdges"
                d="M22.5 11a5 5 0 1 0 0-10 5 5 0 0 0 0 10zm0 3c-4 0-7 3-7 7 0 2 1 4 2 5-4 2-6 6-6 10h22c0-4-2-8-6-10 1-1 2-3 2-5 0-4-3-7-7-7zm-11 24h22v4h-22z"
            />
        </svg>
    );
}

function Queen({ size, color }: { size: number; color: string }) {
    return (
        <svg width={size} height={size} viewBox="0 0 45 45" fill={color} aria-hidden="true">
            <path
                shapeRendering="crispEdges"
                d="M8 34h29l-2 5H10zm3-3 2-18 7 9 3-14 3 14 7-9 2 18zM9 10a2 2 0 1 1 0-4 2 2 0 0 1 0 4zm9-4a2 2 0 1 1 0-4 2 2 0 0 1 0 4zm10 4a2 2 0 1 1 0-4 2 2 0 0 1 0 4zm8 0a2 2 0 1 1 0-4 2 2 0 0 1 0 4z"
            />
        </svg>
    );
}
