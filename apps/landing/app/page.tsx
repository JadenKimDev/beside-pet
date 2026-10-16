import Link from "next/link";
import BlogCard from "@/components/blog-card";
import DonateBanner from "@/components/donate-banner";
import EmergencyCard from "@/components/emergency-card";
import { getAllPosts } from "@/lib/blog";
import { COMPANY_EMAIL, EMERGENCY_CONTACTS } from "@/lib/constants";

export default function HomePage() {
  const recentPosts = getAllPosts().slice(0, 3);

  return (
    <>
      {/* Hero */}
      <section id="home" className="bg-gradient-to-b from-primary-50 to-warm-50 py-20 sm:py-28">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="font-serif text-4xl sm:text-5xl font-bold text-gray-900 mb-6">
            Every pet deserves
            <br />
            <span className="text-primary-600">to be remembered.</span>
          </h1>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto mb-8">
            Beside is an AI companion for pet families navigating loss, aging, and everything in between. Available
            24/7, because grief doesn&apos;t keep office hours.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <a
              href="#"
              className="inline-flex items-center gap-2 bg-gray-900 text-white px-6 py-3 rounded-full text-sm font-medium hover:bg-gray-800 hover:-translate-y-0.5 hover:shadow-lg transition-all duration-300"
            >
              <svg aria-hidden="true" className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
              </svg>
              App Store
            </a>
            <a
              href="#"
              className="inline-flex items-center gap-2 bg-gray-900 text-white px-6 py-3 rounded-full text-sm font-medium hover:bg-gray-800 hover:-translate-y-0.5 hover:shadow-lg transition-all duration-300"
            >
              <svg aria-hidden="true" className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M3,20.5V3.5C3,2.91 3.34,2.39 3.84,2.15L13.69,12L3.84,21.85C3.34,21.61 3,21.09 3,20.5M16.81,15.12L6.05,21.34L14.54,12.85L16.81,15.12M20.16,10.81C20.5,11.08 20.75,11.5 20.75,12C20.75,12.5 20.5,12.92 20.16,13.19L17.89,14.5L15.39,12L17.89,9.5L20.16,10.81M6.05,2.66L16.81,8.88L14.54,11.15L6.05,2.66Z" />
              </svg>
              Google Play
            </a>
          </div>
          <p className="text-xs text-gray-400 mt-4">Coming soon to iOS and Android</p>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-16 sm:py-20">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="font-serif text-2xl sm:text-3xl font-bold text-center text-gray-900 mb-12">
            How Beside Helps
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="text-center p-6 rounded-xl hover:-translate-y-1 hover:shadow-md transition-all duration-500 group">
              <div className="text-4xl mb-4 transition-transform duration-500 group-hover:scale-110">💬</div>
              <h3 className="font-serif text-lg font-semibold text-gray-900 mb-2">24/7 AI Companion</h3>
              <p className="text-sm text-gray-500">
                Talk whenever you need to. Our AI understands the depth of the bond between you and your pet.
              </p>
            </div>
            <div className="text-center p-6 rounded-xl hover:-translate-y-1 hover:shadow-md transition-all duration-500 group">
              <div className="text-4xl mb-4 transition-transform duration-500 group-hover:scale-110">📝</div>
              <h3 className="font-serif text-lg font-semibold text-gray-900 mb-2">Memory Space</h3>
              <p className="text-sm text-gray-500">
                Preserve photos, write letters, and receive AI-crafted comfort letters to honor your pet&apos;s memory.
              </p>
            </div>
            <div className="text-center p-6 rounded-xl hover:-translate-y-1 hover:shadow-md transition-all duration-500 group">
              <div className="text-4xl mb-4 transition-transform duration-500 group-hover:scale-110">🚨</div>
              <h3 className="font-serif text-lg font-semibold text-gray-900 mb-2">Crisis Support</h3>
              <p className="text-sm text-gray-500">
                If you&apos;re in crisis, we connect you with professional help immediately. You&apos;re never alone.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Recent Blog Posts */}
      {recentPosts.length > 0 && (
        <section id="blog" className="py-16 sm:py-20 bg-white">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between mb-10">
              <h2 className="font-serif text-2xl sm:text-3xl font-bold text-gray-900">From Our Blog</h2>
              <Link
                href="/blog"
                className="text-sm text-primary-600 hover:text-primary-700 font-medium hover-underline-reveal"
              >
                View all &rarr;
              </Link>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {recentPosts.map((post) => (
                <BlogCard key={post.slug} post={post} />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Resources */}
      <section id="resources" className="py-16 sm:py-20">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="font-serif text-2xl sm:text-3xl font-bold text-gray-900 mb-2">Resources</h2>
          <p className="text-gray-500 mb-10 max-w-2xl">
            Whether you&apos;re in crisis or looking for support, these resources are here to help.
          </p>

          {/* Emergency Contacts */}
          <div id="emergency" className="mb-10">
            <h3 className="font-serif text-xl font-bold text-gray-900 mb-4">Emergency Contacts</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {EMERGENCY_CONTACTS.map((contact) => (
                <EmergencyCard key={contact.name} {...contact} />
              ))}
            </div>
          </div>

          {/* Helpful Organizations */}
          <div id="organizations">
            <h3 className="font-serif text-xl font-bold text-gray-900 mb-4">Helpful Organizations</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <a
                href="https://projectk9hero.org"
                target="_blank"
                rel="noopener noreferrer"
                className="block bg-white border border-gray-100 rounded-xl p-5 hover:shadow-md hover:-translate-y-0.5 transition-all duration-300"
              >
                <h4 className="font-semibold text-gray-900 mb-1">Project K-9 Hero</h4>
                <p className="text-sm text-gray-500">
                  Providing lifetime care for retired military and law enforcement K9s.
                </p>
              </a>
              <a
                href="https://www.aspca.org"
                target="_blank"
                rel="noopener noreferrer"
                className="block bg-white border border-gray-100 rounded-xl p-5 hover:shadow-md hover:-translate-y-0.5 transition-all duration-300"
              >
                <h4 className="font-semibold text-gray-900 mb-1">ASPCA</h4>
                <p className="text-sm text-gray-500">
                  America&apos;s leading animal welfare organization, providing rescue, adoption, and advocacy.
                </p>
              </a>
              <a
                href="https://www.aplb.org"
                target="_blank"
                rel="noopener noreferrer"
                className="block bg-white border border-gray-100 rounded-xl p-5 hover:shadow-md hover:-translate-y-0.5 transition-all duration-300"
              >
                <h4 className="font-semibold text-gray-900 mb-1">Association for Pet Loss and Bereavement</h4>
                <p className="text-sm text-gray-500">
                  Free online support groups and resources for pet loss grief support.
                </p>
              </a>
              <a
                href="https://www.petfinder.com"
                target="_blank"
                rel="noopener noreferrer"
                className="block bg-white border border-gray-100 rounded-xl p-5 hover:shadow-md hover:-translate-y-0.5 transition-all duration-300"
              >
                <h4 className="font-semibold text-gray-900 mb-1">Petfinder</h4>
                <p className="text-sm text-gray-500">
                  Find local shelters and adoptable pets near you. When you&apos;re ready, another pet may need you.
                </p>
              </a>
            </div>
            <div className="mt-6 text-center">
              <Link
                href="/resources"
                className="text-sm text-primary-600 hover:text-primary-700 font-medium hover-underline-reveal"
              >
                View all resources &rarr;
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* About */}
      <section id="about" className="py-16 sm:py-20 bg-white">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="font-serif text-2xl sm:text-3xl font-bold text-gray-900 mb-3">About Beside</h2>
          <p className="text-gray-500 mb-10">Built with love, for those who loved their pets unconditionally.</p>

          <div className="bg-white border border-gray-100 rounded-xl p-6 mb-8 hover:shadow-md hover:-translate-y-0.5 transition-all duration-500">
            <h3 className="font-serif text-xl font-bold text-gray-900 mb-4">Our Mission</h3>
            <p className="text-gray-700 leading-relaxed mb-4">
              Losing a pet is one of the most isolating forms of grief. People often hear &quot;it was just a pet&quot;
              — but we know it was so much more. Your pet was family.
            </p>
            <p className="text-gray-700 leading-relaxed">
              Beside was created to make sure no one has to grieve alone. Our AI companion is available 24/7 — not as a
              replacement for professional help, but as a warm, understanding presence when you need it most.
            </p>
          </div>

          <div className="bg-primary-50 border border-primary-100 rounded-xl p-6 hover:shadow-md hover:-translate-y-0.5 transition-all duration-500">
            <h3 className="font-serif text-xl font-bold text-gray-900 mb-4">Get in Touch</h3>
            <p className="text-gray-700 mb-2">Have a question, partnership idea, or just want to say hello?</p>
            <p className="text-gray-700">
              Email us at <span className="font-medium text-primary-600">{COMPANY_EMAIL}</span>
            </p>
          </div>
        </div>
      </section>

      {/* Donate Banner */}
      <section className="py-16 sm:py-20">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8">
          <DonateBanner />
        </div>
      </section>
    </>
  );
}
