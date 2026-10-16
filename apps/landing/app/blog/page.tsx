import type { Metadata } from "next";
import BlogCard from "@/components/blog-card";
import { getAllPosts } from "@/lib/blog";

export const metadata: Metadata = {
  title: "Blog",
  description: "Stories, guides, and resources for pet families navigating loss, aging, and care.",
};

export default function BlogPage() {
  const posts = getAllPosts();

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
      <h1 className="font-serif text-3xl sm:text-4xl font-bold text-gray-900 mb-3">Blog</h1>
      <p className="text-gray-500 mb-10 max-w-2xl">
        Stories of love, loss, and the bonds that never break. Updated weekly.
      </p>

      {posts.length === 0 ? (
        <p className="text-gray-400 text-center py-20">New stories coming soon. Check back next week.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {posts.map((post) => (
            <BlogCard key={post.slug} post={post} />
          ))}
        </div>
      )}
    </div>
  );
}
