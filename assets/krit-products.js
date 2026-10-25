/* KRIT product list — the ONE place product names, sizes, prices and
   images live. Used by every page, and the server reads the prices from here
   too (pricing.js), so a price change here is a price change everywhere. */
var KRIT_PRODUCTS = [
  {
    id: "contour-3",
    sku: "KRIT-LTX-2012-03-CONTOUR",
    name: "Contour Pillow",
    subtitle: "20 x 12 x 3 inch",
    height: "3 inch",
    price: 1999,
    badge: "Doctor Recommended",
    badgeColor: "#2F5DA8",
    labels: ["Back sleeper", "Side sleeper", "Neck pain relief"],
    category: "neck-support",
    categoryLabel: "Neck Support",
    rating: "4.9",
    firmness: "Medium firm",
    sleepStyle: "Back / side",
    desc: "Deep contouring for customers who need stronger cervical support and a more therapeutic sleep profile.",
    images: [
      "https://res.cloudinary.com/djicyjlid/image/upload/v1775066290/Contour_Main_itrbg7.png",
      "https://res.cloudinary.com/djicyjlid/image/upload/v1775066290/Contour_Lifestyle_1_sghyqz.png",
      "https://res.cloudinary.com/djicyjlid/image/upload/v1775066289/Contour_Air_rpvfwd.png",
      "https://res.cloudinary.com/djicyjlid/image/upload/v1775066289/Contour_Core_vrb9u3.png",
      "https://res.cloudinary.com/djicyjlid/image/upload/v1775066289/Contour_Dimensions_rz1etw.png",
      "https://res.cloudinary.com/djicyjlid/image/upload/v1775066290/Contour_Lifestyle_2_omzuji.png",
      "https://res.cloudinary.com/djicyjlid/image/upload/v1775066291/Contour_Closeup_glt64r.png"
    ]
  },
  {
    id: "half-3",
    sku: "KRIT-LTX-2416-03-HALF",
    name: "Half Pillow 3 in",
    subtitle: "24 x 16 x 3 inch",
    height: "3 inch",
    price: 1699,
    badge: "Best Seller",
    badgeColor: "#B8A46A",
    labels: ["Back sleeper", "Side sleeper", "Full-size comfort"],
    category: "everyday",
    categoryLabel: "Everyday Support",
    rating: "4.8",
    firmness: "Balanced",
    sleepStyle: "Back / side",
    desc: "A full-size pillow for everyday shoppers who want plush width, stable rebound, and easy comfort.",
    images: [
      "https://res.cloudinary.com/djicyjlid/image/upload/v1775066569/half_Pillow_3_Main_x9san3.png",
      "https://res.cloudinary.com/djicyjlid/image/upload/v1775066488/Half_Pillow_3_Air_uho0xe.png",
      "https://res.cloudinary.com/djicyjlid/image/upload/v1775066489/Half_Pillow_3_lifestyle_2_sc0prj.png",
      "https://res.cloudinary.com/djicyjlid/image/upload/v1775066546/Half_Pillow_3_Core_xygoyl.png",
      "https://res.cloudinary.com/djicyjlid/image/upload/v1775066490/Half_Pillow_3_Dimensions_qhbzpu.png",
      "https://res.cloudinary.com/djicyjlid/image/upload/v1775066491/Half_Pillow_3_collage_lifestyle_gdlne3.png"
    ]
  },
  {
    id: "half-2",
    sku: "KRIT-LTX-2416-02-HALF",
    name: "Half Pillow 2 in",
    subtitle: "24 x 16 x 2 inch",
    height: "2 inch",
    price: 1499,
    badge: "Most Versatile",
    badgeColor: "#2F5DA8",
    labels: ["Back sleeper", "Side sleeper", "Stomach sleeper"],
    category: "all-rounder",
    categoryLabel: "All-Rounder",
    rating: "4.8",
    firmness: "Medium",
    sleepStyle: "Mixed positions",
    desc: "The most broadly useful choice for customers who want one latex pillow that works across multiple sleep styles.",
    images: [
      "https://res.cloudinary.com/djicyjlid/image/upload/v1775066304/Half_Pillow_Main_t71yff.png",
      "https://res.cloudinary.com/djicyjlid/image/upload/v1775066307/Half_Pillow_2_Lifestyle1_te929i.png",
      "https://res.cloudinary.com/djicyjlid/image/upload/v1775066307/Half_Pillow_2_Lifestyle_bedroom_pwrvo4.png",
      "https://res.cloudinary.com/djicyjlid/image/upload/v1775066307/Half_Pillow_2_Lifestyle_Kids_roeyyg.png",
      "https://res.cloudinary.com/djicyjlid/image/upload/v1775066307/Half_Pillow_2_Dimensions_dywubu.png",
      "https://res.cloudinary.com/djicyjlid/image/upload/v1775066307/Half_Pillow_2_Lifestyle2_adxldy.png",
      "https://res.cloudinary.com/djicyjlid/image/upload/v1775066305/Half_Pillow_2_Kid_pjatit.png",
      "https://res.cloudinary.com/djicyjlid/image/upload/v1775066307/Half_Pillow_2_Lifestyle_collage_kkljkl.png"
    ]
  },
  {
    id: "soap-2",
    sku: "KRIT-LTX-2315-03-SOAP",
    name: "Soap Shape Pillow",
    subtitle: "23 x 15 x 3 inch",
    height: "3 inch",
    price: 1899,
    badge: "Ergonomic",
    badgeColor: "#7A5A18",
    labels: ["Back sleeper", "Side sleeper", "Ergonomic curve"],
    category: "ergonomic",
    categoryLabel: "Ergonomic",
    rating: "4.9",
    firmness: "Targeted support",
    sleepStyle: "Back / side",
    desc: "Sculpted support for shoppers who want a more ergonomic profile while keeping the feel of natural latex.",
    images: [
      "https://res.cloudinary.com/djicyjlid/image/upload/v1775066343/Soap_Main_zmiv8y.png",
      "https://res.cloudinary.com/djicyjlid/image/upload/v1775066343/Soap_Lifestyle_yum0gy.png",
      "https://res.cloudinary.com/djicyjlid/image/upload/v1775066346/Soap_Air_gl0fox.png",
      "https://res.cloudinary.com/djicyjlid/image/upload/v1775066345/Soap_Core_er8ukr.png",
      "https://res.cloudinary.com/djicyjlid/image/upload/v1775066344/Soap_dimensions_fngsmu.png",
      "https://res.cloudinary.com/djicyjlid/image/upload/v1775066347/Saop_shape_Lifestyle_2_tocki1.png",
      "https://res.cloudinary.com/djicyjlid/image/upload/v1775066344/Soap_Close_Up_xobvih.png"
    ]
  }
];
