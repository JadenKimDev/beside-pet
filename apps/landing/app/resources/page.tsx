import type { Metadata } from "next";
import EmergencyCard from "@/components/emergency-card";
import { EMERGENCY_CONTACTS } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Resources",
  description: "Emergency contacts, pet loss first aid, and helpful organizations for pet families in crisis.",
};

export default function ResourcesPage() {
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
      <h1 className="font-serif text-3xl sm:text-4xl font-bold text-gray-900 mb-3">Resources</h1>
      <p className="text-gray-500 mb-12 max-w-2xl">
        Whether you&apos;re in crisis or looking for support, these resources are here to help.
      </p>

      {/* Emergency Contacts */}
      <section className="mb-14">
        <h2 className="font-serif text-2xl font-bold text-gray-900 mb-2">Emergency Contacts</h2>
        <p className="text-sm text-gray-500 mb-6">
          If you or someone you know is in immediate danger, please reach out.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {EMERGENCY_CONTACTS.map((contact) => (
            <EmergencyCard key={contact.name} {...contact} />
          ))}
        </div>
      </section>

      {/* Pet Loss First Aid */}
      <section className="mb-14">
        <h2 className="font-serif text-2xl font-bold text-gray-900 mb-2">Pet Loss First Aid</h2>
        <p className="text-sm text-gray-500 mb-6">
          Losing a pet is one of the most painful experiences. Here are some things that may help in the first days.
        </p>
        <div className="bg-white border border-gray-100 rounded-xl p-6 space-y-5">
          <div>
            <h3 className="font-semibold text-gray-900 mb-1">It&apos;s okay to grieve</h3>
            <p className="text-sm text-gray-600">
              Your grief is valid. The bond you shared was real, and losing it hurts. There is no &quot;right&quot;
              timeline for healing.
            </p>
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 mb-1">Take care of yourself</h3>
            <p className="text-sm text-gray-600">
              Eat, hydrate, and rest even when it feels impossible. Your body needs you right now, too.
            </p>
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 mb-1">Talk to someone</h3>
            <p className="text-sm text-gray-600">
              Whether it&apos;s a friend, a professional, or Beside&apos;s AI companion — don&apos;t carry this alone.
              Sharing your story is part of healing.
            </p>
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 mb-1">When to seek professional help</h3>
            <p className="text-sm text-gray-600">
              If your grief feels overwhelming, if you&apos;re having thoughts of self-harm, or if daily life becomes
              unmanageable — please reach out to a mental health professional. Call 988 anytime.
            </p>
          </div>
        </div>
      </section>

      {/* Helpful Organizations */}
      <section className="mb-14">
        <h2 className="font-serif text-2xl font-bold text-gray-900 mb-2">Helpful Organizations</h2>
        <p className="text-sm text-gray-500 mb-6">Organizations doing incredible work for animals and their people.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <a
            href="https://projectk9hero.org"
            target="_blank"
            rel="noopener noreferrer"
            className="block bg-white border border-gray-100 rounded-xl p-5 hover:shadow-md transition-shadow"
          >
            <h3 className="font-semibold text-gray-900 mb-1">Project K-9 Hero</h3>
            <p className="text-sm text-gray-500">
              Providing lifetime care for retired military and law enforcement K9s. Charity Navigator 4-star rated.
            </p>
          </a>
          <a
            href="https://www.aspca.org"
            target="_blank"
            rel="noopener noreferrer"
            className="block bg-white border border-gray-100 rounded-xl p-5 hover:shadow-md transition-shadow"
          >
            <h3 className="font-semibold text-gray-900 mb-1">ASPCA</h3>
            <p className="text-sm text-gray-500">
              America&apos;s leading animal welfare organization, providing rescue, adoption, and advocacy.
            </p>
          </a>
          <a
            href="https://www.petfinder.com"
            target="_blank"
            rel="noopener noreferrer"
            className="block bg-white border border-gray-100 rounded-xl p-5 hover:shadow-md transition-shadow"
          >
            <h3 className="font-semibold text-gray-900 mb-1">Petfinder</h3>
            <p className="text-sm text-gray-500">
              Find local shelters and adoptable pets near you. When you&apos;re ready, another pet may need you.
            </p>
          </a>
          <a
            href="https://www.aplb.org"
            target="_blank"
            rel="noopener noreferrer"
            className="block bg-white border border-gray-100 rounded-xl p-5 hover:shadow-md transition-shadow"
          >
            <h3 className="font-semibold text-gray-900 mb-1">Association for Pet Loss and Bereavement</h3>
            <p className="text-sm text-gray-500">
              Free online support groups and resources for pet loss grief support.
            </p>
          </a>
        </div>
      </section>

      {/* Partners placeholder */}
      <section>
        <h2 className="font-serif text-2xl font-bold text-gray-900 mb-2">Partners</h2>
        <p className="text-sm text-gray-500">
          Interested in partnering with Beside? We&apos;re always looking for organizations that share our mission.{" "}
          <a href="/about" className="text-primary-600 hover:text-primary-700 underline">
            Get in touch
          </a>
          .
        </p>
      </section>
    </div>
  );
}
