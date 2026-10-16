import type { Metadata } from "next";
import { COMPANY_EMAIL, COMPANY_NAME } from "@/lib/constants";

export const metadata: Metadata = {
  title: "About",
  description: "Beside Labs LLC builds technology to support pet families through loss, aging, and care.",
};

export default function AboutPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
      <h1 className="font-serif text-3xl sm:text-4xl font-bold text-gray-900 mb-3">About Beside</h1>
      <p className="text-gray-500 mb-12">Built with love, for those who loved their pets unconditionally.</p>

      {/* Mission */}
      <section className="mb-12">
        <h2 className="font-serif text-2xl font-bold text-gray-900 mb-4">Our Mission</h2>
        <div className="bg-white border border-gray-100 rounded-xl p-6">
          <p className="text-gray-700 leading-relaxed mb-4">
            Losing a pet is one of the most isolating forms of grief. People often hear &quot;it was just a pet&quot; —
            but we know it was so much more. Your pet was family.
          </p>
          <p className="text-gray-700 leading-relaxed mb-4">
            Beside was created to make sure no one has to grieve alone. Our AI companion is available 24/7 — not as a
            replacement for professional help, but as a warm, understanding presence when you need it most.
          </p>
          <p className="text-gray-700 leading-relaxed">
            We also believe that working animals — retired military and law enforcement K9s — deserve the same love and
            care after their service. That&apos;s why we partner with organizations like Project K-9 Hero to raise
            awareness and support for these heroes.
          </p>
        </div>
      </section>

      {/* Company */}
      <section className="mb-12">
        <h2 className="font-serif text-2xl font-bold text-gray-900 mb-4">{COMPANY_NAME}</h2>
        <p className="text-gray-600 leading-relaxed mb-4">
          Beside Pet is the first product of {COMPANY_NAME}, a company registered in Wyoming, USA. We&apos;re a small,
          independent team focused on building meaningful technology for pet families.
        </p>
        <p className="text-gray-600 leading-relaxed">
          We operate with transparency, keep our costs low, and reinvest everything we earn back into making Beside
          better — and helping more animals along the way.
        </p>
      </section>

      {/* Contact */}
      <section>
        <h2 className="font-serif text-2xl font-bold text-gray-900 mb-4">Get in Touch</h2>
        <div className="bg-primary-50 border border-primary-100 rounded-xl p-6">
          <p className="text-gray-700 mb-4">
            Have a question, partnership idea, or just want to say hello? We&apos;d love to hear from you.
          </p>
          <p className="text-gray-700">
            Email us at <span className="font-medium text-primary-600">{COMPANY_EMAIL}</span>
          </p>
        </div>
      </section>
    </div>
  );
}
