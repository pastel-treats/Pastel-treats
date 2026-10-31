// Starter menu & settings (Pastel Treats rate card, Oct 2026). Used by demo mode AND to generate
// supabase/migrations/002_seed.sql (run `npm run seed:sql`). Edit prices later in Admin → Menu & pricing.

const MAPS = 'https://maps.app.goo.gl/AroAhgnvaNr5MoWy8?g_st=ac'

export const SEED_SETTINGS = {
  business_name: 'Pastel Treats',
  tagline: 'Cakes and everything nice',
  brand_line: 'Premium home baker',
  hero_headline: 'Handcrafted with Love, Baked for Your Special Moments.',
  hero_intro:
    'Pastel Treats is a premium home baking house in Dindigul — carefully sourced and selected premium ingredients go into our cakes, entremets, brownies and cookies, baked fresh to order in small batches by a certified pastry chef and finished by hand for the people you love.\n\nWe use only Van Houten couverture and premium Callebaut chocolates, and only fresh buttercream frosting.',
  baker_name: 'Vaishnavi',
  baker_title: 'Certified pastry chef',
  baker_intro:
    'Hi, I am Vaishnavi, a certified, passionate baker from Lavonne Academy of Baking Science & Pastry Arts. Every Pastel Treats order is baked by me in small batches, fresh for your celebration.',
  baker_image: 'images/baker.webp',
  promo_banner: '',
  announcements: [],
  orders_paused: false,
  orders_paused_message: '',
  whatsapp: '919566883196',
  phone: '+91 95668 83196',
  phone2: '',
  email: '',
  instagram: 'https://instagram.com/pasteltreats_28',
  pickup_address: 'Pastel Treats, Dindigul',
  maps_link: MAPS,
  pickup_instructions: 'Please come at your chosen time slot and message us on WhatsApp when you arrive. Carry cakes flat and keep them cool.',
  business_hours: 'Mon – Sat: 9:00 AM – 7:00 PM · Sun: 11:00 AM – 7:00 PM (app & WhatsApp only)',
  order_channel_note: 'Please place orders in the app — it books your slot, gives you an order ID and lets you track it. WhatsApp us if you have any doubts.',
  timezone: 'Asia/Kolkata',
  lead_time_hours: 48,
  cancel_full_refund_hours: 48, // cancel this many hrs before the slot for a full advance refund
  closed_weekdays: [], // open all days
  no_call_weekdays: [0], // Sunday: app & WhatsApp only
  max_orders_per_day: 10,
  max_deliveries_per_day: null,
  home_delivery_enabled: false,
  courier_enabled: true,
  courier_note: 'Brownies, blondies, cookie boxes and ragi puffs can be sent by courier. Courier charges are extra — we confirm them before you pay.',
  advance_mode: 'percent', // 'percent' | 'fixed'
  advance_value: 50,
  advance_tier_enabled: false, // orders above advance_tier_above use their own advance rule
  advance_tier_above: 1000,
  advance_tier_mode: 'percent',
  advance_tier_value: 50,
  upi_id: '',
  upi_name: 'Pastel Treats',
  upi_qr_url: '',
  cash_pickup: true,
  cash_delivery: false,
  cash_for: 'balance', // 'balance' | 'advance' | 'both'
  gateway_enabled: false,
  razorpay_key_id: '',
  allow_out_of_zone_requests: false,
  reminder_days: [30, 14, 7],
  segments: { frequent_orders: 4, high_spend: 5000, inactive_days: 120 },
  policies: {
    ordering:
      'Please order 48 hrs (2 days) prior to your pickup time. Submitting an order is a request — it is confirmed only after we review it and receive the advance.',
    advance: 'A 50% advance confirms your order. The balance is paid at pickup.',
    pickup:
      'All orders are self pickup from our location (see the map link) at the time slot you choose. Please arrive within your slot and message us on WhatsApp when you reach.',
    delivery:
      'We do not do home delivery. Brownies, blondies, cookie boxes and ragi puffs can be couriered — courier charges are extra and confirmed before you pay.',
    cancellation:
      'Cancel more than 48 hrs (2 days) before your slot for a full refund of the advance. Within 48 hrs, the advance is non-refundable because ingredients have been bought and prep has begun.',
    refund: 'Approved refunds are returned to the original UPI account within 5–7 working days.',
    custom:
      'Customisation is extra and quoted individually. Your reference picture is inspiration — hand-finished bakes will vary slightly. We confirm the final price before you pay.',
    missed_pickup:
      'If an order is not collected in the chosen slot, we hold it refrigerated until the end of the day. After that it cannot be refunded.',
    changes: 'Changes to flavour or design are possible up to 48 hrs (2 days) before the slot, subject to availability.',
    allergens: 'Our kitchen handles eggs, dairy, gluten, nuts and soy. Please tell us about any allergy before ordering.',
    storage:
      'Refrigerate cream cakes, mousse and tres leches. Bring cakes to room temperature for 20–30 minutes before serving. Best eaten within 2 days.',
    privacy:
      'We store your name, mobile number and (only if you choose) special dates to process orders and send reminders you agreed to. We never sell your data. Ask us anytime to correct or delete it.',
    terms: 'Prices marked “onwards” depend on flavour, size and design. The price confirmed on your order is the price you pay.',
  },
}

export const SEED_CATEGORIES = [
  { slug: 'cakes', name: 'Cakes', description: 'Birthdays, anniversaries & every reason in between', sort: 1 },
  { slug: 'courier', name: 'Courier treats', description: 'Brownies, blondies & cookies we can courier', sort: 2 },
  { slug: 'pastries', name: 'Pastries & tarts', description: 'Choux, tarts and single-serve entremets', sort: 3 },
  { slug: 'cookies-bars', name: 'Cookies & bars', description: 'NY chunky cookies, rocher bombs & shortbread', sort: 4 },
  { slug: 'desserts', name: 'Desserts', description: 'Tres leches, tiramisu, mud pie & more', sort: 5 },
  { slug: 'bakes', name: 'Buns & bakes', description: 'Korean buns, bundt cakes, cinnamon rolls', sort: 6 },
  { slug: 'healthy', name: 'Healthy bites', description: 'Protein bakes, granola & ragi', sort: 7 },
  { slug: 'seasonal', name: 'Seasonal treats', description: 'Here for a season — ice creams, mango sticky rice & more', sort: 8 },
  { slug: 'hampers', name: 'Gift hampers', description: 'Festive, corporate, store-opening & brand-launch hampers', sort: 9 },
]

const CAKE_SIZES = [
  { label: '1 kg', kg: 1, price: 0 },
  { label: '1.5 kg', kg: 1.5, price: 0 },
  { label: '2 kg', kg: 2, price: 0 },
]
// For cakes, the flavour price is the rate PER KG. Half-kg cakes (from ₹800) are ordered on WhatsApp.
const CAKE_FLAVOURS = [
  { name: 'Vanilla', price: 1600 },
  { name: 'Red velvet', price: 1700 },
  { name: 'Blueberry', price: 1800 },
  { name: 'Strawberry', price: 1800 },
  { name: 'Lemon', price: 1800 },
  { name: 'Butterscotch', price: 2000 },
  { name: 'Chocolate', price: 2000 },
  { name: 'Lotus Biscoff', price: 2000 },
  { name: 'Pistachio', price: 2000 },
  { name: 'Coconut', price: 2000 },
  { name: 'Pecan', price: 2200 },
]
const each = (n) => ({ unit: 'each', min_qty: n })

export const SEED_PRODUCTS = [
  // ---- cakes ----
  {
    cat: 'cakes', name: 'Celebration Cake', featured: true, pricing_mode: 'per_kg', unit: 'cake',
    images: ['images/blue-rosette-cake.webp'],
    description: 'Our signature buttercream cake, hand-finished in colours to match your celebration. Prices are per kg. Custom designs are extra and quoted by us.',
    base_price: 800, weights: CAKE_SIZES, flavours: CAKE_FLAVOURS,
    occasions: ['Birthday', 'Anniversary', 'Baby shower', 'Graduation', 'Wedding', 'Corporate'],
  },
  {
    cat: 'cakes', name: 'Custom Design Cake', featured: true, pricing_mode: 'per_kg', unit: 'cake', custom_default: true,
    images: ['images/ai-custom-cake.svg'],
    description: 'Tell us your theme and share a reference picture. The flavour price is the starting rate; the design is quoted by us before you pay.',
    base_price: 800, weights: CAKE_SIZES, flavours: CAKE_FLAVOURS,
    occasions: ['Birthday', 'Anniversary', 'Wedding', 'Baby shower', 'Graduation', 'Corporate'],
  },
  // ---- courier treats ----
  {
    cat: 'courier', name: 'Brownie Box', featured: true, courier_ok: true, unit: 'box',
    images: ['images/brownie-bites.webp'],
    description: 'Fudgy, crackly-topped brownies. Customisation is extra. Can be couriered (courier charges extra).',
    base_price: 600, weights: [{ label: '8 pieces', price: 600 }, { label: '16 pieces', price: 850 }, { label: '30 pieces', price: 1500 }],
    flavours: [{ name: 'Classic', price: 0 }, { name: 'Walnut', price: 0 }, { name: 'Choco almond', price: 0 }, { name: 'Red velvet cheesecake', price: 0 }, { name: 'Chocolate overload', price: 0 }],
    allow_message: false, occasions: ['Corporate', 'Birthday', 'Festival'],
  },
  {
    cat: 'courier', name: 'Blondie Box', courier_ok: true, unit: 'box', images: ['images/ai-blondies.svg'],
    description: 'Buttery, chewy blondies. Can be couriered (courier charges extra).',
    base_price: 650, weights: [{ label: '8 pieces', price: 650 }, { label: '16 pieces', price: 1200 }], allow_message: false,
  },
  {
    cat: 'courier', name: 'Cookie Box', courier_ok: true, unit: 'box of 8', images: ['images/ai-cookie-box.svg'],
    description: '8 crisp, buttery cookies. Can be couriered (courier charges extra).',
    base_price: 400, flavours: [{ name: 'Choco chip', price: 0 }, { name: 'Peanut butter', price: 0 }, { name: 'Oatmeal', price: 0 }, { name: 'Persian', price: 0 }, { name: 'Milk', price: 0 }],
    allow_message: false,
  },
  {
    cat: 'courier', name: 'Ragi Cocoa Puff', courier_ok: true, unit: '50 g pack', images: ['images/ai-ragi-puff.svg'],
    description: 'Crunchy finger-millet cocoa puffs. Can be couriered (courier charges extra).', base_price: 250, allow_message: false,
  },
  // ---- pastries & tarts ----
  {
    cat: 'pastries', name: 'Choux Pastry', featured: true, ...each(4), images: ['images/cream-puffs.webp'],
    description: 'Craquelin-topped choux filled with chilled cream. ₹100 each, minimum 4.', base_price: 100, allow_message: false,
  },
  {
    cat: 'pastries', name: 'Sweet Tart', ...each(4), images: ['images/ai-sweet-tart.svg'],
    description: 'Buttery shortcrust tarts from ₹100 each — final price depends on flavour and size, confirmed by us.',
    base_price: 100, flavours: [{ name: 'Fruit', price: 0 }, { name: 'Chocolate', price: 0 }, { name: 'Salted caramel', price: 0 }], allow_message: false,
  },
  {
    cat: 'pastries', name: 'Savoury Tart', ...each(4), images: ['images/ai-savoury-tart.svg'],
    description: 'Savoury tarts from ₹70 each — final price depends on size, confirmed by us.', base_price: 70, allow_message: false,
  },
  {
    cat: 'pastries', name: 'Entremet (single serve)', featured: true, ...each(4), images: ['images/triple-chocolate-mousse.webp'],
    description: 'Layered French mousse cake in a single serving. ₹150 each, minimum 4.',
    base_price: 150,
    flavours: [
      { name: 'Triple chocolate mousse', price: 0 }, { name: 'Chocolate', price: 0 }, { name: 'White chocolate & berries', price: 0 }, { name: 'Tender coconut lychee', price: 0 },
      { name: 'Coffee hazelnut', price: 0 }, { name: 'Milk chocolate passionfruit', price: 0 }, { name: 'Chocolate almond & hazelnut praline', price: 0 },
      { name: 'Milk chocolate & banana crumble', price: 0 }, { name: 'Dark chocolate orange zest', price: 0 },
    ], allow_message: false,
  },
  // ---- cookies & bars ----
  {
    cat: 'cookies-bars', name: 'New York Chunky Cookie', featured: true, ...each(4),  images: ['images/chunky-cookies.webp'],
    description: 'Thick bakery-style cookies with crisp edges and molten middles. ₹150 each, minimum 4.',
    base_price: 150,
    flavours: [
      { name: 'Classic choco chip', price: 0 }, { name: 'Lotus Biscoff', price: 0 }, { name: 'Blueberry cheesecake', price: 0 }, { name: 'Matcha', price: 0 },
      { name: 'Dulce de leche', price: 0 }, { name: 'Lemon', price: 0 }, { name: 'Red velvet', price: 0 }, { name: 'Nutella', price: 0 }, { name: 'Kunafa', price: 0 },
    ], allow_message: false,
  },
  { cat: 'cookies-bars', name: 'Rocher Bomb', ...each(4), images: ['images/ai-rocher-bomb.svg'], description: 'Ferrero Rocher in a cake form. ₹100 each, minimum 4.', base_price: 100, allow_message: false },
  { cat: 'cookies-bars', name: 'Millionaire Shortbread', ...each(8), images: ['images/ai-shortbread.svg'], description: 'Shortbread, caramel and chocolate. ₹100 each, minimum 8.', base_price: 100, allow_message: false },
  // ---- desserts ----
  {
    cat: 'desserts', name: 'Tres Leches', featured: true, unit: '200 g', images: ['images/tres-leches.webp'],
    description: 'Feather-light sponge soaked in three milks, crowned with whipped cream. ₹300 for 200 g.', base_price: 300, allow_message: false,
  },
  { cat: 'desserts', name: 'Tiramisu', unit: '200 g', images: ['images/ai-tiramisu.svg'], description: 'Espresso-soaked ladyfingers and mascarpone cream. ₹350 for 200 g.', base_price: 350, allow_message: false },
  { cat: 'desserts', name: 'Chocolate Mud Pie', unit: '½ kg', images: ['images/ai-mud-pie.svg'], description: 'Rich chocolate mud pie. ₹800 for ½ kg.', base_price: 800, allow_message: false },
  {
    cat: 'desserts', name: 'Banana Pudding & Crumble Bowl', unit: '200 g bowl', images: ['images/ai-pudding-bowl.svg'],
    description: '₹400 per 200 g bowl.', base_price: 400,
    flavours: [{ name: 'Banana pudding', price: 0 }, { name: 'Mango crumble', price: 0 }, { name: 'Strawberry crumble', price: 0 }, { name: 'Banana crumble', price: 0 }], allow_message: false,
  },
  {
    cat: 'desserts', name: 'Mochi', ...each(4), images: ['images/ai-mochi.svg'], description: 'Soft rice-dough mochi. ₹150 each, minimum 4.', base_price: 150,
    flavours: [{ name: 'Chocolate', price: 0 }, { name: 'Lotus Biscoff', price: 0 }, { name: 'Strawberry', price: 0 }, { name: 'Blueberry', price: 0 }, { name: 'Ferrero Rocher', price: 0 }],
    allow_message: false,
  },
  // ---- buns & bakes ----
  { cat: 'bakes', name: 'Korean Cream Cheese Bun', ...each(4), images: ['images/ai-korean-bun.svg'], description: 'Garlic-butter buns stuffed with sweet cream cheese. ₹120 each, minimum 4.', base_price: 120, allow_message: false },
  {
    cat: 'bakes', name: 'Bundt Cake', unit: 'cake', images: ['images/ai-bundt.svg'], description: 'Glazed ring cake. ₹300 per cake.', base_price: 300,
    flavours: [{ name: 'Carrot', price: 0 }, { name: 'Lemon blueberry', price: 0 }, { name: 'Red velvet', price: 0 }, { name: 'Chocolate', price: 0 }], allow_message: false,
  },
  { cat: 'bakes', name: 'Cinnamon Rolls', unit: 'batch', images: ['images/ai-cinnamon-rolls.svg'], description: 'Soft, gooey cinnamon rolls. ₹350 per batch.', base_price: 350, allow_message: false },
  // ---- healthy ----
  {
    cat: 'healthy', name: 'Protein Brownie / Cookie', ...each(4), images: ['images/ai-protein.svg'], description: 'High-protein bakes. ₹100 each, minimum 4.', base_price: 100,
    flavours: [{ name: 'Protein brownie', price: 0 }, { name: 'Protein cookie', price: 0 }], allow_message: false,
  },
  { cat: 'healthy', name: 'Granola', unit: '100 g', images: ['images/ai-granola.svg'], description: 'House-made granola. ₹250 for 100 g.', base_price: 250, allow_message: false },
  // ---- seasonal (message to order) ----
  { cat: 'seasonal', name: 'Ice Cream', unit: 'tub', images: ['images/ai-ice-cream.svg'], base_price: 0, enquiry_only: true, seasonal_note: 'Seasonal', allow_message: false },
  { cat: 'seasonal', name: 'Mango Sticky Rice', unit: 'bowl', images: ['images/ai-mango-sticky-rice.svg'], base_price: 0, enquiry_only: true, seasonal_note: 'Mango season', allow_message: false },
  // ---- gift hampers (message to order) ----
  { cat: 'hampers', name: 'Festival Hamper (Diwali & more)', featured: true, unit: 'hamper', images: ['images/ai-hamper-festival.svg'], base_price: 0, enquiry_only: true, seasonal_note: 'Diwali', allow_message: false, occasions: ['Festival'] },
  { cat: 'hampers', name: 'Corporate Gift Hamper', unit: 'hamper', images: ['images/ai-hamper-corporate.svg'], base_price: 0, enquiry_only: true, allow_message: false, occasions: ['Corporate'] },
  { cat: 'hampers', name: 'Store Opening Hamper', unit: 'hamper', images: ['images/ai-hamper-store-opening.svg'], base_price: 0, enquiry_only: true, allow_message: false, occasions: ['Corporate'] },
  { cat: 'hampers', name: 'Brand Launch Hamper', unit: 'hamper', images: ['images/ai-hamper-brand-launch.svg'], base_price: 0, enquiry_only: true, allow_message: false, occasions: ['Corporate'] },
]

// Menu descriptions (also pushed to the live menu by migration 009, matched by name).
export const DESCRIPTIONS = {
  'Celebration Cake':
    'Our signature celebration cake — soft, moist sponge layered with fresh buttercream and hand-finished in the colours of your party. Pick a flavour and size; prices are per kg. Custom designs are quoted by us.',
  'Custom Design Cake':
    'Dream it, we bake it. Share your theme or a reference picture and Vaishnavi designs a one-of-a-kind cake around it — from dreamy pastels to bold characters. The flavour price is the starting rate; we quote the design before you pay.',
  'Brownie Box':
    'Dense, fudgy brownies with that shiny crackle top, made with Callebaut chocolate. Pick a flavour or go assorted — perfect for gifting, and sturdy enough to courier.',
  'Blondie Box':
    'The golden cousin of the brownie — buttery, chewy blondies with deep caramel notes and a melt-in-the-mouth centre. Gift-ready, and can be couriered.',
  'Cookie Box':
    'Eight crisp-edged, buttery cookies baked fresh to order. Choose one flavour or ask for an assorted box — a little box of happiness that travels well by courier.',
  'Ragi Cocoa Puff':
    'Crunchy finger-millet puffs coated in real cocoa — the snack you can feel good about. Light, crispy and loved by kids and grown-ups alike.',
  'Choux Pastry':
    'Light-as-air French choux with a crackly craquelin top, piped full of chilled, silky cream. Bite-sized elegance for your dessert table. Minimum 4.',
  'Sweet Tart':
    'Crisp, buttery shortcrust filled with fresh fruit and crème pâtissière, silky chocolate ganache or gooey salted caramel. Mix flavours with an assorted box. Minimum 4.',
  'Savoury Tart':
    'Flaky, golden tart shells with a rich, savoury filling — the perfect tea-time bite and party starter. Minimum 4.',
  'Entremet (single serve)':
    'A patisserie-style mousse cake for one — layers of mousse, crunch and sponge under a glossy mirror glaze. Nine flavours, from triple chocolate to tender coconut lychee. Minimum 4.',
  'New York Chunky Cookie':
    'Thick, bakery-style New York cookies — crisp golden edges, a gooey molten middle and generous chunks in every bite. ₹150 each, minimum 4 pieces.',
  'Newyork Chunky Cookies':
    'Thick, bakery-style New York cookies — crisp golden edges, a gooey molten middle and generous chunks in every bite. ₹150 each, minimum 4 pieces.',
  'Rocher Bomb':
    'Everything you love about Ferrero Rocher in a cake bite — hazelnut-chocolate cake, Nutella centre and a crunchy chocolate-nut shell. Minimum 4.',
  'Millionaire Shortbread':
    'Three layers of pure indulgence — buttery shortbread, thick golden caramel and a snap of smooth chocolate on top. Minimum 8.',
  'Tres Leches':
    'A feather-light sponge soaked in three milks until it melts on your spoon, crowned with clouds of whipped cream. Cool, creamy and dangerously good.',
  Tiramisu:
    'The Italian classic — ladyfingers soaked in strong espresso, layered with velvety mascarpone cream and dusted with cocoa. Rich, light and perfectly balanced.',
  'Chocolate Mud Pie':
    'For serious chocolate lovers — a crunchy chocolate base, a deep, fudgy filling and a silky ganache finish. Half a kilo of pure joy to share.',
  'Banana Pudding & Crumble Bowl':
    'A comforting bowl of creamy pudding layered with soft fruit and buttery crumble. Choose classic banana pudding or a fruity crumble.',
  Mochi:
    'Soft, pillowy rice-dough mochi with a luscious creamy filling — chewy outside, dreamy inside. Flavours from Lotus Biscoff to Ferrero Rocher. Minimum 4.',
  'Korean Cream Cheese Bun':
    'The viral Korean garlic bun — a soft bun stuffed with sweet cream cheese and soaked in golden garlic butter. Savoury, sweet and irresistible. Minimum 4.',
  'Bundt Cake':
    'A tall, tender ring cake with a glossy glaze — carrot, lemon blueberry, red velvet or chocolate. Just right for tea time or a small celebration.',
  'Cinnamon Rolls':
    'Pillowy, swirled cinnamon rolls with a buttery brown-sugar filling and a soft cream-cheese glaze, best enjoyed warm.',
  'Protein Brownie / Cookie':
    'Guilt-free and gym-friendly — made with NO flour at all, just whey protein. Fudgy brownies and chewy cookies packed with protein, so you can treat yourself after a workout. Minimum 4.',
  Granola:
    'Crunchy, golden clusters of oats, nuts and seeds, slow-baked in small batches with honey. Perfect with milk, yoghurt or straight from the jar.',
  'Turkish Milk Cake':
    'Light, airy sponge soaked in cold milk and topped with a layer of caramelised sugar — Turkey\'s famous trileçe. Creamy, cool and melt-in-the-mouth, in 250 g tubs.',
  'Ice Cream':
    'Small-batch, homemade ice cream — rich, creamy and made with real ingredients. Seasonal flavours change often, so message us to see what\'s churning now.',
  'Mango Sticky Rice':
    'The Thai favourite — warm coconut sticky rice with sweet, ripe mango, salted coconut cream and a sprinkle of toasted sesame. Only while mangoes are in season.',
  'Festival Hamper (Diwali & more)':
    'Light up the festival with a hamper of handmade brownies, cookies and treats in beautiful gift packing — for family, friends and clients. Tell us your budget and quantity and we\'ll put it together.',
  'Corporate Gift Hamper':
    'Premium, handmade treat hampers for your team, clients and events — with your logo or a personal note. Bulk orders welcome; message us for options and pricing.',
  'Store Opening Hamper':
    'Make your opening day sweeter. Treat boxes and dessert tables for your guests, customised to your store\'s colours. Message us with the date and number of guests.',
  'Brand Launch Hamper':
    'Launching something new? We create custom treat boxes and dessert hampers in your brand colours, with your logo and message — the perfect PR package.',
}
SEED_PRODUCTS.forEach((p) => { if (DESCRIPTIONS[p.name]) p.description = DESCRIPTIONS[p.name] })

export const SEED_ADDONS = []

export const SEED_SLOTS = [
  { label: '9:00 – 11:00 AM', start_time: '09:00', end_time: '11:00', capacity: 3, weekdays: [1, 2, 3, 4, 5, 6] }, // Sunday opens at 11
  { label: '11:00 AM – 1:00 PM', start_time: '11:00', end_time: '13:00', capacity: 3 },
  { label: '1:00 – 3:00 PM', start_time: '13:00', end_time: '15:00', capacity: 3 },
  { label: '3:00 – 5:00 PM', start_time: '15:00', end_time: '17:00', capacity: 3 },
  { label: '5:00 – 7:00 PM', start_time: '17:00', end_time: '19:00', capacity: 4 },
]

export const SEED_ZONES = []
