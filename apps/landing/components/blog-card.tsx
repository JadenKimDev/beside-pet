import Link from "next/link";
import type { BlogPost } from "@/lib/blog";

export default function BlogCard({ post }: { post: BlogPost }) {
  return (
    <Link
      href={`/blog/${post.slug}`}
      className="group block bg-white rounded-xl border border-gray-100 overflow-hidden hover:shadow-md transition-shadow"
    >
      {post.coverImage && (
        <div className="aspect-[16/9] bg-gray-100 overflow-hidden">
          <img
            src={post.coverImage}
            alt={post.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        </div>
      )}
      <div className="p-5">
        <span className="inline-block text-xs font-medium text-primary-600 bg-primary-50 px-2 py-0.5 rounded-full mb-2">
          {post.category}
        </span>
        <h3 className="font-serif text-lg font-semibold text-gray-900 group-hover:text-primary-600 transition-colors mb-2">
          {post.title}
        </h3>
        <p className="text-sm text-gray-500 line-clamp-2">{post.excerpt}</p>
        <p className="text-xs text-gray-400 mt-3">
          {new Date(post.date).toLocaleDateString("en-US", {
            month: "long",
            day: "numeric",
            year: "numeric",
          })}
        </p>
      </div>
    </Link>
  );
}
