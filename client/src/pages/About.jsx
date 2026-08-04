import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import Seo from "../components/Seo";
import { getCategories } from "../services/categoryService";

function About() {
  const [categories, setCategories] = useState([]);

  useEffect(() => {
    const loadCategories = async () => {
      const response = await getCategories();

      if (response.success) setCategories(response.categories);
    };

    loadCategories();
  }, []);

  return (
    <div className="max-w-4xl mx-auto px-4 pt-16 pb-20">
      <Seo
        title="About Us"
        description="Mittal Collections is a home furnishing store offering premium bedsheets, towels, curtains, pillows, cushions and blankets — quality materials, fast delivery and easy returns."
        url="https://www.mittalcollections.com/about"
      />

      <h1 className="text-4xl md:text-5xl font-bold text-slate-900 mb-4">
        About Mittal Collections
      </h1>

      <p className="text-slate-600 leading-relaxed mb-6">
        Mittal Collections is a home furnishing store built around a simple
        idea: everyday essentials for your home should feel premium without
        being complicated to shop for. We put together a focused range of
        bedsheets, towels, curtains, pillows, cushions and blankets, chosen
        for their materials and finish rather than sheer volume.
      </p>

      <p className="text-slate-600 leading-relaxed mb-10">
        Every order ships with secure packaging and doorstep delivery, and if
        something isn&apos;t right, our return process is straightforward —
        no runaround. We&apos;d rather you trust one purchase enough to make
        a second.
      </p>

      {categories.length > 0 && (
        <div className="mb-10">
          <h2 className="text-2xl font-bold text-slate-900 mb-4">
            What We Offer
          </h2>
          <div className="flex flex-wrap gap-3">
            {categories.map((category) => (
              <Link
                key={category._id}
                to={`/category/${category.slug}`}
                className="border border-slate-300 rounded-full px-5 py-2 text-sm font-medium text-slate-700 hover:border-amber-500 hover:text-amber-600 transition-colors"
              >
                {category.name}
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="bg-slate-50 border border-slate-200 rounded-xl p-6">
        <h2 className="text-lg font-semibold text-slate-900 mb-2">
          Questions before you order?
        </h2>
        <p className="text-slate-600 mb-4">
          We&apos;re happy to help with sizing, fabric care or bulk orders.
        </p>
        <Link
          to="/contact"
          className="inline-block bg-blue-900 hover:bg-blue-950 text-white font-semibold rounded-full px-6 py-3 transition-colors"
        >
          Get in touch
        </Link>
      </div>
    </div>
  );
}

export default About;
