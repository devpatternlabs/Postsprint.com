const fs = require('fs');
const path = require('path');

// Helper to update head section of an HTML file
function updateHead(filePath, config) {
  let content = fs.readFileSync(filePath, 'utf8');

  // 1. Remove existing meta description, robots, canonical, og, twitter, ld+json tags
  content = content.replace(/<title>[\s\S]*?<\/title>/i, '');
  content = content.replace(/<meta\s+name=["']description["'][^>]*>/gi, '');
  content = content.replace(/<meta\s+name=["']robots["'][^>]*>/gi, '');
  content = content.replace(/<link\s+rel=["']canonical["'][^>]*>/gi, '');
  content = content.replace(/<meta\s+property=["']og:[^"']+["'][^>]*>/gi, '');
  content = content.replace(/<meta\s+name=["']twitter:[^"']+["'][^>]*>/gi, '');
  content = content.replace(/<script\s+type=["']application\/ld\+json["']>[\s\S]*?<\/script>/gi, '');

  const newHeadTags = [
    `<title>${config.title}</title>`,
    `<meta name="description" content="${config.description}">`,
    `<meta name="robots" content="index, follow">`,
    `<link rel="canonical" href="${config.canonical}">`,
    `<!-- Open Graph Meta -->`,
    `<meta property="og:type" content="${config.ogType || 'website'}">`,
    `<meta property="og:site_name" content="PostSprint">`,
    `<meta property="og:url" content="${config.canonical}">`,
    `<meta property="og:title" content="${config.title}">`,
    `<meta property="og:description" content="${config.description}">`,
    `<meta property="og:image" content="${config.ogImage || 'https://postsprint.devpatternlabs.com/assets/landing-reference.webp'}">`,
    `<meta property="og:image:width" content="1200">`,
    `<meta property="og:image:height" content="630">`,
    `<!-- Twitter Card Meta -->`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:site" content="@postsprint">`,
    `<meta name="twitter:url" content="${config.canonical}">`,
    `<meta name="twitter:title" content="${config.title}">`,
    `<meta name="twitter:description" content="${config.description}">`,
    `<meta name="twitter:image" content="${config.ogImage || 'https://postsprint.devpatternlabs.com/assets/landing-reference.webp'}">`,
    `<!-- Structured Data -->`,
    `<script type="application/ld+json">`,
    JSON.stringify(config.schema, null, 2),
    `</script>`
  ].join('\n');

  // Insert right after <head> or right before </head>
  // In index.html, we insert before </style> or right after <head>
  if (content.includes('<head>')) {
    content = content.replace('<head>', `<head>\n${newHeadTags}\n`);
  } else if (content.includes('<head ')) {
    content = content.replace(/(<head[^>]*>)/i, `$1\n${newHeadTags}\n`);
  }

  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`Updated SEO metadata in: ${path.basename(filePath)}`);
}

// 1. index.html
updateHead('index.html', {
  title: 'PostSprint — Social Media Scheduling & Management Platform',
  description: 'PostSprint is the all-in-one social media scheduler to plan, create, and publish lossless content to Instagram, Facebook, and YouTube simultaneously.',
  canonical: 'https://postsprint.devpatternlabs.com/',
  ogType: 'website',
  schema: {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": "https://postsprint.devpatternlabs.com/#organization",
        "name": "PostSprint",
        "url": "https://postsprint.devpatternlabs.com/",
        "logo": {
          "@type": "ImageObject",
          "url": "https://postsprint.devpatternlabs.com/assets/postsprint-icon.png",
          "width": "512",
          "height": "512"
        },
        "sameAs": [
          "https://twitter.com/postsprint",
          "https://www.youtube.com/@postsprint",
          "https://www.instagram.com/postsprint"
        ],
        "contactPoint": {
          "@type": "ContactPoint",
          "contactType": "customer support",
          "url": "https://postsprint.devpatternlabs.com/contact.html"
        }
      },
      {
        "@type": "WebSite",
        "@id": "https://postsprint.devpatternlabs.com/#website",
        "url": "https://postsprint.devpatternlabs.com/",
        "name": "PostSprint",
        "publisher": {
          "@id": "https://postsprint.devpatternlabs.com/#organization"
        }
      },
      {
        "@type": "SoftwareApplication",
        "@id": "https://postsprint.devpatternlabs.com/#software",
        "name": "PostSprint",
        "operatingSystem": "All",
        "applicationCategory": "BusinessApplication",
        "offers": {
          "@type": "Offer",
          "price": "0",
          "priceCurrency": "USD"
        },
        "aggregateRating": {
          "@type": "AggregateRating",
          "ratingValue": "4.9",
          "ratingCount": "1280",
          "bestRating": "5",
          "worstRating": "1"
        }
      },
      {
        "@type": "FAQPage",
        "@id": "https://postsprint.devpatternlabs.com/#faq",
        "mainEntity": [
          {
            "@type": "Question",
            "name": "What can I do with PostSprint?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "PostSprint is designed for creating social posts, planning a content calendar, organizing media and managing your multi-platform content workflow from one unified dashboard."
            }
          },
          {
            "@type": "Question",
            "name": "Can I publish to Instagram, Facebook, and YouTube simultaneously?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "Yes. PostSprint connects directly to Instagram Graph API, Facebook Pages API, and YouTube Data API v3 for seamless lossless multi-platform publishing."
            }
          },
          {
            "@type": "Question",
            "name": "Will I need to share my social media passwords?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "No. PostSprint uses official OAuth 2.0 authorization flows. We never see, ask for, or store your social media account passwords."
            }
          },
          {
            "@type": "Question",
            "name": "Does PostSprint work on mobile?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "Yes, PostSprint is fully responsive and optimized for mobile, tablet, and desktop screens so you can manage campaigns from anywhere."
            }
          }
        ]
      }
    ]
  }
});

// 2. features.html
updateHead('features.html', {
  title: 'Features — PostSprint Social Media Scheduling Tools',
  description: 'Explore PostSprint features: multi-platform visual calendar, lossless video publishing, AI caption generator, real-time analytics, and bulk scheduler.',
  canonical: 'https://postsprint.devpatternlabs.com/features.html',
  schema: {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        "@id": "https://postsprint.devpatternlabs.com/features.html",
        "url": "https://postsprint.devpatternlabs.com/features.html",
        "name": "Features — PostSprint Social Media Scheduling Tools",
        "description": "Explore PostSprint features: multi-platform visual calendar, lossless video publishing, AI caption generator, real-time analytics, and bulk scheduler."
      },
      {
        "@type": "BreadcrumbList",
        "itemListElement": [
          { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://postsprint.devpatternlabs.com/" },
          { "@type": "ListItem", "position": 2, "name": "Features", "item": "https://postsprint.devpatternlabs.com/features.html" }
        ]
      }
    ]
  }
});

// 3. pricing.html
updateHead('pricing.html', {
  title: 'Pricing Plans — PostSprint Social Content Studio',
  description: 'Simple, transparent pricing for creators, brands, and agencies. Unlimited scheduling, multi-account publishing, and AI tools with zero hidden fees.',
  canonical: 'https://postsprint.devpatternlabs.com/pricing.html',
  schema: {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        "@id": "https://postsprint.devpatternlabs.com/pricing.html",
        "url": "https://postsprint.devpatternlabs.com/pricing.html",
        "name": "Pricing Plans — PostSprint Social Content Studio",
        "description": "Simple, transparent pricing for creators, brands, and agencies. Unlimited scheduling, multi-account publishing, and AI tools with zero hidden fees."
      },
      {
        "@type": "Product",
        "name": "PostSprint Subscription",
        "description": "Professional social media management and multi-platform scheduling platform.",
        "brand": { "@type": "Brand", "name": "PostSprint" },
        "offers": [
          {
            "@type": "Offer",
            "name": "Creator Plan",
            "price": "19",
            "priceCurrency": "USD",
            "priceValidUntil": "2027-12-31",
            "availability": "https://schema.org/InStock",
            "url": "https://postsprint.devpatternlabs.com/pricing.html"
          },
          {
            "@type": "Offer",
            "name": "Pro Team Plan",
            "price": "49",
            "priceCurrency": "USD",
            "priceValidUntil": "2027-12-31",
            "availability": "https://schema.org/InStock",
            "url": "https://postsprint.devpatternlabs.com/pricing.html"
          },
          {
            "@type": "Offer",
            "name": "Agency Plan",
            "price": "99",
            "priceCurrency": "USD",
            "priceValidUntil": "2027-12-31",
            "availability": "https://schema.org/InStock",
            "url": "https://postsprint.devpatternlabs.com/pricing.html"
          }
        ]
      },
      {
        "@type": "BreadcrumbList",
        "itemListElement": [
          { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://postsprint.devpatternlabs.com/" },
          { "@type": "ListItem", "position": 2, "name": "Pricing", "item": "https://postsprint.devpatternlabs.com/pricing.html" }
        ]
      }
    ]
  }
});

// 4. use-cases.html
updateHead('use-cases.html', {
  title: 'Use Cases — Social Media Management for Teams & Creators | PostSprint',
  description: 'Discover how solo creators, digital agencies, e-commerce brands, and marketing teams scale their organic social presence with PostSprint.',
  canonical: 'https://postsprint.devpatternlabs.com/use-cases.html',
  schema: {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        "@id": "https://postsprint.devpatternlabs.com/use-cases.html",
        "url": "https://postsprint.devpatternlabs.com/use-cases.html",
        "name": "Use Cases — Social Media Management for Teams & Creators | PostSprint",
        "description": "Discover how solo creators, digital agencies, e-commerce brands, and marketing teams scale their organic social presence with PostSprint."
      },
      {
        "@type": "BreadcrumbList",
        "itemListElement": [
          { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://postsprint.devpatternlabs.com/" },
          { "@type": "ListItem", "position": 2, "name": "Use Cases", "item": "https://postsprint.devpatternlabs.com/use-cases.html" }
        ]
      }
    ]
  }
});

// 5. blog.html
updateHead('blog.html', {
  title: 'PostSprint Journal — Social Media Strategy, Growth & Guides',
  description: 'Actionable guides, growth frameworks, and expert tips on social media scheduling, algorithm updates, content planning, and engagement.',
  canonical: 'https://postsprint.devpatternlabs.com/blog.html',
  schema: {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Blog",
        "@id": "https://postsprint.devpatternlabs.com/blog.html",
        "url": "https://postsprint.devpatternlabs.com/blog.html",
        "name": "PostSprint Journal — Social Media Strategy, Growth & Guides",
        "description": "Actionable guides, growth frameworks, and expert tips on social media scheduling, algorithm updates, content planning, and engagement."
      },
      {
        "@type": "BreadcrumbList",
        "itemListElement": [
          { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://postsprint.devpatternlabs.com/" },
          { "@type": "ListItem", "position": 2, "name": "Journal", "item": "https://postsprint.devpatternlabs.com/blog.html" }
        ]
      }
    ]
  }
});

// 6. blog-content-calendar.html
updateHead('blog-content-calendar.html', {
  title: 'How to Build a Social Media Content Calendar (Step-by-Step) | PostSprint',
  description: 'Master social media planning with our step-by-step guide to building a high-converting content calendar for Instagram, Facebook, and YouTube.',
  canonical: 'https://postsprint.devpatternlabs.com/blog-content-calendar.html',
  ogType: 'article',
  ogImage: 'https://postsprint.devpatternlabs.com/assets/preview-1.webp',
  schema: {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "BlogPosting",
        "@id": "https://postsprint.devpatternlabs.com/blog-content-calendar.html#article",
        "headline": "How to Build a Useful Social Media Content Calendar",
        "description": "Master social media planning with our step-by-step guide to building a high-converting content calendar for Instagram, Facebook, and YouTube.",
        "image": "https://postsprint.devpatternlabs.com/assets/preview-1.webp",
        "datePublished": "2026-10-10T09:00:00+00:00",
        "dateModified": "2026-10-16T12:00:00+00:00",
        "author": {
          "@type": "Organization",
          "name": "PostSprint Editorial"
        },
        "publisher": {
          "@type": "Organization",
          "name": "PostSprint",
          "logo": {
            "@type": "ImageObject",
            "url": "https://postsprint.devpatternlabs.com/assets/postsprint-icon.png"
          }
        },
        "mainEntityOfPage": "https://postsprint.devpatternlabs.com/blog-content-calendar.html"
      },
      {
        "@type": "BreadcrumbList",
        "itemListElement": [
          { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://postsprint.devpatternlabs.com/" },
          { "@type": "ListItem", "position": 2, "name": "Journal", "item": "https://postsprint.devpatternlabs.com/blog.html" },
          { "@type": "ListItem", "position": 3, "name": "Content Calendar Guide", "item": "https://postsprint.devpatternlabs.com/blog-content-calendar.html" }
        ]
      }
    ]
  }
});

// 7. security.html
updateHead('security.html', {
  title: 'Security & Compliance — Safe Social Media Publishing | PostSprint',
  description: 'Learn how PostSprint protects your social accounts with OAuth 2.0 authorization, encrypted token storage, and official platform API compliance.',
  canonical: 'https://postsprint.devpatternlabs.com/security.html',
  schema: {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        "@id": "https://postsprint.devpatternlabs.com/security.html",
        "url": "https://postsprint.devpatternlabs.com/security.html",
        "name": "Security & Compliance — Safe Social Media Publishing | PostSprint",
        "description": "Learn how PostSprint protects your social accounts with OAuth 2.0 authorization, encrypted token storage, and official platform API compliance."
      },
      {
        "@type": "BreadcrumbList",
        "itemListElement": [
          { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://postsprint.devpatternlabs.com/" },
          { "@type": "ListItem", "position": 2, "name": "Security", "item": "https://postsprint.devpatternlabs.com/security.html" }
        ]
      }
    ]
  }
});

// 8. account-safety.html
updateHead('account-safety.html', {
  title: 'Account Safety Guide — Platform Protection Standards | PostSprint',
  description: 'Understand PostSprint account safety standards: zero password storage, official API access tokens, rate limit protection, and automated health checks.',
  canonical: 'https://postsprint.devpatternlabs.com/account-safety.html',
  schema: {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        "@id": "https://postsprint.devpatternlabs.com/account-safety.html",
        "url": "https://postsprint.devpatternlabs.com/account-safety.html",
        "name": "Account Safety Guide — Platform Protection Standards | PostSprint",
        "description": "Understand PostSprint account safety standards: zero password storage, official API access tokens, rate limit protection, and automated health checks."
      },
      {
        "@type": "BreadcrumbList",
        "itemListElement": [
          { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://postsprint.devpatternlabs.com/" },
          { "@type": "ListItem", "position": 2, "name": "Account Safety", "item": "https://postsprint.devpatternlabs.com/account-safety.html" }
        ]
      }
    ]
  }
});

// 9. contact.html
updateHead('contact.html', {
  title: 'Contact Us — Get in Touch with PostSprint Support & Sales',
  description: 'Have questions about PostSprint? Reach out to our customer support, partnership, or enterprise sales team for fast assistance.',
  canonical: 'https://postsprint.devpatternlabs.com/contact.html',
  schema: {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "ContactPage",
        "@id": "https://postsprint.devpatternlabs.com/contact.html",
        "url": "https://postsprint.devpatternlabs.com/contact.html",
        "name": "Contact Us — Get in Touch with PostSprint Support & Sales",
        "description": "Have questions about PostSprint? Reach out to our customer support, partnership, or enterprise sales team for fast assistance."
      },
      {
        "@type": "BreadcrumbList",
        "itemListElement": [
          { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://postsprint.devpatternlabs.com/" },
          { "@type": "ListItem", "position": 2, "name": "Contact", "item": "https://postsprint.devpatternlabs.com/contact.html" }
        ]
      }
    ]
  }
});

// 10. help.html
updateHead('help.html', {
  title: 'Help Center & Knowledge Base — Frequently Asked Questions | PostSprint',
  description: 'Browse help articles, troubleshooting tutorials, FAQs, and setup guides for connecting social accounts, scheduling posts, and team workflows.',
  canonical: 'https://postsprint.devpatternlabs.com/help.html',
  schema: {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "FAQPage",
        "@id": "https://postsprint.devpatternlabs.com/help.html#faq",
        "name": "Help Center & Knowledge Base — Frequently Asked Questions | PostSprint",
        "mainEntity": [
          {
            "@type": "Question",
            "name": "What is Postsprint?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "PostSprint is a next-generation social content studio that lets creators and brands plan, schedule, and publish lossless content to Instagram, Facebook, and YouTube simultaneously."
            }
          },
          {
            "@type": "Question",
            "name": "Can I connect Instagram, Facebook and YouTube?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "Yes. PostSprint connects directly with official Meta (Instagram & Facebook) and Google (YouTube) APIs via secure OAuth 2.0."
            }
          },
          {
            "@type": "Question",
            "name": "Do I need to share my social account passwords?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "Never. All connections utilize official platform tokens. Your login credentials are exchanged directly with Google and Meta."
            }
          },
          {
            "@type": "Question",
            "name": "Does Postsprint offer AI writing help?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "Yes, PostSprint includes an integrated AI caption generator and hashtag optimizer to help craft high-performing copy across channels."
            }
          },
          {
            "@type": "Question",
            "name": "How much does Postsprint cost?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "PostSprint offers flexible plans starting with a free tier, and affordable Creator ($19/mo), Pro ($49/mo), and Agency ($99/mo) plans with no hidden fees."
            }
          }
        ]
      },
      {
        "@type": "BreadcrumbList",
        "itemListElement": [
          { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://postsprint.devpatternlabs.com/" },
          { "@type": "ListItem", "position": 2, "name": "Help & FAQs", "item": "https://postsprint.devpatternlabs.com/help.html" }
        ]
      }
    ]
  }
});

// 11. privacy.html
updateHead('privacy.html', {
  title: 'Privacy Policy — How We Handle Your Data | PostSprint',
  description: 'Read PostSprint\'s Privacy Policy. Learn how we collect, process, and protect your personal information and social media account data.',
  canonical: 'https://postsprint.devpatternlabs.com/privacy.html',
  schema: {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        "@id": "https://postsprint.devpatternlabs.com/privacy.html",
        "url": "https://postsprint.devpatternlabs.com/privacy.html",
        "name": "Privacy Policy — How We Handle Your Data | PostSprint",
        "description": "Read PostSprint's Privacy Policy. Learn how we collect, process, and protect your personal information and social media account data."
      },
      {
        "@type": "BreadcrumbList",
        "itemListElement": [
          { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://postsprint.devpatternlabs.com/" },
          { "@type": "ListItem", "position": 2, "name": "Privacy Policy", "item": "https://postsprint.devpatternlabs.com/privacy.html" }
        ]
      }
    ]
  }
});

// 12. terms.html
updateHead('terms.html', {
  title: 'Terms of Service — User Agreement & Usage Terms | PostSprint',
  description: 'Read the Terms of Service for PostSprint. Understand your rights, acceptable use policies, subscription terms, and platform service agreements.',
  canonical: 'https://postsprint.devpatternlabs.com/terms.html',
  schema: {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        "@id": "https://postsprint.devpatternlabs.com/terms.html",
        "url": "https://postsprint.devpatternlabs.com/terms.html",
        "name": "Terms of Service — User Agreement & Usage Terms | PostSprint",
        "description": "Read the Terms of Service for PostSprint. Understand your rights, acceptable use policies, subscription terms, and platform service agreements."
      },
      {
        "@type": "BreadcrumbList",
        "itemListElement": [
          { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://postsprint.devpatternlabs.com/" },
          { "@type": "ListItem", "position": 2, "name": "Terms of Service", "item": "https://postsprint.devpatternlabs.com/terms.html" }
        ]
      }
    ]
  }
});

// 13. data-deletion.html
updateHead('data-deletion.html', {
  title: 'Data Deletion Instructions — Manage Your Data | PostSprint',
  description: 'Step-by-step instructions on requesting data deletion and revoking social media permissions for PostSprint accounts.',
  canonical: 'https://postsprint.devpatternlabs.com/data-deletion.html',
  schema: {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        "@id": "https://postsprint.devpatternlabs.com/data-deletion.html",
        "url": "https://postsprint.devpatternlabs.com/data-deletion.html",
        "name": "Data Deletion Instructions — Manage Your Data | PostSprint",
        "description": "Step-by-step instructions on requesting data deletion and revoking social media permissions for PostSprint accounts."
      },
      {
        "@type": "BreadcrumbList",
        "itemListElement": [
          { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://postsprint.devpatternlabs.com/" },
          { "@type": "ListItem", "position": 2, "name": "Data Deletion", "item": "https://postsprint.devpatternlabs.com/data-deletion.html" }
        ]
      }
    ]
  }
});

console.log('ALL 13 PAGES SEO HEADS UPDATED SUCCESSFULLY!');
