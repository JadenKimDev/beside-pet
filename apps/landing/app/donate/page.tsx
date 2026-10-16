import type { Metadata } from "next";
import { BUY_ME_A_COFFEE_URL, PROJECT_K9_HERO_URL } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Donate",
  description:
    "Support Beside's mission to help pet families, or donate directly to organizations caring for retired K9s.",
};

export default function DonatePage() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
      <h1 className="font-serif text-3xl sm:text-4xl font-bold text-gray-900 mb-3">Support Our Mission</h1>
      <p className="text-gray-500 mb-12 max-w-2xl">
        Your coffee keeps Beside running. Your donation saves retired K9s.
      </p>

      {/* Buy Me a Coffee */}
      <section className="mb-12">
        <div className="bg-primary-50 border border-primary-100 rounded-xl p-8">
          <div className="text-center">
            <div className="text-5xl mb-4">☕</div>
            <h2 className="font-serif text-2xl font-bold text-gray-900 mb-3">Buy Us a Coffee</h2>
            <p className="text-gray-600 mb-6 max-w-lg mx-auto">
              Beside is built by a small, passionate team. Every coffee helps us keep the servers running and the AI
              companion available 24/7 for people who need it most.
            </p>
            <a
              href={BUY_ME_A_COFFEE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 bg-primary-600 text-white px-8 py-3 rounded-full font-medium hover:bg-primary-700 transition-colors"
            >
              ☕ Buy Us a Coffee
            </a>
          </div>
        </div>
      </section>

      {/* K9 Donation */}
      <section className="mb-12">
        <div className="bg-white border border-gray-100 rounded-xl p-8">
          <div className="text-center">
            <div className="text-5xl mb-4">🐕‍🦺</div>
            <h2 className="font-serif text-2xl font-bold text-gray-900 mb-3">Help Retired K9 Heroes</h2>
            <p className="text-gray-600 mb-4 max-w-lg mx-auto">
              Military and law enforcement K9s serve with bravery. After retirement, many need ongoing medical care and
              a loving home. Project K-9 Hero provides exactly that.
            </p>
            <p className="text-sm text-gray-500 mb-6">
              This link goes directly to Project K-9 Hero. Beside does not collect or handle any of these donations.
              Your contribution is tax-deductible.
            </p>
            <a
              href={PROJECT_K9_HERO_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 bg-gray-900 text-white px-8 py-3 rounded-full font-medium hover:bg-gray-800 transition-colors"
            >
              Donate to Project K-9 Hero &rarr;
            </a>
          </div>
        </div>
      </section>

      {/* Transparency note */}
      <div className="text-center text-sm text-gray-400">
        <p>
          Want to know where your support goes?{" "}
          <a href="/transparency" className="text-primary-600 hover:text-primary-700 underline">
            See our transparency report
          </a>
          .
        </p>
      </div>
    </div>
  );
}
