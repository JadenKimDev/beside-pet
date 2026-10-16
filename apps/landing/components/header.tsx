"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import SectionPicker from "@/components/section-picker";
import { SITE_NAME } from "@/lib/constants";

export default function Header() {
  const [legalOpen, setLegalOpen] = useState(false);
  const legalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (legalRef.current && !legalRef.current.contains(e.target as Node)) {
        setLegalOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <header className="bg-white/80 backdrop-blur-sm border-b border-gray-100 sticky top-0 z-50">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Top row: logo + nav links */}
        <div className="flex items-center justify-between h-14">
          <Link href="/" className="flex items-center gap-2">
            <Image src="/images/app-icon.png" alt="Beside Pet" width={32} height={32} className="" />
            <span className="font-serif text-xl font-bold text-primary-700">{SITE_NAME}</span>
          </Link>
          <nav className="hidden sm:flex items-center gap-6">
            <Link
              href="/pricing"
              className="text-sm text-gray-500 hover:text-primary-600 transition-colors duration-300"
            >
              Pricing
            </Link>
            <Link href="/faq" className="text-sm text-gray-500 hover:text-primary-600 transition-colors duration-300">
              FAQ
            </Link>
            <div ref={legalRef} className="relative">
              <button
                type="button"
                onClick={() => setLegalOpen((v) => !v)}
                className="text-sm text-gray-500 hover:text-primary-600 transition-colors duration-300 flex items-center gap-1"
              >
                Legal
                <svg
                  aria-hidden="true"
                  className={`w-3 h-3 transition-transform duration-200 ${legalOpen ? "rotate-180" : ""}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {legalOpen && (
                <div className="absolute right-0 top-full mt-2 bg-white border border-gray-100 rounded-lg shadow-lg py-1 min-w-[120px]">
                  <Link
                    href="/terms"
                    className="block px-4 py-2 text-sm text-gray-500 hover:text-primary-600 hover:bg-gray-50 transition-colors"
                    onClick={() => setLegalOpen(false)}
                  >
                    Terms
                  </Link>
                  <Link
                    href="/privacy"
                    className="block px-4 py-2 text-sm text-gray-500 hover:text-primary-600 hover:bg-gray-50 transition-colors"
                    onClick={() => setLegalOpen(false)}
                  >
                    Privacy
                  </Link>
                </div>
              )}
            </div>
          </nav>
        </div>

        {/* Bottom row: section picker */}
        <div className="pb-2">
          <SectionPicker />
        </div>
      </div>
    </header>
  );
}
