import { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { FaChevronDown } from "react-icons/fa";

import { getSiteSettings } from "../../services/settingsService";
import { getPublicRewardsInfo } from "../../services/rewardsService";
import { useLanguage } from "../../context/LanguageContext";

function Faq() {
  const [openIndex, setOpenIndex] = useState(0);
  const [freeShippingThreshold, setFreeShippingThreshold] = useState(499);
  const [earnRate, setEarnRate] = useState(20);
  const { t } = useLanguage();

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
      question: t("Do you offer free shipping?", "क्या आप मुफ्त शिपिंग देते हैं?"),
      answer: t(
        `Yes! Orders above ₹${freeShippingThreshold} get free shipping. Below that, the delivery fee is small and gets lower the closer your order is to ₹${freeShippingThreshold}.`,
        `जी हां! ₹${freeShippingThreshold} से ऊपर के ऑर्डर पर मुफ्त शिपिंग मिलती है। इससे कम पर डिलीवरी शुल्क बहुत कम है और आपका ऑर्डर ₹${freeShippingThreshold} के जितना करीब होगा, उतना ही कम होगा।`,
      ),
    },
    {
      question: t(
        "Is Cash on Delivery (COD) available?",
        "क्या कैश ऑन डिलीवरी (COD) उपलब्ध है?",
      ),
      answer: t(
        "Yes, Cash on Delivery is available on all orders across India, in addition to online payment.",
        "जी हां, ऑनलाइन पेमेंट के अलावा पूरे भारत में सभी ऑर्डर पर कैश ऑन डिलीवरी उपलब्ध है।",
      ),
    },
    {
      question: t("What is your return policy?", "आपकी रिटर्न पॉलिसी क्या है?"),
      answer: t(
        "You can return an unused product in its original packaging within 7 days of delivery. Once we receive and inspect it, your refund is processed within 5-7 business days.",
        "आप डिलीवरी के 7 दिनों के भीतर बिना इस्तेमाल किए प्रोडक्ट को उसकी मूल पैकेजिंग में वापस कर सकते हैं। प्रोडक्ट मिलने और जांच के बाद, आपका रिफंड 5-7 कार्य दिवसों में प्रोसेस कर दिया जाता है।",
      ),
    },
    {
      question: t("How long does delivery take?", "डिलीवरी में कितना समय लगता है?"),
      answer: t(
        "Orders are dispatched within 1-2 business days and typically delivered in 3-7 business days depending on your location.",
        "ऑर्डर 1-2 कार्य दिवसों में भेज दिए जाते हैं और आपके स्थान के अनुसार आमतौर पर 3-7 कार्य दिवसों में डिलीवर हो जाते हैं।",
      ),
    },
    {
      question: t(
        "Do I earn rewards on my purchase?",
        "क्या मुझे खरीदारी पर रिवॉर्ड्स मिलते हैं?",
      ),
      answer: t(
        `Yes! You earn 1 loyalty point for every ₹${earnRate} you spend, which you can redeem for a discount on a future order.`,
        `जी हां! आप हर ₹${earnRate} खर्च करने पर 1 लॉयल्टी पॉइंट कमाते हैं, जिसे आप भविष्य के ऑर्डर पर छूट के लिए भुना सकते हैं।`,
      ),
    },
    {
      question: t(
        "How can I get help before ordering?",
        "ऑर्डर करने से पहले मुझे मदद कैसे मिल सकती है?",
      ),
      answer: t(
        "Chat with us anytime on WhatsApp using the button at the bottom-left of the screen, or reach out from our Contact page.",
        "स्क्रीन के नीचे-बाईं ओर दिए गए बटन से कभी भी हमसे WhatsApp पर चैट करें, या हमारे Contact पेज से संपर्क करें।",
      ),
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
          {t("Frequently Asked Questions", "अक्सर पूछे जाने वाले सवाल")}
        </h2>
        <p className="text-slate-500 text-center mb-10">
          {t(
            "Everything you need to know before you order.",
            "ऑर्डर करने से पहले जानने योग्य सब कुछ।",
          )}
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
