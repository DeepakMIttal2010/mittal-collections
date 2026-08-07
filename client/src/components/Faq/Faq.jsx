import { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { FaChevronDown } from "react-icons/fa";

import { getSiteSettings } from "../../services/settingsService";
import { getPublicRewardsInfo } from "../../services/rewardsService";

function Faq() {
  const [openIndex, setOpenIndex] = useState(0);
  const [freeShippingThreshold, setFreeShippingThreshold] = useState(499);
  const [earnRate, setEarnRate] = useState(20);

  useEffect(() => {
    getSiteSettings().then((response) => {
      if (response.success) {
        setFreeShippingThreshold(
          response.settings.freeShippingThreshold ?? 499,
        );
      }
    });

    getPublicRewardsInfo().then((response) => {
      if (response.success) setEarnRate(response.loyalty.earnRate);
    });
  }, []);

  const faqs = [
    {
      question: "Do you offer free shipping?",
      answer: `Yes! Orders above ₹${freeShippingThreshold} get free shipping. Below that, the delivery fee is small and gets lower the closer your order is to ₹${freeShippingThreshold}.`,
    },
    {
      question: "Is Cash on Delivery (COD) available?",
      answer:
        "Yes, Cash on Delivery is available on all orders across India, in addition to online payment.",
    },
    {
      question: "What is your return policy?",
      answer:
        "You can return an unused product in its original packaging within 7 days of delivery. Once we receive and inspect it, your refund is processed within 5-7 business days.",
    },
    {
      question: "How long does delivery take?",
      answer:
        "Orders are dispatched within 1-2 business days and typically delivered in 3-7 business days depending on your location.",
    },
    {
      question: "Do I earn rewards on my purchase?",
      answer: `Yes! You earn 1 loyalty point for every ₹${earnRate} you spend, which you can redeem for a discount on a future order.`,
    },
    {
      question: "How can I get help before ordering?",
      answer:
        "Chat with us anytime on WhatsApp using the button at the bottom-left of the screen, or reach out from our Contact page.",
    },
  ];

  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: f.answer,
      },
    })),
  };

  return (
    <section className="py-16 bg-white">
      <Helmet>
        <script type="application/ld+json">{JSON.stringify(faqJsonLd)}</script>
      </Helmet>

      <div className="max-w-3xl mx-auto px-4">
        <h2 className="text-3xl md:text-4xl font-bold text-slate-900 text-center mb-2">
          Frequently Asked Questions
        </h2>
        <p className="text-slate-500 text-center mb-10">
          Everything you need to know before you order.
        </p>

        <div className="space-y-3">
          {faqs.map((faq, index) => {
            const isOpen = openIndex === index;

            return (
              <div
                key={index}
                className="border border-slate-200 rounded-xl overflow-hidden"
              >
                <button
                  type="button"
                  onClick={() => setOpenIndex(isOpen ? null : index)}
                  className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left"
                >
                  <span className="font-medium text-slate-800">
                    {faq.question}
                  </span>
                  <FaChevronDown
                    className={`shrink-0 text-slate-400 transition-transform ${
                      isOpen ? "rotate-180" : ""
                    }`}
                  />
                </button>

                {isOpen && (
                  <p className="px-5 pb-4 text-sm text-slate-600 leading-relaxed">
                    {faq.answer}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export default Faq;
