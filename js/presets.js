/* Starter templates. Each returns a fresh project state. */
(function (global) {
  const uid = () => Math.random().toString(36).slice(2, 9);
  const sec = (type, data, enabled = true) => ({ id: uid(), type, enabled, navLabel: '', data: Object.assign(global.WB.SCHEMA[type].defaults(), data) });

  const PRESETS = {
    bistro: {
      name: 'Classic Bistro', blurb: 'Warm, elegant, serif-led.', emoji: '🥂',
      build() {
        const menu = sec('menu', {
          title: 'The Menu', intro: 'Seasonal, market-driven French cooking.',
          categories: [
            { name: 'Entrées', items: [
              { name: 'French onion soup', desc: 'Gruyère crouton, caramelised onions', price: '$12', tag: '' },
              { name: 'Beef tartare', desc: 'Capers, shallot, quail yolk', price: '$17', tag: '' },
              { name: 'Beetroot & goat cheese', desc: 'Candied walnuts, sherry vinaigrette', price: '$14', tag: 'Veg' }] },
            { name: 'Plats', items: [
              { name: 'Duck confit', desc: 'Pommes sarladaises, cherry jus', price: '$29', tag: 'Signature' },
              { name: 'Pan-seared sea bass', desc: 'Fennel, beurre blanc', price: '$31', tag: '' },
              { name: 'Mushroom risotto', desc: 'Wild mushrooms, parmesan, thyme', price: '$22', tag: 'Veg' }] },
            { name: 'Desserts', items: [
              { name: 'Crème brûlée', desc: 'Madagascan vanilla', price: '$10', tag: '' },
              { name: 'Tarte Tatin', desc: 'Crème fraîche', price: '$11', tag: '' }] },
          ],
        });
        return {
          site: { name: 'Maison Lumière', tagline: 'French bistro · est. 2009', logo: '🕯️', description: 'A cosy French bistro serving seasonal classics.', footer: '© Maison Lumière. All rights reserved.' },
          theme: { primary: '#7a2e2e', accent: '#c9a15a', bg: '#fbf7f2', text: '#2b2220', headingFont: 'Playfair Display', bodyFont: 'Lora', radius: 4 },
          sections: [
            sec('hero', { heading: 'Maison Lumière', subheading: 'Timeless French cooking in the heart of the city.', ctaText: 'Reserve a table', ctaTarget: '', layout: 'center' }),
            sec('about', { title: 'Our story', text: 'Since 2009 we have cooked the dishes we grew up with: slow braises, buttery sauces and bread baked every morning.\n\nOur menu changes with the seasons, built around producers we know by name.' }),
            menu,
            sec('gallery', {}),
            sec('testimonials', { title: 'Kind words', items: [
              { quote: 'The duck confit is the best I have had outside of Lyon.', author: 'Claire D.' },
              { quote: 'Warm service, beautiful room, unforgettable dessert.', author: 'Marcus T.' }] }),
            sec('hours', { rows: [{ day: 'Tue – Thu', time: '17:30 – 22:00' }, { day: 'Fri – Sat', time: '17:30 – 23:30' }, { day: 'Sunday', time: '12:00 – 21:00' }, { day: 'Monday', time: 'Closed' }] }),
            sec('reservations', {}),
            sec('contact', { address: '14 Rue de la Paix\nSpringfield', phone: '+1 555 010 2030', email: 'hello@maisonlumiere.example', social: [{ label: 'Instagram', url: 'https://instagram.com' }] }),
          ],
        };
      },
    },
    sushi: {
      name: 'Modern Sushi Bar', blurb: 'Dark, sleek, minimal.', emoji: '🍣',
      build() {
        return {
          site: { name: 'Koi Sushi', tagline: 'Omakase & izakaya', logo: '🐟', description: 'Modern Japanese dining.', footer: '© Koi Sushi' },
          theme: { primary: '#d6453d', accent: '#e8c27a', bg: '#101418', text: '#f2efe9', headingFont: 'DM Serif Display', bodyFont: 'Inter', radius: 12 },
          sections: [
            sec('hero', { heading: 'Fresh from the sea, crafted by hand.', subheading: 'Twelve seats. One chef. Every night.', ctaText: 'Book omakase', layout: 'left' }),
            sec('menu', { title: 'Menu', intro: 'Ask about today\'s catch.', categories: [
              { name: 'Nigiri', items: [
                { name: 'Salmon', desc: 'Norwegian, lightly seared', price: '$6', tag: '' },
                { name: 'Bluefin tuna', desc: 'Akami', price: '$9', tag: '' },
                { name: 'Uni', desc: 'Hokkaido sea urchin', price: '$14', tag: 'Seasonal' }] },
              { name: 'Rolls', items: [
                { name: 'Spicy tuna', desc: 'Cucumber, sesame, chilli mayo', price: '$13', tag: 'Spicy' },
                { name: 'Garden roll', desc: 'Avocado, pickled radish, shiso', price: '$11', tag: 'Vegan' }] },
            ] }),
            sec('about', { title: 'The chef', text: 'Trained for twelve years in Tokyo, Chef Aoki brings an uncompromising approach to rice, fish and timing.' }),
            sec('gallery', {}),
            sec('hours', { rows: [{ day: 'Wed – Sun', time: '18:00 – 23:00' }, { day: 'Mon – Tue', time: 'Closed' }] }),
            sec('reservations', { text: 'Seats are limited. Reservations required for omakase.' }),
            sec('contact', { address: '88 Harbour Lane\nSpringfield', phone: '+1 555 010 4040', email: 'book@koi.example' }),
          ],
        };
      },
    },
    pizza: {
      name: 'Rustic Pizzeria', blurb: 'Friendly, bold, family-run.', emoji: '🍕',
      build() {
        return {
          site: { name: 'Fiamma', tagline: 'Wood-fired pizza', logo: '🍕', description: 'Neapolitan wood-fired pizza.', footer: '© Fiamma Pizzeria' },
          theme: { primary: '#b8321f', accent: '#2f6b3a', bg: '#fff8ee', text: '#2a1f18', headingFont: 'Oswald', bodyFont: 'Work Sans', radius: 16 },
          sections: [
            sec('hero', { heading: 'Pizza the way nonna made it.', subheading: '72-hour dough. 90-second bake. Zero shortcuts.', ctaText: 'See the menu', layout: 'center' }),
            sec('menu', { title: 'Our pizzas', intro: 'All pizzas are 12" and baked at 485°C.', categories: [
              { name: 'Classics', items: [
                { name: 'Margherita', desc: 'San Marzano tomato, fior di latte, basil', price: '$13', tag: 'Veg' },
                { name: 'Diavola', desc: 'Spicy salami, chilli oil', price: '$16', tag: 'Spicy' },
                { name: 'Quattro formaggi', desc: 'Mozzarella, gorgonzola, parmesan, pecorino', price: '$17', tag: '' }] },
              { name: 'Sides & drinks', items: [
                { name: 'Burrata', desc: 'Cherry tomatoes, olive oil', price: '$11', tag: '' },
                { name: 'Italian soda', desc: 'Blood orange or lemon', price: '$4', tag: '' }] },
            ] }),
            sec('about', { title: 'Family run', text: 'Three generations, one oven. Come hungry, leave happy.' }),
            sec('testimonials', {}),
            sec('hours', {}),
            sec('contact', { address: '5 Oven Street\nSpringfield', phone: '+1 555 010 5050' }),
          ],
        };
      },
    },
  };

  global.WB.PRESETS = PRESETS;
  global.WB.uid = uid;
  global.WB.newSection = (type) => sec(type, {});
  global.WB.blankProject = () => PRESETS.bistro.build();
})(window);
