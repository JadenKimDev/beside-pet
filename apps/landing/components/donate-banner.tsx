import { BUY_ME_A_COFFEE_URL } from "@/lib/constants";

export default function DonateBanner() {
  return (
    <div className="bg-primary-50 border border-primary-100 rounded-xl p-6 text-center">
      <p className="text-sm text-primary-800 mb-3">
        Beside is run by a small team passionate about helping pet families. Your support keeps us going.
      </p>
      <a
        href={BUY_ME_A_COFFEE_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 bg-primary-600 text-white text-sm font-medium px-5 py-2.5 rounded-full hover:bg-primary-700 transition-colors"
      >
        <span>☕</span>
        <span>Buy Us a Coffee</span>
      </a>
    </div>
  );
}
