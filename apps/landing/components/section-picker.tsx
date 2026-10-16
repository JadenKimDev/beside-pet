"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { SECTIONS } from "@/lib/constants";

const ITEM_WIDTH = 108;
const PICKER_HEIGHT = 38;
const PILL_LEFT = 64;
const LEFT_FADE_WIDTH = 60;
const HEADER_HEIGHT = 110;

export default function SectionPicker() {
  const pathname = usePathname();
  const [currentIndex, setCurrentIndex] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const autoScrolling = useRef(false);
  const clickScrolling = useRef(false);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Track page scroll → find closest section to top ──
  useEffect(() => {
    if (pathname !== "/") return;

    const handlePageScroll = () => {
      if (clickScrolling.current) return;

      let bestIdx = 0;
      let bestDist = Infinity;

      for (let i = 0; i < SECTIONS.length; i++) {
        const el = document.getElementById(SECTIONS[i].id);
        if (!el) continue;
        const top = el.getBoundingClientRect().top;
        const dist = Math.abs(top - HEADER_HEIGHT);
        if (top <= HEADER_HEIGHT + 100 && dist < bestDist) {
          bestDist = dist;
          bestIdx = i;
        }
      }

      // Only force last section when truly at the very bottom
      const atBottom = window.innerHeight + window.scrollY >= document.body.scrollHeight - 20;
      if (atBottom) bestIdx = SECTIONS.length - 1;

      setCurrentIndex(bestIdx);
    };

    window.addEventListener("scroll", handlePageScroll, { passive: true });
    handlePageScroll();
    return () => window.removeEventListener("scroll", handlePageScroll);
  }, [pathname]);

  // ── Auto-scroll picker strip so the active item sits under the pill ──
  useEffect(() => {
    if (!scrollRef.current) return;
    autoScrolling.current = true;

    // Use rAF to ensure DOM layout is settled before scrolling
    requestAnimationFrame(() => {
      if (!scrollRef.current) return;
      scrollRef.current.scrollTo({
        left: currentIndex * ITEM_WIDTH,
        behavior: "smooth",
      });
    });

    const timer = setTimeout(() => {
      autoScrolling.current = false;
    }, 500);
    return () => clearTimeout(timer);
  }, [currentIndex]);

  // ── Handle manual picker swipe → snap & navigate page ──
  const handlePickerScroll = useCallback(() => {
    if (autoScrolling.current || !scrollRef.current) return;

    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      if (!scrollRef.current) return;
      const offset = scrollRef.current.scrollLeft;
      const newIndex = Math.round(offset / ITEM_WIDTH);
      const clamped = Math.max(0, Math.min(newIndex, SECTIONS.length - 1));

      if (clamped !== currentIndex) {
        clickScrolling.current = true;
        setCurrentIndex(clamped);
        const el = document.getElementById(SECTIONS[clamped].id);
        if (el) el.scrollIntoView({ behavior: "smooth" });
        setTimeout(() => {
          clickScrolling.current = false;
        }, 800);
      } else {
        // Snap back to exact position if user didn't scroll far enough
        scrollRef.current.scrollTo({
          left: clamped * ITEM_WIDTH,
          behavior: "smooth",
        });
      }
    }, 150);
  }, [currentIndex]);

  // ── Click on item → scroll page + picker ──
  const handleClick = (index: number) => {
    clickScrolling.current = true;
    setCurrentIndex(index);
    const el = document.getElementById(SECTIONS[index].id);
    if (el) el.scrollIntoView({ behavior: "smooth" });
    setTimeout(() => {
      clickScrolling.current = false;
    }, 800);
  };

  if (pathname !== "/") return null;

  return (
    <div className="relative" style={{ height: PICKER_HEIGHT }}>
      {/* ── Fixed pill indicator (sits behind the scroll strip) ── */}
      <div
        className="absolute top-0 z-10 pointer-events-none rounded-full bg-primary-600"
        style={{
          left: PILL_LEFT,
          width: ITEM_WIDTH,
          height: PICKER_HEIGHT,
        }}
      />

      {/* ── Horizontal scroll strip (items slide under the pill) ── */}
      <div
        ref={scrollRef}
        className="relative z-20 h-full overflow-x-auto scrollbar-hide"
        onScroll={handlePickerScroll}
      >
        <div
          className="inline-flex"
          style={{
            paddingLeft: PILL_LEFT,
            paddingRight: `calc(100vw - ${PILL_LEFT + ITEM_WIDTH}px)`,
          }}
        >
          {SECTIONS.map((section, i) => {
            const isSelected = i === currentIndex;
            return (
              <button
                key={section.id}
                type="button"
                onClick={() => handleClick(i)}
                className="flex-shrink-0 flex items-center justify-center"
                style={{
                  width: ITEM_WIDTH,
                  height: PICKER_HEIGHT,
                }}
              >
                <span
                  className="text-sm"
                  style={{
                    fontWeight: isSelected ? 700 : 400,
                    color: isSelected ? "white" : "#94a3b8",
                    letterSpacing: "-0.01em",
                    transition: "color 0.25s ease, font-weight 0.25s ease",
                  }}
                >
                  {section.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Left-edge fade ── */}
      <div
        className="absolute left-0 top-0 z-30 pointer-events-none"
        style={{
          width: LEFT_FADE_WIDTH,
          height: PICKER_HEIGHT,
          background: "linear-gradient(to right, rgba(255,255,255,0.9), transparent)",
        }}
      />

      {/* ── Right-edge fade ── */}
      <div
        className="absolute right-0 top-0 z-30 pointer-events-none"
        style={{
          width: 48,
          height: PICKER_HEIGHT,
          background: "linear-gradient(to left, rgba(255,255,255,0.9), transparent)",
        }}
      />
    </div>
  );
}
