import type { Metadata } from "next";
import { BUY_ME_A_COFFEE_URL, PROJECT_K9_HERO_URL } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Transparency",
  description: "How Beside uses your support — server costs, operations, and charitable donations.",
};

export default function TransparencyPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
      <h1 className="font-serif text-3xl sm:text-4xl font-bold text-gray-900 mb-3">Where Your Support Goes</h1>
      <p className="text-gray-500 mb-12 max-w-2xl">
        We believe in full transparency. Here&apos;s how every dollar of support is used.
      </p>

      {/* How it works */}
      <section className="mb-12">
        <h2 className="font-serif text-2xl font-bold text-gray-900 mb-6">How It Works</h2>
        <div className="space-y-4">
          <div className="bg-white border border-gray-100 rounded-xl p-6">
            <div className="flex items-start gap-4">
              <span className="text-2xl">☕</span>
              <div>
                <h3 className="font-semibold text-gray-900 mb-1">Buy Me a Coffee &rarr; Beside Operations</h3>
                <p className="text-sm text-gray-600">
                  Coffee donations go directly to keeping Beside running — AI API costs, server hosting, domain fees,
                  and development tools.
                </p>
              </div>
            </div>
          </div>
          <div className="bg-white border border-gray-100 rounded-xl p-6">
            <div className="flex items-start gap-4">
              <span className="text-2xl">🐕‍🦺</span>
              <div>
                <h3 className="font-semibold text-gray-900 mb-1">K9 Donations &rarr; Directly to the Organization</h3>
                <p className="text-sm text-gray-600">
                  When you donate to Project K-9 Hero through our link, your money goes directly to them. Beside never
                  touches charitable donations. Your contribution is tax-deductible.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Monthly Costs */}
      <section className="mb-12">
        <h2 className="font-serif text-2xl font-bold text-gray-900 mb-6">Monthly Operating Costs</h2>
        <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left px-6 py-3 text-gray-500 font-medium">Item</th>
                <th className="text-right px-6 py-3 text-gray-500 font-medium">Estimated Cost</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-gray-50">
                <td className="px-6 py-3 text-gray-700">AI API (Vertex AI + Anthropic)</td>
                <td className="px-6 py-3 text-right text-gray-700">~$20/mo</td>
              </tr>
              <tr className="border-b border-gray-50">
                <td className="px-6 py-3 text-gray-700">Cloud Hosting (Google Cloud Run)</td>
                <td className="px-6 py-3 text-right text-gray-700">~$15/mo</td>
              </tr>
              <tr className="border-b border-gray-50">
                <td className="px-6 py-3 text-gray-700">Database (Supabase)</td>
                <td className="px-6 py-3 text-right text-gray-700">~$25/mo</td>
              </tr>
              <tr className="border-b border-gray-50">
                <td className="px-6 py-3 text-gray-700">Domain &amp; Email</td>
                <td className="px-6 py-3 text-right text-gray-700">~$2/mo</td>
              </tr>
              <tr>
                <td className="px-6 py-3 font-semibold text-gray-900">Total</td>
                <td className="px-6 py-3 text-right font-semibold text-gray-900">~$62/mo</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-xs text-gray-400 mt-3">
          Costs are estimates and may vary with usage. Updated February 2026.
        </p>
      </section>

      {/* Monthly Reports */}
      <section className="mb-12">
        <h2 className="font-serif text-2xl font-bold text-gray-900 mb-6">Monthly Reports</h2>
        <div className="bg-gray-50 border border-gray-100 rounded-xl p-8 text-center">
          <p className="text-gray-400">
            Monthly transparency reports will be published here once Beside launches publicly.
          </p>
        </div>
      </section>

      {/* CTA */}
      <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
        <a
          href={BUY_ME_A_COFFEE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 bg-primary-600 text-white px-6 py-3 rounded-full font-medium hover:bg-primary-700 transition-colors"
        >
          ☕ Buy Us a Coffee
        </a>
        <a
          href={PROJECT_K9_HERO_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 bg-gray-900 text-white px-6 py-3 rounded-full font-medium hover:bg-gray-800 transition-colors"
        >
          🐕‍🦺 Donate to K9 Heroes
        </a>
      </div>
    </div>
  );
}
